/**
 * The message bus store: shared transport between agents, NOT a knowledge store.
 * Every agent may open the bus. Coordination state that gates delivery (agent off-switches,
 * the cabinet park mirror, build-round records) lives here as kv keys.
 */
import fs from 'fs';
import { fileFor, openDb, kvGet, kvSet, migrateLegacy } from './common.js';
import { newId, now } from '../types.js';
import type { AgentId, AgentMessage, AirlockBatch, Bus } from '../types.js';

const emptyBus = (): Bus => ({ messages: [], airlock: [] });

export function loadBus(uid: string): Bus {
  migrateLegacy(uid, 'bus', (data) => saveBus(uid, { ...emptyBus(), ...data } as Bus));
  if (!fs.existsSync(fileFor(uid, 'bus'))) return emptyBus();
  const db = openDb(fileFor(uid, 'bus'), 'bus');
  try {
    // rowid order = insertion order, so same-millisecond messages keep their real sequence.
    const messages = (db.prepare('SELECT * FROM messages ORDER BY rowid').all() as Record<string, string>[])
      .map((r) => ({
        id: r.id, at: r.at, from: r.frm as AgentId, to: r.tto as AgentMessage['to'],
        type: r.type as AgentMessage['type'], summary: r.summary,
        ...(r.payload ? { payload: JSON.parse(r.payload) } : {}),
        status: r.status as AgentMessage['status'],
      }));
    const airlock = (db.prepare('SELECT * FROM airlock ORDER BY rowid').all() as Record<string, string>[])
      .map((r) => ({
        id: r.id, at: r.at, source: r.source, items: JSON.parse(r.items) as AirlockBatch['items'],
        status: r.status as AirlockBatch['status'],
        ...(r.decided_at ? { decidedAt: r.decided_at } : {}),
      }));
    return { messages, airlock };
  } finally { db.close(); }
}

export function saveBus(uid: string, b: Bus) {
  const db = openDb(fileFor(uid, 'bus'), 'bus');
  try {
    db.exec('BEGIN');
    db.prepare('DELETE FROM messages').run();
    const m = db.prepare('INSERT INTO messages (id, at, frm, tto, type, summary, payload, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const msg of b.messages) m.run(msg.id, msg.at, msg.from, msg.to, msg.type, msg.summary, msg.payload ? JSON.stringify(msg.payload) : null, msg.status);
    db.prepare('DELETE FROM airlock').run();
    const a = db.prepare('INSERT INTO airlock (id, at, source, items, status, decided_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const item of b.airlock) a.run(item.id, item.at, item.source, JSON.stringify(item.items), item.status, item.decidedAt ?? null);
    db.exec('COMMIT');
  } finally { db.close(); }
}

export function postMessage(bus: Bus, m: Omit<AgentMessage, 'id' | 'at' | 'status'> & { status?: AgentMessage['status'] }): AgentMessage {
  const msg: AgentMessage = { id: newId('msg'), at: now(), status: 'read', ...m };
  bus.messages.push(msg);
  return msg;
}

/** Load-modify-save helpers so no agent ever holds a stale bus object. */
export function appendMessage(uid: string, m: Omit<AgentMessage, 'id' | 'at' | 'status'> & { status?: AgentMessage['status'] }): AgentMessage {
  const bus = loadBus(uid);
  const msg = postMessage(bus, m);
  saveBus(uid, bus);
  return msg;
}

export function updateMessage(uid: string, id: string, patch: Partial<Pick<AgentMessage, 'status' | 'summary' | 'payload'>>) {
  const bus = loadBus(uid);
  const msg = bus.messages.find((x) => x.id === id);
  if (msg) Object.assign(msg, patch);
  saveBus(uid, bus);
  return msg;
}

export function findMessage(uid: string, id: string): AgentMessage | undefined {
  return loadBus(uid).messages.find((x) => x.id === id);
}

/** Coordination kv on the bus (agent off-switches, cabinet park mirror, round records). */
export function busKvGet(uid: string, k: string): string | undefined {
  const db = openDb(fileFor(uid, 'bus'), 'bus');
  try { return kvGet(db, k); } finally { db.close(); }
}
export function busKvSet(uid: string, k: string, v: string | null) {
  const db = openDb(fileFor(uid, 'bus'), 'bus');
  try { kvSet(db, k, v); } finally { db.close(); }
}

export function getAgentsOff(uid: string): AgentId[] | undefined {
  const raw = busKvGet(uid, 'agentsOff');
  return raw === undefined ? undefined : (JSON.parse(raw) as AgentId[]);
}
export function setAgentsOff(uid: string, off: AgentId[]) { busKvSet(uid, 'agentsOff', JSON.stringify(off)); }

export function getCabinetParkedMirror(uid: string): boolean {
  return busKvGet(uid, 'cabinetParked') === '1';
}
export function setCabinetParkedMirror(uid: string, parked: boolean) { busKvSet(uid, 'cabinetParked', parked ? '1' : '0'); }
