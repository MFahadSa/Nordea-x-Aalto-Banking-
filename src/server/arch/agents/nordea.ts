/**
 * The NORDEA agent. It works for Nordea and opens ONLY the Nordea DB (plus the shared bus
 * and the bank's core data feed it syncs from). It answers with aggregates, proposes
 * goal-relevant insights, and confirms or refreshes stored values when the Context Memory
 * agent asks. It never opens the User DB or the Context Memory DB.
 * Boundary pinned by the AC1 source-scan test: this module imports no other agent's store.
 */
import { db } from '../../db.js';
import { now } from '../types.js';
import type { AgentMessage, NordeaDb } from '../types.js';
import { words, overlaps, CATEGORY_HINTS } from '../text.js';
import { loadNordeaDb, saveNordeaDb, nordeaFileExists } from '../store/nordeaStore.js';
import { readSectionRows, writeNordeaSection } from '../store/contextStore.js';
import type { ContextRow } from '../store/contextStore.js';
import { appendMessage, loadBus, updateMessage } from '../store/busStore.js';
import { registerHandler } from '../dispatcher.js';
import { recordProposals, roundDone } from '../rounds.js';

/** F26: evidence carries a hash of the FULL sorted id set, so churn checks compare like
 * with like. The 25-id sample stays for display/risk only - never for comparison.
 * FNV-1a, no imports: change detection only, not security. */
const hashIds = (ids: string[]) => {
  let h = 0x811c9dc5;
  for (const c of [...ids].sort().join('|')) { h ^= c.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
};

/** The Nordea agent syncs its own DB from the bank's core data (the app's bank records). */
export function refreshFromCore(uid: string): NordeaDb {
  const fresh: NordeaDb = {
    userId: uid,
    accounts: db.getBankAccounts(uid).map((a) => ({ ...a })),
    transactions: db.getTransactions(uid).map((t) => ({ ...t })),
  };
  saveNordeaDb(fresh);
  return fresh;
}

/** The Nordea DB starts as a one-time copy of the customer's bank data the app already holds. */
export function prepare(uid: string): { transactions: number; accounts: number } {
  if (nordeaFileExists(uid)) {
    const existing = loadNordeaDb(uid)!;
    return { transactions: existing.transactions.length, accounts: existing.accounts.length };
  }
  const fresh = refreshFromCore(uid);
  return { transactions: fresh.transactions.length, accounts: fresh.accounts.length };
}

/** Match transactions against shared goal TITLES (goal details never leave the User DB). */
function matchForTitles(nordea: NordeaDb, titles: string[]) {
  const gw = titles.flatMap((t) => words(t));
  const hinted = new Set(gw.flatMap((w) => CATEGORY_HINTS[w] ?? []));
  return nordea.transactions.filter((t) =>
    overlaps(gw, words(`${t.description ?? ''} ${t.counterparty ?? ''}`)) || hinted.has(t.category));
}

const totalOf = (matches: { amount: number }[]) => Math.round(matches.reduce((s, t) => s + Math.abs(t.amount), 0) * 100) / 100;

function pendingProposalSummaries(uid: string): Set<string> {
  return new Set(loadBus(uid).messages.filter((m) => m.type === 'propose' && m.status === 'pending').map((m) => m.summary));
}

function handleMessage(uid: string, msg: AgentMessage) {
  const payload = (msg.payload ?? {}) as Record<string, unknown>;

  // --- Contribution query from the Context Memory agent (inside a build round).
  if (msg.type === 'query' && payload.purpose === 'contribute' && typeof payload.roundId === 'string') {
    // The Nordea agent reads the shared context.md - never the User DB - to decide what is
    // relevant (F6): the goals arrive via the Customer section, not inside the message. A
    // session/top-up query may also carry the customer's question to match against.
    const goals = readSectionRows(uid, 'customer').map((r) => ({ id: r.id, title: r.title }));
    const questionWords = typeof payload.question === 'string' ? words(payload.question as string) : [];
    prepare(uid);
    const nordea = loadNordeaDb(uid)!;
    const alreadyPending = pendingProposalSummaries(uid);
    const proposals: { messageId: string; title: string; detail: string; matched: number; total: number }[] = [];
    const sectionRows: ContextRow[] = [];
    if (questionWords.length) {
      const hinted = new Set(questionWords.flatMap((w) => CATEGORY_HINTS[w] ?? []));
      const qm = nordea.transactions.filter((t) =>
        overlaps(questionWords, words(`${t.description ?? ''} ${t.counterparty ?? ''}`)) || hinted.has(t.category));
      if (qm.length) sectionRows.push({ id: `nq-${payload.roundId as string}`, title: 'Relevant to your question', detail: `${qm.length} transaction${qm.length === 1 ? '' : 's'} totalling ${totalOf(qm)} EUR of related spending`, source: 'nordea', observed: 'observed', evidence: { total: totalOf(qm), matched: qm.length, transactionIds: qm.slice(0, 25).map((t) => t.id), transactionIdsHash: hashIds(qm.map((t) => t.id)) }, at: now() });
    }
    for (const goal of goals) {
      const matches = matchForTitles(nordea, [goal.title]);
      if (!matches.length) continue;
      const total = totalOf(matches);
      sectionRows.push({ id: `nagg-${goal.id}`, title: goal.title, detail: `${matches.length} transaction${matches.length === 1 ? '' : 's'} totalling ${total} EUR of related spending`, source: 'nordea', evidence: { total, matched: matches.length, transactionIds: matches.slice(0, 25).map((t) => t.id), transactionIdsHash: hashIds(matches.map((t) => t.id)) }, at: now() });
      const title = `Activity related to goal "${goal.title}"`;
      if (alreadyPending.has(title)) continue; // no duplicate pending proposals
      const detail = `${matches.length} transaction${matches.length === 1 ? '' : 's'} totalling ${total} EUR of related spending relate to this goal (matched on category and description keywords). Proposed by the Nordea agent from the Nordea DB only - the raw transactions stay there.`;
      const posted = appendMessage(uid, {
        from: 'nordea', to: 'cm', type: 'propose', status: 'pending',
        summary: title,
        payload: { inReplyTo: msg.id, roundId: payload.roundId, goalIds: [goal.id], detail, transactionIds: matches.slice(0, 25).map((t) => t.id), transactionIdsHash: hashIds(matches.map((t) => t.id)), total },
      });
      proposals.push({ messageId: posted.id, title, detail, matched: matches.length, total });
    }
    // The Nordea agent's section of the shared document (AC5): aggregates + evidence only.
    // F15-7/F18: every round MERGES - new rows replace rows with the same id, nothing else is
    // dropped (session rounds start from an empty document, so merging is replacing there).
    const merged = [...readSectionRows(uid, 'nordea').filter((r) => !sectionRows.some((n) => n.id === r.id)), ...sectionRows];
    writeNordeaSection(uid, merged, { roundId: payload.roundId as string, trigger: String(payload.trigger ?? 'contribution') });
    recordProposals(uid, payload.roundId, proposals);
    appendMessage(uid, {
      from: 'nordea', to: 'cm', type: 'reply', status: 'pending',
      summary: `Nordea agent proposes ${proposals.length} goal-relevant cabinet entr${proposals.length === 1 ? 'y' : 'ies'} (nothing else leaves the Nordea DB).`,
      payload: { inReplyTo: msg.id, purpose: 'contribute', roundId: payload.roundId, proposals: proposals.map((p) => p.messageId) },
    });
    updateMessage(uid, msg.id, { status: 'answered' });
    roundDone(uid, payload.roundId, 'nordea');
    return;
  }

  // --- A direct question for the Nordea agent (agent-query transport): aggregates only.
  if (msg.type === 'query' && typeof payload.question === 'string') {
    prepare(uid);
    const nordea = loadNordeaDb(uid)!;
    const q = words(payload.question);
    const hinted = new Set(q.flatMap((w) => CATEGORY_HINTS[w] ?? []));
    const matches = nordea.transactions.filter((t) =>
      hinted.has(t.category) || overlaps(q, words(`${t.category} ${t.description ?? ''}`)));
    const total = totalOf(matches);
    const categories = [...new Set(matches.map((t) => t.category))];
    appendMessage(uid, {
      from: 'nordea', to: msg.from, type: 'reply',
      summary: `Nordea agent returns an aggregate over ${matches.length} transaction${matches.length === 1 ? '' : 's'} from the Nordea DB (no account identifiers, no raw transactions).`,
      payload: {
        inReplyTo: msg.id,
        from: 'nordea-db',
        matchCount: matches.length,
        totalAbsEur: total,
        categories,
        // F9/AC5: aggregates only. Raw transactions (date, amount, description) never leave the Nordea DB.
      },
    });
    updateMessage(uid, msg.id, { status: 'answered' });
    return;
  }

  // --- Refresh request from the Context Memory agent: confirm or refresh stored values.
  if (msg.type === 'refresh' && typeof payload.roundId === 'string') {
    const items = (payload.items ?? []) as { entryId: string; title: string; goalIds?: string[]; goalTitles: string[]; was: number | null; storedIds?: string[]; storedIdsHash?: string; reason?: 'evidence' | 'aged' | 'missing-evidence' }[];
    prepare(uid);
    const nordea = loadNordeaDb(uid)!;
    const alreadyPending = pendingProposalSummaries(uid);
    const results = items.map((item) => {
      const matches = matchForTitles(nordea, item.goalTitles);
      const nowTotal = totalOf(matches);
      const currentIds = matches.map((t) => t.id);
      const currentHash = hashIds(currentIds);
      const storedIds = item.storedIds ?? [];
      // F8: decay is more than a changed total - churned transactions (same total, different
      // payments) and evidence that was never stored both count as decay.
      // F26: compare the FULL id sets via their hashes. Entries stored before hashes existed
      // (25-id sample only) fall back to "a stored id vanished"; the first refresh stores a
      // hash, so they self-heal and never false-flag on >25 matches again.
      const idsChanged = item.storedIdsHash
        ? item.storedIdsHash !== currentHash
        : storedIds.length > 0 && storedIds.some((id) => !currentIds.includes(id));
      // F8 age rule: an entry past the age threshold whose stored total has NO transaction ids
      // to verify against is flagged so the refresh stores verifiable evidence.
      const agedUnverifiable = item.reason === 'aged' && storedIds.length === 0;
      const changed = item.was != null ? item.was !== nowTotal || idsChanged || agedUnverifiable : matches.length > 0;
      if (changed && !alreadyPending.has(item.title)) {
        appendMessage(uid, {
          from: 'nordea', to: 'cm', type: 'propose', status: 'pending',
          summary: item.title,
          payload: {
            roundId: payload.roundId,
            goalIds: item.goalIds ?? [],
            detail: `${matches.length} transactions totalling ${nowTotal} EUR of related spending relate to this goal (${item.was == null ? 'the stored entry had no evidence to check' : 'refreshed after the earlier values went stale'}). Proposed by the Nordea agent from the Nordea DB only.`,
            transactionIds: matches.slice(0, 25).map((t) => t.id), transactionIdsHash: currentHash, total: nowTotal, refreshOf: item.entryId,
          },
        });
      }
      return { entryId: item.entryId, title: item.title, was: item.was, now: nowTotal, changed, matched: matches.length, idsChanged, reason: item.reason ?? 'evidence' };
    });
    // Keep the Nordea section of the shared document current after a refresh (AC5).
    const docGoals = readSectionRows(uid, 'customer').map((r) => ({ id: r.id, title: r.title }));
    if (docGoals.length) {
      const rows: ContextRow[] = [];
      for (const g of docGoals) {
        const gm = matchForTitles(nordea, [g.title]);
        if (gm.length) rows.push({ id: `nagg-${g.id}`, title: g.title, detail: `${gm.length} transaction${gm.length === 1 ? '' : 's'} totalling ${totalOf(gm)} EUR of related spending (refreshed against current bank data)`, source: 'nordea', evidence: { total: totalOf(gm), matched: gm.length, transactionIds: gm.slice(0, 25).map((t) => t.id), transactionIdsHash: hashIds(gm.map((t) => t.id)) }, at: now() });
      }
      // F18: maintenance merges - refreshed figures update matching rows, no row is dropped.
      const merged = [...readSectionRows(uid, 'nordea').filter((r) => !rows.some((n) => n.id === r.id)), ...rows];
      writeNordeaSection(uid, merged, { roundId: payload.roundId, trigger: 'decay' });
    }
    appendMessage(uid, {
      from: 'nordea', to: 'cm', type: 'reply', status: 'pending',
      summary: `Nordea agent confirms current values for ${results.length} entr${results.length === 1 ? 'y' : 'ies'}; ${results.filter((r) => r.changed).length} changed.`,
      payload: { inReplyTo: msg.id, purpose: 'refresh', roundId: payload.roundId, results },
    });
    updateMessage(uid, msg.id, { status: 'answered' });
    roundDone(uid, payload.roundId, 'nordea');
    return;
  }

  // --- App control: prepare the Nordea DB (seed from core on first use) and report counts.
  if (msg.type === 'control' && payload.control === 'prepare') {
    const counts = prepare(uid);
    appendMessage(uid, { from: 'nordea', to: 'app', type: 'reply', summary: `Nordea agent prepared its DB: ${counts.transactions} transactions, ${counts.accounts} accounts.`, payload: { inReplyTo: msg.id, ...counts } });
    updateMessage(uid, msg.id, { status: 'answered' });
    return;
  }

  // --- App control: refresh the Nordea DB from the bank's core data (import / resume / turn-on).
  if (msg.type === 'control' && payload.control === 'refresh-from-core') {
    const fresh = refreshFromCore(uid);
    if (typeof payload.inform === 'string' && payload.inform) {
      appendMessage(uid, { from: 'nordea', to: 'user', type: 'inform', summary: payload.inform.replace('{n}', String(fresh.transactions.length)).replace('{m}', `${fresh.accounts.length} account${fresh.accounts.length === 1 ? '' : 's'}`) });
    }
    appendMessage(uid, { from: 'nordea', to: 'app', type: 'reply', summary: 'Nordea DB refreshed from core bank data.', payload: { inReplyTo: msg.id, updated: true, transactions: fresh.transactions.length, accounts: fresh.accounts.length } });
    updateMessage(uid, msg.id, { status: 'answered' });
    return;
  }
}

registerHandler('nordea', handleMessage);
