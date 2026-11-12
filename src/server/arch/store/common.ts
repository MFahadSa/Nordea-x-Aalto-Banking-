/**
 * Physical storage plumbing shared by the per-database store modules.
 * One SQLite file per database per customer, next to (never inside) the app's own data.
 * An agent only ever opens its own database file; everything between agents is an explicit message.
 *
 * Local prototype boundary, stated honestly: separation is one SQLite file per database with
 * per-agent store modules (each agent module imports only its own store), pinned by a source-scan
 * boundary test. There is no separate database server, credential, or OS-user isolation here -
 * that is the live-Supabase target, not this local demo.
 */
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { canonicalCustomerId, isCanonicalCustomerId } from '../../customerId.js';

export const DATA_DIR = process.env.CABINET_DATA_DIR ? path.resolve(process.env.CABINET_DATA_DIR) : path.resolve(process.cwd(), 'data');
export const ARCH_DIR = path.join(DATA_DIR, 'arch');

export type DbKind = 'user' | 'cm' | 'nordea' | 'bus';

export function fileFor(uid: string, db: DbKind) {
  const safe = canonicalCustomerId(uid);
  return path.join(ARCH_DIR, `${safe}.${db}.db`);
}
export const legacyFileFor = (uid: string, db: DbKind) => fileFor(uid, db).replace(/\.db$/, '.json');

const SCHEMAS: Record<DbKind, string> = {
  user: `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL, doc TEXT);
    CREATE TABLE IF NOT EXISTS personal_facts (id TEXT PRIMARY KEY, source TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL, via_airlock_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_conversations (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_messages (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_topic_log (id TEXT PRIMARY KEY, at TEXT NOT NULL, json TEXT NOT NULL);`,
  cm: `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, goal_ids TEXT NOT NULL,
      proposed_by TEXT NOT NULL, via_message_id TEXT, evidence TEXT, status TEXT NOT NULL,
      dispute_reason TEXT, created_at TEXT NOT NULL, observed TEXT, risk TEXT, auto_accepted INTEGER, doc TEXT, approval_id TEXT, approval_level INTEGER, evidence_text TEXT);
    CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, entry_id TEXT NOT NULL, at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS undo (token TEXT PRIMARY KEY, at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_access_log (id TEXT PRIMARY KEY, at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_migration_ledger (kind TEXT PRIMARY KEY, source_hash TEXT NOT NULL, rows INTEGER NOT NULL, done_at TEXT NOT NULL);`,
  nordea: `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, category TEXT NOT NULL, amount REAL NOT NULL,
      account TEXT NOT NULL, description TEXT, json TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE TABLE IF NOT EXISTS balance_snapshots (id TEXT PRIMARY KEY, account_key TEXT NOT NULL, at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS import_batches (id TEXT PRIMARY KEY, at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_earnings (id TEXT PRIMARY KEY, at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_data_rewards (id TEXT PRIMARY KEY, at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_rewards (user_id TEXT PRIMARY KEY, json TEXT NOT NULL);`,
  bus: `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, at TEXT NOT NULL, frm TEXT NOT NULL, tto TEXT NOT NULL,
      type TEXT NOT NULL, summary TEXT NOT NULL, payload TEXT, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS airlock (
      id TEXT PRIMARY KEY, at TEXT NOT NULL, source TEXT NOT NULL, items TEXT NOT NULL,
      status TEXT NOT NULL, decided_at TEXT);`,
};

/** Id column per SQLite table, per database kind (used by the G6 hosted sync). */
const TABLE_IDS: Record<DbKind, Record<string, string>> = {
  user: { kv: 'k', goals: 'id', personal_facts: 'id', documents: 'id', app_conversations: 'id', app_messages: 'id', app_topic_log: 'id' },
  cm: { kv: 'k', entries: 'id', history: 'id', shares: 'id', undo: 'token', app_access_log: 'id', app_migration_ledger: 'kind' },
  nordea: { kv: 'k', accounts: 'id', transactions: 'id', balance_snapshots: 'id', import_batches: 'id', app_earnings: 'id', app_data_rewards: 'id', app_rewards: 'user_id' },
  bus: { kv: 'k', messages: 'id', airlock: 'id' },
};

/**
 * G21/G20: column migrations for database files left by older versions. The single list the
 * app (userStore/cmStore), the hydrate below and (mirrored in Python) scripts/load_data.py use.
 */
const MIGRATIONS: Partial<Record<DbKind, { table: string; col: string; ddl: string }[]>> = {
  user: [{ table: 'goals', col: 'doc', ddl: 'doc TEXT' }],
  cm: [
    { table: 'entries', col: 'observed', ddl: 'observed TEXT' },
    { table: 'entries', col: 'risk', ddl: 'risk TEXT' },
    { table: 'entries', col: 'auto_accepted', ddl: 'auto_accepted INTEGER' },
    { table: 'entries', col: 'doc', ddl: 'doc TEXT' },
    { table: 'entries', col: 'approval_id', ddl: 'approval_id TEXT' },
    { table: 'entries', col: 'approval_level', ddl: 'approval_level INTEGER' },
    { table: 'entries', col: 'evidence_text', ddl: 'evidence_text TEXT' },
  ],
};

/** Add each missing migration column in place (no-op on a current file). */
export function applyMigrations(db: DatabaseSync, kind: DbKind) {
  for (const m of MIGRATIONS[kind] ?? []) {
    const cols = db.prepare(`PRAGMA table_info(${m.table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === m.col)) db.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.ddl}`);
  }
}

/**
 * G6: per-store hosted secret, configured by the owning store module and ONLY by it
 * (each store module passes only its own env var - pinned by a source-scan test).
 * common.ts itself never names an env var.
 */
const REMOTE_SECRETS = new Map<DbKind, string>();
export function configureRemote(kind: DbKind, url: string | undefined) {
  if (url) REMOTE_SECRETS.set(kind, url);
}
export const remoteConfigured = (kind: DbKind) => REMOTE_SECRETS.has(kind);
/** v20: forget a hosted target that could not be read at startup (e.g. the Supabase tables were never
 *  created), so the store works on its local file instead of half-hosted. Only the web-API mirror
 *  is ever dropped this way; a configured role URL stays (its failures are logged as before). */
export function dropRemote(kind: DbKind) { if (REMOTE_SECRETS.get(kind)?.startsWith('supabase-rest:')) REMOTE_SECRETS.delete(kind); }
/** The configured hosted URL for one store kind (undefined when local-only). */
export const remoteUrl = (kind: DbKind) => REMOTE_SECRETS.get(kind);

/** Write verbs mark a handle dirty; a dirty remote-backed handle flushes on close. */
const WRITE_VERB = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)/i;

/** One app-layer hook notified of EVERY write statement (local and hosted alike), so the
 *  realtime layer invalidates on actual writes, not on assumed call sites. The store layer
 *  never imports the app; transactions still pass through prepare/exec, so their statements
 *  are seen too. Reads never fire it. */
let writeHook: ((file: string, kind: DbKind) => void) | null = null;
export function setStoreWriteHook(fn: ((file: string, kind: DbKind) => void) | null) { writeHook = fn; }

export function openDb(file: string, kind: DbKind): DatabaseSync {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMAS[kind]);
  const remote = REMOTE_SECRETS.has(kind);
  let dirty = false;
  const wrap = <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => {
    if (typeof args[0] === 'string' && WRITE_VERB.test(args[0])) {
      dirty = true;
      try { writeHook?.(file, kind); } catch { /* a broken listener must never break a write */ }
    }
    return fn.apply(db, args);
  };
  const wrapped = {
    prepare: wrap(db.prepare.bind(db) as (...a: unknown[]) => unknown),
    exec: wrap(db.exec.bind(db) as (...a: unknown[]) => unknown),
    close: () => { db.close(); if (remote && dirty) scheduleFlush(file, kind); },
  };
  return wrapped as unknown as DatabaseSync;
}

// ---------- G6: hosted sync (hydrate at startup, flush after writes) ----------

const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const flushChains = new Map<string, Promise<void>>();

/** Serialize every row of every table of one local database file for its hosted table.
 *  Exported for scripts/load_remote.ts (the hosted data loader, G20). */
export function rowsOf(file: string, kind: DbKind): { table_name: string; id: string; data: Record<string, unknown> }[] {
  // G24: a missing file means zero rows (a push still replaces/merges that uid's hosted rows);
  // never create a file here - opening a missing path would, and the SELECT would fail on it.
  if (!fs.existsSync(file)) return [];
  const db = new DatabaseSync(file);
  try {
    const out: { table_name: string; id: string; data: Record<string, unknown> }[] = [];
    // G24: an existing but empty/old file (e.g. left by a crashed pre-fix run) may lack tables
    // entirely - read an absent table as 0 rows instead of dying with 'no such table'.
    const present = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name));
    for (const [table, idCol] of Object.entries(TABLE_IDS[kind])) {
      if (!present.has(table)) continue;
      for (const row of db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]) {
        out.push({ table_name: table, id: String(row[idCol]), data: row });
      }
    }
    return out;
  } finally { db.close(); }
}

/** Push one customer's current local file to its hosted table, queued after earlier pushes. */
function queueFlush(key: string, file: string, kind: DbKind) {
  const url = REMOTE_SECRETS.get(kind);
  if (!url) return;
  const uid = path.basename(file).replace(/\.(user|cm|nordea|bus)\.db$/, '');
  const rows = rowsOf(file, kind).map((r) => ({ user_id: uid, ...r }));
  const prev = flushChains.get(key) ?? Promise.resolve();
  const next = prev.then(() => import('./remote.js').then(async (R) => {
    // G24: if the local file vanished between write and flush, do not replace hosted rows with it.
    await R.assertReplaceSafe(kind, url, uid, fs.existsSync(file));
    return R.pushCustomer(kind, url, uid, rows);
  }))
    .catch((err) => console.error(`Remote flush failed for ${key}:`, err instanceof Error ? err.message : err));
  flushChains.set(key, next);
}

function scheduleFlush(file: string, kind: DbKind) {
  if (!REMOTE_SECRETS.has(kind)) return;
  const key = `${kind}:${file}`;
  if (flushTimers.has(key)) clearTimeout(flushTimers.get(key)!);
  flushTimers.set(key, setTimeout(() => {
    flushTimers.delete(key);
    queueFlush(key, file, kind);
  }, 250));
}

/** F-C: a graceful shutdown must not drop a debounced hosted write: fire every pending
 *  flush NOW (from the current local files) and wait for the queued pushes to finish. */
export async function drainRemoteFlushes(): Promise<void> {
  const pending = [...flushTimers.keys()];
  for (const [, timer] of flushTimers) clearTimeout(timer);
  flushTimers.clear();
  for (const key of pending) {
    const kind = key.slice(0, key.indexOf(':')) as DbKind;
    queueFlush(key, key.slice(kind.length + 1), kind);
  }
  await Promise.all([...flushChains.values()]);
}

/**
 * Hydrate the local SQLite files from the hosted tables at startup (hosted mode only).
 * The remote tables are the source of truth when configured: each customer's local rows
 * for that kind are replaced by the remote ones. Runs before the app serves requests.
 */
/** G20: hydrate with per-store failure reporting (the hosted data loader must stop on a failed pull). */
export async function hydrateAgentStoresDetailed(): Promise<HydrateResult> {
  return hydrateDetailed();
}
export interface HydrateResult { hydrated: string[]; failed: string[]; skipped: HydrateSkip[]; errors: Partial<Record<DbKind, string>>; hostedUids: Partial<Record<DbKind, string[]>> }

/** v23: send every local customer that has no rows in the hosted table yet (e.g. demo data loaded
 *  while Supabase was unreachable), so the hosted copy is complete once the connection works. */
export function pushLocalMissingFromHosted(kind: DbKind, hostedUids: string[]): number {
  if (!REMOTE_SECRETS.has(kind)) return 0;
  const have = new Set(hostedUids);
  let n = 0;
  for (const uid of listCustomers()) {
    if (have.has(uid)) continue;
    const file = fileFor(uid, kind);
    if (!fs.existsSync(file)) continue;
    queueFlush(`${kind}:${file}`, file, kind);
    n++;
  }
  return n;
}

export async function hydrateAgentStores(): Promise<string[]> {
  return (await hydrateDetailed()).hydrated;
}

/** D12: hosted id sets skipped by the last hydrate because the id is not canonical. Hosted rows are left unchanged. */
export interface HydrateSkip { store: DbKind; id: string; rows: number }
let lastHydrateSkipped: HydrateSkip[] = [];
export const hydrateSkipped = () => ({ count: lastHydrateSkipped.length, ids: lastHydrateSkipped.slice(), hostedUnchanged: true as const });

async function hydrateDetailed(): Promise<HydrateResult> {
  lastHydrateSkipped = [];
  const hydrated: string[] = [];
  const failed: string[] = [];
  const errors: Partial<Record<DbKind, string>> = {};
  const hostedUids: Partial<Record<DbKind, string[]>> = {};
  for (const [kind, url] of REMOTE_SECRETS) {
    if (kind === 'bus') continue; // the bus is transient agent messaging, local by design
    try {
      const R = await import('./remote.js');
      const rows = await R.pullStore(kind, url);
      const byUid = new Map<string, typeof rows>();
      for (const r of rows) {
        const list = byUid.get(r.user_id) ?? [];
        list.push(r);
        byUid.set(r.user_id, list);
      }
      hostedUids[kind] = [...byUid.keys()];
      for (const [uid, list] of byUid) {
        // D12: a hosted row set under a non-canonical id is left untouched in the hosted store and not hydrated.
        if (!isCanonicalCustomerId(uid)) { lastHydrateSkipped.push({ store: kind, id: uid, rows: list.length }); console.error(`Remote hydrate skipped a non-canonical customer id in ${kind} (${list.length} rows, left unchanged hosted).`); continue; }
        const file = fileFor(uid, kind);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const db = new DatabaseSync(file);
        try {
          db.exec(SCHEMAS[kind]);
          applyMigrations(db, kind); // G20: an old-schema local file must hydrate too
          db.exec('BEGIN');
          for (const table of Object.keys(TABLE_IDS[kind])) db.prepare(`DELETE FROM ${table}`).run();
          for (const r of list) {
            const idCol = TABLE_IDS[kind][r.table_name];
            if (!idCol) continue;
            const cols = Object.keys(r.data);
            db.prepare(`INSERT INTO ${r.table_name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
              .run(...cols.map((c) => r.data[c] as string | number | null));
          }
          db.exec('COMMIT');
        } finally { db.close(); }
        registerCustomer(uid);
      }
      hydrated.push(`${kind} (${rows.length} rows)`);
    } catch (err) {
      // A failed remote must not stop the app: keep working on the local files.
      console.error(`Remote hydrate failed for ${kind}:`, err instanceof Error ? err.message : err);
      failed.push(kind);
      errors[kind] = err instanceof Error ? err.message : String(err);
    }
  }
  return { hydrated, failed, skipped: lastHydrateSkipped.slice(), errors, hostedUids };
}


export const kvGet = (db: DatabaseSync, k: string): string | undefined =>
  (db.prepare('SELECT v FROM kv WHERE k = ?').get(k) as { v: string } | undefined)?.v;
export const kvSet = (db: DatabaseSync, k: string, v: string | null) => {
  if (v === null) db.prepare('DELETE FROM kv WHERE k = ?').run(k);
  else db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v);
};

/** Delete one database file, and only that one (including any unmigrated legacy JSON copy). */
export function deleteDbFile(uid: string, which: DbKind) {
  for (const f of [fileFor(uid, which), legacyFileFor(uid, which), `${legacyFileFor(uid, which)}.migrated`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  // G25: also clear this customer's hosted rows through the owning role (like load_remote
  // clear <uid>) - otherwise the next startup hydrate restores the deleted data. The outcome
  // is tracked: the delete route reports it instead of falsely claiming success.
  const url = REMOTE_SECRETS.get(which);
  if (url) {
    const key = `${which}:${uid}`;
    const p = clearRemoteCustomer(which, uid).then(
      () => null as string | null,
      (err) => String(err instanceof Error ? err.message : err));
    hostedClears.set(key, p);
    p.then((err) => { if (err) console.error(`Hosted clear failed for ${key}:`, err); });
  }
}

const hostedClears = new Map<string, Promise<string | null>>();

/** G25: how the hosted half of a delete ended - 'cleared', 'local-only' (no remote), or a failure
 *  the caller must surface. A failure is safe to retry: issue the delete (or clear) again. */
export async function hostedClearOutcome(uid: string, which: DbKind): Promise<'cleared' | 'local-only' | { failed: string }> {
  const key = `${which}:${uid}`;
  const p = hostedClears.get(key);
  if (!p) return REMOTE_SECRETS.has(which) ? 'cleared' : 'local-only';
  hostedClears.delete(key);
  const err = await p;
  return err === null ? 'cleared' : { failed: err };
}

/** G25: explicit clear of one customer's hosted rows for one store (delete = local file + this). */
export async function clearRemoteCustomer(which: DbKind, uid: string): Promise<void> {
  const url = REMOTE_SECRETS.get(which);
  if (!url) return;
  const { pushCustomer } = await import('./remote.js');
  await pushCustomer(which, url, uid, []);
}

/**
 * One-time import of a legacy JSON store into its SQLite database.
 * `apply` receives the parsed JSON and writes it via the owning store module.
 */
export function migrateLegacy(uid: string, kind: DbKind, apply: (data: Record<string, unknown>) => void) {
  const dbFile = fileFor(uid, kind);
  const jsonFile = legacyFileFor(uid, kind);
  if (fs.existsSync(dbFile) || !fs.existsSync(jsonFile)) return;
  try {
    apply(JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>);
    fs.renameSync(jsonFile, `${jsonFile}.migrated`);
  } catch {
    // A corrupt legacy file must not block the demo: start the SQLite DB empty instead.
  }
}

/**
 * G1: the index of customers with data in the three-database architecture. The app layer
 * needs it to find which per-customer databases exist (e.g. to look a record up by id
 * without knowing the customer). One small JSON file next to the databases.
 */
const INDEX_FILE = () => path.join(ARCH_DIR, 'customers.json');

/** Every id in the stored index, supported or not (the index is never rewritten except to add or remove one id). */
export function listStoredIds(): string[] {
  try {
    if (!fs.existsSync(INDEX_FILE())) return [];
    const uids = JSON.parse(fs.readFileSync(INDEX_FILE(), 'utf-8')) as unknown;
    return Array.isArray(uids) ? uids.filter((u): u is string => typeof u === 'string') : [];
  } catch { return []; }
}

/** D12: the customers the app can serve. A historical id that is not canonical stays in the index, untouched, but is never iterated or opened. */
export function listCustomers(): string[] {
  return listStoredIds().filter(isCanonicalCustomerId);
}

export function registerCustomer(uid: string) {
  canonicalCustomerId(uid);
  const uids = listStoredIds();
  if (uids.includes(uid)) return;
  fs.mkdirSync(ARCH_DIR, { recursive: true });
  fs.writeFileSync(INDEX_FILE(), JSON.stringify([...uids, uid]), 'utf-8');
}

export function unregisterCustomer(uid: string) {
  const all = listStoredIds();
  const uids = all.filter((u) => u !== uid);
  if (uids.length === all.length) return;
  fs.mkdirSync(ARCH_DIR, { recursive: true });
  fs.writeFileSync(INDEX_FILE(), JSON.stringify(uids), 'utf-8');
}
