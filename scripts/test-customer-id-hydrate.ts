/** D12: hosted hydrate with a pool double (no hosted credentials, no network). Non-canonical hosted ids are skipped, never written locally, never written or deleted hosted. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-hyd-'));
const C = await import('../src/server/arch/store/common.js');
const R = await import('../src/server/arch/store/remote.js');
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d?: unknown) => { if (c) { pass++; console.log(`  PASS ${n}`); } else { fail++; console.log(`  FAIL ${n} ${d === undefined ? '' : JSON.stringify(d)}`); } };
const seen: string[] = [];
const row = (uid: string, id: string) => ({ user_id: uid, table_name: 'goals', id, data: { id, title: `t-${uid}`, detail: '', created_at: '2026-01-01T00:00:00.000Z', doc: null } });
R.setPoolFactoryForTests(() => ({
  query: async (text: string) => { seen.push(text.trim().split(/\s+/)[0].toUpperCase()); return { rows: /agent_user_records/.test(text) ? [row('lauri', 'g1'), row('a.b', 'g2'), row('a b', 'g3'), row('a_b', 'g4')] : [] }; },
  connect: async () => ({ query: async (text: string) => { seen.push('TX:' + text.trim().split(/\s+/)[0].toUpperCase()); return {}; }, release: () => {} }),
}));
C.configureRemote('user', 'postgres://double/none');
const origErr = console.error; const errs: string[] = []; console.error = (...a: unknown[]) => { errs.push(a.join(' ')); };
const res = await C.hydrateAgentStoresDetailed();
console.error = origErr;
const files = fs.readdirSync(C.ARCH_DIR).filter((f) => f !== 'customers.json').sort(); // customers.json = the registered index
check('hydrate completed (not failed) for the user store', res.hydrated.some((h) => h.startsWith('user')) && !res.failed.includes('user'), res);
check('canonical hosted ids hydrate locally (lauri, a_b)', files.includes('lauri.user.db') && files.includes('a_b.user.db'), files);
check('non-canonical hosted ids a.b and "a b" create NO local file', !files.some((f) => f.startsWith('a.b') || f.startsWith('a b')) && files.length === 2, files);
check('only canonical ids registered', C.listCustomers().sort().join() === 'a_b,lauri', C.listCustomers());
check('skip is reported', errs.filter((e) => e.includes('non-canonical')).length === 2, errs);
check('hosted store only read: no writes, no transaction, no delete', seen.every((s) => s === 'SELECT'), seen);
fs.rmSync(process.env.CABINET_DATA_DIR!, { recursive: true, force: true });
console.log(`customer-id-hydrate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
