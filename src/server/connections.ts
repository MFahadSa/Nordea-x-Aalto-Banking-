// Active connections: outside apps linked to the customer's cabinet. Two directions, never mixed:
//
//  OUT  AI assistants connected with Abel (Claude, Gemini, ChatGPT, Copilot, or your own). The main
//       way is IN: the profile the assistant already keeps about the customer comes to Abel's Profile
//       (pasted by the customer, or sent with the link and key) and is reviewed like a .md import.
//       Reading Abel back is optional and off unless the customer ticks drawers.
//       The cabinet is the server: the app connects to US with a link and a key we give the customer.
//       No address and no protocol question: the same link serves an MCP client or an A2A agent.
//       What the app gets is decided in code (the ticked drawers only; never private, removed,
//       disputed or unconfirmed entries; nothing while paused), and every read is logged.
//       The same link and key let the app SEND info back (if the customer allows it): that goes
//       through the airlock like any other input and waits for the customer.
//
//  IN   "Bring info in from a tool" (Calendar, Notion, Drive, Todoist, or your own address).
//       The tool is the server and Abel would connect to it. The protocol is read from the address,
//       not asked. Whatever arrives goes through the airlock (the input pipeline) and waits in
//       "Waiting for you": it never goes straight into the cabinet.
//
// Concept demo: Abel does not contact outside tools yet ("Try a sync" sends sample signals through
// the real airlock), and the OUT link is a simple JSON read endpoint, not a full MCP/A2A server.
import crypto from 'crypto';
import { db } from './db.js';
import { profileToMarkdown, READ_ONLY_MARK } from './profile.js';
import { ingest } from './pipeline/engine.js';
import { listCustomers } from './arch/store/common.js';
import type { ProfileInboxItem, AccessLogEntry, AppConnection, CabinetEntry, CabinetEntryType, ConnectableApp, ConnectionDirection, ConnectionProtocol } from '../types.js';

export const SCOPES: { type: CabinetEntryType; label: string }[] = [
  { type: 'profile', label: 'Profile' },
  { type: 'goal', label: 'Goals' },
  { type: 'life_event', label: 'Life events' },
  { type: 'preference', label: 'Preferences' },
  { type: 'fact', label: 'Money facts' },
];
const SCOPE_TYPES = new Set(SCOPES.map((s) => s.type));

/** Sample signals a tool would send, so a demo sync shows the airlock at work. */
const SAMPLE: Record<string, string[]> = {
  gcal: ['Calendar: "Move to the new flat" on 1 March 2027', 'Calendar: "Wedding" on 10 July 2027', 'Calendar: "Dentist" on Tuesday'],
  notion: ['Notion page "Plans 2027": save 300 € a month for the wedding', 'Notion page "Groceries": oat milk, bread'],
  gdrive: ['Drive file "Payslip October 2026.pdf": net pay 3 900 €', 'Drive file "Holiday photos" (412 images)'],
  todoist: ['Todoist task: "Open a savings account for the flat"', 'Todoist task: "Buy birthday card"'],
};

export const CATALOG: ConnectableApp[] = [
  { id: 'claude', name: 'Claude', kind: 'assistant', direction: 'out', description: 'AI assistant by Anthropic. Can use what you allow as context when you ask about money.', initials: 'Cl', color: '#C96442' },
  { id: 'gemini', name: 'Gemini', kind: 'assistant', direction: 'out', description: 'AI assistant by Google. Can ask Abel about what you allow.', initials: 'Ge', color: '#3B6FD8' },
  { id: 'chatgpt', name: 'ChatGPT', kind: 'assistant', direction: 'out', description: 'AI assistant by OpenAI. Can read what you allow as context.', initials: 'GP', color: '#10A37F' },
  { id: 'copilot', name: 'Microsoft Copilot', kind: 'assistant', direction: 'out', description: 'AI assistant by Microsoft. Can ask Abel about what you allow.', initials: 'Co', color: '#5B5FC7' },
  { id: 'gcal', name: 'Google Calendar', kind: 'tool', direction: 'in', protocol: 'mcp', description: 'Dates like a move or a trip, so goals line up.', initials: 'Ca', color: '#1A73E8' },
  { id: 'notion', name: 'Notion', kind: 'tool', direction: 'in', protocol: 'mcp', description: 'Your own notes and plans.', initials: 'No', color: '#37352F' },
  { id: 'gdrive', name: 'Google Drive', kind: 'tool', direction: 'in', protocol: 'mcp', description: 'Documents like payslips and contracts.', initials: 'Dr', color: '#188038' },
  { id: 'todoist', name: 'Todoist', kind: 'tool', direction: 'in', protocol: 'mcp', description: 'Tasks, like saving steps you plan to do.', initials: 'Td', color: '#E44332' },
];

const err = (status: number, message: string) => Object.assign(new Error(message), { status });
const now = () => new Date().toISOString();
const rid = (p: string) => `${p}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const clean = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function user(userId: string) {
  const u = db.getUser(userId);
  if (!u) throw err(404, 'Unknown customer');
  return u;
}

/** Older saved data (before directions) is read in the new shape. */
const normApp = (a: ConnectableApp & { protocols?: ConnectionProtocol[] }): ConnectableApp => {
  const direction: ConnectionDirection = a.direction ?? (a.endpoint ? 'in' : 'out');
  return { ...a, direction, kind: direction === 'in' ? 'tool' : 'assistant', ...(direction === 'in' && a.endpoint ? { protocol: detectProtocol(a.endpoint) } : {}) };
};
const normConn = (c: AppConnection): AppConnection => {
  const direction = c.direction ?? 'out';
  return { ...c, direction, scopes: c.scopes ?? [], ...(direction === 'out' ? { canSend: c.canSend !== false } : {}) };
};

export function listApps(userId: string): ConnectableApp[] {
  return [...CATALOG, ...(user(userId).customApps || []).map(normApp)];
}
export function listConnections(userId: string): AppConnection[] {
  return (user(userId).connections || []).map(normConn);
}
const save = (userId: string, connections: AppConnection[]) => db.updateUser(userId, { connections });

/**
 * The protocol, read from the address (the customer is never asked).
 * A2A agents publish a card at /.well-known/agent.json (or agent-card.json); MCP servers usually
 * sit at a /mcp or /sse path. Anything else is checked on the first real connection.
 */
export function detectProtocol(address: string): ConnectionProtocol | undefined {
  let path = '';
  try { const u = new URL(address); path = `${u.hostname}${u.pathname}`.toLowerCase(); } catch { return undefined; }
  if (/\/\.well-known\/agent(-card)?\.json$/.test(path) || /(^|[./-])a2a([./-]|$)/.test(path)) return 'a2a';
  if (/(^|[./-])mcp([./-]|$)/.test(path) || /\/sse\/?$/.test(path)) return 'mcp';
  return undefined;
}

function checkAddress(raw: unknown): string {
  const endpoint = clean(raw, 200);
  let url: URL;
  try { url = new URL(endpoint); } catch { throw err(400, 'The address must be a full link, like https://example.com/mcp'); }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw err(400, 'Use an https:// address (http:// only for localhost).');
  if (url.username || url.password) throw err(400, 'Don’t put a password in the address.');
  return url.toString();
}

const validScopes = (s: unknown): CabinetEntryType[] =>
  [...new Set((Array.isArray(s) ? s : []).map(String))].filter((t): t is CabinetEntryType => SCOPE_TYPES.has(t as CabinetEntryType));

/** A new key for an OUT connection. Only its hash and last 4 characters are kept; the key is shown once. */
function newKey() {
  const key = `cab_${crypto.randomBytes(24).toString('base64url')}`;
  return { key, keyHash: sha(key), keyHint: key.slice(-4) };
}

/** Connects an app. OUT returns the key once; IN needs nothing more (a custom IN app has its address). */
export function connect(userId: string, input: { appId: unknown; scopes?: unknown; canSend?: unknown }) {
  const app = listApps(userId).find((a) => a.id === input.appId);
  if (!app) throw err(404, 'That app is not in the list.');
  const list = listConnections(userId);
  if (list.some((c) => c.appId === app.id)) throw err(409, `${app.name} is already connected.`);
  const t = now();
  let conn: AppConnection;
  let key: string | undefined;
  if (app.direction === 'out') {
    const scopes = validScopes(input.scopes); // may be empty: then it reads nothing
    const k = newKey();
    key = k.key;
    conn = { id: rid('conn'), appId: app.id, direction: 'out', scopes, canSend: input.canSend !== false, status: 'active', keyHash: k.keyHash, keyHint: k.keyHint, createdAt: t, updatedAt: t };
  } else {
    conn = { id: rid('conn'), appId: app.id, direction: 'in', scopes: [], status: 'active', protocol: app.protocol, createdAt: t, updatedAt: t };
  }
  save(userId, [...list, conn]);
  return { connection: conn, app, key };
}

export function updateConnection(userId: string, id: string, input: { scopes?: unknown; status?: unknown; canSend?: unknown }) {
  const list = listConnections(userId);
  const old = list.find((c) => c.id === id);
  if (!old) throw err(404, 'Connection not found');
  const next: AppConnection = { ...old, updatedAt: now() };
  if (input.scopes !== undefined) {
    if (old.direction !== 'out') throw err(400, 'A tool that brings info in reads nothing from your cabinet.');
    next.scopes = validScopes(input.scopes);
  }
  if (input.canSend !== undefined) {
    if (old.direction !== 'out') throw err(400, 'Only apps connected with Abel can be allowed to send info.');
    next.canSend = !!input.canSend;
  }
  if (input.status !== undefined) {
    if (input.status !== 'active' && input.status !== 'paused') throw err(400, 'Status is active or paused.');
    next.status = input.status;
  }
  save(userId, list.map((c) => (c.id === id ? next : c)));
  return { connection: next };
}

/** A new key for an OUT connection; the old key stops working at once. */
export function rotateKey(userId: string, id: string) {
  const list = listConnections(userId);
  const old = list.find((c) => c.id === id);
  if (!old) throw err(404, 'Connection not found');
  if (old.direction !== 'out') throw err(400, 'Only apps that use what Abel knows have a key.');
  const k = newKey();
  const next = { ...old, keyHash: k.keyHash, keyHint: k.keyHint, updatedAt: now() };
  save(userId, list.map((c) => (c.id === id ? next : c)));
  return { connection: next, key: k.key };
}

export function disconnect(userId: string, id: string) {
  const list = listConnections(userId);
  if (!list.some((c) => c.id === id)) throw err(404, 'Connection not found');
  save(userId, list.filter((c) => c.id !== id));
  return { removed: id };
}

/** The customer adds an app: OUT needs just a name; IN needs the tool's address (protocol read from it). */
export function addCustomApp(userId: string, input: { name: unknown; direction: unknown; endpoint?: unknown; description?: unknown }) {
  const name = clean(input.name, 40);
  if (!name) throw err(400, 'Give it a name.');
  const direction = input.direction === 'in' ? 'in' : input.direction === 'out' ? 'out' : undefined;
  if (!direction) throw err(400, 'Choose what it does: use what Abel knows, or bring info in.');
  const endpoint = direction === 'in' ? checkAddress(input.endpoint) : undefined;
  const u = user(userId);
  const mine = u.customApps || [];
  if (mine.length >= 20) throw err(400, 'You can add up to 20 of your own apps.');
  if (listApps(userId).some((a) => a.name.toLowerCase() === name.toLowerCase())) throw err(409, `“${name}” is already in the list.`);
  const app: ConnectableApp = {
    id: rid('app'), name, direction, kind: direction === 'in' ? 'tool' : 'assistant',
    description: clean(input.description, 160) || 'Added by you.',
    initials: name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).replace(/^./, (c) => c.toUpperCase()) || '?',
    color: '#5E6278', custom: true,
    ...(endpoint ? { endpoint, protocol: detectProtocol(endpoint) } : {}),
  };
  db.updateUser(userId, { customApps: [...mine, app] });
  return { app };
}

export function removeCustomApp(userId: string, appId: string) {
  const u = user(userId);
  const mine = u.customApps || [];
  if (!mine.some((a) => a.id === appId)) throw err(404, 'Only apps you added yourself can be removed.');
  db.updateUser(userId, { customApps: mine.filter((a) => a.id !== appId), connections: (u.connections || []).filter((c) => c.appId !== appId) });
  return { removed: appId };
}

/** OUT: exactly what the app may see right now. IN: nothing (a tool reads nothing from the cabinet). */
export function previewForConnection(userId: string, conn: AppConnection): CabinetEntry[] {
  if (conn.direction !== 'out' || conn.status !== 'active') return [];
  const allowed = new Set(conn.scopes);
  return db.getCabinetEntries(userId).filter((e) =>
    allowed.has(e.type) && !e.private && (e.status === 'active' || e.status === 'stale') && !(e.source === 'nordea' && !e.reviewed),
  );
}

/**
 * OUT read, as the outside app would call it: connection id + key. Fails closed (unknown id, wrong
 * key, paused, IN connection: nothing). Every successful read is logged where "Who sees it" shows reads.
 */
/** The key decides everything: which customer, which connection. Fails closed. */
function byKey(connId: string, key: string) {
  const denied = () => err(401, 'Unknown connection or wrong key');
  if (!/^conn-[a-z0-9]+$/i.test(connId) || !key.startsWith('cab_')) throw denied();
  const ownerId = listCustomers().find((uid) => (db.getUser(uid)?.connections || []).some((c) => c.id === connId));
  const owner = ownerId ? db.getUser(ownerId) : undefined;
  const conn = owner && listConnections(owner.id).find((c) => c.id === connId);
  if (!owner || !conn || conn.direction !== 'out' || !conn.keyHash) throw denied();
  const a = Buffer.from(sha(key), 'hex'), b = Buffer.from(conn.keyHash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw denied();
  if (conn.status !== 'active') throw err(403, 'This connection is paused by the customer.');
  return { owner, conn, app: listApps(owner.id).find((x) => x.id === conn.appId)! };
}

/**
 * The app sends info back (the second way of a two-way connection). Nothing goes into the cabinet:
 * the text is untrusted input and goes through the airlock, then waits for the customer.
 */
export async function sendWithKey(connId: string, key: string, raw: unknown, profile?: unknown) {
  const { owner, conn, app } = byKey(connId, key);
  if (!conn.canSend) throw err(403, 'The customer has not allowed this app to send info.');
  if (typeof profile === 'string' && profile.trim()) {
    const item = addToInbox(owner.id, app, profile);
    save(owner.id, listConnections(owner.id).map((c) => (c.id === connId ? { ...c, lastUsedAt: now() } : c)));
    return { app, heard: 1, waiting: 1, inboxId: item.id };
  }
  const list = (Array.isArray(raw) ? raw : [raw]).map((t) => clean(typeof t === 'object' && t ? (t as any).text : t, 500)).filter(Boolean).slice(0, 20);
  if (!list.length) throw err(400, 'Send { "items": [{ "text": "…" }] } with at least one text.');
  const r = await ingest(owner.id, 'cloud', { signals: list.map((text) => ({ text, kind: `from ${app.name}` })), label: `From ${app.name}` });
  save(owner.id, listConnections(owner.id).map((c) => (c.id === connId ? { ...c, lastUsedAt: now() } : c)));
  return { app, heard: list.length, waiting: r.candidates.length };
}

export function readWithKey(connId: string, key: string): { app: ConnectableApp; entries: CabinetEntry[]; userId: string } {
  const { owner, conn, app } = byKey(connId, key);
  if (!conn.scopes.length) throw err(403, 'The customer has not allowed this app to read anything.');
  const entries = previewForConnection(owner.id, conn);
  const log: AccessLogEntry = {
    id: `log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`, timestamp: now(), userId: owner.id,
    agentId: `conn:${app.id}`, agentName: app.name, purpose: `Connected app read (${conn.scopes.join(', ')})`,
    itemsReadCount: entries.length, blockedCount: 0, allowedItems: entries.map((e) => e.title), allowedIds: entries.map((e) => e.id), blockedReasons: [],
  };
  db.addAccessLogEntry(log);
  save(owner.id, listConnections(owner.id).map((c) => (c.id === connId ? { ...c, lastUsedAt: log.timestamp } : c)));
  return { app, entries, userId: owner.id };
}

/** IN, demo: sends the tool's sample signals through the real airlock. They wait for the customer. */
export async function trySync(userId: string, id: string) {
  const conn = listConnections(userId).find((c) => c.id === id);
  if (!conn) throw err(404, 'Connection not found');
  if (conn.direction === 'out' && !conn.canSend) throw err(400, 'Allow it to send info first.');
  if (conn.status !== 'active') throw err(400, 'Resume the connection first.');
  const app = listApps(userId).find((a) => a.id === conn.appId)!;
  if (conn.direction === 'out') {
    // Demo: what an assistant would send when asked with PROFILE_PROMPT. It waits in Profile for review.
    const sample = [
      `# What ${app.name} remembers about you`, '',
      '## About me', '- City: Espoo', '- Languages: Finnish, English', '',
      '## Work & income', '- Occupation: Nurse at a hospital', '- Works night shifts: Yes', '',
      '## Plans & goals', 'You want to buy a flat with your partner in about two years and are thinking about a trip to Japan.', '',
      '## Preferences', '- Communication: Short answers, no jargon', '- Risk: Prefers low-risk savings',
    ].join('\n');
    addToInbox(userId, app, sample);
    save(userId, listConnections(userId).map((c) => (c.id === id ? { ...c, lastUsedAt: now() } : c)));
    return { waiting: 1, heard: 1, profile: true };
  }
  const texts = SAMPLE[app.id] || [`${app.name}: "Saving for a new laptop, about 1 200 € by summer"`, `${app.name}: "Weekly team meeting"`];
  const r = await ingest(userId, 'cloud', { signals: texts.map((text) => ({ text, kind: `from ${app.name}` })), label: `From ${app.name} (sample)` });
  save(userId, listConnections(userId).map((c) => (c.id === id ? { ...c, lastUsedAt: now() } : c)));
  return { waiting: r.candidates.length, heard: texts.length, profile: false };
}

const TYPE_LABEL: Partial<Record<CabinetEntryType, string>> = { profile: 'Profile', goal: 'Goals', life_event: 'Life events', preference: 'Preferences', fact: 'Money facts', observation: 'Nordea noticed' };

/**
 * "What Abel knows about you", for the card shown when a connection starts: a few headline facts and
 * one square per thing in the cabinet. `shareable` uses the same rule as previewForConnection, so the
 * card can show exactly which squares a connection with the ticked drawers would see.
 */
export function knowsSummary(userId: string) {
  const u = user(userId);
  const entries = db.getCabinetEntries(userId).filter((e) => e.status !== 'archived' && e.type !== 'blind_spot');
  const prof = (k: string) => entries.find((e) => e.type === 'profile' && e.profileKey === k)?.detail;
  const goals = entries.filter((e) => e.type === 'goal' && e.status !== 'disputed');
  const top = goals.filter((g) => g.target).sort((a, b) => (b.target!.amount - a.target!.amount))[0] || goals[0];
  return {
    name: prof('name') || u.name,
    age: Number(prof('age')) || u.age || undefined,
    customerSince: entries.map((e) => e.createdAt).sort()[0]?.slice(0, 4),
    facts: [
      { label: 'Works as', value: prof('occupation') || '—' },
      { label: 'Lives in', value: prof('location') || '—' },
      { label: 'Saving for', value: top ? top.title : '—' },
      { label: 'Goals', value: String(goals.length) },
    ],
    items: entries.map((e) => ({
      id: e.id, type: e.type, title: e.title, detail: e.detail, label: TYPE_LABEL[e.type] || e.type,
      private: e.private, fromNordea: e.source === 'nordea', source: e.source, status: e.status, why: e.why,
      at: (e.updatedAt || e.createdAt).slice(0, 10), reviewed: e.reviewed, offers: !!e.readableBy?.offers,
      abelUses: e.readableBy?.abel !== false && (e.status === 'active' || e.status === 'stale') && !(e.source === 'nordea' && !e.reviewed),
      shareable: !e.private && (e.status === 'active' || e.status === 'stale') && !(e.source === 'nordea' && !e.reviewed) && SCOPE_TYPES.has(e.type),
    })),
  };
}

// ---------- Profiles an assistant sent (waiting for the customer in Profile) ----------
const MAX_PROFILE_TEXT = 50_000;

function addToInbox(userId: string, app: ConnectableApp, text: string): ProfileInboxItem {
  const t = String(text).replace(/\r\n?/g, '\n').slice(0, MAX_PROFILE_TEXT);
  const item: ProfileInboxItem = { id: rid('inbox'), appId: app.id, from: app.name, text: t, at: now() };
  const inbox = (user(userId).profileInbox || []).filter((x) => x.appId !== app.id); // the newest per app replaces the older one
  db.updateUser(userId, { profileInbox: [...inbox, item].slice(-10) });
  return item;
}
export const listInbox = (userId: string): ProfileInboxItem[] => user(userId).profileInbox || [];
export function dropInbox(userId: string, id: string) {
  const inbox = listInbox(userId);
  if (!inbox.some((x) => x.id === id)) throw err(404, 'Not found');
  db.updateUser(userId, { profileInbox: inbox.filter((x) => x.id !== id) });
  return { removed: id };
}

/** What the customer copies into the assistant so it writes its memory of them in a shape Abel reads. */
export const PROFILE_PROMPT = [
  'Write down what you remember about me that would help my bank assistant (Abel, Nordea) help me with money.',
  'Use Markdown: "## " for sections (About me, Work & income, Home & family, Plans & goals, Preferences),',
  '"- Name: value" lines for facts, and a short paragraph for anything else.',
  'Only include what I actually told you; don\'t guess. Leave out health details and anything I shared in confidence.',
].join(' ');

/** Everything Abel knows, as one Markdown file. The Profile part is editable (read back through the
 *  import preview); everything after READ_ONLY_MARK is for reading only and is changed in the list. */
export function knowsMarkdown(userId: string): string {
  const k = knowsSummary(userId);
  const groups: [string, (i: (typeof k.items)[number]) => boolean][] = [
    ['Goals', (i) => i.type === 'goal'], ['Life events', (i) => i.type === 'life_event'], ['Preferences', (i) => i.type === 'preference'],
    ['Money facts', (i) => i.type === 'fact'], ['Nordea noticed', (i) => i.type === 'observation'],
  ];
  const tag = (i: (typeof k.items)[number]) => [i.fromNordea ? 'Nordea noticed' : i.source === 'document' ? 'from a file' : 'you told us', i.private ? 'private' : '', !i.abelUses ? 'not used' : '', i.at].filter(Boolean).join(' · ');
  const out = [profileToMarkdown(userId).replace(/^# My profile/, `# What Abel knows about ${k.name}`).trimEnd(), '', READ_ONLY_MARK,
    '<!-- Below: the rest of what Abel knows. Change these in the list, not here. -->', ''];
  for (const [name, has] of groups) {
    const items = k.items.filter(has);
    if (!items.length) continue;
    out.push(`## ${name}`, '');
    for (const i of items) out.push(`- ${i.title}${i.detail ? ` — ${i.detail}` : ''} _(${tag(i)})_`);
    out.push('');
  }
  return out.join('\n');
}
