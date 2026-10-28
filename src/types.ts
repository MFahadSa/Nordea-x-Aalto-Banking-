export type PersonaId = 'lauri' | 'eeva' | 'alex';

export type ViewMode = 'full' | 'calm';

export interface User {
  id: string;
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
  type: 'goal_status' | 'undo_banner' | 'access_check' | 'account_summary' | 'info';
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
  text: string;
  suggestions?: string[];
  cards?: MessageCard[];
  notes?: {
    text: string;
    undoToken?: string;
    entryId?: string;
  }[];
  createdAt: string;
}
