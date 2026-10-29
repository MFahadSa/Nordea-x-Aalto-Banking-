// Several AI models in a row, so the customer always gets an answer:
// the first model that's available answers. A model that hits a limit "rests" for as long as its limit
// lasts, and the next one takes over at once. Photos and scanned PDFs go only to models that can read images.
import { LlmProvider, recordTurn } from './llm.js';
import { classify, clean, FailKind, retryWaitMs } from './llmOpenAI.js';

interface MemberState {
  restUntil: number;
  lastOk: { at: string } | null;
  lastFail: { at: string; message: string; kind: FailKind } | null;
}

/** How long a model rests after each kind of failure. */
function restFor(kind: FailKind, retryAfterMs: number | null): number {
  switch (kind) {
    case 'minute': return Math.max(retryAfterMs ?? 20000, 3000);
    case 'day': return retryAfterMs && retryAfterMs > 60_000 ? retryAfterMs : 3 * 3600_000;
    case 'auth': return 3600_000;
    case 'timeout': return 300_000; // a model that hangs would make every answer slow
    case 'server': return 30_000;
    default: return 0; // e.g. this model can't do this request: just skip it this time
  }
}

export interface ChainProvider extends LlmProvider {
  members: LlmProvider[];
}

export function makeChain(members: LlmProvider[]): ChainProvider {
  const st = new Map<LlmProvider, MemberState>(members.map((m) => [m, { restUntil: 0, lastOk: null, lastFail: null }]));
  let lastUsed: LlmProvider | null = null;
  let lastError: { at: string; message: string; model?: string } | null = null;
  let lastOk: { at: string; model: string } | null = null;
  const name = (m: LlmProvider) => `${m.label || m.name}${m.model ? ` ${m.model}` : ''}`;

  async function tryOne(m: LlmProvider, args: Parameters<LlmProvider['step']>[0], isLast: boolean) {
    const s = st.get(m)!;
    try {
      // Only the last option waits out a per-minute limit; the others hand over to the next model straight away.
      // The first (best) model waits up to 8 s for its per-minute limit, so answers stay consistent;
      // only a longer wait hands over to the next model. The last option waits up to 35 s.
      const res = await m.step({ ...args, maxWaitMs: isLast ? 35000 : m === members[0] ? 8000 : 1500 });
      s.lastOk = { at: new Date().toISOString() };
      s.restUntil = 0;
      lastUsed = m;
      lastOk = { at: s.lastOk.at, model: name(m) };
      return res;
    } catch (err: any) {
      const message = clean(err);
      const kind = classify(message);
      s.lastFail = { at: new Date().toISOString(), message, kind };
      s.restUntil = Date.now() + restFor(kind, err?.retryAfterMs ?? retryWaitMs(message));
      lastError = { at: s.lastFail.at, message, model: name(m) };
      console.error(`AI chain: ${name(m)} failed (${kind}); trying the next one.`);
      throw err;
    }
  }

  return {
    name: 'chain',
    label: members.map((m) => m.label || m.name).filter((x, i, a) => a.indexOf(x) === i).join(' → '),
    members,
    vision: members.some((m) => m.vision),
    isConfigured: () => members.some((m) => m.isConfigured()),
    async step(args) {
      const needsVision = args.turns.some((t) => t.role === 'user' && (t.files || []).length > 0);
      const usable = members.filter((m) => m.isConfigured() && (!needsVision || m.vision));
      if (!usable.length) throw new Error(needsVision ? 'NO_VISION: none of the AI models here can read photos' : 'No AI model is set up');
      let last: any;
      const now = Date.now();
      const ready = usable.filter((m) => st.get(m)!.restUntil <= now);
      for (let i = 0; i < ready.length; i++) {
        try {
          return await tryOne(ready[i], args, i === ready.length - 1);
        } catch (err) {
          last = err;
        }
      }
      // Everyone is resting. If one is back within 35 seconds, wait for it once (better than a canned answer).
      const soonest = usable.reduce((a, m) => (st.get(m)!.restUntil < st.get(a)!.restUntil ? m : a), usable[0]);
      const waitMs = st.get(soonest)!.restUntil - Date.now();
      if (waitMs <= 35000) {
        await new Promise((r) => setTimeout(r, Math.max(waitMs, 0) + 200));
        return tryOne(soonest, args, true);
      }
      throw last || new Error(`All AI models are resting: ${usable.map(name).join(', ')}`);
    },
    status() {
      const now = Date.now();
      return {
        provider: 'chain',
        label: this.label,
        keyPresent: members.some((m) => m.isConfigured()),
        model: lastUsed ? name(lastUsed) : members[0] ? name(members[0]) : '',
        candidates: members.map(name),
        lastOk,
        lastError,
        thinking: '',
        members: members.map((m) => {
          const s = st.get(m)!;
          return {
            name: name(m),
            configured: m.isConfigured(),
            vision: !!m.vision,
            restingFor: s.restUntil > now ? Math.round((s.restUntil - now) / 1000) : 0,
            lastOk: s.lastOk?.at || null,
            lastFail: s.lastFail,
          };
        }),
      };
    },
    async ping() {
      // Test the first model that isn't resting (one small request), and report the others from memory.
      const m = members.find((x) => x.isConfigured() && st.get(x)!.restUntil <= Date.now()) || members[0];
      const r = m?.ping ? await m.ping() : { ok: false, error: 'No AI model is set up' };
      if (r.ok) { st.get(m)!.lastOk = { at: new Date().toISOString() }; lastOk = { at: new Date().toISOString(), model: name(m) }; }
      return { ...r, model: name(m) };
    },
  };
}

export { recordTurn };
