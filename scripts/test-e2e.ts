/**
 * V7 end-to-end: proof the app, /arch.html and /dev-monitor.html are ONE machine.
 * Boots the real server (mock LLM; the monitor stays at its default - ON) over a throwaway data dir seeded from
 * seed/demo, then drives the exact HTTP routes the three pages use:
 *   1. a goal given to the personal agent's chat appears in the arch state and the monitor
 *   2. a review decision on /arch.html changes what the agent's chat answers from
 *   3. a bank import updates all three views (app route, arch state, monitor)
 *   4. round A (session) and round B (top-up) run over HTTP
 *   5. a source scan proves no app/arch code reads customer data from the old store
 * The live three-page check and the hosted-Supabase check are Bill's (review.md).
 */
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
const PORT = 3210 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;

// G21: leave an OLD-schema database behind first (goals without the doc column, entries without
// the later provenance columns) - the loader must migrate it like the app does, not crash.
{
  const { DatabaseSync } = await import('node:sqlite');
  fs.mkdirSync(path.join(DIR, 'arch'), { recursive: true });
  const oldUser = new DatabaseSync(path.join(DIR, 'arch', 'lauri.user.db'));
  oldUser.exec(`CREATE TABLE goals (id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
    INSERT INTO goals VALUES ('old-goal', 'Old goal', 'from a previous version', '2026-01-01T00:00:00.000Z')`);
  oldUser.close();
  const oldCm = new DatabaseSync(path.join(DIR, 'arch', 'lauri.cm.db'));
  oldCm.exec(`CREATE TABLE entries (id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, goal_ids TEXT NOT NULL,
    proposed_by TEXT NOT NULL, via_message_id TEXT, evidence TEXT, status TEXT NOT NULL,
    dispute_reason TEXT, created_at TEXT NOT NULL);
    INSERT INTO entries VALUES ('old-entry', 'Old entry', '', '[]', 'user', NULL, NULL, 'active', NULL, '2026-01-01T00:00:00.000Z')`);
  oldCm.close();
}

// G18: go through run_python.mjs so the seed works with 'python' or 'python3'.
const seed = spawnSync(process.execPath, ['scripts/run_python.mjs', 'scripts/load_data.py', 'seed/demo', '--target', 'file', '--no-reload'], {
  env: { ...process.env, CABINET_DATA_DIR: DIR }, encoding: 'utf-8',
});
if (seed.status !== 0) { console.error(seed.stdout, seed.stderr); process.exit(1); }

// G21: the old database survived with its rows AND gained the new columns.
{
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path.join(DIR, 'arch', 'lauri.user.db'), { readOnly: true });
  const cols = (db.prepare('PRAGMA table_info(goals)').all() as { name: string }[]).map((c) => c.name);
  const kept = db.prepare("SELECT title FROM goals WHERE id = 'old-goal'").get();
  db.close();
  const cm = new DatabaseSync(path.join(DIR, 'arch', 'lauri.cm.db'), { readOnly: true });
  const cmCols = (cm.prepare('PRAGMA table_info(entries)').all() as { name: string }[]).map((c) => c.name);
  const cmKept = cm.prepare("SELECT title FROM entries WHERE id = 'old-entry'").get();
  cm.close();
  if (!cols.includes('doc') || !kept || !cmCols.includes('doc') || !cmCols.includes('observed') || !cmKept) {
    console.error('G21 migration failed', { cols, kept, cmCols, cmKept });
    process.exit(1);
  }
  console.log('PASS  G21: old-schema databases migrate and keep their rows');
}

const server = spawn('npx', ['tsx', 'server.ts'], {
  env: { ...process.env, CABINET_DATA_DIR: DIR, LLM_PROVIDER: 'mock', PORT: String(PORT) }, // G22: monitor on by default
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true, // own process group, so the whole server tree can be signalled at the end
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail)}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(method: string, p: string, body?: unknown): Promise<{ status: number; json: any }> {
  const r = await fetch(BASE + p, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

const UID = 'eeva';
const CAR_TXS = [
  { id: 'e2e-t1', userId: UID, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' },
  { id: 'e2e-t2', userId: UID, date: '2026-10-02', category: 'transport', amount: -83.5, account: 'current', description: 'Car wash' },
];

try {
  // Boot
  const deadline = Date.now() + 30000;
  for (;;) {
    try { const r = await fetch(`${BASE}/api/arch/customers`); if (r.ok) break; } catch { /* not up yet */ }
    if (Date.now() > deadline) { console.error(serverLog); throw new Error('server did not start'); }
    await sleep(300);
  }
  const customers = await api('GET', '/api/arch/customers');
  check('V7: the arch customers endpoint lists the seeded customers', [UID, 'lauri', 'alex'].every((c) => JSON.stringify(customers.json).includes(c)), customers.json);
  check('V7: both view pages are served', (await fetch(`${BASE}/arch.html`)).ok && (await fetch(`${BASE}/dev-monitor.html`)).ok);

  // 0. Known bank data for eeva (import #1, snapshot)
  const imp1 = await api('POST', '/api/nordea-data', { userId: UID, fileName: 'e2e-import-1.json', data: { accounts: [], transactions: CAR_TXS } });
  check('V7: bank import #1 lands', imp1.status === 200 && imp1.json?.result?.ok === true, imp1.json);

  // 1. A goal given to the personal agent's chat appears on /arch.html's data and in the monitor
  const goalsBefore = (await api('GET', `/api/arch/${UID}/state`)).json?.databases?.user?.goals ?? 0;
  const goalChat = await api('POST', `/api/arch/${UID}/chat`, { text: 'my goal is Save for a car' });
  check('V7: the goal is accepted by the personal agent chat', goalChat.status === 200 && String(goalChat.json?.reply ?? '').includes('Save for a car'), goalChat.json);
  const st1 = (await api('GET', `/api/arch/${UID}/state`)).json;
  check('V7: the goal is visible in the arch state (/arch.html data)', st1?.databases?.user?.goals === goalsBefore + 1 && String(st1?.contextMd ?? '').includes('Save for a car'), { goals: st1?.databases?.user?.goals, before: goalsBefore });
  const mon1 = (await api('GET', `/api/dev/monitor?userId=${UID}`)).json;
  check('V7: the same goal is visible in the dev monitor', mon1?.arch?.databases?.user?.goals === goalsBefore + 1 && String(mon1?.arch?.contextMd ?? '').includes('Save for a car'), mon1?.arch?.databases);
  // G13: situation A over HTTP - a User DB change (the goal add) runs a user-change round.
  const busAfterGoal = ((await api('GET', `/api/arch/${UID}/state`)).json?.messages ?? []) as { type?: string; payload?: { trigger?: string } }[];
  check('V7: situation A - the goal add ran a user-change round', busAfterGoal.some((m) => m.type === 'round-start' && m.payload?.trigger === 'user-change'), busAfterGoal.filter((m) => m.type === 'round-start').map((m) => m.payload?.trigger));

  // 1b. Goal edit + delete on /arch.html (G7): the routes drive the personal agent
  const tmpGoal = await api('POST', `/api/arch/${UID}/goals`, { title: 'e2e temp goal' });
  const tmpId = tmpGoal.json?.id as string;
  const edit = await api('POST', `/api/arch/${UID}/goals/${tmpId}`, { title: 'e2e temp goal edited' });
  const stEdit = (await api('GET', `/api/arch/${UID}/state`)).json;
  const monEdit = (await api('GET', `/api/dev/monitor?userId=${UID}`)).json;
  check('V7: goal edit lands and shows in both views', edit.status === 200 && JSON.stringify(stEdit?.goals).includes('e2e temp goal edited') && JSON.stringify(monEdit?.arch?.goals).includes('e2e temp goal edited'), { tmp: [tmpGoal.status, tmpGoal.json], edit: [edit.status, edit.json], goals: stEdit?.goals });
  const del = await api('POST', `/api/arch/${UID}/goals/${tmpId}/delete`);
  const stDel = (await api('GET', `/api/arch/${UID}/state`)).json;
  check('V7: goal delete removes it from Abel\'s knowledge (both views)', del.status === 200 && !JSON.stringify(stDel?.goals).includes('e2e temp goal edited') && stDel?.databases?.user?.goals === goalsBefore + 1, stDel?.goals);

  // 2. A review decision on /arch.html changes what the agent's chat answers from
  const preChat = await api('POST', `/api/arch/${UID}/chat`, { text: 'how much have I saved for the car?' });
  check('V7: before review the chat cannot answer from the Context Memory DB', !(preChat.json?.used ?? []).includes('context-memory-db'), preChat.json?.used);
  let review = (await api('GET', `/api/arch/${UID}/review`)).json?.proposals ?? [];
  if (!review.some((m: any) => m.from === 'nordea')) { await api('POST', `/api/arch/${UID}/goals`, { title: 'Save for a trip to Japan' }); review = (await api('GET', `/api/arch/${UID}/review`)).json?.proposals ?? []; }
  const prop = review.find((m: any) => m.from === 'nordea' && String(m.summary ?? '').includes('Activity related to goal'));
  check('V7: the goal-matching Nordea proposal waits in review', !!prop, review.map((m: any) => `${m.from}:${m.summary}`));
  const acc = await api('POST', `/api/arch/${UID}/review/${prop.id}/accept`);
  check('V7: accepting the proposal writes the cabinet entry', acc.status === 200 && !!(acc.json?.id ?? acc.json?.entry?.id), acc.json);
  const entries = (await api('GET', `/api/arch/${UID}/entries`)).json?.entries ?? [];
  check('V7: the entry is active with the matched evidence', entries.some((e: any) => e.status === 'active' && typeof e.evidence?.total === 'number' && String(e.title).includes('Activity related to goal')), entries.map((e: any) => `${e.status}:${e.title.slice(0, 30)}`));
  const postChat = await api('POST', `/api/arch/${UID}/chat`, { text: 'how much have I saved for the car?' });
  check('V7: after the review decision the chat answers from the Context Memory DB', (postChat.json?.used ?? []).includes('context-memory-db'), postChat.json?.used);

  // 3. Bank import #2 (incremental) updates all three views
  const imp2 = await api('POST', '/api/nordea-data', { userId: UID, fileName: 'e2e-import-2.json', data: { mode: 'incremental', transactions: [{ id: 'e2e-t3', userId: UID, date: '2026-10-20', category: 'transport', amount: -50, account: 'current', description: 'Car wash' }] } });
  check('V7: bank import #2 lands and the arch hook runs', imp2.status === 200 && imp2.json?.result?.ok === true && imp2.json?.arch?.updated === true, imp2.json);
  const appView = (await api('GET', `/api/nordea-data?userId=${UID}`)).json;
  const st2 = (await api('GET', `/api/arch/${UID}/state`)).json;
  const mon2 = (await api('GET', `/api/dev/monitor?userId=${UID}`)).json;
  check('V7: all three views show the new transaction', appView?.transactions === 3 && st2?.databases?.nordea?.transactions === 3 && mon2?.arch?.databases?.nordea?.transactions === 3, { app: appView?.transactions, arch: st2?.databases?.nordea?.transactions, monitor: mon2?.arch?.databases?.nordea?.transactions });
  // G13: situation B over HTTP - a Nordea DB change (import #2) runs a decay round.
  const busAfterImport = (st2?.messages ?? []) as { type?: string; payload?: { trigger?: string } }[];
  check('V7: situation B - the bank import ran a decay round', busAfterImport.some((m) => m.type === 'round-start' && m.payload?.trigger === 'decay'), busAfterImport.filter((m) => m.type === 'round-start').map((m) => m.payload?.trigger));

  // 4. Situation C over HTTP: a session round on a new session, a top-up round on the same one
  await api('POST', `/api/arch/${UID}/chat`, { text: 'what do you know about my car saving?', sessionId: 'e2e-rounds' });
  const ctxA = (await api('GET', `/api/arch/${UID}/state`)).json?.context;
  check('V7: situation C1 - a session round on a new session', ctxA?.trigger === 'session' && typeof ctxA?.roundId === 'string' && ctxA.roundId.length > 0, ctxA);
  await api('POST', `/api/arch/${UID}/chat`, { text: 'what about my pension contributions?', sessionId: 'e2e-rounds' });
  const ctxB = (await api('GET', `/api/arch/${UID}/state`)).json?.context;
  check('V7: situation C2 - a top-up round on the same session', ctxB?.trigger === 'topup' && ctxB?.roundId !== ctxA?.roundId, ctxB);

  // 4c. F-A over HTTP: /session/new then the first question opens exactly one session round.
  const ns = await api('POST', `/api/arch/${UID}/session/new`, {});
  const countSess = (j: any) => ((j?.messages ?? []) as { type?: string; payload?: { trigger?: string } }[]).filter((m) => m.type === 'round-start' && m.payload?.trigger === 'session').length;
  const sessBefore = countSess((await api('GET', `/api/arch/${UID}/state`)).json);
  const firstQ = await api('POST', `/api/arch/${UID}/chat`, { text: 'what do you know about my car saving?', sessionId: ns.json?.sessionId });
  const stNew = (await api('GET', `/api/arch/${UID}/state`)).json;
  check('F-A: the first question after /session/new opens exactly one session round and finalises the document',
    countSess(stNew) - sessBefore === 1 && stNew?.context?.sessionId === ns.json?.sessionId && !!stNew?.context?.finalisedAt && !String(firstQ.json?.reply ?? '').includes('unavailable this session'),
    { rounds: countSess(stNew) - sessBefore, ctx: stNew?.context, reply: String(firstQ.json?.reply ?? '').slice(0, 80) });

  // 6. G30 slice 3, Bill's cond-4: the app's /api/chat and the arch chat are ONE conversation -
  // same session id, same stored messages, same session document.
  {
    const r = await api('POST', '/api/chat', { userId: UID, text: 'hello, one conversation please' });
    const convId = r.json?.conversationId as string;
    check('cond-4: the app chat returns its conversation id', r.status === 201 && typeof convId === 'string' && convId.length > 0, r.json);
    const msgs = (await api('GET', `/api/conversations/${convId}/messages`)).json?.messages ?? [];
    check('cond-4: the user + agent messages are stored under that id', msgs.length === 2 && msgs[0].sender === 'user' && msgs[1].sender === 'agent', msgs.map((m: any) => m.sender));
    const arch = await api('POST', `/api/arch/${UID}/chat`, { text: 'still the same chat?', sessionId: convId });
    check('cond-4: the arch chat reuses the same session id', arch.json?.sessionId === convId, arch.json?.sessionId);
    const stOne = JSON.stringify((await api('GET', `/api/arch/${UID}/state`)).json);
    check('cond-4: the session document belongs to the same session', stOne.includes(convId), convId);
  }

  // Outcome 3 (mock LLM, synthetic): a requestId runs ONCE; a repeat joins it or gets the stored reply; late pickup by requestId.
  {
    const rid = 'req-e2e-1';
    const [a, b] = await Promise.all([
      api('POST', '/api/chat', { userId: UID, text: 'what do you know about my car saving?', requestId: rid }),
      api('POST', '/api/chat', { userId: UID, text: 'what do you know about my car saving?', requestId: rid }),
    ]);
    const idA = a.json?.messages?.[1]?.id, idB = b.json?.messages?.[1]?.id;
    check('Q3: the same requestId sent twice at once returns ONE reply (no duplicate turn)', !!idA && idA === idB, [idA, idB]);
    const again = await api('POST', '/api/chat', { userId: UID, text: 'what do you know about my car saving?', requestId: rid });
    check('Q3: a later repeat returns the stored reply (200), not a new turn', again.status === 200 && again.json?.messages?.[1]?.id === idA, again.status);
    const stored = (await api('GET', `/api/conversations/${a.json.conversationId}/messages`)).json?.messages ?? [];
    check('Q3: exactly one user + one agent message stored for that requestId', stored.filter((m: any) => m.requestId === rid).length === 1 && stored.filter((m: any) => m.replyToRequestId === rid).length === 1, stored.length);
    const late = await api('GET', `/api/chat/result?userId=${UID}&requestId=${rid}`);
    check('Q3: late pickup by requestId returns the reply', late.json?.status === 'done' && late.json?.messages?.[1]?.id === idA, late.json?.status);
    const unk = await api('GET', `/api/chat/result?userId=${UID}&requestId=req-never-sent`);
    check('Q3: an unknown requestId is reported unknown (never silently resubmitted)', unk.json?.status === 'unknown', unk.json?.status);
    check('Q4: the stored reply carries its exact question category and round-plan info', ['General Question', 'Related Question'].includes(a.json?.messages?.[1]?.supplied?.category), a.json?.messages?.[1]?.supplied);
  }

  {
    const rid = 'req-arch-1';
    const body = { text: 'what do you know about my car saving?', requestId: rid };
    const [a, b] = await Promise.all([api('POST', `/api/arch/${UID}/chat`, body), api('POST', `/api/arch/${UID}/chat`, body)]);
    check('Q3 arch: the same requestId sent twice runs ONE turn (identical reply + session)', a.json?.reply && a.json.reply === b.json?.reply && a.json.sessionId === b.json.sessionId, [a.json?.reply?.slice(0, 40), b.json?.reply?.slice(0, 40)]);
    const st = await api('GET', `/api/arch/${UID}/chat/result?requestId=${rid}`);
    check('Q3 arch: late pickup by requestId returns the same reply', st.json?.status === 'done' && st.json.result?.reply === a.json.reply, st.json?.status);
    const unk = await api('GET', `/api/arch/${UID}/chat/result?requestId=req-arch-never`);
    check('Q3 arch: an unknown requestId is reported unknown', unk.json?.status === 'unknown', unk.json?.status);
  }
  // 5. Source scan: no app/arch code reads customer data from the old store
  const read = (f: string) => fs.readFileSync(f, 'utf-8');
  const appFiles = ['importPropose.ts', 'finance.ts', 'routes.ts', 'devMonitor.ts', 'dataRewards.ts', 'documents.ts'].map((f) => `src/server/${f}`);
  const infraAllowed = new Set(['src/server/db.ts', 'src/server/documents.ts', 'src/server/nordeaFeed.ts']);
  const oldStoreRef = /from\s+['"](?:\.\.\/)*\.\.?\/store\.js['"]/;
  const appLeaks = appFiles.filter((f) => !infraAllowed.has(f) && oldStoreRef.test(read(f)));
  const archFiles = [...fs.readdirSync('src/server/arch'), ...fs.readdirSync('src/server/arch/agents').map((f) => `agents/${f}`), ...fs.readdirSync('src/server/arch/store').map((f) => `store/${f}`)]
    .filter((f) => f.endsWith('.ts')).map((f) => `src/server/arch/${f}`);
  const archLeaks = archFiles.filter((f) => /from\s+['"][^'"]*server\/store\.js['"]|from\s+['"](?:\.\.\/)+store\.js['"]/.test(read(f)));
  check('V7: no app-layer code outside db/documents/feed imports the old store', appLeaks.length === 0, appLeaks);
  check('V7: no arch code reaches across to the old store', archLeaks.length === 0, archLeaks);
} finally {
  try { process.kill(-server.pid!, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
}

// G22: DEV_MONITOR=0 turns the monitor off (it is on by default, proven by the checks above).
{
  const PORT2 = PORT + 1000;
  const off = spawn('npx', ['tsx', 'server.ts'], {
    env: { ...process.env, CABINET_DATA_DIR: DIR, LLM_PROVIDER: 'mock', DEV_MONITOR: '0', PORT: String(PORT2) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  try {
    const deadline = Date.now() + 30000;
    for (;;) {
      try { const r = await fetch(`http://127.0.0.1:${PORT2}/api/arch/customers`); if (r.ok) break; } catch { /* not up yet */ }
      if (Date.now() > deadline) throw new Error('DEV_MONITOR=0 server did not start');
      await sleep(300);
    }
    const mon = await fetch(`http://127.0.0.1:${PORT2}/api/dev/monitor?userId=${UID}`);
    const page = await fetch(`http://127.0.0.1:${PORT2}/dev-monitor.html`);
    check('G22: DEV_MONITOR=0 hides the monitor API (404)', mon.status === 404, mon.status);
    check('G22: DEV_MONITOR=0 hides the monitor page (404)', page.status === 404, page.status);
  } finally {
    try { process.kill(-off.pid!, 'SIGTERM'); } catch { off.kill('SIGTERM'); }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
