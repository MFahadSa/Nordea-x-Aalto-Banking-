/**
 * About you, onboarding answers and "Offers for you".
 *
 * - About you: every field is one cabinet entry (aboutPart = field key, aboutValues = the answers), so
 *   it sits in the Context Cabinet with the customer's other notes and the usual Share / Delete rules.
 *   What Nordea already knows is offered as a pre-filled suggestion the customer confirms with one tap.
 * - Answers that a rule in rules/ can use are also written as fact entries (factKey / factValue), the
 *   format src/server/advice/facts.ts already reads, so they unlock the existing "For you" suggestions.
 * - Offers for you: what a current Nordea offer needs decides what is asked. Each offer shows one personal
 *   reason, the data used and what Nordea earns. The customer pins, asks Nora, hides till payday or
 *   hides for good; every action can be undone.
 * - A few points per first answer (Rewards), never the main reason.
 */
import type { Express, Request } from 'express';
import { db } from './db.js';
import * as fin from './finance.js';
import { loadBus } from './arch/store/busStore.js';
import { decideProposal } from './arch/orchestrator.js';
import { getProvider } from './llm.js';
import type { CabinetEntry } from '../types.js';
import { REWARDS } from './rewards.js';
import { bankPicture } from './aboutBank.js';
import { FIELDS, QUESTIONS, inferValues, mergeCorrection, offerQuestion, type AboutView, type FieldKey, type FieldView } from '../aboutParts.js';

const now = () => new Date().toISOString();
const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const uidOf = (req: Request) => String((req.method === 'GET' ? req.query.userId : req.body?.userId) || 'lauri');
const POINTS_PER_ANSWER = 5;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

type Extra = { aboutRewarded?: string[]; offerState?: OfferState; aboutOff?: FieldKey[] };
const userX = (userId: string) => db.getUser(userId) as unknown as (ReturnType<typeof db.getUser> & Extra) | undefined;

const live = (e: CabinetEntry) => e.status !== 'archived' && e.status !== 'disputed';
const fieldEntry = (entries: CabinetEntry[], key: FieldKey) =>
  entries.filter((e) => e.aboutPart === key && live(e)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

/** A write the customer just made lands straight away (their tap is the consent). */
function land(userId: string, entryId: string) {
  const waiting = loadBus(userId).messages.find((m) => m.type === 'propose' && m.status === 'pending'
    && (m.payload as { entry?: { id?: string } } | undefined)?.entry?.id === entryId);
  if (waiting) decideProposal(userId, waiting.id, true);
}

function sentence(key: FieldKey, values: string[], free?: string): string {
  if (key === 'more' || key === 'basics' || key === 'money') return free || values.join(', ');
  if (!values.length) return '';
  const low = values.map((v) => v.charAt(0).toLowerCase() + v.slice(1));
  const list = low.length > 1 ? `${low.slice(0, -1).join(', ')} and ${low.at(-1)}` : low[0];
  switch (key) {
    case 'work': return free || ({ Working: 'Works', Studying: 'Studies', Both: 'Studies and works', 'Between jobs': 'Between jobs', Retired: 'Retired' } as Record<string, string>)[values[0]] || values[0];
    case 'home': return ({ Rents: 'Rents', Owns: 'Owns a home', 'With parents': 'Lives with parents', 'Student housing': 'Student housing' } as Record<string, string>)[values[0]] || values[0];
    case 'people': return free || (values[0] === 'Alone' ? 'Lives alone' : `Lives with ${low[0]}`);
    case 'plans': return list.charAt(0).toUpperCase() + list.slice(1);
    case 'interests': return `Interested in ${list}`;
    case 'risk': return ({ 'Keep it safe': 'Keeps savings safe', 'A little': 'OK with a little risk', Comfortable: 'Comfortable with risk' } as Record<string, string>)[values[0]] || values[0];
    case 'style': return values[0] === 'Short answers' ? 'Prefers short answers' : 'Likes more detail';
    case 'mainUse': return `Mostly uses Nordea for ${list}`;
  }
  return values.join(', ');
}

/** Nordea's pre-filled answers: what the bank data and the customer's own goals already say. */
function suggestions(userId: string, entries: CabinetEntry[]): Partial<Record<FieldKey, { values: string[]; text: string; from: string }>> {
  const out: Partial<Record<FieldKey, { values: string[]; text: string; from: string }>> = {};
  if (!db.getUser(userId)) return out;
  const bank = bankPicture(userId);
  out.basics = { values: [], text: bank.basics, from: 'Nordea knows' };
  for (const l of bank.lines) out[l.key] = { values: l.values, text: l.text, from: 'From your Nordea data' };
  // The customer's own goals and notes already say some things: suggest them, never assume them.
  const goals = entries.filter((e) => e.type === 'goal' && e.status === 'active');
  const plans = [
    goals.some((g) => g.goalType === 'home' || /flat|home|house|apartment/i.test(g.title)) ? 'A home' : '',
    goals.some((g) => g.goalType === 'travel' || /trip|travel|holiday/i.test(g.title)) ? 'Travel' : '',
    goals.some((g) => g.goalType === 'buffer' || /buffer|emergency/i.test(g.title)) ? 'A buffer' : '',
  ].filter(Boolean);
  if (plans.length) out.plans = { values: plans, text: sentence('plans', plans), from: 'From your goals' };
  if (entries.some((e) => e.type === 'preference' && live(e) && /low-risk|safe/i.test(`${e.title} ${e.detail}`))) out.risk = { values: ['Keep it safe'], text: 'Keeps savings safe', from: 'From your notes' };
  return out;
}

/**
 * What the customer took out of About you: removed in About you, or archived by asking Nora ("forget my
 * salary"). Those lines are not shown, not filled in from Nordea's data again and not asked again,
 * until the customer adds them back.
 */
function offKeys(userId: string, entries: CabinetEntry[]): Set<FieldKey> {
  const off = new Set<FieldKey>(userX(userId)?.aboutOff || []);
  for (const e of entries) {
    const k = e.aboutPart as FieldKey;
    if (!k || String(k).startsWith('fact:') || live(e)) continue;
    if (e.status === 'archived' || e.status === 'disputed') off.add(k);
  }
  for (const k of [...off]) if (fieldEntry(entries, k)) off.delete(k); // added back since
  off.delete('basics');
  return off;
}

/** Take fields out of About you: the answer, and the rule facts it unlocked. Kept in history. */
export function forgetAbout(userId: string, keys: FieldKey[], how = 'You removed it in About you', by: 'you' | 'abel' = 'you') {
  const entries = db.getCabinetEntries(userId);
  for (const k of keys) {
    for (const e of entries.filter((x) => (x.aboutPart === k || x.aboutPart === `fact:${k}`) && live(x))) {
      db.updateCabinetEntry(e.id, { status: 'archived' }, { by, how });
    }
  }
  const u = userX(userId);
  db.updateUser(userId, { aboutOff: [...new Set([...(u?.aboutOff || []), ...keys.filter((k) => k !== 'basics')])] } as never);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const whenText = (d?: string) => (d && /^\d{4}-\d{2}/.test(d) ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : '');

/** The answers that earn points, in the order the flow asks them. */
export const ASKED: FieldKey[] = ['work', 'home', 'money', 'plans', 'interests', 'risk', 'mainUse'];

export function aboutView(userId: string, entries: CabinetEntry[] = db.getCabinetEntries(userId)): AboutView {
  const u = db.getUser(userId);
  const sug = suggestions(userId, entries);
  const off = offKeys(userId, entries);
  const fullBank = bankPicture(userId);
  // Lines the customer removed are not offered again from Nordea's data.
  const bank = { ...fullBank, lines: fullBank.lines.filter((l) => !off.has(l.key)) };
  const fields = {} as Record<FieldKey, FieldView>;
  for (const def of Object.values(FIELDS)) {
    const e = fieldEntry(entries, def.key);
    // A typed answer ("Studies at Aalto") counts like the tapped one it clearly means.
    const values = e?.aboutValues?.length ? e.aboutValues : e ? inferValues(def.key, e.detail) : [];
    const s = sug[def.key];
    const said = !!e;
    fields[def.key] = {
      key: def.key, label: def.label, options: def.options, multi: def.multi, values,
      text: said ? (e!.detail || sentence(def.key, values)) : def.key === 'basics' && s ? s.text : '',
      source: said ? (e!.source === 'nordea' ? 'nordea' : 'you') : def.key === 'basics' && s ? 'nordea' : 'none',
      suggestion: !said && def.key !== 'basics' && !off.has(def.key) ? s : undefined,
      ...(off.has(def.key) ? { removed: true } : {}),
    };
  }
  const f = fields;
  const has = (k: FieldKey) => f[k].source !== 'none';
  const name = u?.name || '';
  // The paragraph is built from what is in the cabinet NOW: only what the customer confirmed or told
  // Nora, their goals and their latest notes. Nordea's unconfirmed data is a suggestion below, never
  // part of it, so removing something (here or by asking Nora) takes it out straight away.
  const goals = entries.filter((e) => e.type === 'goal' && e.status === 'active');
  const notes = entries
    .filter((e) => live(e) && !e.aboutPart && !e.private && (e.type === 'life_event' || e.type === 'preference' || e.type === 'fact')
      && (e.source !== 'nordea' || e.reviewed) && !e.factKey)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 2);
  // The target only when the goal's name doesn't already say it ("Japan trip 3 000 € by 2027-06").
  const goalText = goals.slice(0, 3).map((g) => `${g.title}${g.target?.amount && !/\d/.test(g.title) ? ` (${Math.round(g.target.amount).toLocaleString('fi-FI')} € by ${whenText(g.target.date)})` : ''}`);
  const parts = [
    `${name}${f.basics.text ? `, ${f.basics.text}` : ''}.`,
    has('work') ? f.work.text : '',
    [f.people.text, has('home') ? f.home.text : ''].filter(Boolean).join(', '),
    has('money') ? f.money.text : '',
    f.plans.text ? `Plans: ${lower(f.plans.text)}` : '',
    goalText.length ? `Saving for ${goalText.join('; ')}` : '',
    f.interests.text,
    [f.risk.text, f.style.text].filter(Boolean).join('; '),
    f.more.text,
    notes.length ? `Also: ${notes.map((e) => (/^I\b/.test(e.title) ? e.title : lower(e.title))).join('; ')}` : '',
  ].filter(Boolean).map((s) => (/[.!?]$/.test(s) ? s : `${s}.`));

  // What answering is worth: points toward a real reward, and examples of advice it unlocks.
  // Screens left: one to check Nordea's data (if anything is unchecked), then one per open question.
  const unchecked = bank.lines.filter((l) => !has(l.key)).length;
  if (parts.length === 1 && unchecked) parts.push('Nordea’s data can fill in the rest: check it below.');
  const remaining = (unchecked ? 1 : 0) + QUESTIONS.filter((q) => !has(q.field) && !off.has(q.field)).length;
  const earn = ASKED.filter((k) => !has(k) && !off.has(k)).length * POINTS_PER_ANSWER;
  const now = u?.points || 0;
  const rewards = [...REWARDS].sort((a, b) => a.pts - b.pts);
  const reach = rewards.find((r) => r.pts > now && r.pts <= now + earn);
  const next = rewards.find((r) => r.pts > now);
  const rewardLine = !earn ? '' : reach ? `Enough for ${lower(reach.title)}` : next ? `${earn} points closer to ${lower(next.title)}` : '';
  const home = goals.find((g) => g.goalType === 'home' || /flat|home|house|apartment/i.test(g.title));
  const travel = goals.find((g) => g.goalType === 'travel' || /trip|travel|holiday/i.test(g.title));
  const teasers = [
    home ? `How much to save each month to reach “${home.title}” on time` : 'How much to save each month for what matters to you',
    travel && home ? `A travel budget that keeps your flat on track` : travel ? `How much to put aside for “${travel.title}”` : '',
    bank.eatingOut >= 150 ? 'Where you could cut back on eating out, which has gone up lately' : 'Where your money goes, and where you could save',
    'Only savings and offers that fit your comfort with risk',
  ].filter(Boolean).slice(0, 3);
  return {
    paragraph: parts.join(' '),
    fields,
    bank: bank.lines.map((l) => ({ key: l.key, label: l.label, icon: l.icon, text: l.text })),
    incentive: { remaining, points: earn, have: now, rewardLine, teasers },
    setup: [
      { key: 'plans', done: has('plans') || goals.length > 0, doneText: 'Your goal is set', todoText: 'Add your plans → see if you’re on track', step: 'plans' },
      { key: 'interests', done: has('interests'), doneText: 'Tips matched to your interests', todoText: 'Pick your topics → get tips that fit you', step: 'interests' },
      { key: 'risk', done: has('risk'), doneText: 'Offers that suit you', todoText: 'Set your comfort with risk → only offers that suit you', step: 'risk' },
      { key: 'confirm', done: (['work', 'home', 'money'] as FieldKey[]).every((k) => has(k) || !f[k].suggestion), doneText: 'What we know is checked', todoText: 'Check what we already know → one tap each', step: 'confirm' },
    ],
  };
}

/** Rule facts the answers unlock (read by src/server/advice/facts.ts). */
const FACT_TITLE: Record<string, string> = { savingForHome: 'Saving towards a home', interestedInInvesting: 'Interested in investing', isHigherEducationStudent: 'Studies', everOwnedHalfOfHome: 'Owns a home' };
const FACT_OF: { field: FieldKey; fact: string; when: (v: string[]) => boolean }[] = [
  { field: 'plans', fact: 'savingForHome', when: (v) => v.includes('A home') },
  { field: 'interests', fact: 'interestedInInvesting', when: (v) => v.includes('Investing basics') },
  { field: 'work', fact: 'isHigherEducationStudent', when: (v) => v.includes('Studying') || v.includes('Both') },
  { field: 'home', fact: 'everOwnedHalfOfHome', when: (v) => v.includes('Owns') },
];

/**
 * Apply a customer's correction to an About you sentence with the AI ("I own my flat" → "Owns their home"),
 * so it understands what they mean. Falls back to mergeCorrection's rules when no AI answers in time,
 * and never keeps an AI answer with a number the customer or the bank didn't give.
 */
/**
 * The About you paragraph in Nora's words. The AI gets only the paragraph built from the cabinet (what the
 * customer confirmed, their goals and notes) and rewrites it to read naturally. Its version is kept only
 * if it adds no number and is not much longer; otherwise, or with no AI, the built paragraph is used.
 * Cached per customer, so it is written again only when what Nora knows changes.
 */
const summaryCache = new Map<string, { from: string; text: string }>();
export async function aboutSummary(userId: string, built: string): Promise<{ text: string; by: 'ai' | 'rules' }> {
  const hit = summaryCache.get(userId);
  if (hit?.from === built) return { text: hit.text, by: 'ai' };
  const plain = { text: built, by: 'rules' as const };
  const p = getProvider();
  if (!p.isConfigured() || built.split(/[.!?]\s/).length < 3) return plain;
  try {
    const r = await p.step({
      system: [
        'You write the short "About you" summary in a bank app, from the facts given. The customer reads it.',
        'Rewrite the facts as 2 to 4 short, natural sentences in the third person, starting with their name.',
        'Use ONLY the facts given: add nothing, guess nothing, drop nothing important. Keep every amount and date exactly as written.',
        'Plain English, no lists, no advice, no praise, no emojis. Answer only with the writeSummary tool.',
      ].join('\n'),
      turns: [{ role: 'user', text: `Facts:\n${built}` }],
      tools: [{ name: 'writeSummary', description: 'The summary.', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }],
      temperature: 0, timeoutMs: 12000, maxWaitMs: 12000,
    });
    const out = String(r.calls.find((c) => c.name === 'writeSummary')?.args?.text || '').trim().replace(/\s+/g, ' ');
    const nums = (x: string) => (x.match(/\d[\d\s.,]*/g) || []).map((d) => d.replace(/[\s.,]/g, ''));
    const known = new Set(nums(built));
    if (!out || out.length > built.length * 1.3 + 40 || nums(out).some((d) => !known.has(d))) return plain;
    summaryCache.set(userId, { from: built, text: out });
    return { text: out, by: 'ai' };
  } catch {
    return plain;
  }
}

export async function smartCorrection(key: FieldKey, base: string, typed: string): Promise<{ text: string; by: 'ai' | 'rules' }> {
  const rules = { text: mergeCorrection(base, typed), by: 'rules' as const };
  if (!base || !typed.trim()) return rules;
  const p = getProvider();
  if (!p.isConfigured()) return rules;
  try {
    const r = await p.step({
      system: [
        'You update one line of a bank customer\'s profile ("About you") with their correction.',
        `The line is about: ${FIELDS[key].label}.`,
        'Change only what the correction is about and keep everything else that is still true.',
        'Remove anything the correction makes untrue (e.g. if they now own their home, drop the rent; if they say they don\'t save, drop the saving).',
        'Write in the same style: third person, short, no name, no extra words, no numbers that are not in the line or the correction. Amounts like "4 000 €".',
        'Answer only with the rewriteAnswer tool.',
      ].join('\n'),
      turns: [{ role: 'user', text: `Current line: ${base}\nCustomer's correction: ${typed.trim()}` }],
      tools: [{ name: 'rewriteAnswer', description: 'The updated line.', parameters: { type: 'object', properties: { text: { type: 'string', description: 'The whole updated line.' } }, required: ['text'] } }],
      temperature: 0, timeoutMs: 9000, maxWaitMs: 9000,
    });
    const out = String(r.calls.find((c) => c.name === 'rewriteAnswer')?.args?.text || '').trim().replace(/\s+/g, ' ');
    const digits = (x: string) => (x.match(/\d[\d\s.,]*/g) || []).map((d) => d.replace(/[\s.,]/g, ''));
    const known = new Set([...digits(base), ...digits(typed)]);
    const typedK = typed.match(/(\d+)\s*k\b/i);
    if (typedK) known.add(String(Number(typedK[1]) * 1000));
    if (!out || out.length > 300 || digits(out).some((d) => !known.has(d))) return rules;
    return { text: out, by: 'ai' };
  } catch {
    return rules;
  }
}

function writeField(userId: string, key: FieldKey, values: string[], free: string | undefined, fromNordea: boolean, asIs = false) {
  const entries = db.getCabinetEntries(userId);
  const old = entries.filter((e) => e.aboutPart === key && live(e));
  // Adding it again: the earlier removal no longer applies.
  for (const e of entries.filter((x) => x.aboutPart === key && !live(x))) db.deleteCabinetEntry(e.id, { by: 'you', how: 'Replaced by your new answer', purge: true });
  const offNow = userX(userId)?.aboutOff || [];
  if (offNow.includes(key)) db.updateUser(userId, { aboutOff: offNow.filter((k) => k !== key) } as never);
  const def = FIELDS[key];
  const clean = values.filter((v) => def.options.includes(v) || key === 'money');
  // A typed correction to a sentence (Nordea's or the customer's own) changes only what it is about.
  const typed = (free || '').trim().slice(0, 400);
  const base = !def.options.length || key === 'work' || key === 'home'
    ? (old[0]?.detail || bankPicture(userId).lines.find((l) => l.key === key)?.text || '') : '';
  const text = typed && base && !clean.length && !asIs ? mergeCorrection(base, typed) : typed;
  // A new answer replaces the old one (not kept as a removed note: About you shows the current answer).
  for (const e of old) db.deleteCabinetEntry(e.id, { by: 'you', how: 'Replaced by your new answer', purge: true });
  if (!clean.length && !text) return; // cleared
  // Plans and interests keep the tapped answers and add anything typed; elsewhere typed words win.
  const detail = (key === 'plans' || key === 'interests') && clean.length ? `${sentence(key, clean)}${text ? `; ${text}` : ''}` : text || sentence(key, clean);
  const e: CabinetEntry = {
    id: newId('about'), userId, type: key === 'plans' ? 'life_event' : key === 'risk' || key === 'style' || key === 'mainUse' || key === 'interests' ? 'preference' : 'fact',
    title: `${def.label}: ${clean.length ? clean.join(', ') : detail}`, detail, source: fromNordea ? 'nordea' : 'customer', status: 'active', private: false,
    readableBy: { abel: true, offers: false }, provenance: { channel: 'app', detectedFrom: fromNordea ? 'Nordea data, confirmed by you' : 'About you' },
    reviewed: true, confirmedAt: now(), createdAt: now(), updatedAt: now(), aboutPart: key, aboutValues: clean,
  };
  db.addCabinetEntry(e, { by: 'you', how: fromNordea ? 'You confirmed what Nordea knew' : 'You told Nora in About you' });
  land(userId, e.id);
  // Facts for the rules: replace this field's facts.
  for (const m of FACT_OF.filter((x) => x.field === key)) {
    for (const f of entries.filter((x) => x.factKey === m.fact && x.aboutPart === `fact:${key}` && live(x))) db.deleteCabinetEntry(f.id, { by: 'you', how: 'Replaced by your new answer', purge: true });
    if (m.when(clean)) {
      const fe: CabinetEntry = {
        id: newId('fact'), userId, type: 'fact', title: FACT_TITLE[m.fact] || detail, detail: 'From your answer in About you. Used for suggestions that fit you.', source: 'customer', status: 'active', private: false,
        readableBy: { abel: true, offers: false }, provenance: { channel: 'app', detectedFrom: 'About you' }, reviewed: true, createdAt: now(), updatedAt: now(),
        factKey: m.fact, factValue: true, aboutPart: `fact:${key}`,
      };
      db.addCabinetEntry(fe, { by: 'you', how: 'From your answer in About you' });
      land(userId, fe.id);
    }
  }
}

function reward(userId: string, keys: string[]): number {
  const u = userX(userId);
  if (!u) return 0;
  const done = new Set(u.aboutRewarded || []);
  const fresh = keys.filter((k) => !done.has(k));
  if (!fresh.length) return 0;
  db.updateUser(userId, { points: (u.points || 0) + POINTS_PER_ANSWER * fresh.length, aboutRewarded: [...done, ...fresh] } as never);
  return POINTS_PER_ANSWER * fresh.length;
}

// ---------------- Offers for you ----------------
interface OfferState { pinned?: Record<string, string>; later?: Record<string, string>; hidden?: Record<string, { at: string; reason?: string }> }
export interface OfferView {
  id: string; title: string; line: string; reason: string; note?: string; earns: string;
  used: { label: string; value: string; from: string }[];
  goal?: string; pinned: boolean;
  /** Details: what it is, how to set it up, and the official page when we have one. */
  about: string; steps: string[]; url?: string;
  /** Not picked from their answers: shown so the row is never empty, and said so. */
  general?: boolean;
  /** The rationale after the reason: how this offer helps with it (no figures: the terms are shown separately). */
  helps?: string;
}

/** How each offer helps, said to follow its "Because you …" reason. Plain, no figures, no promises. */
const HELPS: Record<string, string> = {
  asp: 'what you put aside for your first home earns extra interest, and it can lead to an ASP loan with a state guarantee',
  'asp-loan': 'your ASP savings can be topped up with a loan that has a state guarantee for that first home',
  young: 'your daily banking costs little or nothing while you are young, and saving and investing come with extra benefits',
  funds: 'you can start investing with a small amount each month and learn as you go, without picking shares yourself',
  'equity-savings': 'you can buy shares and pay tax only when you take money out, without custody fees at your age',
  'if-home': 'your home and belongings are covered, with a discount because you bank with Nordea',
  'home-loan': 'if life changes after you buy, you can lower or pause your loan payments for a while',
  renovation: 'you can spread the cost of work on your home over time instead of paying it all at once',
  gold: 'travel insurance and cashback come with your card, which helps on the trips you are planning',
};
interface OfferDef {
  id: string; title: string; earns: string; note?: string;
  fit: (c: Ctx) => null | { reason: string; line?: string; used: OfferView['used'] };
  line: string; goal?: (c: Ctx) => string | undefined;
}
interface Ctx { age: number; v: (k: FieldKey) => string[]; from: (k: FieldKey) => string; hasAsp: boolean; goals: CabinetEntry[] }

const used = (c: Ctx, k: FieldKey, label = FIELDS[k].label): OfferView['used'][number] => ({ label, value: c.v(k).join(', '), from: c.from(k) });
const ageUsed = (c: Ctx) => ({ label: 'Age', value: String(c.age), from: 'Nordea customer record' });
const homeGoal = (c: Ctx) => c.goals.find((g) => g.goalType === 'home' || /flat|home|house|apartment/i.test(g.title))?.title || 'A home';
const travelGoal = (c: Ctx) => c.goals.find((g) => g.goalType === 'travel' || /trip|travel|holiday/i.test(g.title))?.title || 'Travel';

/** The offers that exist today, and the one thing each needs to know. */
const OFFERS: OfferDef[] = [
  { id: 'asp', title: 'ASP account for your first home', line: 'Up to 5% interest, tax-free. With ASP savings you can apply for an ASP loan.',
    earns: 'The interest margin on your savings, and on a loan if you take one later.', goal: homeGoal,
    fit: (c) => c.v('plans').includes('A home') && !c.v('home').includes('Owns') && !c.hasAsp && c.age <= 44
      ? { reason: `Because you want a home${c.v('home').includes('Rents') ? ' and rent today' : ''}`, used: [used(c, 'plans'), ...(c.v('home').length ? [used(c, 'home', 'Housing')] : []), ageUsed(c)] } : null },
  { id: 'asp-loan', title: 'ASP loan', line: 'From 1 June 2026 you qualify after at least 20 monthly deposits of 50–1,500 euros.',
    earns: 'Interest on the loan.', note: 'A loan needs an application and a credit decision.', goal: homeGoal,
    fit: (c) => c.hasAsp && c.v('plans').includes('A home') ? { reason: 'Because you save in ASP for your first home', used: [used(c, 'plans'), { label: 'ASP account', value: 'Yes', from: 'Your Nordea accounts' }] } : null },
  { id: 'young', title: 'Young customer benefits', line: 'Low-cost or free daily banking, and saving and investing benefits for 18–27-year-olds.',
    earns: 'Nothing extra: these are discounts on Nordea’s own services.',
    fit: (c) => (c.age >= 18 && c.age <= 27) || c.v('work').includes('Studying') || c.v('work').includes('Both')
      ? { reason: c.v('work').includes('Studying') || c.v('work').includes('Both') ? 'Because you are a student' : `Because you’re ${c.age}`, used: [ageUsed(c), ...(c.v('work').length ? [used(c, 'work')] : [])] } : null },
  { id: 'funds', title: 'Monthly fund saving', line: 'Start with as little as 10 euros a month. With the digital adviser Nora it takes about 7 minutes.',
    earns: 'A yearly management fee from the fund.', note: 'Funds can go down as well as up.',
    fit: (c) => (c.v('interests').includes('Investing basics') || c.v('mainUse').includes('Investing')) && !c.v('risk').includes('Keep it safe')
      ? { reason: `Because you want to learn about investing${c.v('risk').length ? ` and are ${c.v('risk')[0] === 'Comfortable' ? 'comfortable with' : 'OK with a little'} risk` : ''}`, used: [used(c, 'interests'), ...(c.v('risk').length ? [used(c, 'risk')] : [])] } : null },
  { id: 'equity-savings', title: 'Equity savings account', line: 'Buy shares and pay tax only when you take money out. No custody fees aged 18–27.',
    earns: 'Trading fees on the shares you buy.', note: 'Shares can go down as well as up.',
    fit: (c) => c.age >= 18 && c.age <= 27 && !c.v('risk').includes('Keep it safe') && (c.v('interests').includes('Investing basics') || c.v('mainUse').includes('Investing'))
      ? { reason: `Because you’re ${c.age} and want to learn about investing`, used: [ageUsed(c), used(c, 'interests')] } : null },
  { id: 'if-home', title: 'Home insurance from If', line: '25% discount on new If home insurance for Nordea customers.',
    earns: 'A commission from If if you buy the insurance.', note: 'Sold by our partner If.',
    fit: (c) => c.v('home').includes('Rents') || c.v('home').includes('Owns') || c.v('plans').includes('A home')
      ? { reason: c.v('plans').includes('A home') ? 'Because you’re planning a move to your own home' : `Because you ${c.v('home').includes('Owns') ? 'own' : 'rent'} your home`, used: [...(c.v('home').length ? [used(c, 'home', 'Housing')] : []), ...(c.v('plans').length ? [used(c, 'plans')] : [])] } : null },
  { id: 'home-loan', title: 'Home loan with FlexiPayment', line: 'Adjust your monthly payment free of charge when life changes.',
    earns: 'Interest and fees on the loan.', note: 'A loan needs an application and a talk with an adviser.', goal: homeGoal,
    fit: (c) => c.v('plans').includes('A home') && c.v('work').includes('Working')
      ? { reason: 'Because you plan to buy a home and have a steady income', used: [used(c, 'plans'), used(c, 'work')] } : null },
  { id: 'renovation', title: 'Renovation loan or FlexiCredit', line: 'Spread the cost of fixing up your home.',
    earns: 'Interest on the credit.', note: 'Credit needs an application and a credit decision.',
    fit: (c) => c.v('home').includes('Owns') ? { reason: 'Because you own your home', used: [used(c, 'home', 'Housing')] } : null },
  { id: 'gold', title: 'Gold package', line: 'Travel insurance and cashback on card purchases in one package.',
    earns: 'The monthly package fee and card fees.', goal: travelGoal,
    fit: (c) => c.v('plans').includes('Travel')
      ? { reason: 'Because you plan to travel', line: c.age <= 27 ? 'Travel insurance and cashback, for under one euro a month for young customers.' : undefined, used: [used(c, 'plans'), ageUsed(c)] } : null },
];

/** Details per offer. Links only where the project has a real Nordea page (rules/*.json sources). */
const DETAILS: Record<string, { about: string; steps: string[]; url?: string }> = {
  asp: {
    about: 'An ASP account is a savings account for your first home. You save regularly; when you buy, the savings earn extra interest, tax-free, and you can apply for an ASP loan with state guarantee.',
    steps: ['Open the account in the app: Save and invest → ASP account.', 'Set a monthly transfer of 50–1,500 €.', 'Keep saving for at least 20 months; then you can apply for an ASP loan.'],
    url: 'https://www.nordea.fi/en/personal/our-services/savings-investments/saving-for-a-home.html',
  },
  'asp-loan': {
    about: 'An ASP loan finances your first home on top of your ASP savings, with a state guarantee and an interest subsidy.',
    steps: ['Make at least 20 monthly ASP deposits of 50–1,500 €.', 'Ask Nora what you could afford.', 'Apply for the loan and talk it through with an adviser.'],
  },
  young: {
    about: 'Customers aged 18–27 get daily banking for little or no cost, and benefits for saving and investing.',
    steps: ['Check that your details (age or student status) are up to date.', 'The benefits switch on by themselves; no application needed.'],
  },
  funds: {
    about: 'Put a fixed amount into a fund every month, from 10 €. Spreading it over time evens out the ups and downs.',
    steps: ['Pick an amount you can keep up, from 10 € a month.', 'Answer a few questions with the digital adviser (about 7 minutes).', 'Choose a fund and start the monthly saving. You can pause any time.'],
  },
  'equity-savings': {
    about: 'An equity savings account lets you buy shares and pay tax only when you take money out. Customers aged 18–27 pay no custody fees; trading fees still apply.',
    steps: ['Open the account in the app: Save and invest → Equity savings account.', 'Move money in (up to 100,000 € in total).', 'Buy shares; nothing is taxed until you withdraw.'],
    url: 'https://www.nordea.fi/en/personal/our-services/savings-investments/investments/equity-savings-account.html',
  },
  'if-home': {
    about: 'Home insurance from our partner If covers your belongings and liability. Nordea customers get 25% off new If home insurance.',
    steps: ['Get a quote from If (about 5 minutes).', 'Pick the cover that fits your home.', 'The discount is applied when you buy.'],
  },
  'home-loan': {
    about: 'A home loan with FlexiPayment: when life changes, you can lower or pause your monthly payment free of charge.',
    steps: ['Ask Nora how much you could borrow.', 'Fill in a loan application.', 'Book a meeting with an adviser to go through the offer.'],
  },
  renovation: {
    about: 'A renovation loan or FlexiCredit spreads the cost of fixing up your home over time.',
    steps: ['Estimate the cost of the work.', 'Apply in the app; you get a decision quickly.', 'Pay back at your own pace.'],
  },
  gold: {
    about: 'The Gold package bundles travel insurance and cashback on card purchases.',
    steps: ['Switch your package in the app: Services → Packages.', 'Your card gets travel insurance straight away.'],
  },
};

/** `shared`: only these entries may be used (Nora's chat); an answer the customer does not share counts as unknown. */
function ctxOf(userId: string, shared?: CabinetEntry[]): Ctx {
  const u = db.getUser(userId)!;
  const all = db.getCabinetEntries(userId);
  const entries = shared || all;
  const view = aboutView(userId, entries);
  const kept = (k: FieldKey) => !!shared && all.some((e) => e.aboutPart === k && live(e)) && !shared.some((e) => e.aboutPart === k && live(e));
  const v = (k: FieldKey) => kept(k) ? [] : (view.fields[k].values.length ? view.fields[k].values : view.fields[k].suggestion?.values || []);
  const from = (k: FieldKey) => (view.fields[k].values.length ? (view.fields[k].source === 'nordea' ? 'Nordea knew, you confirmed' : 'You told us') : view.fields[k].suggestion?.from || '');
  const hasAsp = db.getBankAccounts?.(userId)?.some((a) => /\basp\b/i.test(a.type || '')) ?? false;
  return { age: u.age, v, from, hasAsp, goals: entries.filter((e) => e.type === 'goal' && e.status === 'active') };
}

/** Offers sold by a partner: never shown or explained while partner offers are off. */
const PARTNER_OFFERS = new Set(['if-home']);

export function offersFor(userId: string, today = now().slice(0, 10), shared?: CabinetEntry[]) {
  const u = userX(userId);
  if (!u) return { offers: [] as OfferView[], hidden: 0 };
  const st = u.offerState || {};
  const c = ctxOf(userId, shared);
  const offers: OfferView[] = [];
  let hidden = 0;
  const hiddenIds: string[] = [];
  const isHidden = (id: string) => !!st.hidden?.[id] || !!(st.later?.[id] && st.later[id] > today);
  const view = (o: OfferDef, f: { reason: string; used: OfferView['used']; line?: string }): OfferView => {
    const d = DETAILS[o.id] || { about: o.line, steps: [] };
    return { id: o.id, title: o.title, line: f.line || o.line, reason: f.reason, note: o.note, earns: o.earns, used: f.used, goal: o.goal?.(c), pinned: !!st.pinned?.[o.id], about: d.about, steps: d.steps, url: d.url, helps: HELPS[o.id] };
  };
  for (const o of OFFERS) {
    if (u.offersOff && PARTNER_OFFERS.has(o.id)) continue;
    const f = o.fit(c);
    if (!f) continue;
    if (isHidden(o.id)) { hidden++; hiddenIds.push(o.id); continue; }
    offers.push(view(o, f));
  }
  // Never an empty row: with fewer than two that fit personally, add offers many customers use, said
  // plainly ("Popular with Nordea customers"), never one their own answers rule out or they hid.
  if (!shared && offers.length < 2) {
    const safe = c.v('risk').includes('Keep it safe');
    const GENERAL: { id: string; ok: boolean }[] = [
      { id: 'young', ok: c.age >= 18 && c.age <= 27 },
      { id: 'funds', ok: !safe },
      { id: 'gold', ok: true },
      { id: 'if-home', ok: !u.offersOff },
    ];
    for (const g of GENERAL) {
      if (offers.length >= 2) break;
      const o = OFFERS.find((x) => x.id === g.id);
      if (!o || !g.ok || isHidden(o.id) || offers.some((x) => x.id === o.id)) continue;
      offers.push({ ...view(o, { reason: 'Popular with Nordea customers', used: [] }), general: true });
    }
  }
  return { offers, hidden, hiddenIds };
}

/** The offer the customer tapped "Ask Nora" on, if it is one they are shown now. Its reason comes only from what Nora may read. */
export function askedOffer(userId: string, text: string, shared: CabinetEntry[]): { offer: OfferView; reason?: string } | null {
  const t = text.trim();
  const offer = offersFor(userId).offers.find((o) => offerQuestion(o.title) === t);
  return offer ? { offer, reason: offersFor(userId, undefined, shared).offers.find((o) => o.id === offer.id)?.reason } : null;
}

/** How Nora starts: the offer in a few words. */
const OFFER_LEAD: Record<string, string> = {
  asp: 'an ASP account', 'asp-loan': 'an ASP loan', young: 'young customer benefits', funds: 'monthly fund saving', 'equity-savings': 'an equity savings account',
  'if-home': 'home insurance', 'home-loan': 'a home loan with FlexiPayment', renovation: 'a renovation loan or FlexiCredit', gold: 'the Gold package',
};
/** Nora's checked answer about an offer. `official` is the rule's own explanation, used instead of the offer's short text. */
export function offerText(offer: OfferView, reason: string | undefined, official?: string): string {
  const lead = OFFER_LEAD[offer.id] || offer.title;
  const first = reason ? `${reason}, ${lead} could be worth a look.` : `${lead.charAt(0).toUpperCase()}${lead.slice(1)} could be worth a look.`;
  return [first, official || offer.about, offer.note || '', `What Nordea earns: ${offer.earns.charAt(0).toLowerCase()}${offer.earns.slice(1)}`].filter(Boolean).join(' ');
}

/** Under the AI's words: the exact terms and what Nordea earns. With an official rule, its card holds the terms. */
export function offerTerms(offer: OfferView, hasRule: boolean): string {
  return [hasRule ? '' : offer.line, offer.note || '', `What Nordea earns: ${offer.earns.charAt(0).toLowerCase()}${offer.earns.slice(1)}`].filter(Boolean).join(' ');
}

function nextPayday(userId: string, today: string): string {
  try { const p = fin.payPlan(userId).nextPayday; if (p && p > today) return p; } catch { /* no salary */ }
  return new Date(Date.parse(today) + 30 * 864e5).toISOString().slice(0, 10);
}

export function registerAboutRoutes(app: Express) {
  app.get('/api/about', (req, res) => {
    const userId = uidOf(req);
    if (!db.getUser(userId)) return res.status(404).json({ error: 'Customer not found' });
    res.json(aboutView(userId));
  });

  // What a typed correction will become: { key, text } → { text, by: 'ai' | 'rules' }. The app shows it before Save.
  app.post('/api/about/preview', async (req, res) => {
    const userId = uidOf(req);
    const key = String(req.body?.key || '') as FieldKey;
    if (!db.getUser(userId) || !(key in FIELDS)) return res.status(400).json({ error: 'Unknown customer or field' });
    const typed = String(req.body?.text || '').slice(0, 400);
    const old = db.getCabinetEntries(userId).find((e) => e.aboutPart === key && live(e));
    const base = old?.detail || bankPicture(userId).lines.find((l) => l.key === key)?.text || '';
    res.json(base ? await smartCorrection(key, base, typed) : { text: typed.trim(), by: 'rules' });
  });

  // Save answers: { answers: { field: { values: [], text?, asIs? } }, confirm: [field] } - one call for the whole onboarding.
  // asIs: the text is the corrected line the customer saw in the preview, saved exactly.
  app.post('/api/about', (req, res) => {
    const userId = uidOf(req);
    if (!db.getUser(userId)) return res.status(404).json({ error: 'Customer not found' });
    const answers = (req.body?.answers || {}) as Record<string, { values?: string[]; text?: string; asIs?: boolean }>;
    const confirm = (Array.isArray(req.body?.confirm) ? req.body.confirm : []) as string[];
    const before = aboutView(userId);
    const rewarded: string[] = [];
    for (const k of confirm) {
      if (!(k in FIELDS)) continue;
      const s = before.fields[k as FieldKey].suggestion;
      if (!s) continue;
      writeField(userId, k as FieldKey, s.values, s.text, s.from.startsWith('Nordea'));
      if (k === 'money') {
        // Confirming the habits also confirms the observations they came from.
        for (const e of db.getCabinetEntries(userId).filter((x) => x.source === 'nordea' && x.type === 'observation' && !x.reviewed && live(x) && !/salary/i.test(x.title))) {
          db.updateCabinetEntry(e.id, { reviewed: true, confirmedAt: now() }, { by: 'you', how: 'You confirmed it in About you' });
        }
      }
      rewarded.push(k);
    }
    for (const [k, a] of Object.entries(answers)) {
      if (!(k in FIELDS) || k === 'basics') continue;
      writeField(userId, k as FieldKey, Array.isArray(a?.values) ? a.values.map(String) : [], typeof a?.text === 'string' ? a.text : undefined, false, a?.asIs === true);
      rewarded.push(k);
    }
    const points = reward(userId, rewarded);
    res.json({ ...aboutView(userId), points });
  });

  app.get('/api/offers', (req, res) => {
    const userId = uidOf(req);
    if (!db.getUser(userId)) return res.status(404).json({ error: 'Customer not found' });
    res.json(offersFor(userId));
  });

  // pin / unpin · later / unlater · hide / unhide · reason (after "Not for me")
  app.post('/api/offers/action', (req, res) => {
    const userId = uidOf(req);
    const u = userX(userId);
    if (!u) return res.status(404).json({ error: 'Customer not found' });
    const id = String(req.body?.id || '');
    const offer = OFFERS.find((o) => o.id === id) || (req.body?.action === 'unhideAll' ? OFFERS[0] : undefined);
    if (!offer) return res.status(404).json({ error: 'Unknown offer' });
    const today = now().slice(0, 10);
    const st: OfferState = JSON.parse(JSON.stringify(u.offerState || {}));
    st.pinned ||= {}; st.later ||= {}; st.hidden ||= {};
    const action = String(req.body?.action || '');
    if (action === 'pin') st.pinned[id] = offer.goal?.(ctxOf(userId)) || 'Your plan';
    else if (action === 'unpin') delete st.pinned[id];
    else if (action === 'later') st.later[id] = nextPayday(userId, today);
    else if (action === 'unlater') delete st.later[id];
    else if (action === 'hide') st.hidden[id] = { at: today };
    else if (action === 'unhide') delete st.hidden[id];
    else if (action === 'unhideAll') { st.hidden = {}; st.later = {}; }
    else if (action === 'reason') { if (st.hidden[id]) st.hidden[id].reason = String(req.body?.reason || '').slice(0, 40); }
    else return res.status(400).json({ error: 'Unknown action' });
    db.updateUser(userId, { offerState: st } as never);
    res.json({ ...offersFor(userId, today), until: st.later[id], goal: st.pinned[id] });
  });

  // Demo: start the About you story again (answers, points markers, offer choices).
  app.post('/api/about/reset', (req, res) => {
    const userId = uidOf(req);
    for (const e of db.getCabinetEntries(userId).filter((x) => x.aboutPart)) db.deleteCabinetEntry(e.id, { by: 'you', how: 'Demo reset', purge: true });
    db.updateUser(userId, { aboutRewarded: [], offerState: {}, aboutOff: [] } as never);
    res.json(aboutView(userId));
  });

  // Remove one line of About you ({ key }), or all of it ({ key: 'all' }). Kept in history; adding it back works as usual.
  app.post('/api/about/remove', (req, res) => {
    const userId = uidOf(req);
    if (!db.getUser(userId)) return res.status(404).json({ error: 'Customer not found' });
    const key = String(req.body?.key || '');
    const keys = key === 'all' ? (Object.keys(FIELDS) as FieldKey[]).filter((k) => k !== 'basics') : key in FIELDS && key !== 'basics' ? [key as FieldKey] : [];
    if (!keys.length) return res.status(400).json({ error: 'Unknown field' });
    forgetAbout(userId, keys);
    res.json(aboutView(userId));
  });

  // The paragraph in Nora's words: written by the AI from the same confirmed lines, checked, cached.
  app.post('/api/about/summary', async (req, res) => {
    const userId = uidOf(req);
    if (!db.getUser(userId)) return res.status(404).json({ error: 'Customer not found' });
    const v = aboutView(userId);
    res.json(await aboutSummary(userId, v.paragraph));
  });
}
