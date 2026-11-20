/**
 * v25: the rules catalogue. One JSON file per rule version in rules/, like partners/. A rule is
 * data with its official source, the dates it applies, an owner and its own tests. Loading is
 * strict: a file with any mistake is rejected whole and named, never half-loaded.
 */
import fs from 'fs';
import path from 'path';
import { FACTS, isFactKey, validValue, type FactKey } from './facts.js';

export type Op = 'eq' | 'ne' | 'gte' | 'gt' | 'lte' | 'lt' | 'in';
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | ({ fact: FactKey } & Partial<Record<Op, unknown>>);

export type RuleAction = 'appOffer' | 'inform' | 'adviser';
export type Expect = 'eligible' | 'notEligible' | 'notLive' | 'notTime' | 'stale' | `ask:${string}`;

export interface RuleTest {
  name: string; today: string; facts: Record<string, unknown>; expect: Expect;
  /** Tests far in the future: the day the rule's source is assumed re-checked (else it is stale). */
  reviewedOn?: string;
}

export interface Rule {
  id: string;
  version: string;
  title: string;
  kind: 'product' | 'tax' | 'state';
  validFrom: string;
  /** Exclusive: the rule stops applying ON this date. null = until replaced. */
  validTo: string | null;
  source: { url: string; checkedAt: string; owner: string };
  /** After this many days without a re-check the rule switches itself off. */
  reviewDays: number;
  when: Condition;
  /** Questions Abel may ask for missing customer facts, keyed by fact. */
  ask: Partial<Record<FactKey, string>>;
  /** Optional window (inclusive from, exclusive to) when the rule is worth raising. */
  timing?: { from: string; to: string };
  action: RuleAction;
  /** Investment advice, credit and insurance: always ends with a person. */
  regulated: boolean;
  /** Purposes allowed to use this rule's facts. */
  uses: 'abel'[];
  params: Record<string, number | string>;
  compute?: string;
  message: string;
  /** "What Nordea earns", in words, shown on every card. No numbers. */
  earns: string;
  /** Button label for an in-app offer (required when action is appOffer). */
  cta?: string;
  tests: RuleTest[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(v));
const OPS: Op[] = ['eq', 'ne', 'gte', 'gt', 'lte', 'lt', 'in'];
const RULE_KEYS = ['id', 'version', 'title', 'kind', 'validFrom', 'validTo', 'source', 'reviewDays', 'when', 'ask', 'timing', 'action', 'regulated', 'uses', 'params', 'compute', 'message', 'earns', 'cta', 'tests', '_note'];

/** Values a compute step adds to the message, by name. Kept here so validation knows them. */
/** Rules whose in-app offer has code that carries it out (src/server/advice/actions.ts). */
export const ACCEPTS = new Set(['asp-account']);

export const COMPUTE_OUTPUTS: Record<string, string[]> = {
  aspPlan: ['twentiethDepositMonth'],
};

function factsIn(c: Condition, out: Set<FactKey>) {
  if ('all' in c) c.all.forEach((x) => factsIn(x, out));
  else if ('any' in c) c.any.forEach((x) => factsIn(x, out));
  else if ('not' in c) factsIn(c.not, out);
  else out.add(c.fact);
  return out;
}

function checkCondition(c: any, where: string, errors: string[]) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) { errors.push(`${where}: not a condition`); return; }
  const keys = Object.keys(c);
  if (keys.length === 1 && (keys[0] === 'all' || keys[0] === 'any')) {
    const list = c[keys[0]];
    if (!Array.isArray(list) || !list.length) errors.push(`${where}.${keys[0]}: needs at least one condition`);
    else list.forEach((x: any, i: number) => checkCondition(x, `${where}.${keys[0]}[${i}]`, errors));
    return;
  }
  if (keys.length === 1 && keys[0] === 'not') { checkCondition(c.not, `${where}.not`, errors); return; }
  if (!isFactKey(c.fact)) { errors.push(`${where}: unknown fact "${c.fact}"`); return; }
  const ops = keys.filter((k) => k !== 'fact');
  if (ops.length !== 1 || !OPS.includes(ops[0] as Op)) { errors.push(`${where}: needs exactly one of ${OPS.join(', ')}`); return; }
  const op = ops[0] as Op, v = c[op], type = FACTS[c.fact as FactKey].type;
  if (op === 'in') {
    if (!Array.isArray(v) || !v.length || !v.every((x) => validValue(type, x))) errors.push(`${where}: "in" needs a list of ${type} values`);
  } else if (!validValue(type, v)) errors.push(`${where}: ${c.fact} is a ${type}, got ${JSON.stringify(v)}`);
  else if (['gte', 'gt', 'lte', 'lt'].includes(op) && type === 'boolean') errors.push(`${where}: "${op}" cannot compare a yes/no fact`);
}

/** Every problem in one rule, in words; empty = valid. */
export function validateRule(r: any): string[] {
  const e: string[] = [];
  if (!r || typeof r !== 'object') return ['not an object'];
  for (const k of Object.keys(r)) if (!RULE_KEYS.includes(k)) e.push(`unknown field "${k}"`);
  if (typeof r.id !== 'string' || !/^[a-z0-9-]{3,60}$/.test(r.id)) e.push('id: lowercase letters, digits and dashes');
  if (!isDate(r.version)) e.push('version: a date YYYY-MM-DD');
  if (typeof r.title !== 'string' || !r.title.trim()) e.push('title: missing');
  if (!['product', 'tax', 'state'].includes(r.kind)) e.push('kind: product, tax or state');
  if (!isDate(r.validFrom)) e.push('validFrom: a date');
  if (r.validTo !== null && !isDate(r.validTo)) e.push('validTo: a date or null');
  if (isDate(r.validFrom) && isDate(r.validTo) && r.validTo <= r.validFrom) e.push('validTo must be after validFrom');
  if (!r.source || typeof r.source.url !== 'string' || !/^https:\/\/\S+$/.test(r.source.url)) e.push('source.url: an https link to the official page');
  if (!r.source || !isDate(r.source.checkedAt)) e.push('source.checkedAt: the date someone last read the source');
  if (!r.source || typeof r.source.owner !== 'string' || !r.source.owner.trim()) e.push('source.owner: who re-checks this rule');
  if (!Number.isInteger(r.reviewDays) || r.reviewDays < 1 || r.reviewDays > 366) e.push('reviewDays: 1 to 366');
  checkCondition(r.when, 'when', e);
  const used = r.when && !e.some((x) => x.startsWith('when')) ? factsIn(r.when, new Set()) : new Set<FactKey>();
  if (!r.ask || typeof r.ask !== 'object') e.push('ask: an object (can be empty)');
  else for (const [k, q] of Object.entries(r.ask)) {
    if (!isFactKey(k)) e.push(`ask: unknown fact "${k}"`);
    else {
      if (FACTS[k].origin !== 'customer') e.push(`ask.${k}: Nordea already knows this; never ask the customer`);
      if (!used.has(k)) e.push(`ask.${k}: the rule does not use this fact`);
    }
    if (typeof q !== 'string' || !q.trim().endsWith('?')) e.push(`ask.${k}: a question ending in "?"`);
  }
  if (r.timing !== undefined && (!isDate(r.timing?.from) || !isDate(r.timing?.to) || r.timing.to <= r.timing.from)) e.push('timing: { from, to } dates, to after from');
  if (!['appOffer', 'inform', 'adviser'].includes(r.action)) e.push('action: appOffer, inform or adviser');
  if (typeof r.regulated !== 'boolean') e.push('regulated: true or false');
  if (r.regulated === true && r.action === 'appOffer') e.push('a regulated rule cannot be an in-app offer: use inform or adviser');
  if (!Array.isArray(r.uses) || !r.uses.length || !r.uses.every((u: string) => u === 'abel')) e.push('uses: ["abel"]');
  if (!r.params || typeof r.params !== 'object' || Object.values(r.params).some((v) => typeof v !== 'number' && typeof v !== 'string')) e.push('params: numbers and words only');
  if (r.compute !== undefined && !COMPUTE_OUTPUTS[r.compute]) e.push(`compute: unknown "${r.compute}"`);
  if (typeof r.message !== 'string' || !r.message.trim()) e.push('message: missing');
  else {
    const known = new Set([...Object.keys(r.params || {}), ...(COMPUTE_OUTPUTS[r.compute] || [])]);
    for (const m of r.message.matchAll(/\{(\w+)\}/g)) if (!known.has(m[1])) e.push(`message: {${m[1]}} has no value`);
    if (/\d/.test(r.message.replace(/\{\w+\}/g, ''))) e.push('message: numbers go in params, never typed in the text');
  }
  if (typeof r.earns !== 'string' || !r.earns.trim()) e.push('earns: say what Nordea earns (or "Nordea earns nothing from this.")');
  else if (/\d/.test(r.earns)) e.push('earns: words only, no numbers');
  if (r.action === 'appOffer' && (typeof r.cta !== 'string' || !r.cta.trim())) e.push('cta: an in-app offer needs its button label');
  if (r.action !== 'appOffer' && r.cta !== undefined) e.push('cta: only in-app offers have a button label');
  if (r.action === 'appOffer' && typeof r.id === 'string' && !ACCEPTS.has(r.id)) e.push(`action appOffer: no code handles accepting "${r.id}"`);
  if (!Array.isArray(r.tests) || r.tests.length < 2) e.push('tests: at least two (one yes, one no)');
  else r.tests.forEach((t: any, i: number) => {
    if (typeof t.name !== 'string' || !t.name) e.push(`tests[${i}].name: missing`);
    if (!isDate(t.today)) e.push(`tests[${i}].today: a date`);
    if (!t.facts || typeof t.facts !== 'object') e.push(`tests[${i}].facts: an object`);
    else for (const k of Object.keys(t.facts)) if (!isFactKey(k)) e.push(`tests[${i}].facts: unknown fact "${k}"`);
    if (!/^(eligible|notEligible|notLive|notTime|stale|ask:\w+)$/.test(t.expect)) e.push(`tests[${i}].expect: not a known result`);
    if (t.reviewedOn !== undefined && !isDate(t.reviewedOn)) e.push(`tests[${i}].reviewedOn: a date`);
    for (const k of Object.keys(t)) if (!['name', 'today', 'facts', 'expect', 'reviewedOn'].includes(k)) e.push(`tests[${i}]: unknown field "${k}"`);
  });
  return e;
}

/** Versions of one rule may not overlap in time. */
export function overlapErrors(rules: Rule[]): string[] {
  const out: string[] = [];
  const byId = new Map<string, Rule[]>();
  for (const r of rules) byId.set(r.id, [...(byId.get(r.id) || []), r]);
  for (const [id, list] of byId) {
    const sorted = [...list].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted.at(i - 1)!, cur = sorted.at(i)!;
      if (prev.validTo === null || prev.validTo > cur.validFrom) out.push(`${id}: versions ${prev.version} and ${cur.version} overlap`);
    }
  }
  return out;
}

export interface Catalogue { rules: Rule[]; rejected: { file: string; errors: string[] }[] }

export function loadRules(dir = path.resolve(process.cwd(), 'rules')): Catalogue {
  const rules: Rule[] = [];
  const rejected: Catalogue['rejected'] = [];
  if (!fs.existsSync(dir)) return { rules, rejected };
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    let data: any;
    try { data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); }
    catch (err) { rejected.push({ file: f, errors: [`not valid JSON: ${(err as Error).message}`] }); continue; }
    const errors = validateRule(data);
    if (errors.length) rejected.push({ file: f, errors });
    else rules.push(data as Rule);
  }
  const overlaps = overlapErrors(rules);
  if (overlaps.length) {
    // Overlapping versions are ambiguous: reject every version of those rules.
    const bad = new Set(overlaps.map((o) => o.split(':')[0]));
    for (const r of rules.filter((x) => bad.has(x.id))) rejected.push({ file: `${r.id}@${r.version}`, errors: overlaps.filter((o) => o.startsWith(r.id + ':')) });
    return { rules: rules.filter((x) => !bad.has(x.id)), rejected };
  }
  return { rules, rejected };
}
