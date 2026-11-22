/** Refund Tracker, stage 4: Shop refuses (recorded only), end to end against a fresh store (demo data only). */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'refund-p4-'));
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
let r = await call('GET', U);
const ids = r.json.offer.map((o: any) => o.id);
let p = await call('GET', `${U}/presenter`);
check('Shop refuses is off without a case', p.json.controls.find((c: any) => c.id === 'declined')?.enabled === false);
await call('POST', `${U}/cases`, { consentItems: ids });
r = await call('GET', U);
const cid = r.json.cases[0].id;
check('no decline before the press', !r.json.cases[0].shopDeclinedAt);
await call('POST', `${U}/presenter/partial`);
let before = (await call('GET', U)).json.cases[0];
await call('POST', `${U}/presenter/declined`);
let after = (await call('GET', U)).json.cases[0];
check('decline is recorded', !!after.shopDeclinedAt);
check('the counted partial credit stays counted', after.received === before.received && after.received > 0, [before.received, after.received]);
check('the unpaid rest stays visible and the state is unchanged', after.remaining === before.remaining && after.state === before.state, [after.remaining, after.state, before.state]);
check('credits list is unchanged', JSON.stringify(after.credits) === JSON.stringify(before.credits));
const lastLog = after.log[after.log.length - 1];
check('log line says declined, nothing sent, no dispute, and holds no amount', /declined/.test(lastLog.detail) && /Nothing was sent/.test(lastLog.detail) && !/\d+[.,]\d{2}/.test(lastLog.detail), lastLog);
p = await call('GET', `${U}/presenter`);
check('the control then shows Sent and is off', p.json.controls.find((c: any) => c.id === 'declined')?.enabled === false && p.json.controls.find((c: any) => c.id === 'declined')?.label === 'Sent');
// money still works after a decline
await call('POST', `${U}/presenter/arrives`);
let end = (await call('GET', U)).json.cases;
check('a later refund is still counted after the decline', end[0].received === end[0].expected, end[0]);
check('refund home card logic: fully refunded means nothing unpaid', end[0].remaining === 0);
p = await call('GET', `${U}/presenter`);
check('Shop refuses is off once fully refunded or already sent', p.json.controls.find((c: any) => c.id === 'declined')?.enabled === false);
// a fresh case: pressing is refused after withdrawal
resetRefunds(true);
await call('POST', `${U}/cases`, { consentItems: ids });
const c2 = (await call('GET', U)).json.cases[0].id;
await call('POST', `/api/refund/case/${c2}/withdraw`, {});
r = await call('GET', `${U}/presenter`);
check('after withdrawal Shop refuses is off', r.json.controls.find((c: any) => c.id === 'declined')?.enabled === false);
console.log(`${passed} passed, ${failed} failed`);
server.close();
process.exit(failed ? 1 : 0);
