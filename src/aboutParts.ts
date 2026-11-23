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
}

export interface AboutView {
  paragraph: string;
  fields: Record<FieldKey, FieldView>;
  /** "Get more from Nora": what each answer turns on. */
  setup: { key: string; done: boolean; doneText: string; todoText: string; step: FieldKey | 'confirm' }[];
}
