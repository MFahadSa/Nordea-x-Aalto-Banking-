/** Refund Tracker: the policy table (refund-config/policy.json) and its evaluation. Every deadline is
    the row's trigger fact + the row's offset. A row applies only when all its required facts are
    present; no matching row at all = 'unknown' (the case goes to a person). Nothing here is decided
    by the model. */
import fs from 'fs';
import path from 'path';
import { addDays, addMonths, nextWorkingDay, type WorkCalendar } from './calendar.js';

export interface DeadlineRule { trigger: string; days?: number; months?: number; rollToWorkingDay?: boolean; label: string }
export interface PolicyRow {
  id: string;
  country: string;
  cardTypes: string[];
  reasons: string[];
  kind: 'legal_right' | 'bank_path' | 'bank_guidance' | 'complaint_path';
  title: string;
  rule: string;
  requiredFacts: string[];
  mustEqual?: Record<string, unknown>;
  deadline: DeadlineRule | null;
  abelNote?: string;
  sources: { name: string; url: string }[];
  sourceReadOn: string;
  reviewBy: string;
}

const KINDS = ['legal_right', 'bank_path', 'bank_guidance', 'complaint_path'];

export function validateRow(r: any): string[] {
  const e: string[] = [];
  if (!r || typeof r !== 'object') return ['row is not an object'];
  for (const k of ['id', 'country', 'title', 'rule', 'sourceReadOn', 'reviewBy']) if (typeof r[k] !== 'string' || !r[k]) e.push(`${r.id ?? '?'}: missing ${k}`);
  for (const k of ['cardTypes', 'reasons', 'requiredFacts', 'sources']) if (!Array.isArray(r[k])) e.push(`${r.id ?? '?'}: ${k} must be a list`);
  if (!KINDS.includes(r.kind)) e.push(`${r.id}: unknown kind ${r.kind}`);
  if (Array.isArray(r.sources) && !r.sources.length) e.push(`${r.id}: needs at least one source`);
  if (r.deadline !== null) {
    const d = r.deadline;
    if (!d || typeof d.trigger !== 'string' || typeof d.label !== 'string') e.push(`${r.id}: deadline needs trigger and label (or null)`);
    else if ((typeof d.days === 'number') === (typeof d.months === 'number')) e.push(`${r.id}: deadline needs exactly one of days or months`);
    else if (Array.isArray(r.requiredFacts) && !r.requiredFacts.includes(d.trigger)) e.push(`${r.id}: deadline trigger ${d.trigger} must be a required fact`);
  }
  return e;
}

export function loadPolicy(file = path.resolve(process.cwd(), 'refund-config', 'policy.json')): PolicyRow[] {
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const rows = raw?.rows;
  if (!Array.isArray(rows)) throw new Error('policy.json needs a "rows" list');
  const errors = rows.flatMap(validateRow);
  const ids = rows.map((r: PolicyRow) => r.id);
  if (new Set(ids).size !== ids.length) errors.push('row ids must be unique');
  if (errors.length) throw new Error(`policy.json rejected: ${errors.join('; ')}`);
  return rows as PolicyRow[];
}

export interface CaseContext { country: string; cardType?: string; reasons: string[] }
export interface RowResult {
  id: string;
  kind: PolicyRow['kind'];
  title: string;
  status: 'applies' | 'undetermined' | 'does_not_apply';
  /** Required facts that are not in the case yet. */
  missing: string[];
  /** Facts present but with a value the row excludes (e.g. an exclusion applies). */
  mismatched: string[];
  deadline?: { date: string; label: string; kind: PolicyRow['kind']; trigger: string; triggerDate: string };
  sources: PolicyRow['sources'];
  rule: string;
  abelNote?: string;
}
export interface Evaluation { outcome: 'rows' | 'unknown'; rows: RowResult[]; reason?: string }

const present = (v: unknown) => v !== undefined && v !== null && v !== '';

export function rowMatches(row: PolicyRow, ctx: CaseContext): boolean {
  if (row.country !== ctx.country) return false;
  const cardOk = row.cardTypes.includes('any') || (!!ctx.cardType && row.cardTypes.includes(ctx.cardType));
  return cardOk && row.reasons.some((r) => ctx.reasons.includes(r));
}

export function computeDeadline(rule: DeadlineRule, facts: Record<string, unknown>, cal: WorkCalendar): string | undefined {
  const t = facts[rule.trigger];
  if (typeof t !== 'string') return undefined;
  let d = typeof rule.days === 'number' ? addDays(t, rule.days) : addMonths(t, rule.months as number);
  if (rule.rollToWorkingDay) d = nextWorkingDay(d, cal);
  return d;
}

export function evaluate(rows: PolicyRow[], ctx: CaseContext, facts: Record<string, unknown>, cal: WorkCalendar): Evaluation {
  const matching = rows.filter((r) => rowMatches(r, ctx));
  if (!matching.length) return { outcome: 'unknown', rows: [], reason: `No policy row for ${ctx.country} · ${ctx.cardType ?? 'card type unknown'} · ${ctx.reasons.join(', ')}` };
  const out = matching.map((row): RowResult => {
    const missing = row.requiredFacts.filter((f) => !present(facts[f]));
    const mismatched = Object.entries(row.mustEqual ?? {}).filter(([k, v]) => present(facts[k]) && facts[k] !== v).map(([k]) => k);
    const status: RowResult['status'] = mismatched.length ? 'does_not_apply' : missing.length ? 'undetermined' : 'applies';
    const res: RowResult = { id: row.id, kind: row.kind, title: row.title, status, missing, mismatched, sources: row.sources, rule: row.rule, abelNote: row.abelNote };
    if (status === 'applies' && row.deadline) {
      const date = computeDeadline(row.deadline, facts, cal);
      if (date) res.deadline = { date, label: row.deadline.label, kind: row.kind, trigger: row.deadline.trigger, triggerDate: String(facts[row.deadline.trigger]) };
    }
    return res;
  });
  return { outcome: 'rows', rows: out };
}
