/**
 * Behavioral tests for the G6 hosted sync (hydrate / flush / failures / isolation / role
 * permissions) against an isolated in-memory Postgres double - no live database, no
 * service, no cost. The double speaks exactly the SQL shapes remote.ts issues and enforces
 * the one-role-per-agent table grants the way supabase/three-agents.sql declares them.
 * The real pg wire protocol and RLS remain to be smoke-tested against a live Supabase.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

import type { PoolLike } from '../src/server/arch/store/remote.js';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-test-'));
process.env.CABINET_DATA_DIR = DIR;

const { configureRemote, hydrateAgentStores, drainRemoteFlushes } = await import('../src/server/arch/store/common.js');
const R = await import('../src/server/arch/store/remote.js');
const S = await import('../src/server/arch/store/index.js');

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail)}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- The in-memory Postgres double ----------
type Row = { user_id: string; table_name: string; id: string; data: Record<string, unknown> };

class FakePg {
  tables = new Map<string, Row[]>(); // table -> rows
  pushes: { table: string; uid: string; rows: number }[] = [];
  failAll = false;

  /** One role per agent, as three-agents.sql grants it: agent_<x> may touch agent_<x>_records only. */
  private permit(url: string, table: string) {
    const role = new URL(url).username;
    if (table === 'nordea_feed' && role === 'agent_nordea') return; // G28 grant
    if (table !== `agent_${role.replace('agent_', '')}_records`) throw new Error(`permission denied for table ${table}`);
  }
  feedRows: { id: number; user_id: string; data: Record<string, unknown>; note: string | null; created_at: string; applied_at: string | null; result: string | null }[] = [];

  private run(url: string, text: string, params: unknown[] = []): { rows: unknown[] } {
    if (this.failAll) throw new Error('connection refused (fake outage)');
    if (text.startsWith('SELECT id, user_id, data, note, created_at FROM nordea_feed')) {
      this.permit(url, 'nordea_feed');
      return { rows: this.feedRows.filter((r) => r.applied_at === null).sort((a, b) => a.id - b.id).slice(0, 20) };
    }
    if (text === 'UPDATE nordea_feed SET applied_at = now(), result = $1 WHERE id = $2') {
      this.permit(url, 'nordea_feed');
      const row = this.feedRows.find((r) => r.id === Number(params[1]));
      if (row) { row.result = String(params[0]); row.applied_at = new Date().toISOString(); }
      return { rows: [] };
    }
    let m = text.match(/^SELECT user_id, table_name, id, data FROM (\w+)$/);
    if (m) { this.permit(url, m[1]); return { rows: [...(this.tables.get(m[1]) ?? [])] }; }
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [] };
    m = text.match(/^SELECT 1 FROM (\w+) WHERE user_id = \$1 LIMIT 1$/);
    if (m) { this.permit(url, m[1]); return { rows: (this.tables.get(m[1]) ?? []).filter((r) => r.user_id === params[0]).slice(0, 1).map(() => ({ '?column?': 1 })) }; }
    m = text.match(/^DELETE FROM (\w+) WHERE user_id = \$1$/);
    if (m) { this.permit(url, m[1]); this.tables.set(m[1], (this.tables.get(m[1]) ?? []).filter((r) => r.user_id !== params[0])); return { rows: [] }; }
    m = text.match(/^INSERT INTO (\w+) \(user_id, table_name, id, data\) VALUES \(\$1, \$2, \$3, \$4\)$/);
    if (m) {
      this.permit(url, m[1]);
      const rows = this.tables.get(m[1]) ?? [];
      rows.push({ user_id: String(params[0]), table_name: String(params[1]), id: String(params[2]), data: JSON.parse(String(params[3])) });
      this.tables.set(m[1], rows);
      return { rows: [] };
    }
    throw new Error(`fake pg: unsupported SQL: ${text}`);
  }
  pool(url: string): PoolLike {
    const self = this;
    return {
      query: (text: string, params?: unknown[]) => Promise.resolve(self.run(url, text, params)),
      connect: () => Promise.resolve({
        query: (text: string, params?: unknown[]) => Promise.resolve(self.run(url, text, params)),
        release: () => undefined,
      }),
    };
  }
}

const fake = new FakePg();
R.setPoolFactoryForTests((url) => fake.pool(url));

const URLS = { user: 'postgres://agent_user:pw@fake/db', cm: 'postgres://agent_cm:pw@fake/db', nordea: 'postgres://agent_nordea:pw@fake/db' };
configureRemote('user', URLS.user);
configureRemote('cm', URLS.cm);
configureRemote('nordea', URLS.nordea);

// ---------- Seed the "hosted tables" ----------
fake.tables.set('agent_user_records', [
  { user_id: 'lauri', table_name: 'kv', id: 'profile', data: { k: 'profile', v: JSON.stringify({ name: 'Lauri', age: 31 }) } },
  { user_id: 'lauri', table_name: 'goals', id: 'g1', data: { id: 'g1', title: 'Remote car', detail: 'hosted goal', created_at: '2026-10-01', doc: null } },
  { user_id: 'eeva', table_name: 'goals', id: 'ge1', data: { id: 'ge1', title: 'Eeva remote goal', detail: 'hosted', created_at: '2026-10-01', doc: null } },
]);
fake.tables.set('agent_nordea_records', [
  { user_id: 'lauri', table_name: 'transactions', id: 't1', data: { id: 't1', date: '2026-10-05', category: 'transport', amount: -50, account: 'current', description: 'Hosted fuel', json: JSON.stringify({ id: 't1', userId: 'lauri', date: '2026-10-05', category: 'transport', amount: -50, account: 'current', description: 'Hosted fuel' }) } },
]);

// A stale local row that the hosted table does not have: hydrate must replace, not merge.
S.putGoal('lauri', { id: 'g-local-only', title: 'Stale local goal', detail: 'not hosted', createdAt: '2026-09-01' });

// ---------- Hydrate ----------
const hydrated = await hydrateAgentStores();
check('hydrate reports the stores it pulled', hydrated.some((h) => h.startsWith('user')) && hydrated.some((h) => h.startsWith('nordea')), hydrated);
check('hydrate wrote the hosted goal into the local User DB', S.loadUserDb('lauri').goals.some((g) => g.id === 'g1' && g.title === 'Remote car'));
check('hydrate replaced the stale local row (hosted tables are the source of truth)', !S.loadUserDb('lauri').goals.some((g) => g.id === 'g-local-only'));
check('hydrate wrote the hosted transaction into the local Nordea DB', S.loadNordeaDb('lauri')!.transactions.some((t) => t.id === 't1' && t.description === 'Hosted fuel'));
check('hydrate registered hydrated customers in the index', S.listCustomers().includes('lauri') && S.listCustomers().includes('eeva'));

// ---------- Flush on write ----------
S.putGoal('lauri', { id: 'g2', title: 'Flushed goal', detail: 'written locally, must land hosted', createdAt: '2026-11-01' });
let flushed = false;
for (let i = 0; i < 40 && !flushed; i++) {
  await sleep(100);
  flushed = (fake.tables.get('agent_user_records') ?? []).some((r) => r.user_id === 'lauri' && r.id === 'g2');
}
check('a local write flushes to the store\'s hosted table (debounced)', flushed);
check('flush replaced only that customer\'s rows: eeva\'s hosted rows are untouched',
  (fake.tables.get('agent_user_records') ?? []).some((r) => r.user_id === 'eeva' && r.id === 'ge1'));
check('flush kept lauri\'s other hosted rows (profile, g1 still there)',
  ['profile', 'g1', 'g2'].every((id) => (fake.tables.get('agent_user_records') ?? []).some((r) => r.user_id === 'lauri' && r.id === id)));

// ---------- F-C: a graceful-shutdown drain fires pending debounced flushes at once ----------
S.putGoal('lauri', { id: 'g4', title: 'Drain test goal', detail: 'no 250 ms wait before exit', createdAt: '2026-11-02' });
await drainRemoteFlushes();
check('F-C: drainRemoteFlushes pushes a pending debounced write immediately (shutdown-safe)',
  (fake.tables.get('agent_user_records') ?? []).some((r) => r.user_id === 'lauri' && r.id === 'g4'));

// ---------- Read-only opens do not flush ----------
const pushesBefore = (fake.tables.get('agent_nordea_records') ?? []).length;
S.loadNordeaDb('lauri');
S.loadUserDb('lauri');
await sleep(400);
check('read-only opens never flush (no rewrite of hosted rows)',
  (fake.tables.get('agent_nordea_records') ?? []).length === pushesBefore);

// ---------- Failure handling ----------
fake.failAll = true;
S.putGoal('lauri', { id: 'g3', title: 'Written during outage', detail: 'local only until the remote recovers', createdAt: '2026-11-01' });
await sleep(400);
check('a flush failure keeps the app working locally (no throw, local row readable)',
  S.loadUserDb('lauri').goals.some((g) => g.id === 'g3'));
const hydratedDuringOutage = await hydrateAgentStores();
check('a hydrate failure is reported as nothing hydrated, not a crash', hydratedDuringOutage.length === 0, hydratedDuringOutage);
fake.failAll = false;

// ---------- Role permissions (one role per agent, enforced) ----------
fake.tables.set('agent_cm_records', [
  { user_id: 'lauri', table_name: 'entries', id: 'e1', data: { id: 'e1', title: 'CM entry', detail: 'x', goal_ids: '[]', proposed_by: 'user', via_message_id: null, evidence: null, status: 'active', dispute_reason: null, created_at: '2026-10-01', observed: null, risk: null, auto_accepted: null, doc: null } },
]);
// Misconfiguration: the CM store pointed at the USER role's secret must be denied by the grant model.
configureRemote('cm', URLS.user);
const wrongRole = await hydrateAgentStores();
check('a store using another agent\'s secret is denied by the role grants (cm skipped, error caught)',
  !wrongRole.some((h) => h.startsWith('cm')) && !S.loadCmDb('lauri').entries.some((e) => e.id === 'e1'), wrongRole);
configureRemote('cm', URLS.cm);
const rightRole = await hydrateAgentStores();
check('with its own secret the CM store hydrates its table',
  rightRole.some((h) => h.startsWith('cm')) && S.loadCmDb('lauri').entries.some((e) => e.id === 'e1'), rightRole);

// ---------- G20 merge: the loader's hydrate -> write -> push keeps hosted rows ----------
// Mirrors scripts/load_data.py's Hosted path: hydrate (already done above), write straight into
// the local SQLite like the Python loader does (no openDb, no auto-flush), then the push
// load_remote.ts performs. The pre-existing hosted row for the same uid must survive.
{
  const { rowsOf, fileFor } = await import('../src/server/arch/store/common.js');
  const { DatabaseSync } = await import('node:sqlite');
  const before = (fake.tables.get('agent_user_records') ?? []).filter((r) => r.user_id === 'eeva').map((r) => r.id);
  const db = new DatabaseSync(fileFor('eeva', 'user'));
  db.exec(`CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL, doc TEXT)`);
  db.prepare("INSERT INTO goals (id, title, detail, created_at) VALUES ('g-load', 'Loaded goal', 'from load_data.py', '2026-11-01')").run();
  db.close();
  const rows = rowsOf(fileFor('eeva', 'user'), 'user').map((r) => ({ user_id: 'eeva', ...r }));
  await R.pushCustomer('user', URLS.user, 'eeva', rows);
  const after = (fake.tables.get('agent_user_records') ?? []).filter((r) => r.user_id === 'eeva').map((r) => r.id);
  check('G20 merge: the pre-existing hosted row for the same uid survives a load',
    before.every((id) => after.includes(id)), { before, after });
  check('G20 merge: the loaded record lands hosted too', after.includes('g-load'), after);
}

// --- G20 reopen pins: a failed pull must stop the loader; an old-schema file must hydrate. ---
{
  const { hydrateAgentStoresDetailed } = await import('../src/server/arch/store/common.js');

  // (a) failing pull: hydrate reports the failed store and leaves the hosted rows untouched.
  fake.failAll = true;
  const hostedBefore = JSON.stringify(fake.tables.get('agent_user_records') ?? []);
  const res = await hydrateAgentStoresDetailed();
  fake.failAll = false;
  check('G20: a failed pull is reported as failed (not swallowed)', res.failed.includes('user'), res);
  check('G20: a failed pull leaves hosted rows untouched',
    JSON.stringify(fake.tables.get('agent_user_records') ?? []) === hostedBefore);

  // (b) the loader itself stops: a hydrate against an unreachable remote exits non-zero.
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync('npx', ['tsx', 'scripts/load_remote.ts', 'hydrate'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CABINET_DATA_DIR: path.join(DIR, 'subproc'),
      AGENT_USER_DB_URL: 'postgres://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
    },
    timeout: 60000,
  });
  check('G20: the data loader exits non-zero when the pull fails', run.status === 1,
    { status: run.status, stderr: String(run.stderr).slice(-300) });

  // (c) old-schema local file (no doc column on goals) hydrates without an INSERT failure.
  const { DatabaseSync } = await import('node:sqlite');
  const { fileFor: ff, rowsOf: ro } = await import('../src/server/arch/store/common.js');
  const oldFile = ff('oldsch', 'user');
  const odb = new DatabaseSync(oldFile);
  odb.exec('CREATE TABLE goals (id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)');
  odb.close();
  fake.tables.set('agent_user_records', [{
    user_id: 'oldsch', id: 'g1', table_name: 'goals',
    data: { id: 'g1', title: 'Hosted goal', detail: 'remote only', created_at: '2026-11-01', doc: null },
  }]);
  const res2 = await hydrateAgentStoresDetailed();
  const merged = ro(ff('oldsch', 'user'), 'user').filter((r) => r.table_name === 'goals').map((r) => r.data.id);
  check('G20: an old-schema local file hydrates the hosted rows', res2.failed.length === 0 && merged.includes('g1'),
    { failed: res2.failed, merged });
}

// --- G24: a customer with no local cm.db pushes 0 rows without creating the file or crashing. ---
{
  const { rowsOf: ro2, fileFor: ff2 } = await import('../src/server/arch/store/common.js');
  const fs2 = await import('node:fs');
  fake.tables.set('agent_cm_records', [{
    user_id: 'nocm', id: 'c1', table_name: 'entries',
    data: { id: 'c1', title: 'Old hosted entry', detail: '', goal_ids: '[]', proposed_by: 'user', status: 'active', created_at: '2026-11-01' },
  }]);
  const missing = ff2('nocm', 'cm');
  const rows = ro2(missing, 'cm'); // must not throw and must not create the file
  check('G24: rowsOf on a missing file returns 0 rows and creates nothing', rows.length === 0 && !fs2.existsSync(missing));

  // Safety guard (owner review): a MISSING local file must never replace existing hosted rows.
  let refused = false;
  try { await R.assertReplaceSafe('cm', URLS.cm, 'nocm', false); } catch { refused = true; }
  const hostedKept = (fake.tables.get('agent_cm_records') ?? []).some((r) => r.user_id === 'nocm');
  check('G24: missing local file + existing hosted rows => push refused, hosted rows survive', refused && hostedKept);
  // Same missing file once hosted is empty (post-hydrate truth): the replace is safe and proceeds.
  fake.tables.set('agent_cm_records', []);
  let allowed = true;
  try { await R.assertReplaceSafe('cm', URLS.cm, 'nocm', false); } catch { allowed = false; }
  check('G24: missing local file + empty hosted table => push allowed (0 rows replace nothing)', allowed);
  await R.pushCustomer('cm', URLS.cm, 'nocm', rows.map((r) => ({ user_id: 'nocm', ...r })));
  check('G24: the push created no local file', !fs2.existsSync(missing));
  // An EXISTING local file with 0 rows is a real wipe and still syncs (replace semantics kept).
  let wipeAllowed = true;
  try { await R.assertReplaceSafe('cm', URLS.cm, 'nocm', true); } catch { wipeAllowed = false; }
  check('G24: an existing (empty) local file stays authoritative - replace allowed', wipeAllowed);
}

// --- G25: deleting a customer's database also clears that uid's hosted rows. ---
{
  const { deleteDbFile, clearRemoteCustomer, fileFor: ff3 } = await import('../src/server/arch/store/common.js');
  await R.pushCustomer('cm', URLS.cm, 'delme', [{
    user_id: 'delme', id: 'e1', table_name: 'entries',
    data: { id: 'e1', title: 'Hosted entry', detail: '', goal_ids: '[]', proposed_by: 'user', status: 'active', created_at: '2026-11-01' },
  }]);
  // the explicit helper clears the hosted rows for that uid only
  await clearRemoteCustomer('cm', 'delme');
  const afterClear = fake.tables.get('agent_cm_records') ?? [];
  check('G25: clearRemoteCustomer removes that uid\'s hosted rows', afterClear.every((r) => r.user_id !== 'delme'), afterClear);
  // the delete path (local file unlink) triggers the hosted clear too
  await R.pushCustomer('cm', URLS.cm, 'delme', [{
    user_id: 'delme', id: 'e2', table_name: 'entries',
    data: { id: 'e2', title: 'Back again', detail: '', goal_ids: '[]', proposed_by: 'user', status: 'active', created_at: '2026-11-01' },
  }]);
  fs.writeFileSync(ff3('delme', 'cm'), ''); // local file exists so the unlink path runs
  deleteDbFile('delme', 'cm');
  await sleep(200); // the hosted clear is fire-and-forget like the write flush
  const afterDelete = fake.tables.get('agent_cm_records') ?? [];
  check('G25: deleteDbFile also clears the hosted rows (no hydrate resurrection)',
    !fs.existsSync(ff3('delme', 'cm')) && afterDelete.every((r) => r.user_id !== 'delme'), afterDelete);
}

// --- G25: a failed hosted clear is surfaced (never reported as success) and safely retryable. ---
{
  const { deleteDbFile: ddf, hostedClearOutcome, clearRemoteCustomer: crc } = await import('../src/server/arch/store/common.js');
  await R.pushCustomer('user', URLS.user, 'flaky', [{
    user_id: 'flaky', id: 'g1', table_name: 'goals',
    data: { id: 'g1', title: 'Keep me', detail: '', created_at: '2026-11-01', doc: null },
  }]);
  fake.failAll = true;
  ddf('flaky', 'user');
  const out1 = await hostedClearOutcome('flaky', 'user');
  const survived = (fake.tables.get('agent_user_records') ?? []).some((r) => r.user_id === 'flaky');
  check('G25: a failed hosted clear is reported as failed (and the hosted rows survive)',
    typeof out1 === 'object' && 'failed' in out1 && survived, out1);
  fake.failAll = false;
  await crc('user', 'flaky'); // the safe retry
  const out2 = await hostedClearOutcome('flaky', 'user');
  const gone = (fake.tables.get('agent_user_records') ?? []).every((r) => r.user_id !== 'flaky');
  check('G25: the retry clears the hosted rows', gone, out2);
  check('G25: local-only stores report local-only', (await hostedClearOutcome('nobody', 'bus')) === 'local-only');
}

// --- G24 reopen: an existing EMPTY (0-byte) or table-less local file reads as 0 rows, never crashes. ---
{
  const { rowsOf: ro3, fileFor: ff4 } = await import('../src/server/arch/store/common.js');
  fs.writeFileSync(ff4('zerobyte', 'cm'), ''); // what the crashed pre-fix run left behind
  let rows: unknown[] | null = null;
  try { rows = ro3(ff4('zerobyte', 'cm'), 'cm'); } catch { rows = null; }
  check('G24: a 0-byte local file reads as 0 rows (no such table crash gone)', rows !== null && rows.length === 0, rows);
  // an old file with only SOME tables reads the rest as 0 rows
  const { DatabaseSync: DS2 } = await import('node:sqlite');
  const partial = new DS2(ff4('partial', 'user'));
  partial.exec("CREATE TABLE goals (id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL, doc TEXT)");
  partial.prepare("INSERT INTO goals VALUES ('g9','T','D','2026-11-01',NULL)").run();
  partial.close();
  const prows = ro3(ff4('partial', 'user'), 'user');
  check('G24: a partial old file reads existing tables, absent ones as 0 rows',
    prows.length === 1 && prows[0].table_name === 'goals', prows.map((r) => r.table_name));
}

// ---------- G28: the feed runs through the Nordea agent's OWN role (no service key) ----------
{
  const OS = await import('../src/server/store.js');
  process.env.NORDEA_DB_URL = URLS.nordea;
  check('G28: feedConfigured with only NORDEA_DB_URL (no service key)', OS.feedConfigured() === true && !OS.supabaseConfigured());
  fake.feedRows = [
    { id: 1, user_id: 'alex', data: { bank: 'NORDEA', transactions: [] }, note: 'n', created_at: 't', applied_at: null, result: null },
  ];
  const pending = await OS.feedPending();
  check('G28: feed pending read through agent_nordea role', pending.length === 1 && pending[0].id === 1 && pending[0].user_id === 'alex');
  await OS.feedDone(1, 'applied');
  check('G28: feed row marked applied through agent_nordea role', fake.feedRows[0].applied_at !== null && fake.feedRows[0].result === 'applied');
  let denied = false;
  try {
    await R.queryRemote(URLS.user, 'SELECT id, user_id, data, note, created_at FROM nordea_feed WHERE applied_at IS NULL ORDER BY id LIMIT 20');
  } catch { denied = true; }
  check('G28: agent_user role cannot touch nordea_feed (one role per agent)', denied);
  delete process.env.NORDEA_DB_URL;
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.error('REMOTE TESTS FAILED'); process.exit(1); }
console.log('All checks passed');
