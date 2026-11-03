/**
 * G59: id length is a STORAGE limit (255-byte file name minus the longest derived suffix), checked before any effect.
 * Longest id passes the whole file lifecycle (4 DBs + journals, context, legacy migrate/rename, index, real server, loader);
 * one char more is a typed CUSTOMER_ID_TOO_LONG 400 with no index entry, no file and no loader write.
 * Scope: this Linux file system, 255-byte names. Narrower full-path limits elsewhere are not covered.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-len-'));
process.env.CABINET_DATA_DIR = DIR;
const V = await import('../src/server/customerId.js');
const C = await import('../src/server/arch/store/common.js');
const ctx = await import('../src/server/arch/store/contextStore.js');
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d?: unknown) => { if (c) { pass++; console.log(`PASS  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d === undefined ? '' : JSON.stringify(d)}`); } };
const MAX = V.MAX_CUSTOMER_ID_LENGTH;
const ok = 'a'.repeat(MAX), long = 'a'.repeat(MAX + 1);
check('limit derives from the longest suffix (.nordea.json.migrated = 21): 234', MAX === 234 && V.STORAGE_SUFFIXES.some((s) => s === '.nordea.json.migrated') && MAX === 255 - Math.max(...V.STORAGE_SUFFIXES.map((s) => s.length)), MAX);
const tooLong = (f: () => unknown) => { try { f(); return false; } catch (e: any) { return e instanceof V.InvalidCustomerIdError && e.status === 400 && e.code === 'CUSTOMER_ID_TOO_LONG'; } };
const arch = () => (fs.existsSync(C.ARCH_DIR) ? fs.readdirSync(C.ARCH_DIR).sort().join(',') : '');

// 235: nothing at all happens
const before = arch();
check('235 rejected by rule and fileFor/register/delete/context with CUSTOMER_ID_TOO_LONG', !V.isCanonicalCustomerId(long) && tooLong(() => V.canonicalCustomerId(long)) && tooLong(() => C.fileFor(long, 'nordea')) && tooLong(() => C.registerCustomer(long)) && tooLong(() => C.deleteDbFile(long, 'user')) && tooLong(() => ctx.contextMdPath(long)));
check('235: no index entry and no file created', arch() === before && !C.listStoredIds().includes(long));
check('a non-canonical short id keeps the INVALID_CUSTOMER_ID code', (() => { try { V.canonicalCustomerId('a.b'); return false; } catch (e: any) { return e.code === 'INVALID_CUSTOMER_ID'; } })());

// 234: whole lifecycle on disk
let life = '';
try {
  C.registerCustomer(ok);
  for (const k of ['user', 'cm', 'nordea', 'bus'] as const) {
    const d = C.openDb(C.fileFor(ok, k), k); d.exec('BEGIN IMMEDIATE'); d.exec("INSERT INTO kv(k,v) VALUES('x','y') ON CONFLICT(k) DO NOTHING"); d.exec('COMMIT'); d.close();
    // legacy JSON -> migrated rename (longest derived name)
    const j = C.legacyFileFor(ok, k); fs.writeFileSync(j, '{}'); fs.renameSync(j, `${j}.migrated`);
  }
  fs.writeFileSync(ctx.contextMdPath(ok), 'x'); fs.writeFileSync(ctx.contextMdPath(ok).replace(/\.md$/, '.json'), '{}');
  life = 'ok';
} catch (e) { life = String(e); }
check('234: index + 4 DBs (journal txn) + legacy .migrated renames + context files all work', life === 'ok' && C.listCustomers().includes(ok), life);
check('234: every generated file name is <= 255 bytes', fs.readdirSync(C.ARCH_DIR).every((f) => Buffer.byteLength(f) <= 255) && fs.readdirSync(C.ARCH_DIR).some((f) => f === `${ok}.nordea.json.migrated`));
// legacy migration through the store's own code path
const ok2 = 'b'.repeat(MAX);
fs.writeFileSync(C.legacyFileFor(ok2, 'nordea'), JSON.stringify({ accounts: [] }));
let mig = 'ok'; try { C.migrateLegacy(ok2, 'nordea', () => { /* apply */ }); } catch (e) { mig = String(e); }
check('234: migrateLegacy renames <id>.nordea.json to .migrated', mig === 'ok' && fs.existsSync(`${C.legacyFileFor(ok2, 'nordea')}.migrated`) && !fs.existsSync(C.legacyFileFor(ok2, 'nordea')));

// real server + loader (separate seeded data dir)
const D2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-len2-'));
const PORT = 4800 + Math.floor(Math.random() * 400), BASE = `http://127.0.0.1:${PORT}`;
const seed = spawnSync(process.execPath, ['scripts/run_python.mjs', 'scripts/load_data.py', 'seed/demo', '--target', 'file', '--no-reload'], { env: { ...process.env, CABINET_DATA_DIR: D2 }, encoding: 'utf-8' });
if (seed.status !== 0) { console.error(seed.stdout, seed.stderr); process.exit(1); }
const server = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, CABINET_DATA_DIR: D2, LLM_PROVIDER: 'mock', PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let log = ''; server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
const api = async (m: string, p: string, body?: unknown) => { try { return await api0(m, p, body); } catch { return { status: 0, json: null as any }; } };
const api0 = async (m: string, p: string, body?: unknown) => { const r = await fetch(BASE + p, { method: m, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) }); return { status: r.status, json: await r.json().catch(() => null) as any }; };
const listing = () => fs.readdirSync(path.join(D2, 'arch')).sort().join(',') + '|' + fs.readFileSync(path.join(D2, 'arch', 'customers.json'), 'utf-8');
try {
  for (let i = 0; i < 130; i++) { try { if ((await fetch(`${BASE}/api/arch/customers`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 300)); }
  const l0 = listing();
  const probes: [string, string, unknown?][] = [['GET', `/api/arch/${long}/state`], ['POST', `/api/arch/${long}/goals`, { title: 't', detail: 'd' }], ['GET', `/api/state?userId=${long}`], ['POST', '/api/chat', { userId: long, text: 'hi' }], ['GET', `/api/users/${long}`], ['GET', `/api/dev/monitor?userId=${long}`], ['GET', `/api/arch/${long}/events`]];
  for (const [m, p, b] of probes) { const r = await api(m, p, b); check(`real ${m} ${p.replace(long, 'x*235').replace(/\?.*/, '')} -> 400 CUSTOMER_ID_TOO_LONG`, r.status === 400 && r.json?.code === 'CUSTOMER_ID_TOO_LONG', { s: r.status, j: r.json }); }
  check('235 over HTTP: no file, no index entry changed', listing() === l0);
  const a = await api('GET', `/api/arch/${ok}/state`);
  check('234 over HTTP: state 200 on the real server', a.status === 200, a.status);
  const g = await api('POST', `/api/arch/${ok}/goals`, { title: 'long id goal', detail: 'works' });
  check('234 over HTTP: write accepted, files <= 255 bytes', g.status >= 200 && g.status < 300 && fs.readdirSync(path.join(D2, 'arch')).every((f) => Buffer.byteLength(f) <= 255), g.status);
  check('server alive after the too-long requests', (await api('GET', '/api/arch/customers')).status === 200);
} catch (e) { fail++; console.log('FAIL  test error', e instanceof Error ? e.message : e); console.error(log.slice(-1000)); }
finally { try { process.kill(-server.pid!, 'SIGTERM'); } catch { server.kill('SIGTERM'); } }

// loader
const loadRows = (id: string) => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-ld2-')), src = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-src2-'));
  fs.writeFileSync(path.join(src, 'users.json'), JSON.stringify([{ id, name: 'X' }]));
  const r = spawnSync(process.execPath, ['scripts/run_python.mjs', 'scripts/load_data.py', src, '--target', 'file', '--no-reload'], { env: { ...process.env, CABINET_DATA_DIR: data }, encoding: 'utf-8' });
  const a = path.join(data, 'arch'); const files = fs.existsSync(a) ? fs.readdirSync(a) : [];
  fs.rmSync(data, { recursive: true, force: true }); fs.rmSync(src, { recursive: true, force: true });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), files };
};
const l235 = loadRows(long), l234 = loadRows(ok);
check('loader 235: non-zero, CUSTOMER_ID_TOO_LONG, nothing written', l235.status !== 0 && /CUSTOMER_ID_TOO_LONG/.test(l235.out) && l235.files.length === 0, { s: l235.status, f: l235.files });
check('loader 234: loads', l234.status === 0 && l234.files.includes(`${ok}.user.db`), { s: l234.status, o: l234.out.slice(-150) });
fs.rmSync(DIR, { recursive: true, force: true }); fs.rmSync(D2, { recursive: true, force: true });
console.log(`\ncustomer-id-length: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
