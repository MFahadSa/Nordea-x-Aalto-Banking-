/**
 * v26: what happens when the customer taps a button on a recommender card. Code only.
 *
 * The question loop ("complete the context"): an answer is saved in the cabinet with its source,
 * older answers to the same question are archived, and the rule is checked again at once. Then
 * Abel either asks the next missing question, shows the suggestion, or says it doesn't apply.
 */
import type { AdviceState, CabinetEntry, MessageCard } from '../../types.js';
import { db } from '../db.js';
import { FACTS, isFactKey, type FactKey } from './facts.js';
import { evaluate, liveVersion } from './evaluate.js';
import { blockReason, catalogue, factsOf, logAdviceRead, remember, rememberNotSure, snapshot, whoOf, type Candidate } from './guard.js';
import { askCard, opportunityCard } from './cards.js';

export type AdviceAction = 'fact_answer' | 'opp_accept' | 'opp_ok' | 'opp_notnow' | 'opp_never' | 'opp_adviser';
export const ADVICE_ACTIONS: AdviceAction[] = ['fact_answer', 'opp_accept', 'opp_ok', 'opp_notnow', 'opp_never', 'opp_adviser'];

export interface AdviceResult {
  ok: boolean;
  status: number;
  error?: string;
  /** What the card shows once answered. */
  resolved?: string;
  replies: { text: string; cards?: MessageCard[] }[];
  /** Ids of cabinet entries written (the answer). */
  saved?: string[];
}

const fail = (status: number, error: string): AdviceResult => ({ ok: false, status, error, replies: [] });
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayWords = (d: string) => `${Number(d.slice(8))} ${MONTHS.at(Number(d.slice(5, 7)) - 1)} ${d.slice(0, 4)}`;

/** Carries out an in-app offer. Every appOffer rule needs an entry here (the rule validator checks). */
const ACCEPT: Record<string, (userId: string) => string> = {
  'asp-account': (userId) => {
    db.upsertBankAccount(userId, 'asp', { type: 'ASP account' });
    return 'Your ASP account is open (demo) ✓ Make your first monthly deposit this month; I’ll keep count of the deposits for you.';
  },
};
export const ACCEPT_IDS = Object.keys(ACCEPT);


/** Re-check one rule for this customer, ignoring the waiting time of the card being answered. */
function recheck(userId: string, ruleId: string, today: string) {
  const versions = catalogue().filter((r) => r.id === ruleId);
  const facts = factsOf(userId, today);
  const ev = evaluate(versions, facts, today);
  const rule = versions.find((r) => r.version === ev.version);
  const u = db.getUser(userId);
  const st = { ...(u?.advice || {}), rules: { ...(u?.advice?.rules || {}) } };
  const mine = st.rules[ruleId];
  if (mine && mine.last !== 'never' && mine.last !== 'accepted') delete st.rules[ruleId];
  const blocked = rule ? blockReason(rule, ev, st, whoOf(u), today) : ev.status;
  logAdviceRead(userId, `Abel suggestions: checking “${rule?.title ?? ruleId}”`, facts);
  return { ev, rule, facts, blocked, calm: u?.viewMode === 'calm' };
}

function saveState(userId: string, f: (st: AdviceState | undefined) => AdviceState) {
  const u = db.getUser(userId);
  if (!u) return;
  db.updateUser(userId, { advice: f(u.advice) });
}

export function handleAdviceAction(userId: string, card: MessageCard | undefined, action: AdviceAction, payload: Record<string, unknown>, today: string, where: 'chat' | 'home' = 'chat'): AdviceResult {
  if (!card || (card.type !== 'ask_fact' && card.type !== 'opportunity')) return fail(400, 'No suggestion or question on this message');
  const d = card.data || {};
  const ruleId = String(d.ruleId || '');
  const versions = catalogue().filter((r) => r.id === ruleId);
  if (!versions.length) return fail(410, 'This suggestion no longer exists');
  if (!db.getUser(userId)) return fail(404, 'Customer not found');

  if (action === 'fact_answer') {
    if (card.type !== 'ask_fact') return fail(400, 'Not a question card');
    const fact = String(d.fact || '');
    if (!isFactKey(fact) || FACTS[fact].origin !== 'customer') return fail(400, 'Not a question the customer can answer');
    const raw = payload.value;
    if (raw === 'notSure') {
      saveState(userId, (st) => rememberNotSure(st, fact, today));
      return { ok: true, status: 200, resolved: 'Not sure', replies: [{ text: 'No problem. I won’t ask about that for a while.' }] };
    }
    let value: boolean | string;
    let shown: string;
    if (FACTS[fact].type === 'boolean') {
      if (raw !== 'yes' && raw !== 'no') return fail(400, 'Answer yes, no or not sure');
      value = raw === 'yes'; shown = raw === 'yes' ? 'Yes' : 'No';
    } else if (FACTS[fact].type === 'date') {
      if (typeof raw !== 'string' || !DATE.test(raw) || Number.isNaN(Date.parse(raw))) return fail(400, 'Give a date');
      if (raw > today) return fail(400, 'That date is in the future');
      if (raw < '1950-01-01') return fail(400, 'That date is too far back');
      value = raw; shown = dayWords(raw);
    } else return fail(400, 'This question cannot be answered here');
    return answer(userId, ruleId, fact, value, shown, today, where);
  }

  if (card.type !== 'opportunity') return fail(400, 'Not a suggestion card');
  const live = liveVersion(versions, today);
  if (!live || live.version !== d.version) {
    return { ok: true, status: 200, resolved: 'Out of date', replies: [{ text: 'This suggestion changed since it was shown, so I’ve closed it. Ask me again any time.' }] };
  }
  switch (action) {
    case 'opp_ok':
      saveState(userId, (st) => remember(st, ruleId, 'seen', today));
      return { ok: true, status: 200, resolved: 'Good to know', replies: [] };
    case 'opp_notnow':
      saveState(userId, (st) => remember(st, ruleId, 'notNow', today));
      return { ok: true, status: 200, resolved: 'Not now', replies: [{ text: 'Okay, I won’t bring this up for three months.' }] };
    case 'opp_never':
      saveState(userId, (st) => remember(st, ruleId, 'never', today));
      return { ok: true, status: 200, resolved: 'Don’t suggest this again', replies: [{ text: 'Done, I won’t suggest this again. If you change your mind, just ask me about it.' }] };
    case 'opp_adviser':
      saveState(userId, (st) => remember(st, ruleId, 'accepted', today, 'adviser'));
      return { ok: true, status: 200, resolved: 'Talk to an adviser', replies: [] };
    case 'opp_accept': {
      if (live.action !== 'appOffer' || !ACCEPT[ruleId]) return fail(400, 'This suggestion has nothing to open in the app');
      const { ev, blocked } = recheck(userId, ruleId, today);
      if (ev.status !== 'eligible' || blocked) {
        return { ok: true, status: 200, resolved: 'No longer applies', replies: [{ text: 'Something changed since I showed this, so it no longer applies to you. I’ve closed it.' }] };
      }
      const text = ACCEPT[ruleId](userId);
      saveState(userId, (st) => remember(st, ruleId, 'accepted', today, 'opened'));
      return { ok: true, status: 200, resolved: live.cta || 'Done', replies: [{ text }] };
    }
  }
  return fail(400, 'Unknown action');
}

function answer(userId: string, ruleId: string, fact: FactKey, value: boolean | string, shown: string, today: string, where: 'chat' | 'home'): AdviceResult {
  const now = new Date().toISOString();
  // A new answer replaces older answers to the same question (they are archived, not deleted).
  for (const e of db.getCabinetEntries(userId)) {
    if (e.factKey === fact && e.status !== 'archived') db.updateCabinetEntry(e.id, { status: 'archived', updatedAt: now }, { by: 'you' } as any);
  }
  const rule = catalogue().find((r) => r.id === ruleId);
  const entry: CabinetEntry = {
    id: `fact-${fact}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    userId, type: 'fact', title: `${FACTS[fact].label}: ${shown}`, detail: `You told Abel${rule ? `, for “${rule.title}”` : ''}.`,
    source: 'customer', status: 'active', private: false, readableBy: { abel: true, offers: false },
    provenance: { channel: 'app' }, reviewed: true, factKey: fact, factValue: value, createdAt: now, updatedAt: now,
  };
  db.addCabinetEntry(entry, { by: 'you' } as any);

  const { ev, rule: live, facts, blocked, calm } = recheck(userId, ruleId, today);
  const base = { ok: true, status: 200, resolved: shown, saved: [entry.id] };
  if (!live) return { ...base, replies: [{ text: 'Thanks, saved.' }] };
  if (ev.status === 'notEligible') return { ...base, replies: [{ text: `Thanks, saved. Then “${live.title}” doesn’t apply to you, so I won’t suggest it.` }] };
  if (blocked) return { ...base, replies: [{ text: 'Thanks, saved.' }] };
  const cand: Candidate = { ...ev, rule: live };
  if (ev.status === 'ask') {
    saveState(userId, (st) => remember(st, ruleId, 'asked', today));
    return { ...base, replies: [{ text: 'Thanks, saved. One more question:', cards: [askCard(cand, calm)] }] };
  }
  if (ev.status === 'eligible') {
    saveState(userId, (st) => remember(st, ruleId, 'shown', today));
    const card = opportunityCard(cand, facts, calm);
    snapshot(userId, card, facts, ev.used, where, today);
    return { ...base, replies: [{ text: 'Thanks, saved. Then this could help you:', cards: [card] }] };
  }
  return { ...base, replies: [{ text: `Thanks, saved. Then “${live.title}” doesn’t apply to you, so I won’t suggest it.` }] };
}
