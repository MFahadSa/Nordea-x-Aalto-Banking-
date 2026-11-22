/** Refund Tracker, stage 6: all 15 consent combinations, one open case, withdraw leaves no sensitive data, end to end against a fresh store (demo data only). */
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
const U = '/api/refund/lauri';



resetRefunds(true);
const offer = (await call('GET', U)).json.offer as { id: string; kind: string }[];
let combos = 0, crashes = 0, presenterOk = 0, scrubbed = 0, oneCase = 0;
for (let mask = 1; mask < 16; mask++) {
  resetRefunds(true);
  const pick = offer.filter((_, i) => mask & (1 << i)).map((o) => o.id);
  const made = await call('POST', `${U}/cases`, { consentItems: pick });
  combos++;
  if (made.status !== 201) { check(`combo ${mask}: opens`, false, made.json); continue; }
  // a second open case is refused
  const again = await call('POST', `${U}/cases`, { consentItems: pick });
  if (again.status === 400) oneCase++;
  const v = (await call('GET', U)).json.cases[0];
  const hasLedger = v.expected !== undefined;
  const p = await call('GET', `${U}/presenter`);
  const enabled = p.json.controls.filter((c: any) => c.enabled).length;
  if (v && !v.withdrawn && (hasLedger || enabled === 0)) presenterOk++;
  if (!hasLedger) { const pr = await call('POST', `${U}/presenter/partial`); if (pr.status !== 409) crashes++; }
  await call('POST', `/api/refund/case/${v.id}/withdraw`, {});
  const dump = (JSON.stringify(refunds().data.cases) + JSON.stringify(refunds().data.events ?? {})).replace(/rec-[a-z0-9-]+/g, 'rec');
  if (!/TE-48213|89[.,]9|"amount":(40|49)|JJFI|\bTuulikki\b/i.test(dump)) scrubbed++;
  else console.log('LEFT OVER in combo', mask, (dump.match(/TE-48213|89[.,]9|"amount":(40|49)|JJFI|\bTuulikki\b/i) || [])[0]);
}
check('all 15 combinations open', combos === 15);
check('a second open case is refused for every combination', oneCase === 15, oneCase);
check('no combination leaves a usable Presenter control without an amount, and the case view is fine', presenterOk === 15, presenterOk);
check('Presenter never consumes a demo credit without a ledger', crashes === 0, crashes);
check('after withdrawal nothing sensitive stays in cases or events, for every combination', scrubbed === 15, scrubbed);
// reversal then "Refund arrives" must count again, with opaque ids
resetRefunds(true);
await call('POST', `${U}/cases`, { consentItems: offer.map((o) => o.id) });
await call('POST', `${U}/presenter/arrives`);
await call('POST', `${U}/presenter/reversal`);
let c9 = (await call('GET', U)).json.cases[0];
check('after a reversal nothing is counted', c9.received === 0, c9.received);
const ar = await call('POST', `${U}/presenter/arrives`);
c9 = (await call('GET', U)).json.cases[0];
check('Refund arrives after a reversal counts again (not silently ignored)', ar.status === 200 && c9.received === c9.expected, [ar.json?.result, c9.received]);
const ids9 = Object.keys(refunds().data.events ?? {});
check('presenter-made event ids carry no amount', ids9.filter((i) => i.startsWith('ev-demo-')).every((i) => !/\d{2,}-\d{2}|-\d{4,}/.test(i)), ids9);
// two approvals-free withdraw keeps approvals clean
console.log(`${passed} passed, ${failed} failed`);
server.close();
process.exit(failed ? 1 : 0);
