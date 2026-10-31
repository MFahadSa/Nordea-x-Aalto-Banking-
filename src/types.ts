export type PersonaId = 'lauri' | 'eeva' | 'alex';

export type ViewMode = 'full' | 'calm';

export interface User {
  id: string;
  /** Customer turned partner offers off (Who sees it → Partner offers). */
  offersOff?: boolean;
  /** Points already spent on rewards. Spending never lowers the level (level uses points + pointsSpent). */
  pointsSpent?: number;
  redeemed?: { rewardId: string; title: string; pts: number; at: string }[];
  /** Where the account data last came from (upload or the Supabase feed). Seed data when missing. */
  nordeaData?: { from: string; at: string; transactions: number; balances: boolean };
  /** Extra monthly saving the customer set up with Abel (simulated standing order). */
  extraMonthly?: number;
  persona: PersonaId;
  name: string;
  age: number;
  roleDescription: string;
  viewMode: ViewMode;
  layoutPrefs: {
    widgetsOrder: string[];
    hiddenWidgets: string[];
  };
  accounts: {
    current: { iban: string; balance: number };
    savings: { iban: string; balance: number; monthlyDeposit: number };
    carFund?: { iban: string; balance: number; lastContribution?: string };
  };
  points: number;
}

export type CabinetEntryType = 'goal' | 'life_event' | 'preference' | 'fact' | 'observation' | 'blind_spot';
export type CabinetEntrySource = 'customer' | 'nordea' | 'document';
export type CabinetEntryStatus = 'active' | 'stale' | 'archived' | 'disputed';

export interface CabinetEntry {
  id: string;
  userId: string;
  type: CabinetEntryType;
  title: string;
  detail: string;
  source: CabinetEntrySource;
  status: CabinetEntryStatus;
  private: boolean;
  readableBy: {
    abel: boolean;
    offers: boolean;
    [agentId: string]: boolean;
  };
  provenance: {
    channel: 'app' | 'whatsapp' | 'staff' | 'system';
    documentId?: string;
    page?: number;
    messageId?: string;
    detectedFrom?: string;
  };
  target?: {
    amount: number;
    date: string; // YYYY-MM-DD
  };
  linked?: {
    lastContribution?: string;
  };
  why?: string;
  /** For Nordea observations: what the conclusion rests on, so it can be checked and redone. */
  evidence?: {
    /** Transactions the observation was computed from. */
    transactionIds?: string[];
    /** Analysis window (YYYY-MM or YYYY-MM-DD). */
    periodFrom?: string;
    periodTo?: string;
    /** When the app last computed this from the account data. */
    computedAt: string;
    /** Fingerprint of the inputs; a mismatch means the data moved on and this needs recomputing. */
    inputsHash?: string;
  };
  reviewed: boolean;
  goalType?: 'home' | 'car' | 'travel' | 'buffer' | 'other';
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentManifest {
  id: string;
  name: string;
  purpose: string;
  needs: string[];
  mayRead: CabinetEntryType[];
  neverRead: string[];
  canAct: boolean;
  nordeaEarnsMoney: boolean;
  avatarColor: string;
}

export interface AccessLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  agentId: string;
  agentName: string;
  purpose: string;
  itemsReadCount: number;
  blockedCount: number;
  allowedItems: string[];
  /** Ids of the entries read (newer logs), for counting how often each note is used. */
  allowedIds?: string[];
  blockedReasons: { title: string; reason: string }[];
}

/** Points the customer earns from their data: once for each note they share, and each time it's actually read. */
export interface DataReward {
  id: string;
  userId: string;
  kind: 'shared' | 'used';
  points: number;
  /** shared: the note that became shared. used: the notes that were read. */
  entryIds: string[];
  agentId?: string;
  what: string;
  at: string;
}

export interface TopicLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  topic: string;
  couldHelp: boolean;
}

export interface UndoRecord {
  undoToken: string;
  timestamp: string;
  userId: string;
  action: string;
  description: string;
  previousEntry?: CabinetEntry | null;
  entryId?: string;
  /** For one undo that covers several new entries (e.g. an import). */
  entryIds?: string[];
}

export interface Transaction {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD booking date
  category: 'salary' | 'housing' | 'groceries' | 'restaurants' | 'transport' | 'bills' | 'subscriptions' | 'shopping' | 'pharmacy' | 'savings_transfer' | 'savings_transfer_in' | 'pension' | 'other';
  amount: number;
  account: 'current' | 'savings';
  description?: string;
  // ---- Banking detail (all optional; unknown stays unknown, never invented) ----
  /** The bank's own stable reference for this transaction, when the feed supplies one. */
  bankId?: string;
  /** YYYY-MM-DD value date, when supplied and different from the booking date. */
  valueDate?: string;
  /** Booked transactions are final; pending ones can still change or disappear. */
  status?: 'booked' | 'pending';
  /** ISO 4217 currency, e.g. 'EUR'. Only set when the data says so. */
  currency?: string;
  /** Payee/payer name as the bank recorded it. */
  counterparty?: string;
  /** Payment reference or message as recorded by the bank. */
  reference?: string;
  /** How the payment was made (card purchase, credit transfer, direct debit…), when supplied. */
  paymentMethod?: string;
  /** The category exactly as the feed supplied it, before the app normalized it. */
  originalCategory?: string;
  /** Who assigned `category`: the feed supplied it ('feed' - which is NOT proof the bank authored it;
      upstream tooling may already have normalized it), or the app's keyword guess ('app'). */
  categorySource?: 'feed' | 'app';
  /** Which import brought this transaction in (see ImportBatch). */
  batchId?: string;
}

/** One explicit account record per account the customer has. The app's User.accounts stays the live
    view; this is the stable registry that transactions, balance snapshots and feeds refer to.
    Fields are only set when known - never invented. */
export interface BankAccount {
  id: string;
  userId: string;
  /** Stable key transactions and balance snapshots use: 'current' | 'savings' | 'carFund' | future keys. */
  key: string;
  /** Product type when known ('current account', 'savings', 'ASP'...). Unknown stays unknown. */
  type?: string;
  iban?: string;
  currency?: string;
}

/** A dated balance for one account, kept so balance history survives later imports. */
export interface BalanceSnapshot {
  id: string;
  userId: string;
  /** Which account: 'current' | 'savings' | 'carFund' (or a future account key). */
  accountKey: string;
  balance: number;
  /** ISO date the balance is for (the import day, unless the feed says otherwise). */
  at: string;
  /** Where it came from, e.g. 'Supabase nordea_feed row 12' or 'Uploaded file'. */
  source: string;
  batchId?: string;
}

/** One application of new Nordea account data: what came in and what the app did with it. */
export interface ImportBatch {
  id: string;
  userId: string;
  /** Where the data came from (feed row, uploaded file). */
  source: string;
  /** snapshot = the feed replaced the whole statement; incremental = new rows were merged in. */
  mode: 'snapshot' | 'incremental';
  at: string;
  /** Rows received, newly stored, skipped as duplicates, rejected as unreadable. */
  received: number;
  added: number;
  skipped: number;
  rejected: number;
  /** Rows the bank re-sent with changed content (e.g. pending -> booked): corrected in place. */
  updated?: number;
}

export interface MessageCard {
  type:
    | 'goal_status'
    | 'undo_banner'
    | 'access_check'
    | 'account_summary'
    | 'info'
    | 'offer'
    | 'offer_list'
    | 'import'
    | 'handoff'
    | 'confirm_save'
    | 'confirm_plan'
    | 'duplicate';
  title?: string;
  body?: string;
  data?: Record<string, any>;
}

export interface ChatMessage {
  id: string;
  userId: string;
  agentId: string;
  channel: 'app' | 'whatsapp' | 'staff';
  sender: 'user' | 'agent' | 'system';
  /** Which conversation (chat thread) this message belongs to. */
  conversationId?: string;
  /** Which helper the conversation is with (abel, autopilot, budget, invest, life, leaks, person). */
  helperId?: string;
  text: string;
  /** Cabinet entries Abel actually relied on for this reply (checked against what the gateway returned). */
  usedEntryIds?: string[];
  /** A file or photo the customer sent (a small thumbnail is kept for photos, never the full file). */
  attachment?: {
    name: string;
    kind: 'image' | 'pdf' | 'text' | 'sheet';
    /** Small preview, only when the customer chose to keep a copy. */
    thumb?: string;
    size?: number;
    /** Set when the customer ticked "Keep a copy": the file is in Your documents. */
    documentId?: string;
    /** True once the kept copy was deleted (by the customer or after 30 days). */
    deleted?: boolean;
  };
  /** Set when no AI answered and the bank's own code did (shown as a small label, so it's never mistaken for the AI). */
  answeredBy?: 'bank_code';
  /** What Abel was given for this reply (not proof of what it used): approved notes and the demo account data. */
  supplied?: { notes: number; accountData: boolean };
  /** Technical reason when Abel couldn't answer (shown small, for debugging the demo). */
  errorInfo?: string;
  /** Set when the customer tapped a button on this message, so it can't be tapped twice. */
  resolved?: string;
  suggestions?: string[];
  cards?: MessageCard[];
  notes?: {
    text: string;
    undoToken?: string;
    entryId?: string;
  }[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  helperId: string;
  createdAt: string;
  updatedAt: string;
  /** Partner ids already offered in this conversation (max one offer per partner per chat). */
  offered: string[];
}

export interface PartnerItem {
  title: string;
  sub: string;
  price: number;
  per?: string;
}

export interface PartnerManifest {
  id: string;
  name: string;
  initials: string;
  color: string;
  kind: string;
  /** When Abel may suggest this partner (given to the model as a description). */
  when: string;
  cta: string;
  view: string;
  buy: string;
  verb: string;
  alternative: string;
  /** How Nordea is paid. Computed in code, never by the model. */
  fee: { type: 'percent' | 'flat' | 'percentOfYear'; value: number };
  /** Share of Nordea's fee given back to the customer's savings. */
  shareBack: number;
  feeText: string;
  items: PartnerItem[];
}

export interface Earning {
  id: string;
  userId: string;
  partnerId: string;
  partnerName: string;
  what: string;
  fee: number;
  back: number;
  createdAt: string;
}

export interface Share {
  id: string;
  userId: string;
  agentId: string;
  items: string[];
  createdAt: string;
  until: string;
  revoked: boolean;
  revokedAt?: string;
}

/** A file the customer chose to keep ("Keep a copy"). Deleted automatically after 30 days. */
export interface StoredDocument {
  id: string;
  userId: string;
  name: string;
  kind: 'image' | 'pdf' | 'text' | 'sheet';
  mimeType: string;
  size: number;
  /** Where the bytes are: Supabase Storage (or data/documents/ without Supabase). */
  storagePath: string;
  conversationId?: string;
  messageId?: string;
  /** Things the customer saved from this file. */
  entryIds: string[];
  createdAt: string;
  expiresAt: string;
  /** The text Abel read from it (kept copies only, deleted with the file), so Abel can answer questions about it. */
  readText?: string;
}

/** One change to one thing in What Abel knows. Labels and values only, never chat text. */
export interface EntryEvent {
  id: string;
  entryId: string;
  userId: string;
  at: string;
  action: 'added' | 'changed' | 'removed' | 'brought_back' | 'confirmed' | 'marked_wrong' | 'deleted' | 'undone';
  /** Who made the change: the customer, Abel (from what the customer said) or Nordea (noticed in transactions). */
  by: 'you' | 'abel' | 'nordea';
  /** Where it happened, e.g. "In chat", "From payslip.pdf", "Undo". */
  how?: string;
  title: string;
  changes?: { field: string; from: unknown; to: unknown }[];
}
