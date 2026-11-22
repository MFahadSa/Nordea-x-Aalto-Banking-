/** Refund Tracker, stage 11: counted refund money moves the demo account balance (and a reversal takes it
    back), and a completed case clears from Home and the bell when the customer taps Done. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadCalendar } from '../src/server/refund/calendar.js';
import { loadPolicy } from '../src/server/refund/policy.js';
import { RefundStore, type CreditEvent } from '../src/server/refund/cases.js';
import { refundNotice } from '../src/components/refundNotice.js';
import { DEMO_TODAY } from '../src/server/finance.js';

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 600)}`); }
}
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'refund-p11-'));
const SEED = path.resolve('seed', 'refund');
const policy = loadPolicy(), cal = loadCalendar();
let n = 0;
let deltas: { userId: string; delta: number }[] = [];
const onBalance = (userId: string, delta: number) => { deltas.push({ userId, delta }); };
const fresh = (withBalance = true) => { deltas = []; return new RefundStore(path.join(DIR, `s${++n}.json`), SEED, () => policy, () => cal, undefined, withBalance ? onBalance : undefined).load(); };
const ALL = ['rec-tx-tuulikki-0928', 'rec-receipt-tuulikki', 'rec-tracking-return', 'rec-email-tuulikki-0505'];
const open = (s: RefundStore) => s.openCase({ userId: 'lauri', consentItems: ALL, reasons: ['refund_not_received'], country: 'FI' });
const ev = (s: RefundStore, id: string, over: Partial<CreditEvent> = {}): CreditEvent => ({ ...s.presetsFor('lauri').find((e) => e.eventId === id)!, ...over });
const sum = () => deltas.reduce((a, d) => a + d.delta, 0);

// ---------- counted money moves the balance ----------
{ const s = fresh(); const c = open(s);
  const r = s.applyCredit(ev(s, 'ev-refund-full'));
  check('a full counted refund adds 89,90 to the balance link once', r.result === 'counted' && deltas.length === 1 && deltas[0].delta === 8990 && deltas[0].userId === 'lauri', deltas);
  check('the balance move is on the case log without amounts', s.auditFor(c.id).some((a) => a.kind === 'adapter' && /Counted into the current account/.test(a.detail) && !/89|8990/.test(a.detail)), s.auditFor(c.id).slice(-3));
  const again = s.applyCredit(ev(s, 'ev-refund-full'));
  check('a replayed credit moves nothing more', again.result === 'replay_ignored' && deltas.length === 1, deltas); }

{ const s = fresh(); const c = open(s);
  s.applyCredit(ev(s, 'ev-partial-40'));
  s.applyCredit(ev(s, 'ev-partial-49-90'));
  check('two partials move 40,00 then 49,90', deltas.map((d) => d.delta).join() === '4000,4990', deltas);
  check('the case counter tracks the counted total', s.get(c.id).balanceCreditedCents === 8990, s.get(c.id).balanceCreditedCents); }

{ const s = fresh(); const c = open(s);
  s.applyCredit(ev(s, 'ev-refund-full'));
  s.applyCredit(ev(s, 'ev-reversal'));
  check('a reversal takes the money back', sum() === 0 && deltas.map((d) => d.delta).join() === '8990,-8990', deltas);
  check('the reversal is on the case log', s.auditFor(c.id).some((a) => a.kind === 'adapter' && /Taken back from the current account/.test(a.detail)), s.auditFor(c.id).slice(-3)); }

// ---------- only counted money moves ----------
{ const s = fresh(); open(s);
  s.applyCredit(ev(s, 'ev-decoy-other-shop'));
  s.applyCredit(ev(s, 'ev-other-currency'));
  s.applyCredit(ev(s, 'ev-pending'));
  check('decoy, other currency and pending credits move nothing', deltas.length === 0, deltas); }

{ const s = fresh(); const c = open(s);
  s.applyCredit(ev(s, 'ev-refund-full'));
  s.applyCredit(ev(s, 'ev-lookalike', { eventId: 'ev-lookalike-2' }));
  check('a possible duplicate after the full refund moves nothing', deltas.length === 1 && sum() === 8990, deltas);
  s.reviewFlag(c.id, 'ev-lookalike-2', 'checked_fine');
  check('"Checked, fine" on a duplicate counts nothing and moves nothing', deltas.length === 1 && s.status(c.id, DEMO_TODAY).needsReview.length === 0, deltas); }

{ const s = fresh(); const c = open(s);
  s.applyCredit(ev(s, 'ev-no-reference'));
  check('a credit with no reference waits and moves nothing', deltas.length === 0 && s.status(c.id, DEMO_TODAY).needsReview.length === 1, deltas);
  const r = s.assignCredit('ev-no-reference', c.id, { acceptConflicts: s.creditConflicts('ev-no-reference', c.id) });
  check('when the customer says it is the refund, it counts and moves', r.result === 'counted' && sum() === 8990, { r, deltas }); }

// ---------- idempotent across reloads and for cases counted before the link existed ----------
{ const file = path.join(DIR, `s${++n}.json`);
  const s1 = new RefundStore(file, SEED, () => policy, () => cal).load(); // no balance link: the pre-fix behaviour
  const c = open(s1); s1.applyCredit(ev(s1, 'ev-refund-full'));
  deltas = [];
  const s2 = new RefundStore(file, SEED, () => policy, () => cal, undefined, onBalance).load();
  s2.reconcileBalance(c.id);
  check('a case counted before the balance link existed catches up once', deltas.length === 1 && deltas[0].delta === 8990, deltas);
  deltas = [];
  const s3 = new RefundStore(file, SEED, () => policy, () => cal, undefined, onBalance).load();
  s3.reconcileBalance(c.id);
  check('a reload never moves the same money twice', deltas.length === 0, deltas); }

// ---------- withdrawal stops the link, keeps the money ----------
{ const s = fresh(); const c = open(s);
  s.applyCredit(ev(s, 'ev-refund-full'));
  s.withdrawConsent(c.id);
  deltas = [];
  s.reconcileBalance(c.id);
  check('a withdrawn case never moves money again', deltas.length === 0, deltas);
  check('withdrawal deletes the balance counter with the other amounts', s.get(c.id).balanceCreditedCents === undefined, s.get(c.id).balanceCreditedCents); }

// ---------- Done clears the completed case from Home ----------
{ const s = fresh(); const c = open(s);
  let threw = false; try { s.acknowledgeClosed(c.id); } catch { threw = true; }
  check('Done is refused while the refund is not complete', threw);
  s.applyCredit(ev(s, 'ev-refund-full'));
  s.acknowledgeClosed(c.id);
  check('Done marks the closed case', !!s.get(c.id).closedAckedAt);
  const at = s.get(c.id).closedAckedAt; s.acknowledgeClosed(c.id);
  check('Done twice changes nothing', s.get(c.id).closedAckedAt === at);
  check('Done is on the case log', s.auditFor(c.id).some((a) => /cleared from Home/.test(a.detail)), s.auditFor(c.id).slice(-2)); }

// ---------- what Home and the bell show ----------
const view = (over: any) => ({ cases: [{ id: 'rc-1', state: 'closed', withdrawn: false, itemCount: 4, merchant: 'Tuulikki Electronics', expected: 89.9, received: 89.9, remaining: 0, asOf: '2026-10-23', canWrite: null, shopMessages: [], flags: [], needsReview: 0, ...over }] });
{ const n = refundNotice(view({}))!;
  check('a completed case before Done: green arrived row, clearable, carries the case id', n.tone === 'green' && /arrived/.test(n.title) && n.done === true && n.caseId === 'rc-1', n); }
{ const n = refundNotice(view({ closedAckedAt: 'x' }));
  check('after Done the row is gone from Home and the bell', n === null, n); }
{ const n = refundNotice(view({ closedAckedAt: 'x', needsReview: 1 }))!;
  check('a credit to check still shows after Done', !!n && n.tone === 'amber' && /needs your check/.test(n.title) && !n.done, n); }
{ const n = refundNotice(view({ closedAckedAt: 'x', state: 'watching', received: 0, remaining: 89.9, promiseDate: '2026-10-12', late: true }))!;
  check('a reversal after Done brings the amber row back', !!n && n.tone === 'amber' && !n.done, n); }
{ const s = fresh(); const c = open(s);
  s.applyCredit(ev(s, 'ev-refund-full'));
  s.acknowledgeClosed(c.id);
  s.applyCredit(ev(s, 'ev-reversal'));
  check('a reversal after Done spends the Done, so Home shows the case again', s.get(c.id).closedAckedAt === undefined);
  s.applyCredit(ev(s, 'ev-refund-full', { eventId: 'ev-refund-full-2' }));
  check('the money arriving again closes the case and moves the balance again', s.get(c.id).state === 'closed' && sum() === 8990, { state: s.get(c.id).state, deltas }); }

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
