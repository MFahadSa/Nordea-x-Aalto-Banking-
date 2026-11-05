// Every number Abel (or the app) shows is computed here from the synthetic data.
// The language model never invents figures: it calls tools that use these functions.
import { db } from './db.js';
import { CabinetEntry, Transaction } from '../types.js';

/** The demo runs on a fixed date so the synthetic history always lines up. */
export const DEMO_TODAY = '2026-10-23';
export const CUR_MONTH = DEMO_TODAY.slice(0, 7);

const SPEND_CATEGORIES = new Set([
  'housing', 'groceries', 'restaurants', 'transport', 'bills', 'subscriptions', 'shopping', 'pharmacy', 'other',
]);

const round = (n: number, to = 1) => Math.round(n / to) * to;

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthsBetween(fromMonth: string, toMonth: string): number {
  const [y1, m1] = fromMonth.split('-').map(Number);
  const [y2, m2] = toMonth.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function tx(userId: string): Transaction[] {
  return db.getTransactions(userId);
}

/** Spending by category for one month (positive numbers). */
export function monthSpend(userId: string, month: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tx(userId)) {
    if (t.date.slice(0, 7) !== month || t.amount >= 0 || !SPEND_CATEGORIES.has(t.category)) continue;
    out[t.category] = (out[t.category] || 0) + Math.abs(t.amount);
  }
  return out;
}

/** Average monthly spending over the last `months` full months before the current one. */
export function spending(userId: string, months = 3, category?: string) {
  const list = Array.from({ length: months }, (_, i) => addMonths(CUR_MONTH, -(i + 1)));
  const byCat: Record<string, number> = {};
  for (const m of list) {
    for (const [k, v] of Object.entries(monthSpend(userId, m))) byCat[k] = (byCat[k] || 0) + v;
  }
  for (const k of Object.keys(byCat)) byCat[k] = round(byCat[k] / months);
  const total = Object.values(byCat).reduce((a, b) => a + b, 0);
  const thisMonth = monthSpend(userId, CUR_MONTH);
  const thisMonthTotal = Object.values(thisMonth).reduce((a, b) => a + b, 0);
  if (category) {
    return { months: list, category, averagePerMonth: byCat[category] || 0, thisMonthSoFar: round(thisMonth[category] || 0) };
  }
  return { months: list, averagePerMonthByCategory: byCat, averagePerMonthTotal: round(total), thisMonthSoFarTotal: round(thisMonthTotal) };
}

export function salaryInfo(userId: string) {
  const pays = tx(userId).filter((t) => t.category === 'salary' || t.category === 'pension').sort((a, b) => a.date.localeCompare(b.date));
  if (!pays.length) return { found: false as const };
  const latest = pays[pays.length - 1];
  let changeMonth: string | null = null;
  let from = latest.amount;
  for (let i = pays.length - 1; i > 0; i--) {
    if (pays[i].amount !== pays[i - 1].amount) {
      changeMonth = pays[i].date.slice(0, 7);
      from = pays[i - 1].amount;
      break;
    }
  }
  return {
    found: true as const,
    latest: latest.amount,
    payday: Number(latest.date.slice(8, 10)),
    changed: changeMonth !== null,
    changeMonth,
    from,
    to: latest.amount,
    difference: latest.amount - from,
  };
}

export function accounts(userId: string) {
  const u = db.getUser(userId);
  if (!u) return null;
  const extra = u.extraMonthly || 0;
  return {
    current: { balance: u.accounts.current.balance, iban: u.accounts.current.iban },
    savings: {
      balance: u.accounts.savings.balance,
      iban: u.accounts.savings.iban,
      monthlyDeposit: u.accounts.savings.monthlyDeposit + extra,
    },
    carFund: u.accounts.carFund ? { balance: u.accounts.carFund.balance, iban: u.accounts.carFund.iban } : undefined,
  };
}

/** The goal the savings account counts towards: the home goal, otherwise the first active goal. */
export function primaryGoal(userId: string): CabinetEntry | undefined {
  const goals = activeGoals(userId);
  return goals.find((g) => g.goalType === 'home') || goals[0];
}

export function activeGoals(userId: string): CabinetEntry[] {
  return db
    .getCabinetEntries(userId)
    .filter((e) => e.type === 'goal' && e.status === 'active' && e.target?.amount && e.target.date >= DEMO_TODAY)
    .sort((a, b) => (a.target!.date < b.target!.date ? -1 : 1));
}

export function goalStatus(userId: string, goal: CabinetEntry) {
  const acc = accounts(userId)!;
  const isPrimary = primaryGoal(userId)?.id === goal.id;
  const saved = goal.goalType === 'car' ? acc.carFund?.balance || 0 : isPrimary ? acc.savings.balance : 0;
  const monthly = isPrimary ? acc.savings.monthlyDeposit : 0;
  const monthsLeft = Math.max(1, monthsBetween(CUR_MONTH, goal.target!.date.slice(0, 7)));
  const projected = saved + monthly * monthsLeft;
  const gap = Math.max(0, goal.target!.amount - projected);
  return {
    goalId: goal.id,
    title: goal.title,
    target: goal.target!.amount,
    targetDate: goal.target!.date,
    saved: round(saved),
    monthlyGoingIn: monthly,
    monthsLeft,
    projectedByTargetDate: round(projected),
    shortBy: round(gap, 10),
    onTrack: gap <= 0,
    extraPerMonthNeeded: gap > 0 ? round(gap / monthsLeft, 10) : 0,
    percentSaved: Math.min(100, Math.round((saved / goal.target!.amount) * 100)),
  };
}

/** Payday autopilot: what comes in, what goes out, what Abel would suggest moving. Suggest only. */
export function payPlan(userId: string, buffer = 500) {
  const sal = salaryInfo(userId);
  const sp = spending(userId, 3) as { averagePerMonthTotal: number };
  const acc = accounts(userId)!;
  const income = sal.found ? sal.latest : 0;
  const saving = acc.savings.monthlyDeposit;
  const left = income - sp.averagePerMonthTotal - saving;
  const move = Math.max(0, Math.floor(Math.min(left - buffer * 0.25, 300) / 10) * 10);
  const goal = primaryGoal(userId);
  return {
    nextPayday: sal.found ? `${CUR_MONTH}-${String(sal.payday).padStart(2, '0')}` : null,
    income,
    spendingAveragePerMonth: sp.averagePerMonthTotal,
    alreadySavingPerMonth: saving,
    leftOver: round(left, 10),
    keepInCurrentAccount: buffer,
    suggestedExtraMove: move,
    towardsGoal: goal ? goal.title : null,
    rule: 'Abel only suggests. Nothing moves without the customer confirming.',
  };
}

export function affordability(userId: string, amount: number) {
  const acc = accounts(userId)!;
  const goal = primaryGoal(userId);
  const monthly = acc.savings.monthlyDeposit;
  return {
    amount,
    savingsBalance: acc.savings.balance,
    currentBalance: acc.current.balance,
    canCoverFromSavings: acc.savings.balance >= amount,
    goalAffected: goal ? goal.title : null,
    // Only for costs the savings can cover; "660 months" for a flat's price means nothing.
    monthsOfSavingSetBack: goal && monthly > 0 && acc.savings.balance >= amount ? Math.round((amount / monthly) * 10) / 10 : null,
    ...(acc.savings.balance < amount
      ? { note: amount > (acc.savings.balance + acc.current.balance) * 3
          ? 'Far more than all savings: something this size (like a home) is paid mostly with a loan. Do not calculate months or years of saving; offer a Nordea adviser.'
          : 'More than the savings right now. Say how much is missing (amount minus savings); do not calculate months.' }
      : {}),
  };
}

/** Partner fee, computed in code from the partner manifest. */
export function partnerFee(fee: { type: string; value: number }, price: number): number {
  if (fee.type === 'percent') return Math.round(price * fee.value);
  if (fee.type === 'percentOfYear') return Math.round(price * 12 * fee.value);
  return Math.round(fee.value);
}
