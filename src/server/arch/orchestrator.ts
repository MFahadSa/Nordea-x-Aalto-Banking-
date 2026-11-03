/**
 * The orchestration layer: composes the three agents for the HTTP API. This is the app
 * server, NOT an agent - it never does an agent's retrieval for it. It opens rounds and
 * control messages, runs the dispatcher, reads reply payloads, and renders the customer's
 * own dashboard. Agents talk to each other only through bus messages.
 */
import { ArchError, newId, now } from './types.js';
import type { AgentId, AgentMessage, ArchEntry, BuildRound, Goal } from './types.js';
import { overlaps, words } from './text.js';
import { addGoalDirect } from './agents/personal.js';
import { dispatchPending } from './dispatcher.js';
import { runRound, loadLatestRound } from './rounds.js';
import {
  beginChat, finishChat, postAgentQuery, readAgentReply, personalLabel,
} from './agents/personal.js';
import { PARKED_WORDING, publishParkState } from './agents/cm.js';
import { archLlmConfig } from './llm.js';
import { effectiveApproval, LEVEL_NAMES } from './approvalGate.js';
import { assessProposalRisk } from './risk.js';
import { MAX_CYCLES, canReview, canStartCycle } from './cycles.js';
import { aiVisibility } from './aiActivity.js';
import './agents/nordea.js'; // side effect: registers the Nordea agent's bus handler
import { loadUserDb, saveUserDb, deleteUserDb } from './store/userStore.js';
import { loadCmDb, deleteCmDb } from './store/cmStore.js';
import { loadNordeaDb, nordeaFileExists, deleteNordeaDb } from './store/nordeaStore.js';
import { deleteContext, loadContext, renderContextMd, resetContextForSession } from './store/contextStore.js';
import {
  appendMessage, findMessage, getAgentsOff, setAgentsOff, loadBus, busKvGet, busKvSet, getCabinetParkedMirror,
} from './store/busStore.js';
import fs from 'fs';
import path from 'path';
import { fileFor, remoteConfigured, listCustomers, listStoredIds, hydrateSkipped } from './store/common.js';
import { isCanonicalCustomerId } from '../customerId.js';

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
  // F-A: a session whose opening round never ran (pre-created by /session/new, or rounds
  // were blocked when it started) is still new - its next question must open the session round.
  if (existing && !clientSessionId && nowIso < new Date(new Date(existing.lastActivityAt).getTime() + SESSION_IDLE_MS).toISOString()) {
    return { session: existing, isNew: existing.roundId === '' };
  }
  if (existing && clientSessionId && existing.id === clientSessionId) return { session: existing, isNew: existing.roundId === '' };
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
export async function chat(uid: string, text: string, clientSessionId?: string): Promise<{ reply: string; used: string[]; sessionId: string; category?: QuestionCategory; intent?: ChatIntent; source: 'model' | 'scripted' | 'scripted-error'; provider?: string; suggestions?: string[]; plan?: { cm: string; nordea: string; provider?: string; error?: string } }> {
  const parked = getCabinetParkedMirror(uid); // the personal agent's parked gate, no status ping
  const { session, isNew } = resolveSession(uid, clientSessionId);
  // F17: direct input (a typed goal) is saved BEFORE any round opens, so the session round's
  // Customer section already includes it.
  // Outcome R6: the goal intents (add / modify / remove) are recognised by code from what the customer
  // typed and act on the User DB; nothing else is invented as an action.
  const goalSig = () => JSON.stringify(loadUserDb(uid).goals.map((g) => [g.id, g.title, g.detail]));
  const sigBefore = goalSig();
  const goalDirect = goalIntentTurn(uid, text);
  // R9: insights follow a REAL goal change (add, modify or remove) - not a question or a confirmation prompt.
  if (goalDirect && goalSig() !== sigBefore) await autoInsights(uid);
  let begin: ReturnType<typeof beginChat> = goalDirect ? { kind: 'direct', direct: goalDirect } : beginChat(uid, text, session.id);
  // The plan is only computed when a round will actually use it (a provider call per plan).
  let planStatus: { cm: 'model' | 'scripted' | 'error'; nordea: 'model' | 'scripted' | 'error'; provider?: string; error?: string } | undefined;
  if (isNew) {
    // F16: a new session always starts from an empty document stamped with its id - even when
    // no round can run (agent off, parked), an earlier session's rows must not leak in.
    // G40: a LIVE session whose round still has not run (roundId stays '' because the round was
    // blocked) re-enters this branch on EVERY question - reset only when the document belongs
    // to another session, or mid-session rows (goals, top-ups) are wiped again and again.
    if (loadContext(uid)?.sessionId !== session.id) resetContextForSession(uid, session.id);
    // F-B: exactly ONE session round opens the session (one plan call set, one round record).
    if (!parked && !getOff(uid).some((a) => a === 'personal' || a === 'cm' || a === 'nordea')) {
      const plan = await planRoundLlm(uid, text);
      const round = runRound(uid, 'session', { question: text, sessionId: session.id, llm: plan });
      session.roundId = round.id;
      planStatus = plan?.status;
      await levelUserCards(uid); // R2: the User AI levels the user cards this session round proposed
      await levelNordeaProposals(uid); // D9: the Nordea AI levels its own proposals from this round
    }
  }
  if (begin.kind === 'direct') { saveSession(uid, { ...session, lastActivityAt: now() }); return { ...begin.direct!, sessionId: session.id, source: 'scripted' }; }
  let answer = finishChat(uid, begin);
  let ranTopup = false; // a gather round already ran this turn (counts as cycle 1 when it closes with a review)
  if (!parked && !isNew && answer.memoryHits === 0 && loadContext(uid)?.finalisedAt) {
    // The document lacks CM-sourced content for this follow-up: top it up, then answer again.
    const plan = await planRoundLlm(uid, text);
    const top = runRound(uid, 'topup', { question: text, sessionId: session.id, llm: plan });
    ranTopup = true;
    planStatus = plan?.status ?? planStatus;
    await levelNordeaProposals(uid); // D9
    if (!session.roundId) session.roundId = top.id;
    begin = beginChat(uid, text, session.id);
    if (begin.kind === 'direct') { saveSession(uid, { ...session, lastActivityAt: now() }); return { ...begin.direct!, sessionId: session.id, source: 'scripted' }; }
    answer = finishChat(uid, begin);
  }
  // G4: the personal agent's model composes the reply from the parts code selected; the
  // grounded template stays as fallback. Every figure in the model's reply must already
  // exist in the selected facts, or the scripted reply stands (no invented numbers).
  const category = classifyQuestion(text, answer.factSources);
  const general = category === 'General Question';
  // V3 cycles: one cycle = User AI > CM > Nordea > User AI, max 5 per turn. The cycle that already ran
  // (session or top-up round) counts as the first. Only with a configured model, only for related questions,
  // and never when the remaining paid-call budget cannot cover another cycle plus the final answer.
  let ceilingNote: string | undefined;
  {
    const LL = { ...(await import('./llm.js')), llmCallsRemaining: (await import('../llm.js')).llmCallsRemaining };
    let cycles = (isNew && session.roundId ? 1 : 0) + (ranTopup ? 1 : 0);
    if (!parked && !general && LL.archLlmEnabled() && !getOff(uid).some((a) => a === 'personal' || a === 'cm' || a === 'nordea')) {
      const { llmReviewCycle } = await import('./agents/personal.js');
      for (;;) {
        if (!canReview(LL.llmCallsRemaining())) break; // best effort: keep the final answer call (null = uncapped, no protection)
        const rev = await llmReviewCycle(uid, text, answer.parts, Math.max(cycles, 1), MAX_CYCLES);
        if (rev.status !== 'model' || rev.enough) break;
        if (cycles >= MAX_CYCLES) { ceilingNote = 'You have used the last cycle. Answer with the best supported answer from the facts and/or ask the customer ONE focused question for the specific information only they can give. Do not ask for anything the facts already contain.'; break; }
        if (!canStartCycle(LL.llmCallsRemaining())) break; // not enough left for a whole cycle plus the final answer
        const gapQ = `${text} (also look for: ${rev.gaps.join(', ')})`;
        const plan = await planRoundLlm(uid, gapQ);
        runRound(uid, 'topup', { question: gapQ, sessionId: session.id, llm: plan });
        await levelNordeaProposals(uid); // D9
        cycles++;
        const nb = beginChat(uid, text, session.id);
        if (nb.kind === 'direct') break;
        begin = nb; answer = finishChat(uid, nb);
      }
    }
  }
  let source: 'model' | 'scripted' | 'scripted-error' = 'scripted';
  let suggestions: string[] = [];
  let answeredBy: string | undefined; // V4: the chain member that actually answered THIS reply
  // G29: no User-DB/context hit must NOT bypass the model - it still composes the reply from
  // whatever it has (its own User DB via tools + the session document); the figure guard below
  // is unchanged, so without sourced facts any invented number drops it back to the scripted text.
  if (!parked && !getOff(uid).includes('personal')) {
    const { llmComposeReply } = await import('./agents/personal.js');
    const composed = await llmComposeReply(uid, text, answer.parts, category, ceilingNote);
    answeredBy = composed.answeredBy;
    // A General Question carries no customer figures, so general numeric facts need no customer record;
    // a Related (or uncertain/mixed) question keeps the figure guard.
    if (composed.plan && ((general && figureExempt(text) && !(composed.seenFacts ?? []).length && !customerFigureClaim(composed.plan)) || figuresGrounded(composed.plan, [...answer.factSources, ...(composed.seenFacts ?? [])]))) {
      // A General reply that carries a figure says so in its text: it is not from the customer's records.
      answer = { ...answer, reply: general && /\d/.test(composed.plan) ? `${composed.plan} (General answer - not from your records.)` : composed.plan };
      source = 'model';
      // Suggestions face the same guard: any figure the facts do not contain drops that suggestion.
      const facts = [...answer.factSources, ...(composed.seenFacts ?? [])];
      suggestions = general && figureExempt(text) && !(composed.seenFacts ?? []).length ? (composed.suggestions ?? []).filter((sg) => !customerFigureClaim(sg) || figuresGrounded(sg, facts)) : (composed.suggestions ?? []).filter((sg) => figuresGrounded(sg, facts));
    } else if (composed.status === 'error') {
      source = 'scripted-error';
      // V3: a configured model that gives no answer is a stated failure, never a canned task answer built from stored rows.
      if (!general) {
        const { isLlmBudgetError } = await import('../llm.js');
        const why = isLlmBudgetError(composed.error ?? '') ? 'the paid-call limit for this server run is used up' : /per model/.test(composed.error ?? '') ? 'the AI models used all their steps without finishing' : 'the AI model did not answer';
        answer = { ...answer, reply: `I couldn't get an answer from the AI model just now (${why}). I haven't guessed from your stored records - please try again.` };
      }
    }
    // No irrelevant bank disclaimer: when a General Question gets no model answer, say so neutrally.
    if (general && source !== 'model') {
      const why = composed.status === 'error' ? `I couldn't get an AI answer to that general question just now - please try again.`
        : composed.status === 'scripted' ? `That looks like a general question, and the AI model is off, so I can't answer it from here.`
        : `I couldn't give a checked answer to that general question - please rephrase it or try again.`;
      answer = { ...answer, reply: why };
    }
    if (composed.status !== 'scripted' || source !== 'scripted') {
      appendMessage(uid, { from: 'personal', to: 'app', type: 'inform', summary: `Chat reply: ${source === 'model' ? 'composed by the model' : source === 'scripted-error' ? 'scripted (provider error)' : 'scripted'}.`, payload: { llm: true, kind: 'chat-reply', source } });
    }
  }
  saveSession(uid, { ...session, lastActivityAt: now() });
  const { archLlmProviderName } = await import('./llm.js');
  // V4: a model reply names the model that answered it (the chain member on this call);
  // a scripted fallback keeps the configured-provider name and never implies a model answered.
  const provider = (source === 'model' ? answeredBy ?? archLlmProviderName() : archLlmProviderName()) ?? undefined;
  return { reply: answer.reply, used: answer.used, sessionId: session.id, source, category, intent: chatIntent(text, category), ...(provider ? { provider } : {}), ...(planStatus ? { plan: planStatus } : {}) };
}


export type QuestionCategory = 'General Question' | 'Related Question';
/** Outcome 4: an exact, code-decided category. "Related Question" = customer banking, accounts,
 *  goals (a banking word in the question, OR rows of the customer's own User DB / shared context
 *  matched). Everything else is a "General Question". Uncertain or mixed questions land on
 *  Related, so the private-fact grounding and the figure guard stay on for them. */
const RELATED_RE = /\b(balance|balances|account|accounts|spent|spend|spending|transaction|transactions|salary|income|money|save|saving|savings|goal|goals|card|cards|loan|loans|mortgage|payment|payments|bill|bills|budget|bank|nordea|iban|rent|debt|invest\w*|pension|grocer\w*|insight\w*|expens\w*|subscription\w*|eating out|invoice\w*|electricity|utilit\w+|receipt\w*|statement\w*|pay|paid|bought|earn\w*|maks\w+|raha\w*|tili\w*|saldo\w*|palk\w+|sääst\w+|laskut?|pankki\w*|lainan?|ruokakauppa\w*|kuluj?\w*|kostnad\w*|lön\w*|konto\w*|my (?:data|facts|notes))\b|[€$£]/i;
/** A General Question may carry general figures. A reply is a customer claim (still guarded) when it uses banking/money wording or says what the customer spent/earned/paid - a bare "you" next to a number is not. */
function customerFigureClaim(t: string): boolean { return RELATED_RE.test(t) || /(you|your|you've|you're)[^.;!?]*(spent|spend|earn|earned|paid|pay|owe|owed|saved|have saved|made|received)/i.test(t); }

export type ChatIntent = 'general' | 'bank_financial' | 'goal_add' | 'goal_modify' | 'goal_remove' | 'other';
/** The intent of a chat turn, decided by code. Goal intents are decided in goalIntentTurn; the rest come from
 *  the question category, with plain greetings/thanks as "other". */
export function chatIntent(text: string, category: QuestionCategory): ChatIntent {
  if (/^\s*(hi|hello|hey|thanks|thank you|ok|okay|cool|bye)\b[\s!.?]*$/i.test(text)) return 'other';
  return category === 'Related Question' ? 'bank_financial' : 'general';
}
// Natural wording, decided by code: polite openers are stripped, then add / remove / modify phrasings are matched.
const POLITE = /^\s*(?:(?:hey|hi|ok|okay)[,!\s]+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|please\s+|i(?:'d| would)\s+like\s+(?:you\s+)?to\s+|i\s+want\s+you\s+to\s+|voisitko\s+(?:ystävällisesti\s+)?|ole\s+hyvä\s+ja\s+|ole\s+kiltti\s+ja\s+)?/i;
const REMOVE_VERB = '(?:remove|delete|drop|cancel|forget(?:\\s+about)?|get\\s+rid\\s+of|stop\\s+tracking|clear|poista|peruuta|unohda)';
const GOAL_REMOVE_A = new RegExp(`^${REMOVE_VERB}\\s+(?:my\\s+|the\\s+|minun\\s+)?(?:(?:goal|tavoite)\\s*[:\\-]?\\s*)?(.+?)(?:\\s+(?:goal|tavoite))?(?:\\s+from\\s+my\\s+goals)?[.!?]*\\s*$`, 'i');
const GOAL_REMOVE_B = /^i\s+(?:no\s+longer\s+want|don'?t\s+want|do\s+not\s+want)\s+(?:my\s+|the\s+)?(?:goal\s*(?:of|to)?\s*)?(.+?)(?:\s+(?:goal|anymore|any\s+more))*[.!?]*\s*$/i;
const GOAL_MODIFY_HEAD = /^(?:change|rename|update|edit|reword|modify|muuta|vaihda|päivitä|paivita)\s+(?:my\s+|the\s+|minun\s+)?(?:(?:goal|tavoite)\s*[:\-]?\s*)?(.+?)[.!?]*\s*$/i;
const GOAL_ADD_A = /^(?:add\s+(?:a\s+|an\s+|new\s+|another\s+)?(?:new\s+)?goal|new\s+goal|set\s+(?:a\s+)?(?:new\s+)?goal|my\s+(?:new\s+)?goal\s+is|goal(?=\s*:))\s*[:\-]?\s*(.+?)[.!?]*\s*$/i;
const GOAL_ADD_B = /^add\s+(.+?)\s+(?:as\s+a\s+goal|to\s+my\s+goals)[.!?]*\s*$/i;
const GOAL_ADD_C = /^(?:i\s+want\s+to|i\s+wanna|i'd\s+like\s+to|i\s+would\s+like\s+to|i\s+wish\s+to|i\s+plan\s+to|i'?m\s+planning\s+to|i\s+am\s+planning\s+to|i\s+need\s+to)\s+((?:save|buy|visit|travel|pay\s+off|go\s+to|reach|afford|start\s+saving|build|invest)\b.*?)[.!?]*\s*$/i;
const GOAL_ADD_D = /^i(?:'m|\s+am)\s+(saving\s+(?:up\s+)?for\s+.+?)[.!?]*\s*$/i;
const GOAL_ADD_FI_A = /^(?:lisää|lisaa)\s+(?:uusi\s+)?tavoite\s*[:\-]?\s*(.+?)[.!?]*\s*$/i;
const GOAL_ADD_FI_B = /^(?:(?:minun\s+)?tavoitteeni\s+on|uusi\s+tavoite\s*[:\-]?)\s*(.+?)[.!?]*\s*$/i;
const GOAL_ADD_FI_C = /^(?:haluan|haluaisin|aion|suunnittelen)\s+((?:säästää|saastaa|ostaa|matkustaa|vierailla|maksaa\s+pois|saavuttaa|rakentaa|sijoittaa|aloittaa\s+säästämisen)(?=\s|$).*?)[.!?]*\s*$/i;
const STOP = new Set(['tavoite', 'tavoitteen', 'minun', 'the', 'my', 'a', 'an', 'to', 'for', 'of', 'goal', 'goals', 'about', 'and', 'in', 'on']);
const goalWords = (t: string) => t.toLowerCase().split(/[^a-z0-9äöå]+/).filter((w) => w.length > 1 && !STOP.has(w));
const cap = (t: string) => t.trim().replace(/^./, (c) => c.toUpperCase());
function findGoal(goals: Goal[], target: string): { goal?: Goal; candidates: Goal[] } {
  const t = target.trim().toLowerCase().replace(/\s+(?:goal|tavoite)$/, '');
  const exact = goals.filter((g) => g.title.trim().toLowerCase() === t);
  if (exact.length === 1) return { goal: exact[0], candidates: exact };
  const part = goals.filter((g) => g.title.toLowerCase().includes(t) || (t.length > 3 && t.includes(g.title.toLowerCase())));
  if (part.length === 1) return { goal: part[0], candidates: part };
  if (part.length > 1) return { candidates: part };
  // Plain words ("my Japan goal"): every meaningful word of the target appears in exactly one goal title.
  const tw = goalWords(t);
  const byWords = tw.length ? goals.filter((g) => { const gw = goalWords(g.title); return tw.every((w) => gw.some((x) => x === w || x.startsWith(w) || w.startsWith(x))); }) : [];
  return byWords.length === 1 ? { goal: byWords[0], candidates: byWords } : { candidates: byWords };
}
/** "X to Y": the goal title itself may contain "to", so pick the split whose left side is an existing goal. */
function splitModify(rest: string, goals: Goal[]): [string, string] | null {
  const seps = [...rest.matchAll(/\s+(?:to|into|as|muotoon|ksi)\s+/gi)];
  const parts = seps.map((m) => [rest.slice(0, m.index).trim(), rest.slice((m.index ?? 0) + m[0].length).trim()] as [string, string]).filter(([l, r]) => l && r);
  return parts.find(([l]) => goals.some((g) => g.title.trim().toLowerCase() === l.toLowerCase()))
    ?? parts.find(([l]) => findGoal(goals, l).goal) ?? parts[0] ?? null;
}
// G47: a remove/modify that matched a goal only partially asks first; a removal can be undone with its details.
const pendingGoalAction = new Map<string, { kind: 'remove' | 'modify'; goalId: string; title?: string; expires: number }>();
const lastRemovedGoal = new Map<string, { goal: Goal; expires: number }>();
const CONFIRM_YES = /^\s*(?:yes|yep|yeah|confirm|do it|go ahead|sure|kyllä|kylla|joo|vahvista)\b[\s,.!]*(?:please\s*)?(?:remove|delete|change|rename|do)?[\s\w]{0,20}[.!]*\s*$/i;
const UNDO = /^\s*(?:please\s+)?(?:undo(?:\s+(?:that|it|the\s+(?:removal|delete)))?|bring\s+(?:it|that|the\s+goal)\s+back|restore\s+(?:it|that|the\s+goal))[.!?]*\s*$/i;

/** Add / modify / remove a goal from chat. Ambiguous or unmatched targets ask instead of acting. */
function goalIntentTurn(uid: string, text: string): { reply: string; used: string[]; intent: ChatIntent } | null {
  const used = ['user-db'];
  const body = text.replace(POLITE, '').trim();
  const goals = loadUserDb(uid).goals;
  const t0 = Date.now();
  if (UNDO.test(body)) {
    const last = lastRemovedGoal.get(uid);
    if (!last || last.expires < t0) return null; // nothing to undo: not a goal action, the normal chat answers
    lastRemovedGoal.delete(uid);
    const back = addGoalDirect(uid, last.goal.title, last.goal.detail ?? '');
    return { reply: `Brought back the goal "${back.title}"${back.detail ? ` with its details (${back.detail})` : ''}.`, used, intent: 'goal_add' };
  }
  const pend = pendingGoalAction.get(uid);
  if (pend && pend.expires >= t0 && CONFIRM_YES.test(body)) {
    pendingGoalAction.delete(uid);
    const g = goals.find((x) => x.id === pend.goalId);
    if (!g) return { reply: 'That goal is no longer there. Nothing changed.', used, intent: pend.kind === 'remove' ? 'goal_remove' : 'goal_modify' };
    if (pend.kind === 'modify') { appWrites.updateGoal(uid, g.id, { title: pend.title }); return { reply: `Changed the goal "${g.title}" to "${pend.title}".`, used, intent: 'goal_modify' }; }
    lastRemovedGoal.set(uid, { goal: g, expires: t0 + 30 * 60_000 });
    appWrites.removeGoal(uid, g.id);
    return { reply: `Removed the goal "${g.title}" from your User DB. Say "undo" within 30 minutes to bring it back with its details (the undo is kept in memory only and is forgotten if the server restarts).`, used, intent: 'goal_remove' };
  }
  if (pend && pend.expires >= t0 && /^\s*(?:no|nope|cancel|never\s*mind|stop|ei|peruuta)\b/i.test(body)) { pendingGoalAction.delete(uid); return { reply: 'OK, nothing changed.', used, intent: pend.kind === 'remove' ? 'goal_remove' : 'goal_modify' }; }
  if (pend) pendingGoalAction.delete(uid); // G48: a turn that is not yes/no drops the pending question
  const rem = body.match(GOAL_REMOVE_A) ?? body.match(GOAL_REMOVE_B);
  const head = rem ? null : body.match(GOAL_MODIFY_HEAD);
  let split = head ? splitModify(head[1], goals) : null;
  // Only a goal request: it names "goal" or its left side is an existing goal. "Update my address to ..." is not ours.
  if (split && !/goal|tavoit/i.test(text) && !findGoal(goals, split[0]).goal) split = null;
  const isQuestion = /\?/.test(body);
  const add = rem || split ? null : (body.match(GOAL_ADD_A) ?? body.match(GOAL_ADD_FI_A) ?? body.match(GOAL_ADD_FI_B) ?? (isQuestion ? null : (body.match(GOAL_ADD_B) ?? body.match(GOAL_ADD_C) ?? body.match(GOAL_ADD_D) ?? body.match(GOAL_ADD_FI_C))));
  if (!rem && !split && !add) return null;
  if (add) {
    const dupe = goals.find((g) => g.title.trim().toLowerCase() === cap(add[1]).trim().toLowerCase() || g.title.trim().toLowerCase() === add[1].trim().toLowerCase());
    if (dupe) return { reply: `You already have the goal "${dupe.title}". Nothing added.`, used, intent: 'goal_add' };
    const g = addGoalDirect(uid, /^(?:add|new|set|my|goal|lisää|lisaa|tavoite|minun|uusi)/i.test(body) ? add[1].trim() : cap(add[1]));
    return { reply: `Saved "${g.title}" as a goal in your User DB. Direct input goes straight in - the sync airlock only gates things your connected personal agent pulls in from WhatsApp, calendar, notes or email.`, used, intent: 'goal_add' };
  }
  const list = goals.map((g) => `"${g.title}"`).join(', ') || 'none yet';
  const target = split ? split[0] : rem![1];
  const found = findGoal(goals, target);
  // A removal phrase that names no goal at all ("forget it", "clear the chat") is not a goal request.
  if (!found.goal && rem && !/goal|tavoit/i.test(text)) return null;
  if (!found.goal) {
    return { reply: found.candidates.length > 1 ? `More than one goal matches "${target.trim()}" (${found.candidates.map((g) => `"${g.title}"`).join(', ')}). Say which one, using its full title. Nothing changed.` : `I couldn't find a goal called "${target.trim()}". Your goals: ${list}. Nothing changed.`, used, intent: split ? 'goal_modify' : 'goal_remove' };
  }
  const exactTitle = (t: string) => found.goal!.title.trim().toLowerCase() === t.trim().toLowerCase();
  if (!exactTitle(target)) {
    // Partial match: never act on it silently. Ask, and act only on an explicit yes.
    pendingGoalAction.set(uid, { kind: split ? 'modify' : 'remove', goalId: found.goal.id, title: split ? cap(split[1]) : undefined, expires: t0 + 5 * 60_000 });
    return { reply: split
      ? `Do you mean the goal "${found.goal.title}"? Change it to "${cap(split[1])}"? Reply yes to confirm or no to cancel (this question is kept for 5 minutes and is forgotten if the server restarts). Nothing changed yet.`
      : `Do you mean the goal "${found.goal.title}"? Remove it? Reply yes to confirm or no to cancel (this question is kept for 5 minutes and is forgotten if the server restarts). Nothing changed yet.`, used, intent: split ? 'goal_modify' : 'goal_remove' };
  }
  if (split) {
    appWrites.updateGoal(uid, found.goal.id, { title: cap(split[1]) });
    return { reply: `Changed the goal "${found.goal.title}" to "${cap(split[1])}".`, used, intent: 'goal_modify' };
  }
  lastRemovedGoal.set(uid, { goal: found.goal, expires: t0 + 30 * 60_000 });
  appWrites.removeGoal(uid, found.goal.id);
  return { reply: `Removed the goal "${found.goal.title}" from your User DB. Say "undo" within 30 minutes to bring it back with its details (the undo is kept in memory only and is forgotten if the server restarts).`, used, intent: 'goal_remove' };
}

const EN_WORDS = /\b(the|is|are|was|were|what|who|whom|when|where|why|how|which|does|do|did|can|could|tell|explain|about|of|in|on|a|an|to|for|and|it|there|that|this)\b/gi;
/** Confident general English: only then may a General reply carry figures with no customer record behind
 *  them. Other languages, non-ASCII letters, first-person wording or very short text are UNCERTAIN: the
 *  question keeps its label (no bank disclaimer, neutral fallback) but the figure guard stays ON. */
function plainGeneralEnglish(t: string): boolean {
  if (/[^\x00-\x7F]/.test(t)) return false;
  if (/\b(i|me|my|mine|myself|we|our|ours|us)\b/i.test(t)) return false;
  const words = t.trim().split(/\s+/).length;
  const hits = (t.match(EN_WORDS) ?? []).length;
  return words >= 3 && hits >= 2 && hits / words >= 0.3;
}
/** Wording that points at a specific item of the asker's ("the last invoice", "this month", "the total of ..."):
 *  the label may stay General, but such a question never earns the no-record figure exemption. */
const SPECIFIC_ITEM_RE = /\b(last|previous|recent|latest|current|this (?:month|week|year)|next|today|yesterday|total|amount|average|monthly|weekly|annual|due|owed|outstanding)\b/i;
export function figureExempt(text: string): boolean { return plainGeneralEnglish(text) && !SPECIFIC_ITEM_RE.test(text); }
export function classifyQuestion(text: string, factSources: string[]): QuestionCategory {
  return RELATED_RE.test(text) || factSources.length > 0 ? 'Related Question' : 'General Question';
}

/** Every figure in the model's reply must come from the facts code selected. Figures are
 *  parsed to numeric values: a separator is thousands only before exactly 3 digits,
 *  otherwise it is a decimal point - so '120' fails against '1200' AND '12.50' fails
 *  against '1,250' (G14), while '12 000' matches '12000'. */
function parseFigures(s: string): number[] {
  const out: number[] = [];
  for (const m of s.matchAll(/\d(?:[\d\s.,]*\d)?/g)) {
    const tok = m[0].replace(/\s/g, '');
    let intPart = '', decPart = '', seenDecimal = false;
    for (let i = 0; i < tok.length; i++) {
      const c = tok[i];
      if (c >= '0' && c <= '9') { if (seenDecimal) decPart += c; else intPart += c; continue; }
      if ((c === '.' || c === ',') && !seenDecimal) {
        const rest = tok.slice(i + 1);
        if (/^\d{3}(\D|$)/.test(rest)) continue; // thousands separator: exactly 3 digits follow
        seenDecimal = true; continue; // decimal separator
      }
    }
    const n = Number(decPart ? `${intPart}.${decPart}` : intPart);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}
function figuresGrounded(reply: string, factSources: string[]): boolean {
  const facts = parseFigures(factSources.join(' '));
  return parseFigures(reply).every((n) => facts.some((f) => Math.abs(f - n) < 1e-9));
}

/**
 * F10 phase 2 / AC11: shared context for the in-app Abel's main chat. The User DB half comes
 * from the PERSONAL AGENT by message (it owns that DB; the app layer never opens it for Abel).
 * The context.md half follows the AC2 session rules: only a finalised document stamped with
 * THIS session's id is served; a missing or other-session document triggers a fresh session
 * build round when the agents can run one - and is otherwise simply not served (never wiped,
 * never leaked across sessions). Nothing here opens an agent's store for fact assembly.
 */
export async function abelSharedContext(uid: string, sessionId: string, question: string): Promise<{ userDbFacts?: string; sharedContext?: string; provenance: string[] }> {
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
      runRound(uid, 'session', { question, sessionId, llm: await planRoundLlm(uid, question) });
      await levelUserCards(uid); // R2
      await levelNordeaProposals(uid); // D9
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


/**
 * G4/V4 pre-step: the CM and Nordea agents' models propose the round's retrieval plan and
 * match terms (their own-store tools only); code validates and the round consumes them.
 * Any failure or missing provider = scripted fallback (null), so tests and the no-AI path
 * behave exactly as before.
 */
async function planRoundLlm(uid: string, question: string): Promise<NonNullable<BuildRound['llm']> | undefined> {
  const { archLlmEnabled } = await import('./llm.js');
  if (!archLlmEnabled()) return undefined;
  if (getOff(uid).some((a) => a === 'personal' || a === 'cm' || a === 'nordea')) return undefined;
  if (getCabinetParkedMirror(uid)) return undefined;
  // The goal titles the personal agent will share this round (same code rule as the
  // scripted round: question-relevant for a session, all for a contribution). The models
  // receive them exactly as they would via the in-round inform message - titles only.
  const u = loadUserDb(uid);
  const qw = question ? words(question) : [];
  const relevant = question ? u.goals.filter((g) => overlaps(qw, words(`${g.title} ${g.detail}`))) : u.goals;
  const titles = relevant.map((g) => g.title);
  if (!titles.length) return undefined;
  const { llmPlanRetrieval } = await import('./agents/cm.js');
  const { llmProposeMatchTerms, prepareInsightDrafts, llmDraftInsightTexts } = await import('./agents/nordea.js');
  const [cmPlan, nordeaPlan] = await Promise.all([llmPlanRetrieval(uid, question, titles), llmProposeMatchTerms(uid, titles)]);
  // Insight cards, model path: the Nordea model may polish each goal's card text from the
  // code-computed breakdown (built from its own DB with the round's match terms). The figure
  // guard admits each text or the deterministic card stands - a failure changes nothing else.
  const insightDrafts = prepareInsightDrafts(uid, titles, nordeaPlan.plan ?? {});
  const insight = await llmDraftInsightTexts(uid, insightDrafts);
  const { archLlmProviderName } = await import('./llm.js');
  // V4: name the model(s) that served the plan calls, not the chain; fall back to the
  // configured provider only when neither plan ran on a model.
  const planProviders = [...new Set([cmPlan.answeredBy, nordeaPlan.answeredBy].filter((x): x is string => !!x))];
  const planProvider = planProviders.length ? planProviders.join(' / ') : archLlmProviderName();
  const status = {
    cm: cmPlan.status, nordea: nordeaPlan.status,
    ...(planProvider ? { provider: planProvider } : {}),
    ...(cmPlan.error || nordeaPlan.error ? { error: [cmPlan.error, nordeaPlan.error].filter(Boolean).join('; ') } : {}),
  };
  if (!cmPlan.plan && !nordeaPlan.plan && !status.error && !Object.keys(insight.texts).length) return undefined; // fully scripted, nothing to record
  const say = (s: 'model' | 'scripted' | 'error') => s === 'model' ? 'model' : s === 'error' ? 'scripted (provider error)' : 'scripted';
  appendMessage(uid, { from: 'cm', to: 'app', type: 'inform', summary: `Round plan: cm ${say(cmPlan.status)}, nordea ${say(nordeaPlan.status)}.`, payload: { llm: true, status } });
  return { ...(cmPlan.plan ? { goalTitles: cmPlan.plan } : {}), ...(nordeaPlan.plan ? { terms: nordeaPlan.plan } : {}), ...(Object.keys(insight.texts).length ? { insightTexts: insight.texts } : {}), status };
}

export interface ContextCard { id: string; title: string; detail: string; status?: string; conflict?: boolean; combines: number; unit: 'bank records' | 'sources'; source: string; at: string }
function contextCards(rows: { id: string; title: string; detail: string; status?: string; conflict?: boolean; source: string; evidence?: Record<string, unknown> | null; at: string }[]): ContextCard[] {
  return rows.map((r) => {
    // The stored id list is capped (25), so the real count comes from `matched` or, for cabinet entries, from the detail text itself.
    const m = Number(r.evidence?.matched ?? r.detail.match(/(\d+) transactions?\b/)?.[1] ?? (Array.isArray(r.evidence?.transactionIds) ? (r.evidence!.transactionIds as unknown[]).length : 0));
    return { id: r.id, title: r.title, detail: r.detail, status: r.status, conflict: r.conflict, combines: m > 0 ? m : 1, unit: m > 0 ? 'bank records' : 'sources', source: r.source, at: r.at };
  });
}

/** Outcome R9: goal-relevant Nordea insights run by themselves after a goal is added or changed. Best effort:
 *  a parked cabinet, an agent that is off or an empty Nordea DB simply means no cards this time. */
export async function autoInsights(uid: string): Promise<number> {
  try { return (await contribute(uid)).proposals.length; } catch { return 0; }
}

export async function contribute(uid: string) {
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
  const round = runRound(uid, 'contribution', { llm: await planRoundLlm(uid, '') });
  await levelUserCards(uid); // R2: the User AI levels the user cards this round proposed
  await levelNordeaProposals(uid); // D9: the Nordea AI levels its own proposals from this round
  return {
    askedVia: round.id,
    proposals: round.proposals,
    staleFlags: round.staleFlags,
    skippedGoals: goalCount === null ? 0 : Math.max(0, goalCount - round.proposals.length),
    existingCabinetEntries: cmStatus.entries ?? 0,
    round: { id: round.id, state: round.state, steps: round.steps, maxSteps: round.maxSteps },
  };
}

/**
 * R2: after any round in which the personal agent may have proposed user cards, the User AI's model levels the ones that
 * have no level yet, then the CM agent re-gates the waiting list under the customer's mode. Best effort: an agent that
 * is off or a parked cabinet means no pass; a card left without a level is UNKNOWN = effective level 2.
 */
export async function levelUserCards(uid: string): Promise<{ asked: number; leveled: number; status: string } | null> {
  if (getOff(uid).some((a) => a === 'personal' || a === 'cm') || getCabinetParkedMirror(uid)) return null;
  const { levelPendingCards } = await import('./agents/personal.js');
  const r = await levelPendingCards(uid);
  if (r.leveled) controlRoundTrip(uid, 'cm', 'Re-check the waiting user cards now that the User AI gave them levels.', { control: 'regate-user-cards' });
  return r;
}

/**
 * D9: after any round in which the Nordea agent may have proposed, the Nordea AI levels the
 * pending bank-side proposals (mirrors R2 levelUserCards), then the CM agent re-gates the
 * waiting list under the customer's standing permissions. Best effort like R2: an agent off or
 * a parked cabinet means no pass; NO_MODEL leaves proposals on the deterministic code path.
 */
export async function levelNordeaProposals(uid: string): Promise<{ asked: number; leveled: number; status: string } | null> {
  if (getOff(uid).some((a) => a === 'nordea' || a === 'cm') || getCabinetParkedMirror(uid)) return null;
  const { levelPendingProposals } = await import('./agents/nordea.js');
  const r = await levelPendingProposals(uid);
  if (r.asked && r.status !== 'scripted') controlRoundTrip(uid, 'cm', 'Re-check the waiting bank-side proposals now that the Nordea AI assessed their risk.', { control: 'regate-proposals' });
  return r;
}

export function reviewQueue(uid: string) {
  return loadBus(uid).messages.filter((m) => m.type === 'propose' && m.status === 'pending').map(withEffectiveApproval);
}

/** R2: what the gate will do with a waiting USER card, for display in arch.html and the main app. Derived from the card's
 *  content exactly as the CM gate derives it; a card with no valid level shows as UNKNOWN (treated as level 2), never as
 *  an AI certification. Bank-side proposals get nothing. */
function withEffectiveApproval(m: AgentMessage): AgentMessage & { effectiveApproval?: { id: string; level: 0 | 1 | 2; unknown: boolean; label: string; why: string } } {
  if (m.from !== 'personal') return m;
  const p = (m.payload ?? {}) as { detail?: string; approvalReason?: string };
  const ap = effectiveApproval(m.payload, { title: m.summary, detail: p.detail ?? '', source: 'personal', risk: assessProposalRisk(m) });
  return { ...m, effectiveApproval: { id: ap.id, level: ap.level, unknown: ap.unknown,
    label: ap.unknown ? 'UNKNOWN: the AI gave no valid level (treated as level 2, not an AI certification)' : LEVEL_NAMES[ap.level],
    why: ap.unknown ? ap.reason : (p.approvalReason ?? '') } };
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
export function setStandingPermissions(uid: string, reviewLevel?: 'all' | 'high', userCardMode?: string) {
  return controlRoundTrip(uid, 'cm', `Customer sets standing permissions${reviewLevel ? `: ${reviewLevel === 'high' ? 'only high risk waits for review' : 'everything waits for review'}` : ''}${userCardMode ? `; user-card approval mode "${userCardMode}"` : ''}.`, { control: 'set-permissions', reviewLevel, userCardMode }) as { reviewLevel: string; userCardMode: string };
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

// ---------- G2: app writes to the three databases go through the owning agent ----------
// Each wrapper is a control round-trip on the bus: auditable, and the owning agent applies
// its own rules (the CM agent derives risk by code; the Nordea agent owns bank-data merge
// semantics). An agent being "off" gates its reasoning/contribution, never the storage
// write itself - imports must land even while the Nordea agent is off.
export const appWrites = {
  putGoal: (uid: string, goal: Goal) =>
    controlRoundTrip(uid, 'personal', `The app writes goal "${goal.title}" to the User DB.`, { control: 'put-goal', goal }),
  removeGoal: (uid: string, goalId: string) => {
    const r = controlRoundTrip(uid, 'personal', 'The app removes a goal from the User DB.', { control: 'remove-goal', goalId });
    // G12: the CM agent owns the review queue - it withdraws pending proposals for the goal.
    controlRoundTrip(uid, 'cm', 'Withdraw pending proposals for the removed goal.', { control: 'withdraw-goal-proposals', goalId });
    // Its active rows leave context.md, each written by the agent that owns the section (the personal agent drops its
    // Customer row inside remove-goal); cabinet history stays.
    controlRoundTrip(uid, 'nordea', 'Drop the removed goal\'s aggregate row from the Nordea section of context.md.', { control: 'drop-goal-rows', goalId });
    return r;
  },
  updateGoal: (uid: string, goalId: string, fields: { title?: string; detail?: string }) =>
    controlRoundTrip(uid, 'personal', 'The app edits a goal in the User DB.', { control: 'update-goal', goalId, ...fields }),
  putProfile: (uid: string, profile: Record<string, unknown>) =>
    controlRoundTrip(uid, 'personal', 'The app updates the profile in the User DB.', { control: 'put-profile', profile }),
  putDocument: (uid: string, doc: unknown) =>
    controlRoundTrip(uid, 'personal', 'The app stores a document in the User DB.', { control: 'put-document', doc }),
  removeDocument: (uid: string, id: string) =>
    controlRoundTrip(uid, 'personal', 'The app removes a document from the User DB.', { control: 'remove-document', id }),
  putEntry: (uid: string, entry: ArchEntry) =>
    controlRoundTrip(uid, 'cm', `The app writes cabinet entry "${entry.title}" to the Context Memory DB.`, { control: 'put-entry', entry }),
  removeEntry: (uid: string, entryId: string, purge: boolean) =>
    controlRoundTrip(uid, 'cm', 'The app removes a cabinet entry from the Context Memory DB.', { control: 'remove-entry', entryId, purge }),
  logHistory: (uid: string, event: unknown) =>
    controlRoundTrip(uid, 'cm', 'The app logs an entry event in the Context Memory DB.', { control: 'log-history', event }),
  putShare: (uid: string, share: unknown) =>
    controlRoundTrip(uid, 'cm', 'The app stores a share in the Context Memory DB.', { control: 'put-share', share }),
  putUndo: (uid: string, record: unknown) =>
    controlRoundTrip(uid, 'cm', 'The app stores an undo record in the Context Memory DB.', { control: 'put-undo', record }),
  removeUndo: (uid: string, token: string) =>
    controlRoundTrip(uid, 'cm', 'The app removes an undo record from the Context Memory DB.', { control: 'remove-undo', token }),
  putTransactions: (uid: string, transactions: unknown[], mode: 'upsert' | 'replace') =>
    controlRoundTrip(uid, 'nordea', 'The app applies bank transactions to the Nordea DB.', { control: 'put-transactions', transactions, mode }),
  putBalances: (uid: string, balances: unknown) =>
    controlRoundTrip(uid, 'nordea', 'The app stores account balances in the Nordea DB.', { control: 'put-balances', balances }),
  putBankAccount: (uid: string, account: unknown) =>
    controlRoundTrip(uid, 'nordea', 'The app stores an account record in the Nordea DB.', { control: 'put-bank-account', account }),
  putSnapshot: (uid: string, snapshot: unknown) =>
    controlRoundTrip(uid, 'nordea', 'The app stores a balance snapshot in the Nordea DB.', { control: 'put-snapshot', snapshot }),
  putImportBatch: (uid: string, batch: unknown) =>
    controlRoundTrip(uid, 'nordea', 'The app records an import batch in the Nordea DB.', { control: 'put-import-batch', batch }),
};

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

/** V5: one connection line per store - backend, file, connected, last write (local mirror
 * stats; in hosted mode the file is the local mirror of the per-agent Postgres tables). */
function storeLine(uid: string, kind: 'user' | 'cm' | 'nordea') {
  const file = fileFor(uid, kind);
  let exists = false; let lastWrite: string | null = null;
  try { const st = fs.statSync(file); exists = true; lastWrite = st.mtime.toISOString(); } catch { /* not created yet */ }
  return {
    backend: remoteConfigured(kind) ? 'postgres' : 'sqlite',
    file: path.basename(file),
    connected: exists,
    lastWrite,
  };
}

/** V5: the customers the loaded dataset knows (picker on /arch.html). */
export function archCustomers() {
  const all = listStoredIds();
  // D12: ids stored under an unsupported (non-canonical) name are not offered; they are reported, never deleted or renamed.
  return { customers: all.filter(isCanonicalCustomerId), rejected: all.filter((u) => !isCanonicalCustomerId(u)), hydrateSkipped: hydrateSkipped() };
}

/** V5: "new session" - rotate the chat session and start from an empty stamped document (F16). */
export function newSession(uid: string) {
  const session: ChatSession = { id: newId('session'), roundId: '', startedAt: now(), lastActivityAt: now() };
  saveSession(uid, session);
  resetContextForSession(uid, session.id);
  return { sessionId: session.id };
}

export function archState(uid: string) {
  const off = getOff(uid);
  const u = loadUserDb(uid);
  const cm = loadCmDb(uid);
  const bus = loadBus(uid);
  const nordea = nordeaFileExists(uid) ? loadNordeaDb(uid) : null;
  const sessionRaw = busKvGet(uid, 'chatSession');
  const session = sessionRaw ? (JSON.parse(sessionRaw) as ChatSession) : null;
  const ctxDoc = loadContext(uid);
  const latestRound = loadLatestRound(uid);
  return {
    userId: uid,
    stores: { user: storeLine(uid, 'user'), cm: storeLine(uid, 'cm'), nordea: storeLine(uid, 'nordea') },
    context: ctxDoc ? { sessionId: ctxDoc.sessionId, roundId: ctxDoc.roundId, trigger: ctxDoc.trigger, openedAt: ctxDoc.openedAt, finalisedAt: ctxDoc.finalisedAt } : null,
    llm: archLlmConfig(),
    // Per-agent live-AI view: the shared chain as configured + each agent's last OBSERVED run (memory only, no probe).
    ai: aiVisibility(uid, off),
    // G31: the latest build round and its truthful per-agent plan path, so the
    // monitor can show which agent reasoned on the model and which fell back.
    round: latestRound
      ? { id: latestRound.id, state: latestRound.state, trigger: latestRound.trigger, closedAt: latestRound.closedAt ?? null, planStatus: latestRound.llm?.status ?? null }
      : null,
    sessionId: session?.id ?? null,
    agents: {
      personal: { mode: u.personalAgent.mode, name: personalLabel(u), simulated: u.personalAgent.mode === 'external', off: off.includes('personal') },
      cm: { off: off.includes('cm') },
      nordea: { off: off.includes('nordea') },
    },
    goals: u.goals.map((g) => ({ id: g.id, title: g.title, detail: g.detail })),
    databases: {
      user: { goals: u.goals.length, personalFacts: u.personalFacts.length, profile: !!u.profileName },
      contextMemory: { entries: cm.entries.length, disputed: cm.entries.filter((e) => e.status === 'disputed').length, parked: !!cm.parked, permissions: cm.permissions ?? null,
        // G31: newest few titles so the monitor card shows real data, not only counts.
        recent: cm.entries.slice(-5).reverse().map((e) => ({ title: e.title, status: e.status, proposedBy: e.proposedBy })) },
      nordea: nordea ? { accounts: nordea.accounts.length, transactions: nordea.transactions.length } : null,
    },
    contextMd: ctxDoc ? renderContextMd(uid, ctxDoc) : null,
    // Outcomes R3-R5: the CM and Nordea windows show the processed cards the agents put on the shared
    // context.md - one card per row, each combining several raw records. No cabinet list, no raw record
    // (no transaction ids, no account identifiers).
    contextCards: ctxDoc ? { memory: contextCards(ctxDoc.sections.memory.rows), nordea: contextCards(ctxDoc.sections.nordea.rows) } : { memory: [], nordea: [] },
    queues: {
      airlock: bus.airlock.filter((b) => b.status === 'pending'),
      review: bus.messages.filter((m) => m.type === 'propose' && m.status === 'pending').map(withEffectiveApproval),
    },
    messages: bus.messages.slice(-80).reverse(),
  };
}

// Re-export the personal agent's customer-facing API so callers have one entry point.
export {
  addGoalDirect, connectExternalAgent, disconnectPersonalAgent, stageSync, decideAirlock, groundNumbers,
} from './agents/personal.js';
export { publishParkState };
export { ArchError } from './types.js';
export { runRound } from './rounds.js';
