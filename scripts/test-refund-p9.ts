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
const ts = await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: 'Hello' });
check('and sending is refused too', ts.status === 400, ts);
await call('POST', `/api/refund/case/${v.id}/withdraw`, {});

// Step 3: approve and simulated send
v = await open();
const early = await press('shop_agrees');
check('the shop cannot reply before the customer wrote', early.status === 409, early.json?.message);
const empty = await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: '   ' });
check('an empty message is refused', empty.status === 400, empty);
const sent = await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: d.json.text + '\nThank you.' });
v = await view();
check('send files the exact edited text, moves the case to contacted, shows no write option while waiting', sent.status === 200 && v.shopMessages.length === 1 && v.shopMessages[0].text.endsWith('Thank you.') && v.state === 'seller_contacted' && v.canWrite === null, sent.json);
const ap = (refunds().data.approvals ?? []).filter((a) => a.caseId === v.id);
check('one approval, used, with the exact text and a fixed recipient', ap.length === 1 && ap[0].status === 'used' && ap[0].text === v.shopMessages[0].text && /customer service/.test(ap[0].recipient), ap);
const twice = await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: 'again' });
check('a second message while waiting for a reply is refused', twice.status === 400 && (await view()).shopMessages.length === 1, twice);
// tampering: an edit after approval cannot be sent
const aa = refunds().recordApproval(v.id, { action: 'seller_inquiry', recipient: 'The shop customer service', text: 'one text', evidenceIds: refunds().get(v.id).evidence.filter((e) => e.copy).slice(0, 1).map((e) => e.recordId) });
let blocked = false; try { refunds().executeApproved(aa.id, { recipient: aa.recipient, text: 'another text', evidenceIds: aa.evidenceIds }); } catch { blocked = true; }
check('an edit after approval is blocked at send time', blocked);
refunds().revokeApproval(aa.id);
await gone(v.id, 'after sending');

// Step 4: replies. will refund -> reminder (step 5)
v = await open();
await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: d.json.text });
let ctl = (await call('GET', `${U2}/presenter`)).json.controls as any[];
check('reply controls are enabled only after a message was sent', ctl.find((c) => c.id === 'shop_agrees').enabled && ctl.find((c) => c.id === 'shop_more').enabled && !ctl.find((c) => c.id === 'shop_date_passes').enabled, ctl.map((c: any) => [c.id, c.enabled]));
await press('shop_agrees');
v = await view();
check('shop agrees: reply filed, new date set, not late, no write option, case stays contacted', v.shopMessages.length === 2 && v.shopMessages[1].direction === 'in' && !v.late && v.canWrite === null && v.state === 'seller_contacted' && !!v.promiseDate && v.promiseDate > '2026-10-23', v);
check('a second reply to the same message is refused', (await press('shop_agrees')).status === 409);
await gone(v.id, 'after the shop agreed');
v = await open();
await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: d.json.text });
await press('shop_agrees');
await press('shop_date_passes');
v = await view();
check("when the shop's date passes the case is late and a reminder can be written", v.late && v.canWrite === 'reminder', v);
const rd = await call('GET', `/api/refund/case/${v.id}/shop-draft`);
check('the reminder follows up on the first message and the shop date, with no claim of entitlement', rd.status === 200 && /following up on my message/i.test(rd.json.text) && /has passed/.test(rd.json.text) && !/entitled|legal|law|KKV/i.test(rd.json.text), rd.json.text);
const rs = await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: rd.json.text });
v = await view();
check('the reminder is sent with its own approval, and nothing is sent twice', rs.status === 200 && v.shopMessages.length === 3 && v.shopMessages[2].kind === 'reminder' && v.canWrite === null && (refunds().data.approvals ?? []).filter((a) => a.caseId === v.id && a.status === 'used').length === 2, v.shopMessages.map((m: any) => m.kind));
await gone(v.id, 'after the reminder');

// asks for more: no state change, no write option, honest explanation
v = await open();
await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: d.json.text });
await press('shop_more');
v = await view();
check('shop asks for more: noted plainly, case unchanged, no invented way to answer', v.shopMessages.length === 2 && v.canWrite === null && /proof of the return/.test(v.explain.lines.join(' ')) && /do not include it/.test(v.explain.lines.join(' ')) && v.state === 'seller_contacted', v.explain);
await gone(v.id, 'after the shop asked for more');

// refusal: recorded neutrally, case open
v = await open();
await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: d.json.text });
await press('declined');
v = await view();
const ex = v.explain.lines.join(' ');
check('refusal: reply filed, declined recorded, case open, no write option, no entitlement or dispute talk', v.shopMessages.length === 2 && !!v.shopDeclinedAt && v.canWrite === null && v.state !== 'closed' && /cannot refund the rest/.test(ex) && /stays open/.test(ex) && !/entitled|legal|dispute|you are owed/i.test(ex), ex);
await gone(v.id, 'after a refusal');
// no credit and no message survive anywhere after the last withdrawal
check('no case reads anything after withdrawal', (await call('POST', `/api/refund/case/${v.id}/shop-send`, { text: 'x' })).status === 400);
console.log(`${passed} passed, ${failed} failed`);
server.close();
process.exit(failed ? 1 : 0);
