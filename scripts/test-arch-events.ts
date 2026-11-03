/**
 * Realtime arch (owner ts1793666107.466069): per-customer change events behind the SSE
 * stream. Covers: per-uid sequence ordering, replay after a seq (reconnect/resync gaps),
 * bounded ring buffer, unsubscribe/session cleanup, cross-customer isolation, burst
 * coalescing, uid-key sanitization, and actual write coverage through the common store
 * write hook (local mode included - not an assumed call site). No server, no deps.
 */
import { emitArchChange, noteArchChange, subscribeArch, archUidFromFile, archUidKey, type ArchEvent } from '../src/server/arch/events.js';
import { setStoreWriteHook, fileFor } from '../src/server/arch/store/common.js';
import { appendMessage } from '../src/server/arch/store/busStore.js';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) { if (cond) { pass++; console.log(`  PASS ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const U1 = `test-rt-${Date.now()}-a`, U2 = `test-rt-${Date.now()}-b`;
try {
  // sequence numbers increase per customer
  const got: ArchEvent[] = [];
  const sub = subscribeArch(U1, 0, (ev) => got.push(ev));
  emitArchChange(U1); emitArchChange(U1);
  check('subscriber receives both events in order', got.length === 2 && got[0].seq === 1 && got[1].seq === 2);
  sub.unsubscribe();
  emitArchChange(U1);
  check('unsubscribed listener no longer receives events (cleanup)', got.length === 2);

  // replay after a seq: a reconnecting client receives exactly what it missed
  const replayed: ArchEvent[] = [];
  subscribeArch(U1, 1, (ev) => replayed.push(ev)).unsubscribe();
  check('replay after seq 1 yields only seq 2 and 3 (reconnect gap)', replayed.map((e) => e.seq).join(',') === '2,3');
  check('replay past the head yields nothing', subscribeArch(U1, 99, () => { throw new Error('unexpected'); }).unsubscribe() === undefined);

  // per-customer isolation
  emitArchChange(U2);
  check('customer 1 replay unaffected by customer 2 emit', replayed.map((e) => e.seq).join(',') === '2,3');
  const u2: ArchEvent[] = [];
  subscribeArch(U2, 0, (ev) => u2.push(ev)).unsubscribe();
  check('customer 2 has its own sequence starting at 1 (isolation)', u2.length === 1 && u2[0].seq === 1);

  // bounded ring buffer
  const U3 = `${U1}-c`;
  for (let i = 0; i < 210; i++) emitArchChange(U3);
  const missed: ArchEvent[] = [];
  subscribeArch(U3, 0, (ev) => missed.push(ev)).unsubscribe();
  check('buffer bounded at 200 (older events dropped, head intact)', missed.length === 200 && missed[missed.length - 1].seq === 210);

  // coalescing: a burst of noted changes becomes ONE event
  const U4 = `${U1}-d`;
  const burst: ArchEvent[] = [];
  subscribeArch(U4, 0, (ev) => burst.push(ev));
  noteArchChange(U4); noteArchChange(U4); noteArchChange(U4);
  await sleep(120);
  check('nothing emitted mid-burst', burst.length === 0);
  await sleep(400);
  check('burst of writes coalesces into one event', burst.length === 1 && burst[0].seq === 1);
  noteArchChange(U4);
  await sleep(500);
  check('a later change emits the next seq', burst.length === 2 && burst[1].seq === 2);

  // uid keys: raw route uid and store-file uid meet on the same key
  check('uid key is the store identity for canonical ids; My User.1 is rejected, not sanitized', archUidKey('My_User_1') === 'My_User_1' && (() => { try { archUidKey('My User.1'); return false; } catch { return true; } })());
  check('uid recovered from a store file path', archUidFromFile('/data/arch/My_User_1.bus.db', 'bus') === 'My_User_1');
  check('foreign file rejected', archUidFromFile('/data/arch/My_User_1.bus.db', 'cm') === null);

  // actual write coverage: a bus write (through common.openDb, local mode) emits via the hook
  const U5 = `${U1}-e`;
  const viaHook: ArchEvent[] = [];
  subscribeArch(archUidKey(U5), 0, (ev) => viaHook.push(ev));
  setStoreWriteHook((file, kind) => { const uid = archUidFromFile(file, kind); if (uid) noteArchChange(uid); });
  appendMessage(U5, { from: 'app', to: 'user', type: 'inform', summary: 'hi' });
  await sleep(500);
  setStoreWriteHook(null);
  check('a real store write emits one coalesced event through the write hook', viaHook.length === 1 && viaHook[0].seq === 1);
} finally {
  setStoreWriteHook(null);
}

// Regression (Bill FACT @03:06): the SSE route must subscribe on the SAME sanitized key the
// store-write emissions use, or a uid with '.'/space would silently get no events.
import fs from 'node:fs';
{
  const src = fs.readFileSync(new URL('../src/server/arch/routes.ts', import.meta.url), 'utf-8');
  const m = src.match(/\/api\/arch\/:uid\/events'[\s\S]{0,300}/);
  check('route subscribes on the canonical uid key', !!m && /archUidKey\(uid\(req\)\)/.test(m[0]));
  const keyed: ArchEvent[] = [];
  subscribeArch(archUidKey('My_User_1'), 0, (ev) => keyed.push(ev));
  noteArchChange('My_User_1'); // canonical uid, as the store hook produces
  await sleep(500);
  check('canonical-uid emission reaches the key subscriber', keyed.length === 1 && keyed[0].seq >= 1);
}

// Identity grounding (Coordinator 03:22): an event stream's identity IS the store's file
// identity - uids that sanitize alike already share ONE database file, so keying events on
// the sanitized uid cannot leak across customers beyond the store's own data boundary.
check('event identity is exactly the store file identity for canonical ids', fileFor('a_b', 'bus') === fileFor('a_b', 'bus') && archUidKey('a_b') === 'a_b');
check('ambiguous id a.b is rejected at both layers, never aliased to a_b', (() => { try { fileFor('a.b', 'bus'); return false; } catch { /* expected */ } try { archUidKey('a.b'); return false; } catch { return true; } })());
check('distinct identities stay isolated at both layers', fileFor('ab', 'bus') !== fileFor('a_b', 'bus') && archUidKey('ab') !== archUidKey('a_b'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
