/**
 * The orchestration layer: composes the three agents for the HTTP API. This is the app
 * server, NOT an agent - it never does an agent's retrieval for it. It opens rounds and
 * control messages, runs the dispatcher, reads reply payloads, and renders the customer's
 * own dashboard. Agents talk to each other only through bus messages.
 */
import { ArchError, newId, now } from './types.js';
import type { AgentId, ArchEntry, BuildRound } from './types.js';
import { dispatchPending } from './dispatcher.js';
import { runRound } from './rounds.js';
import {
  beginChat, finishChat, postAgentQuery, readAgentReply, personalLabel,
} from './agents/personal.js';
import { PARKED_WORDING, publishParkState } from './agents/cm.js';
import './agents/nordea.js'; // side effect: registers the Nordea agent's bus handler
import { loadUserDb, saveUserDb, deleteUserDb } from './store/userStore.js';
import { loadCmDb, deleteCmDb } from './store/cmStore.js';
import { loadNordeaDb, nordeaFileExists, deleteNordeaDb } from './store/nordeaStore.js';
import { deleteContext, loadContext, renderContextMd, resetContextForSession } from './store/contextStore.js';
import {
  appendMessage, findMessage, getAgentsOff, setAgentsOff, loadBus, busKvGet, busKvSet, getCabinetParkedMirror,
} from './store/busStore.js';

// ---------- Coordination state (bus kv), with one-time migration from the legacy User DB field ----------

function getOff(uid: string): AgentId[] {
  const off = getAgentsOff(uid);
  if (off !== undefined) return off;
  const legacy = loadUserDb(uid).agentsOff ?? [];
  setAgentsOff(uid, legacy); // seed the coordination key; legacy field cleared below
  if (legacy.length) {
    const u = loadUserDb(uid);
    u.agentsOff = [];
    saveUserDb(u);
  }
  return legacy;
}

const requireAgentOn = (uid: string, a: AgentId) => {
  if (getOff(uid).includes(a)) throw new ArchError(409, `${a} agent is off. Turn it on first.`);
};

// ---------- Personal agent chat (Abel in-app, or the connected external agent) ----------

// ---------- Chat sessions (F15): one context.md per customer session ----------

const SESSION_IDLE_MS = 30 * 60 * 1000; // session rule: a session ends after 30 min idle

interface ChatSession { id: string; roundId: string; startedAt: string; lastActivityAt: string }

/** Resolve the current session: the client's id wins; otherwise a new session after 30 min idle. */
function resolveSession(uid: string, clientSessionId?: string): { session: ChatSession; isNew: boolean } {
  const raw = busKvGet(uid, 'chatSession');
  const existing = raw ? (JSON.parse(raw) as ChatSession) : null;
  const nowIso = now();
  if (existing && !clientSessionId && nowIso < new Date(new Date(existing.lastActivityAt).getTime() + SESSION_IDLE_MS).toISOString()) {
    return { session: existing, isNew: false };
  }
  if (existing && clientSessionId && existing.id === clientSessionId) return { session: existing, isNew: false };
  const session: ChatSession = { id: clientSessionId ?? newId('session'), roundId: '', startedAt: nowIso, lastActivityAt: nowIso };
  return { session, isNew: true };
}

function saveSession(uid: string, session: ChatSession) { busKvSet(uid, 'chatSession', JSON.stringify(session)); }

/**
 * A customer question (F15): the first question of a session opens a session round with an
 * empty document; every question is answered from the session's context.md; if the document
 * has nothing from the Context Memory agent for a follow-up, a top-up round adds rows to the
 * same document (never a fresh one).
 */
export function chat(uid: string, text: string, clientSessionId?: string): { reply: string; used: string[]; sessionId: string } {
  const parked = getCabinetParkedMirror(uid); // the personal agent's parked gate, no status ping
  const { session, isNew } = resolveSession(uid, clientSessionId);
  // F17: direct input (a typed goal) is saved BEFORE any round opens, so the session round's
  // Customer section already includes it.
  let begin = beginChat(uid, text, session.id);
  if (isNew) {
    // F16: a new session always starts from an empty document stamped with its id - even when
    // no round can run (agent off, parked), an earlier session's rows must not leak in.
    resetContextForSession(uid, session.id);
    if (!parked && !getOff(uid).some((a) => a === 'personal' || a === 'cm' || a === 'nordea')) {
      const round = runRound(uid, 'session', { question: text, sessionId: session.id });
      session.roundId = round.id;
    }
  }
  if (begin.kind === 'direct') { saveSession(uid, { ...session, lastActivityAt: now() }); return { ...begin.direct!, sessionId: session.id }; }
  let answer = finishChat(uid, begin);
  if (!parked && !isNew && answer.memoryHits === 0 && loadContext(uid)?.finalisedAt) {
    // The document lacks CM-sourced content for this follow-up: top it up, then answer again.
    const round = runRound(uid, 'topup', { question: text, sessionId: session.id });
    if (!session.roundId) session.roundId = round.id;
    begin = beginChat(uid, text, session.id);
    if (begin.kind === 'direct') { saveSession(uid, { ...session, lastActivityAt: now() }); return { ...begin.direct!, sessionId: session.id }; }
    answer = finishChat(uid, begin);
  }
  saveSession(uid, { ...session, lastActivityAt: now() });
  return { reply: answer.reply, used: answer.used, sessionId: session.id };
}

/**
 * F10 phase 2 / AC11: shared context for the in-app Abel's main chat. The User DB half comes
 * from the PERSONAL AGENT by message (it owns that DB; the app layer never opens it for Abel).
 * The context.md half follows the AC2 session rules: only a finalised document stamped with
 * THIS session's id is served; a missing or other-session document triggers a fresh session
 * build round when the agents can run one - and is otherwise simply not served (never wiped,
 * never leaked across sessions). Nothing here opens an agent's store for fact assembly.
 */
export function abelSharedContext(uid: string, sessionId: string, question: string): { userDbFacts?: string; sharedContext?: string; provenance: string[] } {
  const out: { userDbFacts?: string; sharedContext?: string; provenance: string[] } = { provenance: [] };
  if (!nordeaFileExists(uid)) return out; // the architecture is not in use for this customer
  const off = getOff(uid);
  if (!off.includes('personal')) {
    const r = controlRoundTrip(uid, 'personal', 'The in-app Abel asks the personal agent for the customer facts in its own User DB.', { control: 'abel-facts' }) as {
      goals?: { title: string; detail: string }[]; facts?: { text: string; source: string }[];
    };
    const bits: string[] = [];
    if (r.goals?.length) bits.push(`Goals: ${r.goals.map((g) => g.detail ? `${g.title} (${g.detail})` : g.title).join('; ')}`);
    if (r.facts?.length) bits.push(`Facts: ${r.facts.map((f) => f.text).join('; ')}`);
    if (bits.length) {
      out.userDbFacts = bits.join('\n');
      out.provenance.push('user-db via the personal agent');
    }
  }
  const parked = getCabinetParkedMirror(uid);
  if (!parked && !off.some((a) => a === 'personal' || a === 'cm' || a === 'nordea')) {
    const doc = loadContext(uid);
    if (!doc || doc.sessionId !== sessionId || !doc.finalisedAt) {
      // AC2: this session has no finished document - build one (fresh, stamped with its id).
      resetContextForSession(uid, sessionId);
      runRound(uid, 'session', { question, sessionId });
    }
    const fresh = loadContext(uid);
    if (fresh && fresh.sessionId === sessionId && fresh.finalisedAt) {
      // F30: Abel sees ACTIVE rows only - a stale or disputed row must not be served as a
      // fact (its numbers would also pass the grounding guard). Only Abel's copy is
      // filtered; the stored document keeps the marks and its history.
      const activeOnly = {
        ...fresh,
        sections: {
          customer: { ...fresh.sections.customer, rows: fresh.sections.customer.rows.filter((r) => !r.status || r.status === 'active') },
          memory: { ...fresh.sections.memory, rows: fresh.sections.memory.rows.filter((r) => !r.status || r.status === 'active') },
          nordea: { ...fresh.sections.nordea, rows: fresh.sections.nordea.rows.filter((r) => !r.status || r.status === 'active') },
        },
      };
      out.sharedContext = renderContextMd(uid, activeOnly);
      out.provenance.push(`context.md session ${sessionId} (the shared document, finalised ${fresh.finalisedAt.slice(0, 10)})`);
    }
  }
  return out;
}

// ---------- Agent-to-agent queries over the message bus (transport for the demo client) ----------

export function agentQuery(uid: string, to: 'cm' | 'nordea', question: string): { reply: Record<string, unknown>; messageId: string } {
  requireAgentOn(uid, 'personal');
  requireAgentOn(uid, to);
  const query = postAgentQuery(uid, to, question);
  dispatchPending(uid, { maxDeliver: 10 });
  const reply = readAgentReply(uid, query.id);
  if (to === 'cm' && (reply as { parked?: boolean }).parked) throw new ArchError(409, PARKED_WORDING);
  return { reply, messageId: query.id };
}

// ---------- Goal-filtered bank contributions as a build round (AC6) ----------

export function contribute(uid: string) {
  requireAgentOn(uid, 'nordea');
  requireAgentOn(uid, 'cm');
  // The agents report their own state by control message; the app never opens their DBs (F12).
  const cmStatus = controlRoundTrip(uid, 'cm', 'Context Memory agent status before a contribution round.', { control: 'status' }) as { parked?: boolean; entries?: number };
  if (cmStatus.parked) throw new ArchError(409, PARKED_WORDING); // the CM agent's own answer gates the round
  const counts = controlRoundTrip(uid, 'nordea', 'Prepare the Nordea DB for a contribution round.', { control: 'prepare' }) as { transactions?: number };
  if (!counts.transactions) throw new ArchError(409, 'The Nordea DB has no transactions yet. Load bank data first (scripts/load_data.py).');
  let goalCount: number | null = null;
  if (!getOff(uid).includes('personal')) {
    const pStatus = controlRoundTrip(uid, 'personal', 'Personal agent status before a contribution round.', { control: 'status' }) as { goals?: number };
    goalCount = pStatus.goals ?? null;
  }
  const round = runRound(uid, 'contribution');
  return {
    askedVia: round.id,
    proposals: round.proposals,
    staleFlags: round.staleFlags,
    skippedGoals: goalCount === null ? 0 : Math.max(0, goalCount - round.proposals.length),
    existingCabinetEntries: cmStatus.entries ?? 0,
    round: { id: round.id, state: round.state, steps: round.steps, maxSteps: round.maxSteps },
  };
}

export function reviewQueue(uid: string) {
  return loadBus(uid).messages.filter((m) => m.type === 'propose' && m.status === 'pending');
}

/** Send a control message to an agent, dispatch, and return its reply payload. */
function controlRoundTrip(uid: string, to: AgentId, summary: string, payload: Record<string, unknown>): Record<string, unknown> {
  const msg = appendMessage(uid, { from: 'app', to, type: 'control', status: 'pending', summary, payload });
  dispatchPending(uid, { maxDeliver: 10 });
  const reply = readControlReply(uid, msg.id);
  const err = reply as { error?: string; statusCode?: number };
  if (err.error) throw new ArchError(err.statusCode ?? 409, err.error);
  return reply;
}

function readControlReply(uid: string, controlMessageId: string): Record<string, unknown> {
  const reply = loadBus(uid).messages.find((m) => m.type === 'reply' && (m.payload as { inReplyTo?: string } | undefined)?.inReplyTo === controlMessageId);
  return (reply?.payload ?? {}) as Record<string, unknown>;
}

export function decideProposal(uid: string, messageId: string, accept: boolean): ArchEntry | { rejected: true } | (ArchEntry & { duplicate: true }) {
  const msg = findMessage(uid, messageId);
  if (!msg || msg.type !== 'propose') throw new ArchError(404, 'No such proposal.');
  if (msg.status !== 'pending') throw new ArchError(409, `This proposal is already ${msg.status}.`);
  const reply = controlRoundTrip(uid, 'cm', `Review decision on proposal ${messageId}.`, { control: 'review-decision', messageId, accept });
  if ((reply as { rejected?: boolean }).rejected) return { rejected: true };
  const r = reply as { entry: ArchEntry; duplicate?: boolean };
  return r.duplicate ? { ...r.entry, duplicate: true } : r.entry;
}

// ---------- Explain / dispute ----------

/** F22/AC9: per-entry undo for automatically stored entries (logged by the CM agent). */
export function undoEntry(uid: string, entryId: string) {
  return controlRoundTrip(uid, 'cm', `Undo automatically stored entry ${entryId}.`, { control: 'undo-entry', entryId });
}

/** AC7: the customer sets standing permissions once (first start); until then nothing is automatic. */
export function setStandingPermissions(uid: string, reviewLevel: 'all' | 'high') {
  return controlRoundTrip(uid, 'cm', `Customer sets standing permissions: ${reviewLevel === 'high' ? 'only high risk waits for review' : 'everything waits for review'}.`, { control: 'set-permissions', reviewLevel }) as { reviewLevel: string };
}

export function explainEntry(uid: string, entryId: string) {
  const reply = controlRoundTrip(uid, 'cm', `Explain entry ${entryId}.`, { control: 'explain', entryId });
  const { entry, via } = reply as { entry: ArchEntry; via: { id: string; at: string } | null };
  // Goal titles come from the personal agent by message - the CM agent stores goal ids only.
  const q = appendMessage(uid, {
    from: 'app', to: 'personal', type: 'query', status: 'pending',
    summary: `The app asks the personal agent for the titles of ${entry.goalIds.length} goal${entry.goalIds.length === 1 ? '' : 's'} linked to "${entry.title}".`,
    payload: { purpose: 'explain-titles', goalIds: entry.goalIds },
  });
  dispatchPending(uid, { maxDeliver: 10 });
  const titlesReply = readControlReply(uid, q.id) as { goals?: { id: string; title: string }[] };
  const goals = (titlesReply.goals ?? []).map((g) => g.title);
  return {
    entry,
    explanation: {
      who: entry.proposedBy === 'nordea' ? 'Proposed by the Nordea agent from the Nordea DB' : entry.proposedBy === 'user' ? 'Added by you directly' : `Proposed by the ${entry.proposedBy} agent`,
      when: entry.createdAt,
      why: goals.length ? `Matched your goal${goals.length === 1 ? '' : 's'}: ${goals.join(', ')}` : 'No goal link recorded',
      reviewedBy: entry.autoAccepted ? `Stored automatically under your standing permissions (${entry.risk ?? 'low'} risk; message ${via?.id ?? 'n/a'})` : via ? `You accepted it in merge review (message ${via.id}, ${via.at})` : 'No review message recorded',
      evidence: entry.evidence ?? null,
      status: entry.status,
      disputeReason: entry.disputeReason ?? null,
    },
  };
}

export function disputeEntry(uid: string, entryId: string, reason: string) {
  const reply = controlRoundTrip(uid, 'cm', `Dispute entry ${entryId}.`, { control: 'dispute', entryId, reason });
  return (reply as { entry: ArchEntry }).entry;
}

// ---------- Cabinet park (distinct from off, disconnect and delete) ----------

export function parkCabinet(uid: string, park: boolean) {
  const reply = controlRoundTrip(uid, 'cm', park ? 'Park the cabinet.' : 'Reconnect the cabinet.', { control: park ? 'park' : 'resume' });
  // Imports that arrived while parked updated the Nordea DB without detection: re-check now,
  // before the cabinet serves again (same guards as the original resume re-check).
  let staleFlags: BuildRound['staleFlags'] = [];
  if (!park) staleFlags = recheckBeforeReuse(uid);
  return { parked: park, entries: (reply as { entries?: number }).entries ?? 0, staleFlags };
}

/**
 * Re-check before reuse, with the original guards: only when both agents are on, the cabinet
 * is open, goals exist and an accepted entry could be stale. The Nordea agent refreshes its
 * own DB from core bank data first, then a decay round runs.
 */
function recheckBeforeReuse(uid: string): BuildRound['staleFlags'] {
  const off = getOff(uid);
  if (off.includes('cm') || off.includes('nordea') || off.includes('personal')) return [];
  // Same guards as before, but each agent reports its own state by control message (F12).
  const cmStatus = controlRoundTrip(uid, 'cm', 'Context Memory agent status before a decay re-check.', { control: 'status' }) as { parked?: boolean; hasActiveEntry?: boolean };
  if (cmStatus.parked || !cmStatus.hasActiveEntry) return [];
  const pStatus = controlRoundTrip(uid, 'personal', 'Personal agent status before a decay re-check.', { control: 'status' }) as { goals?: number };
  if (!pStatus.goals) return [];
  refreshNordeaFromCore(uid);
  return runRound(uid, 'decay').staleFlags;
}

/** Ask the Nordea agent to refresh its own DB from the bank's core data. */
function refreshNordeaFromCore(uid: string, inform?: string) {
  controlRoundTrip(uid, 'nordea', 'Refresh the Nordea DB from core bank data.', { control: 'refresh-from-core', ...(inform ? { inform } : {}) });
}

// ---------- Bank import: the source owner updates its DB, then decay detection runs ----------

export function applyBankImportToArch(uid: string): { updated: boolean; reason?: string; staleFlags: BuildRound['staleFlags'] } {
  if (!nordeaFileExists(uid)) return { updated: false, reason: 'the three-database architecture is not in use for this customer', staleFlags: [] };
  if (getOff(uid).includes('nordea')) return { updated: false, reason: 'the Nordea agent is off', staleFlags: [] };
  refreshNordeaFromCore(uid, 'Nordea agent updated the Nordea DB from the new bank import ({n} transactions, {m}) and re-checked accepted cabinet entries.');
  let staleFlags: BuildRound['staleFlags'] = [];
  if (!getOff(uid).includes('cm') && !getOff(uid).includes('personal')) {
    const cmStatus = controlRoundTrip(uid, 'cm', 'Context Memory agent status before a decay re-check.', { control: 'status' }) as { parked?: boolean };
    if (!cmStatus.parked) staleFlags = runRound(uid, 'decay').staleFlags;
  }
  return { updated: true, staleFlags };
}

// ---------- Separate controls: off, disconnect, delete ----------

export function setAgentOff(uid: string, agent: AgentId, off: boolean) {
  const current = getOff(uid);
  const next = off ? [...new Set([...current, agent])] : current.filter((a) => a !== agent);
  setAgentsOff(uid, next);
  appendMessage(uid, { from: agent, to: 'user', type: 'inform', summary: `${agent} agent turned ${off ? 'off' : 'on'}. Its database was not touched.` });
  // While the Nordea agent is off, imports do not touch its DB at all; while the CM agent is
  // off, imports update the Nordea DB without detection. Re-check before either serves again.
  if (!off && (agent === 'cm' || agent === 'nordea')) recheckBeforeReuse(uid);
  return next;
}

export function deleteDatabase(uid: string, which: 'user' | 'cm' | 'nordea') {
  if (which === 'user') deleteUserDb(uid);
  else if (which === 'cm') deleteCmDb(uid);
  else deleteNordeaDb(uid);
  // The shared context.md is derived from all three databases; with one wiped it is stale,
  // so the document is deleted too and rebuilt by the next build round.
  deleteContext(uid);
  appendMessage(uid, { from: which === 'user' ? 'personal' : which, to: 'user', type: 'inform', summary: `The ${which === 'cm' ? 'Context Memory' : which === 'user' ? 'User' : 'Nordea'} DB was deleted on your request. Other databases and message history were not touched.` });
}

// ---------- Overview (the customer's own dashboard - the app layer, not an agent) ----------

export function listEntries(uid: string) {
  return loadCmDb(uid);
}

export function archState(uid: string) {
  const off = getOff(uid);
  const u = loadUserDb(uid);
  const cm = loadCmDb(uid);
  const bus = loadBus(uid);
  const nordea = nordeaFileExists(uid) ? loadNordeaDb(uid) : null;
  return {
    userId: uid,
    agents: {
      personal: { mode: u.personalAgent.mode, name: personalLabel(u), simulated: u.personalAgent.mode === 'external', off: off.includes('personal') },
      cm: { off: off.includes('cm') },
      nordea: { off: off.includes('nordea') },
    },
    databases: {
      user: { goals: u.goals.length, personalFacts: u.personalFacts.length, profile: !!u.profileName },
      contextMemory: { entries: cm.entries.length, disputed: cm.entries.filter((e) => e.status === 'disputed').length, parked: !!cm.parked, permissions: cm.permissions ?? null },
      nordea: nordea ? { accounts: nordea.accounts.length, transactions: nordea.transactions.length } : null,
    },
    contextMd: (() => { const d = loadContext(uid); return d ? renderContextMd(uid, d) : null; })(),
    queues: {
      airlock: bus.airlock.filter((b) => b.status === 'pending'),
      review: bus.messages.filter((m) => m.type === 'propose' && m.status === 'pending'),
    },
    messages: bus.messages.slice(-40).reverse(),
  };
}

// Re-export the personal agent's customer-facing API so callers have one entry point.
export {
  addGoalDirect, connectExternalAgent, disconnectPersonalAgent, stageSync, decideAirlock, groundNumbers,
} from './agents/personal.js';
export { publishParkState };
export { ArchError } from './types.js';
export { runRound } from './rounds.js';
