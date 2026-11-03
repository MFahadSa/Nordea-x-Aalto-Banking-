/**
 * INSIGHT CARDS (owner request ts1793701491/1573/1613): a Nordea card says what the matched
 * bank data MEANS for the customer's goal and - only when the numbers support one - offers a
 * next step. Aggregates stay as evidence; they are not the insight. Pure functions: every
 * figure here is computed by code from the matched rows, so the model guard and the card text
 * cite the same numbers. No store imports - the Nordea agent passes its own matched rows in.
 *
 * Correctness rules (binding, from the Coordinator brief):
 * - Every claim must be supported by the matched data, its time coverage and the goal.
 * - Card text is strictly code-assembled from these rules; model free prose never ships as a
 *   card - labels + grounded digits still admit unsupported claims (adversarial QC 983be84).
 * - Scenarios are labeled as scenarios; an invented percentage or false precision is never a finding.
 * - Income/credits are never spending; savings transfers are not consumption.
 * - Sparse data (few rows, short coverage) says so instead of implying trends.
 */
import type { Transaction } from '../../types.js';
import { words, overlaps } from './text.js';

/** Categories that are never consumption: income and movements between the customer's own accounts. */
const NON_SPENDING = new Set(['salary', 'pension', 'savings_transfer', 'savings_transfer_in']);
/** Categories a "cut back" scenario may target - essentials (housing, bills, groceries, pharmacy) are never framed as cuttable. */
const SCENARIO_CATEGORIES = new Set(['restaurants', 'shopping', 'subscriptions', 'transport', 'other']);
/** Goal words that only name the savings CATEGORY (via text hints) never tag a transfer to the goal. */
const GENERIC_GOAL_WORDS = new Set(['save', 'saving', 'savings', 'goal', 'fund', 'money', 'transfer']);

export interface Share { name: string; total: number; sharePct: number; }

export interface InsightAnalysis {
  matched: number;          // all matched rows (evidence semantics unchanged)
  total: number;            // abs total over ALL matched rows (evidence semantics unchanged)
  spendingRows: number;     // consumption rows only
  spendingTotal: number;    // abs consumption total
  coverageMonths: number;   // distinct calendar months with at least one matched row
  firstDate: string | null;
  lastDate: string | null;
  monthlyAvg: number | null;        // whole-EUR spending average per SPENDING-covered month
  spendingMonths: number;           // distinct calendar months with at least one spending row
  changePct: number | null;         // last 3 spending months vs the 3 before, whole percent
  topCategories: Share[];           // up to 3, consumption only
  topMerchants: Share[];            // up to 3, consumption only
  savingsMonthlyAvg: number | null; // GOAL-TAGGED savings transfers per savings month (goal pace)
  genericSavings: boolean;          // savings matched only via the generic category hint - never earmarked
  /** Every figure the card text (or the model's rewrite) may cite, exactly as displayed. */
  figures: number[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const monthOf = (date: string) => date.slice(0, 7);

export function analyseMatches(matches: Transaction[], goalTitle?: string): InsightAnalysis {
  const total = r2(matches.reduce((s, t) => s + Math.abs(t.amount), 0));
  const spending = matches.filter((t) => t.amount < 0 && !NON_SPENDING.has(t.category));
  const savings = matches.filter((t) => t.category === 'savings_transfer' || t.category === 'savings_transfer_in');
  const spendingTotal = r2(spending.reduce((s, t) => s + Math.abs(t.amount), 0));
  const months = [...new Set(matches.map((t) => monthOf(t.date)))].sort();
  const coverageMonths = months.length;
  const firstDate = matches.length ? matches.map((t) => t.date).sort()[0] : null;
  const lastDate = matches.length ? matches.map((t) => t.date).sort().slice(-1)[0] : null;

  // Spending averages and trends use SPENDING-covered months: months with only transfers or
  // income never dilute the spending picture (a broad category hint can match years of them).
  const spendingMonthsList = [...new Set(spending.map((t) => monthOf(t.date)))].sort();
  const spendingMonths = spendingMonthsList.length;
  const monthlyAvg = spendingMonths && spending.length ? Math.round(spendingTotal / spendingMonths) : null;

  let changePct: number | null = null;
  if (spendingMonthsList.length >= 6) {
    const byMonth = new Map<string, number>();
    for (const t of spending) byMonth.set(monthOf(t.date), (byMonth.get(monthOf(t.date)) ?? 0) + Math.abs(t.amount));
    const recent = spendingMonthsList.slice(-3).reduce((s, m) => s + (byMonth.get(m) ?? 0), 0);
    const prior = spendingMonthsList.slice(-6, -3).reduce((s, m) => s + (byMonth.get(m) ?? 0), 0);
    if (prior > 0) changePct = Math.round(((recent - prior) / prior) * 100);
  }

  const shares = (key: (t: Transaction) => string | undefined): Share[] => {
    const sums = new Map<string, number>();
    for (const t of spending) {
      const k = key(t);
      if (k) sums.set(k, (sums.get(k) ?? 0) + Math.abs(t.amount));
    }
    return [...sums.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, tot]) => ({ name, total: r2(tot), sharePct: spendingTotal > 0 ? Math.round((tot / spendingTotal) * 100) : 0 }));
  };
  const topCategories = shares((t) => t.category);
  const topMerchants = shares((t) => t.counterparty?.trim() || undefined);

  // Goal pace comes only from transfers TAGGED to the goal (a specific goal word in the
  // description/counterparty). Generic savings transfers matched via the category hint are
  // never earmarked: they are reported as matched evidence but project no pace.
  const specificGoalWords = goalTitle ? words(goalTitle).filter((w: string) => !GENERIC_GOAL_WORDS.has(w)) : null;
  const taggedSavings = specificGoalWords
    ? savings.filter((t) => overlaps(specificGoalWords, words(`${t.description ?? ''} ${t.counterparty ?? ''}`)))
    : savings;
  const genericSavings = specificGoalWords != null && savings.length > 0 && taggedSavings.length === 0;
  const savingsMonths = [...new Set(taggedSavings.map((t) => monthOf(t.date)))].length;
  const savingsMonthlyAvg = savingsMonths && taggedSavings.length
    ? Math.round(r2(taggedSavings.reduce((s, t) => s + Math.abs(t.amount), 0)) / savingsMonths)
    : null;

  const figures: number[] = [matches.length, total];
  const push = (n: number | null) => { if (n != null && !figures.some((f) => Math.abs(f - n) < 1e-9)) figures.push(n); };
  push(spendingTotal); push(monthlyAvg); push(changePct); push(savingsMonthlyAvg); push(coverageMonths); push(spending.length); push(spendingMonths);
  for (const s of [...topCategories, ...topMerchants]) { push(s.total); push(s.sharePct); }
  return {
    matched: matches.length, total, spendingRows: spending.length, spendingTotal,
    coverageMonths, firstDate, lastDate, monthlyAvg, spendingMonths, changePct, topCategories, topMerchants,
    savingsMonthlyAvg, genericSavings, figures,
  };
}

/** A goal target parsed from the SHARED goal title only (goal details stay in the User DB;
 *  a target crosses the boundary only when the customer put it in the title). */
export interface GoalTarget { amount: number; date: string | null; }

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

export function parseTargetFromTitle(title: string): GoalTarget | null {
  const amountM = title.match(/(\d[\d\s]{0,9}\d|\d)\s*(?:€|eur\b)/i);
  if (!amountM) return null;
  const amount = Number(amountM[1].replace(/\s/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  let date: string | null = null;
  const byIso = title.match(/by\s+(\d{4}-\d{2})(?:-\d{2})?/i);
  const byName = title.match(/by\s+([a-z]+)\s+(\d{4})/i);
  if (byIso) date = byIso[1];
  else if (byName && MONTHS[byName[1].toLowerCase()]) date = `${byName[2]}-${MONTHS[byName[1].toLowerCase()]}`;
  return { amount, date };
}

export interface GoalCard {
  /** The card's headline: meaning first, a next step only when the numbers support one. */
  text: string;
  /** The supporting numbers, shown under the expandable "Evidence" - never the headline. */
  evidence: string;
  sparse: boolean;
  target: GoalTarget | null;
}

export function buildGoalCard(goalTitle: string, a: InsightAnalysis, asOfMonth?: string): GoalCard {
  const target = parseTargetFromTitle(goalTitle);
  // Sparse data says so honestly instead of implying a trend.
  if (a.matched < 4 || a.coverageMonths < 2) {
    const span = a.firstDate ? ` (${a.firstDate} to ${a.lastDate})` : '';
    return {
      sparse: true, target, evidence: '',
      text: `Only ${a.matched} matched transaction${a.matched === 1 ? '' : 's'} so far${span} - too little history to read a pattern for this goal yet. This card updates as new bank rows arrive.`,
    };
  }
  // Meaning first: the takeaway in plain words; every supporting number rides in the
  // expandable evidence block, not inline in the headline (owner's doctor/patient framing).
  const textParts: string[] = [];
  const evidenceParts: string[] = [];
  if (a.spendingRows > 0 && a.monthlyAvg != null) {
    const gapped = a.firstDate && a.lastDate
      ? (Number(a.lastDate.slice(0, 4)) * 12 + Number(a.lastDate.slice(5, 7))) - (Number(a.firstDate.slice(0, 4)) * 12 + Number(a.firstDate.slice(5, 7))) + 1 > a.coverageMonths
      : false;
    let s = `Spending linked to this goal is mostly ${a.topCategories.length ? a.topCategories[0].name : 'everyday purchases'}`;
    let ev = `It averages about ${a.monthlyAvg} EUR a month over ${a.spendingMonths} spending months (${a.spendingRows} purchases, ${a.firstDate} to ${a.lastDate}).`;
    if (a.topCategories.length) ev += ` Biggest drivers: ${a.topCategories.map((c) => `${c.name} ${c.sharePct}%`).join(', ')}.`;
    if (a.changePct != null && Math.abs(a.changePct) >= 5) {
      s += `, and it is ${a.changePct > 0 ? 'rising' : 'falling'}.`;
      ev += ` That is ${a.changePct > 0 ? 'up' : 'down'} about ${Math.abs(a.changePct)}% on the three ${gapped ? 'covered ' : ''}months before.`;
    } else if (a.changePct != null) {
      s += ', and it has been fairly steady across recent months.';
    } else {
      s += '.';
    }
    textParts.push(s);
    evidenceParts.push(ev);
  } else {
    // Matched rows but no consumption (e.g. a pure savings goal): say what the rows are.
    textParts.push('The matched rows are income and transfers between your own accounts - none of them consumption spending.');
    evidenceParts.push(`${a.matched} matched transactions over ${a.coverageMonths} months (${a.firstDate} to ${a.lastDate}).`);
  }
  // A next step is offered only when the numbers support it: a clearly cuttable category
  // with a meaningful share, sized from the code-computed average. Labeled as a scenario.
  const cut = a.topCategories.find((c) => SCENARIO_CATEGORIES.has(c.name) && c.sharePct >= 20);
  if (cut && a.monthlyAvg != null && a.monthlyAvg >= 50 && a.spendingMonths >= 2) {
    const freed = Math.round((cut.total / a.spendingMonths) / 3);
    if (freed > 0) {
      textParts.push(`Scenario: cutting ${cut.name} by a third would free about ${freed} EUR a month for this goal - an illustration from your own averages, not a recommendation you must follow.`);
      if (!a.figures.some((f) => Math.abs(f - freed) < 1e-9)) a.figures.push(freed);
    }
  }
  // Goal pace vs target: only when the shared title carries a target AND matched savings
  // transfers exist to pace against. Labeled as a projection.
  if (target && a.savingsMonthlyAvg != null && a.savingsMonthlyAvg > 0) {
    const monthsNeeded = Math.ceil(target.amount / a.savingsMonthlyAvg);
    textParts.push(`At the matched savings pace of about ${a.savingsMonthlyAvg} EUR a month, the ${target.amount} EUR target takes about ${monthsNeeded} months${target.date ? ` (goal date ${target.date})` : ''} - a projection from your goal-tagged transfers, not a promise.`);
    if (!a.figures.some((f) => Math.abs(f - target.amount) < 1e-9)) a.figures.push(target.amount);
    if (!a.figures.some((f) => Math.abs(f - monthsNeeded) < 1e-9)) a.figures.push(monthsNeeded);
  } else if (target && a.genericSavings) {
    // Honest insufficiency: generic transfers matched the category hint, not the goal.
    textParts.push('The matched savings transfers are not tagged to this goal, so no pace is projected from them.');
  }
  return { sparse: false, target, text: textParts.join(' '), evidence: evidenceParts.join(' ') };
}

/** Figure guard for the model path (mirrors the Abel reply guard): every number the model
 *  writes must be one of the code-computed figures, compared as whole numbers. */
export function figuresFromText(text: string): number[] {
  const out: number[] = [];
  // ISO dates (2026-10-01, 2027-06) are dates, not figures: strip them before counting.
  const noDates = text.replace(/\d{4}-\d{2}(-\d{2})?/g, ' ');
  for (const m of noDates.matchAll(/\d[\d\s,.]*\d|\d/g)) {
    const n = Number(m[0].replace(/[\s,]/g, ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function textFiguresGrounded(text: string, figures: number[]): boolean {
  return figuresFromText(text).every((n) => figures.some((f) => Math.abs(f - n) < 1e-9 || Math.abs(f - Math.round(n)) < 1e-9));
}

/** Label guard (defense-in-depth only, NOT claim safety): a rewrite keeping every label and
 *  only grounded digits can still carry unsupported causal/judgment/directive claims, which is
 *  why the card path ships code-assembled text only. Kept for the adversarial pins. */
export function textPreservesLabels(card: string, text: string): boolean {
  const need: string[] = [];
  if (card.includes('Scenario:')) need.push('scenario:');
  if (card.includes('a projection')) need.push('projection');
  if (card.includes('not a recommendation')) need.push('not a recommendation');
  if (card.includes('too little history')) need.push('too little');
  return need.every((w) => text.toLowerCase().includes(w));
}
