/**
 * The PERSONAL agent (Abel in-app, or the connected external agent). It works for the
 * customer and opens ONLY the User DB (plus the shared bus). It gets cabinet content
 * exclusively as message replies from the Context Memory agent - never by opening cm.db.
 * Boundary pinned by the AC1 source-scan test: this module imports no other agent's store.
 */
import { ArchError, newId, now } from '../types.js';
import type { AgentMessage, Goal } from '../types.js';
import { words, overlaps } from '../text.js';
import { loadUserDb, saveUserDb } from '../store/userStore.js';
import { loadContext, readSectionRows, writeCustomerSection } from '../store/contextStore.js';
import { appendMessage, getAgentsOff, getCabinetParkedMirror, loadBus, saveBus, updateMessage } from '../store/busStore.js';
import { registerHandler } from '../dispatcher.js';
import { roundDone } from '../rounds.js';

export const personalLabel = (u: { personalAgent: { mode: string; externalName?: string } }) =>
  (u.personalAgent.mode === 'external' ? u.personalAgent.externalName || 'External personal agent' : 'Abel');

/** The agent off-switch is coordination state on the bus; the legacy User-DB field still counts. */
const requireOn = (uid: string) => {
  const off = getAgentsOff(uid) ?? [];
  const legacy = loadUserDb(uid).agentsOff ?? [];
  if (off.includes('personal') || legacy.includes('personal')) throw new ArchError(409, `personal agent is off. Turn it on first.`);
};

// ---------- Direct input to the personal agent (NEVER through the sync airlock) ----------

export function addGoalDirect(uid: string, title: string, detail = ''): Goal {
  requireOn(uid);
  const u = loadUserDb(uid);
  const goal: Goal = { id: newId('goal'), title: title.trim(), detail: detail.trim(), createdAt: now() };
  u.goals.push(goal);
  saveUserDb(u);
  appendMessage(uid, { from: 'personal', to: 'user', type: 'inform', summary: `${personalLabel(u)} saved goal "${goal.title}" in the User DB. No sync airlock - direct input is yours.` });
  return goal;
}

/**
 * The agreed answer guardrail: a reply may only contain numbers that came from the
 * retrieved facts themselves. Anything else is rejected and falls back to plain wording.
 */
export function groundNumbers(reply: string, factSources: string[]): { reply: string; grounded: boolean } {
  const allowed = new Set(factSources.flatMap((s) => s.match(/\d[\d\s.,]*\d|\d/g) ?? []).map((n) => n.replace(/[\s.,]/g, '')));
  const used = (reply.match(/\d[\d\s.,]*\d|\d/g) ?? []).map((n) => n.replace(/[\s.,]/g, ''));
  const bad = used.filter((n) => !allowed.has(n));
  if (!bad.length) return { reply, grounded: true };
  return { reply: 'I have some related context, but I cannot verify those figures against your data, so I would rather not quote numbers. Ask me about your goals or shared context in general terms and I will answer from what is stored.', grounded: false };
}

// ---------- Chat: the personal agent answers from its own DB + bus replies ----------

export interface ChatBegin {
  kind: 'direct' | 'ask' | 'doc';
  parked?: boolean;
  direct?: { reply: string; used: string[] };
  question?: string;
  used?: string[];
  parts?: string[];
  factSources?: string[];
  goalCount?: number;
  sessionId?: string;
}

/**
 * First half of a chat turn: read ONLY the User DB, then - when the question needs shared
 * context - post a real query to the Context Memory agent on the bus. The orchestrator
 * runs the dispatcher so the CM agent itself answers; finishChat composes from the reply.
 */
export function beginChat(uid: string, text: string, sessionId?: string): ChatBegin {
  requireOn(uid);
  const trimmed = text.trim();
  const goalMatch = trimmed.match(/^(?:my goal is|goal:|add goal)\s+(.+)/i);
  if (goalMatch) {
    const g = addGoalDirect(uid, goalMatch[1]);
    return { kind: 'direct', direct: { reply: `Saved "${g.title}" as a goal in your User DB. Direct input goes straight in - the sync airlock only gates things your connected personal agent pulls in from WhatsApp, calendar, notes or email.`, used: ['user-db'] } };
  }

  const u = loadUserDb(uid);
  const q = words(trimmed);
  const used: string[] = [];
  const parts: string[] = [];
  const factSources: string[] = [];

  // 1. The personal agent's own store.
  const goalHits = u.goals.filter((g) => overlaps(q, words(`${g.title} ${g.detail}`)));
  const factHits = u.personalFacts.filter((f) => overlaps(q, words(f.text)));
  if (goalHits.length || factHits.length) {
    used.push('user-db');
    for (const g of goalHits) { parts.push(`Goal: ${g.title}${g.detail ? ` (${g.detail})` : ''}.`); factSources.push(`${g.title} ${g.detail}`); }
    for (const f of factHits.slice(0, 3)) { parts.push(`From your ${f.source}: ${f.text}`); factSources.push(f.text); }
  }

  // 2. Shared context comes from the session's context.md (F15/B1c); the orchestrator opens
  // the session round before calling this. Parked cabinet: answer from the User DB only.
  if (getCabinetParkedMirror(uid)) return { kind: 'doc', parked: true, question: trimmed, used, parts, factSources, goalCount: u.goals.length, sessionId };
  return { kind: 'doc', question: trimmed, used, parts, factSources, goalCount: u.goals.length, sessionId };
}

/** Second half: compose the answer - from the finished context.md (B1c) or the CM agent's reply. */
export function finishChat(uid: string, begin: ChatBegin): { reply: string; used: string[]; memoryHits: number } {
  const trimmed = begin.question ?? '';
  const used = begin.used ?? [];
  const parts = begin.parts ?? [];
  const factSources = begin.factSources ?? [];

  // The session's shared document is the source: memory rows the CM agent wrote, nordea rows
  // the Nordea agent wrote (F15). ACTIVE entries only - stale/disputed are not served.
  const parked = begin.parked === true;
  let entryHits: { title: string; detail: string; evidence?: Record<string, unknown> | null }[] = [];
  let nordeaHits: { title: string; detail: string; evidence?: Record<string, unknown> | null }[] = [];
  // F16: only the document stamped with THIS session's id may answer; anything else is an
  // earlier session's (or a maintenance round's) document and must not leak in.
  const doc = loadContext(uid);
  const docAvailable = !parked && doc !== null && doc.sessionId != null && doc.sessionId === (begin.sessionId ?? null) && doc.finalisedAt !== null;
  if (docAvailable) {
    const q = words(trimmed);
    entryHits = readSectionRows(uid, 'memory').filter((r) => (r.status ?? 'active') === 'active' && overlaps(q, words(`${r.title} ${r.detail}`))).slice(0, 3);
    nordeaHits = readSectionRows(uid, 'nordea').filter((r) => overlaps(q, words(`${r.title} ${r.detail}`))).slice(0, 2);
  }
  if (entryHits.length) {
    used.push('context-memory-db');
    for (const e of entryHits) { parts.push(`Shared context (via the Context Memory agent): ${e.title} - ${e.detail}`); factSources.push(`${e.title} ${e.detail} ${e.evidence?.total ?? ''}`); }
  }
  if (nordeaHits.length) {
    used.push('context-md');
    for (const r of nordeaHits) { parts.push(`Shared context (context.md, Nordea agent section): ${r.title} - ${r.detail}`); factSources.push(`${r.title} ${r.detail} ${(r.evidence as { total?: number } | null | undefined)?.total ?? ''}`); }
  }

  // 3. Guardrail: the personal agent never touches the Nordea DB.
  const bankish = ['balance', 'account', 'spent', 'spend', 'transaction', 'salary', 'money', 'save', 'saving'].some((w) => trimmed.toLowerCase().includes(w));
  if (!parts.length) {
    if (parked) return { reply: `I don't have enough in your User DB to answer that, and the cabinet is parked - reconnect it if you want me to use shared context again.`, used, memoryHits: 0 };
    if (!docAvailable) return { reply: `I don't have enough in your User DB to answer that, and shared context is unavailable this session.`, used, memoryHits: 0 };
    if (bankish) return { reply: `I don't have your bank data - as your personal agent I only read your User DB and shared context the Context Memory agent hands me. Nordea's agent can propose goal-related insights to the cabinet for your review.`, used, memoryHits: 0 };
    return { reply: `I don't have enough context to answer that yet. All I have is what's in your User DB (${begin.goalCount ?? 0} goal${(begin.goalCount ?? 0) === 1 ? '' : 's'}) and the shared cabinet, which had nothing on this.`, used, memoryHits: 0 };
  }
  if (bankish && !used.includes('context-memory-db') && !used.includes('context-md')) parts.push(`For actual account figures, Nordea's agent works from the Nordea DB - I can't read it directly.`);
  const grounded = groundNumbers(parts.join(' '), factSources);
  // F16: when the only document belongs to another session, say so plainly (no old rows served).
  const suffix = !docAvailable ? ` Shared context is unavailable this session.` : '';
  return { reply: grounded.reply + suffix, used, memoryHits: entryHits.length };
}

// ---------- Agent-to-agent queries (transport for the external demo client) ----------

/** Post a query to another agent; the orchestrator dispatches and reads the reply. */
export function postAgentQuery(uid: string, to: 'cm' | 'nordea', question: string): AgentMessage {
  requireOn(uid);
  const target = getAgentsOff(uid) ?? [];
  if (target.includes(to)) throw new ArchError(409, `${to} agent is off. Turn it on first.`);
  const u = loadUserDb(uid);
  return appendMessage(uid, {
    from: 'personal', to, type: 'query', status: 'pending',
    summary: `${personalLabel(u)} asks the ${to === 'cm' ? 'Context Memory' : 'Nordea'} agent: ${question.slice(0, 80)}`,
    payload: { question },
  });
}

/** The answering agent's reply payload for a query message id. */
export function readAgentReply(uid: string, queryMessageId: string): Record<string, unknown> {
  const reply = loadBus(uid).messages.find((m) => m.type === 'reply' && (m.payload as { inReplyTo?: string } | undefined)?.inReplyTo === queryMessageId);
  return (reply?.payload ?? {}) as Record<string, unknown>;
}

// ---------- Connect / disconnect the personal agent ----------

export function connectExternalAgent(uid: string, name: string) {
  const u = loadUserDb(uid);
  u.personalAgent = { mode: 'external', externalName: name.trim() || 'External agent', connectedAt: now() };
  saveUserDb(u);
  appendMessage(uid, { from: 'personal', to: 'user', type: 'inform', summary: `${u.personalAgent.externalName} set as the personal agent (SIMULATED - no live external connection). Abel steps aside; syncs from WhatsApp/calendar/notes/email arrive via the demo endpoint and wait in the airlock for your approval.` });
  return u.personalAgent;
}

export function disconnectPersonalAgent(uid: string) {
  const u = loadUserDb(uid);
  const was = personalLabel(u);
  u.personalAgent = { mode: 'abel' };
  saveUserDb(u);
  appendMessage(uid, { from: 'personal', to: 'user', type: 'inform', summary: `${was} disconnected. Abel is the in-app personal agent again; nothing else was deleted.` });
  return u.personalAgent;
}

// ---------- Sync airlock (ONLY for the connected personal agent's ingestion) ----------

export function stageSync(uid: string, source: string, items: { kind: string; text: string }[]) {
  requireOn(uid);
  const u = loadUserDb(uid);
  if (u.personalAgent.mode !== 'external') throw new ArchError(409, 'No external personal agent is connected, so there is nothing to sync. Direct input to Abel never goes through the airlock.');
  if (!items.length) throw new ArchError(400, 'A sync needs at least one item.');
  const bus = loadBus(uid);
  const batch = { id: newId('air'), at: now(), source, items: items.map((i) => ({ id: newId('item'), kind: i.kind, text: i.text })), status: 'pending' as const };
  bus.airlock.push(batch);
  appendMessage(uid, { from: 'personal', to: 'user', type: 'inform', summary: `${personalLabel(u)} synced ${items.length} item${items.length === 1 ? '' : 's'} from ${source} (SIMULATED demo sync). Waiting in the airlock for your approval - nothing enters the User DB without it.` });
  saveBus(uid, bus);
  return batch;
}

export function decideAirlock(uid: string, batchId: string, approve: boolean) {
  const bus = loadBus(uid);
  const batch = bus.airlock.find((b) => b.id === batchId);
  if (!batch) throw new ArchError(404, 'No such airlock batch.');
  if (batch.status !== 'pending') throw new ArchError(409, `This batch is already ${batch.status}.`);
  batch.status = approve ? 'approved' : 'rejected';
  batch.decidedAt = now();
  saveBus(uid, bus);
  if (approve) {
    const u = loadUserDb(uid);
    for (const item of batch.items) u.personalFacts.push({ id: item.id, source: batch.source, text: item.text, at: now(), viaAirlockId: batch.id });
    saveUserDb(u);
    appendMessage(uid, { from: 'personal', to: 'user', type: 'inform', summary: `Airlock approved: ${batch.items.length} item${batch.items.length === 1 ? '' : 's'} from ${batch.source} added to the User DB.` });
  } else {
    appendMessage(uid, { from: 'personal', to: 'user', type: 'inform', summary: `Airlock rejected: ${batch.items.length} item${batch.items.length === 1 ? '' : 's'} from ${batch.source} discarded, never stored.` });
  }
  return batch;
}

// ---------- Message handler: what the personal agent does when the bus delivers ----------

function handleMessage(uid: string, msg: AgentMessage) {
  const payload = (msg.payload ?? {}) as { roundId?: string; purpose?: string; goalIds?: string[]; control?: string; trigger?: string; question?: string; sessionId?: string };
  if (msg.type === 'control' && payload.control === 'abel-facts') {
    // F10 phase 2 / AC11: the in-app Abel asks for the customer's facts. The personal agent is
    // the owner of the User DB - it reads it itself and answers by message (provenance kept).
    const u = loadUserDb(uid);
    appendMessage(uid, {
      from: 'personal', to: 'app', type: 'reply',
      summary: `Personal agent returns ${u.goals.length} goal${u.goals.length === 1 ? '' : 's'} and ${u.personalFacts.length} fact${u.personalFacts.length === 1 ? '' : 's'} from the User DB for Abel.`,
      payload: { inReplyTo: msg.id, from: 'user-db', goals: u.goals.map((g) => ({ title: g.title, detail: g.detail })), facts: u.personalFacts.map((f) => ({ text: f.text, source: f.source })) },
    });
    updateMessage(uid, msg.id, { status: 'answered' });
    return;
  }
  if (msg.type === 'control' && payload.control === 'status') {
    const u = loadUserDb(uid);
    appendMessage(uid, {
      from: 'personal', to: 'app', type: 'reply',
      summary: 'Personal agent reports its own status.',
      payload: { inReplyTo: msg.id, goals: u.goals.length },
    });
    updateMessage(uid, msg.id, { status: 'answered' });
    return;
  }
  if (msg.type === 'round-start' && payload.roundId) {
    // The personal agent starts the build: it writes the Customer section of the shared
    // context.md from its own User DB (AC2/AC3). Goal TITLES are shared; goal details and
    // personal facts stay in the User DB until the customer allows sharing them. A session
    // round shares the part relevant to the opening question; a contribution round shares all.
    const u = loadUserDb(uid);
    const question = typeof payload.question === 'string' ? payload.question : null;
    const qw = question ? words(question) : [];
    const relevant = question ? u.goals.filter((g) => overlaps(qw, words(`${g.title} ${g.detail}`))) : u.goals;
    const goalRows = relevant.map((g) => ({ id: g.id, title: g.title, detail: '', source: 'personal' as const, observed: 'observed' as const, at: now() }));
    const mergedCustomer = [...readSectionRows(uid, 'customer').filter((r) => !goalRows.some((n) => n.id === r.id)), ...goalRows]; // F18: merge, never drop
    writeCustomerSection(uid, mergedCustomer,
      `${relevant.length} of ${u.goals.length} goal${u.goals.length === 1 ? '' : 's'} shared by title${question ? ' (relevant to the question)' : ''}; details and personal facts stay in the User DB until the customer allows sharing them.`,
      { roundId: payload.roundId, trigger: String(payload.trigger ?? 'contribution') });
    appendMessage(uid, {
      from: 'personal', to: 'cm', type: 'inform', status: 'pending',
      summary: `${personalLabel(u)} wrote the Customer section of context.md (${relevant.length} goal${relevant.length === 1 ? '' : 's'} shared by title).`,
      payload: { roundId: payload.roundId, ...(question ? { question } : {}) },
    });
    // F4: the personal agent contributes too - it proposes the customer's goals to the
    // cabinet; the CM agent dedupes and the customer reviews, same as Nordea's proposals.
    const alreadyProposed = new Set(loadBus(uid).messages.filter((m) => m.type === 'propose' && m.from === 'personal' && m.status === 'pending').map((m) => m.summary));
    for (const g of relevant) {
      if (alreadyProposed.has(`Customer goal: ${g.title}`)) continue; // no duplicate pending proposals
      appendMessage(uid, {
        from: 'personal', to: 'cm', type: 'propose', status: 'pending',
        summary: `Customer goal: ${g.title}`,
        payload: { roundId: payload.roundId, goalIds: [g.id], detail: `The customer is saving toward "${g.title}". Proposed by the personal agent from the User DB (direct customer input).`, observed: 'observed' },
      });
    }
    roundDone(uid, payload.roundId, 'personal');
    return;
  }
  if (msg.type === 'query' && payload.goalIds) {
    // Another agent asks for the titles behind goal ids. Titles only - details stay here.
    const u = loadUserDb(uid);
    const goals = payload.goalIds
      .map((id) => u.goals.find((g) => g.id === id))
      .filter((g): g is Goal => !!g)
      .map((g) => ({ id: g.id, title: g.title }));
    appendMessage(uid, {
      from: 'personal', to: msg.from, type: 'reply', status: 'pending',
      summary: `Personal agent returns ${goals.length} goal title${goals.length === 1 ? '' : 's'} from the User DB.`,
      payload: { inReplyTo: msg.id, purpose: payload.purpose, roundId: payload.roundId, goals },
    });
    updateMessage(uid, msg.id, { status: 'answered' });
    return;
  }
}

registerHandler('personal', handleMessage);
