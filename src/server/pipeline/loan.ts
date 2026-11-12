// What belongs to a home-loan case (no imports, so Abel and the cases module can both use it).
import type { CabinetEntry } from '../../types.js';

export const LOAN_WORDS = /\b(flat|apartment|home|house|mortgage|loan|kalasatama|deposit)\b/i;
const LOAN_RELEVANT = /\b(flat|apartment|home|house|mortgage|loan|deposit|kalasatama|espoo|helsinki|viewing|salary|payslip|income|raise|job|partner|mia|joint|debt|buffer|savings?|spending|eating out|restaurants?|budget|rent)\b/i;

/** Only what matters for a home-loan pre-approval ("only what is useful"): the home goal, income, savings,
 *  spending changes, the flat itself, a partner's part. A car goal or a holiday stays out of the case. */
export function relevantForLoan(entries: CabinetEntry[]): CabinetEntry[] {
  return entries.filter((e) => (e.type === 'goal' ? e.goalType === 'home' || /\b(flat|apartment|home|house|deposit)\b/i.test(e.title) : LOAN_RELEVANT.test(`${e.title} ${e.detail}`)));
}
export const isLoanContext = (text: string) => LOAN_WORDS.test(text);
