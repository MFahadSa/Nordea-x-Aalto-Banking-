/**
 * Tests for the G1/G2 data layer (src/server/db.ts as the adapter over the three agent DBs):
 *  1. Legacy file data migrates into the three agent databases on init; the old store
 *     keeps only app plumbing (chat transcripts, logs, conversations, earnings, rewards).
 *  2. The legacy file is stripped of customer data after migration (no second copy).
 *  3. getState() composes the old full DatabaseState shape from the three DBs + plumbing.
 *  4. G2: app code writes the agent DBs directly through the adapter - transactions land
 *     in the Nordea DB, goals in the User DB, other entries in the Context Memory DB.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-test-'));
process.env.CABINET_DATA_DIR = DIR;

const { writeDemoDb } = await import('./demo-data.js');
writeDemoDb(DIR);
const { db } = await import('../src/server/db.js');
await db.init();
const { runLegacyMigration } = await import('../src/server/arch/legacyMigrate.js');
const migA = runLegacyMigration();
if (!migA.ok) throw new Error('demo migration failed: ' + migA.failures.join('; '));
const S = await import('../src/server/arch/store/index.js');
const A = await import('../src/server/arch/orchestrator.js');

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail)}`); }
}

// --- Migration: legacy demo file -> three agent databases
check('both demo customers are registered in the customers index', ['lauri', 'eeva'].every((u) => S.listCustomers().includes(u)), S.listCustomers());
check('lauri profile lives in the User DB', S.loadProfile('lauri')?.name === 'Lauri' && S.loadProfile('lauri')?.age === 31);
check('lauri goals live in the User DB (3 demo goals)', S.loadUserDb('lauri').goals.length === 3, S.loadUserDb('lauri').goals.length);
check('lauri non-goal entries live in the Context Memory DB (2 observations + 1 preference)', S.loadCmDb('lauri').entries.length === 3, S.loadCmDb('lauri').entries.length);
check('eeva data migrated too (1 goal + 2 entries)', S.loadUserDb('eeva').goals.length === 1 && S.loadCmDb('eeva').entries.length === 2);
check('lauri balances live in the Nordea DB', !!S.loadBalances('lauri')?.current);
check('lauri bank accounts live in the Nordea DB', (S.loadNordeaDb('lauri')?.accounts ?? []).some((a) => a.userId === 'lauri' && a.key === 'current'));
check('entry history migrated into the Context Memory DB', S.loadHistory('lauri').length >= 3, S.loadHistory('lauri').length);

// --- Owner 16:35: the explicit migration moved EVERYTHING into the three agent DBs and deleted the file
check('the legacy file is gone after the verified migration', !fs.existsSync(path.join(DIR, 'cabinet-db.json')));
check('access log lives in the Context Memory DB', S.loadAppAccessLog('lauri').length >= 1, S.loadAppAccessLog('lauri').length);
check('topic log lives in the User DB', (S.loadAppRows('lauri', 'app_topic_log') as unknown[]).length >= 1);
check('rewards live in the Nordea DB, keyed by customer', JSON.parse(S.loadAppRewards('lauri') ?? '{}').points === 120, S.loadAppRewards('lauri'));

// --- getState composes the old DatabaseState shape
const state = db.getState();
check('getState composes users from User DB + Nordea DB + rewards', state.users.lauri?.name === 'Lauri' && state.users.lauri?.points === 120 && !!state.users.lauri?.accounts?.current);
check('getState composes all 9 demo cabinet entries (goals + entries)', state.cabinetEntries.length === 9, state.cabinetEntries.length);
check('getState keeps plumbing lists (messages, access log)', state.messages.length === 3 && state.accessLog.length >= 1, { m: state.messages.length, a: state.accessLog.length });

// --- G2: app code writes the agent DBs directly through the adapter
db.upsertTransactions('lauri', [{ id: 't-adapt-1', userId: 'lauri', date: '2026-10-30', category: 'groceries', amount: -12.5, account: 'current', bankId: 'ADAPT-1' }]);
check('upsertTransactions writes the Nordea DB directly', S.loadNordeaDb('lauri')!.transactions.some((t) => t.bankId === 'ADAPT-1'));

db.addCabinetEntry({ id: 'g-adapt-1', userId: 'lauri', type: 'goal', title: 'Adapter goal', detail: 'written by app code', source: 'customer', status: 'active', private: false, readableBy: { abel: true, offers: true }, provenance: { channel: 'app' }, reviewed: true, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' });
check('a goal entry written by app code lands in the User DB', S.loadUserDb('lauri').goals.some((g) => g.id === 'g-adapt-1'));

db.addCabinetEntry({ id: 'p-adapt-1', userId: 'lauri', type: 'preference', title: 'Adapter preference', detail: 'written by app code', source: 'customer', status: 'active', private: false, readableBy: { abel: true, offers: true }, provenance: { channel: 'app' }, reviewed: true, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' });
check('a non-goal entry written by app code lands in the Context Memory DB', S.loadCmDb('lauri').entries.some((e) => e.id === 'p-adapt-1'));
check('adapter writes record entry history in the Context Memory DB', S.loadHistory('lauri').some((h) => h.entryId === 'p-adapt-1'));

const roundTrip = db.getCabinetEntry('p-adapt-1');
check('a written entry reads back through getState mapping with Abel fields intact', roundTrip?.title === 'Adapter preference' && roundTrip?.type === 'preference' && roundTrip?.provenance.channel === 'app');

// --- G2: runtime writes go through the owning agent - an auditable bus control message,
// the agent performs the store write, and risk is derived by CODE rules, never the caller.
db.addCabinetEntry({ id: 'g2-routed-1', userId: 'lauri', type: 'preference', title: 'G2 routed entry', detail: 'prefers plain emails', source: 'customer', status: 'active', private: false, readableBy: { abel: true, offers: true }, provenance: { channel: 'app' }, reviewed: true, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' });
const busMsgs = S.loadBus('lauri').messages;
check('a cabinet write arrives at the CM agent as an auditable control message',
  busMsgs.some((m) => m.type === 'control' && m.to === 'cm' && (m.payload as { control?: string })?.control === 'put-entry'));
const routed = S.loadCmDb('lauri').entries.find((e) => e.id === 'g2-routed-1');
check('the CM agent wrote the entry and derived risk+observed by code rules (customer input = low/observed)',
  routed?.risk === 'low' && routed?.observed === 'observed', { risk: routed?.risk, observed: routed?.observed });

db.addCabinetEntry({ id: 'g2-routed-2', userId: 'lauri', type: 'fact', title: 'Note about therapy appointments', detail: 'mentioned in chat', source: 'customer', status: 'active', private: false, readableBy: { abel: true, offers: false }, provenance: { channel: 'app' }, reviewed: true, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' });

// --- G10: ONE consent path. A high-risk OR unreviewed app write waits in the CM review
// queue under the same standing permissions as agent proposals - it does not store directly.
const queued2 = S.loadBus('lauri').messages.find((m) => m.type === 'propose' && m.to === 'user'
  && (m.payload as { entry?: { id?: string } })?.entry?.id === 'g2-routed-2');
check('a sensitive-topic write waits in the CM review queue with code-derived HIGH risk (G10, F21)',
  !!queued2 && queued2.status === 'pending' && (queued2.payload as { risk?: string })?.risk === 'high'
  && !S.loadCmDb('lauri').entries.some((e) => e.id === 'g2-routed-2' && e.status === 'active'));

db.addCabinetEntry({ id: 'g2-routed-4', userId: 'lauri', type: 'preference', title: 'G2 unreviewed preference', detail: 'from an unreviewed import', source: 'customer', status: 'active', private: false, readableBy: { abel: true, offers: true }, provenance: { channel: 'app' }, reviewed: false, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' });
check('an UNREVIEWED low-risk write also queues (G10: no second consent flag)',
  !S.loadCmDb('lauri').entries.some((e) => e.id === 'g2-routed-4')
  && S.loadBus('lauri').messages.some((m) => m.type === 'propose' && m.status === 'pending' && (m.payload as { entry?: { id?: string } })?.entry?.id === 'g2-routed-4'));

// Bill 03:09 probe: identical writes must not stack duplicate proposals.
db.addCabinetEntry({ id: 'g2-routed-4', userId: 'lauri', type: 'preference', title: 'G2 unreviewed preference', detail: 'from an unreviewed import', source: 'customer', status: 'active', private: false, readableBy: { abel: true, offers: true }, provenance: { channel: 'app' }, reviewed: false, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' });
const pending4 = S.loadBus('lauri').messages.filter((m) => m.type === 'propose' && m.status === 'pending' && (m.payload as { entry?: { id?: string } })?.entry?.id === 'g2-routed-4');
check('an identical re-write keeps ONE pending proposal per entry id', pending4.length === 1, `pending: ${pending4.length}`);

// Bill 03:09: the app's confirm IS the queue decision - it must not 404 on a queued entry.
db.updateCabinetEntry('g2-routed-4', { reviewed: true, confirmedAt: '2026-11-01T01:00:00Z' });
const confirmed4 = db.getCabinetEntry('g2-routed-4');
check('app confirm accepts the queued write (decideProposal) and stores it explicitly reviewed',
  !!confirmed4 && confirmed4.reviewed === true && confirmed4.confirmedAt === '2026-11-01T01:00:00Z'
  && S.loadCmDb('lauri').entries.find((e) => e.id === 'g2-routed-4')?.autoAccepted !== true);

// Bill 03:21 G11: a changed observation queues, and the stored copy is HELD (reviewed=false)
// until the customer decides - Abel never reads the stale figure as reviewed (v2 hid it).
S.putEntry('lauri', { id: 'g11-1', title: 'Car spending', detail: '100 EUR this month', goalIds: [], proposedBy: 'nordea', status: 'active', createdAt: '2026-10-01T00:00:00Z',
  doc: { id: 'g11-1', userId: 'lauri', type: 'observation', title: 'Car spending', detail: '100 EUR this month', source: 'nordea', status: 'active', private: false, readableBy: { abel: true, offers: false }, provenance: { channel: 'system' }, reviewed: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' } });
db.updateCabinetEntry('g11-1', { title: 'Car spending', detail: '150 EUR this month', reviewed: false }, { by: 'nordea', how: 'Fresh bank data' });
const g11wait = S.loadCmDb('lauri').entries.find((e) => e.id === 'g11-1');
check('G11: the changed observation queues instead of overwriting', S.loadBus('lauri').messages.some((m) => m.type === 'propose' && m.status === 'pending' && (m.payload as { entry?: { id?: string } })?.entry?.id === 'g11-1'));
check('G11: the stored copy is held (reviewed=false) while the update waits', g11wait?.doc?.reviewed === false, g11wait?.doc?.reviewed);
check('G11: the held copy keeps the old figure (no silent overwrite)', g11wait?.detail === '100 EUR this month', g11wait?.detail);
const g11prop = S.loadBus('lauri').messages.find((m) => m.type === 'propose' && m.status === 'pending' && (m.payload as { entry?: { id?: string } })?.entry?.id === 'g11-1')!;
A.decideProposal('lauri', g11prop.id, true);
const g11done = S.loadCmDb('lauri').entries.find((e) => e.id === 'g11-1');
check('G11: accepting the queued change updates the entry, explicitly reviewed', g11done?.detail === '150 EUR this month' && g11done?.doc?.reviewed === true, `${g11done?.detail} reviewed=${g11done?.doc?.reviewed}`);
S.putEntry('lauri', { id: 'g11-2', title: 'Fuel spending', detail: '200 EUR this quarter', goalIds: [], proposedBy: 'nordea', status: 'active', createdAt: '2026-10-01T00:00:00Z',
  doc: { id: 'g11-2', userId: 'lauri', type: 'observation', title: 'Fuel spending', detail: '200 EUR this quarter', source: 'nordea', status: 'active', private: false, readableBy: { abel: true, offers: false }, provenance: { channel: 'system' }, reviewed: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' } });
db.updateCabinetEntry('g11-2', { title: 'Fuel spending', detail: '260 EUR this quarter', reviewed: false }, { by: 'nordea', how: 'Fresh bank data' });
const g11prop2 = S.loadBus('lauri').messages.find((m) => m.type === 'propose' && m.status === 'pending' && (m.payload as { entry?: { id?: string } })?.entry?.id === 'g11-2')!;
A.decideProposal('lauri', g11prop2.id, false);
const g11rej = S.loadCmDb('lauri').entries.find((e) => e.id === 'g11-2');
check('G11: a rejected change leaves the copy held, old figure kept (v2: hidden until re-checked)', g11rej?.doc?.reviewed === false && g11rej?.detail === '200 EUR this quarter', `${g11rej?.detail} reviewed=${g11rej?.doc?.reviewed}`);

A.setStandingPermissions('lauri', 'high');
db.addCabinetEntry({ id: 'g2-routed-5', userId: 'lauri', type: 'preference', title: 'G2 second unreviewed preference', detail: 'queued then auto-stored', source: 'customer', status: 'active', private: false, readableBy: { abel: true, offers: true }, provenance: { channel: 'app' }, reviewed: false, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' });
const stored5 = S.loadCmDb('lauri').entries.find((e) => e.id === 'g2-routed-5');
check('standing permissions (high) auto-store a queued low-risk write, marked autoAccepted + reviewed',
  !!stored5 && stored5.autoAccepted === true && stored5.doc?.reviewed === true && stored5.risk === 'low');
check('the high-risk write still waits under standing permissions (only explicit consent stores it)',
  !S.loadCmDb('lauri').entries.some((e) => e.id === 'g2-routed-2'));

A.decideProposal('lauri', queued2!.id, true);
const stored2 = S.loadCmDb('lauri').entries.find((e) => e.id === 'g2-routed-2');
check('accepting the queued write stores it as explicitly reviewed (not autoAccepted, so undo skips it)',
  !!stored2 && stored2.doc?.reviewed === true && !stored2.autoAccepted && stored2.risk === 'high');

// Bill 03:09: an archive is a removal, not new content - it lands directly (no queue),
// and a still-waiting proposal for the same entry is withdrawn so a late accept cannot resurrect it.
S.putEntry('lauri', { id: 'g2-routed-6', title: 'Migrated unreviewed observation', detail: 'predates the consent path', goalIds: [], proposedBy: 'nordea', status: 'active', createdAt: '2026-10-01T00:00:00Z',
  doc: { id: 'g2-routed-6', userId: 'lauri', type: 'observation', title: 'Migrated unreviewed observation', detail: 'predates the consent path', source: 'nordea', status: 'active', private: false, readableBy: { abel: true, offers: false }, provenance: { channel: 'system' }, reviewed: false, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' } });
db.updateCabinetEntry('g2-routed-6', { status: 'archived' }, { by: 'nordea', how: 'No longer seen' });
check('an archive of an unreviewed entry lands directly (no queue, nothing pending for it)',
  db.getCabinetEntry('g2-routed-6')?.status === 'archived'
  && !S.loadBus('lauri').messages.some((m) => m.type === 'propose' && m.status === 'pending' && (m.payload as { entry?: { id?: string } })?.entry?.id === 'g2-routed-6'));

db.addCabinetEntry({ id: 'g2-routed-3', userId: 'lauri', type: 'goal', title: 'G2 routed goal', detail: '', source: 'customer', status: 'active', private: false, readableBy: { abel: true, offers: true }, provenance: { channel: 'app' }, reviewed: true, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' });
check('a goal write arrives at the PERSONAL agent as a control message and lands in the User DB',
  busMsgs.some((m) => m.type === 'control' && m.to === 'personal' && (m.payload as { control?: string })?.control === 'put-goal')
  || S.loadBus('lauri').messages.some((m) => m.type === 'control' && m.to === 'personal' && (m.payload as { control?: string })?.control === 'put-goal'),
  undefined);
check('the routed goal is in the User DB', S.loadUserDb('lauri').goals.some((g) => g.id === 'g2-routed-3'));

db.upsertTransactions('lauri', [{ id: 't-g2-1', userId: 'lauri', date: '2026-10-31', category: 'transport', amount: -20, account: 'current', bankId: 'G2-1' }]);
check('a bank import arrives at the NORDEA agent as a control message and lands in the Nordea DB',
  S.loadBus('lauri').messages.some((m) => m.type === 'control' && m.to === 'nordea' && (m.payload as { control?: string })?.control === 'put-transactions')
  && S.loadNordeaDb('lauri')!.transactions.some((t) => t.bankId === 'G2-1'));

// --- G6: each agent store reads ONLY its own hosted secret (one Postgres role per agent)
const readSrc = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf-8');
const SECRETS = ['USER_DB_URL', 'CM_DB_URL', 'NORDEA_DB_URL'];
const stores: [string, string][] = [['userStore', 'USER_DB_URL'], ['cmStore', 'CM_DB_URL'], ['nordeaStore', 'NORDEA_DB_URL']];
for (const [mod, own] of stores) {
  const code = readSrc(`../src/server/arch/store/${mod}.ts`);
  check(`G6: ${mod} reads only its own secret (${own})`,
    code.includes(own) && SECRETS.filter((s) => s !== own).every((s) => !code.includes(s)));
}
check('G6: the shared store plumbing names no connection secret at all',
  SECRETS.every((s) => !readSrc('../src/server/arch/store/common.ts').includes(s)));
check('G6: the bus store has no hosted secret (transient agent messaging stays local)',
  SECRETS.every((s) => !readSrc('../src/server/arch/store/busStore.ts').includes(s)));
check('G6: the migration SQL ships one table + one role per agent database', (() => {
  const sql = readSrc('../supabase/three-agents.sql');
  return ['user', 'cm', 'nordea'].every((a) => sql.includes(`agent_${a}_records`) && sql.includes(`agent_${a} `)) && !sql.toLowerCase().includes('service_role');
})());

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.error('ADAPTER TESTS FAILED'); process.exit(1); }
console.log('All checks passed');
