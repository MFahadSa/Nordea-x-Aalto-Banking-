/** D12: the Python loader (scripts/load_data.py) uses the same customer-id rule. A bad id exits non-zero and writes nothing. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
let passed = 0, failed = 0;
const check = (n, c, d) => { if (c) { passed++; console.log(`PASS  ${n}`); } else { failed++; console.log(`FAIL  ${n} ${d === undefined ? '' : JSON.stringify(d)}`); } };
const load = (rows) => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-ld-')), src = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-src-'));
  fs.writeFileSync(path.join(src, 'users.json'), JSON.stringify(rows));
  const r = spawnSync(process.execPath, ['scripts/run_python.mjs', 'scripts/load_data.py', src, '--target', 'file', '--no-reload'], { env: { ...process.env, CABINET_DATA_DIR: data }, encoding: 'utf-8' });
  const arch = path.join(data, 'arch');
  const files = fs.existsSync(arch) ? fs.readdirSync(arch).sort() : [];
  fs.rmSync(data, { recursive: true, force: true }); fs.rmSync(src, { recursive: true, force: true });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), files };
};
for (const id of ['a.b', 'Lauri', 'a b', 'a/b']) {
  const r = load([{ id, name: 'X' }]);
  check(`loader rejects ${JSON.stringify(id)}: non-zero exit, message, no files`, r.status !== 0 && /Unsupported customer id/.test(r.out) && r.files.length === 0, { s: r.status, f: r.files });
}
const mixed = load([{ id: 'lauri', name: 'L' }, { id: 'a.b', name: 'X' }]);
check('a bad id anywhere in the file stops the load before ANY write (no half-loaded dataset)', mixed.status !== 0 && mixed.files.length === 0, { s: mixed.status, f: mixed.files });
const ok = load([{ id: 'lauri', name: 'L' }, { id: 'a_b', name: 'X' }]);
check('canonical ids load as before', ok.status === 0 && ok.files.includes('lauri.user.db') && ok.files.includes('a_b.user.db'), { s: ok.status, o: ok.out.slice(-200), f: ok.files });
check('no alias file was made for a.b (a_b exists only because a_b was loaded)', !load([{ id: 'a.b', name: 'X' }]).files.includes('a_b.user.db'));
console.log(`\nloader-ids: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
