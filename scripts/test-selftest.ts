/**
 * Selftest seeding guard: the bundled demo dataset is loaded automatically ONLY into a
 * genuinely empty store. A store holding any customer - even one unrelated to the demo
 * data - is never written by the check: it refuses with an operator message instead, and
 * existing (edited) records stay untouched. Real child processes over temp stores with the
 * mock provider; no credentials, no live databases.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail)}`); }
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');
const urlOf = (p: string) => pathToFileURL(path.join(ROOT, p)).href;

function probe(dir: string, src: string, env: Record<string, string> = {}): { out: string; err: string; code: number } {
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(dir, 'probe.ts'), src);
  const r = spawnSync(TSX, [path.join(dir, 'probe.ts')], {
    cwd: ROOT,
    env: { ...process.env, SELFTEST_PAUSE_MS: '0', ...env },
    encoding: 'utf-8',
  });
  return { out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim(), code: r.status ?? 1 };
}

const PRELUDE = `
const { setProvider } = await import(${JSON.stringify(urlOf('src/server/llm.ts'))});
const { mockProvider } = await import(${JSON.stringify(urlOf('src/server/llmMock.ts'))});
setProvider(mockProvider);
`;

// 1-2. A non-empty store is never seeded: the check refuses, existing records survive.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selftest-guard-'));
  const r = probe(dir, PRELUDE + `
const U = await import(${JSON.stringify(urlOf('src/server/arch/store/userStore.ts'))});
U.saveProfile('jane', { name: 'Jane (edited locally)', marker: 'edited-jane-v1' });
let threw = '';
try {
  const { runSelfTest } = await import(${JSON.stringify(urlOf('src/server/selftest.ts'))});
  await runSelfTest();
} catch (e) { threw = (e as Error).message; }
const after = U.loadProfile('jane');
console.log('RESULT ' + JSON.stringify({ threw, marker: after && (after as Record<string, unknown>).marker }));
`, { CABINET_DATA_DIR: path.join(dir, 'data') });
  const res = JSON.parse((r.out.split('\n').find((l) => l.startsWith('RESULT ')) ?? 'RESULT {}').slice(7));
  check('selftest guard: a non-empty store without lauri is refused with an operator message', /load_data\.py/.test(res.threw ?? ''), res);
  check('selftest guard: the refused run left the existing edited record untouched', res.marker === 'edited-jane-v1', res);
  fs.rmSync(dir, { recursive: true, force: true });
}

// 3. A genuinely empty store is seeded and the check then runs clean (mock provider).
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selftest-guard-'));
  const r = probe(dir, PRELUDE + `
const { runSelfTest } = await import(${JSON.stringify(urlOf('src/server/selftest.ts'))});
const res = await runSelfTest();
console.log('RESULT ' + res.passed + '/' + res.total);
`, { CABINET_DATA_DIR: path.join(dir, 'data') });
  const line = r.out.split('\n').find((l) => l.startsWith('RESULT ')) ?? '';
  check('selftest guard: an empty store is seeded from the bundled dataset and passes (mock)', line === 'RESULT 13/13', { line, err: r.err.slice(-300) });
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
