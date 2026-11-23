/** Reviewed educational answers for the known product/tax paths.
 * Kept outside model prose: dates, thresholds and partner claims must not drift.
 * This does not determine personal eligibility, create a product or execute a payment.
 */
import { intentsOf } from './intent.js';
import type { MessageCard } from '../../types.js';

export interface GoalFigures { goalType?: string; target: number; saved: number; remainingToTargetNow: number }
export function reviewedAnswer(text: string, cards: MessageCard[], goals: GoalFigures[] = []): string | null {
  const intent = intentsOf(text)[0];
  if (!intent) return null;
  const card = cards[0];
  const question = card?.type === 'ask_fact' ? ' The question below checks one part of eligibility; it does not confirm that you qualify.' : '';
  const intro = card?.type === 'opportunity' ? ' The source and conditions are on the suggestion below.' : '';
  const euro = (n: number) => n.toLocaleString('en-IE', { maximumFractionDigits: 2 }) + ' €';
  if (intent.rule === 'gift-limit') return 'For gifts received in Finland from 2026, gifts totalling less than 7,500 € from the same donor to the same recipient over a rolling three-year period can be exempt. At 7,500 € or more, gift tax applies to the combined taxable value, not just the excess. Earlier gifts and their dates matter. Use Vero to check the tax and filing requirements; I have not filed anything. Source: https://www.vero.fi/en/individuals/property/gifts/when-do-i-need-to-pay-gift-tax/' + intro;
  if (intent.rule === 'household-credit') return 'For qualifying company labour including VAT in 2026 and 2027, the household credit is 40%, less a 150 € annual own liability, up to 2,100 € per person per year. It reduces tax, not taxable income, and is limited by the tax available. Materials and travel do not qualify; the company must be in the prepayment register and the work must qualify. For example, 600 € of eligible labour with no other claims gives 600 × 40% − 150 = 90 € before other applicable limits. This is not a guaranteed refund or a filed claim.' + intro;
  if (intent.rule === 'kela-loan-writeoff') return 'Kela student-loan compensation may repay part of an eligible higher-education loan if its conditions are met. Normally it concerns the first completed higher-education degree, first admission or attendance from 1 August 2014, and completion within Kela’s deadline, including accepted extensions. Compensation is 40% of eligible outstanding loan above 2,500 €, with degree-based caps, not 40% of the whole loan. Earlier admission with first attendance from that date can also qualify. This is separate from student-aid income tests and repayment breaks. Kela confirms eligibility and application requirements.' + question + intro;
  if (intent.rule === 'ps-account') return '2026 is the last year for eligible PS contributions to qualify for a deduction, generally within a combined 5,000 € annual cap with voluntary individual pension insurance and other conditions. It is contributions, not the existing balance, and a deduction is not the same as cash back. Payments from 1 January 2027 are not deductible. If total PS savings were no more than 5,000 € on 1 January 2027 and scheduled retirement withdrawals have not begun, the whole balance may qualify for withdrawal in 2027 or 2028 without punitive tax uplift. Normal tax still applies, so it is not tax-free. Today’s balance alone does not establish that historical test. Check the provider’s records and personal eligibility before paying in or withdrawing.' + intro;
  if (intent.rule === 'equity-account-under-30') return 'Nordea’s youth custody exemption is for ages 18–27, or under 28. Trading fees and other possible charges still apply, so it is not fee-free investing. An equity savings account holds shares, not funds. Free investment advice is a separate service, not a promise that an adviser will select stocks for you. Your eligibility and the current price list still need checking.' + question + intro;
  if (intent.rule === 'asp-account') {
    const g = goals.find(g => g.goalType === 'home');
    const balance = g ? ` On the goal figures available to me, ${euro(g.target)} minus ${euro(g.saved)} saved leaves ${euro(g.remainingToTargetNow)} to save today, before future deposits. This is different from a projected shortfall at the target date.` : '';
    return 'ASP is worth checking for a first home. Since 1 June 2026 the minimum opening age is 15 and there is no upper opening age. Qualifying first-home ownership and saving conditions apply, with guardian and funding conditions for minors. Nordea describes 1% tax-free deposit interest plus a conditional 4% bonus for the opening year and following five calendar years. The bonus is paid when qualifying home-purchase and borrowing conditions are met, not immediately on opening. I have not opened an account.' + balance + question + intro;
  }
  if (intent.partner) {
    // Do not claim an offer exists if consent/settings/duplicate guards blocked it.
    if (!card || card.type !== 'offer' || card.data?.partnerId !== intent.partner) return null;
    const answers: Record<string, string> = {
      homes: 'You can explore the fictional Kotiväli example homes below. These are not live listings or a mortgage/affordability assessment, and a deposit alone does not establish what you can buy. The card shows the referral incentive. See homes opens the examples; nothing is bought.',
      movers: 'Moving on a deadline sounds stressful. The fictional Kantaja offer below includes moving and packing examples. The card discloses the referral incentive; See prices opens the options. Availability has not been checked and nothing is booked.',
      insure: 'For a flat, check contents and liability cover, and who is responsible for the building. The fictional Peitto examples below are not guaranteed coverage: exclusions, excesses and limits need checking in policy terms. A preference for low-risk saving does not determine insurance needs. The card shows the referral incentive; See cover opens example options. You are not insured by this conversation.',
      planner: 'Vakaa is a fictional paid planning offer, not a verified free session. Its examples cost 120 € for a one-hour plan or 290 € for a fuller plan with follow-ups. The card shows the referral incentive; See plans opens the options before any choice. A free Nordea adviser is a separate alternative. Nothing is booked.',
      energy: 'You can compare the fictional Lumivalo examples below. They are not live market quotes or guaranteed savings. Compare unit prices, standing charges and terms against your current tariff and usage. The card shows the referral incentive; See prices opens the examples. No contract is switched.',
    };
    return answers[intent.partner] || null;
  }
  return null;
}
