/**
 * v27: Nora's suggestions outside the chat. Code only, no model.
 *
 * - Home "For you": one card at a time. It stays until the customer answers or dismisses it; a new
 *   one is picked at most once a week ("Now and then", the default), whenever one fits ("Whenever
 *   something fits"), or never ("Only when I ask"). Every guard rule still applies.
 * - "Nora's suggestions": what Nora suggested or asked, what the customer did, and "Why Nora
 *   suggested this" with the facts used at the time, the rule's source and what Nordea earns.
 */
import type { AdviceHistoryItem, AdviceState, AdviceView, MessageCard } from '../../types.js';
import { db } from '../db.js';
import { FACTS, isFactKey, type Facts, type FactKey } from './facts.js';
import { evaluate } from './evaluate.js';
import { addDays, blockReason, catalogue, factsOf, logAdviceRead, selectCandidates, snapshot, whoOf, remember, oneAnswerAway, LIMITS, type Candidate } from './guard.js';
import { cardFor, sourceLabel, shortDay } from './cards.js';
import { handleAdviceAction, type AdviceAction, type AdviceResult } from './actions.js';
import type { Rule } from './rules.js';

export const PROACTIVE = ['ask', 'sometimes', 'often'] as const;
export type Proactive = (typeof PROACTIVE)[number];
/** "Now and then": a new Home card at most this often. */
export const HOME_EVERY_DAYS = 7;

const setting = (st: AdviceState | undefined): Proactive => (st?.proactive && PROACTIVE.includes(st.proactive) ? st.proactive : 'sometimes');

import { saveAdvice as save } from './guard.js';

/** Is this rule's card still one the customer may see, ignoring that it was just asked or shown? */
function stillValid(rule: Rule[] | undefined, ruleId: string, facts: Facts, st: AdviceState, userId: string, today: string) {
  const versions = rule || catalogue().filter((r) => r.id === ruleId);
  if (!versions.length) return null;
  const ev = evaluate(versions, facts, today);
  const live = versions.find((r) => r.version === ev.version);
  if (!live) return null;
  const mem = st.rules?.[ruleId];
  const st2: AdviceState = { ...st, rules: { ...(st.rules || {}) } };
  if (mem && (mem.last === 'asked' || mem.last === 'shown')) delete st2.rules![ruleId];
  if (blockReason(live, ev, st2, whoOf(db.getUser(userId)), today)) return null;
  return { ev, rule: live };
}

/** The Home card for today (or null). Picking a new one is remembered; reading it is logged. */
export function forYou(userId: string, today: string): MessageCard | null {
  const u = db.getUser(userId);
  if (!u) return null;
  const st = u.advice || {};
  if (setting(st) === 'ask') return null;
  const facts = factsOf(userId, today);
  const calm = u.viewMode === 'calm';
  // The card already on Home stays until the customer acts on it (answering moves it along).
  if (st.home) {
    const v = st.home.moved ? null : stillValid(undefined, st.home.ruleId, facts, st, userId, today);
    if (v) {
      logAdviceRead(userId, 'Nora suggestions: For you on Home', facts);
      return cardFor({ ...v.ev, rule: v.rule }, facts, calm);
    }
    // "Now and then", and always in the calm view: a new Home card at most once a week.
    if ((setting(st) === 'sometimes' || calm) && st.home.at > addDays(today, -HOME_EVERY_DAYS)) return null;
  }
  const { list } = selectCandidates(catalogue(), facts, st, whoOf(u), today);
  logAdviceRead(userId, 'Nora suggestions: For you on Home', facts);
  const c = list.find((x) => oneAnswerAway(x, facts, today, catalogue()));
  if (!c) return null;
  const card = cardFor(c, facts, calm);
  // Picking for Home does not use up the chat's calm-view allowance: if the customer then asks about
  // the same thing in a chat, Nora can show it there (it is the same suggestion, not an extra one).
  save(userId, (s) => ({ ...s, home: { ruleId: c.rule.id, at: today } }));
  if (c.status === 'eligible') snapshot(userId, card, facts, c.used, 'home', today);
  return card;
}

/** A button on the Home card. The card must still be the one on Home (else 409: refresh). */
export function homeAction(userId: string, ruleId: string, version: string, action: AdviceAction, payload: Record<string, unknown>, today: string): AdviceResult & { refresh?: boolean } {
  const u = db.getUser(userId);
  if (!u) return { ok: false, status: 404, error: 'Customer not found', replies: [] };
  const st = u.advice || {};
  if (st.home?.ruleId !== ruleId || st.home.moved) return { ok: false, status: 409, error: 'This changed, so Home was refreshed.', refresh: true, replies: [] };
  const facts = factsOf(userId, today);
  const v = stillValid(undefined, ruleId, facts, st, userId, today);
  if (!v || v.rule.version !== version) return { ok: false, status: 409, error: 'This changed, so Home was refreshed.', refresh: true, replies: [] };
  const card = cardFor({ ...v.ev, rule: v.rule }, facts, u.viewMode === 'calm');
  if (action === 'fact_answer' && (card.type !== 'ask_fact' || card.data!.fact !== payload.fact)) return { ok: false, status: 409, error: 'This question changed, so Home was refreshed.', refresh: true, replies: [] };
  if (action !== 'fact_answer' && !['opp_ok', 'opp_notnow', 'opp_never'].includes(action)) return { ok: false, status: 400, error: 'Open it in a chat to do that', replies: [] };
  const r = handleAdviceAction(userId, card, action, payload, today, 'home');
  // On Home the next card replaces this one in place, so the words point there instead of "below".
  const next = r.replies[0]?.cards?.[0]?.type;
  if (r.ok && next) r.replies = [{ text: next === 'ask_fact' ? 'Thanks, saved. Nora has one more question.' : 'Thanks, saved. Here’s what fits you.' }];
  return r;
}

/** "Show me": the full card in a new chat with Nora (its buttons work there as usual). */
export function cardForChat(userId: string, ruleId: string, today: string): { card: MessageCard; used: FactKey[]; facts: Facts } | null {
  const u = db.getUser(userId);
  const st = u?.advice || {};
  if (!u || st.home?.ruleId !== ruleId || st.home.moved) return null;
  const facts = factsOf(userId, today);
  const v = stillValid(undefined, ruleId, facts, st, userId, today);
  if (!v || v.ev.status !== 'eligible') return null;
  return { card: cardFor({ ...v.ev, rule: v.rule }, facts, u.viewMode === 'calm'), used: v.ev.used, facts };
}

function statusText(m: NonNullable<AdviceState['rules']>[string], rule: Rule | undefined): string {
  switch (m.last) {
    case 'asked': return `Nora asked you a question · ${shortDay(m.at)}`;
    case 'shown': return `Shown to you · ${shortDay(m.at)}`;
    case 'seen': return `Good to know · ${shortDay(m.at)}`;
    case 'notNow': return `Not now · back after ${shortDay(m.until || m.at)}`;
    case 'never': return 'You said: don’t suggest again';
    case 'accepted': return m.how === 'adviser' || (rule && rule.action !== 'appOffer') ? `Adviser asked · ${shortDay(m.at)}` : `Opened · ${shortDay(m.at)}`;
  }
}

/** "Nora's suggestions", newest first. */
export function history(userId: string): AdviceHistoryItem[] {
  const u = db.getUser(userId);
  const st = u?.advice || {};
  const cat = catalogue();
  const entries = db.getCabinetEntries(userId).filter((e) => e.factKey && e.status === 'active' && e.source === 'customer');
  return Object.entries(st.rules || {})
    .map(([ruleId, m]) => {
      const versions = cat.filter((r) => r.id === ruleId).sort((a, b) => b.version.localeCompare(a.version));
      const seen = st.seen?.[ruleId];
      const rule = (seen && versions.find((r) => r.version === seen.version)) || versions[0];
      const askFacts = rule ? (Object.keys(rule.ask) as string[]) : [];
      const answers = entries.filter((e) => askFacts.includes(e.factKey!)).map((e) => ({
        fact: e.factKey!, label: isFactKey(e.factKey!) ? FACTS[e.factKey!].label : e.factKey!,
        value: e.title.includes(': ') ? e.title.slice(e.title.indexOf(': ') + 2) : String(e.factValue),
      }));
      const can: AdviceHistoryItem['can'] = [];
      if (m.last === 'never' || m.last === 'notNow') can.push('allow');
      if (answers.length) can.push('forget');
      const item: AdviceHistoryItem = {
        ruleId, title: rule?.title || ruleId, status: statusText(m, rule), last: m.last, at: m.at, ...(m.until ? { until: m.until } : {}), can, answers,
        ...(seen && rule ? { why: {
          where: seen.where, at: seen.at, reasons: seen.reasons, read: seen.read,
          source: { url: rule.source.url, label: `${sourceLabel(rule.source.url)} · checked ${shortDay(rule.source.checkedAt)}` },
          validFrom: rule.validFrom, earns: rule.earns, kindLabel: rule.kind === 'product' ? 'Nordea product' : rule.kind === 'tax' ? 'Tax rule' : 'State benefit',
        } } : {}),
      };
      return item;
    })
    .sort((a, b) => (a.at === b.at ? a.title.localeCompare(b.title) : b.at.localeCompare(a.at)));
}

export function adviceView(userId: string, today: string): AdviceView {
  const card = forYou(userId, today);
  return { proactive: setting(db.getUser(userId)?.advice), forYou: card, history: history(userId) };
}

export function setProactive(userId: string, v: unknown): boolean {
  if (typeof v !== 'string' || !(PROACTIVE as readonly string[]).includes(v)) return false;
  save(userId, (st) => ({ ...st, proactive: v as Proactive }));
  return true;
}

/** "Allow it again" (after not now / never) or "Change my answer" (forget the answers, ask again). */
export function resetRule(userId: string, ruleId: string, what: unknown): { ok: boolean; text?: string; error?: string } {
  const u = db.getUser(userId);
  const mem = u?.advice?.rules?.[ruleId];
  if (!u || !mem) return { ok: false, error: 'Nothing to change' };
  const rule = catalogue().find((r) => r.id === ruleId);
  if (what === 'allow') {
    if (mem.last !== 'never' && mem.last !== 'notNow') return { ok: false, error: 'Nothing to change' };
    save(userId, (st) => { const rules = { ...(st.rules || {}) }; delete rules[ruleId]; return { ...st, rules }; });
    return { ok: true, text: `Okay, Nora may suggest “${rule?.title || ruleId}” again.` };
  }
  if (what === 'forget') {
    const facts = rule ? Object.keys(rule.ask) : [];
    const now = new Date().toISOString();
    let n = 0;
    for (const e of db.getCabinetEntries(userId)) {
      if (e.factKey && facts.includes(e.factKey) && e.status === 'active' && e.source === 'customer') { db.updateCabinetEntry(e.id, { status: 'archived', updatedAt: now }, { by: 'you', how: 'You asked Nora to ask again' } as any); n++; }
    }
    if (!n) return { ok: false, error: 'No answers to change' };
    save(userId, (st) => {
      const rules = { ...(st.rules || {}) };
      if (rules[ruleId] && rules[ruleId].last !== 'never') delete rules[ruleId];
      const skipped = { ...(st.skippedFacts || {}) };
      for (const f of facts) delete skipped[f];
      return { ...st, rules, skippedFacts: skipped };
    });
    return { ok: true, text: 'Done. Your answer is removed, and Nora will ask again when it matters.' };
  }
  return { ok: false, error: 'Unknown change' };
}

export { LIMITS };

/** After "Show me" the card lives in the chat; Home stops showing it (the weekly limit still counts from its day). */
export function movedToChat(userId: string, ruleId: string, today: string) {
  save(userId, (st) => ({ ...remember(st, ruleId, 'shown', today), home: { ...(st.home || { ruleId, at: today }), moved: true } }));
}

/** The suggestion on Home now, if still valid: a chat may show this one even when the calm-view limit is used up. */
export function homeCandidate(userId: string, today: string): Candidate | null {
  const u = db.getUser(userId);
  const st = u?.advice || {};
  if (!u || !st.home || st.home.moved || setting(st) === 'ask') return null;
  const v = stillValid(undefined, st.home.ruleId, factsOf(userId, today), st, userId, today);
  return v ? { ...v.ev, rule: v.rule } : null;
}

/** A chat showed the same rule that is on Home: it now lives in the chat, so Home stops showing it. */
export function homeMovedToChat(userId: string, ruleId: string) {
  const st = db.getUser(userId)?.advice;
  if (st?.home?.ruleId === ruleId && !st.home.moved) save(userId, (s) => ({ ...s, home: { ...s.home!, moved: true } }));
}
