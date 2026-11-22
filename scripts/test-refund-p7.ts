/** Refund Tracker, stage 7: Save receipt lives and dies with the case. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'refund-p6-'));
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
const U2 = '/api/refund/lauri';
resetRefunds(true);
const offer = (await call('GET', U2)).json.offer as { id: string; kind: string }[];
const ids = (kinds: string[]) => offer.filter((o) => kinds.includes(o.kind)).map((o) => o.id);
// no receipt allowed: nothing to save, nothing invented
await call('POST', `${U2}/cases`, { consentItems: ids(['card_transaction']) });
let v = (await call('GET', U2)).json.cases[0];
check('without an allowed receipt the view offers no Save', v.hasReceipt === false && !v.receiptLabel, v);
const no = await call('POST', `/api/refund/case/${v.id}/save-receipt`, {});
check('saving an unallowed receipt is refused', no.status === 400 && !(await call('GET', U2)).json.cases[0].receiptSavedAt, no);
await call('POST', `/api/refund/case/${v.id}/withdraw`, {});
// receipt allowed: save, then withdraw
resetRefunds(true);
await call('POST', `${U2}/cases`, { consentItems: ids(['receipt']) });
v = (await call('GET', U2)).json.cases[0];
check('with an allowed receipt the view offers Save, not yet saved', v.hasReceipt === true && !v.receiptSavedAt && typeof v.receiptLabel === 'string', v);
const ok = await call('POST', `/api/refund/case/${v.id}/save-receipt`, {});
check('Save keeps the receipt until withdrawal', ok.status === 200 && !!ok.json.case.receiptSavedAt, ok);
const again = await call('POST', `/api/refund/case/${v.id}/save-receipt`, {});
check('saving twice is harmless', again.status === 200 && again.json.case.receiptSavedAt === ok.json.case.receiptSavedAt);
await call('POST', `/api/refund/case/${v.id}/withdraw`, {});
const stored = JSON.stringify(refunds().data.cases);
const w = refunds().data.cases[0];
check('withdrawal removes the saved receipt: no flag, no copy, no readable label', !w.receiptSavedAt && w.evidence.every((e) => e.copy === null && /deleted/.test(e.label)), w.evidence.map((e) => e.label));
check('persisted case holds no receipt text', !/receipt copy|"text":"[^"]{12}/.test(stored.replace(/"hash":"[0-9a-f]+"/g, '')), stored.slice(0, 200));
const after = await call('POST', `/api/refund/case/${v.id}/save-receipt`, {});
check('saving after withdrawal is refused', after.status === 400, after);
const wv = (await call('GET', U2)).json.cases[0];
check('withdrawn view shows no saved receipt', wv.withdrawn === true && !wv.receiptSavedAt && !wv.hasReceipt, wv);
console.log(`${passed} passed, ${failed} failed`);
server.close();
process.exit(failed ? 1 : 0);
