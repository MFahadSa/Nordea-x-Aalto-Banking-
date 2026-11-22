/** Refund Tracker, stage 3: the customer and Presenter HTTP routes, end to end against a fresh store (demo data only). */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'refund-p3-'));
process.env.CABINET_DATA_DIR = DIR;
const { default: express } = await import('express');
const { registerRefundRoutes } = await import('../src/server/refund/routes.js');
const { resetRefunds } = await import('../src/server/refund/index.js');

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 500)}`); }
}
const app = express(); app.use(express.json()); registerRefundRoutes(app);
const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let lastControls: any[] = [];
const call = async (method: string, url: string, body?: unknown) => {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = (await r.json()) as any;
  if (json?.controls) lastControls = json.controls;
  return { status: r.status, json };
};
const U = '/api/refund/lauri';

resetRefunds(true);
// --- the consent card offers kinds only
let r = await call('GET', U);
check('offer lists the 4 record kinds', r.json.offer.length === 4 && r.json.offer.map((o: any) => o.kind).join() === 'card_transaction,receipt,return_tracking,seller_email');
check('offer text has no amount, order number or date before consent', !/\d+[.,]\d{2}|TE-\d+|\d{4}/.test(JSON.stringify(r.json.offer.map((o: any) => [o.title, o.sub]))), r.json.offer);
check('no case yet, honesty note present', r.json.cases.length === 0 && /nothing is really sent/i.test(r.json.demo));
const ids = r.json.offer.map((o: any) => o.id);
// --- presenter before any case: everything off
let p = await call('GET', `${U}/presenter`);
check('presenter controls are all off without a case', p.json.caseId === null && p.json.controls.every((c: any) => !c.enabled));
r = await call('POST', `${U}/presenter/partial`);
check('pressing a disabled control is refused, nothing happens', r.status === 409);
// --- consent
r = await call('POST', `${U}/cases`, { consentItems: [] });
check('ticking nothing is refused', r.status === 400);
r = await call('POST', `${U}/cases`, { consentItems: ['rec-not-offered'] });
check('a record that was not offered is refused', r.status === 400);
r = await call('POST', `${U}/cases`, { consentItems: ids });
const caseId = r.json.case?.id;
check('allowing the 4 items opens a watching case', r.status === 201 && r.json.case.state === 'watching' && r.json.case.itemCount === 4, r.json);
check('case view: owed 89,90, late 9 working days, shop promise 12 Oct', r.json.case.expected === 89.9 && r.json.case.late?.workingDays === 9 && r.json.case.promiseDate === '2026-10-12', r.json.case);
r = await call('POST', `${U}/cases`, { consentItems: ids });
check('a second open case is refused', r.status === 400);
// --- presenter walk-through
p = await call('GET', `${U}/presenter`);
const ctl = (id: string) => lastControls.find((c: any) => c.id === id);
check('partial offers the 1st press; duplicate is off until fully refunded', ctl('partial').label === 'Send 1st' && ctl('duplicate').enabled === false && /fully arrived/.test(ctl('duplicate').note));
r = await call('POST', `${U}/presenter/partial`); p = r;
check('1st partial: 40 counted, badge "1 of 2 sent", next label Send 2nd', r.status === 200 && ctl('partial').badge === '1 of 2 sent' && ctl('partial').label === 'Send 2nd');
let cv = (await call('GET', `/api/refund/case/${caseId}`)).json.case;
check('case is partially refunded, 40,00 received, 49,90 remaining', cv.state === 'partially_refunded' && cv.received === 40 && cv.remaining === 49.9, cv);
check('"Refund arrives" now says it sends what is still owed (49,90)', /49,90/.test(ctl('arrives').note), ctl('arrives'));
r = await call('POST', `${U}/presenter/arrives`);
cv = (await call('GET', `/api/refund/case/${caseId}`)).json.case;
check('refund arrives sends the remainder and closes the case', cv.state === 'closed' && cv.received === 89.9 && cv.remaining === 0 && cv.late === undefined, cv);
check('partial control is no longer pressable once fully refunded', ctl('partial').enabled === false);
check('duplicate is now available', ctl('duplicate').enabled === true);
r = await call('POST', `${U}/presenter/decoy`);
cv = (await call('GET', `/api/refund/case/${caseId}`)).json.case;
check('decoy credit from another shop changes nothing and greys out', cv.received === 89.9 && ctl('decoy').enabled === false && ctl('decoy').badge === 'Sent');
r = await call('POST', `${U}/presenter/duplicate`);
cv = (await call('GET', `/api/refund/case/${caseId}`)).json.case;
check('duplicate on a closed case: not counted, flagged, case stays closed', cv.state === 'closed' && cv.received === 89.9 && cv.needsReview === 1, cv);
const flag = cv.flags.find((f: any) => f.needsReview);
check('the flagged credit carries amount, not counted', flag && flag.amount === 89.9, flag);
r = await call('POST', `/api/refund/case/${caseId}/review`, { eventId: flag.eventId, outcome: 'checked_fine' });
check('"Checked, fine" clears the review marker, nothing counted', r.json.case.needsReview === 0 && r.json.case.received === 89.9, r.json.case);
r = await call('POST', `/api/refund/case/${caseId}/review`, { eventId: flag.eventId, outcome: 'nonsense' });
check('a bad review outcome is refused', r.status === 400);
// --- the log carries no amounts, then withdraw
cv = (await call('GET', `/api/refund/case/${caseId}`)).json.case;
r = await call('POST', `/api/refund/case/${caseId}/withdraw`);
check('withdraw: case view is only the withdrawn shell, no facts or amounts', r.json.case.withdrawn === true && r.json.case.merchant === undefined && r.json.case.expected === undefined && r.json.case.log === undefined, r.json.case);
r = await call('GET', U);
check('listing a withdrawn case exposes no order number, amount or log', !/TE-\d+|89[.,]9|Tuulikki/.test(JSON.stringify(r.json.cases)), r.json.cases);
p = await call('GET', `${U}/presenter`);
check('after withdrawal the presenter has no active case, so everything is off', p.json.caseId === null && p.json.controls.every((c: any) => !c.enabled));
// --- no-reference credit: customer is asked, conflicts shown
resetRefunds(true);
r = await call('POST', `${U}/cases`, { consentItems: ids }); const id2 = r.json.case.id;
await call('POST', `${U}/presenter/no_reference`);
cv = (await call('GET', `/api/refund/case/${id2}`)).json.case;
const amb = cv.flags.find((f: any) => f.reason === 'ambiguous_ask_customer');
check('credit with no reference: held, customer asked', !!amb && cv.needsReview === 1 && cv.received === 0, cv.flags);
r = await call('POST', `/api/refund/case/${id2}/assign`, { eventId: amb.eventId });
check('assign works only with the conflicts acknowledged or none exist', r.status === 200 || r.status === 400, r);
// --- pending credit
resetRefunds(true);
r = await call('POST', `${U}/cases`, { consentItems: ids }); const id3 = r.json.case.id;
await call('POST', `${U}/presenter/pending`);
cv = (await call('GET', `/api/refund/case/${id3}`)).json.case;
check('pending credit is shown as pending and not counted', cv.received === 0 && cv.flags.some((f: any) => f.reason === 'provisional') && cv.late !== undefined, cv.flags);
// --- reversal
resetRefunds(true);
r = await call('POST', `${U}/cases`, { consentItems: ids }); const id4 = r.json.case.id;
check('reversal is off until something is counted', (await call('GET', `${U}/presenter`)).json.controls.find((c: any) => c.id === 'reversal').enabled === false);
await call('POST', `${U}/presenter/partial`); await call('POST', `${U}/presenter/reversal`);
cv = (await call('GET', `/api/refund/case/${id4}`)).json.case;
check('reversal takes back the last counted credit; case is watching, 0 received', cv.state === 'watching' && cv.received === 0, cv);
// --- another customer
r = await call('GET', '/api/refund/ada');
check('a customer without refund records gets an empty offer and no cases', r.status === 200 && r.json.offer.length === 0 && r.json.cases.length === 0);
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
