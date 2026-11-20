/**
 * v28: the card in a chat reply is decided by code from what the customer said, never by the AI.
 *
 * The same words always give the same card: "am I on track" gives none, "viewings" gives the homes
 * partner, "saving for a flat" the ASP question, "how do I start investing" the equity account, and so
 * on. What the customer's own words already answer ("I started at Aalto" = a student) is not asked
 * again: it is saved as their answer (with Undo) and the rule is checked with it.
 *
 * The AI is only told which card the app shows, so its words can introduce it in one sentence.
 */
import type { FactKey } from './facts.js';

export interface Intent {
  id: string;
  /** A partner offer card (partners/<id>.json). */
  partner?: string;
  /** A recommender rule (rules/<id>@…json). */
  rule?: string;
  /** What these words already answer for that rule. */
  implies?: Partial<Record<FactKey, boolean>>;
}

const HOME = String.raw`(flats?|apartments?|homes?|houses?|places?|asunto\w*)`;
const T: { id: string; re: RegExp; partner?: string; rule?: string; implies?: Intent['implies'] }[] = [
  // Partners first only where the words are about that partner's job right now.
  { id: 'home-search', partner: 'homes', re: new RegExp(String.raw`\b(viewings?|showings?|open house|listings?|for sale|asuntonäyt\w*|kotiväli)\b|\b(look(ing)?|search(ing)?|hunt(ing)?|browse|browsing|find(ing)?)\b[^.?!]{0,25}\b(at |for |a |new )?${HOME}\b`, 'i') },
  { id: 'energy', partner: 'energy', re: /\b(electricity|electric bill|power bill|energy bill|energy contract|sähkö\w*|ev charging|charging (the |my |our )?(new )?(ev|electric car|car))\b|\bcharg\w+\b[^.?!]{0,30}\b(ev|electric car)\b/i },
  { id: 'insurance', partner: 'insure', re: /\b(home|contents|flat|house|apartment)\s+insurance\b|\binsur\w+\b[^.?!]{0,25}\b(home|flat|apartment|house|contents)\b|\bkotivakuutu\w*/i },
  { id: 'moving', partner: 'movers', re: /\b(movers?|moving (house|home|out|in|to|our|my)|moving van|removal (firm|company|van)|packing (up|boxes))\b|\bmuutto\w*/i },
  // Rules: products, tax rules and state benefits.
  { id: 'studies', rule: 'kela-loan-writeoff', implies: { isHigherEducationStudent: true }, re: /\b(started|starting|start|begin|began|accepted|got (in|into|a place)|enrolled|studying|study|student)\b[^.?!]{0,40}\b(aalto|university|uni|uas|amk|ammattikorkea\w*|yliopist\w*|college|degree|bachelor|master'?s)\b|\b(aalto|helsinki|tampere|turku|oulu) (uni|university)\b|\bi'?m (a )?(university |uni )?student\b/i },
  { id: 'student-loan', rule: 'kela-loan-writeoff', re: /\b(student loan|opintolaina\w*|kela)\b/i },
  { id: 'saving-home', rule: 'asp-account', implies: { savingForHome: true }, re: new RegExp(String.raw`\b(sav(e|es|ed|ing)|put(ting)? (money )?aside|deposit)\b[^.?!]{0,30}\b(for|towards?|to buy)\b[^.?!]{0,15}\b(a |our |my |the |first )?${HOME}\b|\bfirst home\b|\basp\b`, 'i') },
  { id: 'investing', rule: 'equity-account-under-30', implies: { interestedInInvesting: true }, re: /\b(invest\w*|shares|(?:a|one|buy) share|stocks?(?!\s+(?:photos?|images?|pictures?))|index funds?|funds|etfs?|osakesäästö\w*|sijoit\w*|equity savings)\b/i },
  { id: 'family-gift', rule: 'gift-limit', implies: { helpsFamilyWithMoney: true }, re: /\b(help|helping|support|supporting|give|giving|gift|gifts|pay for)\b[^.?!]{0,40}\b(grand ?children|grand ?kids?|grandsons?|granddaughters?|children|kids|son|daughter|lapsenlap\w*)\b|\bgift tax\b|\blahjavero\b/i },
  { id: 'household-work', rule: 'household-credit', implies: { paysForHouseholdWork: true }, re: /\b(pay|paid|paying|hire|hired|hiring)\b[^.?!]{0,30}\b(cleaner|cleaning|renovat\w*|repairs?|plumber|electrician|carpenter|gardener|home care|carer)\b|\bkotitalousvähenny\w*|\bhousehold (tax )?(credit|deduction)\b/i },
  { id: 'household-ask', rule: 'household-credit', re: /\b(cleaning|cleaner|renovat\w+|home repairs?|someone to (help|clean))\b/i },
  { id: 'ps-account', rule: 'ps-account', re: /\b(ps[- ]?(account|tili|savings?)|pension saving|voluntary pension|eläkesäästö\w*)\b/i },
  { id: 'money-plan', partner: 'planner', re: /\b(financial plan(ner|ning)?|money plan|wealth (plan|planning)|retirement plan(ning)?|certified planner)\b/i },
];

/** Every intent in the customer's words, best first (the first one that can show a card wins). */
export function intentsOf(text: string): Intent[] {
  const t = String(text || '');
  // A question about progress is not a request for offers ("am I on track for the flat?").
  return T.filter((x) => x.re.test(t)).map(({ id, partner, rule, implies }) => ({ id, ...(partner ? { partner } : {}), ...(rule ? { rule } : {}), ...(implies ? { implies } : {}) }));
}
