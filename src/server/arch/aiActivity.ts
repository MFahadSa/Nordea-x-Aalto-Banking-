// Per-agent live-AI visibility for the two monitor pages (dev-monitor.html, arch.html).
// The three agents share ONE provider chain (getProvider()), so the configured chain is shown
// once; what is per agent is only what each agent's last reasoning run actually did. Everything
// here is held in memory and READ-ONLY on display: building this view never calls a model, so a
// page load or refresh can never cost a paid request. "Configured" is not "working": a key being
// present says nothing about the last call, which is why the observed result is shown beside it.
import { getProvider } from '../llm.js';

export type AiAgent = 'personal' | 'cm' | 'nordea';
export interface AiRun { at: string; outcome: 'finished' | 'error'; provider?: string; error?: string }

/** An observation older than this is shown as stale, not as the current state. */
export const AI_STALE_AFTER_SEC = 30 * 60;

const runs = new Map<string, AiRun>(); // key: `${uid}|${agent}`; process memory only, lost on restart

/** Short, display-safe error text: no keys, tokens, URLs with query strings or long dumps. */
export function sanitizeAiError(raw: unknown): string {
  return String(raw ?? '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [key]')
    .replace(/\b(?:sk|gsk|AIza)[-_A-Za-z0-9]{8,}/g, '[key]')
    .replace(/([?&](?:key|api_key|token)=)[^&\s]+/gi, '$1[key]')
    .replace(/\s+/g, ' ').trim().slice(0, 160);
}

export function recordAiRun(uid: string, agent: AiAgent, run: { outcome: 'finished' | 'error'; provider?: string; error?: string }) {
  runs.set(`${uid}|${agent}`, {
    at: new Date().toISOString(), outcome: run.outcome,
    ...(run.provider ? { provider: run.provider } : {}),
    ...(run.error ? { error: sanitizeAiError(run.error) } : {}),
  });
}

/** Tests only. */
export function resetAiActivityForTests() { runs.clear(); }

export type AiAgentState = 'off' | 'no-provider' | 'no-attempt' | 'finished' | 'error';
export interface AiAgentView { state: AiAgentState; stale: boolean; at: string | null; ageSec: number | null; provider: string | null; error: string | null }

/** Read-only view: shared chain as configured + each agent's last observed run. */
export function aiVisibility(uid: string, off: string[]) {
  const p = getProvider();
  let configured = false;
  try { configured = p.isConfigured(); } catch { /* treated as not configured */ }
  let st: any = null;
  try { st = configured && p.status ? p.status() : null; } catch { st = null; }
  const nowMs = Date.now();
  const agent = (a: AiAgent): AiAgentView => {
    const r = runs.get(`${uid}|${a}`);
    const none = { stale: false, at: null, ageSec: null, provider: null, error: null };
    if (off.includes(a)) return { state: 'off', ...none, ...(r ? { at: r.at } : {}) } as AiAgentView;
    if (!configured) return { state: 'no-provider', ...none };
    if (!r) return { state: 'no-attempt', ...none };
    const ageSec = Math.max(0, Math.round((nowMs - Date.parse(r.at)) / 1000));
    return { state: r.outcome, stale: ageSec > AI_STALE_AFTER_SEC, at: r.at, ageSec, provider: r.provider ?? null, error: r.error ?? null };
  };
  return {
    // Shared by all three agents: one chain, not three configs.
    chain: {
      configured,
      provider: configured ? p.name : null,
      label: configured ? (p.label || p.name) : null,
      mockOnly: configured && /mock/i.test(p.name),
      members: Array.isArray(st?.members)
        ? st.members.map((m: any) => ({
            name: String(m.name), configured: !!m.configured, restingFor: Number(m.restingFor) || 0, lastOk: m.lastOk ?? null,
            lastFail: m.lastFail ? { at: m.lastFail.at, kind: m.lastFail.kind, message: sanitizeAiError(m.lastFail.message) } : null,
          }))
        : [],
    },
    staleAfterSec: AI_STALE_AFTER_SEC,
    agents: { personal: agent('personal'), cm: agent('cm'), nordea: agent('nordea') },
  };
}
