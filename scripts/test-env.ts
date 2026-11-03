/**
 * .env loading order: an entry point must load .env BEFORE any module reads process.env at
 * import time (ESM evaluates imports before the importing module's body). These checks run
 * real child processes against temporary .env files - fake URLs only, no credentials, no
 * live databases - and pin the current precedence: real env vars beat .env, .env.local wins.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { execFileSync } from 'child_process';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail)}`); }
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');
const urlOf = (p: string) => pathToFileURL(path.join(ROOT, p)).href;

function probe(dir: string, src: string, env: Record<string, string> = {}): string {
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(dir, 'probe.ts'), src);
  return execFileSync(TSX, [path.join(dir, 'probe.ts')], {
    cwd: dir,
    env: { ...process.env, ...env },
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim().split('\n').pop()!.trim(); // dotenv prints injection tips to stdout; the probe's answer is its last line
}

const FAKE_URL = 'postgres://fake-user:fake-pass@localhost:5432/fake-db';

// A store is "configured" only if configureRemote saw the URL at import time.
const STORE_PROBE = `
await import(${JSON.stringify(urlOf('src/server/loadEnv.ts'))});
const { remoteConfigured } = await import(${JSON.stringify(urlOf('src/server/arch/store/common.ts'))});
await import(${JSON.stringify(urlOf('src/server/arch/store/userStore.ts'))});
console.log(remoteConfigured('user') ? 'configured' : 'missing');
`;

// 1. The app entry-point order bug: .env USER_DB_URL must reach userStore's import-time read.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
  fs.writeFileSync(path.join(dir, '.env'), `USER_DB_URL=${FAKE_URL}\n`);
  check('env: with loadEnv imported first, .env USER_DB_URL configures the user store at import time',
    probe(dir, STORE_PROBE) === 'configured');
  fs.rmSync(dir, { recursive: true, force: true });
}

// 2. Guard against a hardcoded regression: without .env the store stays unconfigured.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
  check('env: without .env the user store is NOT configured (no accidental default)', probe(dir, STORE_PROBE) === 'missing');
  fs.rmSync(dir, { recursive: true, force: true });
}

// 3. Precedence unchanged: a real environment variable beats .env.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
  fs.writeFileSync(path.join(dir, '.env'), `USER_DB_URL=${FAKE_URL}\n`);
  const out = probe(dir, `
await import(${JSON.stringify(urlOf('src/server/loadEnv.ts'))});
console.log(process.env.USER_DB_URL);
`, { USER_DB_URL: 'postgres://real-env@localhost:5432/real' });
  check('env: a real environment variable still beats .env (dotenv does not override)', out === 'postgres://real-env@localhost:5432/real', out);
  fs.rmSync(dir, { recursive: true, force: true });
}

// 4. Precedence unchanged: .env.local overrides .env (and the real env), as server.ts did.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
  fs.writeFileSync(path.join(dir, '.env'), `USER_DB_URL=${FAKE_URL}\n`);
  fs.writeFileSync(path.join(dir, '.env.local'), 'USER_DB_URL=postgres://local-file@localhost:5432/local\n');
  const out = probe(dir, `
await import(${JSON.stringify(urlOf('src/server/loadEnv.ts'))});
console.log(process.env.USER_DB_URL);
`, { USER_DB_URL: 'postgres://real-env@localhost:5432/real' });
  check('env: .env.local still wins over .env and the real environment (override: true kept)', out === 'postgres://local-file@localhost:5432/local', out);
  fs.rmSync(dir, { recursive: true, force: true });
}

// 5. Same class, related path: CABINET_DATA_DIR from .env must reach common.ts's import-time DATA_DIR.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
  const custom = path.join(dir, 'custom-data');
  fs.writeFileSync(path.join(dir, '.env'), `CABINET_DATA_DIR=${custom}\n`);
  const out = probe(dir, `
await import(${JSON.stringify(urlOf('src/server/loadEnv.ts'))});
const { DATA_DIR } = await import(${JSON.stringify(urlOf('src/server/arch/store/common.ts'))});
console.log(DATA_DIR);
`);
  check('env: CABINET_DATA_DIR in .env reaches the store DATA_DIR (same import-time class)', out === custom, out);
  fs.rmSync(dir, { recursive: true, force: true });
}

// 6. Both entry points keep loadEnv as their FIRST import (the whole point of the fix).
const firstImport = (f: string) => fs.readFileSync(f, 'utf-8').split('\n').find((l) => l.startsWith('import '));
check('env: server.ts loads ./src/server/loadEnv.js before every other import', firstImport('server.ts') === "import './src/server/loadEnv.js';", firstImport('server.ts'));
check('env: scripts/load_remote.ts loads ../src/server/loadEnv.js before every other import', firstImport('scripts/load_remote.ts') === "import '../src/server/loadEnv.js';", firstImport('scripts/load_remote.ts'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
