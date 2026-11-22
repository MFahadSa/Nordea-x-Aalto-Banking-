/** Refund Tracker: fixes from instinct's review of 22 Nov 2026 (bugs 1–6), engine only. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadCalendar } from '../src/server/refund/calendar.js';
import { loadPolicy } from '../src/server/refund/policy.js';
import { RefundStore, RefundError, type CreditEvent } from '../src/server/refund/cases.js';
import { DEMO_TODAY } from '../src/server/finance.js';

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 600)}`); }
}
const throws = (fn: () => unknown, re?: RegExp) => { try { fn(); return false; } catch (e) { return e instanceof RefundError && (!re || re.test((e as Error).message)); } };
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'refund-p2b-'));
const policy = loadPolicy(), cal = loadCalendar();
const demoNow = () => `${DEMO_TODAY}T10:00:00.000Z`;
let n = 0;
const fresh = () => new RefundStore(path.join(DIR, `s${++n}.json`), path.resolve('seed', 'refund'), () => policy, () => cal, demoNow).load();
const ALL = ['rec-tx-tuulikki-0928', 'rec-receipt-tuulikki', 'rec-tracking-return', 'rec-email-tuulikki-0505'];
const open = (s: RefundStore, country = 'FI') => s.openCase({ userId: 'lauri', consentItems: ALL, reasons: ['refund_not_received'], country });
const ev = (s: RefundStore, id: string, over: Partial<CreditEvent> = {}): CreditEvent => ({ ...s.presetsFor('lauri').find((e) => e.eventId === id)!, ...over });
const money = (s: RefundStore, id: string) => s.status(id, DEMO_TODAY).money!;
const MSG = { action: 'seller_inquiry' as const, recipient: 'Tuulikki Electronics customer care (fictional)', text: 'Hello, order TE-48213 …', evidenceIds: ['rec-receipt-tuulikki', 'rec-tracking-return'] };

// ---------- bug 1: reversing the only partial ----------
{ const s = fresh(); const c = open(s);
  s.applyCredit(ev(s, 'ev-partial-40'));
  const r = s.applyCredit({ ...ev(s, 'ev-reversal'), eventId: 'rev-40', reversesEventId: 'ev-partial-40', amount: 40 });
  check('bug 1: reversing the only partial → back to watching, 0 received', r.result === 'reversed' && s.get(c.id).state === 'watching' && money(s, c.id).received === 0, { r, state: s.get(c.id).state });
  check('bug 1: the late line is back', s.status(c.id, DEMO_TODAY).late?.workingDays === 9); }
{ const s = fresh(); const c = open(s);
  s.applyCredit(ev(s, 'ev-partial-40')); s.applyCredit(ev(s, 'ev-partial-49-90'));
  s.applyCredit({ ...ev(s, 'ev-reversal'), eventId: 'rev-49', reversesEventId: 'ev-partial-49-90', amount: 49.9 });
  check('reversing one of two partials after close → partially_refunded, 49.90 remaining', s.get(c.id).state === 'partially_refunded' && money(s, c.id).remaining === 49.9); }

// ---------- bug 2: approvals are really checked ----------
{ const s = fresh(); const c = open(s); const other = open(s);
  check('bug 2: a made-up approval id is refused', throws(() => s.executeApproved('not-a-real-approval'), /no recorded approval/) && s.get(c.id).state === 'watching');
  check('bug 2: an approval can no longer be passed straight to transition', throws(() => s.transition(c.id, 'seller_contacted', { kind: 'approval', approvalId: 'x' }), /executeApproved/));
  const a = s.recordApproval(c.id, MSG);
  check('recording an approval is logged, with a fingerprint of recipient, text and evidence', /^[0-9a-f]{64}$/.test(a.fingerprint) && s.auditFor(c.id).some((x) => x.kind === 'approval' && x.detail.includes('seller_inquiry')));
  const d = s.recordApproval(c.id, { ...MSG, action: 'dispute_pack', recipient: 'Nordea disputes (mock)' });
  check('a dispute approval cannot run from "watching" (no auto-escalation)', throws(() => s.executeApproved(d.id), /not allowed/) && s.data.approvals!.find((x) => x.id === d.id)!.status === 'approved');
  const fp = s.approvalFingerprint(c.id, { ...MSG, text: MSG.text + ' edited' });
  check('editing the text changes the fingerprint', fp !== a.fingerprint);
  s.revokeApproval(a.id);
  check('a revoked approval cannot move the case', throws(() => s.executeApproved(a.id), /revoked/) && s.get(c.id).state === 'watching');
  const b = s.recordApproval(c.id, MSG);
  s.executeApproved(b.id, MSG);
  check('a valid approval runs the mock action and moves the case once', s.get(c.id).state === 'seller_contacted' && s.data.approvals!.find((x) => x.id === b.id)!.status === 'used' && s.auditFor(c.id).some((x) => x.kind === 'adapter' && /MOCK seller_inquiry/.test(x.detail)));
  check('a used approval cannot be used again', throws(() => s.executeApproved(b.id), /used/));
  check('an approval only moves its own case (the other case is untouched)', s.get(other.id).state === 'watching'); }
{ const s = fresh(); const c = open(s);
  s.get(c.id).evidence[1].copy!.text += ' (edited)';
  check('evidence changed after storing cannot be put in an approval', throws(() => s.recordApproval(c.id, MSG), /changed/));
  s.withdrawConsent(c.id);
  check('withdrawn evidence cannot be put in an approval', throws(() => s.recordApproval(c.id, { ...MSG, evidenceIds: ['rec-tracking-return'] }), /withdrawn/)); }

// ---------- bug 3: the same credit goes from pending to posted ----------
{ const s = fresh(); const c = open(s);
  const p = s.applyCredit(ev(s, 'ev-pending'));
  check('pending credit is held back', p.result === 'flagged' && s.get(c.id).state === 'watching');
  const q = s.applyCredit(ev(s, 'ev-pending', { status: 'posted' }));
  check('bug 3: the same event id, now posted, is counted and closes the case', q.result === 'counted' && s.get(c.id).state === 'closed' && money(s, c.id).received === 89.9, q);
  check('bug 3: the pending flag is cleared', !money(s, c.id).flags.some((f) => f.eventId === 'ev-pending'));
  check('a third copy of it is ignored (counted once)', s.applyCredit(ev(s, 'ev-pending', { status: 'posted' })).result === 'replay_ignored' && money(s, c.id).received === 89.9);
  check('the same pending event again (still pending) stays held back', (() => { const s2 = fresh(); open(s2); s2.applyCredit(ev(s2, 'ev-pending')); return s2.applyCredit(ev(s2, 'ev-pending')).result === 'replay_ignored'; })()); }

// ---------- bug 4: re-checking held-back credits ----------
{ const s = fresh(); const c = open(s, 'SE');
  s.applyCredit(ev(s, 'ev-refund-full'));
  check('credit on a case with a person is held back', s.get(c.id).state === 'handed_off' && money(s, c.id).received === 0);
  s.get(c.id).country = 'FI'; // stands in for a person fixing the case's country
  s.addCustomerFacts(c.id, { deliveryDate: '2026-09-30' });
  check('bug 4: when the case comes back, the held credit is looked at again and counts', s.get(c.id).state === 'closed' && money(s, c.id).received === 89.9, s.get(c.id).state); }
{ const s = fresh(); const c = open(s);
  const r = s.applyCredit(ev(s, 'ev-no-reference'));
  check('same shop, no reference: held back for the customer to pick', r.result === 'flagged' && (r as any).reason === 'ambiguous_ask_customer');
  check('…and shown as needing review', s.status(c.id, DEMO_TODAY).needsReview.length === 1);
  const a = s.assignCredit('ev-no-reference', c.id);
  check('bug 4: the customer picks the case → counted, closed, review cleared', a.result === 'counted' && s.get(c.id).state === 'closed' && s.status(c.id, DEMO_TODAY).needsReview.length === 0, a);
  check('the pick is logged as the customer\'s', s.auditFor(c.id).some((x) => x.by === 'customer' && x.detail.includes('ev-no-reference'))); }
{ const s = fresh(); const a = open(s); const b = open(s);
  check('a credit fitting two cases is held back', s.applyCredit(ev(s, 'ev-refund-full')).result === 'ambiguous');
  const r = s.assignCredit('ev-refund-full', b.id);
  check('the customer picks one of the two → only that one closes', r.result === 'counted' && s.get(b.id).state === 'closed' && s.get(a.id).state === 'watching'); }
{ const s = fresh(); const c = open(s);
  s.applyCredit(ev(s, 'ev-decoy-other-shop'));
  check('a credit that matched nothing cannot be assigned', throws(() => s.assignCredit('ev-decoy-other-shop', c.id), /not waiting/));
  s.applyCredit(ev(s, 'ev-no-reference', { eventId: 'x-other', merchantId: 'lumo-sports' }));
  check('a credit from another shop cannot be assigned to this case', throws(() => s.assignCredit('x-other', c.id))); }
{ const s = fresh(); const c = open(s);
  s.applyCredit(ev(s, 'ev-refund-full')); s.applyCredit(ev(s, 'ev-lookalike'));
  check('a possible duplicate stays held even if the same event arrives again', s.applyCredit(ev(s, 'ev-lookalike')).result === 'replay_ignored' && money(s, c.id).received === 89.9);
  // ---------- bug 6 (engine part): a closed case still shows "needs review" ----------
  check('bug 6: a closed case with a possible duplicate shows needsReview', s.get(c.id).state === 'closed' && s.status(c.id, DEMO_TODAY).needsReview.some((f) => f.reason === 'possible_duplicate')); }

// ---------- bug 5: one demo clock ----------
{ const s = fresh(); const c = open(s);
  check('bug 5: case created on the demo date', c.createdAt.startsWith(DEMO_TODAY), c.createdAt);
  check('bug 5: every log entry uses the demo date', s.auditFor(c.id).every((a) => a.at.startsWith(DEMO_TODAY)));
  s.withdrawConsent(c.id);
  check('bug 5: withdrawal time uses the demo date', s.get(c.id).consent.withdrawnAt!.startsWith(DEMO_TODAY)); }
{ const src = fs.readFileSync(path.resolve('src/server/refund/index.ts'), 'utf-8');
  check('the app store is built with the demo clock', /DEMO_TODAY/.test(src) && /new RefundStore\([^\n]*demoNow[^\n]*\)\.load\(\)/.test(src)); }

// ---------- old store files ----------
{ const file = path.join(DIR, 'old.json');
  fs.writeFileSync(file, JSON.stringify({ cases: [], audit: [], sources: {}, seq: 0, events: { 'ev-x': 'rc-1', 'ev-y': null } }));
  const s = new RefundStore(file, path.resolve('seed', 'refund'), () => policy, () => cal, demoNow).load();
  check('a phase 2 store file (plain case ids per event) loads without errors', Object.keys(s.data.events ?? {}).length === 0); }

console.log(`\n${passed} passed, ${failed} failed`);
fs.rmSync(DIR, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
