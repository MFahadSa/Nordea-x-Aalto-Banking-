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
  const dump = (JSON.stringify(refunds().data.cases) + JSON.stringify(refunds().data.events ?? {}));
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
// replay safety survives withdrawal through the opaque tombstone
resetRefunds(true);
await call('POST', `${U}/cases`, { consentItems: offer.map((o) => o.id) });
await call('POST', `${U}/presenter/partial`);
const first = Object.values((refunds().data.events ?? {}) as Record<string, any>).find((h: any) => h.outcome === 'counted') as any;
const cid8 = (await call('GET', U)).json.cases[0].id;
const evCopy = structuredClone(refunds().data.events!['ev-partial-40'].event);
await call('POST', `/api/refund/case/${cid8}/withdraw`, {});
check('after withdrawal the readable credit id is gone from the store', !refunds().data.events!['ev-partial-40'] && !JSON.stringify(refunds().data.cases).includes('ev-partial-40') && !Object.keys(refunds().data.events!).some((k) => k.includes('partial')), Object.keys(refunds().data.events!));
const again = refunds().applyCredit(evCopy, 'system');
check('the same credit replayed after withdrawal is still ignored', again.result === 'replay_ignored', again);
check('no readable record or credit id stays in the case log', !refunds().auditFor(cid8).some((a) => /\b(?:ev|rec)-[a-z]/.test(a.detail)), refunds().auditFor(cid8).map((a) => a.detail));
// a fully refunded case still blocks a second case for the same customer
resetRefunds(true);
await call('POST', `${U}/cases`, { consentItems: offer.map((o) => o.id) });
await call('POST', `${U}/presenter/arrives`);
const dup2 = await call('POST', `${U}/cases`, { consentItems: offer.map((o) => o.id) });
check('a closed (fully refunded) case still blocks a second case until withdrawn', dup2.status === 400, dup2);
const v2 = (await call('GET', U)).json.cases[0];
check('case view says whether the card purchase was allowed', typeof v2.hasCard === 'boolean' && v2.hasCard === true);
// full -> withdraw -> consent again: every Presenter control starts fresh and works, with replay protection on
resetRefunds(true);
const allIds = offer.map((o) => o.id);
await call('POST', `${U}/cases`, { consentItems: allIds });
await call('POST', `${U}/presenter/partial`); await call('POST', `${U}/presenter/partial`); await call('POST', `${U}/presenter/decoy`);
let cvA = (await call('GET', U)).json.cases[0];
await call('POST', `/api/refund/case/${cvA.id}/withdraw`, {});
await call('POST', `${U}/cases`, { consentItems: allIds });
let ctl = (await call('GET', `${U}/presenter`)).json.controls as any[];
check('after a withdraw and a new case, partial and decoy are fresh again', ctl.find((c) => c.id === 'partial').label === 'Send 1st' && ctl.find((c) => c.id === 'decoy').label === 'Send', ctl.map((c) => [c.id, c.label]));
const pa = await call('POST', `${U}/presenter/arrives`);
let cvB = (await call('GET', U)).json.cases.find((c: any) => !c.withdrawn);
check('Refund arrives in the new case really counts', pa.status === 200 && cvB.received === cvB.expected, [pa.json?.result, cvB.received]);
const pd = await call('POST', `${U}/presenter/decoy`);
check('a used control in the new case is not silently ignored', pd.status === 200 && pd.json.result && pd.json.result.result !== 'replay_ignored', pd.json?.result);
// pending -> withdraw -> the same credit posted later is final, not reprocessed, not logged raw
resetRefunds(true);
await call('POST', `${U}/cases`, { consentItems: allIds });
await call('POST', `${U}/presenter/pending`);
const cvP = (await call('GET', U)).json.cases[0];
const pendEv = structuredClone(refunds().data.events!['ev-pending'].event);
await call('POST', `/api/refund/case/${cvP.id}/withdraw`, {});
const logBefore = refunds().auditFor(cvP.id).length;
const posted = refunds().applyCredit({ ...pendEv, status: 'posted' }, 'system');
check('a pending credit that posts after withdrawal is ignored', posted.result === 'replay_ignored', posted);
check('nothing is relogged or stored under the raw id', refunds().auditFor(cvP.id).length === logBefore && !refunds().data.events!['ev-pending'] && !JSON.stringify(refunds().auditFor(cvP.id)).includes('ev-pending'));
// raw persisted state across withdraw cycles: no processed copy (matched or not) keeps an amount, shop, user or readable id
{
  const fsm = await import('node:fs');
  let clean = true, grew = false, last = -1; const why: unknown[] = [];
  for (let cyc = 0; cyc < 4; cyc++) {
    resetRefunds(true);
    await call('POST', `${U}/cases`, { consentItems: allIds });
    for (const k of ['partial', 'partial', 'decoy', 'no_reference', 'pending', 'other_currency']) await call('POST', `${U}/presenter/${k}`);
    await call('POST', `${U}/presenter/arrives`);
    const live = (await call('GET', U)).json.cases.find((c: any) => !c.withdrawn);
    await call('POST', `/api/refund/case/${live.id}/withdraw`, {});
    const evs = Object.entries(refunds().data.events ?? {});
    const raw = JSON.stringify(refunds().data.events) + JSON.stringify(refunds().data.audit);
    const bad = evs.filter(([k, h]: any) => !/^h-/.test(k) || h.event.amount !== 0 || h.event.merchantId || h.event.userId || h.origin);
    if (bad.length || /ev-[a-z]|89[.,]9|Tuulikki|\"amount\":[1-9]/.test(raw)) { clean = false; why.push([cyc, bad.length, raw.slice(0, 200)]); }
    try { const file = fsm.readFileSync(new URL('../data/refunds.json', import.meta.url), 'utf8'); if (/\"merchantId\":\"[a-z]/.test(file.split('"presets"')[0] ?? '') && /ev-[a-z]/.test(JSON.stringify(JSON.parse(file).events ?? {}))) { clean = false; why.push('file'); } } catch { /* no file written */ }
    last = evs.length; grew = grew || last > 12;
  }
  check('after four cycles no processed credit copy (incl. decoy and no-reference) keeps an amount, shop, user or readable id', clean, why);
  check('withdrawn copies do not pile up across cycles', !grew, last);
}
console.log(`${passed} passed, ${failed} failed`);
server.close();
process.exit(failed ? 1 : 0);
