/**
 * D12 behavior proof against the REAL server (mock LLM, throwaway seeded data dir, no network beyond localhost,
 * no hosted credentials): ambiguous ids get a plain 400 on the real routes and leave NO state behind
 * (no files, no index change); canonical ids keep working. Mutating the real guard must fail this test.
 */
import { spawn, spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-srv-'));
const PORT = 4300 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const seed = spawnSync(process.execPath, ['scripts/run_python.mjs', 'scripts/load_data.py', 'seed/demo', '--target', 'file', '--no-reload'], { env: { ...process.env, CABINET_DATA_DIR: DIR }, encoding: 'utf-8' });
if (seed.status !== 0) { console.error(seed.stdout, seed.stderr); process.exit(1); }
// A historical index entry under an unsupported name (e.g. registered before D12): it must be reported, not offered, and left untouched.
const idxFile = path.join(DIR, 'arch', 'customers.json');
fs.writeFileSync(idxFile, JSON.stringify([...(JSON.parse(fs.readFileSync(idxFile, 'utf-8')) as string[]), 'te.st']));
const server = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, CABINET_DATA_DIR: DIR, LLM_PROVIDER: 'mock', PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let log = ''; server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d?: unknown) => { if (c) { pass++; console.log(`PASS  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d === undefined ? '' : JSON.stringify(d)}`); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function api(method: string, p: string, body?: unknown) {
  const r = await fetch(BASE + p, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) as any };
}
/** Every file under the data dir with a content hash: any state change shows up as a diff. */
function snapshot(): string {
  const out: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f); else if (!/\.db-(wal|shm|journal)$/.test(e.name)) out.push(`${path.relative(DIR, f)}:${e.name.endsWith('.db') ? 'db' : crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex')}`);
  } };
  walk(DIR); return out.join('\n');
}
const BAD = ['te.st', 'Lauri', 'a.b', 'a b', 'a%2Fb', '..', 'a@b.com', 'lauri.x'];
try {
  const deadline = Date.now() + 40000;
  for (;;) {
    try { if ((await fetch(`${BASE}/api/arch/customers`)).ok) break; } catch { /* not up */ }
    if (Date.now() > deadline) { console.error(log); throw new Error('server did not start'); }
    await sleep(300);
  }
  const cust = await api('GET', '/api/arch/customers');
  check('customers endpoint does not offer te.st, and lists it as rejected', !cust.json.customers.includes('te.st') && cust.json.rejected.join() === 'te.st' && cust.json.customers.includes('lauri'), cust.json);
  const mon0 = await api('GET', '/api/dev/monitor?userId=lauri');
  check('dev monitor shows the unsupported id, skipped hosted ids and that nothing was changed', mon0.status === 200 && mon0.json.unsupportedIds?.rejectedLocal?.join() === 'te.st' && mon0.json.unsupportedIds?.hydrateSkipped?.hostedUnchanged === true, { s: mon0.status, u: mon0.json?.unsupportedIds, e: JSON.stringify(mon0.json).slice(0, 200) });
  const files0 = fs.readdirSync(path.join(DIR, 'arch')).sort().join(',');
  const idx0 = JSON.stringify((await api('GET', '/api/arch/customers')).json);
  const snap0 = snapshot();
  for (const id of BAD) {
    const q = encodeURIComponent(id).replace(/%252F/g, '%2F');
    const state = await api('GET', `/api/state?userId=${q}`);
    check(`real GET /api/state?userId=${id} -> 400`, state.status === 400 && state.json?.code === 'INVALID_CUSTOMER_ID', state.status);
    const chat = await api('POST', '/api/chat', { userId: id, text: 'hello' });
    check(`real POST /api/chat userId=${id} -> 400`, chat.status === 400 && chat.json?.code === 'INVALID_CUSTOMER_ID', chat.status);
    if (id === '..') { const mon0 = await api('GET', `/api/dev/monitor?userId=${q}`); check('real dev monitor userId=.. -> 400', mon0.status === 400, mon0); continue; } // '..' is path-normalized by HTTP clients, so only the query/body forms apply
    const arch = await api('GET', `/api/arch/${q}/state`);
    check(`real GET /api/arch/${id}/state -> 400`, arch.status === 400, arch.status);
    const sess = await api('POST', `/api/arch/${q}/session/new`);
    check(`real POST /api/arch/${id}/session/new -> 400`, sess.status === 400, sess.status);
    if (id !== '..') {
      const ug = await api('GET', `/api/users/${q}`); check(`real GET /api/users/${id} -> 400`, ug.status === 400 && ug.json?.code === 'INVALID_CUSTOMER_ID', ug.status);
      const up = await api('PATCH', `/api/users/${q}`, { name: 'x' }); check(`real PATCH /api/users/${id} -> 400`, up.status === 400, up.status);
    }
    const mon = await api('GET', `/api/dev/monitor?userId=${q}`);
    check(`real GET dev monitor userId=${id} -> 400`, mon.status === 400, mon);
  }
  const sse = await fetch(`${BASE}/api/arch/a.b/events`);
  check('real SSE /api/arch/a.b/events -> 400, no stream', sse.status === 400 && !(sse.headers.get('content-type') || '').includes('event-stream'), sse.status);
  check('rejected calls left no state behind (every data file hash identical)', snapshot() === snap0);
  check('no a_b / a.b / alias files or index entries were created', fs.readdirSync(path.join(DIR, 'arch')).sort().join(',') === files0 && JSON.stringify((await api('GET', '/api/arch/customers')).json) === idx0 && !snapshot().includes('a_b'));
  check('te.st index entry still stored unchanged', (JSON.parse(fs.readFileSync(idxFile, 'utf-8')) as string[]).includes('te.st'));
  for (const id of ['lauri', 'eeva', 'alex']) {
    const st = await api('GET', `/api/state?userId=${id}`);
    const arch = await api('GET', `/api/arch/${id}/state`);
    check(`canonical ${id}: /api/state 200 and /api/arch state 200`, st.status === 200 && arch.status === 200, { s: st.status, a: arch.status });
  }
  const g = await api('POST', '/api/arch/lauri/goals', { title: 'D12 canonical goal', detail: 'still writes' });
  check('canonical lauri can still write (goal accepted, 2xx)', g.status >= 200 && g.status < 300, g);
  const hasLauriFiles = fs.readdirSync(path.join(DIR, 'arch')).some((f) => f.startsWith('lauri.'));
  check('canonical lauri files unchanged in name and present', hasLauriFiles);
} catch (e) { fail++; console.log('FAIL  test error', e instanceof Error ? e.message : e); console.error(log.slice(-1500)); }
finally { try { process.kill(-server.pid!, 'SIGTERM'); } catch { server.kill('SIGTERM'); } }
fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\ncustomer-id-server: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
