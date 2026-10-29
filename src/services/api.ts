import type { Conversation, Earning, Share, EntryEvent } from '../types.js';
import {
  User,
  CabinetEntry,
  Transaction,
  ChatMessage,
  AccessLogEntry,
  TopicLogEntry,
  AgentManifest,
  PersonaId,
} from '../types.js';

export async function fetchUsers(): Promise<User[]> {
  const res = await fetch('/api/users');
  if (!res.ok) throw new Error('Failed to fetch users');
  const data = await res.json();
  return data.users;
}

export async function fetchUser(userId: string): Promise<User> {
  const res = await fetch(`/api/users/${userId}`);
  if (!res.ok) throw new Error('Failed to fetch user');
  const data = await res.json();
  return data.user;
}

export async function updateUserViewMode(userId: string, viewMode: 'full' | 'calm'): Promise<User> {
  const res = await fetch(`/api/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ viewMode }),
  });
  if (!res.ok) throw new Error('Failed to update viewMode');
  const data = await res.json();
  return data.user;
}

export async function resetDatabase(): Promise<void> {
  const res = await fetch('/api/users/reset', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reset database');
}

export async function fetchCabinetEntries(userId: string, agentId?: string): Promise<{
  entries: CabinetEntry[];
  blocked?: { title: string; reason: string }[];
}> {
  const url = agentId
    ? `/api/cabinet?userId=${userId}&agentId=${agentId}`
    : `/api/cabinet?userId=${userId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch cabinet entries');
  return res.json();
}

export async function createCabinetEntry(
  entry: Partial<CabinetEntry> & { userId: string; title: string }
): Promise<{ entry: CabinetEntry; undoToken: string; message: string }> {
  const res = await fetch('/api/cabinet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error('Failed to create cabinet entry');
  return res.json();
}

export async function updateCabinetEntry(
  id: string,
  updates: Partial<CabinetEntry>
): Promise<{ entry: CabinetEntry; undoToken: string; message: string }> {
  const res = await fetch(`/api/cabinet/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update cabinet entry');
  return res.json();
}

export async function deleteCabinetEntry(
  id: string
): Promise<{ entry: CabinetEntry; undoToken: string; message: string }> {
  const res = await fetch(`/api/cabinet/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete cabinet entry');
  return res.json();
}

export async function undoCabinetAction(undoToken: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/cabinet/undo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ undoToken }),
  });
  if (!res.ok) throw new Error('Failed to undo action');
  return res.json();
}

export async function fetchAccessLog(userId?: string): Promise<AccessLogEntry[]> {
  const url = userId ? `/api/access-log?userId=${userId}` : '/api/access-log';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch access log');
  const data = await res.json();
  return data.logs;
}

export async function fetchAgents(): Promise<AgentManifest[]> {
  const res = await fetch('/api/agents');
  if (!res.ok) throw new Error('Failed to fetch agents');
  const data = await res.json();
  return data.agents;
}

export async function fetchTopics(userId?: string): Promise<TopicLogEntry[]> {
  const url = userId ? `/api/topics/log?userId=${userId}` : '/api/topics/log';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch topic log');
  const data = await res.json();
  return data.topics;
}

export async function fetchTransactions(userId: string): Promise<Transaction[]> {
  const res = await fetch(`/api/transactions?userId=${userId}`);
  if (!res.ok) throw new Error('Failed to fetch transactions');
  const data = await res.json();
  return data.transactions;
}

export async function fetchMessages(userId: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/messages?userId=${userId}`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  const data = await res.json();
  return data.messages;
}

export async function sendMessage(
  userId: string,
  text: string
): Promise<{
  userMessage: ChatMessage;
  agentMessage: ChatMessage;
  accessGateway: {
    itemsReadCount: number;
    blockedCount: number;
    allowed: string[];
    blocked: { title: string; reason: string }[];
  };
}> {
  const res = await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, text, channel: 'app' }),
  });
  if (!res.ok) throw new Error('Failed to send message');
  return res.json();
}

// ---------- v14 ----------

export interface GoalStatus {
  goalId: string; title: string; target: number; targetDate: string; saved: number; monthlyGoingIn: number;
  monthsLeft: number; projectedByTargetDate: number; shortBy: number; onTrack: boolean; extraPerMonthNeeded: number; percentSaved: number;
}
export interface AppState {
  user: User;
  entries: CabinetEntry[];
  accounts: { current: { balance: number; iban: string }; savings: { balance: number; iban: string; monthlyDeposit: number }; carFund?: { balance: number; iban: string } };
  goals: GoalStatus[];
  salary: { found: boolean; latest?: number; payday?: number; changed?: boolean; changeMonth?: string | null; from?: number; to?: number; difference?: number };
  spentThisMonth: number;
  payPlan: { nextPayday: string | null; income: number; spendingAveragePerMonth: number; alreadySavingPerMonth: number; leftOver: number; keepInCurrentAccount: number; suggestedExtraMove: number; towardsGoal: string | null };
  conversations: (Conversation & { count: number; title: string; snippet: string })[];
  earnings: Earning[];
  shares: Share[];
  accessCount: number;
  recentReads: AccessLogEntry[];
  readable: { abel: number; offers: number };
  aiConnected: boolean;
  /** Files the customer chose to keep. Info only, never the file itself. */
  documents: DocInfo[];
  today: string;
}
export interface DocInfo { id: string; name: string; kind: 'image' | 'pdf' | 'text'; size: number; createdAt: string; expiresAt: string; conversationId?: string; entries: string[] }

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return res.json();
}
const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const fetchState = (userId: string) => fetch(`/api/state?userId=${userId}`).then((r) => j<AppState>(r));
export const createConversation = (userId: string, helperId: string) =>
  post('/api/conversations', { userId, helperId }).then((r) => j<{ conversation: Conversation }>(r)).then((d) => d.conversation);
export const fetchConversationMessages = (conversationId: string) =>
  fetch(`/api/conversations/${conversationId}/messages`).then((r) => j<{ messages: ChatMessage[] }>(r)).then((d) => d.messages);
/** A chat request gives up after 3 minutes, so the chat can never stay "typing…" forever (the server stops earlier). */
export async function sendChat(userId: string, conversationId: string | null, helperId: string, text: string) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 180000);
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, conversationId, helperId, text }), signal: ctl.signal });
    return await j<{ conversationId: string; messages: ChatMessage[]; error?: string }>(r);
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('No answer after 3 minutes (timeout)');
    throw e;
  } finally {
    clearTimeout(t);
  }
}
export interface AiStatus { provider: string; keyPresent: boolean; model: string; candidates: string[]; lastOk: { at: string; model: string } | null; lastError: { at: string; message: string; model?: string } | null; thinking?: string; lastTurn?: { at: string; ms: number; calls: number } | null;
  /** With several AI models in a chain: each one's state. */
  members?: { name: string; configured: boolean; vision: boolean; restingFor: number; lastOk: string | null; lastFail: { at: string; message: string; kind: string } | null }[] }
export const fetchAiStatus = () => fetch('/api/ai-status').then((r) => j<AiStatus>(r));
export const pingAi = () => post('/api/ai-ping', {}).then((r) => j<{ ok: boolean; model?: string; ms?: number; reply?: string; error?: string; status: AiStatus }>(r));
export const doAction = (userId: string, messageId: string, action: string, payload: Record<string, unknown> = {}) =>
  post('/api/actions', { userId, messageId, action, payload }).then((r) => j<{ messages: ChatMessage[]; resolvedMessageId: string }>(r));
export interface Reward { id: string; title: string; short: string; pts: number; done: string }
export interface NordeaDataInfo {
  info: { from: string; at: string; transactions: number; balances: boolean } | null;
  transactions: number;
  feed: { enabled: boolean; ok: boolean; message: string; lastCheck?: string; lastApplied?: { at: string; rowId: number; userId: string; result: string } };
}
export interface NordeaApplyResult { ok: boolean; message: string; transactions?: number; noticed?: { added: string[]; updated: string[]; removed: string[] } }
export const fetchNordeaData = (userId: string) => fetch(`/api/nordea-data?userId=${encodeURIComponent(userId)}`).then((r) => j<NordeaDataInfo>(r));
export const uploadNordeaData = (userId: string, text: string, fileName: string) => post('/api/nordea-data', { userId, text, fileName }).then((r) => j<{ result: NordeaApplyResult }>(r)).then((d) => d.result);
export const checkNordeaFeed = (userId: string) => post('/api/nordea-data/check', { userId }).then((r) => j<{ applied: { rowId: number; result: NordeaApplyResult }[]; feed: NordeaDataInfo['feed'] }>(r));
export interface DataRewards {
  rules: { sharedPerNote: number; used: { agentId: string; name: string; points: number; dailyCap: number }[] };
  sharing: { notesNow: number; notesEver: number; points: number };
  use: { reads: number; readsThisMonth: number; points: number; byAgent: { agentId: string; name: string; reads: number; points: number }[] };
  mostUsed: { id: string; title: string; reads: number; removed: boolean }[];
  recent: { what: string; points: number; at: string; kind: 'shared' | 'used'; notes: number }[];
  moneyBack: number;
}
export const fetchDataRewards = (userId: string) => fetch(`/api/data-rewards?userId=${encodeURIComponent(userId)}`).then((r) => j<DataRewards>(r));
export const fetchRewards = () => fetch('/api/rewards').then((r) => j<{ rewards: Reward[] }>(r)).then((d) => d.rewards);
export const redeemReward = (userId: string, rewardId: string) => post('/api/rewards/redeem', { userId, rewardId }).then((r) => j<{ user: User; message: string }>(r));
export const setOffersOff = (userId: string, offersOff: boolean) => post('/api/settings', { userId, offersOff }).then((r) => j<{ user: User }>(r));
export const revokeShare = (shareId: string) => post(`/api/shares/${shareId}/revoke`, {}).then((r) => j<{ message: string }>(r));
export interface ImportBody { sample?: boolean; text?: string; fileName?: string; fileBase64?: string; mimeType?: string; thumb?: string; /** "Keep a copy" was ticked */ keep?: boolean }
export const importChat = (userId: string, conversationId: string | null, helperId: string, body: ImportBody) =>
  post('/api/import', { userId, conversationId, helperId, ...body }).then((r) => j<{ conversationId: string; messages: ChatMessage[] }>(r));
export const confirmObservation = (userId: string, entryId: string) =>
  post('/api/events/observation-confirmed', { userId, entryId }).then((r) => j<{ entry: CabinetEntry; conversationId?: string }>(r));

// ---- Your documents, entry history, deleting chats, where data is saved
export const documentUrl = (userId: string, id: string) => `/api/documents/${id}/file?userId=${encodeURIComponent(userId)}`;
export const deleteDocument = (userId: string, id: string, alsoEntries: boolean) =>
  fetch(`/api/documents/${id}?userId=${encodeURIComponent(userId)}&alsoEntries=${alsoEntries}`, { method: 'DELETE' }).then((r) => j<{ message: string; removedEntries: number }>(r));
export const fetchHistory = (userId: string, entryId: string) =>
  fetch(`/api/entries/${entryId}/history?userId=${encodeURIComponent(userId)}`).then((r) => j<{ history: EntryEvent[] }>(r)).then((d) => d.history);
export const deleteChat = (userId: string, id: string) =>
  fetch(`/api/conversations/${id}?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' }).then((r) => j<{ message: string }>(r));
export const deleteChats = (userId: string) => post('/api/chats/delete', { userId }).then((r) => j<{ message: string; deletedMessages: number }>(r));
export interface DbStatus { mode: 'supabase' | 'file'; ok: boolean; message: string; lastSavedAt?: string; lastError?: { at: string; message: string }; rows?: number; waiting: number }
export const fetchDbStatus = () => fetch('/api/db-status').then((r) => j<DbStatus>(r));

export interface CheckResult { name: string; asked: string; ok: boolean; why: string; reply: string; cards: string[]; answeredBy: string; ms: number }
/** Runs about 12 real questions; can take a few minutes on a free plan. */
export const runSelfTest = () => post('/api/selftest', {}).then((r) => j<{ results: CheckResult[]; passed: number; total: number }>(r));
