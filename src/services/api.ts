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
