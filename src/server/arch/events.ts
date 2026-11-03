/**
 * Realtime arch updates (owner: make the arch view live instead of a 5s poll).
 * A tiny in-process, per-customer event bus: every state-changing action emits one
 * sequence-numbered "changed" event; the SSE route replays anything the client missed
 * (?after=<seq>) and streams new ones. No dependency, no cross-customer leakage: a
 * connection only ever sees its own uid's events. Payloads carry no data - the client
 * re-reads /state, so a lost connection simply resyncs from the latest seq it saw.
 */
export interface ArchEvent { seq: number; at: string }
type Sink = (ev: ArchEvent) => void;

const BUFFER = 200; // bounded replay window per customer
const seqByUid = new Map<string, number>();
const buffers = new Map<string, ArchEvent[]>();
const sinks = new Map<string, Set<Sink>>();

/** Sanitize a uid exactly like store fileFor, so a store-write hook event and an SSE
 *  subscription for the same customer always meet on the same key. */
export const archUidKey = (uid: string) => uid.replace(/[^a-z0-9_-]/gi, '_');
/** Recover the customer key from a store file path written through common.openDb. */
export function archUidFromFile(file: string, kind: string): string | null {
  const base = file.replace(/\\/g, '/').split('/').pop() ?? '';
  const suffix = `.${kind}.db`;
  return base.endsWith(suffix) ? base.slice(0, -suffix.length) : null;
}

const COALESCE_MS = 350; // one round writes many rows; bursts become ONE event (trailing edge)
const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Note a customer change. Coalesced: a burst of writes (one round, one import) emits a
 *  single event ~350ms after the last write; ordering/seq still strictly increase per uid. */
export function noteArchChange(uid: string) {
  const key = archUidKey(uid);
  const t = pending.get(key);
  if (t) clearTimeout(t);
  pending.set(key, setTimeout(() => { pending.delete(key); emitArchChange(key); }, COALESCE_MS));
}

/** Emit one change event for a customer. Called by the coalescing timer (or tests). */
export function emitArchChange(uid: string): ArchEvent {
  const seq = (seqByUid.get(uid) ?? 0) + 1;
  seqByUid.set(uid, seq);
  const ev = { seq, at: new Date().toISOString() };
  const buf = buffers.get(uid) ?? [];
  buf.push(ev);
  if (buf.length > BUFFER) buf.shift();
  buffers.set(uid, buf);
  for (const sink of sinks.get(uid) ?? []) {
    try { sink(ev); } catch { /* a broken sink is dropped on close by the route */ }
  }
  return ev;
}

/** Subscribe one customer from `after` (exclusive). Replays buffered misses, then streams.
 *  Returns the current seq and an unsubscribe. */
export function subscribeArch(uid: string, after: number, sink: Sink): { seq: number; unsubscribe: () => void } {
  for (const ev of buffers.get(uid) ?? []) if (ev.seq > after) sink(ev);
  let set = sinks.get(uid);
  if (!set) { set = new Set(); sinks.set(uid, set); }
  set.add(sink);
  return { seq: seqByUid.get(uid) ?? 0, unsubscribe: () => { set.delete(sink); if (!set.size) sinks.delete(uid); } };
}
