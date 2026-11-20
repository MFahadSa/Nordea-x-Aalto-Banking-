// Active connections: outside apps (AI assistants like Claude or Gemini, and tools like a calendar)
// that the customer links to their cabinet over A2A (agent-to-agent) or MCP (Model Context Protocol).
//
// Concept demo: a connection records the customer's choice (app, protocol, what it may read) and
// shows exactly what that app would see. No data leaves the app and no outside call is made yet.
// The rules for what an app may see are enforced here in code, never by a model:
//   - only the drawers the customer ticked,
//   - never private entries, never removed, disputed or unconfirmed ones,
//   - a paused connection sees nothing.
import { db } from './db.js';
import type { AppConnection, CabinetEntry, CabinetEntryType, ConnectableApp, ConnectionProtocol } from '../types.js';

/** The drawers a connection can be given. Blind spots and raw observations are never offered. */
export const SCOPES: { type: CabinetEntryType; label: string }[] = [
  { type: 'profile', label: 'Profile' },
  { type: 'goal', label: 'Goals' },
  { type: 'life_event', label: 'Life events' },
  { type: 'preference', label: 'Preferences' },
  { type: 'fact', label: 'Money facts' },
];
const SCOPE_TYPES = new Set(SCOPES.map((s) => s.type));

/** Built-in list. Names are plain text with initials (no logos); protocols shown are what this demo offers. */
export const CATALOG: ConnectableApp[] = [
  { id: 'claude', name: 'Claude', kind: 'assistant', description: 'AI assistant by Anthropic. Can use your cabinet as context when you ask about money.', protocols: ['mcp', 'a2a'], initials: 'Cl', color: '#C96442' },
  { id: 'gemini', name: 'Gemini', kind: 'assistant', description: 'AI assistant by Google. Can ask Abel questions on your behalf.', protocols: ['a2a', 'mcp'], initials: 'Ge', color: '#3B6FD8' },
  { id: 'chatgpt', name: 'ChatGPT', kind: 'assistant', description: 'AI assistant by OpenAI. Can read what you allow as context.', protocols: ['mcp'], initials: 'GP', color: '#10A37F' },
  { id: 'copilot', name: 'Microsoft Copilot', kind: 'assistant', description: 'AI assistant by Microsoft. Can work with Abel agent to agent.', protocols: ['a2a', 'mcp'], initials: 'Co', color: '#5B5FC7' },
  { id: 'gcal', name: 'Google Calendar', kind: 'tool', description: 'Lets Abel see dates like a move or a trip, so goals line up.', protocols: ['mcp'], initials: 'Ca', color: '#1A73E8' },
  { id: 'notion', name: 'Notion', kind: 'tool', description: 'Your own notes and plans, readable as profile context.', protocols: ['mcp'], initials: 'No', color: '#37352F' },
  { id: 'gdrive', name: 'Google Drive', kind: 'tool', description: 'Pick documents (payslips, contracts) for Abel to read.', protocols: ['mcp'], initials: 'Dr', color: '#188038' },
  { id: 'todoist', name: 'Todoist', kind: 'tool', description: 'Turns saving steps into tasks you can tick off.', protocols: ['mcp'], initials: 'Td', color: '#E44332' },
];

const err = (status: number, message: string) => Object.assign(new Error(message), { status });
const now = () => new Date().toISOString();
const rid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clean = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

function user(userId: string) {
  const u = db.getUser(userId);
  if (!u) throw err(404, 'Unknown customer');
  return u;
}

export function listApps(userId: string): ConnectableApp[] {
  return [...CATALOG, ...(user(userId).customApps || [])];
}

export function listConnections(userId: string): AppConnection[] {
  return user(userId).connections || [];
}

function save(userId: string, connections: AppConnection[]) {
  db.updateUser(userId, { connections });
}

const validScopes = (s: unknown): CabinetEntryType[] =>
  [...new Set((Array.isArray(s) ? s : []).map(String))].filter((t): t is CabinetEntryType => SCOPE_TYPES.has(t as CabinetEntryType));

const validProtocol = (p: unknown): ConnectionProtocol | undefined => (p === 'a2a' || p === 'mcp' ? p : undefined);

/** Connects an app (or changes the protocol and drawers of an existing connection to it). */
export function connect(userId: string, input: { appId: unknown; protocol: unknown; scopes: unknown }) {
  const app = listApps(userId).find((a) => a.id === input.appId);
  if (!app) throw err(404, 'That app is not in the list.');
  const protocol = validProtocol(input.protocol);
  if (!protocol || !app.protocols.includes(protocol)) throw err(400, `${app.name} connects over ${app.protocols.map((p) => p.toUpperCase()).join(' or ')}.`);
  const scopes = validScopes(input.scopes);
  if (!scopes.length) throw err(400, 'Choose at least one thing it may read.');
  const list = listConnections(userId);
  const t = now();
  const existing = list.find((c) => c.appId === app.id);
  const conn: AppConnection = existing
    ? { ...existing, protocol, scopes, status: 'active', updatedAt: t }
    : { id: rid('conn'), appId: app.id, protocol, scopes, status: 'active', createdAt: t, updatedAt: t };
  save(userId, existing ? list.map((c) => (c.id === conn.id ? conn : c)) : [...list, conn]);
  return { connection: conn, app };
}

export function updateConnection(userId: string, id: string, input: { scopes?: unknown; status?: unknown; protocol?: unknown }) {
  const list = listConnections(userId);
  const old = list.find((c) => c.id === id);
  if (!old) throw err(404, 'Connection not found');
  const next: AppConnection = { ...old, updatedAt: now() };
  if (input.scopes !== undefined) {
    const s = validScopes(input.scopes);
    if (!s.length) throw err(400, 'Choose at least one thing it may read, or pause the connection.');
    next.scopes = s;
  }
  if (input.status !== undefined) {
    if (input.status !== 'active' && input.status !== 'paused') throw err(400, 'Status is active or paused.');
    next.status = input.status;
  }
  if (input.protocol !== undefined) {
    const app = listApps(userId).find((a) => a.id === old.appId);
    const p = validProtocol(input.protocol);
    if (!p || !app?.protocols.includes(p)) throw err(400, 'That app does not connect over this protocol.');
    next.protocol = p;
  }
  save(userId, list.map((c) => (c.id === id ? next : c)));
  return { connection: next };
}

export function disconnect(userId: string, id: string) {
  const list = listConnections(userId);
  if (!list.some((c) => c.id === id)) throw err(404, 'Connection not found');
  save(userId, list.filter((c) => c.id !== id));
  return { removed: id };
}

/** The customer adds an app that is not in the list: a name, the protocol(s) and its address. */
export function addCustomApp(userId: string, input: { name: unknown; protocol: unknown; endpoint: unknown; description?: unknown; kind?: unknown }) {
  const name = clean(input.name, 40);
  if (!name) throw err(400, 'Give it a name.');
  const protocols = (Array.isArray(input.protocol) ? input.protocol : [input.protocol]).map(validProtocol).filter(Boolean) as ConnectionProtocol[];
  if (!protocols.length) throw err(400, 'Choose A2A or MCP.');
  const endpoint = clean(input.endpoint, 200);
  let url: URL;
  try { url = new URL(endpoint); } catch { throw err(400, 'The address must be a full link, like https://example.com/mcp'); }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw err(400, 'Use an https:// address (http:// only for localhost).');
  if (url.username || url.password) throw err(400, 'Don’t put a password in the address.');
  const u = user(userId);
  const mine = u.customApps || [];
  if (mine.length >= 20) throw err(400, 'You can add up to 20 of your own apps.');
  if ([...CATALOG, ...mine].some((a) => a.name.toLowerCase() === name.toLowerCase())) throw err(409, `“${name}” is already in the list.`);
  const app: ConnectableApp = {
    id: rid('app'), name, kind: input.kind === 'assistant' ? 'assistant' : 'tool',
    description: clean(input.description, 160) || 'Added by you.',
    protocols: [...new Set(protocols)], initials: name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).replace(/^./, (c) => c.toUpperCase()) || '?',
    color: '#5E6278', custom: true, endpoint: url.toString(),
  };
  db.updateUser(userId, { customApps: [...mine, app] });
  return { app };
}

/** Removes an app the customer added (and its connection, if any). */
export function removeCustomApp(userId: string, appId: string) {
  const u = user(userId);
  const mine = u.customApps || [];
  if (!mine.some((a) => a.id === appId)) throw err(404, 'Only apps you added yourself can be removed.');
  db.updateUser(userId, { customApps: mine.filter((a) => a.id !== appId), connections: (u.connections || []).filter((c) => c.appId !== appId) });
  return { removed: appId };
}

/** Exactly what a connected app would see right now. The same rules a real connection would use. */
export function previewForConnection(userId: string, conn: AppConnection): CabinetEntry[] {
  if (conn.status !== 'active') return [];
  const allowed = new Set(conn.scopes);
  return db.getCabinetEntries(userId).filter((e) =>
    allowed.has(e.type) &&
    !e.private &&
    (e.status === 'active' || e.status === 'stale') &&
    // Something Nordea noticed counts only once the customer confirmed it.
    !(e.source === 'nordea' && !e.reviewed) &&
    e.readableBy?.[`conn:${conn.appId}`] !== false,
  );
}
