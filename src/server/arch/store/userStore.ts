/**
 * The User DB store: the customer's own profile, goals and personal facts.
 * Only the personal agent module (and the app layer serving the customer) may import this.
 */
import fs from 'fs';
import { fileFor, legacyFileFor, openDb, kvGet, kvSet, deleteDbFile, migrateLegacy, applyMigrations } from './common.js';
import type { Goal, UserDb } from '../types.js';
import type { StoredDocument } from '../../../types.js';
import { registerCustomer, configureRemote } from './common.js';

// G6: this store reads ONLY its own hosted secret (one Postgres role per agent). Unset = local SQLite.
configureRemote('user', process.env.USER_DB_URL);

const emptyUser = (userId: string): UserDb => ({ userId, goals: [], personalFacts: [], personalAgent: { mode: 'abel' }, agentsOff: [] });

export function loadUserDb(uid: string): UserDb {
  migrateLegacy(uid, 'user', (data) => saveUserDb({ ...emptyUser(uid), ...data } as UserDb));
  if (!fs.existsSync(fileFor(uid, 'user'))) return emptyUser(uid);
  const db = openDb(fileFor(uid, 'user'), 'user');
  try {
    const d = emptyUser(uid);
    const profileName = kvGet(db, 'profileName');
    if (profileName) d.profileName = profileName;
    const pa = kvGet(db, 'personalAgent');
    if (pa) d.personalAgent = JSON.parse(pa);
    const off = kvGet(db, 'agentsOff');
    if (off) d.agentsOff = JSON.parse(off);
    d.goals = (db.prepare('SELECT * FROM goals ORDER BY created_at').all() as Record<string, string>[])
      .map((r) => ({ id: r.id, title: r.title, detail: r.detail, createdAt: r.created_at, ...(r.doc ? { doc: JSON.parse(r.doc) } : {}) }));
    d.personalFacts = (db.prepare('SELECT * FROM personal_facts ORDER BY at').all() as Record<string, string>[])
      .map((r) => ({ id: r.id, source: r.source, text: r.text, at: r.at, viaAirlockId: r.via_airlock_id }));
    return d;
  } finally { db.close(); }
}

export function saveUserDb(d: UserDb) {
  registerCustomer(d.userId);
  const db = openDb(fileFor(d.userId, 'user'), 'user');
  try {
    kvSet(db, 'profileName', d.profileName ?? null);
    kvSet(db, 'personalAgent', JSON.stringify(d.personalAgent));
    kvSet(db, 'agentsOff', JSON.stringify(d.agentsOff));
    db.exec('BEGIN');
    db.prepare('DELETE FROM goals').run();
    ensureDocColumn(db);
    const g = db.prepare('INSERT INTO goals (id, title, detail, created_at, doc) VALUES (?, ?, ?, ?, ?)');
    for (const goal of d.goals) g.run(goal.id, goal.title, goal.detail, goal.createdAt, goal.doc ? JSON.stringify(goal.doc) : null);
    db.prepare('DELETE FROM personal_facts').run();
    const f = db.prepare('INSERT INTO personal_facts (id, source, text, at, via_airlock_id) VALUES (?, ?, ?, ?, ?)');
    for (const fact of d.personalFacts) f.run(fact.id, fact.source, fact.text, fact.at, fact.viaAirlockId);
    db.exec('COMMIT');
  } finally { db.close(); }
}

export function deleteUserDb(uid: string) { deleteDbFile(uid, 'user'); }

/** G1: goals created before the Abel record column existed get it added in place. */
function ensureDocColumn(db: ReturnType<typeof openDb>) {
  applyMigrations(db, 'user');
}

// ---------- G1: the Abel app's customer profile and settings live in the User DB ----------

/** The profile and settings half of the Abel User record (bank data and rewards live elsewhere). */
export interface UserProfile {
  persona?: string;
  name?: string;
  age?: number;
  roleDescription?: string;
  viewMode?: string;
  layoutPrefs?: { widgetsOrder: string[]; hiddenWidgets: string[] };
  offersOff?: boolean;
  extraMonthly?: number;
  nordeaData?: { from: string; at: string; transactions: number; balances: boolean };
}

export function loadProfile(uid: string): UserProfile | null {
  if (!fs.existsSync(fileFor(uid, 'user'))) return null;
  const db = openDb(fileFor(uid, 'user'), 'user');
  try {
    const raw = kvGet(db, 'profile');
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } finally { db.close(); }
}

export function saveProfile(uid: string, profile: UserProfile) {
  registerCustomer(uid);
  const db = openDb(fileFor(uid, 'user'), 'user');
  try { kvSet(db, 'profile', JSON.stringify(profile)); } finally { db.close(); }
}

// ---------- G1: the customer's kept documents ("Keep a copy") live in the User DB ----------

export function loadDocuments(uid: string): StoredDocument[] {
  if (!fs.existsSync(fileFor(uid, 'user'))) return [];
  const db = openDb(fileFor(uid, 'user'), 'user');
  try {
    return (db.prepare('SELECT json FROM documents').all() as { json: string }[]).map((r) => JSON.parse(r.json) as StoredDocument);
  } finally { db.close(); }
}

export function putDocument(doc: StoredDocument) {
  registerCustomer(doc.userId);
  const db = openDb(fileFor(doc.userId, 'user'), 'user');
  try {
    db.prepare('INSERT INTO documents (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json')
      .run(doc.id, JSON.stringify(doc));
  } finally { db.close(); }
}

export function removeStoredDocument(uid: string, id: string) {
  if (!fs.existsSync(fileFor(uid, 'user'))) return;
  const db = openDb(fileFor(uid, 'user'), 'user');
  try { db.prepare('DELETE FROM documents WHERE id = ?').run(id); } finally { db.close(); }
}

/** Upsert one goal row (the Abel app writes goals with their full CabinetEntry record). */
export function putGoal(uid: string, goal: Goal) {
  registerCustomer(uid);
  const db = openDb(fileFor(uid, 'user'), 'user');
  try {
    ensureDocColumn(db);
    db.prepare('INSERT INTO goals (id, title, detail, created_at, doc) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, detail = excluded.detail, doc = excluded.doc')
      .run(goal.id, goal.title, goal.detail, goal.createdAt, goal.doc ? JSON.stringify(goal.doc) : null);
  } finally { db.close(); }
}

export function removeGoal(uid: string, id: string) {
  if (!fs.existsSync(fileFor(uid, 'user'))) return;
  const db = openDb(fileFor(uid, 'user'), 'user');
  try { db.prepare('DELETE FROM goals WHERE id = ?').run(id); } finally { db.close(); }
}

// ---------- App metadata namespace: chat history and topic log (not agent memory) ----------

export function putAppRows(uid: string, table: 'app_conversations' | 'app_messages' | 'app_topic_log', rows: { id: string; ts: string; json: string }[]) {
  if (!rows.length) return;
  registerCustomer(uid);
  const db = openDb(fileFor(uid, 'user'), 'user');
  try {
    const tsCol = table === 'app_topic_log' ? 'at' : 'created_at';
    const stmt = db.prepare(`INSERT INTO ${table} (id, ${tsCol}, json) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json`);
    db.exec('BEGIN');
    for (const r of rows) stmt.run(r.id, r.ts, r.json);
    db.exec('COMMIT');
  } finally { db.close(); }
}

export function loadAppRows<T>(uid: string, table: 'app_conversations' | 'app_messages' | 'app_topic_log'): T[] {
  if (!fs.existsSync(fileFor(uid, 'user'))) return [];
  const db = openDb(fileFor(uid, 'user'), 'user');
  try {
    const tsCol = table === 'app_topic_log' ? 'at' : 'created_at';
    return (db.prepare(`SELECT json FROM ${table} ORDER BY ${tsCol}`).all() as { json: string }[]).map((r) => JSON.parse(r.json) as T);
  } finally { db.close(); }
}

export function deleteAppRows(uid: string, table: 'app_conversations' | 'app_messages' | 'app_topic_log', ids: string[]) {
  if (!ids.length || !fs.existsSync(fileFor(uid, 'user'))) return;
  const db = openDb(fileFor(uid, 'user'), 'user');
  try {
    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
    db.exec('BEGIN');
    for (const id of ids) stmt.run(id);
    db.exec('COMMIT');
  } finally { db.close(); }
}
