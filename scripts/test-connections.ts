/**
 * Active connections, inflow only (concept demo):
 *  Assistants: their profile of the customer comes in (pasted, or sent with link + key) and waits for review.
 *              They never read the cabinet.
 *  Tools:      protocol read from the address; a sync goes through the airlock and waits for the customer.
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

// --- assistants: inflow only
const out = C.connect(U, { appId: 'claude', scopes: ['goal', 'profile'] } as any);
check('assistant connect returns a key once; only hash + hint stored', !!out.key && out.key.startsWith('cab_') && out.connection.keyHash !== out.key && out.connection.keyHint === out.key!.slice(-4) && !JSON.stringify(db.getUser(U)).includes(out.key!));
check('asking for read permissions is ignored: it reads nothing', out.connection.scopes.length === 0);
check('connecting the same app twice is refused', throws(() => C.connect(U, { appId: 'claude' }), 409));
check('there is no read function any more', !('readWithKey' in C) && !('previewForConnection' in C));
const before0 = P.getProfileEntries(U).length;
let wrong = false; try { await C.sendWithKey(out.connection.id, 'cab_wrong', undefined, '- City: X'); } catch (e: any) { wrong = e.status === 401; }
check('send with a wrong key is refused', wrong);
C.updateConnection(U, out.connection.id, { status: 'paused' });
let paused = false; try { await C.sendWithKey(out.connection.id, out.key!, undefined, '- City: X'); } catch (e: any) { paused = e.status === 403; }
check('paused: send refused', paused && P.getProfileEntries(U).length === before0);
C.updateConnection(U, out.connection.id, { status: 'active' });
const rot = C.rotateKey(U, out.connection.id);
let old = false; try { await C.sendWithKey(out.connection.id, out.key!, undefined, '- City: X'); } catch (e: any) { old = e.status === 401; }
check('new key: old key stops working, new one works', old && (await C.sendWithKey(out.connection.id, rot.key, undefined, '- City: Y')).waiting === 1);
C.dropInbox(U, C.listInbox(U)[0].id);
P.saveProfileField(U, { label: 'Occupation', value: 'Nurse' });
P.saveProfileField(U, { label: 'Health', value: 'Knee surgery', private: true });

// --- the main way: the assistant's profile comes IN to Abel (pasted or sent), and waits for review
const g = C.connect(U, { appId: 'gemini' });
check('an assistant connects to send, not to read', g.connection.scopes.length === 0 && g.connection.canSend === true);
const sent = await C.sendWithKey(g.connection.id, g.key!, undefined, '## About me\n- City: Espoo\n- Occupation: Nurse');
check('a sent profile waits in the inbox, nothing saved yet', sent.waiting === 1 && C.listInbox(U).length === 1 && C.listInbox(U)[0].from === 'Gemini' && !P.getProfileEntries(U).some((e) => e.detail === 'Espoo'));
await C.sendWithKey(g.connection.id, g.key!, undefined, '- City: Helsinki');
check('a newer profile from the same app replaces the older one', C.listInbox(U).length === 1 && C.listInbox(U)[0].text.includes('Helsinki'));
C.updateConnection(U, g.connection.id, { canSend: false });
let sendOff = false; try { await C.sendWithKey(g.connection.id, g.key!, undefined, '- City: X'); } catch (e: any) { sendOff = e.status === 403; }
check('sending off: refused', sendOff);
C.dropInbox(U, C.listInbox(U)[0].id);
check('dismiss empties the inbox', C.listInbox(U).length === 0);
C.updateConnection(U, g.connection.id, { canSend: true });
const demo = await C.trySync(U, g.connection.id);
check('demo: the assistant "sends" a sample profile to the inbox', demo.profile === true && C.listInbox(U).length === 1 && P.parseProfileMarkdown(C.listInbox(U)[0].text).length >= 4);
check('the question to copy into the assistant asks for Markdown and no guessing', /Markdown/.test(C.PROFILE_PROMPT) && /guess/.test(C.PROFILE_PROMPT));

// --- the full .md view
const md = C.knowsMarkdown(U);
check('.md view: profile first, then a read-only part with the rest', md.indexOf('## ') < md.indexOf(P.READ_ONLY_MARK) && /## Goals/.test(md.split(P.READ_ONLY_MARK)[1]));
const back = P.parseProfileMarkdown(md);
check('.md view read back: only the profile part counts (no goals become profile fields)', back.every((f) => !/Buy a flat|Japan/.test(f.value)) && P.previewProfileImport(U, back).every((i) => i.action === 'same'), P.previewProfileImport(U, back).filter((i) => i.action !== 'same'));
check('card items say where each came from and whether Abel uses it', C.knowsSummary(U).items.every((i) => typeof i.abelUses === 'boolean' && i.at.length === 10 && !!i.source));

// --- IN
const inn = C.connect(U, { appId: 'gcal' });
check('IN connect needs no drawers and gets no key', inn.connection.direction === 'in' && !inn.key && inn.connection.protocol === 'mcp');
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
check('a connection saved before (with read permissions) reads as an assistant that reads nothing', C.listConnections('eeva')[0].direction === 'out' && C.listConnections('eeva')[0].scopes.length === 0);

// --- the card
const k = C.knowsSummary(U);
check('card: name, facts and one item per known thing', k.name.length > 0 && k.facts.length === 4 && k.items.length === db.getCabinetEntries(U).filter((e) => e.status !== 'archived' && e.type !== 'blind_spot').length);
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
const made = await call('POST', '/api/connections', { userId: 'alex', appId: 'gemini' });
check('route: connect returns the key once', made.status === 201 && made.body.newKey?.key?.startsWith('cab_'));
check('route: key hash never sent to the browser', !JSON.stringify(made.body.connections).includes('keyHash'));
const id = made.body.newKey.connectionId;
const auth = { Authorization: `Bearer ${made.body.newKey.key}` };
check('route: reading the cabinet is not possible (no GET)', (await fetch(`${base}/api/connect/${id}`, { headers: auth })).status === 404);
const snd = await call('POST', `/api/connect/${id}`, { profile: '## About me\n- City: Turku' }, auth);
check('route: the assistant sends its profile; it waits for review', snd.status === 202 && (await call('GET', '/api/profile/inbox?userId=alex')).body.items.length === 1, snd.body);
check('route: without the key nothing is accepted', (await call('POST', `/api/connect/${id}`, { profile: '- City: X' })).status === 401);
check('route: another customer cannot pause it', (await call('PATCH', `/api/connections/${id}`, { userId: 'lauri', status: 'paused' })).status === 404);
const kmd = await fetch(`${base}/api/knows.md?userId=alex`);
check('route: the .md view', kmd.status === 200 && (await kmd.text()).includes('<!-- abel:read-only -->'));
server.close();

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
