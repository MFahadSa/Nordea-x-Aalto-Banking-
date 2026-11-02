/**
 * The shared working document (AC2): one context.md per customer. Sections are stored as
 * STRUCTURED ROWS (B1a) - each row carries source agent, evidence and timestamps - and the
 * markdown file is RENDERED from the rows, never the other way round. The Context Memory
 * agent stores its finalise snapshot from the rows, so provenance stays exact.
 *
 * All three agents may READ the rows; each WRITES only its own section through its dedicated
 * writer below (B1b), pinned by the AC2 source-scan test. The private writeSection helper is
 * not exported, so an agent module can only ever reach its own writer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ARCH_DIR } from './common.js';
import { now } from '../types.js';

export type ContextSection = 'customer' | 'memory' | 'nordea';

/** One structured row of the shared document. Evidence and provenance live here, not in markdown. */
export interface ContextRow {
  id: string;
  title: string;
  detail: string;
  source: 'personal' | 'cm' | 'nordea';
  status?: string;
  observed?: 'observed' | 'inferred';
  conflict?: boolean;
  evidence?: Record<string, unknown> | null;
  at: string;
}

export interface ContextDoc {
  roundId: string | null;
  sessionId: string | null; // F16: which chat session this document belongs to (null = not session-built)
  trigger: string | null;
  openedAt: string | null;
  finalisedAt: string | null;
  sections: Record<ContextSection, { rows: ContextRow[]; note?: string }>;
}

export interface RoundMeta { roundId: string; trigger: string }

const safeUid = (uid: string) => uid.replace(/[^a-z0-9_-]/gi, '_');
const jsonPath = (uid: string) => path.join(ARCH_DIR, `${safeUid(uid)}.context.json`);
export const contextMdPath = (uid: string) => path.join(ARCH_DIR, `${safeUid(uid)}.context.md`);

const emptyDoc = (): ContextDoc => ({
  roundId: null, sessionId: null, trigger: null, openedAt: null, finalisedAt: null,
  sections: { customer: { rows: [] }, memory: { rows: [] }, nordea: { rows: [] } },
});

export function loadContext(uid: string): ContextDoc | null {
  try { return JSON.parse(fs.readFileSync(jsonPath(uid), 'utf-8')) as ContextDoc; } catch { return null; }
}

/** Rows of one section - how agents read the shared document (never by parsing markdown). */
export function readSectionRows(uid: string, section: ContextSection): ContextRow[] {
  return loadContext(uid)?.sections[section].rows ?? [];
}

function renderRows(section: ContextSection, rows: ContextRow[]): string {
  if (!rows.length) return section === 'customer' ? '_nothing shared yet_' : section === 'memory' ? '_nothing relevant stored yet_' : '_no bank aggregates yet_';
  return rows.map((r) => {
    if (section === 'customer') return `- Goal: ${r.title} (${r.id})${r.detail ? ` - ${r.detail}` : ''}`;
    if (section === 'memory') return `- [${r.status ?? 'active'}${r.conflict ? ', conflict' : ''}] ${r.title}: ${r.detail} (${r.observed ?? 'observed'}, source: ${r.source}, ${r.at.slice(0, 10)})`;
    return `- ${r.title}: ${r.detail} (aggregates only - no account identifiers, no raw transactions).`;
  }).join('\n');
}

export function renderContextMd(uid: string, doc: ContextDoc): string {
  const out = [
    `# Context - ${uid}`,
    '',
    `<!-- build round: ${doc.roundId ?? 'none'} (${doc.trigger ?? 'n/a'}) opened ${doc.openedAt ?? 'n/a'}, finalised ${doc.finalisedAt ?? 'not yet'} -->`,
    '',
  ];
  for (const [section, heading] of [['customer', 'Customer'], ['memory', 'Context memory'], ['nordea', 'Nordea']] as [ContextSection, string][]) {
    const s = doc.sections[section];
    out.push(`## ${heading}`, '', renderRows(section, s.rows));
    if (s.note) out.push('', `_${s.note}_`);
    out.push('');
  }
  return out.join('\n');
}

function save(uid: string, doc: ContextDoc) {
  fs.mkdirSync(ARCH_DIR, { recursive: true });
  fs.writeFileSync(jsonPath(uid), JSON.stringify(doc, null, 2));
  fs.writeFileSync(contextMdPath(uid), renderContextMd(uid, doc));
}

/** Delete the shared document (app administration after one of the agents' databases is wiped). */
export function deleteContext(uid: string) {
  for (const f of [jsonPath(uid), contextMdPath(uid)]) if (fs.existsSync(f)) fs.unlinkSync(f);
}

// Private: the only write path. Not exported - agent modules can only reach their own writer (B1b).
function writeSection(uid: string, section: ContextSection, rows: ContextRow[], note: string | undefined, meta?: RoundMeta) {
  const doc = loadContext(uid) ?? emptyDoc();
  if (meta && doc.roundId !== meta.roundId) {
    doc.roundId = meta.roundId;
    doc.trigger = meta.trigger;
    doc.openedAt = now();
    doc.finalisedAt = null;
  }
  doc.sections[section] = { rows, ...(note ? { note } : {}) };
  save(uid, doc);
}

/** The personal agent's section (AC3): what the customer allows Nordea to see. */
export function writeCustomerSection(uid: string, rows: ContextRow[], note?: string, meta?: RoundMeta) { writeSection(uid, 'customer', rows, note, meta); }
/** The Context Memory agent's section (AC4): relevant earlier context, deduped, conflicts flagged. */
export function writeMemorySection(uid: string, rows: ContextRow[], meta?: RoundMeta) { writeSection(uid, 'memory', rows, undefined, meta); }
/** The Nordea agent's section (AC5): aggregates with evidence - no identifiers, no raw transactions. */
export function writeNordeaSection(uid: string, rows: ContextRow[], meta?: RoundMeta) { writeSection(uid, 'nordea', rows, undefined, meta); }

/** F16: a new chat session starts from an empty document stamped with its session id - even
 * when no session round can run, so no earlier session's rows can leak into its answers. */
export function resetContextForSession(uid: string, sessionId: string) {
  const doc = emptyDoc();
  doc.sessionId = sessionId;
  save(uid, doc);
}

/** Round metadata: the Context Memory agent stamps the document when it finalises a round. */
export function writeHeader(uid: string, meta: RoundMeta & { finalise?: boolean }) {
  const doc = loadContext(uid) ?? emptyDoc();
  doc.roundId = meta.roundId;
  doc.trigger = meta.trigger;
  if (meta.finalise) doc.finalisedAt = now();
  else { doc.openedAt = now(); doc.finalisedAt = null; }
  save(uid, doc);
}
