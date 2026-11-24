/**
 * "Because you are a student, …": the reasons from About you that Nora gives with a recommendation.
 * Code decides which reasons are true (from the About you box) and which fit the question. The model chooses
 * its words; if it leaves the reason out, code puts it in front. A reason is only ever a status or a plan
 * from the box, never an amount.
 */
import type { CabinetEntry } from '../types.js';
import { inferValues, type FieldKey } from '../aboutParts.js';
import { bankPicture } from './aboutBank.js';

export interface AboutReason { key: FieldKey; phrase: string; from: 'you' | 'nordea' }

const live = (e: CabinetEntry) => e.status !== 'archived' && e.status !== 'disputed';
const PHRASES: Partial<Record<FieldKey, Record<string, string>>> = {
  work: { Studying: 'you are a student', Both: 'you are a student who also works', 'Between jobs': 'you are between jobs', Retired: 'you are retired', Working: 'you are working' },
  home: { Rents: 'you rent your home', Owns: 'you own your home', 'With parents': 'you live with your parents', 'Student housing': 'you live in student housing' },
  plans: { 'A home': 'you plan to buy a home', Travel: 'you plan to travel', Studies: 'you plan to study', Wedding: 'you are planning a wedding', Baby: 'you are planning for a baby', Car: 'you plan to get a car', 'A buffer': 'you want a safety buffer' },
  risk: { 'Keep it safe': 'you like to keep your savings safe', 'A little': 'you are OK with a little risk', Comfortable: 'you are comfortable with risk' },
  interests: { 'Investing basics': 'you want to learn about investing', Saving: 'you are interested in saving', 'Buying a home': 'you are interested in buying a home', Taxes: 'you are interested in taxes', Pensions: 'you are interested in pensions', Budgeting: 'you are interested in budgeting' },
};

/**
 * The reasons that hold now. `shared` are the entries Nora may read; `all` are the customer's entries.
 * Nordea's own lines in the box (work, home) count while the customer has not answered that field. A field the
 * customer answered but does not share gives no reason, and never falls back to the bank's line.
 */
export function aboutReasons(userId: string, shared: CabinetEntry[], all: CabinetEntry[]): AboutReason[] {
  const out: AboutReason[] = [];
  const bank = bankPicture(userId).lines;
  for (const key of Object.keys(PHRASES) as FieldKey[]) {
    const answered = all.some((e) => e.aboutPart === key && live(e));
    const e = shared.filter((x) => x.aboutPart === key && live(x)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const line = !answered && (key === 'work' || key === 'home') ? bank.find((l) => l.key === key) : undefined;
    const values = e ? (e.aboutValues?.length ? e.aboutValues : inferValues(key, e.detail)) : line ? (line.values.length ? line.values : inferValues(key, line.text)) : [];
    for (const v of values) {
      const phrase = PHRASES[key]?.[v];
      if (phrase) out.push({ key, phrase, from: e && e.source !== 'nordea' ? 'you' : 'nordea' });
    }
  }
  return out;
}

const TOPICS: { re: RegExp; order: RegExp[] }[] = [
  { re: /\b(?:home|house|flat|apartment|mortgage|home loan|asp|rent|moving|insurance)\b/i, order: [/buy a home/, /own your home|rent your home|live (?:with|in)/, /student|retired|between jobs/, /working/] },
  { re: /\b(?:invest\w*|funds?|shares?|stocks?|equity|risk)\b/i, order: [/student|retired|between jobs/, /savings safe|risk/, /learn about investing/, /plan/] },
  { re: /\b(?:travel|trip|holiday|gold package)\b/i, order: [/travel/, /student|retired|between jobs/, /savings safe/] },
  { re: /\b(?:sav(?:e|es|ing|ings)|buffer|budget\w*|spend\w*|money|account|card|loan|credit|benefits?|cost|costs|pay|bills?|subscriptions?|tax(?:es)?|pension|bank(?:ing)?|offers?|product|plan|plans|goals?|focus|month|finances?|financial(?:ly)?|salary|income)\b/i, order: [/student|retired|between jobs/, /buy a home|travel|wedding|baby|car\b|buffer|plan to study/, /savings safe|risk/] },
];
const ASKS = /\b(?:recommend\w*|suggest(?:ion|ions|s)?|any advice|your advice|advise me|should (?:i|we)\b|what would you (?:do|choose|pick)|which (?:[\w-]+ ){0,3}(?:account|fund|card|loan|insurance|option|package|way|one)\b|best (?:way|option|account|card|fund|loan|insurance|place|choice)|(?:good|right|best|suitable|fits?|suits?) (?:for )?me\b|for my situation|worth it|how (?:can|do|should|could) (?:i|we) (?:start|begin|save|invest|budget|cut|spend less)|(?:my|the) (?:safest|best) (?:options?|ways?)|safest ways?)/i;
/** Reads, recalls and orders are not recommendation requests, whatever nouns they contain. */
const NOT = /\b(?:did you|you (?:said|told|recommended|suggested)|remind me|do you (?:know|remember)|scam|fraud|stolen|lost my card|suspicious)\b|^\s*(?:please\s+)?(?:transfer|move|remember|save this|forget|remove|delete|undo)\b/i;

/** Does the customer ask what to do, choose or get, about their money? */
export function recommendationRequest(text: string): boolean {
  return ASKS.test(text) && !NOT.test(text) && TOPICS.some((t) => t.re.test(text));
}

/** The reasons that fit this question, best first. */
export function reasonsFor(text: string, reasons: AboutReason[]): AboutReason[] {
  const topic = TOPICS.find((t) => t.re.test(text));
  if (!topic) return [];
  const rank = (r: AboutReason) => topic.order.findIndex((re) => re.test(r.phrase));
  return reasons.filter((r) => rank(r) >= 0).sort((a, b) => rank(a) - rank(b));
}

const LEAD = /\b(?:because|since|as) you(?:['’]re|['’]ve|\b)/i;
export const givesReason = (text: string) => LEAD.test(text.split(/(?<=[.!?])\s+/).slice(0, 2).join(' '));

/** A claim about who the customer is that the box does not support ("Because you are a student" for someone who is not). */
const STATUS: { re: RegExp; has: RegExp; what: string }[] = [
  { re: /\bstudent\b|\bstud(?:y|ying)\b/i, has: /student|plan to study/, what: 'a student' },
  { re: /\bretired\b|\bpensioner\b/i, has: /retired/, what: 'retired' },
  { re: /\brent(?:ing)?\b/i, has: /rent your home|student housing/, what: 'renting' },
  { re: /\b(?:own your (?:own )?(?:home|flat|house)|a home ?owner)\b/i, has: /own your home/, what: 'a home owner' },
  { re: /\bbetween jobs\b|\bunemployed\b/i, has: /between jobs/, what: 'between jobs' },
];
export function unsupportedReason(text: string, reasons: AboutReason[], customerWords: string): string | null {
  for (const m of text.matchAll(/\b(?:because|since) you(?:['’]re| are)?\b[^,.!?;]{0,80}/gi)) {
    if (/\b(?:not|never|n['’]t)\b/i.test(m[0])) continue;
    for (const s of STATUS) if (s.re.test(m[0]) && !reasons.some((r) => s.has.test(r.phrase)) && !s.re.test(customerWords)) return s.what;
  }
  return null;
}

/** A sentence that advises something; a reason never goes in front of any other sentence. */
const ADVICE = /\b(?:could|should|consider|recommend|suggest|start|begin|try|good|best|better|worth|suits?|fits?|safest|safer|makes sense|helps|put|set|keep|open|choose|pick|go for|i would)\b|\bi['’]d\b/i;

/** Put the reason in front when the reply recommends something without one. Questions, refusals and other languages stay as they are. */
export function withReason(text: string, reason: AboutReason | undefined): string {
  const t = text.trim();
  if (!reason || !t || givesReason(t) || /[äöå]/i.test(t)) return text;
  // A greeting stays first.
  const hi = t.match(/^(?:hi|hello|hey|thanks|thank you|good question|great question|sure|of course)\b[^.!?\n]{0,40}[.!?]\s+/i)?.[0] || '';
  const yes = hi ? '' : t.match(/^(yes|no|sure|of course),\s+/i)?.[0] || '';
  const rest = t.slice(hi.length + yes.length);
  const first = rest.split(/(?<=[.!?])\s+/)[0] || '';
  if (!first || !ADVICE.test(first) || /\?$/.test(first) || /^(?:sorry|i (?:can(?:['’]t|not)|don['’]t|do not|could not|couldn['’]t|have not|haven['’]t)|unfortunately|here(?:['’]s| is) (?:the|what)|[-•*\d])/i.test(first)) return text;
  const word = first.match(/^[^\s,]+/)?.[0] || '';
  // Keep "I", names and short forms (ASP, PS, Nordea) as they are.
  const keep = /^I(?:['’]|$)/.test(word) || /^[A-ZÅÄÖ]{2}/.test(word) || /^(?:Nordea|Nora|Kela|Finland|Finnish)$/.test(word);
  return `${hi}${yes && yes.trim().replace(/,$/, '. ')}Because ${reason.phrase}, ${keep ? rest : rest.charAt(0).toLowerCase() + rest.slice(1)}`;
}

/** What Nora is told about giving reasons. */
export function reasonPrompt(reasons: AboutReason[]): string {
  return `BECAUSE YOU … (when you recommend or suggest something, e.g. an account, a product, an amount to save or a next step):
- First check it against About you. Never recommend something that goes against it (no shares or funds for someone who keeps savings safe; no home-buyer product for someone who owns a home). If nothing fits, say so.
- Start the recommendation with the reason that matters most, like: "Because ${reasons[0]?.phrase ?? '(reason)'}, (your recommendation)." Use one reason, two at most, and only one that really explains the recommendation.
- Only these reasons are true: ${reasons.length ? reasons.map((r) => `${r.phrase}${r.from === 'nordea' ? ' (from Nordea data)' : ''}`).join('; ') : 'none yet, so give no "because you" reason; you may say that answering About you helps you suggest better'}.
- Plain facts, balances, recalls and small talk need no reason. In another language, say the reason in that language.`;
}
