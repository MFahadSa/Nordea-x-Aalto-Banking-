export type PersonaId = 'lauri' | 'eeva' | 'alex';

export type ViewMode = 'full' | 'calm';

export interface User {
  id: string;
  /** Customer turned partner offers off (Who sees it → Partner offers). */
  offersOff?: boolean;
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
  blockedReasons: { title: string; reason: string }[];
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
  date: string; // YYYY-MM-DD
  category: 'salary' | 'housing' | 'groceries' | 'restaurants' | 'transport' | 'bills' | 'subscriptions' | 'shopping' | 'pharmacy' | 'savings_transfer' | 'savings_transfer_in' | 'pension' | 'other';
  amount: number;
  account: 'current' | 'savings';
  description?: string;
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
    | 'confirm_plan';
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
  attachment?: { name: string; kind: 'image' | 'pdf' | 'text'; thumb?: string; size?: number };
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
