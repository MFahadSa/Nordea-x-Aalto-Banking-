/**
 * The Nordea DB store: accounts and transactions on the bank side.
 * Only the Nordea agent module (and the app layer serving the customer) may import this.
 */
import fs from 'fs';
import { fileFor, legacyFileFor, openDb, deleteDbFile, migrateLegacy } from './common.js';
import type { NordeaDb } from '../types.js';
import type { BalanceSnapshot, BankAccount, ImportBatch, Transaction, User } from '../../../types.js';
import { kvGet, kvSet, registerCustomer, configureRemote } from './common.js';

// G6: this store reads ONLY its own hosted secret (one Postgres role per agent). Unset = local SQLite.
configureRemote('nordea', process.env.NORDEA_DB_URL);

export function nordeaFileExists(uid: string) {
  return fs.existsSync(fileFor(uid, 'nordea')) || fs.existsSync(legacyFileFor(uid, 'nordea'));
}

export function loadNordeaDb(uid: string): NordeaDb | null {
  if (!nordeaFileExists(uid)) return null;
  migrateLegacy(uid, 'nordea', (data) => saveNordeaDb(data as unknown as NordeaDb));
  if (!fs.existsSync(fileFor(uid, 'nordea'))) return { userId: uid, accounts: [], transactions: [] };
  const db = openDb(fileFor(uid, 'nordea'), 'nordea');
  try {
    const accounts = (db.prepare('SELECT json FROM accounts').all() as { json: string }[]).map((r) => JSON.parse(r.json) as BankAccount);
    const transactions = (db.prepare('SELECT json FROM transactions ORDER BY date').all() as { json: string }[])
      .map((r) => JSON.parse(r.json) as Transaction);
    return { userId: uid, accounts, transactions };
  } finally { db.close(); }
}

export function saveNordeaDb(d: NordeaDb) {
  registerCustomer(d.userId);
  const db = openDb(fileFor(d.userId, 'nordea'), 'nordea');
  try {
    db.exec('BEGIN');
    db.prepare('DELETE FROM accounts').run();
    const a = db.prepare('INSERT INTO accounts (id, json) VALUES (?, ?)');
    for (const acc of d.accounts) a.run(acc.id, JSON.stringify(acc));
    db.prepare('DELETE FROM transactions').run();
    const t = db.prepare('INSERT INTO transactions (id, date, category, amount, account, description, json) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const tx of d.transactions) t.run(tx.id, tx.date, tx.category, tx.amount, tx.account, tx.description ?? null, JSON.stringify(tx));
    db.exec('COMMIT');
  } finally { db.close(); }
}

export function deleteNordeaDb(uid: string) { deleteDbFile(uid, 'nordea'); }

// ---------- G1: the Nordea DB is the one home of the customer's bank data ----------

/** Live account balances (the Abel User.accounts view) belong to the Nordea DB. */
export function loadBalances(uid: string): User['accounts'] | null {
  if (!fs.existsSync(fileFor(uid, 'nordea'))) return null;
  const db = openDb(fileFor(uid, 'nordea'), 'nordea');
  try {
    const raw = kvGet(db, 'balances');
    return raw ? (JSON.parse(raw) as User['accounts']) : null;
  } finally { db.close(); }
}

export function saveBalances(uid: string, balances: User['accounts']) {
  registerCustomer(uid);
  const db = openDb(fileFor(uid, 'nordea'), 'nordea');
  try { kvSet(db, 'balances', JSON.stringify(balances)); } finally { db.close(); }
}

/** Transactions, accounts and history written one record at a time by the import path. */
export function putTransactions(uid: string, list: Transaction[]) {
  registerCustomer(uid);
  const db = openDb(fileFor(uid, 'nordea'), 'nordea');
  try {
    const t = db.prepare(`INSERT INTO transactions (id, date, category, amount, account, description, json)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
        date = excluded.date, category = excluded.category, amount = excluded.amount,
        account = excluded.account, description = excluded.description, json = excluded.json`);
    db.exec('BEGIN');
    for (const tx of list) t.run(tx.id, tx.date, tx.category, tx.amount, tx.account, tx.description ?? null, JSON.stringify(tx));
    db.exec('COMMIT');
  } finally { db.close(); }
}

export function putBankAccount(uid: string, acc: BankAccount) {
  registerCustomer(uid);
  const db = openDb(fileFor(uid, 'nordea'), 'nordea');
  try {
    db.prepare('INSERT INTO accounts (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json')
      .run(acc.id, JSON.stringify(acc));
  } finally { db.close(); }
}

export function loadBalanceSnapshots(uid: string, accountKey?: string): BalanceSnapshot[] {
  if (!fs.existsSync(fileFor(uid, 'nordea'))) return [];
  const db = openDb(fileFor(uid, 'nordea'), 'nordea');
  try {
    const rows = (accountKey
      ? db.prepare('SELECT json FROM balance_snapshots WHERE account_key = ? ORDER BY at').all(accountKey)
      : db.prepare('SELECT json FROM balance_snapshots ORDER BY at').all()) as { json: string }[];
    return rows.map((r) => JSON.parse(r.json) as BalanceSnapshot);
  } finally { db.close(); }
}

export function putBalanceSnapshot(uid: string, snap: BalanceSnapshot) {
  registerCustomer(uid);
  const db = openDb(fileFor(uid, 'nordea'), 'nordea');
  try {
    db.prepare('INSERT INTO balance_snapshots (id, account_key, at, json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json')
      .run(snap.id, snap.accountKey, snap.at, JSON.stringify(snap));
  } finally { db.close(); }
}

export function loadImportBatches(uid: string): ImportBatch[] {
  if (!fs.existsSync(fileFor(uid, 'nordea'))) return [];
  const db = openDb(fileFor(uid, 'nordea'), 'nordea');
  try {
    return (db.prepare('SELECT json FROM import_batches ORDER BY at').all() as { json: string }[])
      .map((r) => JSON.parse(r.json) as ImportBatch);
  } finally { db.close(); }
}

export function putImportBatch(uid: string, batch: ImportBatch) {
  registerCustomer(uid);
  const db = openDb(fileFor(uid, 'nordea'), 'nordea');
  try {
    db.prepare('INSERT INTO import_batches (id, at, json) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json')
      .run(batch.id, batch.at, JSON.stringify(batch));
  } finally { db.close(); }
}

// ---------- App metadata namespace: partner earnings, data rewards and points (bank-side) ----------

export function putAppBankRows(uid: string, table: 'app_earnings' | 'app_data_rewards', rows: { id: string; at: string; json: string }[]) {
  if (!rows.length) return;
  registerCustomer(uid);
  const db = openDb(fileFor(uid, 'nordea'), 'nordea');
  try {
    const stmt = db.prepare(`INSERT INTO ${table} (id, at, json) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json`);
    db.exec('BEGIN');
    for (const r of rows) stmt.run(r.id, r.at, r.json);
    db.exec('COMMIT');
  } finally { db.close(); }
}

export function loadAppBankRows<T>(uid: string, table: 'app_earnings' | 'app_data_rewards'): T[] {
  if (!fs.existsSync(fileFor(uid, 'nordea'))) return [];
  const db = openDb(fileFor(uid, 'nordea'), 'nordea');
  try {
    return (db.prepare(`SELECT json FROM ${table} ORDER BY at`).all() as { json: string }[]).map((r) => JSON.parse(r.json) as T);
  } finally { db.close(); }
}

export function putAppRewards(uid: string, json: string) {
  registerCustomer(uid);
  const db = openDb(fileFor(uid, 'nordea'), 'nordea');
  try {
    db.prepare('INSERT INTO app_rewards (user_id, json) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json').run(uid, json);
  } finally { db.close(); }
}

export function loadAppRewards(uid: string): string | null {
  if (!fs.existsSync(fileFor(uid, 'nordea'))) return null;
  const db = openDb(fileFor(uid, 'nordea'), 'nordea');
  try {
    const r = db.prepare('SELECT json FROM app_rewards WHERE user_id = ?').get(uid) as { json: string } | undefined;
    return r ? r.json : null;
  } finally { db.close(); }
}

export function deleteAppBankRows(uid: string, table: 'app_earnings' | 'app_data_rewards', ids: string[]) {
  if (!ids.length || !fs.existsSync(fileFor(uid, 'nordea'))) return;
  const db = openDb(fileFor(uid, 'nordea'), 'nordea');
  try {
    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
    db.exec('BEGIN');
    for (const id of ids) stmt.run(id);
    db.exec('COMMIT');
  } finally { db.close(); }
}

export function removeAppRewards(uid: string) {
  if (!fs.existsSync(fileFor(uid, 'nordea'))) return;
  const db = openDb(fileFor(uid, 'nordea'), 'nordea');
  try { db.prepare('DELETE FROM app_rewards WHERE user_id = ?').run(uid); } finally { db.close(); }
}
