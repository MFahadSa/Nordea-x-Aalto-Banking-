/**
 * Request-correlated chat turns (outcome 3), shared by the app route and the arch route:
 * a turn runs at most ONCE per requestId (a repeat joins the running turn or gets the kept result),
 * a user's turns run one after another, and the result can be fetched later by requestId.
 * In-memory and bounded; an id this server never ran (or lost in a restart) is 'unknown' - callers
 * report that and never resubmit on their own.
 */
type Out = { status: number; body: unknown };
const inflight = new Map<string, Promise<Out>>();
const queue = new Map<string, Promise<unknown>>();
const finished = new Map<string, Out>();
const KEEP = 200;
const fingerprints = new Map<string, string>();

export function enqueue<T>(user: string, fn: () => Promise<T>): Promise<T> {
  const prev = queue.get(user) ?? Promise.resolve();
  const turn = prev.catch(() => undefined).then(fn);
  queue.set(user, turn);
  const clear = () => { if (queue.get(user) === turn) queue.delete(user); };
  turn.then(clear, clear);
  return turn;
}

export function runOnce(user: string, requestId: string | undefined, fn: () => Promise<Out>, fingerprint = ''): Promise<Out> {
  if (!requestId) return enqueue(user, fn);
  const key = `${user}:${requestId}`;
  // A requestId names ONE message: reusing it for different text is refused, never answered with the old reply.
  const known = fingerprints.get(key);
  if (known !== undefined && known !== fingerprint) return Promise.resolve({ status: 409, body: { error: 'That request id was already used for a different message.' } });
  fingerprints.set(key, fingerprint);
  if (fingerprints.size > KEEP * 2) fingerprints.delete(fingerprints.keys().next().value as string);
  const kept = finished.get(key);
  if (kept) return Promise.resolve({ ...kept, status: 200 });
  const running = inflight.get(key);
  if (running) return running;
  const turn = enqueue(user, fn).then((out) => {
    finished.set(key, out);
    if (finished.size > KEEP) finished.delete(finished.keys().next().value as string);
    return out;
  });
  inflight.set(key, turn);
  const clear = () => { inflight.delete(key); };
  turn.then(clear, clear);
  return turn;
}

export function requestState(user: string, requestId: string): { status: 'pending' } | { status: 'done'; result: Out } | { status: 'unknown' } {
  const key = `${user}:${requestId}`;
  const kept = finished.get(key);
  if (kept) return { status: 'done', result: kept };
  return inflight.has(key) ? { status: 'pending' } : { status: 'unknown' };
}
