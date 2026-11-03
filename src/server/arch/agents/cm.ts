/**
 * The CONTEXT MEMORY agent. It owns the shared context cabinet and opens ONLY the
 * Context Memory DB (plus the shared bus). It retrieves entries for other agents by
 * message, finalises build rounds, keeps the cabinet coherent, and maintains memory
 * against decay by ASKING other agents - it never opens their databases.
 * Boundary pinned by the AC1 source-scan test: this module imports no other agent's store.
 */
import { canPass, effectiveApproval, asMode, DEFAULT_MODE, LEVEL_NAMES } from '../approvalGate.js';
import { newId, now } from '../types.js';
import type { AgentMessage, ArchEntry, StaleFlag } from '../types.js';
import { words, overlaps, overlapScore } from '../text.js';
import { assessProposalRisk, assessEntryRisk, deriveObserved, effectiveProposalRisk, nordeaRiskRunner } from '../risk.js';
import { archLlmEnabled, archLlmIsMock } from '../llm.js';
import { loadCmDb, saveCmDb, storeRoundRecord, storeContextSnapshot, putEntry, removeEntry, addHistoryEvent, deleteHistoryFor, putShare, putUndoRecord, removeUndoRecord } from '../store/cmStore.js';
import { loadContext, readSectionRows, renderContextMd, writeHeader, writeMemorySection } from '../store/contextStore.js';
import type { ContextRow } from '../store/contextStore.js';
import { appendMessage, findMessage, getAgentsOff, loadBus, setCabinetParkedMirror, updateMessage } from '../store/busStore.js';
import { registerHandler } from '../dispatcher.js';
import { loadRound, roundDone, recordStaleFlags } from '../rounds.js';

export const PARKED_WORDING = 'The cabinet is parked: the Context Memory agent is not reading or supplying it. Your entries are kept - nothing was deleted. Reconnect the cabinet explicitly to resume.';

type DecayReason = 'evidence' | 'aged' | 'missing-evidence';
interface RefreshItem { entryId: string; title: string; goalIds: string[]; goalTitles: string[]; was: number | null; storedIds: string[]; storedIdsHash?: string; reason: DecayReason }
interface RefreshResult { entryId: string; title: string; was: number | null; now: number; changed: boolean; matched: number; idsChanged?: boolean; reason?: DecayReason }

/** Entries are re-checked against current bank data once they are this old, even if totals match (F8). */
const STALE_AGE_DAYS = 30;

/**
 * F8: decay candidates are not just entries with a stored total. An entry qualifies when it
 * carries a stored total (churn check), when it is OLDER than STALE_AGE_DAYS (age check), or
 * when it was proposed by the Nordea agent WITHOUT evidence (missing-evidence check). The CM
 * agent only reads its own DB here; the Nordea agent confirms against its own DB by message.
 */
function decayCandidates(uid: string, goalIds?: string[]): { entry: ArchEntry; reason: DecayReason }[] {
  const cm = loadCmDb(uid);
  const cutoff = Date.now() - STALE_AGE_DAYS * 24 * 60 * 60 * 1000;
  const out: { entry: ArchEntry; reason: DecayReason }[] = [];
  for (const e of cm.entries) {
    if (e.status !== 'active') continue;
    if (goalIds && !e.goalIds.some((g) => goalIds.includes(g))) continue;
    if (e.evidence?.total != null) out.push({ entry: e, reason: Date.parse(e.createdAt) < cutoff ? 'aged' : 'evidence' });
    else if (e.proposedBy === 'nordea') out.push({ entry: e, reason: 'missing-evidence' });
    // A personal-sourced entry without evidence carries no figure to re-check - never a candidate.
  }
  return out;
}

/**
 * F24/AC8: customer-side entries decay too. Active entries proposed by the personal agent are
 * confirmed against the User DB BY MESSAGE - a goal the customer dropped flags its entry stale.
 */
function goalCheckCandidates(uid: string): ArchEntry[] {
  // F25: any active entry tied to a goal id - the customer's own AND the Nordea-side entries
  // on that goal - goes stale when the goal is removed from the User DB.
  return loadCmDb(uid).entries.filter((e) => e.status === 'active' && e.goalIds.length > 0);
}

/** Goal titles as written in the Customer section of the shared context.md (AC2). */
function goalTitlesFromDoc(uid: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of readSectionRows(uid, 'customer')) map.set(r.id, r.title);
  return map;
}

/**
 * Retrieval over the CM agent's own entries (AC4/F5): ranked by overlap score, deduped
 * (same normalised title + same evidence total collapses), conflicts flagged (same
 * normalised title, different evidence totals among active entries), observed|inferred markers.
 */
function retrieveRelevant(uid: string, queryWords: string[]): ContextRow[] {
  const cm = loadCmDb(uid);
  const scored = cm.entries
    .map((e) => ({ e, score: overlapScore(queryWords, words(`${e.title} ${e.detail}`)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.createdAt.localeCompare(b.e.createdAt));
  const seen = new Set<string>();
  const rows: ContextRow[] = [];
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // A stale entry that an ACTIVE entry with the same title has replaced (a goal removed and added again) is history,
  // not context: it would print the same item twice. Stale entries with no active twin still show, marked stale.
  const activeTitles = new Set(cm.entries.filter((e) => e.status === 'active').map((e) => norm(e.title)));
  const activeTotalsByTitle = new Map<string, Set<number>>();
  for (const { e } of scored) {
    if (e.status === 'active') {
      const key = norm(e.title);
      const totals = activeTotalsByTitle.get(key) ?? new Set<number>();
      if (e.evidence?.total != null) totals.add(e.evidence.total);
      activeTotalsByTitle.set(key, totals);
    }
  }
  for (const { e } of scored) {
    if (e.status === 'stale' && activeTitles.has(norm(e.title))) continue;
    const key = `${norm(e.title)}|${e.evidence?.total ?? 'x'}|${e.status}`;
    if (seen.has(key)) continue; // dedupe
    seen.add(key);
    const conflict = e.status === 'active' && (activeTotalsByTitle.get(norm(e.title))?.size ?? 0) > 1;
    rows.push({
      id: e.id, title: e.title, detail: e.detail, source: 'cm', status: e.status,
      observed: e.observed ?? (e.evidence?.total != null ? 'observed' : 'inferred'),
      evidence: (e.evidence ?? null) as Record<string, unknown> | null,
      at: e.createdAt,
      ...(conflict ? { conflict: true } : {}),
    });
  }
  return rows;
}

/** The CM agent's section: relevant earlier entries from its own DB, as structured rows (AC4/B1a). */
function writeMemoryFromEntries(uid: string, meta?: { roundId: string; trigger: string }, extraWords: string[] = [], merge = false) {
  const customerWords = readSectionRows(uid, 'customer').flatMap((r) => words(`${r.title} ${r.detail}`));
  const q = [...customerWords, ...extraWords];
  const rows = q.length ? retrieveRelevant(uid, q) : [];
  // Merge across rounds keeps earlier retrievals, but only as the cabinet says NOW: a row whose entry is gone is dropped,
  // its status is refreshed, and a stale entry replaced by an active one of the same title (goal removed, then added
  // again) is history, not context - it would print the item twice.
  const cmNow = loadCmDb(uid);
  const norm2 = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const activeNow = new Set(cmNow.entries.filter((e) => e.status === 'active').map((e) => norm2(e.title)));
  const carried = merge ? readSectionRows(uid, 'memory').filter((r) => !rows.some((n) => n.id === r.id)).flatMap((r) => {
    const e = cmNow.entries.find((x) => x.id === r.id);
    if (!e) return [];
    if (e.status === 'stale' && activeNow.has(norm2(e.title))) return [];
    return [{ ...r, status: e.status, detail: e.detail }];
  }) : [];
  const merged = merge ? [...carried, ...rows] : rows;
  writeMemorySection(uid, merged, meta);
}

/**
 * AC7: after a round finalises, proposals whose code-rule risk level the customer's standing
 * permissions allow are stored automatically - logged, explainable, disputable (AC9). High
 * risk (sensitive topics, inferences, offers, sharing beyond the three agents) always waits.
 */
export function autoStoreRoundProposals(uid: string, roundId?: string, opts?: { fromModeChange?: boolean }) {
  const cm = loadCmDb(uid);
  const reviewLevel = cm.permissions?.reviewLevel ?? 'all';
  const userCardMode = cm.permissions?.userCardMode ?? DEFAULT_MODE; // R2: only for user cards that carry an approval
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const pending = loadBus(uid).messages.filter((m) =>
    m.type === 'propose' && m.status === 'pending' && (roundId === undefined || (m.payload as { roundId?: string } | undefined)?.roundId === roundId));
  let changed = false;
  // D9: bank-side (Nordea) proposal risk is DECIDED by the Nordea AI's validated claim (bound to
  // the exact content by a server-recomputed receipt); the deterministic code rules remain the
  // explicit NO_MODEL path (no provider / mock stand-in / pre-D9 proposals). Uncertified = HIGH.
  const d9Expected = nordeaRiskRunner() !== null || (archLlmEnabled() && !archLlmIsMock());
  for (const proposal of pending) {
    const d9 = proposal.from === 'nordea' ? effectiveProposalRisk(proposal, { modelExpected: d9Expected }) : null;
    const risk = d9 ? d9.risk : assessProposalRisk(proposal);
    // R2: EVERY USER card is gated by the owner's pass table through its EFFECTIVE approval, derived here from the
    // card's own content (not from the claim alone). Missing/invalid/stale level = UNKNOWN = effective level 2.
    // Bank-side proposals never use this gate (standing permissions, unchanged).
    const p0 = (proposal.payload ?? {}) as { detail?: string };
    const approval = proposal.from === 'personal' ? effectiveApproval(proposal.payload, { title: proposal.summary, detail: p0.detail ?? '', source: 'personal', risk }) : null;
    if (approval) {
      // An unchanged card that is already stored (same consent version) is never requeued, whatever the mode says.
      if (cm.entries.some((e) => e.status === 'active' && norm(e.title) === norm(proposal.summary) && e.approval?.id === approval.id)) {
        updateMessage(uid, proposal.id, { status: 'accepted' });
        continue;
      }
      if (!canPass(userCardMode, approval.level)) continue;
    } else { if (reviewLevel === 'all') continue; if (risk === 'high') continue; } // bank side: no standing permissions yet: everything waits; high risk always waits
    const p = (proposal.payload ?? {}) as { goalIds?: string[]; detail?: string; transactionIds?: string[]; transactionIdsHash?: string; total?: number; observed?: 'observed' | 'inferred'; appWrite?: boolean; entry?: ArchEntry };
    const sameTitle = cm.entries.find((e) => e.status === 'active' && norm(e.title) === norm(proposal.summary));
    if (!p.appWrite && sameTitle && !approval) {
      updateMessage(uid, proposal.id, { status: 'accepted' }); // dedupe: keep the existing entry
      continue;
    }
    if (sameTitle && approval) { sameTitle.status = 'stale'; } // R2: the consent version changed and now passes: the old version is history
    // G10: an app write carries its full entry - store it as-is (own id, provenance,
    // doc), now accepted under the customer's standing permissions.
    const entry: ArchEntry = p.appWrite && p.entry
      ? { ...p.entry, doc: p.entry.doc ? { ...p.entry.doc, reviewed: true } : p.entry.doc, viaMessageId: proposal.id, risk, autoAccepted: true, status: 'active' }
      : {
      id: newId('entry'),
      title: proposal.summary,
      detail: p.detail ?? '',
      goalIds: p.goalIds ?? [],
      proposedBy: proposal.from === 'personal' ? 'personal' : 'nordea',
      viaMessageId: proposal.id,
      evidence: { transactionIds: p.transactionIds, transactionIdsHash: p.transactionIdsHash, total: p.total },
      observed: deriveObserved(proposal), // F20: derived from evidence, not the proposer's flag
      risk,
      ...(approval ? { approval: { id: approval.id, level: approval.level } } : {}),
      autoAccepted: true,
      status: 'active',
      createdAt: now(),
    };
    const autoIdx = p.appWrite ? cm.entries.findIndex((e) => e.id === entry.id) : -1;
    if (autoIdx >= 0) cm.entries[autoIdx] = entry; else cm.entries.push(entry); // only the CM agent writes the Context Memory DB
    changed = true;
    updateMessage(uid, proposal.id, { status: 'accepted' });
    appendMessage(uid, { from: 'cm', to: 'user', type: 'inform', summary: approval
      ? `Stored automatically by your "${userCardMode}" setting (not your approval): "${entry.title}", ${LEVEL_NAMES[approval.level]}${approval.unknown ? ` - the AI gave no valid level (${approval.reason}), so it counted as level 2` : ''}${opts?.fromModeChange ? ', released because you changed the mode' : ''}. You can explain, dispute or delete it anytime.`
      : `Stored automatically under your standing permissions (${risk} risk${d9 && !d9.uncertified && (proposal.payload as { riskModel?: string } | undefined)?.riskModel === 'model' ? ', assessed by the Nordea AI' : ''}): "${entry.title}". You can explain, dispute or delete it anytime.` });
  }
  if (changed) saveCmDb(cm);
}

/** Ask the Nordea agent to confirm or refresh the stored values behind decay candidates (AC8). */
function sendRefreshRequest(uid: string, roundId: string, candidates: { entry: ArchEntry; reason: DecayReason }[], titleById: Map<string, string>) {
  const items: RefreshItem[] = candidates.map(({ entry: e, reason }) => ({
    entryId: e.id,
    title: e.title,
    goalIds: e.goalIds,
    goalTitles: e.goalIds.map((id) => titleById.get(id)).filter((t): t is string => !!t),
    was: e.evidence?.total ?? null,
    storedIds: e.evidence?.transactionIds ?? [],
    storedIdsHash: e.evidence?.transactionIdsHash,
    reason,
  }));
  appendMessage(uid, {
    from: 'cm', to: 'nordea', type: 'refresh', status: 'pending',
    summary: `Context Memory agent asks the Nordea agent to confirm or refresh the values behind ${items.length} stored entr${items.length === 1 ? 'y' : 'ies'}.`,
    payload: { purpose: 'refresh', roundId, items },
  });
}

/**
 * Decay detection (AC8): the CM agent detects possible decay from stored evidence and asks
 * the Nordea agent to confirm or refresh - it cannot and does not read the Nordea DB.
 * Step one: it reads the goal titles from the shared context.md, asking the personal agent only for titles the document does not have yet.
 */
function startDecayCheck(uid: string, roundId: string, goalIds?: string[]) {
  // F24: first confirm the goals behind customer-side entries still exist (by message; the
  // personal agent answers from its own DB). Skipped when the personal agent is off.
  if (!getAgentsOff(uid)?.includes('personal')) {
    const goalIdsToCheck = [...new Set(goalCheckCandidates(uid).flatMap((e) => e.goalIds))];
    if (goalIdsToCheck.length) {
      appendMessage(uid, {
        from: 'cm', to: 'personal', type: 'query', status: 'pending',
        summary: `Context Memory agent asks the personal agent to confirm ${goalIdsToCheck.length} goal id${goalIdsToCheck.length === 1 ? '' : 's'} still exist in the User DB.`,
        payload: { purpose: 'decay-goals', roundId, goalIds: goalIdsToCheck },
      });
      return; // the decay-goals reply continues the round
    }
  }
  continueDecayCheck(uid, roundId, goalIds);
}

function continueDecayCheck(uid: string, roundId: string, goalIds?: string[]) {
  const candidates = decayCandidates(uid, goalIds);
  if (!candidates.length) {
    // Nothing with stored evidence: no decay work. Both participants are done.
    roundDone(uid, roundId, 'nordea');
    roundDone(uid, roundId, 'cm');
    return;
  }
  const ids = [...new Set(candidates.flatMap(({ entry: e }) => e.goalIds))];
  const docTitles = goalTitlesFromDoc(uid);
  const missing = ids.filter((id) => !docTitles.has(id));
  if (missing.length) {
    // Entries added before any build round may lack document titles: ask the personal agent.
    appendMessage(uid, {
      from: 'cm', to: 'personal', type: 'query', status: 'pending',
      summary: `Context Memory agent asks the personal agent for the titles of ${missing.length} goal${missing.length === 1 ? '' : 's'} missing from context.md.`,
      payload: { purpose: 'decay-titles', roundId, goalIds: missing },
    });
    return;
  }
  sendRefreshRequest(uid, roundId, candidates, docTitles);
}

function handleMessage(uid: string, msg: AgentMessage) {
  const payload = (msg.payload ?? {}) as Record<string, unknown>;

  // --- A question for the cabinet (from the personal agent, in-app or external client).
  if (msg.type === 'query' && typeof payload.question === 'string') {
    const cm = loadCmDb(uid);
    if (cm.parked) {
      appendMessage(uid, {
        from: 'cm', to: msg.from, type: 'reply',
        summary: 'Context Memory agent answers: the cabinet is parked, so it supplies nothing.',
        payload: { inReplyTo: msg.id, from: 'cm-db', parked: true, matchedEntries: [] },
      });
    } else {
      const q = words(payload.question);
      const hits = retrieveRelevant(uid, q)
        .map((r) => ({ id: r.id, title: r.title, detail: r.detail, status: r.status ?? 'active', evidence: (r.evidence ?? undefined) as { transactionIds?: string[]; total?: number; note?: string } | undefined, observed: r.observed, conflict: r.conflict ?? false }));
      appendMessage(uid, {
        from: 'cm', to: msg.from, type: 'reply',
        summary: `Context Memory agent returns ${hits.length} entr${hits.length === 1 ? 'y' : 'ies'} from the Context Memory DB.`,
        payload: { inReplyTo: msg.id, from: 'cm-db', matchedEntries: hits },
      });
    }
    updateMessage(uid, msg.id, { status: 'answered' });
    return;
  }

  // --- Top-up round (F15-7): add rows to the same session document, never a fresh one.
  if (msg.type === 'round-start' && payload.trigger === 'topup' && typeof payload.roundId === 'string') {
    const question = typeof payload.question === 'string' ? payload.question : '';
    if (loadCmDb(uid).parked) {
      roundDone(uid, payload.roundId, 'nordea');
      roundDone(uid, payload.roundId, 'cm');
      return;
    }
    writeMemoryFromEntries(uid, { roundId: payload.roundId, trigger: 'topup' }, words(question), true);
    appendMessage(uid, {
      from: 'cm', to: 'nordea', type: 'query', status: 'pending',
      summary: 'Context Memory agent asks the Nordea agent to top up the session document with aggregates for a follow-up question.',
      payload: { purpose: 'contribute', roundId: payload.roundId, topup: true, trigger: 'topup', ...(question ? { question } : {}) },
    });
    return;
  }

  // --- Build round kickoff for decay maintenance (import / resume / turn-on triggers).
  if (msg.type === 'round-start' && payload.trigger === 'decay' && typeof payload.roundId === 'string') {
    const cm = loadCmDb(uid);
    if (cm.parked) {
      appendMessage(uid, { from: 'cm', to: 'user', type: 'inform', summary: 'Decay round skipped: the cabinet is parked.' });
      roundDone(uid, payload.roundId, 'nordea');
      roundDone(uid, payload.roundId, 'cm');
      return;
    }
    startDecayCheck(uid, payload.roundId);
    return;
  }

  // --- The personal agent wrote the Customer section of context.md for this round. A session
  // round (F15) retrieves entries relevant to the session's opening question; a contribution
  // round retrieves for the whole Customer section.
  if (msg.type === 'inform' && typeof payload.roundId === 'string') {
    const round = loadRound(uid, payload.roundId);
    const isSession = round?.trigger === 'session';
    const question = round?.question ?? '';
    const llmTitles = round?.llm?.goalTitles; // G4: the CM model's validated retrieval plan
    writeMemoryFromEntries(uid, { roundId: payload.roundId, trigger: round?.trigger ?? 'contribution' }, isSession && question ? words(question) : [], true); // F18: merge; session docs start empty
    appendMessage(uid, {
      from: 'cm', to: 'nordea', type: 'query', status: 'pending',
      summary: isSession
        ? 'Context Memory agent asks the Nordea agent for aggregates relevant to the session question and the Customer section.'
        : 'Context Memory agent asks the Nordea agent for transaction insights relevant to the Customer section of context.md.',
      payload: { purpose: 'contribute', roundId: payload.roundId, trigger: round?.trigger ?? 'contribution', ...(isSession && question ? { question } : {}), ...(llmTitles?.length ? { goalTitles: llmTitles } : {}) },
    });
    return;
  }

  // --- The personal agent answered with goal titles missing from the document (fallback).
  if (msg.type === 'reply' && payload.purpose === 'decay-titles' && typeof payload.roundId === 'string') {
    const goals = (payload.goals ?? []) as { id: string; title: string }[];
    const titleById = goalTitlesFromDoc(uid);
    for (const g of goals) titleById.set(g.id, g.title);
    sendRefreshRequest(uid, payload.roundId, decayCandidates(uid), titleById);
    return;
  }

  // --- The personal agent answered the goal-existence check: missing goals flag their entries stale (F24).
  if (msg.type === 'reply' && payload.purpose === 'decay-goals' && typeof payload.roundId === 'string') {
    const found = new Set(((payload.goals ?? []) as { id: string }[]).map((g) => g.id));
    const gone = goalCheckCandidates(uid).filter((e) => e.goalIds.every((g) => !found.has(g)));
    if (gone.length) {
      const cm = loadCmDb(uid);
      const flags: StaleFlag[] = [];
      for (const e of gone) {
        const entry = cm.entries.find((x) => x.id === e.id && x.status === 'active');
        if (!entry) continue;
        entry.status = 'stale';
        flags.push({ entryId: entry.id, title: entry.title, was: null, nowIs: 0, reason: 'goal-removed' });
        appendMessage(uid, {
          from: 'cm', to: 'personal', type: 'flag-stale',
          summary: `Context Memory agent flags "${entry.title}" stale: the goal behind it no longer exists in the User DB.`,
          payload: { entryId: entry.id, reason: 'goal-removed' },
        });
      }
      saveCmDb(cm);
      recordStaleFlags(uid, payload.roundId, flags);
      appendMessage(uid, { from: 'cm', to: 'user', type: 'inform', summary: `Re-check before reuse: ${flags.length} accepted entr${flags.length === 1 ? 'y was' : 'ies were'} flagged stale because the goal behind ${flags.length === 1 ? 'it' : 'them'} was removed; the usual review rules apply.` });
    }
    continueDecayCheck(uid, payload.roundId);
    return;
  }

  // --- The Nordea agent answered a contribution query: proposals are in review; now decay.
  if (msg.type === 'reply' && payload.purpose === 'contribute' && typeof payload.roundId === 'string') {
    startDecayCheck(uid, payload.roundId);
    return;
  }

  // --- The Nordea agent answered a refresh request: apply confirmed decay.
  if (msg.type === 'reply' && payload.purpose === 'refresh' && typeof payload.roundId === 'string') {
    const results = (payload.results ?? []) as RefreshResult[];
    const changed = results.filter((r) => r.changed);
    const flags: StaleFlag[] = [];
    if (changed.length) {
      const cm = loadCmDb(uid);
      for (const r of changed) {
        const entry = cm.entries.find((e) => e.id === r.entryId && e.status === 'active');
        if (!entry) continue;
        entry.status = 'stale';
        flags.push({ entryId: r.entryId, title: r.title, was: r.was, nowIs: r.now, reason: r.reason ?? 'evidence' });
        const why = r.reason === 'missing-evidence'
          ? 'it was stored without evidence and current bank data gives a different picture'
          : r.idsChanged
            ? `the underlying transactions changed (total ${r.was ?? 'none'} EUR -> ${r.now} EUR)`
            : r.reason === 'aged'
              ? `it is over 30 days old and had no verifiable transaction evidence (total now ${r.now} EUR)`
              : `the matched total changed from ${r.was ?? 'none'} EUR to ${r.now} EUR`;
        appendMessage(uid, {
          from: 'cm', to: 'personal', type: 'flag-stale',
          summary: `Context Memory agent flags "${r.title}" stale: ${why}.`,
          payload: { entryId: r.entryId, was: r.was, now: r.now, reason: r.reason ?? 'evidence' },
        });
      }
      saveCmDb(cm);
      // F28: apply standing permissions to this round's proposals FIRST, then say which
      // actually happened per flagged entry - a same-title replacement is auto-stored,
      // waiting in merge review, or not proposed. (A round's fresh build proposal IS the
      // refresh when it carries the flagged entry's title - the Nordea agent skips its own
      // refresh proposal then, to avoid duplicates.)
      autoStoreRoundProposals(uid, payload.roundId);
      const normT = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const entriesNow = loadCmDb(uid).entries;
      const roundProps = loadBus(uid).messages.filter((m) => m.type === 'propose'
        && (m.payload as { roundId?: string } | undefined)?.roundId === payload.roundId);
      let autoStored = 0, waiting = 0, notProposed = 0;
      for (const f of flags) {
        if (entriesNow.some((e) => e.status === 'active' && normT(e.title) === normT(f.title))) autoStored++;
        else if (roundProps.some((m) => m.status === 'pending' && normT(m.summary) === normT(f.title))) waiting++;
        else notProposed++;
      }
      const parts: string[] = [];
      if (autoStored > 0) parts.push(`${autoStored === flags.length ? 'refreshed figures' : `${autoStored} refreshed`} stored automatically under your standing permissions`);
      if (waiting > 0) parts.push(waiting === flags.length ? 'refreshed figures wait in merge review' : `${waiting} refreshed wait${waiting === 1 ? 's' : ''} in merge review`);
      if (notProposed > 0) parts.push(`${notProposed} not refreshed yet`);
      const outcome = parts.length ? parts.join(', ') + '.' : 'no refreshed figures were proposed.';
      appendMessage(uid, { from: 'cm', to: 'user', type: 'inform', summary: `Re-check before reuse: ${flags.length} accepted entr${flags.length === 1 ? 'y was' : 'ies were'} flagged stale against current bank data; ${outcome}` });
    }
    const round = loadRound(uid, payload.roundId);
    // Keep the round's question context (F15): a session document must not lose its memory rows.
    writeMemoryFromEntries(uid, { roundId: payload.roundId, trigger: round?.trigger ?? 'decay' }, round?.question ? words(round.question) : [], true); // F18: merge, never drop session rows
    recordStaleFlags(uid, payload.roundId, flags);
    roundDone(uid, payload.roundId, 'cm');
    return;
  }

  // --- Customer / app control messages.
  if (msg.type === 'control') {
    const control = payload.control as string;

    if (control === 'regate-proposals') {
      // D9: the Nordea AI assessed the waiting bank-side proposals: re-apply standing permissions.
      autoStoreRoundProposals(uid);
      appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'Waiting bank-side proposals re-checked.', payload: { inReplyTo: msg.id } });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }
    if (control === 'regate-user-cards') {
      // R2: the User AI gave waiting user cards their levels after the round: apply the customer's mode to them now.
      autoStoreRoundProposals(uid);
      appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'Waiting user cards re-checked.', payload: { inReplyTo: msg.id } });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }
    if (control === 'status') {
      const cm = loadCmDb(uid);
      appendMessage(uid, {
        from: 'cm', to: 'app', type: 'reply',
        summary: 'Context Memory agent reports its own status.',
        payload: { inReplyTo: msg.id, parked: !!cm.parked, entries: cm.entries.length, hasActiveEntry: cm.entries.some((e) => e.status === 'active') },
      });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }

    if (control === 'park' || control === 'resume') {
      const want = control === 'park';
      const cm = loadCmDb(uid);
      if (!!cm.parked !== want) {
        cm.parked = want || undefined;
        saveCmDb(cm);
        setCabinetParkedMirror(uid, want);
        appendMessage(uid, { from: 'cm', to: 'user', type: 'inform', summary: want
          ? `You parked the cabinet: ${cm.entries.length} entr${cm.entries.length === 1 ? 'y' : 'ies'} kept, nothing deleted. Until you reconnect it, no agent reads the cabinet and no proposals are accepted into it.`
          : 'You reconnected the cabinet. The Context Memory agent reads and supplies it again.' });
      }
      appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: `Cabinet ${want ? 'parked' : 'resumed'}.`, payload: { inReplyTo: msg.id, parked: want, entries: cm.entries.length } });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }

    // --- G2: app writes to the Context Memory DB go through the CM agent (it owns the store).
    // Risk and observed are derived by code rules here, never taken from the caller (AC7/F20).
    if (control === 'put-entry') {
      const inEntry = payload.entry as ArchEntry;
      const doc = (inEntry.doc ?? {}) as { source?: string; reviewed?: boolean };
      const { risk, observed } = assessEntryRisk({ title: inEntry.title, detail: inEntry.detail, source: doc.source, evidence: inEntry.evidence });
      // G10: ONE consent path. A high-risk or unreviewed app write waits in the CM review
      // queue exactly like an agent proposal, under the same standing permissions (AC7) -
      // nothing reaches the cabinet active without the customer's consent somewhere.
      // An archive is a removal, not new content: it lands directly, and a still-waiting
      // proposal for the same entry is withdrawn so a late accept cannot resurrect it.
      if (inEntry.status === 'archived') {
        const waiting = loadBus(uid).messages.find((m) => m.type === 'propose' && m.status === 'pending'
          && (m.payload as { appWrite?: boolean; entry?: { id?: string } } | undefined)?.appWrite === true
          && (m.payload as { entry?: { id?: string } } | undefined)?.entry?.id === inEntry.id);
        if (waiting) updateMessage(uid, waiting.id, { status: 'rejected' });
        putEntry(uid, { ...inEntry, risk, observed });
        appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: `Context Memory agent archived "${inEntry.title}".`, payload: { inReplyTo: msg.id, ok: true, archived: true } });
        updateMessage(uid, msg.id, { status: 'answered' });
        return;
      }
      if (risk === 'high' || doc.reviewed === false) {
        // One pending proposal per entry id: a repeated write refreshes the waiting
        // proposal instead of stacking duplicates in the customer's review queue.
        const existing = loadBus(uid).messages.find((m) => m.type === 'propose' && m.status === 'pending'
          && (m.payload as { appWrite?: boolean; entry?: { id?: string } } | undefined)?.appWrite === true
          && (m.payload as { entry?: { id?: string } } | undefined)?.entry?.id === inEntry.id);
        const proposal = existing ?? appendMessage(uid, {
          from: 'cm', to: 'user', type: 'propose', status: 'pending',
          summary: inEntry.title,
          payload: {},
        });
        updateMessage(uid, proposal.id, {
          summary: inEntry.title,
          payload: { detail: inEntry.detail, goalIds: inEntry.goalIds, appWrite: true, entry: { ...inEntry, risk, observed }, risk, observed },
        });
        autoStoreRoundProposals(uid); // standing permissions ('high') auto-store low/medium
        const stored = loadCmDb(uid).entries.some((e) => e.id === inEntry.id && e.viaMessageId === proposal.id);
        // G11: a changed observation queues - hold the previously stored copy
        // (reviewed=false) until the customer decides, so Abel never reads the stale
        // figure as reviewed (v2 hid it until re-checked). Accept re-reviews; reject
        // leaves it held, exactly v2's "hidden until re-checked".
        if (!stored) {
          const prior = loadCmDb(uid).entries.find((e) => e.id === inEntry.id);
          if (prior && (prior.doc as { reviewed?: boolean } | undefined)?.reviewed !== false) {
            putEntry(uid, { ...prior, doc: { ...prior.doc, reviewed: false } as typeof prior.doc });
          }
        }
        appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: stored
          ? `Context Memory agent stored "${inEntry.title}" under the customer's standing permissions (${risk} risk).`
          : `"${inEntry.title}" waits in merge review (${risk} risk${doc.reviewed === false ? ', unreviewed' : ''}) - one consent path.`, payload: { inReplyTo: msg.id, ok: stored, queued: !stored, messageId: proposal.id, risk, observed } });
        updateMessage(uid, msg.id, { status: 'answered' });
        return;
      }
      putEntry(uid, { ...inEntry, risk, observed });
      appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: `Context Memory agent stored "${inEntry.title}" (risk: ${risk}, ${observed}).`, payload: { inReplyTo: msg.id, ok: true, risk, observed } });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }
    if (control === 'remove-entry') {
      removeEntry(uid, payload.entryId as string);
      if (payload.purge === true) deleteHistoryFor(uid, payload.entryId as string);
      appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'Context Memory agent removed the entry.', payload: { inReplyTo: msg.id, removed: true } });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }
    if (control === 'log-history') {
      addHistoryEvent(uid, payload.event as Parameters<typeof addHistoryEvent>[1]);
      appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'Context Memory agent logged the entry event.', payload: { inReplyTo: msg.id, ok: true } });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }
    if (control === 'put-share') {
      putShare(uid, payload.share as Parameters<typeof putShare>[1]);
      appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'Context Memory agent stored the share.', payload: { inReplyTo: msg.id, ok: true } });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }
    if (control === 'put-undo') {
      putUndoRecord(uid, payload.record as Parameters<typeof putUndoRecord>[1]);
      appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'Context Memory agent stored the undo record.', payload: { inReplyTo: msg.id, ok: true } });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }
    if (control === 'remove-undo') {
      const removed = removeUndoRecord(uid, payload.token as string);
      appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'Context Memory agent removed the undo record.', payload: { inReplyTo: msg.id, removed } });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }
    if (control === 'withdraw-goal-proposals') {
      // G12: the app deleted a goal; every still-pending proposal carrying that goal id
      // (the personal agent's "Customer goal" and the Nordea agent's activity alike) is
      // withdrawn - accepting one would store an entry for a goal that no longer exists.
      const goalId = payload.goalId as string;
      const stale = loadBus(uid).messages.filter((m) => m.type === 'propose' && m.status === 'pending'
        && ((m.payload as { goalIds?: string[] } | undefined)?.goalIds ?? []).includes(goalId));
      for (const w of stale) updateMessage(uid, w.id, { status: 'rejected' });
      appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: `Context Memory agent withdrew ${stale.length} pending proposal${stale.length === 1 ? '' : 's'} for the removed goal.`, payload: { inReplyTo: msg.id, withdrawn: stale.length } });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }
    if (control === 'review-decision') {
      const messageId = payload.messageId as string;
      const accept = payload.accept === true;
      const proposal = findMessage(uid, messageId);
      if (!proposal) {
        appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'No such proposal.', payload: { inReplyTo: msg.id, error: 'No such proposal.', statusCode: 404 } });
        updateMessage(uid, msg.id, { status: 'answered' });
        return;
      }
      if (!accept) {
        updateMessage(uid, messageId, { status: 'rejected' });
        appendMessage(uid, { from: 'cm', to: 'nordea', type: 'inform', summary: `You rejected the proposal "${proposal.summary}". The Context Memory DB was not changed.` });
        appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'Proposal rejected.', payload: { inReplyTo: msg.id, rejected: true } });
        updateMessage(uid, msg.id, { status: 'answered' });
        return;
      }
      const cm = loadCmDb(uid);
      if (cm.parked) {
        appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: PARKED_WORDING, payload: { inReplyTo: msg.id, error: PARKED_WORDING, statusCode: 409 } });
        updateMessage(uid, msg.id, { status: 'answered' });
        return;
      }
      const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const existing0 = cm.entries.find((e) => e.status === 'active' && norm(e.title) === norm(proposal.summary));
      // R2: a user card whose consent version differs from the stored one is a new version, not a duplicate.
      const newVer = proposal.from === 'personal' && existing0 ? effectiveApproval(proposal.payload, { title: proposal.summary, detail: ((proposal.payload ?? {}) as { detail?: string }).detail ?? '', source: 'personal', risk: assessProposalRisk(proposal) }).id : undefined;
      const existing = existing0 && newVer && existing0.approval?.id !== newVer ? (existing0.status = 'stale', undefined) : existing0;
      const upd = (proposal.payload ?? {}) as { appWrite?: boolean; entry?: ArchEntry };
      if (existing && upd.appWrite === true && upd.entry && upd.entry.id === existing.id) {
        // G11: accepting a queued CHANGE replaces the held copy, explicitly reviewed.
        updateMessage(uid, messageId, { status: 'accepted' });
        const updated: ArchEntry = { ...upd.entry, doc: upd.entry.doc ? { ...upd.entry.doc, reviewed: true } : upd.entry.doc, viaMessageId: proposal.id, status: 'active' };
        putEntry(uid, updated);
        appendMessage(uid, { from: 'cm', to: 'user', type: 'inform', summary: `"${updated.title}" was updated in your cabinet after your review.`, payload: { inReplyTo: proposal.id, entryId: updated.id } });
        appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'Queued update stored.', payload: { inReplyTo: msg.id, entry: updated } });
        updateMessage(uid, msg.id, { status: 'answered' });
        return;
      }
      if (existing) {
        updateMessage(uid, messageId, { status: 'accepted' });
        appendMessage(uid, { from: 'cm', to: 'user', type: 'inform', summary: `"${existing.title}" is already in your cabinet - I kept the existing entry instead of adding a duplicate.`, payload: { inReplyTo: proposal.id, entryId: existing.id, duplicate: true } });
        appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'Proposal was a duplicate of an active entry.', payload: { inReplyTo: msg.id, duplicate: true, entry: existing } });
        updateMessage(uid, msg.id, { status: 'answered' });
        return;
      }
      updateMessage(uid, messageId, { status: 'accepted' });
      const p = (proposal.payload ?? {}) as { goalIds?: string[]; detail?: string; transactionIds?: string[]; transactionIdsHash?: string; total?: number; observed?: 'observed' | 'inferred'; appWrite?: boolean; entry?: ArchEntry };
      // G10: an app write accepted from the queue lands as its carried entry (own id,
      // provenance, doc), explicitly reviewed - not autoAccepted, so per-entry undo skips it.
      const entry: ArchEntry = p.appWrite && p.entry
        ? { ...p.entry, doc: p.entry.doc ? { ...p.entry.doc, reviewed: true } : p.entry.doc, viaMessageId: proposal.id, status: 'active' }
        : {
        id: newId('entry'),
        title: proposal.summary,
        detail: p.detail ?? '',
        goalIds: p.goalIds ?? [],
        // F4: any agent can propose; provenance records who (only agents send proposals)
        proposedBy: proposal.from === 'personal' ? 'personal' : 'nordea',
        viaMessageId: proposal.id,
        evidence: { transactionIds: p.transactionIds, transactionIdsHash: p.transactionIdsHash, total: p.total },
        observed: deriveObserved(proposal), // F20: derived from evidence, not the proposer's flag
        ...(proposal.from === 'personal' ? (() => { const ap = effectiveApproval(proposal.payload, { title: proposal.summary, detail: p.detail ?? '', source: 'personal', risk: assessProposalRisk(proposal) }); return { approval: { id: ap.id, level: ap.level } }; })() : {}),
        status: 'active',
        createdAt: now(),
      };
      const revIdx = p.appWrite ? cm.entries.findIndex((e) => e.id === entry.id) : -1;
      if (revIdx >= 0) cm.entries[revIdx] = entry; else cm.entries.push(entry); // only the CM agent writes the Context Memory DB
      saveCmDb(cm);
      appendMessage(uid, { from: 'cm', to: 'user', type: 'inform', summary: `Context Memory agent added "${entry.title}" to the cabinet after your approval.` });
      appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'Proposal accepted into the cabinet.', payload: { inReplyTo: msg.id, entry } });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }

    if (control === 'undo-entry') {
      // F22/AC9: per-entry undo for AUTOMATICALLY stored entries - removes the entry, keeps a log line.
      const entryId = payload.entryId as string;
      const cm = loadCmDb(uid);
      const entry = cm.entries.find((e) => e.id === entryId);
      if (!entry) {
        appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'No such cabinet entry.', payload: { inReplyTo: msg.id, error: 'No such cabinet entry.', statusCode: 404 } });
        updateMessage(uid, msg.id, { status: 'answered' });
        return;
      }
      if (!entry.autoAccepted) {
        appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'Only automatically stored entries can be undone here; dispute or delete works for the rest.', payload: { inReplyTo: msg.id, error: 'Only automatically stored entries can be undone.', statusCode: 409 } });
        updateMessage(uid, msg.id, { status: 'answered' });
        return;
      }
      cm.entries = cm.entries.filter((e) => e.id !== entryId);
      saveCmDb(cm);
      appendMessage(uid, { from: 'cm', to: 'user', type: 'inform', summary: `Undone: "${entry.title}" was removed from your cabinet. It had been stored automatically under your standing permissions.` });
      appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'Entry undone.', payload: { inReplyTo: msg.id, undone: true, title: entry.title } });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }

    if (control === 'dispute') {
      const entryId = payload.entryId as string;
      const reason = String(payload.reason ?? '').trim();
      const cm = loadCmDb(uid);
      const entry = cm.entries.find((e) => e.id === entryId);
      if (!entry) {
        appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'No such cabinet entry.', payload: { inReplyTo: msg.id, error: 'No such cabinet entry.', statusCode: 404 } });
        updateMessage(uid, msg.id, { status: 'answered' });
        return;
      }
      entry.status = 'disputed';
      entry.disputeReason = reason;
      saveCmDb(cm);
      appendMessage(uid, { from: 'cm', to: 'user', type: 'inform', summary: `You disputed "${entry.title}": ${entry.disputeReason}. It stays visible, marked disputed, until you resolve or delete it.` });
      appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'Entry disputed.', payload: { inReplyTo: msg.id, entry } });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }

    if (control === 'explain') {
      const entryId = payload.entryId as string;
      const cm = loadCmDb(uid);
      const entry = cm.entries.find((e) => e.id === entryId);
      if (!entry) {
        appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'No such cabinet entry.', payload: { inReplyTo: msg.id, error: 'No such cabinet entry.', statusCode: 404 } });
        updateMessage(uid, msg.id, { status: 'answered' });
        return;
      }
      const via = entry.viaMessageId ? findMessage(uid, entry.viaMessageId) : undefined;
      appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: `Explanation for "${entry.title}".`, payload: { inReplyTo: msg.id, entry, via: via ?? null } });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }

    if (control === 'set-permissions') {
      // AC7 first start: the customer sets standing permissions once; until then nothing is
      // automatic (reviewLevel 'all' = every proposal waits in merge review).
      const cm0 = loadCmDb(uid);
      const reviewLevel = payload.reviewLevel === undefined ? (cm0.permissions?.reviewLevel ?? 'all') : payload.reviewLevel === 'high' ? 'high' : 'all';
      const userCardMode = asMode(payload.userCardMode) ?? cm0.permissions?.userCardMode;
      const cm = loadCmDb(uid);
      saveCmDb({ ...cm, permissions: { reviewLevel, ...(userCardMode ? { userCardMode } : {}) } });
      appendMessage(uid, { from: 'cm', to: 'user', type: 'inform', summary: reviewLevel === 'high'
        ? 'Standing permissions saved: only HIGH-risk items wait for your review; low and medium risk items are stored automatically (always logged, explainable, disputable).'
        : 'Standing permissions saved: every cabinet item waits for your review.' });
      autoStoreRoundProposals(uid, undefined, { fromModeChange: true }); // R2: a less restrictive mode releases newly allowed pending cards (audited as a mode pass); a stricter one never pulls stored cards back (approval cards are not released by a mode change)
      appendMessage(uid, { from: 'cm', to: 'app', type: 'reply', summary: 'Standing permissions saved.', payload: { inReplyTo: msg.id, reviewLevel, userCardMode: userCardMode ?? DEFAULT_MODE } });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }

    if (control === 'finalize-round') {
      const roundId = payload.roundId as string;
      const round = loadRound(uid, roundId);
      if (round) {
        // The CM agent stores the structured round record in its own DB (AC4/AC6)...
        storeRoundRecord(uid, JSON.stringify(round));
        // ...stamps the shared document finalised, and stores a snapshot of it (AC2/AC4).
        writeHeader(uid, { roundId: round.id, trigger: round.trigger, finalise: true });
        const doc = loadContext(uid);
        if (doc) storeContextSnapshot(uid, round.id, renderContextMd(uid, doc), JSON.stringify(doc.sections));
      }
      if (round) autoStoreRoundProposals(uid, round.id);
      // Confirm to the round engine: the round is 'stored' only on this reply (F13).
      appendMessage(uid, {
        from: 'cm', to: 'app', type: 'reply',
        summary: `Context Memory agent confirms round ${roundId} is stored in the Context Memory DB.`,
        payload: { inReplyTo: msg.id, roundId, stored: !!round, proposals: round?.proposals.length ?? 0, staleFlags: round?.staleFlags.length ?? 0 },
      });
      appendMessage(uid, { from: 'cm', to: 'user', type: 'inform', summary: `Context Memory agent finalised build round ${roundId}: ${round?.proposals.length ?? 0} proposal${(round?.proposals.length ?? 0) === 1 ? '' : 's'} for review, ${round?.staleFlags.length ?? 0} stale flag${(round?.staleFlags.length ?? 0) === 1 ? '' : 's'}; the round record is stored in the Context Memory DB.` });
      updateMessage(uid, msg.id, { status: 'answered' });
      return;
    }
  }
}

registerHandler('cm', handleMessage);

/** Park/resume publishing: keep the bus mirror in sync when state is loaded elsewhere. */
export function publishParkState(uid: string) {
  setCabinetParkedMirror(uid, !!loadCmDb(uid).parked);
}

/**
 * G4/V4: the CM agent's LLM retrieval plan. The model reads only its OWN cabinet (tool
 * below), sees the question and the goal titles the personal agent shares in-round, and
 * PROPOSES which goals need fresh Nordea evidence. Code validates (subset, cap 3) before
 * the round uses it; null = scripted fallback (all goals).
 */
export async function llmPlanRetrieval(uid: string, question: string, goalTitles: string[]): Promise<import('../llm.js').PlanOutcome<string[]>> {
  const { archLlmEnabled, runAgentReasoning, cleanTerms } = await import('../llm.js');
  if (!archLlmEnabled() || !goalTitles.length) return { plan: null, status: 'scripted' };
  const { result: out, error, answeredBy } = await runAgentReasoning({
    uid,
    agent: 'cm',
    system: [
      'You are the Context Memory agent of a banking assistant. You own the cabinet (the shared context between the customer and Nordea).',
      'You may read ONLY your own cabinet through the listMyEntries tool. You never see the User DB or the Nordea DB.',
      'The personal agent shared the customer\'s goal titles for this round. Decide which of them need FRESH evidence from the Nordea agent: skip goals your cabinet already answers well.',
      'End with finishRetrievalPlan.',
    ].join(' '),
    prompt: `Question: ${question || '(contribution round - no explicit question)'}\nGoal titles: ${goalTitles.join('; ')}`,
    tools: [
      { name: 'listMyEntries', description: 'List the active entries in your own cabinet: title, status and detail.', parameters: { type: 'object', properties: {} } },
      { name: 'finishRetrievalPlan', description: 'Finish with the goal titles that need fresh bank evidence.', parameters: { type: 'object', properties: { goalTitles: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' } }, required: ['goalTitles'] } },
    ],
    runTool: (call) => call.name === 'listMyEntries'
      ? loadCmDb(uid).entries.filter((e) => e.status === 'active').map((e) => ({ title: e.title, status: e.status, detail: e.detail.slice(0, 120) }))
      : { error: 'unknown tool' },
    finishTool: 'finishRetrievalPlan',
  });
  if (error) return { plan: null, status: 'error', error };
  if (!out) return { plan: null, status: 'scripted' };
  const original = new Map(goalTitles.map((g) => [g.toLowerCase(), g]));
  const picked = cleanTerms(out.goalTitles, 3).map((g) => original.get(g)).filter((g): g is string => !!g);
  return picked.length ? { plan: picked, status: 'model', ...(answeredBy ? { answeredBy } : {}) } : { plan: null, status: 'scripted' };
}
