/**
 * v26: which suggestions and questions may appear, for one customer on one day. A pure core
 * (selectCandidates) so every edge can be tested, and a thin wrapper that reads the database.
 *
 * Rules that never bend: only "eligible" or "ask" results; never a rule the customer said "never"
 * to; "not now" waits; "not sure" is not asked again for a while; minors never see regulated
 * topics; partner offers off means no product suggestions; the calm view gets at most one a week.
 */
import type { AdviceState, User } from '../../types.js';
import { db } from '../db.js';
import { FACTS, buildFacts, type Facts } from './facts.js';
import { evaluateAll, type Evaluation } from './evaluate.js';
import { loadRules, type Rule } from './rules.js';

export const LIMITS = {
  notNowDays: 90,
  notSureDays: 30,
  /** A suggestion already shown, asked or marked "good to know" is not shown again for this long. */
  repeatDays: 30,
  seenDays: 180,
  calmEveryDays: 7,
  /** How many allowed items Abel may choose from (the customer still sees at most one card per reply). */
  maxCandidates: 8,
} as const;

export interface Candidate extends Evaluation { rule: Rule }
export interface Blocked { ruleId: string; why: string }
export interface Who { age: number | null; offersOff: boolean; calm: boolean }

export const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 864e5).toISOString().slice(0, 10);

/** Pure: the evaluations that may be put in front of this customer today, best first. */
export function selectCandidates(rules: Rule[], facts: Facts, state: AdviceState | undefined, who: Who, today: string): { list: Candidate[]; blocked: Blocked[] } {
  const blocked: Blocked[] = [];
  const list: Candidate[] = [];
  const st = state || {};
  if (who.calm && (st.shownOn || []).some((d) => d <= today && d > addDays(today, -LIMITS.calmEveryDays))) {
    return { list, blocked: [{ ruleId: '*', why: `calm view: one suggestion every ${LIMITS.calmEveryDays} days` }] };
  }
  for (const ev of evaluateAll(rules, facts, today)) {
    const rule = rules.find((r) => r.id === ev.ruleId && r.version === ev.version);
    if (!rule) continue; // not live / no version: nothing to show
    const why = blockReason(rule, ev, st, who, today);
    if (why) { blocked.push({ ruleId: rule.id, why }); continue; }
    list.push({ ...ev, rule });
  }
  // Something the customer can use now first; then the question that unlocks one.
  list.sort((a, b) => (a.status === b.status ? a.ruleId.localeCompare(b.ruleId) : a.status === 'eligible' ? -1 : 1));
  return { list: list.slice(0, LIMITS.maxCandidates), blocked };
}

/** Why this result may not be shown now (null = it may). Also used before every card is rendered. */
export function blockReason(rule: Rule, ev: Evaluation, st: AdviceState, who: Who, today: string): string | null {
  if (ev.status !== 'eligible' && ev.status !== 'ask') return ev.status;
  if (who.age !== null && who.age < 18 && rule.regulated) return 'minor: no regulated topics';
  if (who.age === null && rule.regulated) return 'age unknown: no regulated topics';
  if (who.offersOff && rule.kind === 'product') return 'customer turned offers off';
  const mem = st.rules?.[rule.id];
  if (mem) {
    if (mem.last === 'never') return 'customer said never';
    if (mem.last === 'accepted') return 'already accepted';
    if (mem.until && mem.until > today) return `${mem.last} until ${mem.until}`;
  }
  if (ev.status === 'ask' && ev.ask) {
    if (FACTS[ev.ask.fact].origin !== 'customer') return 'never ask the customer what Nordea knows';
    const skip = st.skippedFacts?.[ev.ask.fact];
    if (skip && skip.until > today) return `customer was not sure about ${ev.ask.fact} (until ${skip.until})`;
  }
  return null;
}

/** Remember what happened, with the right waiting time. Returns the new state (pure). */
export function remember(st: AdviceState | undefined, ruleId: string, what: NonNullable<AdviceState['rules']>[string]['last'], today: string): AdviceState {
  const next: AdviceState = { ...(st || {}), rules: { ...(st?.rules || {}) } };
  const until = what === 'notNow' ? addDays(today, LIMITS.notNowDays)
    : what === 'seen' ? addDays(today, LIMITS.seenDays)
    : what === 'asked' || what === 'shown' ? addDays(today, LIMITS.repeatDays)
    : undefined;
  next.rules![ruleId] = { last: what, at: today, ...(until ? { until } : {}) };
  if (what === 'asked' || what === 'shown') next.shownOn = [...new Set([...(st?.shownOn || []), today])].sort().slice(-30);
  return next;
}

export function rememberNotSure(st: AdviceState | undefined, fact: string, today: string): AdviceState {
  return { ...(st || {}), skippedFacts: { ...(st?.skippedFacts || {}), [fact]: { at: today, until: addDays(today, LIMITS.notSureDays) } } };
}

// ---------------- Database wrapper ----------------

let cached: { at: number; rules: Rule[] } | null = null;
/** The rules catalogue (re-read at most once a minute, so an edited rule file is picked up). */
export function catalogue(): Rule[] {
  if (!cached || Date.now() - cached.at > 60_000) cached = { at: Date.now(), rules: loadRules().rules };
  return cached.rules;
}
export function resetCatalogueCache() { cached = null; }

export function whoOf(u: User | undefined): Who {
  return { age: u && u.age > 0 ? u.age : null, offersOff: !!u?.offersOff, calm: u?.viewMode === 'calm' };
}

export function factsOf(userId: string, today: string): Facts {
  return buildFacts({
    user: db.getUser(userId), entries: db.getCabinetEntries(userId), transactions: db.getTransactions(userId),
    bankAccounts: db.getBankAccounts(userId), balances: db.getBalanceSnapshots(userId), purpose: 'abel', today,
  });
}

/** Every recommender check that read the cabinet is a logged read (same list the customer sees). */
export function logAdviceRead(userId: string, purpose: string, facts: Facts) {
  const ids = [...new Set(Object.values(facts).flatMap((f) => (f.state === 'known' ? f.entryIds || [] : [])))];
  db.addAccessLogEntry({
    id: `acc-adv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: new Date().toISOString(), userId,
    agentId: 'abel', agentName: 'Abel, your assistant', purpose, itemsReadCount: ids.length, blockedCount: 0,
    allowedItems: ids.map((i) => db.getCabinetEntry(i)?.title || i), allowedIds: ids, blockedReasons: [],
  });
}

export function candidatesFor(userId: string, today: string, purpose = 'Abel suggestions: checking which apply') {
  const u = db.getUser(userId);
  const facts = factsOf(userId, today);
  logAdviceRead(userId, purpose, facts);
  return { facts, ...selectCandidates(catalogue(), facts, u?.advice, whoOf(u), today) };
}
