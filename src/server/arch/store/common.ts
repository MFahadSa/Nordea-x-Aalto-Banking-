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

export const DATA_DIR = process.env.CABINET_DATA_DIR ? path.resolve(process.env.CABINET_DATA_DIR) : path.resolve(process.cwd(), 'data');
export const ARCH_DIR = path.join(DATA_DIR, 'arch');

export type DbKind = 'user' | 'cm' | 'nordea' | 'bus';

export function fileFor(uid: string, db: DbKind) {
  const safe = uid.replace(/[^a-z0-9_-]/gi, '_');
  return path.join(ARCH_DIR, `${safe}.${db}.db`);
}
export const legacyFileFor = (uid: string, db: DbKind) => fileFor(uid, db).replace(/\.db$/, '.json');

const SCHEMAS: Record<DbKind, string> = {
  user: `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS personal_facts (id TEXT PRIMARY KEY, source TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL, via_airlock_id TEXT NOT NULL);`,
  cm: `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, goal_ids TEXT NOT NULL,
      proposed_by TEXT NOT NULL, via_message_id TEXT, evidence TEXT, status TEXT NOT NULL,
      dispute_reason TEXT, created_at TEXT NOT NULL, observed TEXT, risk TEXT, auto_accepted INTEGER);`,
  nordea: `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, category TEXT NOT NULL, amount REAL NOT NULL,
      account TEXT NOT NULL, description TEXT, json TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);`,
  bus: `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, at TEXT NOT NULL, frm TEXT NOT NULL, tto TEXT NOT NULL,
      type TEXT NOT NULL, summary TEXT NOT NULL, payload TEXT, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS airlock (
      id TEXT PRIMARY KEY, at TEXT NOT NULL, source TEXT NOT NULL, items TEXT NOT NULL,
      status TEXT NOT NULL, decided_at TEXT);`,
};

export function openDb(file: string, kind: DbKind): DatabaseSync {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMAS[kind]);
  return db;
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
