/**
 * Active connections (A2A / MCP concept demo): connect, change, pause, disconnect, custom apps,
 * and what a connected app would see (only ticked drawers, never private / unconfirmed / removed).
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

const { db } = await import('../src/server/db.js');
await db.init();
const C = await import('../src/server/connections.js');
const P = await import('../src/server/profile.js');
const U = 'lauri';

check('nothing connected at first', C.listConnections(U).length === 0);
check('catalog has assistants and tools', C.listApps(U).some((a) => a.id === 'claude' && a.kind === 'assistant') && C.listApps(U).some((a) => a.kind === 'tool'));
check('unknown app is refused', throws(() => C.connect(U, { appId: 'nope', protocol: 'mcp', scopes: ['goal'] }), 404));
check('a protocol the app does not offer is refused', throws(() => C.connect(U, { appId: 'chatgpt', protocol: 'a2a', scopes: ['goal'] }), 400));
check('no drawers ticked is refused', throws(() => C.connect(U, { appId: 'claude', protocol: 'mcp', scopes: [] }), 400));
check('unknown drawers are dropped (blind_spot, observation)', throws(() => C.connect(U, { appId: 'claude', protocol: 'mcp', scopes: ['blind_spot', 'observation'] }), 400));

const { connection: c1 } = C.connect(U, { appId: 'claude', protocol: 'mcp', scopes: ['goal', 'profile'] });
check('connect Claude over MCP', c1.status === 'active' && c1.protocol === 'mcp' && C.listConnections(U).length === 1);
const again = C.connect(U, { appId: 'claude', protocol: 'a2a', scopes: ['goal'] }).connection;
check('connecting again changes the same connection', again.id === c1.id && again.protocol === 'a2a' && C.listConnections(U).length === 1);

const sees = () => C.previewForConnection(U, C.listConnections(U)[0]);
check('it sees only goals that are active or stale', sees().length > 0 && sees().every((e) => e.type === 'goal' && ['active', 'stale'].includes(e.status)), sees().map((e) => [e.type, e.status]));
P.saveProfileField(U, { label: 'Occupation', value: 'Nurse' });
const priv = P.saveProfileField(U, { label: 'Health', value: 'Knee surgery', private: true });
C.updateConnection(U, c1.id, { scopes: ['profile'] });
check('profile scope: sees profile fields, not private ones', sees().some((e) => e.title === 'Occupation') && !sees().some((e) => e.id === priv.entry.id));
C.updateConnection(U, c1.id, { scopes: ['fact'] });
check('unconfirmed Nordea observations are never seen', !sees().some((e) => e.source === 'nordea' && !e.reviewed));
C.updateConnection(U, c1.id, { status: 'paused' });
check('paused sees nothing', sees().length === 0 && C.listConnections(U)[0].status === 'paused');
check('bad status refused', throws(() => C.updateConnection(U, c1.id, { status: 'on' }), 400));
check('empty scopes on change refused', throws(() => C.updateConnection(U, c1.id, { scopes: [] }), 400));
C.disconnect(U, c1.id);
check('disconnect', C.listConnections(U).length === 0);
check('connections are per customer', (C.listConnections('eeva').length === 0));

// own apps
check('custom app needs https', throws(() => C.addCustomApp(U, { name: 'X', protocol: 'mcp', endpoint: 'http://evil.example/mcp' }), 400));
check('custom app: no passwords in the address', throws(() => C.addCustomApp(U, { name: 'X', protocol: 'mcp', endpoint: 'https://u:p@x.example' }), 400));
check('custom app: needs a protocol', throws(() => C.addCustomApp(U, { name: 'X', protocol: 'ftp', endpoint: 'https://x.example' }), 400));
check('custom app: name taken by the catalog', throws(() => C.addCustomApp(U, { name: 'claude', protocol: 'mcp', endpoint: 'https://x.example' }), 409));
const { app } = C.addCustomApp(U, { name: 'My <b>budget</b> bot', protocol: ['mcp', 'a2a'], endpoint: 'https://bot.example/mcp', kind: 'assistant' });
check('custom app added, cleaned, both protocols', app.custom === true && !/[<>]/.test(app.name) && app.protocols.length === 2 && C.listApps(U).some((a) => a.id === app.id));
check('localhost http is allowed for testing', !!C.addCustomApp(U, { name: 'Local', protocol: 'mcp', endpoint: 'http://localhost:8080/mcp' }).app);
C.connect(U, { appId: app.id, protocol: 'a2a', scopes: ['goal'] });
C.removeCustomApp(U, app.id);
check('removing a custom app also removes its connection', !C.listApps(U).some((a) => a.id === app.id) && !C.listConnections(U).some((c) => c.appId === app.id));
check('built-in apps cannot be removed', throws(() => C.removeCustomApp(U, 'claude'), 404));
check('saved in the customer profile (survives reload)', (await db.reload(), C.listApps(U).some((a) => a.name === 'Local')));

// routes
const express = (await import('express')).default;
const { registerConnectionsRoutes } = await import('../src/server/connectionsRoutes.js');
const appx = express(); appx.use(express.json()); registerConnectionsRoutes(appx);
const server = appx.listen(0);
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const call = async (m: string, url: string, body?: unknown) => {
  const r = await fetch(base + url, { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
check('route: unknown customer 404', (await call('GET', '/api/connections?userId=nobody')).status === 404);
const made = await call('POST', '/api/connections', { userId: 'eeva', appId: 'gemini', protocol: 'a2a', scopes: ['goal'] });
check('route: connect returns the view with what it sees', made.status === 201 && made.body.connections[0].appId === 'gemini' && typeof made.body.connections[0].sees === 'number', made.body);
const cid = made.body.connections[0].id;
check('route: another customer cannot change it', (await call('PATCH', `/api/connections/${cid}`, { userId: 'lauri', status: 'paused' })).status === 404);
check('route: pause', (await call('PATCH', `/api/connections/${cid}`, { userId: 'eeva', status: 'paused' })).body.connections[0].sees === 0);
check('route: disconnect', (await call('DELETE', `/api/connections/${cid}?userId=eeva`)).body.connections.length === 0);
const own = await call('POST', '/api/connections/apps', { userId: 'eeva', name: 'Budget bot', protocol: ['mcp'], endpoint: 'https://b.example/mcp' });
check('route: add own app', own.status === 201 && own.body.apps.some((a: any) => a.name === 'Budget bot'));
server.close();

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
