/**
 * About you: what Nora knows, in the style of Claude's memory, adapted to banking.
 * Shared by the server (src/server/aboutYou.ts) and the app (src/components/AboutYou.tsx).
 *
 * Eight parts. Most of it is pre-filled from what Nordea already knows; the customer confirms with one tap.
 * Each part holds one or more fields; every field is one cabinet entry (aboutPart = field key).
 */
export type FieldKey = 'basics' | 'work' | 'home' | 'people' | 'money' | 'plans' | 'interests' | 'risk' | 'style' | 'mainUse' | 'more';

export interface FieldDef {
  key: FieldKey;
  label: string;
  /** Tap answers. Empty = free text only (Tell us more) or not editable (Basics). */
  options: string[];
  multi: boolean;
}

export const FIELDS: Record<FieldKey, FieldDef> = {
  basics: { key: 'basics', label: 'Basics', options: [], multi: false },
  work: { key: 'work', label: 'Work or study', options: ['Working', 'Studying', 'Both', 'Between jobs', 'Retired'], multi: false },
  home: { key: 'home', label: 'Home', options: ['Rents', 'Owns', 'With parents', 'Student housing'], multi: false },
  people: { key: 'people', label: 'Lives with', options: ['Alone', 'A partner', 'Partner and kids', 'Kids', 'Flatmates'], multi: false },
  money: { key: 'money', label: 'Money habits', options: [], multi: false },
  plans: { key: 'plans', label: 'Plans', options: ['A home', 'Travel', 'Studies', 'Wedding', 'Baby', 'Car', 'A buffer'], multi: true },
  interests: { key: 'interests', label: 'Interests', options: ['Saving', 'Investing basics', 'Buying a home', 'Taxes', 'Pensions', 'Budgeting'], multi: true },
  risk: { key: 'risk', label: 'Risk with savings', options: ['Keep it safe', 'A little', 'Comfortable'], multi: false },
  style: { key: 'style', label: 'How Nora answers', options: ['Short answers', 'More detail'], multi: false },
  mainUse: { key: 'mainUse', label: 'Mainly uses Nordea for', options: ['Daily banking', 'Saving', 'Investing', 'Loans', 'Paying bills'], multi: true },
  more: { key: 'more', label: 'Tell us more', options: [], multi: false },
};

export interface PartDef { id: string; label: string; fields: FieldKey[] }
export const PARTS: PartDef[] = [
  { id: 'basics', label: 'Basics', fields: ['basics'] },
  { id: 'work', label: 'Work & study', fields: ['work'] },
  { id: 'home', label: 'Home & people', fields: ['home', 'people'] },
  { id: 'money', label: 'Money habits', fields: ['money'] },
  { id: 'plans', label: 'Plans', fields: ['plans'] },
  { id: 'interests', label: 'Interests', fields: ['interests'] },
  { id: 'prefs', label: 'Preferences', fields: ['risk', 'style', 'mainUse'] },
  { id: 'more', label: 'Tell us more', fields: ['more'] },
];

/** The onboarding questions after "Is this right?". Each says what the customer gets. */
export const QUESTIONS: { field: FieldKey; title: string; value: string }[] = [
  { field: 'mainUse', title: 'What do you mainly use Nordea for?', value: 'Your home screen shows what you use most.' },
  { field: 'plans', title: 'What’s next for you in the next few years?', value: 'Nora tracks it and tells you if you fall behind.' },
  { field: 'interests', title: 'What would you like to know more about?', value: 'A few useful tips that fit you. No spam.' },
  { field: 'risk', title: 'How do you feel about risk with savings?', value: 'Nora never suggests what you’d be uneasy with.' },
];

/** One field as the app sees it. */
export interface FieldView {
  key: FieldKey;
  label: string;
  options: string[];
  multi: boolean;
  /** What the customer said or confirmed. */
  values: string[];
  /** How it reads in a sentence. */
  text: string;
  /** Where the current value came from. */
  source: 'you' | 'nordea' | 'none';
  /** Nordea's pre-filled answer, waiting for one tap. */
  suggestion?: { values: string[]; text: string; from: string };
  /** The customer removed it (in About you or by asking Nora): not shown, not suggested again, until they add it. */
  removed?: boolean;
}

export interface AboutView {
  paragraph: string;
  fields: Record<FieldKey, FieldView>;
  /** What Nordea's own data shows (read-only, always shown with its source). */
  bank: { key: FieldKey; label: string; icon: string; text: string }[];
  /** What answering is worth: points toward a real reward, and the advice it unlocks. */
  incentive: { remaining: number; points: number; have: number; rewardLine: string; teasers: string[] };
  /** "Get more from Nora": what each answer turns on. */
  setup: { key: string; done: boolean; doneText: string; todoText: string; step: FieldKey | 'confirm' }[];
}

/** What the app sends when the customer taps "Ask Nora" on an offer. */
export const offerQuestion = (title: string) => `Tell me about the ${title} for my situation`;

/** The tapped answer a typed work or home line clearly means ("Studies at Aalto" → Studying). Unclear or negated: none. */
export function inferValues(key: FieldKey, text: string | undefined): string[] {
  const t = (text || '').toLowerCase();
  if (!t || /\b(?:no longer|not|never|former|formerly|used to|ex|graduated|was|until|want|wants|plans?|hopes?)\b|n['’]t\b/.test(t)) return [];
  if (key === 'work') {
    const w = t.replace(/\bstudent (?:loan|aid|debt|flat|housing|discount|card)s?\b/g, '');
    const studies = /\b(?:student|study|studies|studying)\b/.test(w);
    if (/\b(?:between jobs|unemployed|looking for (?:a )?(?:job|work))\b/.test(w)) return studies ? ['Studying'] : ['Between jobs'];
    const works = /\b(?:works?|working|job|salary|employed|freelanc\w*)\b/.test(w);
    if (studies) return [works ? 'Both' : 'Studying'];
    if (/\b(?:retired|pensioner|pension)\b/.test(w)) return ['Retired'];
    return works ? ['Working'] : [];
  }
  if (key === 'home') {
    if (/\brents? out\b/.test(t)) return [];
    if (/\b(?:owns?|bought)\b/.test(t)) return ['Owns'];
    if (/\bparents?\b/.test(t)) return ['With parents'];
    if (/\b(?:student housing|hoas|dorm)\b/.test(t)) return ['Student housing'];
    if (/\b(?:rents?|renting)\b/.test(t)) return ['Rents'];
  }
  return [];
}

/**
 * A correction is usually a fragment ("4000 euro", "paid on the 15th", "Product designer"), not a new sentence.
 * Change only the part it is about and keep the rest: "UX designer, steady salary of 3 900 € a month, paid on
 * the 25th" + "4000 euro" → "UX designer, steady salary of 4 000 € a month, paid on the 25th".
 * A full sentence that already reads like the whole answer replaces it.
 */
export function mergeCorrection(base: string, typed: string): string {
  const t = typed.trim().replace(/[.]+$/, '');
  if (!base || !t) return t;
  const words = (x: string) => new Set(x.toLowerCase().match(/[a-zåäö]{3,}/g) || []);
  const bw = words(base), tw = [...words(t)];
  // A rewrite of the whole thing: most of the old words are there again, or it is long.
  if (tw.length >= 8 || (tw.length >= 3 && tw.filter((w) => bw.has(w)).length / tw.length >= 0.5 && /\d/.test(t) === /\d/.test(base))) return t;
  const parts = base.split(/,\s*|;\s*/);
  // Home: owning or renting changes the whole line (no rent when you own).
  if (/^(rents|owns|lives with parents|student housing|housing costs)/i.test(base)) {
    if (/\b(own|owns|bought|my own)\b/i.test(t)) return 'Owns their home';
    if (/\b(parents?)\b/i.test(t)) return 'Lives with parents';
    if (/\b(student housing|hoas|dorm)\b/i.test(t)) return 'Lives in student housing';
  }
  // Money habits: "saves …" and "spends …" are separate sentences; a correction changes the one it is about.
  const sentences = base.split(/(?<=\.)\s+/);
  if (sentences.length > 1) {
    const i = /\b(save|saving|saves)\b/i.test(t) ? sentences.findIndex((x) => /\bsaves?\b/i.test(x)) : /\b(spend|spends|mostly|most)\b/i.test(t) ? sentences.findIndex((x) => /\bspends?\b/i.test(x)) : -1;
    if (i >= 0) {
      const rest = sentences.filter((_, j) => j !== i);
      if (/\b(don'?t|do not|no longer|not)\b.*\bsav/i.test(t)) return rest.join(' ');
      const fixed = mergeCorrection(sentences[i].replace(/\.$/, ''), t);
      sentences[i] = `${fixed.charAt(0).toUpperCase() + fixed.slice(1)}.`;
      return sentences.join(' ');
    }
  }
  const AMOUNT = /(\d[\d\s.,]*\d|\d)\s*(k\b)?\s*(€|eur(?:o|os)?\b)?/i;
  // A payday: "paid on the 15th", "payday 15", "15th".
  const day = t.match(/\b(?:paid on the|payday(?: is)?(?: on the)?|on the)\s*(\d{1,2})(?:st|nd|rd|th)?\b/i) || t.match(/^(\d{1,2})(st|nd|rd|th)$/i);
  if (day && /paid on the \d{1,2}(st|nd|rd|th)/i.test(base)) {
    const d = Number(day[1]); const suf = [11, 12, 13].includes(d % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][d % 10] || 'th';
    return base.replace(/paid on the \d{1,2}(st|nd|rd|th)/i, `paid on the ${d}${suf}`);
  }
  const m = t.match(AMOUNT);
  if (m && AMOUNT.test(base)) {
    const n = Number(m[1].replace(/\s/g, '').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')) * (m[2] ? 1000 : 1);
    if (n > 0) {
      // Which amount: the part that shares a word with the correction ("rent 1200" → the rent), else the first one.
      const rest = tw.filter((w) => !/^(eur|euro|euros|month|about|around|per)$/.test(w));
      const i = Math.max(0, parts.findIndex((p) => AMOUNT.test(p) && rest.some((w) => p.toLowerCase().includes(w.slice(0, 4)))));
      const j = AMOUNT.test(parts[i]) ? i : parts.findIndex((p) => AMOUNT.test(p));
      parts[j] = parts[j].replace(AMOUNT, `${Math.round(n).toLocaleString('fi-FI')} €`).replace(/€\s*€/, '€');
      return parts.join(', ');
    }
  }
  // A short phrase with no number replaces a short label at the start ("UX designer" → "Product designer").
  if (!/\d/.test(t) && tw.length <= 5 && parts.length > 1 && parts[0].split(/\s+/).length <= 3 && !/\d/.test(parts[0])) {
    parts[0] = t.charAt(0).toUpperCase() + t.slice(1);
    return parts.join(', ');
  }
  return t;
}

