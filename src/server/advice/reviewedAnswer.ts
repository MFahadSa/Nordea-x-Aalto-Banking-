/** Reviewed catalogue context, never a replacement for the customer's task.
 * All rule numbers and explanations come from the same versioned source as cards.
 */
import { catalogue } from './guard.js';
import { intentsOf } from './intent.js';
import { declinesPartner } from './purpose.js';
import { getPartner } from '../partnerRegistry.js';
import type { Rule } from './rules.js';

/** Only the current reviewed ASP/PS catalogue can supply the exact-source prose lane. */
export function reviewedProductSentences(text: string, today: string): string[] {
  const ids = new Set<string>();
  if (/\basp\b|first home|first.home|own (?:home|place)/i.test(text)) ids.add('asp-account');
  if (/\bps\b|pitkäaikaissääst/i.test(text.replace(/\bps\s*:/gi, ''))) ids.add('ps-account');
  return catalogue().filter(r => ids.has(r.id) && r.validFrom <= today && (!r.validTo || today < r.validTo) && Date.parse(today) - Date.parse(r.source.checkedAt) <= r.reviewDays * 86400000)
    .flatMap(r => renderExplanation(r).split(/(?<=[.!?])\s+|\n+/u));
}


export function renderExplanation(rule: Rule): string {
  return (rule.explain || rule.message).replace(/\{(\w+)\}/g, (token, key) => {
    const value = rule.params[key];
    return typeof value === 'number' ? value.toLocaleString('en-IE') : String(value ?? token);
  });
}

/** `shownPartners`: partner ids whose offer card THIS turn actually shows. Partner prices and incentives are only
 *  given for those, so offers-off, dismissed or duplicate cards never reach the model as background. */
export function reviewedContext(text: string, age: number | undefined, today: string, shownPartners: ReadonlySet<string> = new Set(), displayedFollowup = false): string {
  const topics = new Set<string>();
  if (/\basp\b|first home|first.home|own (?:home|place)/i.test(text)) topics.add('asp-account');
  if (/gift tax|tax.free gift|gift.*tax|give.*(?:euros?|€).*tax|lahjavero|lahja[^.?!]{0,40}(?:euro|vero)|\b(?:mum|mom|mother|dad|father|parent)\b[^.?!]{0,50}\b(?:give|giving)\b/i.test(text)) topics.add('gift-limit');
  if (/household.*(?:credit|deduction)|(?:cleaning|renovation|labour).*(?:tax|claim)|kotitalousvähenny/i.test(text)) topics.add('household-credit');
  if (/student.loan.compensation|kela|graduat.*loan|loan.*graduat|opintolainahyv/i.test(text)) topics.add('kela-loan-writeoff');
  if (/\bps\b|pitkäaikaissääst/i.test(text.replace(/\bps\s*:/gi, ''))) topics.add('ps-account');
  if (age !== undefined && age >= 18 && age < 28 && /custody|equity savings account|trading fee|start.*invest/i.test(text)) topics.add('equity-account-under-30');
  const all = catalogue();
  // Select the currently applicable version; its 2026 explanation includes the enacted 2027 transition.
  const facts = [...topics].flatMap(id => {
    const versions = all.filter(r => r.id === id && r.validFrom <= today && (!r.validTo || today < r.validTo) && Date.parse(today) - Date.parse(r.source.checkedAt) <= r.reviewDays * 86400000);
    return versions.map(rule => `${rule.title}: ${renderExplanation(rule)} Source: ${rule.source.url} (checked ${rule.source.checkedAt}).`);
  });
  if(!declinesPartner(text,'energy')&&/\b(?:electricity|energy bill|fixed (?:versus|vs\.?|or) (?:exchange|spot))\b/iu.test(text))facts.push('ELECTRICITY EXPLANATION BOUNDARY: A fixed contract fixes the price per unit for its stated period, not the total bill: consumption and other charges can change. Exchange/spot pricing follows the market plus any stated margin. Without usage and relevant prices, do not say which is cheaper. Explain these concepts without inventing a Nordea service or offer. Current app options must come from an actually supplied partner catalogue; general market arrangements are not established app options. If no catalogue is supplied, no current commercial option or availability is verified. A saved household-work fact or a possible household tax credit is not an approved credit, and does not establish an electricity-bill discount. Do not use unrelated benefits to reduce this bill. This background does not show an offer, authorize a switch or establish customer ownership.');
  if(topics.has('household-credit'))facts.push('BENEFIT STATUS: A saved statement that the customer pays for household work supports checking a possible credit, not a decision that a credit is approved, already held or paid. The household credit is against tax for qualifying labour under the supplied rule; it is not an electricity-consumption bill discount. Keep any actual approval or paid amount unknown unless a specific current source establishes it.');
  const partnerIds = displayedFollowup ? [...shownPartners] : intentsOf(text).flatMap(intent => intent.partner && shownPartners.has(intent.partner) ? [intent.partner] : []);
  for (const partnerId of partnerIds) {
    const p = getPartner(partnerId);
    if (p) facts.push(`Fictional partner ${p.name}: ${p.kind}. Options: ${p.items.map(i => `${i.title}: ${i.sub || ''}, ${i.price} €${i.per || ''}`).join('; ')}. Incentive: ${p.feeText}. Use only these stated prices. Do not promise a free paid service, guaranteed coverage, live listings or guaranteed savings. No availability is checked; no external action occurs just by showing a card. Terms not in this manifest, including cancellation rights, exclusions and binding coverage, are unknown. Leave numeric offer terms on the actual card/list rather than restating them in chat prose; explain the difference between usage cost and monthly fee without quoting figures. The offer card has only the stated browse CTA, not an adviser link or Connect me button.`);
  }
  if(topics.has('kela-loan-writeoff'))facts.push('APPLICATION PROCESS: Kela normally decides student-loan compensation automatically after degree completion. A separate application is required for compensation based on a first-cycle university degree, within two years of completing that degree. Student-grant payment start is not the admission/attendance cohort test. Student-loan balance and bank repayment terms come from the lending bank, not a presumed Kela loan dashboard. Do not tell a new student to apply now or invent required documents. Source: https://www.kela.fi/student-loan-compensation (checked 2026-11-24).');
  if (topics.has('ps-account')) facts.push('PS means the restricted long-term savings product, not the sum of current, savings and car-fund accounts. Ordinary account balances must never be used as a PS balance. If no PS account or exact historical snapshot is provided, say personal eligibility is unknown and explain the conditional rule; do not promise withdrawal.');
  if (topics.has('asp-account')) facts.push('ASP is the Finnish home savings scheme for a first home, not "Aspiring Saver’s Plan". The bonus accrual period begins in the saving/opening year. The bonus payment happens later at purchase with the required loan; these are different dates. Never shift the five-year accrual period to the purchase year.');
  if (topics.has('ps-account')) facts.push('CONTRIBUTION RULE: eligible 2026 payments, generally combined annual cap 5,000 euros and other conditions. SPECIAL WITHDRAWAL RULE: total savings no more than 5,000 euros on 1 January 2027, and the other stated withdrawal conditions. Same number, different legal tests. Never make the contribution deduction depend on the historical balance.');
  if (shownPartners.has('energy')) facts.push('PRICE ROLES: A fixed per-kWh rate does not fix total bills: consumption and other charges can change. Fixed has usage 7.9 c/kWh plus 3.90 euros each month. Spot has variable exchange usage price plus margin 0.39 c/kWh plus 2.90 euros each month. Neither monthly fee is a total bill. Consumption and spot prices are needed for a cost comparison; do not promise savings from just the fee.');
  if (shownPartners.has('insure')) facts.push('COVERAGE ROLES: basic states contents up to 30,000 euros. Full states contents, liability and water damage, but NO full-tier contents limit or binding exclusions are supplied. Do not copy the basic limit onto full or invent a larger limit.');
  if (!facts.length) return '';
  return 'CHECKED BACKGROUND, not a reply template. Answer the actual request, use tools for personal figures, handle all topics, respect the customer’s language and CALM style and consent. Do not claim a card unless THIS TURN says it is shown. Never infer ownership, eligibility or a new goal. Do not substitute youth custody for investment advice.\n' + facts.join('\n');
}
