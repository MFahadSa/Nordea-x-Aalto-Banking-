// What belongs to a home-loan case (no imports, so Abel and the cases module can both use it).
import type { CabinetEntry } from '../../types.js';

export const LOAN_WORDS = /\b(flat|apartment|home|house|mortgage|loan|kalasatama|deposit)\b/i;
// v28: only what a home-loan adviser needs: the home, income and job, debts, rent and the cash buffer.
// Spending notes ("eating out more"), saving preferences and life events like a wedding stay out: the bank's
// code computes affordability from the account data itself.
const LOAN_RELEVANT = /\b(flat|apartment|home|house|mortgage|loan|deposit|kalasatama|viewing|salary|payslip|net pay|gross|income|raise|bonus|job|joint|debt|buffer|rent)\b/i;

/** Only what matters for a home-loan pre-approval ("only what is useful"): the home goal, income, savings,
 *  spending changes, the flat itself, a partner's part. A car goal or a holiday stays out of the case. */
export function relevantForLoan(entries: CabinetEntry[]): CabinetEntry[] {
  return entries.filter((e) => (e.type === 'goal' ? e.goalType === 'home' || /\b(flat|apartment|home|house|deposit)\b/i.test(e.title) : LOAN_RELEVANT.test(`${e.title} ${e.detail}`)));
}
export const isLoanContext = (text: string) => LOAN_WORDS.test(text);
