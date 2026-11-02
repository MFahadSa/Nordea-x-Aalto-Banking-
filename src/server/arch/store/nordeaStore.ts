/**
 * The Nordea DB store: accounts and transactions on the bank side.
 * Only the Nordea agent module (and the app layer serving the customer) may import this.
 */
import fs from 'fs';
import { fileFor, legacyFileFor, openDb, deleteDbFile, migrateLegacy } from './common.js';
import type { NordeaDb } from '../types.js';
import type { BankAccount, Transaction } from '../../../types.js';

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
