/**
 * Shared types for the three-agent architecture. No database access in this file -
 * it is the one module every agent may import without crossing a boundary.
 */
import type { BankAccount, Transaction } from '../../types.js';

export type AgentId = 'personal' | 'cm' | 'nordea';
export const AGENTS: { id: AgentId; name: string; owns: string }[] = [
  { id: 'personal', name: 'Personal agent', owns: 'User DB (your profile, goals, personal facts)' },
  { id: 'cm', name: 'Context Memory agent', owns: 'Context Memory DB (the shared context cabinet)' },
  { id: 'nordea', name: 'Nordea agent', owns: 'Nordea DB (accounts and transactions)' },
];

export interface Goal { id: string; title: string; detail: string; createdAt: string; }
export interface PersonalFact { id: string; source: string; text: string; at: string; viaAirlockId: string; }
export interface PersonalAgentSettings { mode: 'abel' | 'external'; externalName?: string; connectedAt?: string; simulated?: boolean; }
export interface UserDb {
  userId: string;
  profileName?: string;
  goals: Goal[];
  personalFacts: PersonalFact[];
  personalAgent: PersonalAgentSettings;
  /** Legacy home of the agent off-switches; the bus coordination key is canonical. */
  agentsOff: AgentId[];
}
export interface ArchEntry {
  id: string;
  title: string;
  detail: string;
  goalIds: string[];
  proposedBy: AgentId | 'user';
  viaMessageId?: string;
  evidence?: { transactionIds?: string[]; transactionIdsHash?: string; total?: number; note?: string };
  observed?: 'observed' | 'inferred';
  risk?: 'low' | 'medium' | 'high'; // AC7: code-rule risk level from risk.ts
  autoAccepted?: boolean; // AC7: stored automatically under the customer's standing permissions
  status: 'active' | 'disputed' | 'stale';
  disputeReason?: string;
  createdAt: string;
}
export interface CmDb { userId: string; entries: ArchEntry[]; parked?: boolean; permissions?: { reviewLevel: 'all' | 'high' } }
export interface NordeaDb { userId: string; accounts: BankAccount[]; transactions: Transaction[]; }

export type MessageType = 'propose' | 'query' | 'reply' | 'inform' | 'flag-stale' | 'refresh' | 'round-start' | 'done' | 'control';
export interface AgentMessage {
  id: string;
  at: string;
  from: AgentId | 'app';
  to: AgentId | 'user' | 'app';
  type: MessageType;
  summary: string;
  payload?: Record<string, unknown>;
  status: 'pending' | 'accepted' | 'rejected' | 'answered' | 'read';
}
export interface AirlockItem { id: string; kind: string; text: string; }
export interface AirlockBatch {
  id: string;
  at: string;
  source: string; // whatsapp | calendar | notes | email
  items: AirlockItem[];
  status: 'pending' | 'approved' | 'rejected';
  decidedAt?: string;
}
export interface Bus { messages: AgentMessage[]; airlock: AirlockBatch[]; }

export interface StaleFlag { entryId: string; title: string; was: number | null; nowIs: number; reason?: 'evidence' | 'aged' | 'missing-evidence' | 'goal-removed' }

/** A build round: the lifecycle one shared-context build goes through (AC6). */
export interface BuildRound {
  id: string;
  trigger: 'contribution' | 'decay' | 'session' | 'topup';
  state: 'open' | 'collecting' | 'finalizing' | 'stored' | 'step-limit' | 'failed';
  participants: AgentId[];
  sessionId?: string;
  question?: string;
  doneSignals: AgentId[];
  steps: number;
  maxSteps: number;
  proposals: { messageId: string; title: string; detail: string; matched: number; total: number }[];
  staleFlags: StaleFlag[];
  startedAt: string;
  closedAt?: string;
  note?: string;
}

export class ArchError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const now = () => new Date().toISOString();
let seq = 0;
export const newId = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export { now };
