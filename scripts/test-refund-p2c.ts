/** Refund Tracker: instinct's round-2 review of PR #52 (23 Nov 2026). Acceptance tests 1–6, plus the fresh issues
    (dismissing a possible duplicate, assigning a credit with another order number) and withdrawal deleting facts. */
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
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'refund-p2c-'));
const policy = loadPolicy(), cal = loadCalendar();
let n = 0;
const fresh = () => new RefundStore(path.join(DIR, `s${++n}.json`), path.resolve('seed', 'refund'), () => policy, () => cal, () => `${DEMO_TODAY}T10:00:00.000Z`).load();
const ALL = ['rec-tx-tuulikki-0928', 'rec-receipt-tuulikki', 'rec-tracking-return', 'rec-email-tuulikki-0505'];
const open = (s: RefundStore) => s.openCase({ userId: 'lauri', consentItems: ALL, reasons: ['refund_not_received'], country: 'FI' });
const ev = (s: RefundStore, id: string, over: Partial<CreditEvent> = {}): CreditEvent => ({ ...s.presetsFor('lauri').find((e) => e.eventId === id)!, ...over });
const MSG = { action: 'seller_inquiry' as const, recipient: 'Tuulikki Electronics customer care (fictional)', text: 'Hello, about order TE-48213 …', evidenceIds: ['rec-receipt-tuulikki', 'rec-tracking-return'] };
const snap = (s: RefundStore, id: string) => JSON.stringify({ c: s.get(id), a: s.data.approvals });

// ---------- acceptance 1: withdrawal stops credit processing ----------
{ const s = fresh(); const c = open(s);
  s.applyCredit(ev(s, 'ev-partial-40'));
  s.withdrawConsent(c.id);
  const r = s.applyCredit(ev(s, 'ev-partial-49-90'));
  const st = s.status(c.id, DEMO_TODAY);
  check('A1: after withdrawal a matching credit does not touch the case', r.result === 'no_match' && s.get(c.id).state === 'partially_refunded' && s.get(c.id).ledger === undefined, { r, state: s.get(c.id).state });
  check('A1: status says withdrawn, no late line, no money', (st as any).withdrawn === true && st.late === undefined && st.money === undefined);
  check('A1: a reversal for that case is not processed either', s.applyCredit(ev(s, 'ev-reversal', { eventId: 'rev-x', reversesEventId: 'ev-partial-40', amount: 40 })).result === 'no_match'); }

// ---------- owner's decision: withdrawal deletes the facts too ----------
{ const s = fresh(); const c = open(s);
  s.setDraft(c.id, 'sellerMessage', 'Hello…');
  s.withdrawConsent(c.id);
  const w = s.get(c.id);
  check('withdrawal deletes the stored copies, the facts, the drafts and the money record', w.evidence.every((e) => e.copy === null) && Object.keys(w.facts).length === 0 && Object.keys(w.factSources).length === 0 && Object.keys(w.drafts).length === 0 && w.ledger === undefined);
  check('fingerprints and the log are kept', w.evidence.every((e) => /^[0-9a-f]{64}$/.test(e.hash)) && s.auditFor(c.id).some((a) => a.kind === 'consent' && /facts deleted/.test(a.detail)));
  const log = JSON.stringify(s.auditFor(c.id));
  check('the log names records by kind and id, not their contents (no order number, tracking number or amount from the documents)', !/TE-48213|FI-RET-7781|89\.90/.test(log), log.match(/TE-48213|FI-RET-7781|89\.90/));
  check('after withdrawal: no new facts, drafts or approvals', throws(() => s.addCustomerFacts(c.id, { deliveryDate: '2026-09-30' }), /withdrawn/) && throws(() => s.setDraft(c.id, 'summary', 'x'), /withdrawn/) && throws(() => s.recordApproval(c.id, MSG), /withdrawn/)); }

// ---------- acceptance 2: approval, then consent withdrawn ----------
{ const s = fresh(); const c = open(s);
  const a = s.recordApproval(c.id, MSG);
  s.withdrawConsent(c.id);
  check('A2: approval recorded, consent withdrawn → the action is refused', throws(() => s.executeApproved(a.id)));
  check('A2: the approval is not marked used and the case did not move', s.data.approvals!.find((x) => x.id === a.id)!.status !== 'used' && s.get(c.id).state === 'watching');
  check('A2: withdrawal revoked the open approval', s.data.approvals!.find((x) => x.id === a.id)!.status === 'revoked'); }

// ---------- acceptance 3: approval, then evidence altered ----------
{ const s = fresh(); const c = open(s);
  const a = s.recordApproval(c.id, MSG);
  s.get(c.id).evidence.find((e) => e.recordId === 'rec-tracking-return')!.copy!.text += ' (edited)';
  const before = snap(s, c.id);
  check('A3: approval recorded, evidence altered → the action is refused', throws(() => s.executeApproved(a.id), /evidence changed/));
  const after = s.get(c.id);
  check('A3: approval still "approved" (not used), case still watching', s.data.approvals!.find((x) => x.id === a.id)!.status === 'approved' && after.state === 'watching' && snap(s, c.id) === before); }

// ---------- acceptance 4: empty approval fields ----------
{ const s = fresh(); const c = open(s);
  check('A4: empty recipient refused', throws(() => s.recordApproval(c.id, { ...MSG, recipient: '  ' }), /recipient/));
  check('A4: empty text refused', throws(() => s.recordApproval(c.id, { ...MSG, text: '' }), /text/));
  check('A4: empty evidence list refused', throws(() => s.recordApproval(c.id, { ...MSG, evidenceIds: [] }), /evidence/));
  check('A4: nothing was recorded', !(s.data.approvals ?? []).length); }

// ---------- acceptance 5: used only when the action succeeded ----------
{ const s = fresh(); const c = open(s);
  const a = s.recordApproval(c.id, MSG);
  s.adapterFailure = () => 'mock outage';
  const before = snap(s, c.id);
  check('A5: a failing mock action is refused', throws(() => s.executeApproved(a.id), /mock adapter failed/));
  check('A5: after the failure the approval is still "approved" and the case unchanged', s.data.approvals!.find((x) => x.id === a.id)!.status === 'approved' && snap(s, c.id) === before);
  check('A5: the failure is logged; no adapter entry', s.auditFor(c.id).some((x) => /did not run/.test(x.detail)) && !s.auditFor(c.id).some((x) => x.kind === 'adapter'));
  s.adapterFailure = null;
  check('A5: an edited message (current draft) is refused as stale', throws(() => s.executeApproved(a.id, { ...MSG, text: MSG.text + ' P.S.' }), /edited/) && s.get(c.id).state === 'watching');
  check('A5: changed evidence list is refused as stale', throws(() => s.executeApproved(a.id, { ...MSG, evidenceIds: ['rec-receipt-tuulikki'] }), /edited/));
  s.executeApproved(a.id, MSG);
  const log = s.auditFor(c.id);
  const iAdapter = log.findIndex((x) => x.kind === 'adapter'), iState = log.findIndex((x) => x.kind === 'state' && /seller_contacted/.test(x.detail));
  check('A5: on success: adapter ran first, then "used", then the move', iAdapter > -1 && iState > iAdapter && s.data.approvals!.find((x) => x.id === a.id)!.status === 'used' && s.get(c.id).state === 'seller_contacted');
  check('A5: the mock action says nothing was sent', /nothing was sent/.test(log[iAdapter].detail)); }

// ---------- acceptance 6: earlier refusals still hold ----------
{ const s = fresh(); const c = open(s); const other = open(s);
  const a = s.recordApproval(c.id, MSG);
  const d = s.recordApproval(c.id, { ...MSG, action: 'dispute_pack', recipient: 'Nordea disputes (mock)' });
  check('A6: made-up id refused', throws(() => s.executeApproved('ap-made-up'), /no recorded approval/));
  check('A6: wrong action refused (dispute from watching)', throws(() => s.executeApproved(d.id), /not allowed/));
  s.revokeApproval(a.id);
  check('A6: revoked refused', throws(() => s.executeApproved(a.id), /revoked/));
  const b = s.recordApproval(c.id, MSG); s.executeApproved(b.id);
  check('A6: reused refused', throws(() => s.executeApproved(b.id), /used/));
  check('A6: other case untouched by this case\'s approvals', s.get(other.id).state === 'watching');
  check('A6: transition never accepts an approval directly', throws(() => s.transition(other.id, 'seller_contacted', { kind: 'approval', approvalId: b.id }), /executeApproved/)); }

// ---------- fresh issue 2: a possible duplicate can be checked off ----------
{ const s = fresh(); const c = open(s);
  s.applyCredit(ev(s, 'ev-refund-full')); s.applyCredit(ev(s, 'ev-lookalike'));
  check('closed case shows the duplicate as needing a check', s.status(c.id, DEMO_TODAY).needsReview.length === 1);
  s.reviewFlag(c.id, 'ev-lookalike', 'checked_fine');
  check('"Checked, fine" clears it, logged, nothing counted', s.status(c.id, DEMO_TODAY).needsReview.length === 0 && s.status(c.id, DEMO_TODAY).money!.received === 89.9 && s.auditFor(c.id).some((x) => /checked: fine/.test(x.detail)));
  check('the same event can still never be counted later', s.applyCredit(ev(s, 'ev-lookalike')).result === 'replay_ignored' && s.status(c.id, DEMO_TODAY).money!.received === 89.9);
  check('only duplicates can be checked off this way', throws(() => { const s2 = fresh(); const c2 = open(s2); s2.applyCredit(ev(s2, 'ev-no-reference')); s2.reviewFlag(c2.id, 'ev-no-reference', 'checked_fine'); }, /waiting for ambiguous/)); }

// ---------- fresh issue 3: assigning a credit that names another order ----------
{ const s = fresh(); const c = open(s);
  s.applyCredit(ev(s, 'ev-no-reference', { eventId: 'x-99999', orderRef: 'TE-99999' }));
  const conflicts = s.creditConflicts('x-99999', c.id);
  check('the conflict is named', conflicts.length === 1 && conflicts[0].includes('TE-99999'), conflicts);
  check('assigning it without the customer seeing the conflict is refused; nothing counted', throws(() => s.assignCredit('x-99999', c.id), /does not fit/) && s.get(c.id).state === 'watching');
  check('…and with only some conflicts acknowledged it is still refused', throws(() => s.assignCredit('x-99999', c.id, { acceptConflicts: ['something else'] }), /does not fit/));
  const r = s.assignCredit('x-99999', c.id, { acceptConflicts: conflicts });
  check('with the conflict shown and confirmed, it is counted and the log says so', r.result === 'counted' && s.auditFor(c.id).some((x) => x.by === 'customer' && /although it says order TE-99999/.test(x.detail))); }
{ const s = fresh(); const c = open(s);
  s.applyCredit(ev(s, 'ev-no-reference'));
  check('a credit with no conflicting details is assigned without extra confirmation', s.creditConflicts('ev-no-reference', c.id).length === 0 && s.assignCredit('ev-no-reference', c.id).result === 'counted'); }

console.log(`\n${passed} passed, ${failed} failed`);
fs.rmSync(DIR, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
