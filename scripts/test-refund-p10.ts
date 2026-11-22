/** Refund Tracker, stage 10: what Home and the bell say, from the case state. */
import { refundNotice, laterStore } from '../src/components/refundNotice.js';
let passed = 0, failed = 0;
const check = (n: string, ok: boolean, d?: unknown) => { if (ok) { passed++; console.log('PASS ', n); } else { failed++; console.log('FAIL ', n, d === undefined ? '' : JSON.stringify(d)); } };
const base: any = { id: 'rc-1', state: 'partially_refunded', withdrawn: false, itemCount: 4, merchant: 'Tuulikki Electronics', expected: 89.9, received: 40, remaining: 49.9, promiseDate: '2026-10-12', asOf: '2026-10-23', late: true, canWrite: 'inquiry', shopMessages: [], flags: [] };
const N = (o: any) => refundNotice({ cases: [{ ...base, ...o }] })!;

const full = N({ received: 89.9, remaining: 0, needsReview: 1, canWrite: null });
check('full refund with a duplicate to check says check first', /needs your check/.test(full.title) && full.tone === 'amber', full);
check('full refund with nothing to check says it arrived', /arrived/.test(N({ received: 89.9, remaining: 0, canWrite: null }).title));

const first = N({});
check('late, nothing sent yet: offers to write, not a reminder', /write to the shop/.test(first.sub) && !/reminder/.test(first.detail + first.sub), first);
const waiting = N({ canWrite: null, shopMessages: [{ id: 'a', direction: 'out', at: 'x', text: '', kind: 'inquiry' }] });
check('late, waiting for a reply: no reminder promised, says waiting', /Waiting/.test(waiting.sub) && !/prepare a reminder/.test(waiting.detail + waiting.sub) && !/Nothing is sent until/.test(waiting.detail), waiting);
const rem = N({ canWrite: 'reminder', shopMessages: [{ id: 'a', direction: 'out', at: 'x', text: '', kind: 'inquiry' }, { id: 'b', direction: 'in', at: 'x', text: '', kind: 'will_refund' }] });
check('late with a reminder possible: offers it with approval', /reminder/.test(rem.sub) && /Nothing is sent until you say so/.test(rem.detail), rem);
check('late title uses the case date, not a fixed one', /9 working days late/.test(first.title) && /1 working day late/.test(N({ asOf: '2026-10-13' }).title), first.title);

const noPromise = N({ promiseDate: undefined, late: false, canWrite: null });
check('no promise date says so about the allowed records, not about the shop', /allowed/.test(noPromise.sub) && !/from the shop/.test(noPromise.sub), noPromise.sub);

// Later reappearance
const declined1 = N({ shopDeclinedAt: 'x', canWrite: null });
const declined2 = N({ shopDeclinedAt: 'x', canWrite: null, received: 60, remaining: 29.9 });
check('declined: a partial credit after Later gives a new key', declined1.key !== declined2.key);
const watch1 = N({ late: false, promiseDate: undefined, canWrite: null });
const watch2 = N({ late: false, promiseDate: '2026-10-30', canWrite: null, shopMessages: [{ id: 'a', direction: 'in', at: 'x', text: '', kind: 'will_refund' }] });
laterStore.add(watch1.key);
check('after Later, a new promise date or reply makes it appear again', laterStore.has(watch1.key) && !laterStore.has(watch2.key));
check('the same state keeps its key', N({}).key === N({}).key);

// Count updates at once
let hits = 0; const off = laterStore.subscribe(() => hits++);
laterStore.add(first.key); off();
check('Later notifies subscribers immediately (so the bell count drops without waiting for a poll)', hits === 1 && laterStore.has(first.key));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
