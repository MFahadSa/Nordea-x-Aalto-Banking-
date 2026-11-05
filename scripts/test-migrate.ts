/** Legacy migration tests: verified move into the three agent DBs, fail-closed paths, idempotency. */
import fs from 'fs';
import os from 'os';
import path from 'path';

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail}`); }
};

const fixture = () => ({
  users: {
    lauri: {
      id: 'lauri', persona: 'builder', name: 'Lauri', age: 34, roleDescription: 'Dev',
      viewMode: 'simple', layoutPrefs: { widgetsOrder: ['a'], hiddenWidgets: [] },
      offersOff: true, nordeaData: { from: 'seed', at: '2026-01-01', transactions: 2, balances: true },
      extraMonthly: 50,
      accounts: { current: { iban: 'FI1', balance: 100 }, savings: { iban: 'FI2', balance: 200, monthlyDeposit: 10 } },
      points: 42, pointsSpent: 5, redeemed: [{ rewardId: 'r1', title: 'Coffee', pts: 5, at: '2026-01-02' }],
    },
  },
  cabinetEntries: [
    { id: 'e-goal', userId: 'lauri', type: 'goal', title: 'Japan trip', detail: 'Save 2000', source: 'customer',
      status: 'active', private: true, readableBy: { abel: true, offers: false },
      provenance: { channel: 'app' }, goalType: 'travel', reviewed: true,
      createdAt: '2026-01-03', updatedAt: '2026-01-03', confirmedAt: '2026-01-04' },
    { id: 'e-fact', userId: 'lauri', type: 'fact', title: 'Rent', detail: '900/mo', source: 'nordea',
      status: 'disputed', private: false, readableBy: { abel: true, offers: true },
      provenance: { channel: 'system' }, evidence: { transactionIds: ['t1'], inputsHash: 'h1', computedAt: '2026-01-05' },
      reviewed: false, createdAt: '2026-01-05', updatedAt: '2026-01-06' },
  ],
  entryHistory: [{ id: 'ev-1', entryId: 'e-goal', userId: 'lauri', at: '2026-01-03', action: 'added', by: 'you', how: 'In the app', title: 'Japan trip' }],
  transactions: [
    { id: 't1', userId: 'lauri', date: '2026-01-05', category: 'rent', amount: -900, account: 'current', description: 'Rent' },
    { id: 't2', userId: 'lauri', date: '2026-01-06', category: 'food', amount: -20, account: 'current' },
  ],
  messages: [
    { id: 'm1', userId: 'lauri', agentId: 'abel', channel: 'app', sender: 'user', text: 'hi', createdAt: '2026-01-07T10:00:00Z' },
    { id: 'm2', userId: 'lauri', agentId: 'abel', channel: 'app', sender: 'agent', text: 'hello', conversationId: 'c1', createdAt: '2026-01-07T10:01:00Z' },
  ],
  accessLog: [{ id: 'a1', timestamp: '2026-01-07T10:01:00Z', userId: 'lauri', agentId: 'cm', agentName: 'CM', purpose: 'context', itemsReadCount: 1, blockedCount: 0, allowedItems: ['e-goal'], blockedReasons: [] }],
  topicLog: [{ id: 'tl1', timestamp: '2026-01-07T10:00:00Z', userId: 'lauri', topic: 'travel', couldHelp: true }],
  undoRecords: [{ undoToken: 'u1', timestamp: '2026-01-08', userId: 'lauri', action: 'delete', description: 'x' }],
  conversations: [{ id: 'c1', userId: 'lauri', helperId: 'abel', createdAt: '2026-01-07', updatedAt: '2026-01-07', offered: [] }],
  earnings: [{ id: 'n1', userId: 'lauri', partnerId: 'p1', partnerName: 'Shop', what: 'buy', fee: 1, back: 0.5, createdAt: '2026-01-09' }],
  shares: [{ id: 's1', userId: 'lauri', agentId: 'offers', items: ['e-fact'], createdAt: '2026-01-09', until: '2026-02-09' }],
  documents: [{ id: 'd1', userId: 'lauri', name: 'lease.pdf', kind: 'pdf', size: 10, keptAt: '2026-01-10' }],
  dataRewards: [{ id: 'dr1', userId: 'lauri', kind: 'shared', points: 3, entryIds: ['e-fact'], what: 'shared note', at: '2026-01-09' }],
  balanceSnapshots: [{ id: 'bs1', userId: 'lauri', accountKey: 'current', at: '2026-01-05', balance: 100 }],
  importBatches: [{ id: 'ib1', userId: 'lauri', at: '2026-01-05', source: 'csv', count: 2 }],
  bankAccounts: [{ id: 'acc-lauri-carFund', userId: 'lauri', key: 'carFund', iban: 'FI3' }],
  rewards: { lauri: { points: 42, pointsSpent: 5, redeemed: [{ rewardId: 'r1', title: 'Coffee', pts: 5, at: '2026-01-02' }] } },
});

// Modules share one process cache keyed by specifier; the ?case= trick does not bust tsx's cache
// for RELATIVE imports inside the modules, so each case runs in its own child process instead.
import { execFileSync } from 'child_process';

function runCase(name: string, setup: object | null, extraEnv: Record<string, string> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `migrate-${name}-`));
  if (setup) fs.writeFileSync(path.join(dir, 'cabinet-db.json'), JSON.stringify(setup));
  const runner = `
    process.env.CABINET_DATA_DIR = ${JSON.stringify(dir)};
    import(${JSON.stringify(path.resolve('src/server/arch/legacyMigrate.ts'))}).then((m) => {
      console.log(JSON.stringify(m.runLegacyMigration()));
    });
  `;
  const out = execFileSync('npx', ['tsx', '--eval', runner], { encoding: 'utf-8', env: { ...process.env, ...extraEnv } });
  return { dir, result: JSON.parse(out.trim().split('\n').pop()!) };
}

console.log('test-migrate: legacy cabinet-db.json -> three agent databases');

// Case 1: full migration verifies and deletes
{
  const { dir, result } = runCase('full', fixture());
  check('full: migration ok', result.ok === true, JSON.stringify(result.failures));
  check('full: legacy file deleted', result.deleted === true && !fs.existsSync(path.join(dir, 'cabinet-db.json')));
  const userDb = path.join(dir, 'arch', 'lauri.user.db');
  const cmDb = path.join(dir, 'arch', 'lauri.cm.db');
  const nordeaDb = path.join(dir, 'arch', 'lauri.nordea.db');
  check('full: three agent databases exist', fs.existsSync(userDb) && fs.existsSync(cmDb) && fs.existsSync(nordeaDb));
  const { DatabaseSync } = await import('node:sqlite');
  const u = new DatabaseSync(userDb);
  const goal = u.prepare('SELECT doc FROM goals WHERE id = ?').get('e-goal') as { doc: string };
  const doc = JSON.parse(goal.doc);
  check('full: goal doc preserves consent (private/readableBy)', doc.private === true && doc.readableBy.offers === false);
  check('full: goal doc preserves provenance + confirmation', doc.provenance?.channel === 'app' && doc.confirmedAt === '2026-01-04');
  const msgs = u.prepare('SELECT COUNT(*) c FROM app_messages').get() as { c: number };
  check('full: chat messages in user.db', msgs.c === 2);
  const convs = u.prepare('SELECT COUNT(*) c FROM app_conversations').get() as { c: number };
  check('full: conversations in user.db', convs.c === 1);
  u.close();
  const c = new DatabaseSync(cmDb);
  const entry = c.prepare('SELECT status, doc FROM entries WHERE id = ?').get('e-fact') as { status: string; doc: string };
  check('full: entry status + evidence preserved', entry.status === 'disputed' && JSON.parse(entry.doc).evidence.inputsHash === 'h1');
  const alog = c.prepare('SELECT COUNT(*) c FROM app_access_log').get() as { c: number };
  check('full: access log in cm.db', alog.c === 1);
  const ledgerRows = c.prepare('SELECT COUNT(*) c FROM app_migration_ledger').get() as { c: number };
  check('full: migration ledger recorded', ledgerRows.c >= 15);
  c.close();
  const n = new DatabaseSync(nordeaDb);
  const txc = n.prepare('SELECT COUNT(*) c FROM transactions').get() as { c: number };
  check('full: transactions in nordea.db', txc.c === 2);
  const rw = n.prepare('SELECT json FROM app_rewards WHERE user_id = ?').get('lauri') as { json: string };
  check('full: rewards points in nordea.db', JSON.parse(rw.json).points === 42 && JSON.parse(rw.json).redeemed.length === 1);
  const earn = n.prepare('SELECT COUNT(*) c FROM app_earnings').get() as { c: number };
  check('full: earnings in nordea.db', earn.c === 1);
  n.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

// Case 2: rerun after success is a no-op
{
  const { dir, result } = runCase('rerun', null);
  check('rerun: missing file reports already done', result.ok === true && result.alreadyDone === true);
  fs.rmSync(dir, { recursive: true, force: true });
}

// Case 3: unhandled User field fails closed - nothing written, file kept
{
  const bad = fixture();
  (bad.users.lauri as Record<string, unknown>).nickname = 'L';
  const { dir, result } = runCase('unknown-field', bad);
  check('unknown-field: refuses', result.ok === false, 'expected failure');
  check('unknown-field: names the field', result.failures.some((f: string) => f.includes('users.lauri.nickname')));
  check('unknown-field: file kept', fs.existsSync(path.join(dir, 'cabinet-db.json')));
  check('unknown-field: no agent db written', !fs.existsSync(path.join(dir, 'arch', 'lauri.user.db')));
  fs.rmSync(dir, { recursive: true, force: true });
}

// Case 4: unknown top-level field fails closed
{
  const bad = fixture() as Record<string, unknown>;
  bad.settings = { theme: 'dark' };
  const { dir, result } = runCase('unknown-top', bad);
  check('unknown-top: refuses and names it', result.ok === false && result.failures.some((f: string) => f.includes('"settings"')));
  check('unknown-top: file kept', fs.existsSync(path.join(dir, 'cabinet-db.json')));
  fs.rmSync(dir, { recursive: true, force: true });
}

// Case 5: conflict with existing destination content fails closed, no silent overwrite
{
  const { dir } = runCase('conflict-seed', fixture());
  const changed = fixture();
  changed.cabinetEntries[0].detail = 'DIFFERENT';
  const runner = `
    process.env.CABINET_DATA_DIR = ${JSON.stringify(dir)};
    import(${JSON.stringify(path.resolve('src/server/arch/legacyMigrate.ts'))}).then((m) => {
      console.log(JSON.stringify(m.runLegacyMigration()));
    });
  `;
  fs.writeFileSync(path.join(dir, 'cabinet-db.json'), JSON.stringify(changed));
  const out = execFileSync('npx', ['tsx', '--eval', runner], { encoding: 'utf-8' });
  const result = JSON.parse(out.trim().split('\n').pop()!);
  check('conflict: refuses', result.ok === false, 'expected failure');
  check('conflict: names the record', result.failures.some((f: string) => f.includes('e-goal')));
  check('conflict: file kept', fs.existsSync(path.join(dir, 'cabinet-db.json')));
  const { DatabaseSync } = await import('node:sqlite');
  const u = new DatabaseSync(path.join(dir, 'arch', 'lauri.user.db'));
  const goal = u.prepare('SELECT detail FROM goals WHERE id = ?').get('e-goal') as { detail: string };
  u.close();
  check('conflict: destination row untouched', goal.detail === 'Save 2000');
  fs.rmSync(dir, { recursive: true, force: true });
}

// Case 6: a long access log migrates VERBATIM (no retention trim during migration)
{
  const big = fixture();
  big.accessLog = Array.from({ length: 230 }, (_, i) => ({
    id: `a${i}`, timestamp: `2026-01-07T10:${String(i % 60).padStart(2, '0')}:${String(i).padStart(2, '0')}Z`,
    userId: 'lauri', agentId: 'cm', agentName: 'CM', purpose: 'context',
    itemsReadCount: 1, blockedCount: 0, allowedItems: [], blockedReasons: [],
  }));
  const { dir, result } = runCase('long-access-log', big);
  check('long access log: migration ok', result.ok === true, JSON.stringify(result.failures).slice(0, 200));
  const { DatabaseSync } = await import('node:sqlite');
  const c = new DatabaseSync(path.join(dir, 'arch', 'lauri.cm.db'));
  const n = c.prepare('SELECT COUNT(*) c FROM app_access_log').get() as { c: number };
  c.close();
  check('long access log: all 230 entries preserved (no migration trim)', n.c === 230, String(n.c));
  fs.rmSync(dir, { recursive: true, force: true });
}

// Case 7: unknown NESTED fields ride verbatim (entry + message + reward shapes)
{
  const nested = fixture();
  (nested.cabinetEntries[0] as Record<string, unknown>).customTag = { team: 'x', prio: 1 };
  (nested.messages[0] as Record<string, unknown>).futureFlag = ['a', 'b'];
  const { dir, result } = runCase('nested', nested);
  check('nested: migration ok', result.ok === true, JSON.stringify(result.failures).slice(0, 200));
  const { DatabaseSync } = await import('node:sqlite');
  const u = new DatabaseSync(path.join(dir, 'arch', 'lauri.user.db'));
  const g = JSON.parse((u.prepare('SELECT doc FROM goals WHERE id = ?').get('e-goal') as { doc: string }).doc);
  const m = JSON.parse((u.prepare('SELECT json FROM app_messages WHERE id = ?').get('m1') as { json: string }).json);
  u.close();
  check('nested: unknown entry field preserved in doc', g.customTag?.team === 'x' && g.customTag?.prio === 1);
  check('nested: unknown message field preserved', Array.isArray(m.futureFlag) && m.futureFlag.length === 2);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---- G34: hosted mode (fake pg pool, no live database) ----
// hydrate -> write+verify local -> AWAITED push -> hosted read-back -> only then delete.
function runHostedCase(name: string, setup: object | null, flags: { urls?: string[]; failPushKind?: string; failPull?: boolean; reorderKeys?: boolean } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `migrate-${name}-`));
  if (setup) fs.writeFileSync(path.join(dir, 'cabinet-db.json'), JSON.stringify(setup));
  const urls = flags.urls ?? ['user', 'cm', 'nordea'];
  const runner = `
    process.env.CABINET_DATA_DIR = ${JSON.stringify(dir)};
    ${urls.map((u) => `process.env.${u.toUpperCase()}_DB_URL = 'fake://${u}';`).join('\n    ')}
    const TABLES = { 'fake://user': 'agent_user_records', 'fake://cm': 'agent_cm_records', 'fake://nordea': 'agent_nordea_records' };
    const hosted = { agent_user_records: [], agent_cm_records: [], agent_nordea_records: [] };
    const FAIL_PUSH = ${JSON.stringify(flags.failPushKind ?? null)};
    const FAIL_PULL = ${JSON.stringify(flags.failPull ?? false)};
    const REORDER = ${JSON.stringify(flags.reorderKeys ?? false)};
    const reorder = (v) => Array.isArray(v) ? v.map(reorder) : (v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().reverse().map((k) => [k, reorder(v[k])])) : v);
    const pool = (url) => ({
      query: async (text, params) => {
        const t = TABLES[url];
        if (/^SELECT user_id, table_name, id, data FROM/.test(text)) {
          if (FAIL_PULL) throw new Error('pull boom');
          return { rows: hosted[t].map((r) => (REORDER ? { ...r, data: reorder(r.data) } : { ...r })) };
        }
        if (/^SELECT 1 FROM .* WHERE user_id/.test(text)) return { rows: hosted[t].some((r) => r.user_id === params[0]) ? [{ one: 1 }] : [] };
        throw new Error('unexpected query: ' + text);
      },
      connect: async () => {
        const t = TABLES[url];
        let staging = null;
        return {
          query: async (text, params) => {
            if (text === 'BEGIN') { staging = null; return {}; }
            if (/^DELETE FROM/.test(text)) { staging = hosted[t].filter((r) => r.user_id !== params[0]); return {}; }
            if (/^INSERT INTO/.test(text)) {
              if (FAIL_PUSH && t === 'agent_' + FAIL_PUSH + '_records') throw new Error('push boom');
              staging.push({ user_id: params[0], table_name: params[1], id: params[2], data: JSON.parse(params[3]) });
              return {};
            }
            if (text === 'COMMIT') { hosted[t] = staging; return {}; }
            if (text === 'ROLLBACK') { staging = null; return {}; }
            throw new Error('unexpected tx query: ' + text);
          },
          release: () => {},
        };
      },
    });
    import(${JSON.stringify(path.resolve('src/server/arch/store/remote.ts'))}).then(async (R) => {
      R.setPoolFactoryForTests((url) => pool(url));
      const m = await import(${JSON.stringify(path.resolve('src/server/arch/legacyMigrate.ts'))});
      const result = await m.runLegacyMigrationHostedSafe();
      const summary = Object.fromEntries(Object.entries(hosted).map(([t, rows]) => [t, rows.length]));
      const tables = [...new Set(Object.values(hosted).flat().map((r) => r.table_name))].sort();
      console.log('RESULT:' + JSON.stringify({ result, summary, tables }));
    });
  `;
  const out = execFileSync('npx', ['tsx', '--eval', runner], { encoding: 'utf-8' });
  const line = out.trim().split('\n').find((l) => l.startsWith('RESULT:'))!;
  return { dir, ...JSON.parse(line.slice(7)) };
}

// Case 8: hosted full migration - pushed + read back before delete, all namespaces hosted
{
  const { dir, result, summary, tables } = runHostedCase('hosted-full', fixture());
  check('hosted full: migration ok', result.ok === true, JSON.stringify(result.failures).slice(0, 300));
  check('hosted full: legacy file deleted', result.deleted === true && !fs.existsSync(path.join(dir, 'cabinet-db.json')));
  check('hosted full: all three hosted tables written', summary.agent_user_records > 0 && summary.agent_cm_records > 0 && summary.agent_nordea_records > 0, JSON.stringify(summary));
  check('hosted full: app namespaces hosted (messages, access log, earnings, rewards)',
    ['app_messages', 'app_conversations', 'app_topic_log', 'app_access_log', 'app_earnings', 'app_data_rewards', 'app_rewards'].every((t) => tables.includes(t)), tables.join(','));
  fs.rmSync(dir, { recursive: true, force: true });
}

// Case 8b: jsonb may return keys in any order - the read-back must still match (canon both sides)
{
  const { dir, result } = runHostedCase('hosted-reorder', fixture(), { reorderKeys: true });
  check('hosted reorder: migration ok despite jsonb key order', result.ok === true, JSON.stringify(result.failures).slice(0, 300));
  check('hosted reorder: legacy file deleted', result.deleted === true && !fs.existsSync(path.join(dir, 'cabinet-db.json')));
  fs.rmSync(dir, { recursive: true, force: true });
}

// Case 9: hosted push failure keeps the file (no silent local-only "success")
{
  const { dir, result } = runHostedCase('hosted-push-fail', fixture(), { failPushKind: 'nordea' });
  check('hosted push fail: not ok', result.ok === false);
  check('hosted push fail: file kept', fs.existsSync(path.join(dir, 'cabinet-db.json')));
  check('hosted push fail: names the failed push', result.failures.some((f: string) => f.includes('hosted push failed')), JSON.stringify(result.failures).slice(0, 200));
  fs.rmSync(dir, { recursive: true, force: true });
}

// Case 10: partially configured hosted mode fails closed
{
  const { dir, result } = runHostedCase('hosted-partial', fixture(), { urls: ['user'] });
  check('hosted partial: fails closed', result.ok === false && fs.existsSync(path.join(dir, 'cabinet-db.json')));
  check('hosted partial: names missing URLs', result.failures.some((f: string) => f.includes('partially configured')), JSON.stringify(result.failures).slice(0, 200));
  fs.rmSync(dir, { recursive: true, force: true });
}

// Case 11: failed hydrate stops before any write
{
  const { dir, result } = runHostedCase('hosted-pull-fail', fixture(), { failPull: true });
  check('hosted pull fail: not ok, file kept', result.ok === false && fs.existsSync(path.join(dir, 'cabinet-db.json')));
  check('hosted pull fail: names the pull', result.failures.some((f: string) => f.includes('hosted pull failed')), JSON.stringify(result.failures).slice(0, 200));
  check('hosted pull fail: nothing written locally', !fs.existsSync(path.join(dir, 'arch', 'lauri.user.db')));
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\ntest-migrate: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
