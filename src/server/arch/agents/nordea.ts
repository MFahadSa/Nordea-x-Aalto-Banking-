/**
 * The NORDEA agent. It works for Nordea and opens ONLY the Nordea DB (plus the shared bus
 * and the bank's core data feed it syncs from). It answers with aggregates, proposes
 * goal-relevant insights, and confirms or refreshes stored values when the Context Memory
 * agent asks. It never opens the User DB or the Context Memory DB.
 * Boundary pinned by the AC1 source-scan test: this module imports no other agent's store.
 */
import { now } from '../types.js';
import type { AgentMessage, NordeaDb } from '../types.js';
import { words, overlaps, CATEGORY_HINTS } from '../text.js';
import { loadNordeaDb, saveNordeaDb, saveBalances, putBankAccount, putBalanceSnapshot, putImportBatch } from '../store/nordeaStore.js';
import { readSectionRows, writeNordeaSection } from '../store/contextStore.js';
import type { ContextRow } from '../store/contextStore.js';
import { appendMessage, loadBus, updateMessage } from '../store/busStore.js';
import { nordeaRiskReceipt, validateNordeaRiskClaim, nordeaRiskRunner } from '../risk.js';
import type { NordeaRiskItem, NordeaRiskRun } from '../risk.js';
import { registerHandler } from '../dispatcher.js';
import { recordProposals, loadRound, roundDone } from '../rounds.js';

/** F26: evidence carries a hash of the FULL sorted id set, so churn checks compare like
 * with like. The 25-id sample stays for display/risk only - never for comparison.
 * FNV-1a, no imports: change detection only, not security. */
const hashIds = (ids: string[]) => {
  let h = 0x811c9dc5;
  for (const c of [...ids].sort().join('|')) { h ^= c.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
};

/** The DB may not exist yet (no import ever ran) - serve an empty one instead of crashing. */
const nordeaDbOrEmpty = (uid: string): NordeaDb => loadNordeaDb(uid) ?? { userId: uid, accounts: [], transactions: [] };

/** G1: the Nordea DB IS the bank data's one home - imports write it directly, nothing to copy. */
export function prepare(uid: string): { transactions: number; accounts: number } {
  const existing = loadNordeaDb(uid) ?? { userId: uid, accounts: [], transactions: [] };
  return { transactions: existing.transactions.length, accounts: existing.accounts.length };
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
    const round = loadRound(uid, payload.roundId);
    const plannedTitles = Array.isArray(payload.goalTitles) ? new Set((payload.goalTitles as unknown[]).filter((x): x is string => typeof x === 'string')) : null;
    const goals = readSectionRows(uid, 'customer').map((r) => ({ id: r.id, title: r.title })).filter((g) => !plannedTitles || plannedTitles.has(g.title));
    const llmTerms = round?.llm?.terms ?? {}; // G4: the Nordea model's validated match terms
    const questionWords = typeof payload.question === 'string' ? words(payload.question as string) : [];
    const nordea = nordeaDbOrEmpty(uid);
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
      const matches = matchForTitles(nordea, [goal.title, ...(llmTerms[goal.title] ?? [])]);
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
    const nordea = nordeaDbOrEmpty(uid);
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
    const nordea = nordeaDbOrEmpty(uid);
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

  // --- G2: app writes to the Nordea DB go through the Nordea agent (it owns the store).
  if (msg.type === 'control' && payload.control === 'put-transactions') {
    const list = payload.transactions as NordeaDb['transactions'];
    const mode = payload.mode === 'replace' ? 'replace' : 'upsert';
    const nd = loadNordeaDb(uid) ?? { userId: uid, accounts: [], transactions: [] };
    const added: NordeaDb['transactions'] = [];
    const skipped: NordeaDb['transactions'] = [];
    const updated: NordeaDb['transactions'] = [];
    if (mode === 'replace') {
      nd.transactions = [...list];
      added.push(...list);
    } else {
      const byId = new Map(nd.transactions.map((t) => [t.id, t]));
      const seen = new Set<string>();
      // Fields a bank correction may legitimately change between feeds (never the identity fields).
      const CORRECTABLE = ['date', 'amount', 'category', 'account', 'description', 'valueDate', 'status', 'currency', 'counterparty', 'reference', 'paymentMethod', 'originalCategory', 'categorySource'] as const;
      for (const t of list) {
        const existing = byId.get(t.id);
        if (existing || seen.has(t.id)) {
          // A row the bank re-sent under its own stable reference with changed content is a
          // correction, not a duplicate: update it in place, keep the id.
          if (existing && existing.bankId && t.bankId) {
            const diff = CORRECTABLE.filter((f) => (existing as unknown as Record<string, unknown>)[f] !== (t as unknown as Record<string, unknown>)[f]);
            if (diff.length) {
              for (const f of diff) {
                if ((t as unknown as Record<string, unknown>)[f] === undefined) delete (existing as unknown as Record<string, unknown>)[f];
                else (existing as unknown as Record<string, unknown>)[f] = (t as unknown as Record<string, unknown>)[f];
              }
              existing.batchId = t.batchId;
              updated.push(existing);
              continue;
            }
          }
          skipped.push(t);
          continue;
        }
        seen.add(t.id);
        added.push(t);
      }
      nd.transactions.push(...added);
      nd.transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    }
    saveNordeaDb(nd);
    appendMessage(uid, { from: 'nordea', to: 'app', type: 'reply', summary: `Nordea agent applied ${added.length} transaction${added.length === 1 ? '' : 's'} to its DB (${skipped.length} skipped, ${updated.length} corrected).`, payload: { inReplyTo: msg.id, added, skipped, updated } });
    updateMessage(uid, msg.id, { status: 'answered' });
    return;
  }
  if (msg.type === 'control' && payload.control === 'put-balances') {
    saveBalances(uid, payload.balances as Parameters<typeof saveBalances>[1]);
    appendMessage(uid, { from: 'nordea', to: 'app', type: 'reply', summary: 'Nordea agent stored the account balances in its DB.', payload: { inReplyTo: msg.id, ok: true } });
    updateMessage(uid, msg.id, { status: 'answered' });
    return;
  }
  if (msg.type === 'control' && payload.control === 'put-bank-account') {
    const account = payload.account as Parameters<typeof putBankAccount>[1];
    putBankAccount(uid, account);
    appendMessage(uid, { from: 'nordea', to: 'app', type: 'reply', summary: 'Nordea agent stored the account record in its DB.', payload: { inReplyTo: msg.id, account } });
    updateMessage(uid, msg.id, { status: 'answered' });
    return;
  }
  if (msg.type === 'control' && payload.control === 'put-snapshot') {
    putBalanceSnapshot(uid, payload.snapshot as Parameters<typeof putBalanceSnapshot>[1]);
    appendMessage(uid, { from: 'nordea', to: 'app', type: 'reply', summary: 'Nordea agent stored the balance snapshot in its DB.', payload: { inReplyTo: msg.id, ok: true } });
    updateMessage(uid, msg.id, { status: 'answered' });
    return;
  }
  if (msg.type === 'control' && payload.control === 'put-import-batch') {
    putImportBatch(uid, payload.batch as Parameters<typeof putImportBatch>[1]);
    appendMessage(uid, { from: 'nordea', to: 'app', type: 'reply', summary: 'Nordea agent recorded the import batch in its DB.', payload: { inReplyTo: msg.id, ok: true } });
    updateMessage(uid, msg.id, { status: 'answered' });
    return;
  }

  // --- App control: prepare the Nordea DB (seed from core on first use) and report counts.
  if (msg.type === 'control' && payload.control === 'drop-goal-rows') {
    // A removed goal's aggregate row leaves this agent's section of context.md (it owns the write; it works while the agent is off, like every storage write).
    const rows = readSectionRows(uid, 'nordea');
    if (rows.some((r) => r.id === `nagg-${payload.goalId as string}`)) writeNordeaSection(uid, rows.filter((r) => r.id !== `nagg-${payload.goalId as string}`));
    appendMessage(uid, { from: 'nordea', to: 'app', type: 'reply', summary: 'Nordea agent dropped the removed goal from its section of context.md.', payload: { inReplyTo: msg.id, ok: true } });
    updateMessage(uid, msg.id, { status: 'answered' });
    return;
  }
  if (msg.type === 'control' && payload.control === 'prepare') {
    const counts = prepare(uid);
    appendMessage(uid, { from: 'nordea', to: 'app', type: 'reply', summary: `Nordea agent prepared its DB: ${counts.transactions} transactions, ${counts.accounts} accounts.`, payload: { inReplyTo: msg.id, ...counts } });
    updateMessage(uid, msg.id, { status: 'answered' });
    return;
  }

  // --- App control: a bank import landed (imports write the Nordea DB directly now, G1) -
  // report the current counts and inform the customer.
  if (msg.type === 'control' && payload.control === 'refresh-from-core') {
    const counts = prepare(uid);
    if (typeof payload.inform === 'string' && payload.inform) {
      appendMessage(uid, { from: 'nordea', to: 'user', type: 'inform', summary: payload.inform.replace('{n}', String(counts.transactions)).replace('{m}', `${counts.accounts} account${counts.accounts === 1 ? '' : 's'}`) });
    }
    appendMessage(uid, { from: 'nordea', to: 'app', type: 'reply', summary: 'Nordea DB is current (imports write it directly).', payload: { inReplyTo: msg.id, updated: true, ...counts } });
    updateMessage(uid, msg.id, { status: 'answered' });
    return;
  }
}

registerHandler('nordea', handleMessage);

/**
 * G4/V4: the Nordea agent's LLM match-term proposal. The model reads only its OWN Nordea
 * DB (categories + anonymised description words) and PROPOSES extra keywords per goal
 * title; code validates them and still does the matching, totals and evidence itself.
 * null = scripted fallback (title words + category hints only).
 */
export async function llmProposeMatchTerms(uid: string, goalTitles: string[]): Promise<import('../llm.js').PlanOutcome<Record<string, string[]>>> {
  const { archLlmEnabled, runAgentReasoning, cleanTerms } = await import('../llm.js');
  if (!archLlmEnabled() || !goalTitles.length) return { plan: null, status: 'scripted' };
  const { result: out, error, answeredBy } = await runAgentReasoning({
    uid,
    agent: 'nordea',
    system: [
      'You are the Nordea agent of a banking assistant. You own the Nordea DB (accounts and transactions). You propose, you never decide.',
      'You may read ONLY your own database through the tools. Amounts, matching, evidence and every write stay with code.',
      'For each goal title, propose up to 6 extra lowercase keywords or category names that would identify RELATED transactions (synonyms, typical merchants, fitting categories).',
      'End with finishMatchTerms.',
    ].join(' '),
    prompt: `Goal titles: ${goalTitles.join('; ')}`,
    tools: [
      { name: 'listMyCategories', description: 'List the transaction categories in your Nordea DB with counts.', parameters: { type: 'object', properties: {} } },
      { name: 'sampleMyDescriptionWords', description: 'List frequent description words in your transactions (no amounts, no counterparties).', parameters: { type: 'object', properties: {} } },
      { name: 'finishMatchTerms', description: 'Finish with the extra match terms per goal title.', parameters: { type: 'object', properties: { terms: { type: 'object' } }, required: ['terms'] } },
    ],
    runTool: (call) => {
      const db = loadNordeaDb(uid);
      if (!db) return { error: 'no data' };
      if (call.name === 'listMyCategories') {
        const counts = new Map<string, number>();
        for (const t of db.transactions) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
        return [...counts.entries()].map(([category, n]) => ({ category, transactions: n }));
      }
      if (call.name === 'sampleMyDescriptionWords') {
        const freq = new Map<string, number>();
        for (const t of db.transactions) for (const w of words(t.description ?? '')) freq.set(w, (freq.get(w) ?? 0) + 1);
        return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([word, n]) => ({ word, n }));
      }
      return { error: 'unknown tool' };
    },
    finishTool: 'finishMatchTerms',
  });
  if (error) return { plan: null, status: 'error', error };
  if (!out || typeof out.terms !== 'object' || !out.terms) return { plan: null, status: 'scripted' };
  const terms: Record<string, string[]> = {};
  for (const title of goalTitles) {
    const raw = out.terms as Record<string, unknown>;
    const v = raw[title] ?? raw[title.toLowerCase()];
    const cleaned = cleanTerms(v, 6);
    if (cleaned.length) terms[title] = cleaned;
  }
  return Object.keys(terms).length ? { plan: terms, status: 'model', ...(answeredBy ? { answeredBy } : {}) } : { plan: null, status: 'scripted' };
}

/**
 * D9: the Nordea AI decides the risk of ITS OWN pending proposals (owner: the Nordea AI decides
 * risk "similarly like User AI", flexible across future database types). The model sees only the
 * NORMALIZED proposal (title, detail, code-derived observed, evidence hash/total) and may read its
 * own Nordea DB through the same DB-agnostic semantic tools (categories + anonymized words) - no
 * SQL shape, so a future database type only needs a new store adapter, never a model change.
 * NO_MODEL (no provider / mock stand-in): nothing is asked; the deterministic code rules stay the
 * path. An attempted model that fails or answers invalidly marks the proposal UNCERTIFIED (= HIGH
 * at the gate) - never a silent low. Code validates every claim, derives observed itself (F20),
 * binds a content receipt, and keeps a raising-only floor at the gate (risk.ts).
 */
export async function levelPendingProposals(uid: string): Promise<{ asked: number; leveled: number; status: 'model' | 'scripted' | 'error'; error?: string }> {
  const pending = loadBus(uid).messages.filter((m) => m.type === 'propose' && m.from === 'nordea' && m.status === 'pending'
    && !((m.payload ?? {}) as { riskModel?: string }).riskModel);
  if (!pending.length) return { asked: 0, leveled: 0, status: 'scripted' };
  const { archLlmEnabled, archLlmIsMock } = await import('../llm.js');
  const runner = nordeaRiskRunner() ?? (archLlmEnabled() && !archLlmIsMock() ? llmAssignProposalRisk : null);
  if (!runner) return { asked: 0, leveled: 0, status: 'scripted' }; // NO_MODEL: deterministic path, left unmarked
  const items: NordeaRiskItem[] = pending.map((m) => {
    const p = (m.payload ?? {}) as { detail?: string; goalIds?: string[]; transactionIdsHash?: string; total?: number };
    return { messageId: m.id, title: m.summary, detail: p.detail ?? '', observed: 'observed', goalIds: p.goalIds ?? [], transactionIdsHash: p.transactionIdsHash, total: p.total };
  });
  // observed is code-derived per proposal, never the model's label (F20).
  const { deriveObserved } = await import('../risk.js');
  const msgs = loadBus(uid).messages;
  for (const it of items) {
    const m = msgs.find((x) => x.id === it.messageId);
    if (m) it.observed = deriveObserved(m);
  }
  const out = await runner(uid, items);
  let leveled = 0;
  for (const it of items) {
    const m = msgs.find((x) => x.id === it.messageId);
    if (!m || m.status !== 'pending') continue;
    const p = (m.payload ?? {}) as Record<string, unknown>;
    const claim = out.status === 'model' ? validateNordeaRiskClaim(out.claims?.[it.messageId], it) : null;
    if (claim) {
      const receipt = nordeaRiskReceipt({ ...it, risk: claim.risk });
      updateMessage(uid, m.id, { payload: { ...p, riskModel: 'model', riskClaim: { ...claim, ...(out.answeredBy ? { by: out.answeredBy } : {}), receipt } } });
      leveled++;
    } else {
      updateMessage(uid, m.id, { payload: { ...p, riskModel: 'error', riskError: out.status === 'error' ? (out.error ?? 'the model call failed') : 'the model gave no valid risk assessment for this proposal' } });
    }
  }
  appendMessage(uid, { from: 'nordea', to: 'cm', type: 'inform', summary: `Nordea AI assessed ${items.length} proposal${items.length === 1 ? '' : 's'}: ${leveled} got a validated risk level${items.length - leveled ? `, ${items.length - leveled} UNCERTIFIED (count as high risk)` : ''}.`, payload: { d9Risk: true, status: out.status, ...(out.error ? { error: out.error } : {}) } });
  return { asked: items.length, leveled, status: out.status, ...(out.error ? { error: out.error } : {}) };
}

/** The production risk runner: one bounded tool call over the agent's OWN DB (semantic tools only). */
async function llmAssignProposalRisk(uid: string, items: NordeaRiskItem[]): Promise<NordeaRiskRun> {
  const { runAgentReasoning } = await import('../llm.js');
  const { result: out, error, answeredBy } = await runAgentReasoning({
    uid,
    agent: 'nordea',
    system: [
      'You are the Nordea agent of a banking assistant. You own the Nordea DB (accounts and transactions). You decide the RISK of your own proposals; you never write anything.',
      'You may read ONLY your own database through the tools. Amounts, matching, evidence and every write stay with code.',
      'Risk rubric (highest applicable wins): LOW = the proposal only restates its own evidence, no new claim about the customer.',
      'MEDIUM = an observed aggregate over the customer\'s transactions (a conclusion from data, but evidenced and non-sensitive).',
      'HIGH = an inference or unsupported conclusion about the customer, sensitive personal content, or anything meant for offers or sharing beyond the three agents.',
      'The observed/inferred flag is given by code (F20) - never restate it as your own; you only choose the risk level.',
      'When unsure between two levels, choose the higher one. For each proposal give: risk (low, medium or high), a short reason,',
      'and evidence: "goal:<id>" for a goal row behind the proposal, "txh:<hash>" for its evidence hash, and/or exact phrases copied from the proposal.',
      'End with finishProposalRisk.',
    ].join(' '),
    prompt: `Proposals:\n${items.map((i) => `- proposal ${i.messageId} | title: ${i.title} | detail: ${i.detail} | ${i.observed} (code-derived) | matched total: ${i.total ?? 'n/a'} EUR | evidence hash: ${i.transactionIdsHash ?? 'none'} | goals: ${i.goalIds.join(',') || 'none'}`).join('\n')}`,
    tools: [
      { name: 'listMyCategories', description: 'List the transaction categories in your Nordea DB with counts.', parameters: { type: 'object', properties: {} } },
      { name: 'sampleMyDescriptionWords', description: 'List frequent description words in your transactions (no amounts, no counterparties).', parameters: { type: 'object', properties: {} } },
      { name: 'finishProposalRisk', description: 'Finish with one risk level per proposal.', parameters: { type: 'object', properties: { risks: { type: 'array', items: { type: 'object', properties: { messageId: { type: 'string' }, risk: { type: 'string' }, reason: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } } }, required: ['messageId', 'risk', 'reason', 'evidence'] } } }, required: ['risks'] } },
    ],
    runTool: (call) => {
      const db = loadNordeaDb(uid);
      if (!db) return { error: 'no data' };
      if (call.name === 'listMyCategories') {
        const counts = new Map<string, number>();
        for (const t of db.transactions) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
        return [...counts.entries()].map(([category, n]) => ({ category, transactions: n }));
      }
      if (call.name === 'sampleMyDescriptionWords') {
        const freq = new Map<string, number>();
        for (const t of db.transactions) for (const w of words(t.description ?? '')) freq.set(w, (freq.get(w) ?? 0) + 1);
        return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([word, n]) => ({ word, n }));
      }
      return { error: 'unknown tool' };
    },
    finishTool: 'finishProposalRisk',
  });
  if (error) return { claims: null, status: 'error', error };
  const rows = Array.isArray(out?.risks) ? (out!.risks as unknown[]) : [];
  const claims: Record<string, unknown> = {};
  for (const r of rows) {
    const id = (r as { messageId?: unknown })?.messageId;
    if (typeof id === 'string' && items.some((i) => i.messageId === id)) claims[id] = r;
  }
  return Object.keys(claims).length
    ? { claims, status: 'model', ...(answeredBy ? { answeredBy } : {}) }
    : { claims: null, status: 'error', error: 'finishProposalRisk gave no usable risk level for any proposal' };
}
