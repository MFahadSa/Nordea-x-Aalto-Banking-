/**
 * Owner decision (2026-11-01 16:35, confirmed 16:37): cabinet-db.json moves INTO the three agent
 * databases - no JSON store, no fourth database - and is deleted forever once the move is verified.
 *
 * Safety contract (fail closed everywhere):
 * - Pre-scan BEFORE any write: every top-level key, every User field, and every record id/userId
 *   must be one this migration knows; anything unmapped aborts with the exact field named.
 * - Conflicts abort: a destination row that already exists with DIFFERENT content is never
 *   silently overwritten; the exact record is reported and nothing is deleted.
 * - Writes are idempotent upserts (single statements or per-kind transactions), so a crash means
 *   "run it again": the rerun completes what is missing and re-verifies everything.
 * - Verification reads back through the stores' own loaders and compares field-by-field
 *   (consent, provenance, evidence and history included) across all three databases.
 * - cabinet-db.json is deleted ONLY after every check passes; any failure keeps the file intact.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR, remoteConfigured, remoteUrl, hydrateAgentStoresDetailed, rowsOf, fileFor, type DbKind } from './store/common.js';
import { saveProfile, putGoal, putDocument, putAppRows, loadProfile, loadUserDb, loadDocuments, loadAppRows } from './store/userStore.js';
import { putEntry, addHistoryEvent, putShare, putUndoRecord, putAppAccessLog, putMigrationLedger, loadCmDb, loadHistory, loadShares, listUndoRecords, loadAppAccessLog, type MigrationLedgerRow } from './store/cmStore.js';
import { saveBalances, putTransactions, putBankAccount, putBalanceSnapshot, putImportBatch, putAppBankRows, putAppRewards, loadNordeaDb, loadBalances, loadBalanceSnapshots, loadImportBatches, loadAppBankRows, loadAppRewards } from './store/nordeaStore.js';
import { migrateLegacyState, entryToGoal, entryToCm, getEmptyLegacyState, type DatabaseState } from '../db.js';
import type { CabinetEntry, ChatMessage, Conversation, TopicLogEntry, AccessLogEntry, Earning, DataReward, User } from '../../types.js';

const DB_FILE = path.join(DATA_DIR, 'cabinet-db.json');

/** Legacy RewardState (points plumbing) as the old store kept it. */
interface RewardState { points: number; pointsSpent?: number; redeemed?: { rewardId: string; title: string; pts: number; at: string }[] }
type RawFile = Partial<DatabaseState> & { rewards?: Record<string, RewardState> };

/** Every User field this migration maps. Anything else fails closed. */
const KNOWN_USER_KEYS = new Set(['id', 'offersOff', 'pointsSpent', 'redeemed', 'nordeaData', 'extraMonthly', 'persona', 'name', 'age', 'roleDescription', 'viewMode', 'layoutPrefs', 'accounts', 'points']);
const KNOWN_TOP_KEYS = new Set([...(Object.keys(getEmptyLegacyState()) as (keyof DatabaseState)[]), 'rewards']);

/** Canonical JSON (sorted keys) so comparisons do not depend on key order. */
const canon = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`;
};
const hash = (v: unknown) => crypto.createHash('sha256').update(canon(v)).digest('hex').slice(0, 16);

interface PlannedRow { table: string; store: 'user' | 'cm' | 'nordea'; id: string; json: string }

/** What a verified destination must contain for one customer, as canonical JSON per table per id. */
function expectedRows(st: DatabaseState, rewards: Record<string, RewardState>, uid: string): PlannedRow[] {
  const out: PlannedRow[] = [];
  const u = st.users[uid];
  if (u) {
    const { points, pointsSpent, redeemed, accounts, id: _id, ...profile } = u;
    out.push({ table: 'kv:profile', store: 'user', id: uid, json: canon(profile) });
    if (accounts) out.push({ table: 'kv:balances', store: 'nordea', id: uid, json: canon(accounts) });
    const rw = rewards[uid] ?? { points: points ?? 0, ...(pointsSpent !== undefined ? { pointsSpent } : {}), ...(redeemed ? { redeemed } : {}) };
    out.push({ table: 'app_rewards', store: 'nordea', id: uid, json: canon(rw) });
  }
  for (const e of st.cabinetEntries.filter((x) => x.userId === uid)) {
    if (e.type === 'goal') {
      const g = entryToGoal(e);
      out.push({ table: 'goals', store: 'user', id: g.id, json: canon({ id: g.id, title: g.title, detail: g.detail, createdAt: g.createdAt, doc: e }) });
    } else {
      const a = entryToCm(e);
      out.push({ table: 'entries', store: 'cm', id: a.id, json: canon({ id: a.id, title: a.title, detail: a.detail, status: a.status, createdAt: a.createdAt, doc: e }) });
    }
  }
  for (const h of st.entryHistory.filter((x) => x.userId === uid)) out.push({ table: 'history', store: 'cm', id: h.id, json: canon(h) });
  for (const s of st.shares.filter((x) => x.userId === uid)) out.push({ table: 'shares', store: 'cm', id: s.id, json: canon(s) });
  for (const r of st.undoRecords.filter((x) => x.userId === uid)) out.push({ table: 'undo', store: 'cm', id: r.undoToken, json: canon(r) });
  for (const d of st.documents.filter((x) => x.userId === uid)) out.push({ table: 'documents', store: 'user', id: d.id, json: canon(d) });
  for (const t of st.transactions.filter((x) => x.userId === uid)) out.push({ table: 'transactions', store: 'nordea', id: t.id, json: canon(t) });
  for (const a of st.bankAccounts.filter((x) => x.userId === uid)) out.push({ table: 'accounts', store: 'nordea', id: a.id, json: canon(a) });
  for (const b of st.balanceSnapshots.filter((x) => x.userId === uid)) out.push({ table: 'balance_snapshots', store: 'nordea', id: b.id, json: canon(b) });
  for (const b of st.importBatches.filter((x) => x.userId === uid)) out.push({ table: 'import_batches', store: 'nordea', id: b.id, json: canon(b) });
  for (const c of st.conversations.filter((x) => x.userId === uid)) out.push({ table: 'app_conversations', store: 'user', id: c.id, json: canon(c) });
  for (const m of st.messages.filter((x) => x.userId === uid)) out.push({ table: 'app_messages', store: 'user', id: m.id, json: canon(m) });
  for (const t of st.topicLog.filter((x) => x.userId === uid)) out.push({ table: 'app_topic_log', store: 'user', id: t.id, json: canon(t) });
  for (const a of st.accessLog.filter((x) => x.userId === uid)) out.push({ table: 'app_access_log', store: 'cm', id: a.id, json: canon(a) });
  for (const e of st.earnings.filter((x) => x.userId === uid)) out.push({ table: 'app_earnings', store: 'nordea', id: e.id, json: canon(e) });
  for (const d of st.dataRewards.filter((x) => x.userId === uid)) out.push({ table: 'app_data_rewards', store: 'nordea', id: d.id, json: canon(d) });
  return out;
}

/** What is actually in the destination stores for one customer, same shape as expectedRows. */
function actualRows(uid: string): PlannedRow[] {
  const out: PlannedRow[] = [];
  const profile = loadProfile(uid);
  if (profile) out.push({ table: 'kv:profile', store: 'user', id: uid, json: canon(profile) });
  const balances = loadBalances(uid);
  if (balances) out.push({ table: 'kv:balances', store: 'nordea', id: uid, json: canon(balances) });
  const rw = loadAppRewards(uid);
  if (rw) out.push({ table: 'app_rewards', store: 'nordea', id: uid, json: canon(JSON.parse(rw)) });
  for (const g of loadUserDb(uid).goals) out.push({ table: 'goals', store: 'user', id: g.id, json: canon({ id: g.id, title: g.title, detail: g.detail, createdAt: g.createdAt, doc: g.doc ?? null }) });
  for (const e of loadCmDb(uid).entries) out.push({ table: 'entries', store: 'cm', id: e.id, json: canon({ id: e.id, title: e.title, detail: e.detail, status: e.status, createdAt: e.createdAt, doc: e.doc ?? null }) });
  for (const h of loadHistory(uid)) out.push({ table: 'history', store: 'cm', id: h.id, json: canon(h) });
  for (const s of loadShares(uid)) out.push({ table: 'shares', store: 'cm', id: s.id, json: canon(s) });
  for (const r of listUndoRecords(uid)) out.push({ table: 'undo', store: 'cm', id: r.undoToken, json: canon(r) });
  for (const d of loadDocuments(uid)) out.push({ table: 'documents', store: 'user', id: d.id, json: canon(d) });
  const nd = loadNordeaDb(uid);
  for (const t of nd?.transactions ?? []) out.push({ table: 'transactions', store: 'nordea', id: t.id, json: canon(t) });
  for (const a of nd?.accounts ?? []) out.push({ table: 'accounts', store: 'nordea', id: a.id, json: canon(a) });
  for (const b of loadBalanceSnapshots(uid)) out.push({ table: 'balance_snapshots', store: 'nordea', id: b.id, json: canon(b) });
  for (const b of loadImportBatches(uid)) out.push({ table: 'import_batches', store: 'nordea', id: b.id, json: canon(b) });
  for (const c of loadAppRows<Conversation>(uid, 'app_conversations')) out.push({ table: 'app_conversations', store: 'user', id: c.id, json: canon(c) });
  for (const m of loadAppRows<ChatMessage>(uid, 'app_messages')) out.push({ table: 'app_messages', store: 'user', id: m.id, json: canon(m) });
  for (const t of loadAppRows<TopicLogEntry>(uid, 'app_topic_log')) out.push({ table: 'app_topic_log', store: 'user', id: t.id, json: canon(t) });
  for (const a of loadAppAccessLog<AccessLogEntry>(uid)) out.push({ table: 'app_access_log', store: 'cm', id: a.id, json: canon(a) });
  for (const e of loadAppBankRows<Earning>(uid, 'app_earnings')) out.push({ table: 'app_earnings', store: 'nordea', id: e.id, json: canon(e) });
  for (const d of loadAppBankRows<DataReward>(uid, 'app_data_rewards')) out.push({ table: 'app_data_rewards', store: 'nordea', id: d.id, json: canon(d) });
  return out;
}

export interface MigrationResult {
  ok: boolean;
  deleted: boolean;
  alreadyDone: boolean;
  failures: string[];
  ledger: MigrationLedgerRow[];
  /** Set only on a deferred-delete pass (hosted mode finishes the delete itself). */
  sourceHash?: string;
}

/**
 * Migrate data/cabinet-db.json into the three agent databases, verify field-by-field, and only
 * then delete the file. Safe to re-run: upserts are idempotent and verification runs every time.
 */
export function runLegacyMigration(opts?: { deferDelete?: boolean }): MigrationResult {
  const failures: string[] = [];
  if (!fs.existsSync(DB_FILE)) {
    return { ok: true, deleted: false, alreadyDone: true, failures: [], ledger: [] };
  }
  let raw: RawFile;
  let sourceHash: string;
  try {
    const buf = fs.readFileSync(DB_FILE);
    sourceHash = crypto.createHash('sha256').update(buf).digest('hex');
    raw = JSON.parse(buf.toString('utf-8')) as RawFile;
  } catch (err) {
    return { ok: false, deleted: false, alreadyDone: false, failures: [`cabinet-db.json is not readable JSON: ${(err as Error).message}`], ledger: [] };
  }

  // ---- Fail-closed pre-scan: nothing is written unless every key and record is understood ----
  for (const k of Object.keys(raw)) {
    if (!KNOWN_TOP_KEYS.has(k)) failures.push(`unhandled top-level field "${k}" in cabinet-db.json`);
  }
  const rewards = raw.rewards ?? {};
  const st = migrateLegacyState({ ...getEmptyLegacyState(), ...raw } as DatabaseState);
  for (const [uid, u] of Object.entries(st.users)) {
    if (u.id !== uid) failures.push(`user record key "${uid}" does not match its id "${u.id}"`);
    for (const k of Object.keys(u)) {
      if (!KNOWN_USER_KEYS.has(k)) failures.push(`unhandled field "users.${uid}.${k}" - refusing to guess where it belongs`);
    }
  }
  const routed: [string, { id?: string; userId?: string }[]][] = [
    ['cabinetEntries', st.cabinetEntries], ['transactions', st.transactions], ['messages', st.messages],
    ['accessLog', st.accessLog], ['topicLog', st.topicLog], ['undoRecords', st.undoRecords],
    ['conversations', st.conversations], ['earnings', st.earnings], ['shares', st.shares],
    ['documents', st.documents], ['entryHistory', st.entryHistory], ['dataRewards', st.dataRewards],
    ['balanceSnapshots', st.balanceSnapshots], ['importBatches', st.importBatches], ['bankAccounts', st.bankAccounts],
  ];
  for (const [kind, rows] of routed) {
    for (const r of rows) {
      if (!r.id && kind !== 'undoRecords') failures.push(`${kind}: a record has no id`);
      if (!r.userId) failures.push(`${kind}.${r.id ?? '?'}: no userId - refusing to guess the owner`);
    }
  }
  if (failures.length) return { ok: false, deleted: false, alreadyDone: false, failures, ledger: [] };

  const uids = new Set<string>([
    ...Object.keys(st.users), ...Object.keys(rewards),
    ...routed.flatMap(([, rows]) => rows.map((r) => r.userId!)),
  ]);

  // ---- Conflict scan: an existing destination row with different content aborts everything ----
  for (const uid of uids) {
    const actual = new Map(actualRows(uid).map((r) => [`${r.table}:${r.id}`, r.json]));
    for (const exp of expectedRows(st, rewards, uid)) {
      const cur = actual.get(`${exp.table}:${exp.id}`);
      if (cur !== undefined && cur !== exp.json) failures.push(`conflict: ${exp.store}.db ${exp.table} "${exp.id}" already exists with different content`);
    }
  }
  if (failures.length) return { ok: false, deleted: false, alreadyDone: false, failures, ledger: [] };

  // ---- Writes: the same mapping the app's G1 path uses (upserts; crash = run again) ----
  const ledger: MigrationLedgerRow[] = [];
  const now = new Date().toISOString();
  for (const uid of uids) {
    const uLedger: MigrationLedgerRow[] = [];
    const mark = (kind: string, rows: unknown[]) => uLedger.push({ kind, sourceHash: hash(rows), rows: rows.length, doneAt: now });
    const u = st.users[uid];
    if (u) {
      const { points, pointsSpent, redeemed, accounts, id: _id, ...profile } = u;
      saveProfile(uid, profile as Omit<User, 'id' | 'accounts' | 'points'>);
      if (accounts) saveBalances(uid, accounts);
      const rw = rewards[uid] ?? { points: points ?? 0, ...(pointsSpent !== undefined ? { pointsSpent } : {}), ...(redeemed ? { redeemed } : {}) };
      putAppRewards(uid, canon(rw));
    }
    const goals = st.cabinetEntries.filter((x) => x.userId === uid && x.type === 'goal');
    const entries = st.cabinetEntries.filter((x) => x.userId === uid && x.type !== 'goal');
    for (const e of goals) putGoal(uid, entryToGoal(e));
    for (const e of entries) putEntry(uid, entryToCm(e));
    for (const h of st.entryHistory.filter((x) => x.userId === uid)) addHistoryEvent(uid, h);
    for (const s of st.shares.filter((x) => x.userId === uid)) putShare(uid, s);
    for (const r of st.undoRecords.filter((x) => x.userId === uid)) putUndoRecord(uid, r);
    for (const d of st.documents.filter((x) => x.userId === uid)) putDocument(d);
    const txs = st.transactions.filter((x) => x.userId === uid);
    if (txs.length) putTransactions(uid, txs);
    for (const a of st.bankAccounts.filter((x) => x.userId === uid)) putBankAccount(uid, a);
    for (const b of st.balanceSnapshots.filter((x) => x.userId === uid)) putBalanceSnapshot(uid, b);
    for (const b of st.importBatches.filter((x) => x.userId === uid)) putImportBatch(uid, b);
    putAppRows(uid, 'app_conversations', st.conversations.filter((x) => x.userId === uid).map((c) => ({ id: c.id, ts: c.createdAt, json: canon(c) })));
    putAppRows(uid, 'app_messages', st.messages.filter((x) => x.userId === uid).map((m) => ({ id: m.id, ts: m.createdAt, json: canon(m) })));
    putAppRows(uid, 'app_topic_log', st.topicLog.filter((x) => x.userId === uid).map((t) => ({ id: t.id, ts: t.timestamp, json: canon(t) })));
    putAppAccessLog(uid, st.accessLog.filter((x) => x.userId === uid).map((a) => ({ id: a.id, at: a.timestamp, json: canon(a) })));
    putAppBankRows(uid, 'app_earnings', st.earnings.filter((x) => x.userId === uid).map((e) => ({ id: e.id, at: e.createdAt, json: canon(e) })));
    putAppBankRows(uid, 'app_data_rewards', st.dataRewards.filter((x) => x.userId === uid).map((d) => ({ id: d.id, at: d.at, json: canon(d) })));
    mark('users', u ? [u] : []);
    mark('cabinetEntries', st.cabinetEntries.filter((x) => x.userId === uid));
    mark('entryHistory', st.entryHistory.filter((x) => x.userId === uid));
    mark('shares', st.shares.filter((x) => x.userId === uid));
    mark('undoRecords', st.undoRecords.filter((x) => x.userId === uid));
    mark('documents', st.documents.filter((x) => x.userId === uid));
    mark('transactions', txs);
    mark('bankAccounts', st.bankAccounts.filter((x) => x.userId === uid));
    mark('balanceSnapshots', st.balanceSnapshots.filter((x) => x.userId === uid));
    mark('importBatches', st.importBatches.filter((x) => x.userId === uid));
    mark('conversations', st.conversations.filter((x) => x.userId === uid));
    mark('messages', st.messages.filter((x) => x.userId === uid));
    mark('topicLog', st.topicLog.filter((x) => x.userId === uid));
    mark('accessLog', st.accessLog.filter((x) => x.userId === uid));
    mark('earnings', st.earnings.filter((x) => x.userId === uid));
    mark('dataRewards', st.dataRewards.filter((x) => x.userId === uid));
    mark('rewards', rewards[uid] ? [rewards[uid]] : []);
    putMigrationLedger(uid, uLedger);
    ledger.push(...uLedger);
  }

  // ---- Verify: read back through the stores' own loaders, compare every field ----
  for (const uid of uids) {
    const actual = new Map(actualRows(uid).map((r) => [`${r.table}:${r.id}`, r.json]));
    for (const exp of expectedRows(st, rewards, uid)) {
      const cur = actual.get(`${exp.table}:${exp.id}`);
      if (cur === undefined) failures.push(`missing after write: ${exp.store}.db ${exp.table} "${exp.id}"`);
      else if (cur !== exp.json) failures.push(`content mismatch after write: ${exp.store}.db ${exp.table} "${exp.id}"`);
    }
  }
  if (failures.length) {
    failures.unshift('verification FAILED - cabinet-db.json was kept; fix the cause and run again');
    return { ok: false, deleted: false, alreadyDone: false, failures, ledger };
  }

  if (opts?.deferDelete) return { ok: true, deleted: false, alreadyDone: false, failures: [], ledger, sourceHash };
  return finalizeLegacyDelete(sourceHash, ledger);
}

/** The last step, separated so hosted mode can push + verify remotely before anything is deleted.
 *  The source must still be the same bytes we migrated from (crash-resume safety: a file that
 *  changed mid-migration is a NEW source - never delete it). */
export function finalizeLegacyDelete(sourceHash: string, ledger: MigrationLedgerRow[] = []): MigrationResult {
  const nowHash = crypto.createHash('sha256').update(fs.readFileSync(DB_FILE)).digest('hex');
  if (nowHash !== sourceHash) {
    return { ok: false, deleted: false, alreadyDone: false,
      failures: ['cabinet-db.json changed during the migration - kept; run again against the current file'], ledger };
  }
  fs.unlinkSync(DB_FILE);
  return { ok: true, deleted: true, alreadyDone: false, failures: [], ledger };
}

const HOSTED_KINDS: DbKind[] = ['user', 'cm', 'nordea'];

/**
 * G34: hosted-safe migration. In hosted mode (any store has a remote URL) the legacy file is
 * deleted only after EVERY migrated row is durably hosted: hydrate first (a failed pull stops
 * everything - local files may be stale), write + verify locally, AWAIT the push of every
 * customer database, read the hosted tables back and compare every row, and only then delete.
 * All three role URLs are required: a store without one would leave its migrated data local-only
 * while claiming verified, so that fails closed. A failed push or read-back keeps the file.
 */
export async function runLegacyMigrationHostedSafe(): Promise<MigrationResult> {
  const configured = HOSTED_KINDS.filter(remoteConfigured);
  if (!configured.length) return runLegacyMigration(); // local-only mode: unchanged
  if (!fs.existsSync(DB_FILE)) return { ok: true, deleted: false, alreadyDone: true, failures: [], ledger: [] };
  const missing = HOSTED_KINDS.filter((k) => !remoteConfigured(k));
  if (missing.length) {
    return { ok: false, deleted: false, alreadyDone: false, ledger: [],
      failures: [`hosted mode is partially configured (missing ${missing.join(', ')} DB URL) - refusing to migrate; migrated data would sit local-only while claiming verified`] };
  }
  // 1. Hydrate: the hosted tables are the source of truth; a failed pull stops the migration.
  const h = await hydrateAgentStoresDetailed();
  if (h.failed.length) {
    return { ok: false, deleted: false, alreadyDone: false, ledger: [],
      failures: [`hosted pull failed for ${h.failed.join(', ')} - cabinet-db.json kept; fix the connection and run again`] };
  }
  // 2. Local write + field-level verify (fail-closed, conflicts, pre-scan) - no delete yet.
  const core = runLegacyMigration({ deferDelete: true });
  if (!core.ok) return core;
  // 3. Awaited push of every customer's three databases (never the fire-and-forget flush timer).
  const R = await import('./store/remote.js');
  const uids = listMigratedUids();
  for (const uid of uids) {
    for (const kind of configured) {
      const url = remoteUrl(kind)!;
      try {
        const file = fileFor(uid, kind);
        await R.assertReplaceSafe(kind, url, uid, fs.existsSync(file));
        await R.pushCustomer(kind, url, uid, rowsOf(file, kind).map((r) => ({ user_id: uid, ...r })));
      } catch (err) {
        return { ok: false, deleted: false, alreadyDone: false, ledger: core.ledger,
          failures: [`hosted push failed for ${uid}/${kind}: ${err instanceof Error ? err.message : err} - cabinet-db.json kept; local rows are intact, run again`] };
      }
    }
  }
  // 4. Hosted read-back: every local row of every mapped namespace must exist hosted, identical.
  for (const uid of uids) {
    for (const kind of configured) {
      let hosted: Map<string, string>;
      try {
        // canon() on both sides: the hosted column is jsonb, which may return keys in any order.
        const rows = (await R.pullStore(kind, remoteUrl(kind)!)).filter((r) => r.user_id === uid);
        hosted = new Map(rows.map((r) => [`${r.table_name}:${r.id}`, canon(r.data)]));
      } catch (err) {
        return { ok: false, deleted: false, alreadyDone: false, ledger: core.ledger,
          failures: [`hosted read-back failed for ${uid}/${kind}: ${err instanceof Error ? err.message : err} - cabinet-db.json kept`] };
      }
      const local = rowsOf(fileFor(uid, kind), kind);
      const failures: string[] = [];
      for (const r of local) {
        const cur = hosted.get(`${r.table_name}:${r.id}`);
        if (cur === undefined) failures.push(`missing hosted: ${kind}/${r.table_name} "${r.id}"`);
        else if (cur !== canon(r.data)) failures.push(`hosted mismatch: ${kind}/${r.table_name} "${r.id}"`);
      }
      const extra = [...hosted.keys()].filter((k) => !local.some((r) => `${r.table_name}:${r.id}` === k));
      for (const k of extra) failures.push(`unexpected hosted row: ${kind}/${k}`);
      if (failures.length) {
        failures.unshift(`hosted verification FAILED for ${uid}/${kind} - cabinet-db.json kept; push is idempotent, run again`);
        return { ok: false, deleted: false, alreadyDone: false, failures, ledger: core.ledger };
      }
    }
  }
  // 5. Only now the source may go (with the same unchanged-source guard).
  return finalizeLegacyDelete(core.sourceHash!, core.ledger);
}

/** Every customer with at least one local store file (post-write, pre-delete set). */
function listMigratedUids(): string[] {
  const dir = DATA_DIR;
  const archDir = path.join(dir, 'arch');
  if (!fs.existsSync(archDir)) return [];
  const set = new Set<string>();
  for (const f of fs.readdirSync(archDir)) {
    const m = f.match(/^(.+)\.(user|cm|nordea)\.db$/);
    if (m) set.add(m[1]);
  }
  return [...set];
}
