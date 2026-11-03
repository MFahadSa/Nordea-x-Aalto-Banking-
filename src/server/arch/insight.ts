/**
 * INSIGHT CARDS (owner request ts1793701491/1573/1613): a Nordea card says what the matched
 * bank data MEANS for the customer's goal and - only when the numbers support one - offers a
 * next step. Aggregates stay as evidence; they are not the insight. Pure functions: every
 * figure here is computed by code from the matched rows, so the model guard and the card text
 * cite the same numbers. No store imports - the Nordea agent passes its own matched rows in.
 *
 * Correctness rules (binding, from the Coordinator brief):
 * - Every claim must be supported by the matched data, its time coverage and the goal.
 * - Scenarios are labeled as scenarios; an invented percentage or false precision is never a finding.
 * - Income/credits are never spending; savings transfers are not consumption.
 * - Sparse data (few rows, short coverage) says so instead of implying trends.
 */
import type { Transaction } from '../../types.js';

/** Categories that are never consumption: income and movements between the customer's own accounts. */
const NON_SPENDING = new Set(['salary', 'pension', 'savings_transfer', 'savings_transfer_in']);
/** Categories a "cut back" scenario may target - essentials (housing, bills, groceries, pharmacy) are never framed as cuttable. */
const SCENARIO_CATEGORIES = new Set(['restaurants', 'shopping', 'subscriptions', 'transport', 'other']);

export interface Share { name: string; total: number; sharePct: number; }

export interface InsightAnalysis {
  matched: number;          // all matched rows (evidence semantics unchanged)
  total: number;            // abs total over ALL matched rows (evidence semantics unchanged)
  spendingRows: number;     // consumption rows only
  spendingTotal: number;    // abs consumption total
  coverageMonths: number;   // distinct calendar months with at least one matched row
  firstDate: string | null;
  lastDate: string | null;
  monthlyAvg: number | null;        // whole-EUR spending average per covered month
  changePct: number | null;         // last 3 covered months vs the 3 before, whole percent
  topCategories: Share[];           // up to 3, consumption only
  topMerchants: Share[];            // up to 3, consumption only
  savingsMonthlyAvg: number | null; // matched savings transfers per covered month (goal pace)
  /** Every figure the card text (or the model's rewrite) may cite, exactly as displayed. */
  figures: number[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const monthOf = (date: string) => date.slice(0, 7);

export function analyseMatches(matches: Transaction[]): InsightAnalysis {
  const total = r2(matches.reduce((s, t) => s + Math.abs(t.amount), 0));
  const spending = matches.filter((t) => t.amount < 0 && !NON_SPENDING.has(t.category));
  const savings = matches.filter((t) => t.category === 'savings_transfer' || t.category === 'savings_transfer_in');
  const spendingTotal = r2(spending.reduce((s, t) => s + Math.abs(t.amount), 0));
  const months = [...new Set(matches.map((t) => monthOf(t.date)))].sort();
  const coverageMonths = months.length;
  const firstDate = matches.length ? matches.map((t) => t.date).sort()[0] : null;
  const lastDate = matches.length ? matches.map((t) => t.date).sort().slice(-1)[0] : null;

  const monthlyAvg = coverageMonths && spending.length ? Math.round(spendingTotal / coverageMonths) : null;

  let changePct: number | null = null;
  if (months.length >= 6) {
    const byMonth = new Map<string, number>();
    for (const t of spending) byMonth.set(monthOf(t.date), (byMonth.get(monthOf(t.date)) ?? 0) + Math.abs(t.amount));
    const recent = months.slice(-3).reduce((s, m) => s + (byMonth.get(m) ?? 0), 0);
    const prior = months.slice(-6, -3).reduce((s, m) => s + (byMonth.get(m) ?? 0), 0);
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

  const savingsMonthlyAvg = coverageMonths && savings.length
    ? Math.round(r2(savings.reduce((s, t) => s + Math.abs(t.amount), 0)) / coverageMonths)
    : null;

  const figures: number[] = [matches.length, total];
  const push = (n: number | null) => { if (n != null && !figures.some((f) => Math.abs(f - n) < 1e-9)) figures.push(n); };
  push(spendingTotal); push(monthlyAvg); push(changePct); push(savingsMonthlyAvg); push(coverageMonths); push(spending.length);
  for (const s of [...topCategories, ...topMerchants]) { push(s.total); push(s.sharePct); }
  return {
    matched: matches.length, total, spendingRows: spending.length, spendingTotal,
    coverageMonths, firstDate, lastDate, monthlyAvg, changePct, topCategories, topMerchants,
    savingsMonthlyAvg, figures,
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
  /** The card's main text: meaning first, next step only when the numbers support one. */
  text: string;
  sparse: boolean;
  target: GoalTarget | null;
}

export function buildGoalCard(goalTitle: string, a: InsightAnalysis, asOfMonth?: string): GoalCard {
  const target = parseTargetFromTitle(goalTitle);
  // Sparse data says so honestly instead of implying a trend.
  if (a.matched < 4 || a.coverageMonths < 2) {
    const span = a.firstDate ? ` (${a.firstDate} to ${a.lastDate})` : '';
    return {
      sparse: true, target,
      text: `Only ${a.matched} matched transaction${a.matched === 1 ? '' : 's'} so far${span} - too little history to read a pattern for this goal yet. This card updates as new bank rows arrive.`,
    };
  }
  const parts: string[] = [];
  if (a.spendingRows > 0 && a.monthlyAvg != null) {
    let s = `Spending linked to this goal averages about ${a.monthlyAvg} EUR a month over ${a.coverageMonths} months (${a.spendingRows} purchases, ${a.firstDate} to ${a.lastDate}).`;
    if (a.topCategories.length) {
      s += ` Biggest drivers: ${a.topCategories.map((c) => `${c.name} ${c.sharePct}%`).join(', ')}.`;
    }
    if (a.changePct != null && Math.abs(a.changePct) >= 5) {
      const gapped = a.firstDate && a.lastDate
        ? (Number(a.lastDate.slice(0, 4)) * 12 + Number(a.lastDate.slice(5, 7))) - (Number(a.firstDate.slice(0, 4)) * 12 + Number(a.firstDate.slice(5, 7))) + 1 > a.coverageMonths
        : false;
      s += ` That is ${a.changePct > 0 ? 'up' : 'down'} about ${Math.abs(a.changePct)}% on the three ${gapped ? 'covered ' : ''}months before.`;
    } else if (a.changePct != null) {
      s += ` That has been fairly steady across recent months.`;
    }
    parts.push(s);
  } else {
    // Matched rows but no consumption (e.g. a pure savings goal): say what the rows are.
    parts.push(`${a.matched} matched transactions over ${a.coverageMonths} months (${a.firstDate} to ${a.lastDate}), none of them consumption spending - income and transfers between your own accounts are not spending.`);
  }
  // A next step is offered only when the numbers support it: a clearly cuttable category
  // with a meaningful share, sized from the code-computed average. Labeled as a scenario.
  const cut = a.topCategories.find((c) => SCENARIO_CATEGORIES.has(c.name) && c.sharePct >= 20);
  if (cut && a.monthlyAvg != null && a.monthlyAvg >= 50 && a.coverageMonths >= 2) {
    const freed = Math.round((cut.total / a.coverageMonths) / 3);
    if (freed > 0) {
      parts.push(`Scenario: cutting ${cut.name} by a third would free about ${freed} EUR a month for this goal - an illustration from your own averages, not a recommendation you must follow.`);
      if (!a.figures.some((f) => Math.abs(f - freed) < 1e-9)) a.figures.push(freed);
    }
  }
  // Goal pace vs target: only when the shared title carries a target AND matched savings
  // transfers exist to pace against. Labeled as a projection.
  if (target && a.savingsMonthlyAvg != null && a.savingsMonthlyAvg > 0) {
    const monthsNeeded = Math.ceil(target.amount / a.savingsMonthlyAvg);
    parts.push(`At the matched savings pace of about ${a.savingsMonthlyAvg} EUR a month, the ${target.amount} EUR target takes about ${monthsNeeded} months${target.date ? ` (goal date ${target.date})` : ''} - a projection from your matched transfers, not a promise.`);
    if (!a.figures.some((f) => Math.abs(f - target.amount) < 1e-9)) a.figures.push(target.amount);
    if (!a.figures.some((f) => Math.abs(f - monthsNeeded) < 1e-9)) a.figures.push(monthsNeeded);
  }
  return { sparse: false, target, text: parts.join(' ') };
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
