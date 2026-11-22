/** Refund Tracker, stage 9: write to the shop, approval, simulated replies, follow-up, withdrawal at every stage. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'refund-p9-'));
process.env.CABINET_DATA_DIR = DIR;
const { default: express } = await import('express');
const { registerRefundRoutes } = await import('../src/server/refund/routes.js');
const { RefundStore } = await import('../src/server/refund/cases.js');
const { loadPolicy } = await import('../src/server/refund/policy.js');
const { loadCalendar } = await import('../src/server/refund/calendar.js');
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
const U2 = '/api/refund/lauri';
const reloaded = () => new RefundStore(path.join(DIR, 'refunds.json'), path.resolve('seed', 'refund'), () => loadPolicy(), () => loadCalendar(), () => new Date().toISOString()).load();
let offer: { id: string; kind: string }[] = [];
const open = async (kinds?: string[]) => {
  resetRefunds(true);
  offer = (await call('GET', U2)).json.offer;
  const ids = offer.filter((o) => !kinds || kinds.includes(o.kind)).map((o) => o.id);
  await call('POST', `${U2}/cases`, { consentItems: ids });
  await call('POST', `${U2}/presenter/partial`);
  return (await call('GET', U2)).json.cases[0];
};
const view = async () => (await call('GET', U2)).json.cases.find((c: any) => !c.withdrawn);
const press = (id: string) => call('POST', `${U2}/presenter/${id}`);
const SECRETS = /Kind regards|parcel receipt|customer service|following up on my message|refund the rest|cannot refund the rest/i;
const gone = async (cid: string, label: string) => {
  await call('POST', `/api/refund/case/${cid}/withdraw`, {});
  const full = JSON.parse(fs.readFileSync(path.join(DIR, 'refunds.json'), 'utf8'));
  const raw = JSON.stringify({ cases: full.cases, audit: full.audit, approvals: full.approvals, events: full.events });
  const back = reloaded().data.cases.find((c) => c.id === cid)!;
  check(`${label}: withdrawal deletes messages, replies and the shop's date from disk`, !back.shopMessages && !back.shopPromiseDate && !SECRETS.test(raw), raw.match(SECRETS)?.[0]);
  check(`${label}: approvals keep no text or recipient and are not usable`, (back as any) && (reloaded().data.approvals ?? []).filter((a) => a.caseId === cid).every((a) => a.text === '' && a.recipient === '' && a.status !== 'approved'));
};

// Step 1+2: explain and draft
let v = await open();
check('late case with money owed can write to the shop', v.canWrite === 'inquiry' && v.explain.lines.length >= 2 && /still to come/.test(v.explain.lines.join(' ')), v.explain);
const d = await call('GET', `/api/refund/case/${v.id}/shop-draft`);
check('draft is built from allowed facts: order, amount, paid, promised date, what was received', d.status === 200 && /TE-48213/.test(d.json.text) && /89,90 EUR/.test(d.json.text) && /40,00 EUR/.test(d.json.text) && /12 Oct/.test(d.json.text) && d.json.cites.length >= 1, d.json);
check('draft makes no legal or entitlement claim and names no law or authority', !/entitled|legal|law|KKV|dispute|must refund|right to/i.test(d.json.text), d.json.text);
check('nothing was sent by drafting', !(await view()).shopMessages.length && (reloaded().data.approvals ?? []).length === 0);
// thin consent: nothing allowed that shows the purchase
v = await open(['return_tracking']);
const t = await call('GET', `/api/refund/case/${v.id}/shop-draft`);
check('without an allowed purchase or receipt there is no draft and no write option', t.status === 400 && !v.canWrite, t);
const ts = await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: 'Hello', basis: d.json.basis });
check('and sending is refused too', ts.status === 400, ts);
await call('POST', `/api/refund/case/${v.id}/withdraw`, {});

// Step 3: approve and simulated send
v = await open();
const old = d.json.basis;
const d2 = await call('GET', `/api/refund/case/${v.id}/shop-draft`);
check('a draft from another case cannot be sent here', (await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: d2.json.text, basis: old })).status === 400 && !(await view()).shopMessages.length);
d.json.basis = d2.json.basis;
const early = await press('shop_agrees');
check('the shop cannot reply before the customer wrote', early.status === 409, early.json?.message);
const empty = await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: '   ', basis: d.json.basis });
check('an empty message is refused', empty.status === 400, empty);
const sent = await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: d.json.text + '\nThank you.', basis: d.json.basis });
v = await view();
check('send files the exact edited text, moves the case to contacted, shows no write option while waiting', sent.status === 200 && v.shopMessages.length === 1 && v.shopMessages[0].text.endsWith('Thank you.') && v.state === 'seller_contacted' && v.canWrite === null, sent.json);
const ap = (refunds().data.approvals ?? []).filter((a) => a.caseId === v.id);
check('one approval, used, with the exact text and a fixed recipient', ap.length === 1 && ap[0].status === 'used' && ap[0].text === v.shopMessages[0].text && /customer service/.test(ap[0].recipient), ap);
const twice = await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: 'again', basis: d.json.basis });
check('a second message while waiting for a reply is refused', twice.status === 400 && (await view()).shopMessages.length === 1, twice);
// tampering: an edit after approval cannot be sent
const aa = refunds().recordApproval(v.id, { action: 'seller_inquiry', recipient: 'The shop customer service', text: 'one text', evidenceIds: refunds().get(v.id).evidence.filter((e) => e.copy).slice(0, 1).map((e) => e.recordId) });
let blocked = false; try { refunds().executeApproved(aa.id, { recipient: aa.recipient, text: 'another text', evidenceIds: aa.evidenceIds }); } catch { blocked = true; }
check('an edit after approval is blocked at send time', blocked);
refunds().revokeApproval(aa.id);
await gone(v.id, 'after sending');

const sendFresh = async (id: string, extra = '') => { const f = await call('GET', `/api/refund/case/${id}/shop-draft`); return call('POST', `/api/refund/case/${id}/shop-send`, { text: f.json.text + extra, basis: f.json.basis }); };
// Step 4: replies. will refund -> reminder (step 5)
v = await open();
await sendFresh(v.id);
let ctl = (await call('GET', `${U2}/presenter`)).json.controls as any[];
check('reply controls are enabled only after a message was sent', ctl.find((c) => c.id === 'shop_agrees').enabled && ctl.find((c) => c.id === 'shop_more').enabled && !ctl.find((c) => c.id === 'shop_date_passes').enabled, ctl.map((c: any) => [c.id, c.enabled]));
await press('shop_agrees');
v = await view();
check('shop agrees: reply filed, new date set, not late, no write option, case stays contacted', v.shopMessages.length === 2 && v.shopMessages[1].direction === 'in' && !v.late && v.canWrite === null && v.state === 'seller_contacted' && !!v.promiseDate && v.promiseDate > '2026-10-23', v);
check('a second reply to the same message is refused', (await press('shop_agrees')).status === 409);
await gone(v.id, 'after the shop agreed');
v = await open();
await sendFresh(v.id);
await press('shop_agrees');
await press('shop_date_passes');
v = await view();
check("when the shop's date passes the case is late and a reminder can be written", v.late && v.canWrite === 'reminder', v);
const rd = await call('GET', `/api/refund/case/${v.id}/shop-draft`);
check('the reminder follows up on the first message and the shop date, with no claim of entitlement', rd.status === 200 && /following up on my message/i.test(rd.json.text) && /has passed/.test(rd.json.text) && !/entitled|legal|law|KKV/i.test(rd.json.text), rd.json.text);
const rs = await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: rd.json.text, basis: rd.json.basis });
v = await view();
check('the reminder is sent with its own approval, and nothing is sent twice', rs.status === 200 && v.shopMessages.length === 3 && v.shopMessages[2].kind === 'reminder' && v.canWrite === null && (refunds().data.approvals ?? []).filter((a) => a.caseId === v.id && a.status === 'used').length === 2, v.shopMessages.map((m: any) => m.kind));
await gone(v.id, 'after the reminder');

// asks for more: no state change, no write option, honest explanation
v = await open();
await sendFresh(v.id);
await press('shop_more');
v = await view();
check('shop asks for more: allowed return tracking lets the customer answer, and the copy says so', v.shopMessages.length === 2 && v.canWrite === 'answer' && /needs proof of the return/.test(v.explain.lines.join(' ')) && !/do not include it|withdraw/.test(v.explain.lines.join(' ') + v.explain.next) && /answer/i.test(v.explain.next), v.explain);
const ad = await call('GET', `/api/refund/case/${v.id}/shop-draft`);
check('the answer cites return tracking and states no received amount', ad.status === 200 && ad.json.kind === 'answer' && /3 Oct/.test(ad.json.text) && !/40,00|89,90|TE-48213|Wireless|paid on/.test(ad.json.text) && ad.json.cites.length === 1, ad.json);
const tr = refunds().get(v.id).evidence.find((e) => e.kind === 'return_tracking')!;
const keepHash = tr.hash; const keepFields = tr.copy!.fields; tr.copy!.fields = { ...keepFields, changedAfterDraft: 'x' }; (tr as any).hash = 'changed';
check('a changed underlying record (same facts) makes the old answer draft stale', (await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: ad.json.text, basis: ad.json.basis })).status === 400 && (await view()).shopMessages.length === 2);
tr.copy!.fields = keepFields; (tr as any).hash = keepHash;
const as = await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: ad.json.text, basis: ad.json.basis });
v = await view();
check('the answer is sent in the same thread with its own approval and the shop can reply again', as.status === 200 && v.shopMessages.length === 3 && v.shopMessages[2].kind === 'answer' && v.canWrite === null && (await press('shop_agrees')).status === 200);
await gone(v.id, 'after the shop asked for more');

// refusal: recorded neutrally, case open
v = await open();
await sendFresh(v.id);
await press('declined');
v = await view();
const ex = v.explain.lines.join(' ');
check('refusal: reply filed, declined recorded, case open, no write option, no entitlement or dispute talk', v.shopMessages.length === 2 && !!v.shopDeclinedAt && v.canWrite === null && v.state !== 'closed' && /cannot refund the rest/.test(ex) && /stays open/.test(ex) && !/entitled|legal|dispute|you are owed/i.test(ex), ex);
await gone(v.id, 'after a refusal');
// no credit and no message survive anywhere after the last withdrawal
check('no case reads anything after withdrawal', (await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: 'x' })).status === 400);
// clock: after the shop's date passes, the case's own date, credits and audit rows agree
v = await open();
await sendFresh(v.id); await press('shop_agrees'); await press('shop_date_passes');
v = await view();
await press('arrives');
const vc = await view(); const au = reloaded().data.audit.filter((a) => a.caseId === v.id);
check('promise stays 30 Oct, the case date moved past it, late is counted to that date, and later credits and audit rows are not dated before it', v.promiseDate === '2026-10-30' && v.asOf > '2026-10-30' && v.late && vc.credits.slice(-1)[0].date === v.asOf && au.slice(-2).every((a) => a.at.slice(0, 10) >= v.asOf), { asOf: v.asOf, late: v.late, cd: vc.credits.slice(-1)[0]?.date, audit: au.slice(-2).map((a) => a.at) });
await call('POST', `/api/refund/case/${v.id}/withdraw`, {});
// stale draft: a credit arrives after the draft was written
v = await open();
const sd = await call('GET', `/api/refund/case/${v.id}/shop-draft`);
await press('arrives');
const stale = await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: sd.json.text, basis: sd.json.basis });
check('a draft written before money arrived is refused and nothing is sent', stale.status === 400 && /review the updated draft|nothing to write/i.test(JSON.stringify(stale.json)) && !(await view()).shopMessages.length, stale);
await call('POST', `/api/refund/case/${v.id}/withdraw`, {});
// receipt only: the shop is not named by any allowed record, so there is no draft and no recipient
v = await open(['receipt']);
const ro = await call('GET', `/api/refund/case/${v.id}/shop-draft`);
check('receipt only: the shop is named by no allowed record, so no draft, no write option and no send', ro.status === 400 && !v.canWrite && (await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: 'x', basis: 'y' })).status === 400);
await call('POST', `/api/refund/case/${v.id}/withdraw`, {});
console.log(`${passed} passed, ${failed} failed`);
server.close();
process.exit(failed ? 1 : 0);
