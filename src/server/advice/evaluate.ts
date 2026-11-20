/**
 * v25: decides, in code only, what a rule means for one customer on one day. No AI is involved.
 * Three-valued logic: a condition is true, false or unknown. Unknown is never treated as yes:
 * it becomes one question, or "not eligible" when the missing fact is not the customer's to give.
 */
import { FACTS, daysBetween, type Facts, type FactKey, type FactValue } from './facts.js';
import type { Condition, Rule } from './rules.js';

export type Status = 'eligible' | 'ask' | 'notEligible' | 'notLive' | 'notTime' | 'stale';

export interface Evaluation {
  ruleId: string;
  version?: string;
  status: Status;
  /** For "ask": the one fact to ask about, and the question. */
  ask?: { fact: FactKey; question: string };
  /** Why it is not eligible or not shown, in plain words. */
  reasons: string[];
  /** Facts the result depended on (for "how do we know?" and the audit). */
  used: FactKey[];
  /** For "eligible": the message with every number filled by code. */
  message?: string;
  values?: Record<string, string>;
}

type Tri = true | false | 'unknown';

function test(c: Condition, facts: Facts, missing: Set<FactKey>, used: Set<FactKey>, failed: string[]): Tri {
  if ('all' in c) {
    const r = c.all.map((x) => test(x, facts, missing, used, failed));
    return r.includes(false) ? false : r.includes('unknown') ? 'unknown' : true;
  }
  if ('any' in c) {
    const local: string[] = [];
    const r = c.any.map((x) => test(x, facts, missing, used, local));
    if (r.includes(true)) return true;
    if (r.every((x) => x === false)) { failed.push(local.join(' and ')); return false; }
    return 'unknown';
  }
  if ('not' in c) {
    const local: string[] = [];
    const r = test(c.not, facts, missing, used, local);
    if (r === 'unknown') return 'unknown';
    if (r === true) failed.push(`not (${describe(c.not)})`);
    return !r;
  }
  const f = facts[c.fact];
  used.add(c.fact);
  if (f.state !== 'known' || f.value === null) { missing.add(c.fact); return 'unknown'; }
  const ok = compare(f.value, c);
  if (!ok) failed.push(describe(c));
  return ok;
}

function compare(v: FactValue, c: any): boolean {
  if ('eq' in c) return v === c.eq;
  if ('ne' in c) return v !== c.ne;
  if ('in' in c) return (c.in as unknown[]).includes(v);
  const [op] = Object.keys(c).filter((k) => k !== 'fact');
  const a = typeof v === 'string' ? Date.parse(v) : v;
  const b = typeof c[op] === 'string' ? Date.parse(c[op]) : c[op];
  if (op === 'gte') return a >= b;
  if (op === 'gt') return a > b;
  if (op === 'lte') return a <= b;
  if (op === 'lt') return a < b;
  return false;
}

function describe(c: any): string {
  const label = FACTS[c.fact as FactKey]?.label ?? c.fact;
  const [op] = Object.keys(c).filter((k) => k !== 'fact');
  const words: Record<string, string> = { eq: 'is', ne: 'is not', gte: 'at least', gt: 'more than', lte: 'at most', lt: 'under', in: 'one of' };
  return `${label} ${words[op] ?? op} ${JSON.stringify(c[op])}`;
}

/** The version of a rule that applies on a day (validFrom inclusive, validTo exclusive). */
export function liveVersion(versions: Rule[], today: string): Rule | undefined {
  return versions.find((r) => r.validFrom <= today && (r.validTo === null || today < r.validTo));
}

const fmtNumber = (n: number) => Number(n).toLocaleString('fi-FI', { maximumFractionDigits: 2 }).replace(/ /g, ' ').replace(/−/g, '-');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Named computations a rule may use; every output is a word or a number computed here, in code. */
export const COMPUTE: Record<string, (r: Rule, facts: Facts, today: string) => Record<string, string>> = {
  /** First deposit this month; the Nth monthly deposit lands N-1 months later. */
  aspPlan: (r, _facts, today) => {
    const n = Number(r.params.deposits);
    const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1 + (n - 1);
    return { twentiethDepositMonth: `${MONTHS.at(m % 12)} ${y + Math.floor(m / 12)}` };
  },
};

export function evaluate(versions: Rule[], facts: Facts, today: string): Evaluation {
  const id = versions[0]?.id ?? 'unknown';
  const r = liveVersion(versions, today);
  if (!r) return { ruleId: id, status: 'notLive', reasons: ['No version of this rule applies on this date'], used: [] };
  const base = { ruleId: r.id, version: r.version };
  if (daysBetween(r.source.checkedAt, today) > r.reviewDays) {
    return { ...base, status: 'stale', reasons: [`Source last checked ${r.source.checkedAt}; it must be re-checked every ${r.reviewDays} days`], used: [] };
  }
  const missing = new Set<FactKey>(), used = new Set<FactKey>(), failed: string[] = [];
  const result = test(r.when, facts, missing, used, failed);
  if (result === false) return { ...base, status: 'notEligible', reasons: failed.filter(Boolean), used: [...used] };
  if (r.timing && (today < r.timing.from || today >= r.timing.to)) {
    return { ...base, status: 'notTime', reasons: [`Raised only from ${r.timing.from} until ${r.timing.to}`], used: [...used] };
  }
  if (result === 'unknown') {
    // Ask only for facts the customer can give, in the order the rule lists its questions.
    // A fact the customer kept private is never asked again: that would be nagging.
    const askable = (Object.keys(r.ask) as FactKey[]).filter((k) => missing.has(k) && FACTS[k].origin === 'customer' && facts[k].state !== 'hidden');
    const notAskable = [...missing].filter((k) => !askable.includes(k));
    if (notAskable.length) {
      return { ...base, status: 'notEligible', reasons: notAskable.map((k) => `${FACTS[k].label}: not known (${facts[k].state})`), used: [...used] };
    }
    const k = askable[0];
    return { ...base, status: 'ask', ask: { fact: k, question: r.ask[k]! }, reasons: [`${FACTS[k].label}: ${facts[k].state}`], used: [...used] };
  }
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.params)) values[k] = typeof v === 'number' ? fmtNumber(v) : v;
  if (r.compute) Object.assign(values, COMPUTE[r.compute](r, facts, today));
  const message = r.message.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? `{${k}}`);
  return { ...base, status: 'eligible', reasons: [], used: [...used], message, values };
}

/** All rules for one customer on one day, grouped by rule id. */
export function evaluateAll(rules: Rule[], facts: Facts, today: string): Evaluation[] {
  const byId = new Map<string, Rule[]>();
  for (const r of rules) byId.set(r.id, [...(byId.get(r.id) || []), r]);
  return [...byId.values()].map((v) => evaluate(v, facts, today));
}
