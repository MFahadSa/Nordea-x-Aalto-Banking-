/**
 * D12 route inventory + bad-id fuzz against the REAL server (mock LLM, seeded temp dir, localhost only).
 * The route list is PARSED from the source files that register routes, so a new route is included automatically.
 * Every route gets a bad id in every carrier: path params, ?userId, body.userId, nested body ids, a header.
 * Asserts: the server stays alive after every request, no HTML error page, no 5xx, a bad id in a guarded carrier
 * is 400 INVALID_CUSTOMER_ID, and not one data file changes. Routes with no customer-id input and a destructive or
 * costly effect are excluded by name and listed in the output.
 */
import { spawn, spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SKIP = new Map<string, string>([
  ['POST /api/users/reset', 'no id input; clears all data'], ['POST /api/admin/reload', 'no id input; reloads all data'],
  ['POST /api/selftest', 'no id input; runs the whole self test'], ['POST /api/ai-ping', 'no id input; calls the model'],
]);
const files = ['server.ts', 'src/server/routes.ts', 'src/server/arch/routes.ts', 'src/server/devMonitor.ts'];
type Route = { method: string; url: string };
const routes: Route[] = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf-8');
  for (const m of src.matchAll(/app\.(get|post|put|patch|delete)\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|`[^`]*`)/g)) {
    for (const u of [...m[2].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1])) if (u.startsWith('/api/')) routes.push({ method: m[1].toUpperCase(), url: u });
  }
}
const uniq = [...new Map(routes.map((r) => [`${r.method} ${r.url}`, r])).values()];

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-fuzz-'));
const PORT = 4800 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const seed = spawnSync(process.execPath, ['scripts/run_python.mjs', 'scripts/load_data.py', 'seed/demo', '--target', 'file', '--no-reload'], { env: { ...process.env, CABINET_DATA_DIR: DIR }, encoding: 'utf-8' });
if (seed.status !== 0) { console.error(seed.stdout, seed.stderr); process.exit(1); }
const server = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, CABINET_DATA_DIR: DIR, LLM_PROVIDER: 'mock', PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let log = ''; server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d?: unknown) => { if (c) pass++; else { fail++; console.log(`FAIL  ${n} ${d === undefined ? '' : JSON.stringify(d)}`); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function snapshot(): string {
  const out: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f); else if (!/\.db-(wal|shm|journal)$/.test(e.name)) out.push(`${path.relative(DIR, f)}:${e.name.endsWith('.db') ? fs.statSync(f).size : crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex')}`);
  } };
  walk(DIR); return out.join('\n');
}
const BADS = ['a.b', 'Lauri', 'a b', 'te.st'];
const alive = async () => { try { return (await fetch(`${BASE}/api/health`)).ok; } catch { return false; } };
try {
  const deadline = Date.now() + 40000;
  while (!(await alive())) { if (Date.now() > deadline) { console.error(log); throw new Error('server did not start'); } await sleep(300); }
  const snap0 = snapshot();
  const tested: string[] = [], skipped: string[] = [];
  let requests = 0;
  for (const r of uniq) {
    const key = `${r.method} ${r.url}`;
    if (SKIP.has(key)) { skipped.push(`${key} (${SKIP.get(key)})`); continue; }
    tested.push(key);
    for (const bad of BADS) {
      const idParams = /:(uid|userId)\b/.test(r.url);
      const url = r.url.replace(/:uid\b|:userId\b/g, encodeURIComponent(bad)).replace(/:[a-zA-Z]+/g, encodeURIComponent(bad));
      const nested = { entry: { userId: bad }, data: { userId: bad, transactions: [{ id: 't', userId: bad, date: '2026-10-01', amount: -1, category: 'x', account: 'current' }], accounts: [] }, payload: { userId: bad, selected: [] }, updates: { userId: bad }, text: 'hi' };
      const variants: { name: string; u: string; init: RequestInit; guarded: boolean }[] = [
        { name: 'path/none', u: url, init: { method: r.method }, guarded: idParams },
        { name: 'query userId', u: `${url}${url.includes('?') ? '&' : '?'}userId=${encodeURIComponent(bad)}`, init: { method: r.method }, guarded: true },
        { name: 'header', u: url, init: { method: r.method, headers: { 'x-user-id': bad, 'x-customer-id': bad } }, guarded: idParams },
      ];
      if (r.method !== 'GET') {
        variants.push({ name: 'body userId', u: url, init: { method: r.method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: bad, text: 'hi' }) }, guarded: true });
        variants.push({ name: 'nested body ids', u: url, init: { method: r.method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(nested) }, guarded: idParams });
      }
      for (const v of variants) {
        requests++;
        const before = v.guarded ? snapshot() : '';
        let status = 0, ct = '', text = '';
        try {
          const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
          const res = await fetch(BASE + v.u, { ...v.init, signal: ctl.signal }); clearTimeout(t);
          status = res.status; ct = res.headers.get('content-type') || '';
          if (!ct.includes('event-stream')) text = await res.text(); else await res.body?.cancel();
        } catch (e) { check(`${key} [${v.name}, ${bad}] request completed`, false, String(e)); }
        const label = `${key} [${v.name}, ${JSON.stringify(bad)}]`;
        check(`${label}: no 5xx`, status > 0 && status < 500, { status, body: text.slice(0, 120) });
        check(`${label}: no HTML error page`, !/<pre>|<html|Error:\s.*\n\s+at /i.test(text) || ct.includes('text/html') && status === 200, text.slice(0, 120));
        if (v.guarded) check(`${label}: rejected before any write (every data file identical)`, snapshot() === before);
        if (v.guarded) check(`${label}: guarded carrier -> 400 INVALID_CUSTOMER_ID`, status === 400 && /INVALID_CUSTOMER_ID/.test(text), { status, body: text.slice(0, 100) });
      }
      check(`server alive after ${key} with ${JSON.stringify(bad)}`, await alive());
    }
  }
  // Requests with NO guarded carrier (header only, nested body ids) use the default customer 'lauri' and may legitimately write to it;
  // what must never happen is a file or index entry named after a bad id.
  const after = snapshot().split('\n').map((l) => l.split(':')[0]);
  const before0 = new Set(snap0.split('\n').map((l) => l.split(':')[0]));
  // The shared pipeline file is fine only if every record in it is the default customer's.
  const pipeOnlyLauri = (f: string) => f === 'pipeline.json' && (() => { const s = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf-8')); return [...s.runs, ...s.candidates, ...s.cases].every((x: { userId: string }) => x.userId === 'lauri'); })();
  const created = after.filter((f) => !before0.has(f) && !/^arch\/lauri\./.test(f) && !pipeOnlyLauri(f)); // lauri = the default customer: its own lazy files are legitimate
  check('no file was created for any bad id or alias (a_b, te_st, lauri-case variants)', created.length === 0, created);
  check('customers index lists no bad id', !BADS.some((b) => fs.readFileSync(path.join(DIR, 'arch', 'customers.json'), 'utf-8').includes(JSON.stringify(b))));
  console.log(`routes parsed: ${uniq.length}; fuzzed: ${tested.length}; skipped: ${skipped.length}; requests: ${requests}`);
  console.log(`skipped: ${skipped.join(' | ')}`);
  check('route inventory is not empty', tested.length >= 40, tested.length);
} catch (e) { fail++; console.log('FAIL  test error', e instanceof Error ? e.message : e); console.error(log.slice(-1500)); }
finally { try { process.kill(-server.pid!, 'SIGTERM'); } catch { server.kill('SIGTERM'); } }
fs.rmSync(DIR, { recursive: true, force: true });
console.log(`customer-id-fuzz: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
