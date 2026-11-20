/**
 * Active connections, two directions (concept demo):
 *  OUT  an app uses what Abel knows: no address or protocol asked; a link + key; reads only ticked,
 *       non-private, confirmed things; fails closed; every read logged.
 *  IN   a tool brings info in: protocol read from the address; reads nothing; a sync goes through the
 *       airlock and waits for the customer.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-'));
process.env.CABINET_DATA_DIR = DIR;
let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); } else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail)}`); }
}
const throws = (fn: () => unknown, status: number) => { try { fn(); return false; } catch (e: any) { return e.status === status; } };

const { setProvider } = await import('../src/server/llm.js');
const { mockProvider } = await import('../src/server/llmMock.js');
setProvider(mockProvider);
const { db } = await import('../src/server/db.js');
await db.init();
const C = await import('../src/server/connections.js');
const P = await import('../src/server/profile.js');
const U = 'lauri';

// --- protocol detection (never asked)
check('agent card address = A2A', C.detectProtocol('https://x.example/.well-known/agent.json') === 'a2a' && C.detectProtocol('https://a2a.x.example/') === 'a2a');
check('/mcp or /sse address = MCP', C.detectProtocol('https://x.example/mcp') === 'mcp' && C.detectProtocol('https://x.example/v1/sse') === 'mcp');
check('other addresses: not guessed', C.detectProtocol('https://x.example/api') === undefined && C.detectProtocol('nonsense') === undefined);
check('"mcp" inside a word is not MCP', C.detectProtocol('https://mcpherson.example/') === undefined);

// --- catalog: assistants are OUT, tools are IN
const apps = C.listApps(U);
check('assistants use Abel (out), tools bring info in', apps.filter((a) => a.kind === 'assistant').every((a) => a.direction === 'out') && apps.filter((a) => a.kind === 'tool').every((a) => a.direction === 'in'));

// --- OUT
check('OUT needs at least one drawer', throws(() => C.connect(U, { appId: 'claude', scopes: [] }), 400));
const out = C.connect(U, { appId: 'claude', scopes: ['goal', 'profile'] });
check('OUT connect returns a key once; only hash + hint stored', !!out.key && out.key.startsWith('cab_') && out.connection.keyHash !== out.key && out.connection.keyHint === out.key!.slice(-4) && !JSON.stringify(db.getUser(U)).includes(out.key!));
check('connecting the same app twice is refused', throws(() => C.connect(U, { appId: 'claude', scopes: ['goal'] }), 409));
P.saveProfileField(U, { label: 'Occupation', value: 'Nurse' });
const priv = P.saveProfileField(U, { label: 'Health', value: 'Knee surgery', private: true });
const r1 = C.readWithKey(out.connection.id, out.key!);
check('read with key: ticked drawers only, never private', r1.entries.length > 0 && r1.entries.every((e) => ['goal', 'profile'].includes(e.type)) && !r1.entries.some((e) => e.id === priv.entry.id));
check('every read is logged for "Who sees it"', db.getAccessLog(U).some((l) => l.agentId === 'conn:claude' && l.itemsReadCount === r1.entries.length));
check('wrong key is refused', throws(() => C.readWithKey(out.connection.id, 'cab_wrong'), 401));
check('no key is refused', throws(() => C.readWithKey(out.connection.id, ''), 401));
check('unknown connection is refused', throws(() => C.readWithKey('conn-nope', out.key!), 401));
C.updateConnection(U, out.connection.id, { status: 'paused' });
check('paused: read refused', throws(() => C.readWithKey(out.connection.id, out.key!), 403));
C.updateConnection(U, out.connection.id, { status: 'active', scopes: ['fact'] });
check('unconfirmed Nordea observations are never read', !C.readWithKey(out.connection.id, out.key!).entries.some((e) => e.source === 'nordea' && !e.reviewed));
const rot = C.rotateKey(U, out.connection.id);
check('new key: old key stops working, new one works', throws(() => C.readWithKey(out.connection.id, out.key!), 401) && !!C.readWithKey(out.connection.id, rot.key));

// --- IN
const inn = C.connect(U, { appId: 'gcal' });
check('IN connect needs no drawers and gets no key', inn.connection.direction === 'in' && !inn.key && inn.connection.protocol === 'mcp');
check('IN reads nothing from the cabinet', C.previewForConnection(U, inn.connection).length === 0);
check('IN has no read endpoint', throws(() => C.readWithKey(inn.connection.id, rot.key), 401));
check('IN cannot be given drawers', throws(() => C.updateConnection(U, inn.connection.id, { scopes: ['goal'] }), 400));
check('IN has no key to rotate', throws(() => C.rotateKey(U, inn.connection.id), 400));
const before = db.getCabinetEntries(U).length;
const s = await C.trySync(U, inn.connection.id);
check('sync goes through the airlock: nothing enters the cabinet directly', s.heard === 3 && db.getCabinetEntries(U).length === before, s);

// --- own apps
check('own OUT app: name only, no address needed', !!C.addCustomApp(U, { name: 'Budget bot', direction: 'out' }).app && !C.listApps(U).find((a) => a.name === 'Budget bot')!.endpoint);
check('own IN app needs an https address', throws(() => C.addCustomApp(U, { name: 'X', direction: 'in', endpoint: 'http://evil.example/mcp' }), 400));
check('own IN app: no password in the address', throws(() => C.addCustomApp(U, { name: 'X', direction: 'in', endpoint: 'https://u:p@x.example/mcp' }), 400));
check('own app needs a direction', throws(() => C.addCustomApp(U, { name: 'X', direction: 'sideways' }), 400));
const own = C.addCustomApp(U, { name: 'Strava', direction: 'in', endpoint: 'https://strava.example/.well-known/agent.json' }).app;
check('own IN app: protocol read from the address', own.protocol === 'a2a' && own.direction === 'in');
check('name already in the list', throws(() => C.addCustomApp(U, { name: 'claude', direction: 'out' }), 409));
C.connect(U, { appId: own.id });
C.removeCustomApp(U, own.id);
check('removing an own app removes its connection', !C.listConnections(U).some((c) => c.appId === own.id));

// --- older saved data still reads
db.updateUser('eeva', { connections: [{ id: 'conn-old1', appId: 'claude', scopes: ['goal'], status: 'active', createdAt: '2026-11-20', updatedAt: '2026-11-20' } as any] });
check('a connection saved before directions reads as OUT', C.listConnections('eeva')[0].direction === 'out');

// --- the card
const k = C.knowsSummary(U);
check('card: name, facts and one item per known thing', k.name.length > 0 && k.facts.length === 4 && k.items.length === db.getCabinetEntries(U).filter((e) => e.status !== 'archived' && e.type !== 'blind_spot').length);
check('card: private things are never shareable', k.items.filter((i) => i.private).every((i) => !i.shareable));
check('card: works as = the profile occupation', k.facts.find((f) => f.label === 'Works as')?.value === 'Nurse');

// --- routes
const express = (await import('express')).default;
const { registerConnectionsRoutes } = await import('../src/server/connectionsRoutes.js');
const appx = express(); appx.use(express.json()); registerConnectionsRoutes(appx);
const server = appx.listen(0);
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const call = async (m: string, url: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(base + url, { method: m, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const made = await call('POST', '/api/connections', { userId: 'alex', appId: 'gemini', scopes: ['goal'] });
check('route: connect returns the key once', made.status === 201 && made.body.newKey?.key?.startsWith('cab_'));
check('route: key hash never sent to the browser', !JSON.stringify(made.body.connections).includes('keyHash'));
const id = made.body.newKey.connectionId;
const rd = await call('GET', `/api/connect/${id}`, undefined, { Authorization: `Bearer ${made.body.newKey.key}` });
check('route: the app reads with the key', rd.status === 200 && Array.isArray(rd.body.items), rd.body);
check('route: without the key it gets nothing', (await call('GET', `/api/connect/${id}`)).status === 401);
check('route: the card', (await call('GET', '/api/connections/knows?userId=alex')).body.items.length >= 0);
check('route: another customer cannot pause it', (await call('PATCH', `/api/connections/${id}`, { userId: 'lauri', status: 'paused' })).status === 404);
server.close();

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
