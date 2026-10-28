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
} from '../types.js';

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
      roleDescription: 'Salary grew to €3,900; saving for flat with partner in 18 mo; car goal is stale.',
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
      detail: '€12,000 by December 2025 (no contribution since Feb 2024)',
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
      detail: '€30,000 deposit target in about 18 months',
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
      title: 'Your salary went up in April 2026',
      detail: 'From €3,400 to €3,900 a month. Is this right?',
      source: 'nordea',
      status: 'active',
      private: false,
      readableBy: { abel: true, offers: false },
      provenance: { channel: 'system', detectedFrom: 'transactions' },
      why: 'Your last 6 salary payments were €3,900. Before April they were €3,400.',
      reviewed: false,
      createdAt: '2026-05-25T16:00:00.000Z',
      updatedAt: '2026-05-25T16:00:00.000Z',
    },
    {
      id: 'lauri-obs-restaurants',
      userId: 'lauri',
      type: 'observation',
      title: "You've been eating out more",
      detail: 'About €390 a month lately. Usually about €160.',
      source: 'nordea',
      status: 'active',
      private: false,
      readableBy: { abel: true, offers: false },
      provenance: { channel: 'system', detectedFrom: 'transactions' },
      why: 'Restaurant payments averaged €390 a month in August–October. In the 12 months before, €160. Numbers can’t tell us why, so we ask.',
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
      detail: '€3,000 kept in safe reserve',
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
      detail: 'Reliable €1,850/mo deposited on the 4th of each month',
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
        'Salary increased to €3,900',
      ],
      blockedReasons: [
        {
          title: 'Dining out rose to ~€390/mo',
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
  };
}

class Database {
  private state: DatabaseState;

  constructor() {
    this.ensureDataDir();
    this.state = this.loadState();
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
        return JSON.parse(raw);
      } catch (err) {
        console.warn('Could not read existing DB file. Initializing fresh seed.', err);
      }
    }
    const seed = getInitialState();
    this.saveState(seed);
    return seed;
  }

  private saveState(state: DatabaseState) {
    try {
      this.ensureDataDir();
      fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write db state to disk:', err);
    }
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

  public addCabinetEntry(entry: CabinetEntry): CabinetEntry {
    this.state.cabinetEntries.push(entry);
    this.saveState(this.state);
    return entry;
  }

  public updateCabinetEntry(id: string, updates: Partial<CabinetEntry>): CabinetEntry | undefined {
    const idx = this.state.cabinetEntries.findIndex((e) => e.id === id);
    if (idx === -1) return undefined;
    this.state.cabinetEntries[idx] = {
      ...this.state.cabinetEntries[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.saveState(this.state);
    return this.state.cabinetEntries[idx];
  }

  public deleteCabinetEntry(id: string): boolean {
    const initLen = this.state.cabinetEntries.length;
    this.state.cabinetEntries = this.state.cabinetEntries.filter((e) => e.id !== id);
    if (this.state.cabinetEntries.length !== initLen) {
      this.saveState(this.state);
      return true;
    }
    return false;
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
}

export const db = new Database();
