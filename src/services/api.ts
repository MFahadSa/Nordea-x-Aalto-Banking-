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

/** Deletes all data. Nothing comes back by itself: load data again with scripts/load_data.py. */
export async function resetDatabase(): Promise<void> {
  const res = await fetch('/api/users/reset', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to delete the data');
}

/** Asks the server to read the data again (after scripts/load_data.py loaded new data). */
export async function reloadData(): Promise<void> {
  const res = await fetch('/api/admin/reload', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to read the data again');
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
  /** v21: a Nordea adviser's question or decision about a case (shown on Home). */
  notices?: { id: string; conversationId: string; kind: 'question' | 'decision'; by: string; text: string; at: string }[];
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
    let code: string | undefined;
    try { const b = await res.json(); msg = b.error || msg; code = b.code; } catch { /* keep default */ }
    // The code lets the app tell "no data loaded yet" (NO_DATA) apart from a real failure.
    throw Object.assign(new Error(msg), { code });
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
/** Outcome 3: no fixed client deadline (a chain of slow calls can run well past 3 minutes).
 *  Every send carries a requestId. The POST is never repeated: if the connection drops or hangs,
 *  the reply is picked up late from GET /api/chat/result by the same requestId. 'unknown' (the
 *  server never ran it, or restarted mid-turn) is reported as an error - the customer decides to ask again. */
export type ChatResult = { conversationId: string; messages: ChatMessage[]; error?: string; late?: boolean };
export const newRequestId = () => 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
async function pollResult(userId: string, requestId: string, onlyDone: boolean, stop: { done: boolean }): Promise<ChatResult | null> {
  const every = onlyDone ? 20000 : 3000;
  const until = Date.now() + 60 * 60 * 1000;
  while (!stop.done && Date.now() < until) {
    await new Promise((r) => setTimeout(r, every));
    if (stop.done) return null;
    try {
      const r = await fetch(`/api/chat/result?userId=${encodeURIComponent(userId)}&requestId=${encodeURIComponent(requestId)}`);
      const x = await j<{ status: 'pending' | 'done' | 'unknown'; conversationId?: string; messages?: ChatMessage[] }>(r);
      if (x.status === 'done') return { conversationId: x.conversationId!, messages: x.messages!, late: true };
      if (x.status === 'unknown' && !onlyDone) throw new Error('The server has no record of that message (it may have restarted). It was not sent again - ask again if you still want an answer.');
    } catch (e: any) {
      if (/no record of that message/.test(e?.message || '')) throw e; // network blip while polling: keep trying
    }
  }
  return null;
}
export async function sendChat(userId: string, conversationId: string | null, helperId: string, text: string, requestId: string = newRequestId()): Promise<ChatResult> {
  const stop = { done: false };
  const post = fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, conversationId, helperId, text, requestId }) })
    .then((r) => j<{ conversationId: string; messages: ChatMessage[]; error?: string }>(r))
    .catch(async (e: any) => {
      if (e instanceof TypeError) { const got = await pollResult(userId, requestId, false, stop); if (got) return got; } // connection dropped: pick the reply up, never resubmit
      throw e;
    });
  // While the POST is still open, a reply that already landed on the server is also picked up.
  const watcher = pollResult(userId, requestId, true, stop).then((got) => got ?? new Promise<never>(() => undefined));
  try { return await Promise.race([post, watcher]); } finally { stop.done = true; }
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
export interface DbStatus { mode: 'supabase' | 'file' | 'memory'; ok: boolean; message: string; lastSavedAt?: string; lastError?: { at: string; message: string }; rows?: number; waiting: number; pipeline?: { where: 'supabase' | 'server'; ok: boolean; message: string } }
export const fetchDbStatus = () => fetch('/api/db-status').then((r) => j<DbStatus>(r));
/** v23: try Supabase again without restarting the app. */
export const retryDbStatus = () => fetch('/api/db-status/retry', { method: 'POST' }).then((r) => j<DbStatus>(r));

export interface CheckResult { name: string; asked: string; ok: boolean; why: string; reply: string; cards: string[]; answeredBy: string; ms: number }
/** Runs about 12 real questions; can take a few minutes on a free plan. */
export const runSelfTest = () => post('/api/selftest', {}).then((r) => j<{ results: CheckResult[]; passed: number; total: number }>(r));

/** R2: user cards waiting for approval (same pending list as arch.html; one decision, one result). */
export interface ApprovalCard { id: string; summary: string; detail: string; approvalId: string; levelName: string; why: string; unknown: boolean }
/** Every waiting USER card, including one the AI gave no valid level (shown as UNKNOWN, treated as level 2). */
export const fetchApprovalCards = (userId: string): Promise<ApprovalCard[]> =>
  fetch(`/api/arch/${encodeURIComponent(userId)}/review`).then((r) => (r.ok ? r.json() : { proposals: [] })).then((d: { proposals?: { id: string; summary: string; payload?: { detail?: string }; effectiveApproval?: { id: string; label: string; why: string; unknown: boolean } }[] }) =>
    (d.proposals ?? []).filter((m) => m.effectiveApproval).map((m) => ({ id: m.id, summary: m.summary, detail: m.payload?.detail ?? '', approvalId: m.effectiveApproval!.id, levelName: m.effectiveApproval!.label, why: m.effectiveApproval!.why, unknown: m.effectiveApproval!.unknown }))).catch(() => []);
export const decideApprovalCard = (userId: string, id: string, ok: boolean) =>
  fetch(`/api/arch/${encodeURIComponent(userId)}/review/${encodeURIComponent(id)}/${ok ? 'accept' : 'reject'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.ok);

/** v20: the input pipeline (smart glasses, WhatsApp, documents, bank data, later a personal-AI cloud). */
export type PipeSource = 'glasses' | 'whatsapp' | 'document' | 'csv' | 'abel' | 'cloud';
export interface PipeItem {
  id: string; runId: string; source: PipeSource; at: string; type: string; title: string; detail: string;
  reason: string; filter: 'kept' | 'private' | 'merged'; customer: 'waiting' | 'saved' | 'private' | 'dropped'; entryId?: string; updatesId?: string;
}
export interface PipeRun { id: string; source: PipeSource; at: string; label: string; heard: number; kept: number; private: number; dropped: number; merged: number; aiJudged: boolean }
export const SOURCE_NAME: Record<PipeSource, string> = { glasses: 'Smart glasses', whatsapp: 'WhatsApp', document: 'Document', csv: 'Bank data', abel: 'Abel chat', cloud: 'Personal AI cloud' };
export const fetchPipelineWaiting = (userId: string): Promise<PipeItem[]> =>
  fetch(`/api/pipeline/${encodeURIComponent(userId)}/waiting`).then((r) => (r.ok ? r.json() : { items: [] })).then((d) => d.items ?? []).catch(() => []);
export const decidePipelineItem = (userId: string, id: string, action: 'save' | 'private' | 'drop') =>
  post(`/api/pipeline/${encodeURIComponent(userId)}/items/${encodeURIComponent(id)}`, { action }).then((r) => j<{ item: PipeItem }>(r));
export const sendToPipeline = (userId: string, source: PipeSource, input: { signals?: { text: string; kind?: string }[]; text?: string; file?: { mimeType: string; data: string; name?: string }; label?: string }) =>
  post('/api/ingest', { userId, source, ...input }).then((r) => j<{ run: PipeRun; candidates: PipeItem[]; message?: string }>(r));
