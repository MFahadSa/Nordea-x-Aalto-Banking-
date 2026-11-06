import fs from 'fs';
import { autoDemoOn, loadBundledDemo } from './demoSeed.js';
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
  PersonaId,
  ViewMode,
} from '../types.js';
// G1: customer data lives in the three agent databases (User / Context Memory / Nordea).
// The app layer may import the store modules (see the store file headers); agents never
// import this module, and no agent module imports another agent's store.
import { listCustomers, unregisterCustomer, deleteDbFile, ARCH_DIR, hydrateAgentStores, remoteConfigured } from './arch/store/common.js';
import { loadBus } from './arch/store/busStore.js';
import { appWrites, decideProposal } from './arch/orchestrator.js';
import {
  loadUserDb, loadProfile, saveProfile, putGoal, removeGoal,
  loadDocuments, putDocument, removeStoredDocument, deleteUserDb,
  loadAppRows, putAppRows, deleteAppRows,
} from './arch/store/userStore.js';
import type { UserProfile } from './arch/store/userStore.js';
import {
  loadCmDb, putEntry, removeEntry, addHistoryEvent, loadHistory, deleteHistoryFor, listUndoRecords,
  loadShares, putShare, putUndoRecord, getUndoRecord as cmGetUndo, removeUndoRecord as cmRemoveUndo, deleteCmDb,
  loadAppAccessLog, putAppAccessLog, deleteAppAccessLogRows,
} from './arch/store/cmStore.js';
import {
  loadNordeaDb, nordeaFileExists, saveNordeaDb, loadBalances, saveBalances,
  putTransactions, putBankAccount, loadBalanceSnapshots, putBalanceSnapshot,
  loadImportBatches, putImportBatch, deleteNordeaDb,
  loadAppBankRows, putAppBankRows, deleteAppBankRows, loadAppRewards, putAppRewards, removeAppRewards,
} from './arch/store/nordeaStore.js';
import { deleteContext } from './arch/store/contextStore.js';
import type { ArchEntry, Goal } from './arch/types.js';

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

/** Each kind of record the legacy store knew, and how it's keyed (migration only). */
const LEGACY_LISTS = ['cabinetEntries', 'transactions', 'messages', 'accessLog', 'topicLog', 'undoRecords', 'conversations', 'earnings', 'shares', 'documents', 'entryHistory', 'dataRewards', 'balanceSnapshots', 'importBatches', 'bankAccounts'] as const;
type LegacyList = (typeof LEGACY_LISTS)[number];
const LEGACY_ORDER: Record<LegacyList, { field: string; desc?: boolean }> = {
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

export function getEmptyLegacyState(): DatabaseState {
  return {
    users: {}, cabinetEntries: [], transactions: [], messages: [], accessLog: [], topicLog: [],
    undoRecords: [], conversations: [], earnings: [], shares: [], documents: [], entryHistory: [],
    dataRewards: [], balanceSnapshots: [], importBatches: [], bankAccounts: [],
  };
}


/**
 * Fills in what loaded legacy data may leave out (migration only): history for entries that
 * predate history, and explicit account records derived from the customer record.
 */
export function migrateLegacyState(state: DatabaseState): DatabaseState {
  const empty = getEmptyLegacyState();
  for (const k of Object.keys(empty) as (keyof DatabaseState)[]) (state as any)[k] = state[k] || empty[k];
  const known = new Set(state.entryHistory.map((h) => h.entryId));
  state.entryHistory.push(...historyFor(state.cabinetEntries.filter((e) => !known.has(e.id))));
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

// ---------- Mapping between the Abel CabinetEntry record and the arch store rows ----------
// Each field has ONE authoritative home: arch-owned fields (title, detail, status, evidence,
// goalIds, proposedBy...) live in the store columns; Abel-owned fields (type, source, private,
// readableBy, provenance, target, why, reviewed, goalType, confirmedAt, updatedAt) live in the
// row's `doc` JSON. The two views are merged on read, split on write.

/** A held Nordea observation (G11) shown with the wording that waits in the queue, still unreviewed. */
const withWaitingVersion = (userId: string, entry: CabinetEntry): CabinetEntry => {
  if (entry.source !== 'nordea' || entry.reviewed !== false) return entry;
  const waiting = (pendingAppWrite(userId, entry.id)?.payload as { entry?: { doc?: CabinetEntry } } | undefined)?.entry?.doc;
  return waiting ? { ...entry, title: waiting.title ?? entry.title, detail: waiting.detail ?? entry.detail, why: waiting.why ?? entry.why, updatedAt: waiting.updatedAt ?? entry.updatedAt, reviewed: false } : entry;
};
/** A NEW Nordea observation that so far exists only as a waiting write. */
const waitingNordeaDoc = (userId: string, entryId: string): CabinetEntry | undefined => {
  const d = (pendingAppWrite(userId, entryId)?.payload as { entry?: { doc?: CabinetEntry } } | undefined)?.entry?.doc;
  return d && d.source === 'nordea' ? { ...d, id: entryId, reviewed: false } : undefined;
};

/** The app write still waiting in the CM review queue for this entry id, if any. */
const pendingAppWrite = (uid: string, entryId: string) => loadBus(uid).messages.find((m) => m.type === 'propose' && m.status === 'pending'
  && (m.payload as { appWrite?: boolean; entry?: { id?: string } } | undefined)?.appWrite === true
  && (m.payload as { entry?: { id?: string } } | undefined)?.entry?.id === entryId);

const goalToEntry = (userId: string, g: Goal): CabinetEntry =>
  g.doc
    ? { ...g.doc, id: g.id, userId, type: 'goal', title: g.title, detail: g.detail, createdAt: g.createdAt }
    : {
        id: g.id, userId, type: 'goal', title: g.title, detail: g.detail, source: 'customer',
        status: 'active', private: false, readableBy: { abel: true, offers: true }, provenance: { channel: 'app' },
        reviewed: true, createdAt: g.createdAt, updatedAt: g.createdAt,
      };

export const entryToGoal = (e: CabinetEntry): Goal => ({ id: e.id, title: e.title, detail: e.detail, createdAt: e.createdAt, doc: e });

const cmToEntry = (userId: string, e: ArchEntry): CabinetEntry => {
  const doc = e.doc;
  return {
    id: e.id, userId,
    type: doc?.type ?? (e.proposedBy === 'nordea' ? 'observation' : 'fact'),
    title: e.title,
    detail: e.detail,
    source: doc?.source ?? (e.proposedBy === 'nordea' ? 'nordea' : 'customer'),
    status: e.status,
    private: doc?.private ?? false,
    readableBy: doc?.readableBy ?? { abel: true, offers: true },
    provenance: doc?.provenance ?? { channel: 'system' },
    ...(doc?.target ? { target: doc.target } : {}),
    ...(doc?.linked ? { linked: doc.linked } : {}),
    ...(doc?.why ? { why: doc.why } : {}),
    ...(e.evidence || doc?.evidence
      ? { evidence: doc?.evidence ?? { transactionIds: e.evidence?.transactionIds, inputsHash: e.evidence?.transactionIdsHash, computedAt: e.createdAt } }
      : {}),
    reviewed: doc?.reviewed ?? true,
    ...(doc?.goalType ? { goalType: doc.goalType } : {}),
    ...(doc?.confirmedAt ? { confirmedAt: doc.confirmedAt } : {}),
    createdAt: e.createdAt,
    updatedAt: doc?.updatedAt ?? e.createdAt,
  };
};

export const entryToCm = (e: CabinetEntry, existing?: ArchEntry): ArchEntry => ({
  id: e.id,
  title: e.title,
  detail: e.detail,
  goalIds: existing?.goalIds ?? [],
  proposedBy: existing?.proposedBy ?? (e.source === 'nordea' ? 'nordea' : 'user'),
  ...(existing?.viaMessageId ? { viaMessageId: existing.viaMessageId } : {}),
  ...(existing?.evidence
    ? { evidence: existing.evidence }
    : e.evidence
      ? { evidence: { transactionIds: e.evidence.transactionIds, transactionIdsHash: e.evidence.inputsHash } }
      : {}),
  status: e.status,
  ...(existing?.disputeReason ? { disputeReason: existing.disputeReason } : {}),
  ...(existing?.observed ? { observed: existing.observed } : {}),
  ...(existing?.risk ? { risk: existing.risk } : {}),
  ...(existing?.autoAccepted ? { autoAccepted: true } : {}),
  ...(existing?.approval ? { approval: existing.approval } : {}), // R2: kept as-is on app rebuilds (edit/reapproval policy is pending)
  createdAt: existing?.createdAt ?? e.createdAt,
  doc: e,
});

export interface DbStatus {
  mode: 'supabase' | 'file' | 'memory';
  ok: boolean;
  message: string;
  lastSavedAt?: string;
  lastError?: { at: string; message: string };
  rows?: number;
  waiting: number;
}

/** Points and reward redemptions: bank-side loyalty plumbing, kept in the customer's Nordea DB. */
interface RewardState {
  points: number;
  pointsSpent?: number;
  redeemed?: { rewardId: string; title: string; pts: number; at: string }[];
}

/** Rewards points live in the customer's Nordea DB (bank-side loyalty plumbing). */
const loadRewards = (uid: string): RewardState | undefined => {
  const raw = loadAppRewards(uid);
  return raw ? (JSON.parse(raw) as RewardState) : undefined;
};
const saveRewards = (uid: string, r: RewardState) => putAppRewards(uid, JSON.stringify(r));

class Database {
  private st: DbStatus = { mode: 'file', ok: true, message: 'Saved on this server only. It resets when the app restarts.', waiting: 0 };

  // Nothing is preloaded: the app starts with no data until init() runs.
  constructor() {}

  /**
   * Read the data. Called once before the server starts (and by reload()).
   * Everything lives in the three agent databases (owner, 2026-11-01): the app never reads or
   * writes cabinet-db.json - a leftover file only triggers the migration hint below.
   */
  public async init() {
    // G6: when the three agent stores have hosted secrets, their tables are the source of
    // truth - pull them into the local SQLite files before anything reads them.
    const hydrated = await hydrateAgentStores();
    if (hydrated.length) console.log(`Database: agent stores hydrated from hosted tables: ${hydrated.join(', ')}`);
    if (fs.existsSync(DB_FILE)) {
      console.log('Database: found legacy cabinet-db.json - run `npm run migrate:legacy` to move it into the three agent databases (verified, then the file is deleted).');
    }
    // A fresh copy (AI Studio has no terminal for scripts/load_data.py): load the bundled demo customers.
    if (!this.hasData() && autoDemoOn()) {
      const r = await loadBundledDemo().catch((e) => ({ ok: false, message: String(e?.message || e) }));
      console.log(`Database: no data yet - ${r.ok ? r.message : `demo data not loaded: ${r.message}`}`);
    }
    const hosted = remoteConfigured('user') || remoteConfigured('cm') || remoteConfigured('nordea');
    this.st = hosted
      ? { mode: 'supabase', ok: true, message: 'Saved in Supabase', waiting: 0 }
      : { mode: 'file', ok: true, message: 'Saved on this server only. It resets when the app restarts.', waiting: 0 };
    console.log(`Database: ${hosted ? 'Supabase' : 'local file'} (${listCustomers().length} customers in the three databases)`);
  }

  /** Read the data again, e.g. after scripts/load_data.py added rows while the app was running. */
  public async reload(): Promise<DatabaseState> {
    await this.init();
    return this.getState();
  }

  public hasData() {
    return listCustomers().length > 0;
  }

  public status(): DbStatus {
    return { ...this.st, waiting: 0 };
  }

  /** Kept for callers that awaited the old Supabase plumbing sync: store writes are synchronous now. */
  public flush(): Promise<void> {
    return Promise.resolve();
  }

  /** The full composed view: customer data read back from the three agent databases. */
  public getState(): DatabaseState {
    const uids = listCustomers();
    const users: Record<string, User> = {};
    for (const uid of uids) {
      const u = this.getUser(uid);
      if (u) users[uid] = u;
    }
    return {
      users,
      cabinetEntries: uids.flatMap((uid) => this.getCabinetEntries(uid)),
      transactions: uids.flatMap((uid) => this.getTransactions(uid)),
      messages: uids.flatMap((uid) => this.getMessages(uid)),
      accessLog: uids.flatMap((uid) => this.getAccessLog(uid)),
      topicLog: uids.flatMap((uid) => this.getTopicLog(uid)),
      undoRecords: uids.flatMap((uid) => listUndoRecords(uid)),
      conversations: uids.flatMap((uid) => this.getConversations(uid)),
      earnings: uids.flatMap((uid) => this.getEarnings(uid)),
      shares: uids.flatMap((uid) => loadShares(uid)),
      documents: uids.flatMap((uid) => loadDocuments(uid)),
      entryHistory: uids.flatMap((uid) => loadHistory(uid)),
      dataRewards: uids.flatMap((uid) => this.getDataRewards(uid)),
      balanceSnapshots: uids.flatMap((uid) => loadBalanceSnapshots(uid)),
      importBatches: uids.flatMap((uid) => loadImportBatches(uid)),
      bankAccounts: uids.flatMap((uid) => this.getBankAccounts(uid)),
    };
  }

  /** Delete all data, including rows loaded into Supabase that this app never read. */
  public async clearAll(): Promise<DatabaseState> {
    fs.rmSync(ARCH_DIR, { recursive: true, force: true });
    this.st = { ...this.st, ok: true, message: this.st.mode === 'supabase' ? 'Supabase is empty. Load data with scripts/load_data.py.' : this.st.message, rows: 0 };
    return this.getState();
  }

  // ---------- Users: profile + settings in the User DB, balances in the Nordea DB, rewards here ----------

  public getUser(userId: string): User | undefined {
    const profile = loadProfile(userId);
    const balances = loadBalances(userId);
    const rewards = loadRewards(userId);
    if (!profile && !balances && !rewards && !listCustomers().includes(userId)) return undefined;
    return {
      id: userId,
      persona: (profile?.persona ?? 'lauri') as PersonaId,
      name: profile?.name ?? userId,
      age: profile?.age ?? 0,
      roleDescription: profile?.roleDescription ?? '',
      viewMode: (profile?.viewMode ?? 'full') as ViewMode,
      layoutPrefs: profile?.layoutPrefs ?? { widgetsOrder: [], hiddenWidgets: [] },
      accounts: balances ?? { current: { iban: '', balance: 0 }, savings: { iban: '', balance: 0, monthlyDeposit: 0 } },
      points: rewards?.points ?? 0,
      ...(rewards?.pointsSpent !== undefined ? { pointsSpent: rewards.pointsSpent } : {}),
      ...(rewards?.redeemed ? { redeemed: rewards.redeemed } : {}),
      ...(profile?.offersOff !== undefined ? { offersOff: profile.offersOff } : {}),
      ...(profile?.extraMonthly !== undefined ? { extraMonthly: profile.extraMonthly } : {}),
      ...(profile?.nordeaData ? { nordeaData: profile.nordeaData } : {}),
    };
  }

  public updateUser(userId: string, updates: Partial<User>): User | undefined {
    const user = this.getUser(userId);
    if (!user) return undefined;
    const { points, pointsSpent, redeemed, accounts, ...profileUpdates } = updates;
    if (points !== undefined || pointsSpent !== undefined || redeemed !== undefined) {
      const r = loadRewards(userId) ?? { points: 0 };
      if (points !== undefined) r.points = points;
      if (pointsSpent !== undefined) r.pointsSpent = pointsSpent;
      if (redeemed !== undefined) r.redeemed = redeemed;
      saveRewards(userId, r);
    }
    if (accounts !== undefined) appWrites.putBalances(userId, accounts);
    if (Object.keys(profileUpdates).length) appWrites.putProfile(userId, { ...(loadProfile(userId) ?? {}), ...profileUpdates });
    return this.getUser(userId);
  }

  // ---------- Cabinet: goals in the User DB, everything else in the Context Memory DB ----------

  public getCabinetEntries(userId: string): CabinetEntry[] {
    const goals = loadUserDb(userId).goals.map((g) => goalToEntry(userId, g));
    // A Nordea observation whose new version waits in the queue (G11, held copy) is SHOWN with the
    // waiting wording, still unreviewed - so "Waiting for you" asks about what Nordea noticed now, and
    // the access gateway keeps it from Abel until the customer confirms (unreviewed Nordea items are blocked).
    // The personal agent's "Customer goal: <title>" card is the agents' copy of a goal the customer already
    // sees (and Abel already reads) as the goal itself. In the app it is left out while that goal exists, so
    // Abel never sees two of one goal - "delete my goal" then removes the real goal, not the copy.
    // The copy stays in the Context Memory DB for the agents (and /arch.html).
    const goalIds = new Set(goals.map((g) => g.id));
    const isGoalCopy = (e: ArchEntry) => e.proposedBy === 'personal' && /^Customer goal: /.test(e.title) && e.goalIds.length > 0 && e.goalIds.every((g) => goalIds.has(g));
    const cm = loadCmDb(userId).entries.filter((e) => !isGoalCopy(e)).map((e) => withWaitingVersion(userId, cmToEntry(userId, e)));
    // A NEW Nordea observation still in the queue (no stored copy yet) is shown the same way: unreviewed,
    // in "Waiting for you"; confirming it accepts the queued write (updateCabinetEntry, G10).
    const stored = new Set(cm.map((e) => e.id));
    for (const m of loadBus(userId).messages) {
      if (m.type !== 'propose' || m.status !== 'pending') continue;
      const pl = m.payload as { appWrite?: boolean; entry?: { id?: string; doc?: CabinetEntry } } | undefined;
      const d = pl?.appWrite === true ? pl.entry?.doc : undefined;
      if (d && d.source === 'nordea' && d.userId === userId && d.status === 'active' && pl!.entry!.id && !stored.has(pl!.entry!.id)) {
        stored.add(pl!.entry!.id);
        cm.push({ ...d, id: pl!.entry!.id, reviewed: false });
      }
    }
    return [...goals, ...cm].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  public getCabinetEntry(id: string): CabinetEntry | undefined {
    for (const uid of listCustomers()) {
      const g = loadUserDb(uid).goals.find((x) => x.id === id);
      if (g) return goalToEntry(uid, g);
      const e = loadCmDb(uid).entries.find((x) => x.id === id);
      if (e) return withWaitingVersion(uid, cmToEntry(uid, e));
    }
    for (const uid of listCustomers()) {
      const w = waitingNordeaDoc(uid, id);
      if (w) return w;
    }
    return undefined;
  }

  // ---- history of each entry (Context Memory DB)
  private logEvent(e: CabinetEntry, action: EntryEvent['action'], meta: ChangeMeta = {}, changes?: EntryEvent['changes']) {
    appWrites.logHistory(e.userId, {
      id: eventId(), entryId: e.id, userId: e.userId, at: new Date().toISOString(), action: meta.action || action,
      by: meta.by || (e.source === 'nordea' ? 'nordea' : 'you'), how: meta.how, title: e.title, changes: changes?.length ? changes : undefined,
    });
  }

  public getEntryHistory(entryId: string): EntryEvent[] {
    for (const uid of listCustomers()) {
      const h = loadHistory(uid, entryId);
      if (h.length) return h;
    }
    return [];
  }

  public addCabinetEntry(entry: CabinetEntry, meta: ChangeMeta = {}): CabinetEntry {
    if (entry.type === 'goal') appWrites.putGoal(entry.userId, entryToGoal(entry));
    else appWrites.putEntry(entry.userId, entryToCm(entry), meta.by === 'you');
    this.logEvent(entry, 'added', meta);
    return entry;
  }

  /** G10: a write still waiting in the CM review queue, as the CabinetEntry it carries.
   *  Lets app flows (e.g. observation-confirmed) find it; the actual consent decision
   *  still goes through decideProposal in updateCabinetEntry. */
  public getQueuedCabinetEntry(id: string): CabinetEntry | undefined {
    for (const uid of listCustomers()) {
      const pending = loadBus(uid).messages.find((m) => m.type === 'propose' && m.status === 'pending'
        && (m.payload as { appWrite?: boolean; entry?: { id?: string; doc?: CabinetEntry } } | undefined)?.appWrite === true
        && (m.payload as { entry?: { id?: string } } | undefined)?.entry?.id === id);
      const doc = (pending?.payload as { entry?: { doc?: CabinetEntry } } | undefined)?.entry?.doc;
      if (doc) return doc;
    }
    return undefined;
  }

  public updateCabinetEntry(id: string, updates: Partial<CabinetEntry>, meta: ChangeMeta = {}): CabinetEntry | undefined {
    let before = this.getCabinetEntry(id);
    // G11: a held copy (reviewed=false) may have a newer version waiting in the queue - the
    // customer's confirm then accepts THAT version, never the old text on its own.
    const heldUpdate = before && before.source === 'nordea' && updates.reviewed === true && pendingAppWrite(before.userId, id);
    if (heldUpdate) { decideProposal(before!.userId, heldUpdate.id, true); before = this.getCabinetEntry(id); }
    if (!before && (updates.status === 'disputed' || updates.status === 'archived')) {
      // "That's wrong" / remove on an observation that is still only waiting in the queue: reject it there.
      for (const uid of listCustomers()) {
        const waiting = pendingAppWrite(uid, id);
        const doc = (waiting?.payload as { entry?: { doc?: CabinetEntry } } | undefined)?.entry?.doc;
        if (waiting && doc) {
          decideProposal(uid, waiting.id, false);
          // Kept as disputed/archived (lands directly), so the same bank data does not propose it again.
          const gone = { ...doc, id, ...updates, updatedAt: new Date().toISOString() } as CabinetEntry;
          appWrites.putEntry(uid, entryToCm(gone), true);
          this.logEvent(gone, updates.status === 'disputed' ? 'marked_wrong' : 'removed', meta);
          return gone;
        }
      }
    }
    if (!before && updates.reviewed === true) {
      // G10 one consent path: the write may still wait in the CM review queue. The app's
      // confirm IS the queue decision (Bill 03:09) - accept the pending proposal for this
      // entry, then apply the rest of the update to the now-stored entry.
      for (const uid of listCustomers()) {
        const pending = loadBus(uid).messages.find((m) => m.type === 'propose' && m.status === 'pending'
          && (m.payload as { appWrite?: boolean; entry?: { id?: string } } | undefined)?.appWrite === true
          && (m.payload as { entry?: { id?: string } } | undefined)?.entry?.id === id);
        if (pending) { decideProposal(uid, pending.id, true); break; }
      }
      before = this.getCabinetEntry(id);
    }
    if (!before) return undefined;
    const after = { ...before, ...updates, updatedAt: new Date().toISOString() };
    if (before.type === 'goal') {
      appWrites.putGoal(before.userId, entryToGoal(after));
    } else {
      const existing = loadCmDb(before.userId).entries.find((x) => x.id === id);
      appWrites.putEntry(before.userId, entryToCm(after, existing), meta.by === 'you');
    }
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
    return after;
  }

  /**
   * Delete for good. `purge` also drops the entry's history (used when the customer deletes a document
   * "and the things taken from it", or undoes an add: then nothing about it should stay).
   */
  public deleteCabinetEntry(id: string, meta: ChangeMeta & { purge?: boolean } = {}): boolean {
    const e = this.getCabinetEntry(id);
    if (!e) return false;
    if (e.type === 'goal') {
      appWrites.removeGoal(e.userId, id);
      if (meta.purge) appWrites.removeEntry(e.userId, id, true); // a goal has no CM row; purge is a no-op there
      else this.logEvent(e, 'deleted', meta);
    } else {
      appWrites.removeEntry(e.userId, id, meta.purge === true);
      if (!meta.purge) this.logEvent(e, 'deleted', meta);
    }
    return true;
  }

  // ---- kept documents ("Keep a copy"): the customer's own files, in the User DB
  public getDocuments(userId: string): StoredDocument[] {
    return loadDocuments(userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  public getDocument(id: string): StoredDocument | undefined {
    for (const uid of listCustomers()) {
      const d = loadDocuments(uid).find((x) => x.id === id);
      if (d) return d;
    }
    return undefined;
  }

  public addDocument(d: StoredDocument): StoredDocument {
    appWrites.putDocument(d.userId, d);
    return d;
  }

  public updateDocument(id: string, updates: Partial<StoredDocument>) {
    const d = this.getDocument(id);
    if (!d) return undefined;
    const next = { ...d, ...updates };
    appWrites.putDocument(d.userId, next);
    return next;
  }

  public removeDocument(id: string) {
    const d = this.getDocument(id);
    if (!d) return undefined;
    appWrites.removeDocument(d.userId, id);
    // The chat bubble keeps the file name but loses its preview.
    for (const m of this.getMessages(d.userId)) {
      if (m.attachment?.documentId === id) this.updateMessage(m.id, { attachment: { ...m.attachment, thumb: undefined, deleted: true } });
    }
    return d;
  }

  /** A copy of a demo customer (for the answer check), so tests never change the real demo data. */
  public cloneUser(fromId: string, toId: string) {
    this.removeUser(toId);
    const u = this.getUser(fromId);
    if (!u) return false;
    const clone = JSON.parse(JSON.stringify(u)) as User;
    const { points, pointsSpent, redeemed, accounts, id: _id, ...profile } = clone;
    saveProfile(toId, profile as UserProfile);
    if (accounts) saveBalances(toId, accounts);
    saveRewards(toId, { points: points ?? 0, ...(pointsSpent !== undefined ? { pointsSpent } : {}), ...(redeemed ? { redeemed } : {}) });
    for (const e of this.getCabinetEntries(fromId)) {
      const copy = JSON.parse(JSON.stringify(e)) as CabinetEntry;
      copy.id = `${toId}-${e.id}`;
      copy.userId = toId;
      if (copy.type === 'goal') putGoal(toId, entryToGoal(copy));
      else putEntry(toId, entryToCm(copy));
    }
    const txs = this.getTransactions(fromId).map((t) => ({ ...t, id: `${toId}-${t.id}`, userId: toId }));
    if (txs.length) putTransactions(toId, txs);
    return true;
  }

  /** Remove a (test) customer and everything about them. */
  public removeUser(id: string) {
    deleteUserDb(id);
    deleteCmDb(id);
    deleteNordeaDb(id);
    deleteDbFile(id, 'bus');
    deleteContext(id);
    unregisterCustomer(id);
    // The per-customer database files are gone, so their app rows (chats, access log, rewards)
    // went with them; a leftover legacy file is the migration's business, not deleted here.
  }

  /** Delete one chat: its messages and the conversation. Kept documents and what Abel knows stay. */
  public deleteConversation(userId: string, id: string) {
    const c = this.getConversation(id);
    if (!c || c.userId !== userId) return 0;
    const msgs = this.getMessages(userId).filter((m) => m.conversationId === id);
    deleteAppRows(userId, 'app_messages', msgs.map((m) => m.id));
    deleteAppRows(userId, 'app_conversations', [id]);
    return msgs.length;
  }

  /** "Delete my chats": every conversation and message of this customer. What Abel knows stays. */
  public deleteChats(userId: string) {
    const n = this.getMessages(userId).length;
    deleteAppRows(userId, 'app_messages', this.getMessages(userId).map((m) => m.id));
    deleteAppRows(userId, 'app_conversations', this.getConversations(userId).map((c) => c.id));
    deleteAppRows(userId, 'app_topic_log', this.getTopicLog(userId).map((t) => t.id));
    return n;
  }

  // ---------- Bank data: the Nordea DB is the one home ----------

  public getTransactions(userId: string): Transaction[] {
    return (nordeaFileExists(userId) ? loadNordeaDb(userId) : null)?.transactions ?? [];
  }

  /** New Nordea account data for a customer, snapshot mode: their transactions are replaced by these. */
  public replaceTransactions(userId: string, list: Transaction[]) {
    appWrites.putTransactions(userId, list, 'replace');
  }

  /**
   * New Nordea account data, incremental mode: merge by stable transaction id.
   * Rows whose id the customer already has are skipped (re-imports never duplicate).
   */
  public upsertTransactions(userId: string, list: Transaction[]): { added: Transaction[]; skipped: Transaction[]; updated: Transaction[] } {
    // The Nordea agent owns the merge semantics (dedupe by stable id, bank corrections) and
    // performs the write to its own DB; the adapter only relays the result.
    const reply = appWrites.putTransactions(userId, list, 'upsert') as { added: Transaction[]; skipped: Transaction[]; updated: Transaction[] };
    return { added: reply.added ?? [], skipped: reply.skipped ?? [], updated: reply.updated ?? [] };
  }

  // ---- Explicit account records: one per account, derived from the customer record, extended by feeds ----
  public getBankAccounts(userId: string): BankAccount[] {
    return loadNordeaDb(userId)?.accounts ?? [];
  }

  /** Add or enrich an account record. Only the fields supplied are set; nothing is invented. */
  public upsertBankAccount(userId: string, key: string, fields: { type?: string; iban?: string; currency?: string }): BankAccount {
    const id = `acc-${userId}-${key}`;
    const nd = loadNordeaDb(userId);
    const existing = nd?.accounts.find((x) => x.id === id);
    const a: BankAccount = { ...(existing ?? { id, userId, key }) };
    if (fields.type !== undefined) a.type = fields.type;
    if (fields.iban !== undefined) a.iban = fields.iban;
    if (fields.currency !== undefined) a.currency = fields.currency;
    appWrites.putBankAccount(userId, a);
    return a;
  }

  // ---- Balance snapshots: dated balances per account, kept across imports ----
  public getBalanceSnapshots(userId: string, accountKey?: string): BalanceSnapshot[] {
    return loadBalanceSnapshots(userId, accountKey);
  }

  public addBalanceSnapshot(x: BalanceSnapshot) {
    appWrites.putSnapshot(x.userId, x);
    return x;
  }

  // ---- Import batches: what was applied, when, and what it did ----
  public getImportBatches(userId: string): ImportBatch[] {
    return loadImportBatches(userId);
  }

  public addImportBatch(x: ImportBatch) {
    appWrites.putImportBatch(x.userId, x);
    return x;
  }

  // ---- Data rewards: points for what the customer shares and for how often it's read ----
  public getDataRewards(userId: string): DataReward[] {
    return loadAppBankRows<DataReward>(userId, 'app_data_rewards');
  }

  public addDataReward(r: DataReward) {
    putAppBankRows(r.userId, 'app_data_rewards', [{ id: r.id, at: r.at, json: JSON.stringify(r) }]);
    return r;
  }

  public getMessages(userId: string): ChatMessage[] {
    return loadAppRows<ChatMessage>(userId, 'app_messages');
  }

  public addMessage(msg: ChatMessage): ChatMessage {
    putAppRows(msg.userId, 'app_messages', [{ id: msg.id, ts: msg.createdAt, json: JSON.stringify(msg) }]);
    return msg;
  }

  public getAccessLog(userId?: string): AccessLogEntry[] {
    // Newest first, like the old store (the agent store reads oldest first): "Who sees it" and the
    // monitor show the latest reads, not the oldest ones.
    if (userId) return loadAppAccessLog<AccessLogEntry>(userId).reverse();
    return listCustomers().flatMap((uid) => loadAppAccessLog<AccessLogEntry>(uid)).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  public addAccessLogEntry(log: AccessLogEntry): AccessLogEntry {
    putAppAccessLog(log.userId, [{ id: log.id, at: log.timestamp, json: JSON.stringify(log) }]);
    // Retention (the old store's policy, now per customer): keep the newest 200. Only NEW entries
    // trim - the migration writes history verbatim and never truncates it.
    const all = loadAppAccessLog<AccessLogEntry>(log.userId);
    if (all.length > 200) deleteAppAccessLogRows(log.userId, all.slice(0, all.length - 200).map((x) => x.id));
    return log;
  }

  public getTopicLog(userId?: string): TopicLogEntry[] {
    if (userId) return loadAppRows<TopicLogEntry>(userId, 'app_topic_log');
    return listCustomers().flatMap((uid) => loadAppRows<TopicLogEntry>(uid, 'app_topic_log'));
  }

  public addTopicLogEntry(entry: TopicLogEntry): TopicLogEntry {
    putAppRows(entry.userId, 'app_topic_log', [{ id: entry.id, ts: entry.timestamp, json: JSON.stringify(entry) }]);
    return entry;
  }

  // ---- Undo records: cabinet history, in the Context Memory DB ----
  public addUndoRecord(record: UndoRecord): UndoRecord {
    appWrites.putUndo(record.userId, record);
    return record;
  }

  public getUndoRecord(undoToken: string): UndoRecord | undefined {
    for (const uid of listCustomers()) {
      const r = cmGetUndo(uid, undoToken);
      if (r) return r;
    }
    return undefined;
  }

  public removeUndoRecord(undoToken: string): boolean {
    for (const uid of listCustomers()) {
      const reply = appWrites.removeUndo(uid, undoToken) as { removed?: boolean };
      if (reply.removed) return true;
    }
    return false;
  }

  // ---- v14: conversations, partner earnings, one-time shares
  public getConversations(userId: string): Conversation[] {
    return loadAppRows<Conversation>(userId, 'app_conversations');
  }

  public getConversation(id: string): Conversation | undefined {
    for (const uid of listCustomers()) {
      const c = loadAppRows<Conversation>(uid, 'app_conversations').find((x) => x.id === id);
      if (c) return c;
    }
    return undefined;
  }

  public addConversation(c: Conversation): Conversation {
    putAppRows(c.userId, 'app_conversations', [{ id: c.id, ts: c.createdAt, json: JSON.stringify(c) }]);
    return c;
  }

  public touchConversation(id: string, updates: Partial<Conversation> = {}) {
    const c = this.getConversation(id);
    if (!c) return;
    const next = { ...c, ...updates, updatedAt: new Date().toISOString() };
    putAppRows(c.userId, 'app_conversations', [{ id: c.id, ts: c.createdAt, json: JSON.stringify(next) }]);
  }

  public updateMessage(id: string, updates: Partial<ChatMessage>) {
    for (const uid of listCustomers()) {
      const m = loadAppRows<ChatMessage>(uid, 'app_messages').find((x) => x.id === id);
      if (m) {
        const next = { ...m, ...updates };
        putAppRows(uid, 'app_messages', [{ id: m.id, ts: m.createdAt, json: JSON.stringify(next) }]);
        return next;
      }
    }
    return undefined;
  }

  public getEarnings(userId: string): Earning[] {
    return loadAppBankRows<Earning>(userId, 'app_earnings');
  }

  public addEarning(e: Earning): Earning {
    putAppBankRows(e.userId, 'app_earnings', [{ id: e.id, at: e.createdAt, json: JSON.stringify(e) }]);
    return e;
  }

  // ---- One-time shares: standing permissions live in the Context Memory DB ----
  public getShares(userId: string): Share[] {
    return loadShares(userId);
  }

  public addShare(x: Share): Share {
    appWrites.putShare(x.userId, x);
    return x;
  }

  public updateShare(id: string, updates: Partial<Share>) {
    for (const uid of listCustomers()) {
      const x = loadShares(uid).find((y) => y.id === id);
      if (x) {
        const next = { ...x, ...updates };
        appWrites.putShare(uid, next);
        return next;
      }
    }
    return undefined;
  }
}

export const db = new Database();
