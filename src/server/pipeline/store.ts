// The pipeline's own records: runs (one per input that arrived), candidates (what the filter kept
// for the customer to decide) and Nordea cases. Local JSON file, mirrored to Supabase's
// pipeline_records table (supabase/pipeline.sql) when the project keys are set.
//
// What is NOT stored, on purpose: the raw input (a chat, a photo, what the glasses heard) and the
// signals the filter dropped. Dropped signals are counted; their text lives only in this server's
// memory for the presenter view (lost on restart, never written anywhere).
import fs from 'fs';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type PipeSource = 'glasses' | 'whatsapp' | 'document' | 'csv' | 'abel' | 'cloud';
export const SOURCE_LABEL: Record<PipeSource, string> = {
  glasses: 'Smart glasses', whatsapp: 'WhatsApp chat', document: 'Document', csv: 'Bank data', abel: 'Abel chat', cloud: 'Personal AI cloud',
};

export interface PipeRun {
  id: string;
  userId: string;
  source: PipeSource;
  at: string;
  /** e.g. "WhatsApp Chat with Mia.txt" or "Viewing in Kalasatama". */
  label: string;
  heard: number;
  kept: number;
  private: number;
  dropped: number;
  merged: number;
  /** false: the AI was unavailable and the rule check decided (said so in the view). */
  aiJudged: boolean;
}

export type FilterDecision = 'kept' | 'private' | 'merged';
export type CustomerDecision = 'waiting' | 'saved' | 'private' | 'dropped';

export interface PipeCandidate {
  id: string;
  runId: string;
  userId: string;
  source: PipeSource;
  at: string;
  type: 'goal' | 'life_event' | 'preference' | 'fact' | 'observation';
  title: string;
  detail: string;
  /** Why the filter kept it ("touches the flat goal"). */
  reason: string;
  filter: FilterDecision;
  customer: CustomerDecision;
  decidedAt?: string;
  target?: { amount: number; date: string };
  goalType?: 'home' | 'car' | 'travel' | 'buffer' | 'other';
  /** An existing entry it would update (the filter found it already known in another form). */
  updatesId?: string;
  /** The cabinet entry it became (saved / kept private), or the Nordea observation it is. */
  entryId?: string;
}

export interface CaseDecision { by: string; at: string; outcome: 'pre_approved' | 'declined' | 'more_info'; amount?: number; reason: string }
export interface NordeaCase {
  id: string;
  userId: string;
  kind: 'home_loan_preapproval' | 'meeting' | 'savings_review';
  title: string;
  at: string;
  /** What the customer shared FOR THIS CASE, and until when. Nothing else is readable for it. */
  sharedIds: string[];
  shareUntil: string;
  status: 'open' | 'waiting_customer' | 'waiting_second' | 'decided' | 'withdrawn';
  /** The amount the customer asked about, if any. */
  amount?: number;
  requests: { id: string; at: string; by: string; ask: string; answer?: string; answeredAt?: string }[];
  decisions: CaseDecision[];
  /** The customer's chat the case talks back to. */
  conversationId?: string;
  /** The share (from "Connect me") this case reads through; stopping it withdraws the case. */
  shareId?: string;
}

interface Rec { id: string; user_id: string; kind: 'run' | 'candidate' | 'case'; data: unknown }
interface State { runs: PipeRun[]; candidates: PipeCandidate[]; cases: NordeaCase[] }

const DATA_DIR = process.env.CABINET_DATA_DIR ? path.resolve(process.env.CABINET_DATA_DIR) : path.resolve(process.cwd(), 'data');
const FILE = () => path.join(DATA_DIR, 'pipeline.json');
const TABLE = 'pipeline_records';

let st: State | null = null;
const empty = (): State => ({ runs: [], candidates: [], cases: [] });

function load(): State {
  if (st) return st;
  try { st = { ...empty(), ...JSON.parse(fs.readFileSync(FILE(), 'utf-8')) }; } catch { st = empty(); }
  return st!;
}

// ---- Supabase mirror (same keys as the agent-store mirror) ----
const key = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const mirrorOn = () => !!process.env.SUPABASE_URL && !!key() && process.env.AGENT_STORES_VIA_SUPABASE !== '0';
let client: SupabaseClient | null = null;
const sb = () => (client ||= createClient(process.env.SUPABASE_URL!, key(), { auth: { persistSession: false, autoRefreshToken: false } }));
let mirrorOk: boolean | null = null;
let chain: Promise<void> = Promise.resolve();

function mirror(recs: Rec[], removeIds: string[] = []) {
  if (!mirrorOn() || mirrorOk === false) return;
  chain = chain.then(async () => {
    if (recs.length) {
      const { error } = await sb().from(TABLE).upsert(recs.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }
    if (removeIds.length) {
      const { error } = await sb().from(TABLE).delete().in('id', removeIds);
      if (error) throw new Error(error.message);
    }
  }).catch((e) => console.error('Pipeline: Supabase save failed:', e instanceof Error ? e.message : e));
}

/** Startup: when Supabase holds pipeline records, they are the source of truth (a fresh AI Studio
 *  container starts empty). Returns a short status line. */
export async function hydratePipeline(): Promise<string> {
  if (!mirrorOn()) return 'pipeline: this server only';
  try {
    const all: Rec[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb().from(TABLE).select('id, user_id, kind, data').order('id').range(from, from + 999);
      if (error) throw new Error(error.message);
      all.push(...((data || []) as Rec[]));
      if (!data || data.length < 1000) break;
    }
    mirrorOk = true;
    if (!all.length) { // first run against an empty table: push what this server has
      const s = load();
      mirror([...s.runs.map(recOf('run')), ...s.candidates.map(recOf('candidate')), ...s.cases.map(recOf('case'))]);
      return 'pipeline: Supabase (empty table, seeded from this server)';
    }
    st = {
      runs: all.filter((r) => r.kind === 'run').map((r) => r.data as PipeRun),
      candidates: all.filter((r) => r.kind === 'candidate').map((r) => r.data as PipeCandidate),
      cases: all.filter((r) => r.kind === 'case').map((r) => r.data as NordeaCase),
    };
    writeLocal();
    return `pipeline: Supabase (${all.length} records)`;
  } catch (e) {
    mirrorOk = false;
    return `pipeline: Supabase table missing or unreachable (${e instanceof Error ? e.message : e}) - run supabase/pipeline.sql; this server only meanwhile`;
  }
}

function writeLocal() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(load()), 'utf-8');
}

const recOf = (kind: Rec['kind']) => (x: { id: string; userId: string }): Rec => ({ id: x.id, user_id: x.userId, kind, data: x });

// ---- reads ----
export const runs = (userId?: string) => load().runs.filter((r) => !userId || r.userId === userId);
export const candidates = (userId?: string) => load().candidates.filter((c) => !userId || c.userId === userId);
export const cases = (userId?: string) => load().cases.filter((c) => !userId || c.userId === userId);
export const getCandidate = (id: string) => load().candidates.find((c) => c.id === id);
export const getCase = (id: string) => load().cases.find((c) => c.id === id);
export const getRun = (id: string) => load().runs.find((r) => r.id === id);

// ---- writes ----
export function putRun(r: PipeRun) { const s = load(); s.runs = [...s.runs.filter((x) => x.id !== r.id), r]; writeLocal(); mirror([recOf('run')(r)]); }
export function putCandidate(c: PipeCandidate) { const s = load(); s.candidates = [...s.candidates.filter((x) => x.id !== c.id), c]; writeLocal(); mirror([recOf('candidate')(c)]); }
export function putCase(c: NordeaCase) { const s = load(); s.cases = [...s.cases.filter((x) => x.id !== c.id), c]; writeLocal(); mirror([recOf('case')(c)]); }

/** Reset demo / delete a customer: their pipeline records go too. */
export function clearPipeline(userId?: string) {
  const s = load();
  const gone = [...s.runs, ...s.candidates, ...s.cases].filter((x) => !userId || x.userId === userId).map((x) => x.id);
  s.runs = s.runs.filter((x) => userId && x.userId !== userId);
  s.candidates = s.candidates.filter((x) => userId && x.userId !== userId);
  s.cases = s.cases.filter((x) => userId && x.userId !== userId);
  for (const id of gone) presenter.delete(id);
  writeLocal();
  mirror([], gone);
}

/** Tests: forget the in-memory copy (the file stays). */
export function _forgetForTests() { st = null; }

// ---- presenter-only memory: the text of what was dropped (never stored) ----
export interface DroppedSignal { text: string; reason: string; decision: 'dropped' | 'merged' | 'private' }
const presenter = new Map<string, DroppedSignal[]>();
export const rememberDropped = (runId: string, list: DroppedSignal[]) => presenter.set(runId, list.slice(0, 80));
export const droppedFor = (runId: string) => presenter.get(runId) || [];
