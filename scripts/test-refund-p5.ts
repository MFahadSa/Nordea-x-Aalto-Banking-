/** Refund Tracker, stage 5: review fixes (withdraw scrub, ambiguous credit, thin cases), end to end against a fresh store (demo data only). */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'refund-p5-'));
process.env.CABINET_DATA_DIR = DIR;
const { default: express } = await import('express');
const { registerRefundRoutes } = await import('../src/server/refund/routes.js');
const { resetRefunds, refunds } = await import('../src/server/refund/index.js');

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
let r = await call('GET', U);
const ids: string[] = r.json.offer.map((o: any) => o.id);
// 1. thin case: only the email consented, no ledger
const emailOnly = r.json.offer.filter((o: any) => o.kind === 'seller_email').map((o: any) => o.id);
r = await call('POST', `${U}/cases`, { consentItems: emailOnly });
check('a case with only an email consented opens', r.status === 201, r.json);
let cv = (await call('GET', U)).json.cases[0];
check('thin case view has no expected amount but does not break', cv && !cv.withdrawn && cv.expected === undefined, cv);
await call('POST', `/api/refund/case/${cv.id}/withdraw`, {});
// 2. ambiguous credit gets the assign flow, not the duplicate check
resetRefunds(true);
await call('POST', `${U}/cases`, { consentItems: ids });
await call('POST', `${U}/presenter/no_reference`);
cv = (await call('GET', U)).json.cases[0];
const amb = cv.flags.find((f: any) => f.reason === 'ambiguous_ask_customer');
check('a credit with no reference is flagged as ambiguous, needing the customer', !!amb && amb.needsReview, cv.flags);
let rv = await call('POST', `/api/refund/case/${cv.id}/review`, { eventId: amb.eventId, outcome: 'checked_fine' });
check('Checked, fine is refused for an ambiguous credit (it is not a duplicate)', rv.status === 400, rv);
let as = await call('POST', `/api/refund/case/${cv.id}/assign`, { eventId: amb.eventId, acceptConflicts: amb.conflicts });
check('assign counts it once the customer confirms', as.status === 200 && as.json.case.received > 0, as.json);
// 3. withdraw scrubs credit event payloads linked to the case
resetRefunds(true);
await call('POST', `${U}/cases`, { consentItems: ids });
await call('POST', `${U}/presenter/partial`);
await call('POST', `${U}/presenter/decoy`);
cv = (await call('GET', U)).json.cases[0];
await call('POST', `/api/refund/case/${cv.id}/withdraw`, {});
const evs = Object.values((refunds().data.events ?? {}) as Record<string, any>).filter((h: any) => h.caseId === cv.id);
check('withdraw: case-linked credit events no longer hold amount or references', evs.length > 0 && evs.every((h: any) => h.event.amount === 0 && !h.event.orderRef && !h.event.paymentRef && !h.event.originalTxId && !h.event.merchantId), evs);
check('withdraw: the event ids are kept so a replay is still ignored', evs.every((h: any) => !!h.event.eventId));
const dump = JSON.stringify(refunds().data);
check('withdraw: no 40 or 49,90 amount stays in the case data', !/"amount":(40|49\.9)[,}]/.test(JSON.stringify(evs)), evs);
console.log(`${passed} passed, ${failed} failed`);
server.close();
process.exit(failed ? 1 : 0);
