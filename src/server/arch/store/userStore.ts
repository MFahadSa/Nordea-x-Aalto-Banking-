/**
 * The User DB store: the customer's own profile, goals and personal facts.
 * Only the personal agent module (and the app layer serving the customer) may import this.
 */
import fs from 'fs';
import { fileFor, legacyFileFor, openDb, kvGet, kvSet, deleteDbFile, migrateLegacy } from './common.js';
import type { UserDb } from '../types.js';

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
      .map((r) => ({ id: r.id, title: r.title, detail: r.detail, createdAt: r.created_at }));
    d.personalFacts = (db.prepare('SELECT * FROM personal_facts ORDER BY at').all() as Record<string, string>[])
      .map((r) => ({ id: r.id, source: r.source, text: r.text, at: r.at, viaAirlockId: r.via_airlock_id }));
    return d;
  } finally { db.close(); }
}

export function saveUserDb(d: UserDb) {
  const db = openDb(fileFor(d.userId, 'user'), 'user');
  try {
    kvSet(db, 'profileName', d.profileName ?? null);
    kvSet(db, 'personalAgent', JSON.stringify(d.personalAgent));
    kvSet(db, 'agentsOff', JSON.stringify(d.agentsOff));
    db.exec('BEGIN');
    db.prepare('DELETE FROM goals').run();
    const g = db.prepare('INSERT INTO goals (id, title, detail, created_at) VALUES (?, ?, ?, ?)');
    for (const goal of d.goals) g.run(goal.id, goal.title, goal.detail, goal.createdAt);
    db.prepare('DELETE FROM personal_facts').run();
    const f = db.prepare('INSERT INTO personal_facts (id, source, text, at, via_airlock_id) VALUES (?, ?, ?, ?, ?)');
    for (const fact of d.personalFacts) f.run(fact.id, fact.source, fact.text, fact.at, fact.viaAirlockId);
    db.exec('COMMIT');
  } finally { db.close(); }
}

export function deleteUserDb(uid: string) { deleteDbFile(uid, 'user'); }
