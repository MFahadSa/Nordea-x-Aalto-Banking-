/** Reviewed catalogue context, never a replacement for the customer's task.
 * All rule numbers and explanations come from the same versioned source as cards.
 */
import { catalogue } from './guard.js';
import { intentsOf } from './intent.js';
import { getPartner } from '../partnerRegistry.js';
import type { Rule } from './rules.js';

export function renderExplanation(rule: Rule): string {
  return (rule.explain || rule.message).replace(/\{(\w+)\}/g, (token, key) => {
    const value = rule.params[key];
    return typeof value === 'number' ? value.toLocaleString('en-IE') : String(value ?? token);
  });
}

export function reviewedContext(text: string, age: number | undefined, today: string): string {
  const topics = new Set<string>();
  if (/\basp\b|first home/i.test(text)) topics.add('asp-account');
  if (/gift tax|tax.free gift|gift.*tax|give.*(?:euros?|€).*tax|lahjavero/i.test(text)) topics.add('gift-limit');
  if (/household.*(?:credit|deduction)|(?:cleaning|renovation|labour).*(?:tax|claim)|kotitalousvähenny/i.test(text)) topics.add('household-credit');
  if (/student.loan.compensation|kela|graduat.*loan|loan.*graduat|opintolainahyv/i.test(text)) topics.add('kela-loan-writeoff');
  if (/\bps[- ]?(?:account|saving|tili)|pension saving/i.test(text)) topics.add('ps-account');
  if (age !== undefined && age >= 18 && age < 28 && /custody|equity savings account|trading fee|start.*invest/i.test(text)) topics.add('equity-account-under-30');
  const all = catalogue();
  // Future-effective PS transition belongs to a 2026 question about 2027 too.
  const facts = [...topics].flatMap(id => {
    const versions = all.filter(r => r.id === id && r.validFrom <= today && (!r.validTo || today < r.validTo) && Date.parse(today) - Date.parse(r.source.checkedAt) <= r.reviewDays * 86400000);
    return versions.map(rule => `${rule.title}: ${renderExplanation(rule)} Source: ${rule.source.url} (checked ${rule.source.checkedAt}).`);
  });
  for (const intent of intentsOf(text)) if (intent.partner) {
    const p = getPartner(intent.partner);
    if (p) facts.push(`Fictional partner ${p.name}: ${p.kind}. Options: ${p.items.map(i => `${i.title}, ${i.price} €`).join('; ')}. Incentive: ${p.feeText}. Use only these stated prices. Do not promise a free paid service, guaranteed coverage, live listings or guaranteed savings. No availability is checked; no external action occurs just by showing a card.`);
  }
  if (!facts.length) return '';
  return 'CHECKED BACKGROUND, not a reply template. Answer the actual request, use tools for personal figures, handle all topics, respect the customer’s language and CALM style and consent. Do not claim a card unless THIS TURN says it is shown. Never infer ownership, eligibility or a new goal. Do not substitute youth custody for investment advice.\n' + facts.join('\n');
}
