import fs from 'fs';
import path from 'path';
import {
  User,
  CabinetEntry,
  Transaction,
  ChatMessage,
  AccessLogEntry,
  TopicLogEntry,
  UndoRecord,
  Conversation,
  Earning,
  Share,
  StoredDocument,
  EntryEvent,
  DataReward,
  BalanceSnapshot,
  ImportBatch,
  BankAccount,
} from '../types.js';
import { Remote, Row, supabaseConfigured, supabaseRemote, cleanErr } from './store.js';

const DATA_DIR = process.env.CABINET_DATA_DIR ? path.resolve(process.env.CABINET_DATA_DIR) : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'cabinet-db.json');

export interface DatabaseState {
  users: Record<string, User>;
  cabinetEntries: CabinetEntry[];
  transactions: Transaction[];
  messages: ChatMessage[];
  accessLog: AccessLogEntry[];
  topicLog: TopicLogEntry[];
  undoRecords: UndoRecord[];
  conversations: Conversation[];
  earnings: Earning[];
  shares: Share[];
  documents: StoredDocument[];
  entryHistory: EntryEvent[];
  dataRewards: DataReward[];
  balanceSnapshots: BalanceSnapshot[];
  importBatches: ImportBatch[];
  bankAccounts: BankAccount[];
}

/** Who changed something in What Abel knows, and where. Recorded in the entry's history. */
export interface ChangeMeta {
  by?: EntryEvent['by'];
  how?: string;
  action?: EntryEvent['action'];
}

/** The fields whose changes are worth showing in an entry's history. */
const TRACKED: (keyof CabinetEntry)[] = ['title', 'detail', 'status', 'private', 'target', 'readableBy', 'reviewed'];
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
let seq = 0;
const eventId = () => `ev-${Date.now()}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** History for entries that existed before history was kept (the seed, or an older saved database). */
function historyFor(entries: CabinetEntry[]): EntryEvent[] {
  const out: EntryEvent[] = [];
  for (const e of entries) {
    out.push({ id: `ev-seed-${e.id}-a`, entryId: e.id, userId: e.userId, at: e.createdAt, action: 'added', by: e.source === 'nordea' ? 'nordea' : 'you', how: e.source === 'nordea' ? 'Noticed in your transactions' : e.source === 'document' ? 'From a document' : 'In the app', title: e.title });
    if (e.confirmedAt && e.confirmedAt !== e.createdAt) out.push({ id: `ev-seed-${e.id}-c`, entryId: e.id, userId: e.userId, at: e.confirmedAt, action: 'confirmed', by: 'you', how: 'You said it’s still right', title: e.title });
  }
  return out;
}

/** Each kind of record and how it's keyed. Users are a map, the rest are lists. */
const LISTS = ['cabinetEntries', 'transactions', 'messages', 'accessLog', 'topicLog', 'undoRecords', 'conversations', 'earnings', 'shares', 'documents', 'entryHistory', 'dataRewards', 'balanceSnapshots', 'importBatches', 'bankAccounts'] as const;
type ListKind = (typeof LISTS)[number];
const keyOf = (kind: ListKind, x: any): string => (kind === 'undoRecords' ? x.undoToken : x.id);
// Rows come back unordered, so restore the order the app expects.
const ORDER: Record<ListKind, { field: string; desc?: boolean }> = {
  cabinetEntries: { field: 'createdAt' },
  transactions: { field: 'date' },
  messages: { field: 'createdAt' },
  accessLog: { field: 'timestamp', desc: true },
  topicLog: { field: 'timestamp', desc: true },
  undoRecords: { field: 'timestamp' },
  conversations: { field: 'createdAt' },
  earnings: { field: 'createdAt' },
  shares: { field: 'createdAt' },
  documents: { field: 'createdAt' },
  entryHistory: { field: 'at' },
  dataRewards: { field: 'at' },
  balanceSnapshots: { field: 'at' },
  importBatches: { field: 'at' },
  bankAccounts: { field: 'id' },
};

function toRows(state: DatabaseState): Row[] {
  const rows: Row[] = Object.values(state.users).map((u) => ({ kind: 'users', id: u.id, user_id: u.id, data: u }));
  for (const kind of LISTS) for (const x of state[kind] as any[]) rows.push({ kind, id: keyOf(kind, x), user_id: x.userId ?? null, data: x });
  return rows;
}

function fromRows(rows: Row[]): DatabaseState {
  const st: any = { users: {} };
  LISTS.forEach((k) => (st[k] = []));
  for (const r of rows) {
    if (r.kind === 'users') st.users[r.id] = r.data;
    else if (st[r.kind]) st[r.kind].push(r.data);
  }
  for (const k of LISTS) {
    const { field, desc } = ORDER[k];
    st[k].sort((a: any, b: any) => String(a[field] || '').localeCompare(String(b[field] || '')) * (desc ? -1 : 1));
  }
  return st as DatabaseState;
}

export interface DbStatus {
  mode: 'supabase' | 'file' | 'memory';
  ok: boolean;
  message: string;
  lastSavedAt?: string;
  lastError?: { at: string; message: string };
  rows?: number;
  waiting: number;
}

function getEmptyState(): DatabaseState {
  return {
    users: {},
    cabinetEntries: [],
    transactions: [],
    messages: [],
    accessLog: [],
    topicLog: [],
    undoRecords: [],
    conversations: [],
    earnings: [],
    shares: [],
    documents: [],
    entryHistory: [],
    dataRewards: [],
    balanceSnapshots: [],
    importBatches: [],
    bankAccounts: [],
  };
}

/**
 * Fills in what loaded data may leave out: older saved databases miss the v14 tables, and data loaded
 * from outside (scripts/load_data.py) may come without users' lists or without history for its entries.
 */
function migrate(state: DatabaseState): DatabaseState {
  const empty = getEmptyState();
  for (const k of Object.keys(empty) as (keyof DatabaseState)[]) (state as any)[k] = state[k] || empty[k];
  const known = new Set(state.entryHistory.map((h) => h.entryId));
  state.entryHistory.push(...historyFor(state.cabinetEntries.filter((e) => !known.has(e.id))));
  // Explicit account records, derived from what the customer record already knows. Nothing invented:
  // iban comes from the existing accounts, currency/type stay unset until a feed supplies them.
  for (const u of Object.values(state.users || {})) {
    for (const key of ['current', 'savings', 'carFund'] as const) {
      const a = (u.accounts as any)?.[key];
      if (!a) continue;
      const id = `acc-${u.id}-${key}`;
      const existing = state.bankAccounts.find((x) => x.id === id);
      if (existing) { if (a.iban && !existing.iban) existing.iban = a.iban; }
      else state.bankAccounts.push({ id, userId: u.id, key, iban: a.iban || undefined });
    }
  }
  return state;
}

class Database {
  private state: DatabaseState;
  private remote: Remote | null = null;
  /** What Supabase has, as JSON per record, so only changed records are sent. */
  private synced = new Map<string, string>();
  private chain: Promise<void> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;
  private st: DbStatus = { mode: 'file', ok: true, message: 'Saved on this server only. It resets when the app restarts.', waiting: 0 };
  /** Supabase is set up but couldn't be reached: keep changes in memory only, so no stale local copy appears. */
  private memoryOnly = false;

  // Nothing is preloaded: the app starts with no data until init() reads what was loaded on purpose.
  constructor() {
    this.state = getEmptyState();
  }

  /**
   * Read the data. Called once before the server starts (and by reload()).
   * With Supabase set up, only Supabase counts: an empty table means an empty app.
   * Without it, the local file data/cabinet-db.json (written by this app, never shipped with it).
   * Load data with scripts/load_data.py.
   */
  public async init() {
    this.synced.clear();
    if (!supabaseConfigured()) {
      this.state = this.loadFile();
      console.log(`Database: local file (${Object.keys(this.state.users).length} customers)`);
      return;
    }
    const remote = supabaseRemote();
    try {
      const rows = await remote.loadAll();
      this.remote = remote;
      this.memoryOnly = false;
      this.state = migrate(fromRows(rows));
      rows.forEach((r) => this.synced.set(`${r.kind}:${r.id}`, JSON.stringify(r.data)));
      await this.flush();
      this.st = { ...this.st, mode: 'supabase', ok: !this.st.lastError, message: rows.length ? 'Saved in Supabase' : 'Supabase is empty. Load data with scripts/load_data.py.', rows: this.synced.size };
      console.log(`Database: Supabase (${this.synced.size} records)`);
    } catch (err) {
      this.remote = null;
      this.memoryOnly = true;
      this.state = getEmptyState();
      const message = cleanErr(err);
      this.st = { mode: 'memory', ok: false, message: `Supabase isn’t working, so the app has no data and changes are kept in memory only. ${message}`, lastError: { at: new Date().toISOString(), message }, waiting: 0 };
      console.error('Database: Supabase failed, starting with no data.', message);
    }
  }

  /** Read the data again, e.g. after scripts/load_data.py added rows while the app was running. */
  public async reload(): Promise<DatabaseState> {
    await this.chain;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    await this.init();
    return this.state;
  }

  public hasData() {
    return Object.keys(this.state.users).length > 0;
  }

  public status(): DbStatus {
    return { ...this.st, waiting: this.remote ? this.pendingCount() : 0 };
  }

  private pendingCount() {
    let n = 0;
    const now = new Map(toRows(this.state).map((r) => [`${r.kind}:${r.id}`, JSON.stringify(r.data)]));
    for (const [k, v] of now) if (this.synced.get(k) !== v) n++;
    for (const k of this.synced.keys()) if (!now.has(k)) n++;
    return n;
  }

  /** Send every changed record to Supabase. Requests that change data wait for this before answering. */
  public flush(): Promise<void> {
    if (!this.remote) return Promise.resolve();
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.chain = this.chain.then(() => this.push()).catch(() => {});
    return this.chain;
  }

  private async push() {
    const remote = this.remote;
    if (!remote) return;
    const now = new Map<string, Row>();
    toRows(this.state).forEach((r) => now.set(`${r.kind}:${r.id}`, r));
    const changed: Row[] = [];
    const json = new Map<string, string>();
    for (const [k, r] of now) {
      const j = JSON.stringify(r.data);
      json.set(k, j);
      if (this.synced.get(k) !== j) changed.push(r);
    }
    const gone = [...this.synced.keys()].filter((k) => !now.has(k)).map((k) => ({ kind: k.slice(0, k.indexOf(':')), id: k.slice(k.indexOf(':') + 1) }));
    if (!changed.length && !gone.length) return;
    try {
      if (changed.length) await remote.upsert(changed.map((r) => ({ ...r, data: JSON.parse(json.get(`${r.kind}:${r.id}`)!) })));
      if (gone.length) await remote.remove(gone);
      changed.forEach((r) => this.synced.set(`${r.kind}:${r.id}`, json.get(`${r.kind}:${r.id}`)!));
      gone.forEach((g) => this.synced.delete(`${g.kind}:${g.id}`));
      this.st = { ...this.st, ok: true, message: 'Saved in Supabase', lastSavedAt: new Date().toISOString(), rows: this.synced.size };
    } catch (err) {
      const message = cleanErr(err);
      this.st = { ...this.st, ok: false, message: `Last save to Supabase failed. Trying again. ${message}`, lastError: { at: new Date().toISOString(), message } };
      console.error('Database: save to Supabase failed:', message);
      this.later(5000); // try again shortly; nothing is lost while the server runs
    }
  }

  private later(ms = 300) {
    if (!this.remote || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, ms);
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadFile(): DatabaseState {
    if (!fs.existsSync(DB_FILE)) return getEmptyState();
    try {
      return migrate(JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')));
    } catch (err) {
      console.warn('Could not read the local data file. Starting with no data.', err);
      return getEmptyState();
    }
  }

  private writeFile() {
    try {
      this.ensureDataDir();
      fs.writeFileSync(DB_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write db state to disk:', err);
    }
  }

  /** Every change ends here: queue the Supabase save, or write the local file when there's no Supabase. */
  private saveState(_state?: DatabaseState) {
    if (this.remote) this.later();
    else if (!this.memoryOnly) this.writeFile();
  }

  public getState(): DatabaseState {
    return this.state;
  }

  /** Delete all data, including rows loaded into Supabase that this app never read. */
  public async clearAll(): Promise<DatabaseState> {
    await this.chain;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.state = getEmptyState();
    if (this.remote) {
      await this.remote.removeAll();
      this.synced.clear();
      this.st = { ...this.st, ok: true, message: 'Supabase is empty. Load data with scripts/load_data.py.', rows: 0 };
    } else this.saveState();
    return this.state;
  }

  public getUser(userId: string): User | undefined {
    return this.state.users[userId];
  }

  public updateUser(userId: string, updates: Partial<User>): User | undefined {
    const user = this.state.users[userId];
    if (!user) return undefined;
    const updated = { ...user, ...updates };
    this.state.users[userId] = updated;
    this.saveState(this.state);
    return updated;
  }

  public getCabinetEntries(userId: string): CabinetEntry[] {
    return this.state.cabinetEntries.filter((e) => e.userId === userId);
  }

  public getCabinetEntry(id: string): CabinetEntry | undefined {
    return this.state.cabinetEntries.find((e) => e.id === id);
  }

  // ---- history of each entry
  private logEvent(e: CabinetEntry, action: EntryEvent['action'], meta: ChangeMeta = {}, changes?: EntryEvent['changes']) {
    this.state.entryHistory.push({
      id: eventId(), entryId: e.id, userId: e.userId, at: new Date().toISOString(), action: meta.action || action,
      by: meta.by || (e.source === 'nordea' ? 'nordea' : 'you'), how: meta.how, title: e.title, changes: changes?.length ? changes : undefined,
    });
  }

  public getEntryHistory(entryId: string): EntryEvent[] {
    return this.state.entryHistory.filter((h) => h.entryId === entryId);
  }

  public addCabinetEntry(entry: CabinetEntry, meta: ChangeMeta = {}): CabinetEntry {
    this.state.cabinetEntries.push(entry);
    this.logEvent(entry, 'added', meta);
    this.saveState(this.state);
    return entry;
  }

  public updateCabinetEntry(id: string, updates: Partial<CabinetEntry>, meta: ChangeMeta = {}): CabinetEntry | undefined {
    const idx = this.state.cabinetEntries.findIndex((e) => e.id === id);
    if (idx === -1) return undefined;
    const before = this.state.cabinetEntries[idx];
    const after = { ...before, ...updates, updatedAt: new Date().toISOString() };
    this.state.cabinetEntries[idx] = after;
    const changes = TRACKED.filter((f) => f in updates && !same(before[f], after[f])).map((f) => ({ field: f, from: before[f] ?? null, to: after[f] ?? null }));
    const status = changes.find((c) => c.field === 'status');
    const action: EntryEvent['action'] =
      status?.to === 'archived' ? 'removed'
      : status?.to === 'disputed' ? 'marked_wrong'
      : status && (status.from === 'archived' || status.from === 'disputed') && changes.length === 1 ? 'brought_back'
      : changes.length === 1 && changes[0].field === 'reviewed' && after.reviewed ? 'confirmed'
      : 'changed';
    if (changes.length) this.logEvent(after, action, meta, changes.filter((c) => !(action === 'confirmed' && c.field === 'reviewed')));
    else if (updates.confirmedAt || meta.action) this.logEvent(after, 'confirmed', meta);
    this.saveState(this.state);
    return after;
  }

  /**
   * Delete for good. `purge` also drops the entry's history (used when the customer deletes a document
   * "and the things taken from it", or undoes an add: then nothing about it should stay).
   */
  public deleteCabinetEntry(id: string, meta: ChangeMeta & { purge?: boolean } = {}): boolean {
    const e = this.getCabinetEntry(id);
    if (!e) return false;
    this.state.cabinetEntries = this.state.cabinetEntries.filter((x) => x.id !== id);
    if (meta.purge) this.state.entryHistory = this.state.entryHistory.filter((h) => h.entryId !== id);
    else this.logEvent(e, 'deleted', meta);
    this.saveState(this.state);
    return true;
  }

  // ---- kept documents ("Keep a copy")
  public getDocuments(userId: string): StoredDocument[] {
    return this.state.documents.filter((d) => d.userId === userId);
  }

  public getDocument(id: string): StoredDocument | undefined {
    return this.state.documents.find((d) => d.id === id);
  }

  public addDocument(d: StoredDocument): StoredDocument {
    this.state.documents.push(d);
    this.saveState(this.state);
    return d;
  }

  public updateDocument(id: string, updates: Partial<StoredDocument>) {
    const d = this.getDocument(id);
    if (!d) return undefined;
    Object.assign(d, updates);
    this.saveState(this.state);
    return d;
  }

  public removeDocument(id: string) {
    const d = this.getDocument(id);
    this.state.documents = this.state.documents.filter((x) => x.id !== id);
    // The chat bubble keeps the file name but loses its preview.
    for (const m of this.state.messages) if (m.attachment?.documentId === id) m.attachment = { ...m.attachment, thumb: undefined, deleted: true };
    this.saveState(this.state);
    return d;
  }

  /** A copy of a demo customer (for the answer check), so tests never change the real demo data. */
  public cloneUser(fromId: string, toId: string) {
    this.removeUser(toId);
    const u = this.state.users[fromId];
    if (!u) return false;
    this.state.users[toId] = { ...JSON.parse(JSON.stringify(u)), id: toId, name: u.name };
    const map = new Map<string, string>();
    for (const e of this.getCabinetEntries(fromId)) {
      const id = `${toId}-${e.id}`;
      map.set(e.id, id);
      this.state.cabinetEntries.push({ ...JSON.parse(JSON.stringify(e)), id, userId: toId });
    }
    for (const t of this.getTransactions(fromId)) this.state.transactions.push({ ...t, id: `${toId}-${t.id}`, userId: toId });
    this.saveState(this.state);
    return true;
  }

  /** Remove a (test) customer and everything about them. */
  public removeUser(id: string) {
    delete this.state.users[id];
    const keep = (x: { userId?: string }) => x.userId !== id;
    this.state.cabinetEntries = this.state.cabinetEntries.filter(keep);
    this.state.transactions = this.state.transactions.filter(keep);
    this.state.messages = this.state.messages.filter(keep);
    this.state.conversations = this.state.conversations.filter(keep);
    this.state.accessLog = this.state.accessLog.filter(keep);
    this.state.topicLog = this.state.topicLog.filter(keep);
    this.state.undoRecords = this.state.undoRecords.filter(keep);
    this.state.entryHistory = this.state.entryHistory.filter(keep);
    this.state.earnings = this.state.earnings.filter(keep);
    this.state.shares = this.state.shares.filter(keep);
    this.state.dataRewards = this.state.dataRewards.filter(keep);
    this.saveState(this.state);
  }

  /** Delete one chat: its messages and the conversation. Kept documents and what Abel knows stay. */
  public deleteConversation(userId: string, id: string) {
    const c = this.getConversation(id);
    if (!c || c.userId !== userId) return 0;
    const n = this.state.messages.filter((m) => m.conversationId === id).length;
    this.state.messages = this.state.messages.filter((m) => m.conversationId !== id);
    this.state.conversations = this.state.conversations.filter((x) => x.id !== id);
    this.saveState(this.state);
    return n;
  }

  /** "Delete my chats": every conversation and message of this customer. What Abel knows stays. */
  public deleteChats(userId: string) {
    const n = this.state.messages.filter((m) => m.userId === userId).length;
    this.state.messages = this.state.messages.filter((m) => m.userId !== userId);
    this.state.conversations = this.state.conversations.filter((c) => c.userId !== userId);
    this.state.topicLog = this.state.topicLog.filter((t) => t.userId !== userId);
    this.saveState(this.state);
    return n;
  }

  public getTransactions(userId: string): Transaction[] {
    return this.state.transactions.filter((t) => t.userId === userId);
  }

  /** New Nordea account data for a customer, snapshot mode: their transactions are replaced by these. */
  public replaceTransactions(userId: string, list: Transaction[]) {
    this.state.transactions = [...this.state.transactions.filter((t) => t.userId !== userId), ...list];
    this.saveState(this.state);
  }

  /**
   * New Nordea account data, incremental mode: merge by stable transaction id.
   * Rows whose id the customer already has are skipped (re-imports never duplicate).
   */
  public upsertTransactions(userId: string, list: Transaction[]): { added: Transaction[]; skipped: Transaction[]; updated: Transaction[] } {
    const mine = this.state.transactions.filter((t) => t.userId === userId);
    const byId = new Map(mine.map((t) => [t.id, t]));
    const seen = new Set<string>();
    const added: Transaction[] = [];
    const skipped: Transaction[] = [];
    const updated: Transaction[] = [];
    // Fields a bank correction may legitimately change between feeds (never the identity fields).
    const CORRECTABLE: (keyof Transaction)[] = ['date', 'amount', 'category', 'account', 'description', 'valueDate', 'status', 'currency', 'counterparty', 'reference', 'paymentMethod', 'originalCategory', 'categorySource'];
    for (const t of list) {
      const existing = byId.get(t.id);
      if (existing || seen.has(t.id)) {
        // A row the bank re-sent under its own stable reference with changed content (e.g. a pending
        // transaction booking) is a correction, not a duplicate: update it in place, keep the id.
        if (existing && existing.bankId && t.bankId) {
          const diff = CORRECTABLE.filter((f) => (existing as any)[f] !== (t as any)[f]);
          if (diff.length) {
            for (const f of diff) { if ((t as any)[f] === undefined) delete (existing as any)[f]; else (existing as any)[f] = (t as any)[f]; }
            existing.batchId = t.batchId;
            updated.push(existing);
            continue;
          }
        }
        skipped.push(t);
        continue;
      }
      seen.add(t.id);
      added.push(t);
    }
    this.state.transactions.push(...added);
    this.state.transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    this.saveState(this.state);
    return { added, skipped, updated };
  }

  // ---- Explicit account records: one per account, derived from the customer record, extended by feeds ----
  public getBankAccounts(userId: string): BankAccount[] {
    return this.state.bankAccounts.filter((x) => x.userId === userId);
  }

  /** Add or enrich an account record. Only the fields supplied are set; nothing is invented. */
  public upsertBankAccount(userId: string, key: string, fields: { type?: string; iban?: string; currency?: string }): BankAccount {
    const id = `acc-${userId}-${key}`;
    let a = this.state.bankAccounts.find((x) => x.id === id);
    if (!a) {
      a = { id, userId, key };
      this.state.bankAccounts.push(a);
    }
    if (fields.type !== undefined) a.type = fields.type;
    if (fields.iban !== undefined) a.iban = fields.iban;
    if (fields.currency !== undefined) a.currency = fields.currency;
    this.saveState(this.state);
    return a;
  }

  // ---- Balance snapshots: dated balances per account, kept across imports ----
  public getBalanceSnapshots(userId: string, accountKey?: string): BalanceSnapshot[] {
    return this.state.balanceSnapshots.filter((x) => x.userId === userId && (!accountKey || x.accountKey === accountKey));
  }

  public addBalanceSnapshot(x: BalanceSnapshot) {
    this.state.balanceSnapshots.push(x);
    this.saveState(this.state);
    return x;
  }

  // ---- Import batches: what was applied, when, and what it did ----
  public getImportBatches(userId: string): ImportBatch[] {
    return this.state.importBatches.filter((x) => x.userId === userId);
  }

  public addImportBatch(x: ImportBatch) {
    this.state.importBatches.push(x);
    this.saveState(this.state);
    return x;
  }

  // ---- Data rewards: points for what the customer shares and for how often it's read ----
  public getDataRewards(userId: string): DataReward[] {
    return this.state.dataRewards.filter((r) => r.userId === userId);
  }

  public addDataReward(r: DataReward) {
    this.state.dataRewards.push(r);
    this.saveState(this.state);
    return r;
  }

  public getMessages(userId: string): ChatMessage[] {
    return this.state.messages.filter((m) => m.userId === userId);
  }

  public addMessage(msg: ChatMessage): ChatMessage {
    this.state.messages.push(msg);
    this.saveState(this.state);
    return msg;
  }

  public getAccessLog(userId?: string): AccessLogEntry[] {
    if (!userId) return this.state.accessLog;
    return this.state.accessLog.filter((log) => log.userId === userId);
  }

  public addAccessLogEntry(log: AccessLogEntry): AccessLogEntry {
    this.state.accessLog.unshift(log);
    if (this.state.accessLog.length > 200) {
      this.state.accessLog.pop();
    }
    this.saveState(this.state);
    return log;
  }

  public getTopicLog(userId?: string): TopicLogEntry[] {
    if (!userId) return this.state.topicLog;
    return this.state.topicLog.filter((t) => t.userId === userId);
  }

  public addTopicLogEntry(entry: TopicLogEntry): TopicLogEntry {
    this.state.topicLog.unshift(entry);
    this.saveState(this.state);
    return entry;
  }

  public addUndoRecord(record: UndoRecord): UndoRecord {
    this.state.undoRecords.push(record);
    this.saveState(this.state);
    return record;
  }

  public getUndoRecord(undoToken: string): UndoRecord | undefined {
    return this.state.undoRecords.find((r) => r.undoToken === undoToken);
  }

  public removeUndoRecord(undoToken: string): boolean {
    const initLen = this.state.undoRecords.length;
    this.state.undoRecords = this.state.undoRecords.filter((r) => r.undoToken !== undoToken);
    if (this.state.undoRecords.length !== initLen) {
      this.saveState(this.state);
      return true;
    }
    return false;
  }

  // ---- v14: conversations, partner earnings, one-time shares
  public getConversations(userId: string): Conversation[] {
    return this.state.conversations.filter((c) => c.userId === userId);
  }

  public getConversation(id: string): Conversation | undefined {
    return this.state.conversations.find((c) => c.id === id);
  }

  public addConversation(c: Conversation): Conversation {
    this.state.conversations.push(c);
    this.saveState(this.state);
    return c;
  }

  public touchConversation(id: string, updates: Partial<Conversation> = {}) {
    const c = this.getConversation(id);
    if (!c) return;
    Object.assign(c, updates, { updatedAt: new Date().toISOString() });
    this.saveState(this.state);
  }

  public updateMessage(id: string, updates: Partial<ChatMessage>) {
    const m = this.state.messages.find((x) => x.id === id);
    if (!m) return undefined;
    Object.assign(m, updates);
    this.saveState(this.state);
    return m;
  }

  public getEarnings(userId: string): Earning[] {
    return this.state.earnings.filter((e) => e.userId === userId);
  }

  public addEarning(e: Earning): Earning {
    this.state.earnings.push(e);
    this.saveState(this.state);
    return e;
  }

  public getShares(userId: string): Share[] {
    return this.state.shares.filter((x) => x.userId === userId);
  }

  public addShare(x: Share): Share {
    this.state.shares.push(x);
    this.saveState(this.state);
    return x;
  }

  public updateShare(id: string, updates: Partial<Share>) {
    const x = this.state.shares.find((y) => y.id === id);
    if (!x) return undefined;
    Object.assign(x, updates);
    this.saveState(this.state);
    return x;
  }
}

export const db = new Database();
