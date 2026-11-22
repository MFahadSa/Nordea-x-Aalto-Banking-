/** Refund Tracker: the retained log carries no amounts after withdrawal (follow-up to the PR #52 review). */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadCalendar } from '../src/server/refund/calendar.js';
import { loadPolicy } from '../src/server/refund/policy.js';
import { RefundStore, type CreditEvent } from '../src/server/refund/cases.js';
import { DEMO_TODAY } from '../src/server/finance.js';

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 600)}`); }
}
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'refund-p2d-'));
const policy = loadPolicy(), cal = loadCalendar();
let n = 0;
const fresh = () => new RefundStore(path.join(DIR, `s${++n}.json`), path.resolve('seed', 'refund'), () => policy, () => cal, () => `${DEMO_TODAY}T10:00:00.000Z`).load();
const ALL = ['rec-tx-tuulikki-0928', 'rec-receipt-tuulikki', 'rec-tracking-return', 'rec-email-tuulikki-0505'];
const open = (s: RefundStore) => s.openCase({ userId: 'lauri', consentItems: ALL, reasons: ['refund_not_received'], country: 'FI' });
const ev = (s: RefundStore, id: string, over: Partial<CreditEvent> = {}): CreditEvent => ({ ...s.presetsFor('lauri').find((e) => e.eventId === id)!, ...over });
const AMOUNT = /(?<![\d:.])\d{1,6}[.,]\d{2}(?![\d:.]|\d)(?!Z)/;

{ const s = fresh(); const c = open(s);
  s.applyCredit(ev(s, 'ev-partial-40'));
  s.applyCredit(ev(s, 'ev-reversal', { eventId: 'r1', reversesEventId: 'ev-partial-40' }));
  s.applyCredit(ev(s, 'ev-partial-40'));
  s.applyCredit(ev(s, 'ev-refund-full', { eventId: 'full1' }));
  s.applyCredit(ev(s, 'ev-lookalike'));
  s.withdrawConsent(c.id);
  const log = s.auditFor(c.id).map((a) => a.detail).join('\n');
  check("retained log has no amounts after partial, reversal, full and duplicate credits", !AMOUNT.test(log), log.split("\n").filter((l) => AMOUNT.test(l)));
  check('log has no order, tracking or payment reference', !/TE-\d+|TUU-PAY|PKG/i.test(log));
  check('log still records the credit, the matching and the withdrawal', /matched the case/.test(log) && /Consent withdrawn/.test(log)); }
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
