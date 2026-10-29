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
} from '../types.js';
import { Remote, Row, supabaseConfigured, supabaseRemote, cleanErr } from './store.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
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
const LISTS = ['cabinetEntries', 'transactions', 'messages', 'accessLog', 'topicLog', 'undoRecords', 'conversations', 'earnings', 'shares', 'documents', 'entryHistory'] as const;
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
  mode: 'supabase' | 'file';
  ok: boolean;
  message: string;
  lastSavedAt?: string;
  lastError?: { at: string; message: string };
  rows?: number;
  waiting: number;
}

function generateTransactionsForLauri(): Transaction[] {
  const tx: Transaction[] = [];
  const startYear = 2024;
  const startMonth = 11; // 24 months ending October 2026

  let curY = startYear;
  let curM = startMonth;

  for (let i = 0; i < 24; i++) {
    const monthStr = `${curY}-${String(curM).padStart(2, '0')}`;
    const isRaisedSalary = i >= 18; // last 6 months (May 2026 - Oct 2026)
    const isHigherEatingOut = i >= 21; // last 3 months (Aug, Sep, Oct 2026)

    // Salary (25th of month)
    tx.push({
      id: `tx-sal-${monthStr}`,
      userId: 'lauri',
      date: `${monthStr}-25`,
      category: 'salary',
      amount: isRaisedSalary ? 3900 : 3400,
      account: 'current',
      description: 'Nordea Payroll Deposit',
    });

    // Housing (1st of month)
    tx.push({
      id: `tx-house-${monthStr}`,
      userId: 'lauri',
      date: `${monthStr}-01`,
      category: 'housing',
      amount: -1150,
      account: 'current',
      description: 'Rent & Housing charge',
    });

    // Transport (3rd of month)
    tx.push({
      id: `tx-trans-${monthStr}`,
      userId: 'lauri',
      date: `${monthStr}-03`,
      category: 'transport',
      amount: -59,
      account: 'current',
      description: 'HSL Regional Transit Card',
    });

    // Monthly Savings Transfer (26th of month)
    tx.push({
      id: `tx-sav-out-${monthStr}`,
      userId: 'lauri',
      date: `${monthStr}-26`,
      category: 'savings_transfer',
      amount: -400,
      account: 'current',
      description: 'Monthly Savings Transfer',
    });
    tx.push({
      id: `tx-sav-in-${monthStr}`,
      userId: 'lauri',
      date: `${monthStr}-26`,
      category: 'savings_transfer_in',
      amount: 400,
      account: 'savings',
      description: 'Auto deposit from Current Account',
    });

    // Groceries (spread out)
    tx.push({
      id: `tx-groc1-${monthStr}`,
      userId: 'lauri',
      date: `${monthStr}-07`,
      category: 'groceries',
      amount: -195,
      account: 'current',
      description: 'K-Supermarket Kamppi',
    });
    tx.push({
      id: `tx-groc2-${monthStr}`,
      userId: 'lauri',
      date: `${monthStr}-20`,
      category: 'groceries',
      amount: -215,
      account: 'current',
      description: 'Prisma Kaari',
    });

    // Restaurants
    const eatingOutAmount = isHigherEatingOut
      ? (i === 21 ? -390 : i === 22 ? -420 : -365)
      : -160;
    tx.push({
      id: `tx-rest-${monthStr}`,
      userId: 'lauri',
      date: `${monthStr}-14`,
      category: 'restaurants',
      amount: eatingOutAmount,
      account: 'current',
      description: isHigherEatingOut ? 'Restaurants & Dining (Elevated)' : 'Restaurants & Cafes',
    });

    // Bills & Subscriptions
    tx.push({
      id: `tx-bills-${monthStr}`,
      userId: 'lauri',
      date: `${monthStr}-18`,
      category: 'bills',
      amount: -45,
      account: 'current',
      description: 'Electricity & Internet',
    });

    curM++;
    if (curM > 12) {
      curM = 1;
      curY++;
    }
  }

  return tx;
}

function generateTransactionsForEeva(): Transaction[] {
  const tx: Transaction[] = [];
  const months = ['2026-08', '2026-09', '2026-10'];
  for (const m of months) {
    tx.push({
      id: `tx-pension-${m}`,
      userId: 'eeva',
      date: `${m}-04`,
      category: 'pension',
      amount: 1850,
      account: 'current',
      description: 'Keva Retirement Pension',
    });
    tx.push({
      id: `tx-eeva-house-${m}`,
      userId: 'eeva',
      date: `${m}-02`,
      category: 'housing',
      amount: -520,
      account: 'current',
      description: 'Maintenance fee (Vastike)',
    });
    tx.push({
      id: `tx-eeva-pharm-${m}`,
      userId: 'eeva',
      date: `${m}-12`,
      category: 'pharmacy',
      amount: -45,
      account: 'current',
      description: 'Yliopiston Apteekki',
    });
    tx.push({
      id: `tx-eeva-groc-${m}`,
      userId: 'eeva',
      date: `${m}-15`,
      category: 'groceries',
      amount: -310,
      account: 'current',
      description: 'Alepa & Market',
    });
  }
  return tx;
}

function getInitialState(): DatabaseState {
  const users: Record<string, User> = {
    lauri: {
      id: 'lauri',
      persona: 'lauri',
      name: 'Lauri',
      age: 31,
      roleDescription: 'Salary grew to 3 900 €; saving for flat with partner in 18 mo; car goal is stale.',
      viewMode: 'full',
      layoutPrefs: {
        widgetsOrder: ['quickActions', 'goals', 'accounts', 'insights', 'cabinet'],
        hiddenWidgets: [],
      },
      accounts: {
        current: { iban: 'FI29 1234 5678 9012 34', balance: 1420.5 },
        savings: { iban: 'FI29 1234 5678 9012 35', balance: 14600.0, monthlyDeposit: 400.0 },
        carFund: { iban: 'FI29 1234 5678 9012 36', balance: 2350.0, lastContribution: '2024-02-28' },
      },
      points: 120,
    },
    eeva: {
      id: 'eeva',
      persona: 'eeva',
      name: 'Eeva',
      age: 72,
      roleDescription: 'Retired, careful with data, pension income, desires calm & simplicity.',
      viewMode: 'calm',
      layoutPrefs: {
        widgetsOrder: ['quickActions', 'accounts', 'goals', 'cabinet'],
        hiddenWidgets: ['insights'],
      },
      accounts: {
        current: { iban: 'FI88 2345 6789 0123 45', balance: 890.0 },
        savings: { iban: 'FI88 2345 6789 0123 46', balance: 3200.0, monthlyDeposit: 100.0 },
      },
      points: 80,
    },
    alex: {
      id: 'alex',
      persona: 'alex',
      name: 'Alex',
      age: 26,
      roleDescription: 'New customer with a fresh, empty Context Cabinet.',
      viewMode: 'full',
      layoutPrefs: {
        widgetsOrder: ['quickActions', 'goals', 'accounts', 'cabinet'],
        hiddenWidgets: [],
      },
      accounts: {
        current: { iban: 'FI44 3456 7890 1234 56', balance: 650.0 },
        savings: { iban: 'FI44 3456 7890 1234 57', balance: 1200.0, monthlyDeposit: 150.0 },
      },
      points: 20,
    },
  };

  const cabinetEntries: CabinetEntry[] = [
    // Lauri's Entries
    {
      id: 'lauri-car-goal',
      userId: 'lauri',
      type: 'goal',
      title: 'Save for a car',
      detail: '12 000 € by December 2025 (no contribution since Feb 2024)',
      source: 'customer',
      status: 'stale',
      private: false,
      readableBy: { abel: true, offers: true },
      provenance: { channel: 'app' },
      target: { amount: 12000, date: '2025-12-31' },
      linked: { lastContribution: '2024-02-28' },
      why: 'Target date passed and no funds added in over 12 months.',
      reviewed: true,
      goalType: 'car',
      createdAt: '2023-03-14T10:00:00.000Z',
      updatedAt: '2024-02-28T10:00:00.000Z',
    },
    {
      id: 'lauri-home-goal',
      userId: 'lauri',
      type: 'goal',
      title: 'Buy a flat with my partner',
      detail: '30 000 € deposit target in about 18 months',
      source: 'customer',
      status: 'active',
      private: false,
      readableBy: { abel: true, offers: true },
      provenance: { channel: 'app' },
      target: { amount: 30000, date: '2028-04-30' },
      reviewed: true,
      goalType: 'home',
      confirmedAt: '2026-10-01T09:00:00.000Z',
      createdAt: '2026-05-15T08:00:00.000Z',
      updatedAt: '2026-10-01T09:00:00.000Z',
    },
    {
      id: 'lauri-pref-risk',
      userId: 'lauri',
      type: 'preference',
      title: 'I prefer low-risk saving',
      detail: 'Focus on guaranteed deposits; no stock market investing for now',
      source: 'customer',
      status: 'active',
      private: false,
      readableBy: { abel: true, offers: true },
      provenance: { channel: 'app' },
      reviewed: true,
      confirmedAt: '2025-02-11T12:00:00.000Z',
      createdAt: '2022-05-09T14:30:00.000Z',
      updatedAt: '2025-02-11T12:00:00.000Z',
    },
    {
      id: 'lauri-obs-salary',
      userId: 'lauri',
      type: 'observation',
      title: 'Your salary went up in May 2026',
      detail: 'From 3 400 € to 3 900 € a month.',
      source: 'nordea',
      status: 'active',
      private: false,
      readableBy: { abel: true, offers: false },
      provenance: { channel: 'system', detectedFrom: 'transactions' },
      why: 'Your last 6 salary payments were 3 900 €. Before May they were 3 400 €.',
      reviewed: false,
      createdAt: '2026-05-25T16:00:00.000Z',
      updatedAt: '2026-05-25T16:00:00.000Z',
    },
    {
      id: 'lauri-obs-restaurants',
      userId: 'lauri',
      type: 'observation',
      title: "You've been eating out more",
      detail: 'About 390 € a month lately. Usually about 160 €.',
      source: 'nordea',
      status: 'active',
      private: false,
      readableBy: { abel: true, offers: false },
      provenance: { channel: 'system', detectedFrom: 'transactions' },
      why: 'Restaurant payments averaged 390 € a month in August–October. In the 12 months before, 160 €. Numbers can’t tell us why, so we ask.',
      reviewed: false,
      createdAt: '2026-10-15T09:00:00.000Z',
      updatedAt: '2026-10-15T09:00:00.000Z',
    },

    // Eeva's Entries
    {
      id: 'eeva-buffer-goal',
      userId: 'eeva',
      type: 'goal',
      title: 'Peace of mind emergency buffer',
      detail: '3 000 € kept in safe reserve',
      source: 'customer',
      status: 'active',
      private: false,
      readableBy: { abel: true, offers: false },
      provenance: { channel: 'app' },
      target: { amount: 3000, date: '2026-12-31' },
      reviewed: true,
      goalType: 'buffer',
      confirmedAt: '2026-09-10T11:00:00.000Z',
      createdAt: '2025-01-10T11:00:00.000Z',
      updatedAt: '2026-09-10T11:00:00.000Z',
    },
    {
      id: 'eeva-pref-calm',
      userId: 'eeva',
      type: 'preference',
      title: 'Plain language and calm interface',
      detail: 'No complicated financial terminology; always offer a person when in doubt',
      source: 'customer',
      status: 'active',
      private: false,
      readableBy: { abel: true, offers: false },
      provenance: { channel: 'app' },
      reviewed: true,
      createdAt: '2025-01-10T11:15:00.000Z',
      updatedAt: '2025-01-10T11:15:00.000Z',
    },
    {
      id: 'eeva-fact-pension',
      userId: 'eeva',
      type: 'fact',
      title: 'Keva retirement pension income',
      detail: 'Reliable 1 850 €/mo deposited on the 4th of each month',
      source: 'nordea',
      status: 'active',
      private: false,
      readableBy: { abel: true, offers: false },
      provenance: { channel: 'system', detectedFrom: 'transactions' },
      reviewed: true,
      createdAt: '2025-02-04T10:00:00.000Z',
      updatedAt: '2025-02-04T10:00:00.000Z',
    },
  ];

  const transactions: Transaction[] = [
    ...generateTransactionsForLauri(),
    ...generateTransactionsForEeva(),
  ];

  const messages: ChatMessage[] = [
    {
      id: 'msg-seed-1',
      userId: 'lauri',
      agentId: 'abel',
      channel: 'app',
      sender: 'agent',
      text: 'Hi Lauri! 👋 I’m Abel, your banking assistant. Everything I know about you is kept in your Context Cabinet. What would you like to explore today?',
      suggestions: [
        'Am I on track for my flat deposit?',
        'What changed in my spending lately?',
        'Review my old car goal',
      ],
      createdAt: '2026-10-28T09:00:00.000Z',
    },
    {
      id: 'msg-seed-eeva-1',
      userId: 'eeva',
      agentId: 'abel',
      channel: 'app',
      sender: 'agent',
      text: 'Good day Eeva. I am Abel. I keep things calm and straightforward here. If you ever have a question or wish to speak with an adviser, just let me know.',
      suggestions: ['Check my emergency buffer', 'Talk to a person at Nordea'],
      createdAt: '2026-10-28T09:00:00.000Z',
    },
    {
      id: 'msg-seed-alex-1',
      userId: 'alex',
      agentId: 'abel',
      channel: 'app',
      sender: 'agent',
      text: 'Welcome to Nordea, Alex! 🎉 I’m Abel. Your Context Cabinet is currently completely empty. Tell me what you are planning or tap a suggestion below!',
      suggestions: ['Help me set a savings goal', 'How does the Context Cabinet work?'],
      createdAt: '2026-10-28T09:00:00.000Z',
    },
  ];

  const accessLog: AccessLogEntry[] = [
    {
      id: 'log-seed-1',
      timestamp: '2026-10-28T09:00:00.000Z',
      userId: 'lauri',
      agentId: 'abel',
      agentName: 'Abel',
      purpose: 'Initial welcome check and goal pacing preview',
      itemsReadCount: 4,
      blockedCount: 1,
      allowedItems: [
        'Buy a flat with my partner',
        'Save for a car',
        'I prefer low-risk saving',
        'Salary increased to 3 900 €',
      ],
      blockedReasons: [
        {
          title: 'Dining out rose to ~390 €/mo',
          reason: 'Observation pending customer review/approval',
        },
      ],
    },
  ];

  const topicLog: TopicLogEntry[] = [
    {
      id: 'topic-seed-1',
      timestamp: '2026-10-28T09:00:00.000Z',
      userId: 'lauri',
      topic: 'home_deposit_pacing',
      couldHelp: true,
    },
  ];

  return {
    users,
    cabinetEntries,
    transactions,
    messages,
    accessLog,
    topicLog,
    undoRecords: [],
    conversations: [],
    earnings: [],
    shares: [],
    documents: [],
    entryHistory: historyFor(cabinetEntries),
  };
}

/** Older saved databases don't have the v14 tables yet: add them without touching anything else. */
function migrate(state: DatabaseState): DatabaseState {
  state.conversations = state.conversations || [];
  state.earnings = state.earnings || [];
  state.shares = state.shares || [];
  state.documents = state.documents || [];
  if (!state.entryHistory) state.entryHistory = historyFor(state.cabinetEntries || []);
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

  constructor() {
    this.ensureDataDir();
    this.state = this.loadState();
  }

  /**
   * Connect to Supabase if its secrets are set. Called once before the server starts.
   * An empty table gets today's data (so nothing is lost when switching over); otherwise Supabase wins.
   */
  public async init() {
    if (!supabaseConfigured()) return;
    const remote = supabaseRemote();
    try {
      const rows = await remote.loadAll();
      this.remote = remote;
      if (rows.length) {
        this.state = migrate(fromRows(rows));
        rows.forEach((r) => this.synced.set(`${r.kind}:${r.id}`, JSON.stringify(r.data)));
        this.writeFile();
      }
      await this.flush();
      this.st = { ...this.st, mode: 'supabase', ok: !this.st.lastError, message: 'Saved in Supabase', rows: this.synced.size };
      console.log(`Database: Supabase (${this.synced.size} records)`);
    } catch (err) {
      this.remote = null;
      const message = cleanErr(err);
      this.st = { mode: 'file', ok: false, message: `Supabase isn’t working, so data is only kept on this server for now. ${message}`, lastError: { at: new Date().toISOString(), message }, waiting: 0 };
      console.error('Database: Supabase failed, using the local file.', message);
    }
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

  private loadState(): DatabaseState {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        return migrate(JSON.parse(raw));
      } catch (err) {
        console.warn('Could not read existing DB file. Initializing fresh seed.', err);
      }
    }
    const seed = getInitialState();
    this.state = seed;
    this.writeFile();
    return seed;
  }

  private writeFile() {
    try {
      this.ensureDataDir();
      fs.writeFileSync(DB_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write db state to disk:', err);
    }
  }

  /** Every change ends here: write the local copy and queue the Supabase save. */
  private saveState(_state?: DatabaseState) {
    this.writeFile();
    this.later();
  }

  public getState(): DatabaseState {
    return this.state;
  }

  public resetToSeed(): DatabaseState {
    this.state = getInitialState();
    this.saveState(this.state);
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
