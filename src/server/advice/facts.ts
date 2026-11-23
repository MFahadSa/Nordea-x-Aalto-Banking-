/**
 * v25: facts the recommender may reason with. Each fact has a source, an as-of date and a state;
 * "unknown" is a real value and is never turned into a guess. Health and other special-category
 * data are not in this catalogue at all, so no rule can ever depend on them.
 */
import type { BankAccount, BalanceSnapshot, CabinetEntry, Transaction, User } from '../../types.js';

export type FactType = 'boolean' | 'number' | 'date' | 'string';
export type FactOrigin = 'nordea' | 'customer';
export type FactValue = boolean | number | string;
export type FactState = 'known' | 'unknown' | 'stale' | 'conflict' | 'hidden';

export interface FactSpec { type: FactType; origin: FactOrigin; label: string }

/** Every fact a rule may use. Adding one here is the only way a rule can see new data. */
export const FACTS = {
  age: { type: 'number', origin: 'nordea', label: 'Age' },
  incomeType: { type: 'string', origin: 'nordea', label: 'Main income (salary, pension, student aid, none)' },
  paysRent: { type: 'boolean', origin: 'nordea', label: 'Pays rent' },
  savesMonthly: { type: 'boolean', origin: 'nordea', label: 'Saves every month' },
  hasAspAccount: { type: 'boolean', origin: 'nordea', label: 'Has an ASP account' },
  hasPsAccount: { type: 'boolean', origin: 'nordea', label: 'Has a PS account' },
  psBalanceAt2027Start: { type: 'number', origin: 'nordea', label: 'PS balance on 1 January 2027' },
  psBalance: { type: 'number', origin: 'nordea', label: 'PS account balance' },
  hasEquitySavingsAccount: { type: 'boolean', origin: 'nordea', label: 'Has an equity savings account' },
  savingForHome: { type: 'boolean', origin: 'customer', label: 'Saving towards a home' },
  everOwnedHalfOfHome: { type: 'boolean', origin: 'customer', label: 'Has owned half or more of a home' },
  helpsFamilyWithMoney: { type: 'boolean', origin: 'customer', label: 'Helps children or grandchildren with money' },
  paysForHouseholdWork: { type: 'boolean', origin: 'customer', label: 'Pays for cleaning, care or renovation work at home' },
  isHigherEducationStudent: { type: 'boolean', origin: 'customer', label: 'Studies at a university or UAS' },
  firstAttendanceDate: { type: 'date', origin: 'customer', label: 'First registration as attending higher education' },
  firstStudyPlaceDate: { type: 'date', origin: 'customer', label: 'Date of first higher-education study place' },
  interestedInInvesting: { type: 'boolean', origin: 'customer', label: 'Interested in investing in shares or funds' },
  psWithdrawalsStarted: { type: 'boolean', origin: 'customer', label: 'Has started regular PS withdrawals' },
} as const satisfies Record<string, FactSpec>;

export type FactKey = keyof typeof FACTS;
export const FACT_KEYS = Object.keys(FACTS) as FactKey[];
export const isFactKey = (k: string): k is FactKey => Object.prototype.hasOwnProperty.call(FACTS, k);

export interface Fact {
  key: FactKey;
  state: FactState;
  value: FactValue | null;
  /** Where it came from, in words the customer would recognise. */
  from: string;
  asOf?: string;
  entryIds?: string[];
}
export type Facts = Record<FactKey, Fact>;

/** A customer's answer is trusted for this long; after that Nora asks again. */
export const ANSWER_MAX_AGE_DAYS = 365;

export interface FactInputs {
  user: User | undefined;
  entries: CabinetEntry[];
  transactions: Transaction[];
  bankAccounts: BankAccount[];
  balances: BalanceSnapshot[];
  /** Who will read these facts; entries not readable for it stay hidden. */
  purpose: 'abel';
  today: string; // YYYY-MM-DD
}

const unknown = (key: FactKey, state: FactState = 'unknown', from = ''): Fact => ({ key, state, value: null, from });
const known = (key: FactKey, value: FactValue, from: string, asOf?: string, entryIds?: string[]): Fact =>
  ({ key, state: 'known', value, from, asOf, entryIds });

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5);
}

/** Customer answers live in the cabinet as fact entries carrying a factKey and a factValue. */
export function readable(e: CabinetEntry, purpose: 'abel'): boolean {
  return e.status !== 'archived' && !e.private && e.readableBy?.[purpose] === true;
}

export function buildFacts(x: FactInputs): Facts {
  const facts = Object.fromEntries(FACT_KEYS.map((k) => [k, unknown(k)])) as Facts;
  const u = x.user;
  if (!u) return facts;
  const today = x.today;

  // ---- From Nordea's own records ----
  if (Number.isFinite(u.age)) facts.age = known('age', u.age, 'Nordea customer record');

  const recent = x.transactions.filter((t) => daysBetween(t.date, today) >= 0 && daysBetween(t.date, today) <= 92);
  if (x.transactions.length) {
    const studentAid = recent.some((t) => t.amount > 0 && /kela|opintotuki|student aid/i.test(t.description || ''));
    const income = recent.some((t) => t.category === 'salary') ? 'salary'
      : recent.some((t) => t.category === 'pension') ? 'pension'
      : studentAid ? 'student_aid' : 'none';
    facts.incomeType = known('incomeType', income, 'Payments into your Nordea account, last 3 months');
    facts.paysRent = known('paysRent', recent.some((t) => t.category === 'housing' && t.amount < 0 && /rent|vuokra/i.test(t.description || '')), 'Your Nordea payments, last 3 months');
    facts.savesMonthly = known('savesMonthly', recent.filter((t) => t.category === 'savings_transfer' && t.amount < 0).length >= 2, 'Your Nordea transfers, last 3 months');
  }

  // Nordea knows every product it holds for the customer: absence from the list means "no".
  const accounts = x.bankAccounts;
  const hasType = (re: RegExp) => accounts.some((a) => re.test(a.type || ''));
  const products = 'Your Nordea accounts';
  facts.hasAspAccount = known('hasAspAccount', hasType(/\basp\b/i), products);
  const ps = accounts.find((a) => /^ps\b|long-term savings|pitkäaikaissäästö/i.test(a.type || ''));
  facts.hasPsAccount = known('hasPsAccount', !!ps, products);
  if (ps) {
    const snap = x.balances.filter((b) => b.accountKey === ps.key && b.at.slice(0, 10) <= today).sort((a, b) => b.at.localeCompare(a.at))[0];
    if (snap) facts.psBalance = known('psBalance', snap.balance, 'PS account balance', snap.at.slice(0, 10));
    // Never substitute a later balance for the statutory snapshot date.
    const start = x.balances.filter((b) => b.accountKey === ps.key && b.at.slice(0, 10) === '2027-01-01' && b.at.slice(0, 10) <= today).sort((a, b) => b.at.localeCompare(a.at))[0];
    if (start) facts.psBalanceAt2027Start = known('psBalanceAt2027Start', start.balance, 'PS balance on 1 January 2027', '2027-01-01');
  }
  facts.hasEquitySavingsAccount = known('hasEquitySavingsAccount', hasType(/equity savings|osakesäästö/i), products);

  // ---- From what the customer told us (Context Cabinet) ----
  const answers = new Map<FactKey, CabinetEntry[]>();
  const hiddenKeys = new Set<FactKey>();
  for (const e of x.entries) {
    const k = e.factKey;
    if (!k || !isFactKey(k)) continue;
    if (e.status === 'archived') continue; // removed: as if never said
    if (!readable(e, x.purpose)) { hiddenKeys.add(k); continue; }
    if (!answers.has(k)) answers.set(k, []);
    answers.get(k)!.push(e);
  }
  for (const [k, list] of answers) {
    const spec = FACTS[k];
    const fresh = list.filter((e) => daysBetween(e.updatedAt || e.createdAt, today) <= ANSWER_MAX_AGE_DAYS);
    if (!fresh.length) { facts[k] = { ...unknown(k, 'stale', 'You told us over a year ago'), entryIds: list.map((e) => e.id) }; continue; }
    const values = [...new Set(fresh.map((e) => JSON.stringify(e.factValue)))];
    if (values.length > 1) { facts[k] = { ...unknown(k, 'conflict', 'Your answers disagree'), entryIds: fresh.map((e) => e.id) }; continue; }
    const v = fresh[0].factValue;
    if (!validValue(spec.type, v)) continue;
    const newest = fresh.map((e) => (e.updatedAt || e.createdAt).slice(0, 10)).sort().at(-1);
    facts[k] = known(k, v, 'You told us', newest, fresh.map((e) => e.id));
  }
  for (const k of hiddenKeys) if (facts[k].state === 'unknown') facts[k] = unknown(k, 'hidden', 'You kept this private');

  // A home goal the customer saved means they are saving towards a home (unless they answered otherwise).
  if (facts.savingForHome.state === 'unknown') {
    const home = x.entries.find((e) => e.type === 'goal' && e.goalType === 'home' && e.status === 'active' && readable(e, x.purpose));
    if (home) facts.savingForHome = known('savingForHome', true, `Your goal “${home.title}”`, (home.updatedAt || home.createdAt).slice(0, 10), [home.id]);
  }
  return facts;
}

export function validValue(type: FactType, v: unknown): v is FactValue {
  if (type === 'boolean') return typeof v === 'boolean';
  if (type === 'number') return typeof v === 'number' && Number.isFinite(v);
  if (type === 'date') return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  return typeof v === 'string' && v.length > 0;
}

/** Facts for tests and fixtures: given values are known, everything else unknown. */
export function factsFrom(values: Partial<Record<FactKey, FactValue | null>>): Facts {
  const f = Object.fromEntries(FACT_KEYS.map((k) => [k, unknown(k)])) as Facts;
  for (const [k, v] of Object.entries(values)) {
    if (!isFactKey(k)) throw new Error(`unknown fact ${k}`);
    if (v !== null && v !== undefined) f[k] = known(k, v, 'test');
  }
  return f;
}
