/**
 * AC7: risk levels are decided by CODE RULES, never by an agent's judgement.
 * High risk waits for the customer; everything else can be stored automatically once the
 * customer has set standing permissions (first start). Deletions stay customer-driven.
 *
 * F20: "observed" is DERIVED from the evidence (transaction ids + a total, or the customer's
 * own direct input), never trusted from the proposing agent's own payload flag.
 */
import { createHash } from 'node:crypto';
import type { AgentMessage } from './types.js';
import { isSensitiveTopic } from '../sensitive.js';

export type Risk = 'low' | 'medium' | 'high';

/** Direct input = the personal agent proposing the customer's own goals (goal ids attached). */
export function deriveObserved(proposal: AgentMessage): 'observed' | 'inferred' {
  const p = (proposal.payload ?? {}) as { transactionIds?: string[]; total?: number; goalIds?: string[] };
  if (Array.isArray(p.transactionIds) && p.transactionIds.length > 0 && p.total != null) return 'observed'; // bank-side evidence
  if (proposal.from === 'personal' && Array.isArray(p.goalIds) && p.goalIds.length > 0) return 'observed'; // the customer's own words
  return 'inferred';
}

export function assessProposalRisk(proposal: AgentMessage): Risk {
  const p = (proposal.payload ?? {}) as { detail?: string; forOffers?: boolean; shareBeyond?: boolean; appWrite?: boolean; entry?: { title?: string; detail?: string; doc?: { source?: string }; evidence?: { transactionIds?: string[] } | null } };
  // G10: a queued app write is re-derived by the same code rules as at write time -
  // the CM agent is only the messenger, the entry's own content decides.
  if (p.appWrite && p.entry) return assessEntryRisk({ title: p.entry.title ?? proposal.summary, detail: p.entry.detail ?? p.detail ?? '', source: p.entry.doc?.source, evidence: p.entry.evidence }).risk;
  if (p.forOffers === true || p.shareBeyond === true) return 'high'; // offers, or shared beyond the three agents
  if (deriveObserved(proposal) === 'inferred') return 'high'; // an inference about the customer (F20: derived, not self-labelled)
  if (isSensitiveTopic(`${proposal.summary} ${p.detail ?? ''}`)) return 'high'; // a sensitive topic (F21: shared word-bounded list)
  if (proposal.from === 'personal') return 'low'; // the customer's own direct input
  return 'medium'; // observed aggregates from the bank side
}

/**
 * G2: the same code rules for writes that arrive from the APP (Abel's screens, imports),
 * applied by the owning agent at write time - never taken from the caller's own claim.
 * The customer's own direct input is observed+low; bank-evidenced aggregates observed+medium;
 * anything else is inferred+high; a sensitive topic is always high (F21).
 */
export function assessEntryRisk(e: { title: string; detail: string; source?: string; evidence?: { transactionIds?: string[] } | null }): { risk: Risk; observed: 'observed' | 'inferred' } {
  const observed = (e.evidence?.transactionIds?.length ? true : false) || e.source === 'customer' ? 'observed' as const : 'inferred' as const;
  if (isSensitiveTopic(`${e.title} ${e.detail}`)) return { risk: 'high', observed };
  if (observed === 'inferred') return { risk: 'high', observed };
  return { risk: e.source === 'customer' ? 'low' : 'medium', observed };
}

/* ---------- D9: the Nordea AI decides bank-side proposal risk (model + code floor) ---------- */

/** The model's risk claim for one proposal, as validated by code. The receipt binds it to content. */
export interface NordeaRiskClaim { risk: Risk; reason: string; evidence: string[]; by?: string; receipt?: string }

/** The normalized, storage-independent content a risk claim is over: no DB rows, no SQL shape -
 *  a future Nordea DB type keeps feeding this same contract through its own store adapter. */
export interface RiskContent { title: string; detail: string; observed: 'observed' | 'inferred'; transactionIdsHash?: string; total?: number }

/** Server-recomputed receipt binding the EXACT current content + the claimed risk. A receipt on
 *  its own proves only that the claim matches this content - it is not an AI certification. */
export function nordeaRiskReceipt(c: RiskContent & { risk: Risk }): string {
  const n = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('sha256').update([n(c.title), n(c.detail), c.observed, c.transactionIdsHash ?? '', c.total ?? '', c.risk].join('\u0001')).digest('hex').slice(0, 12);
}

/** Validate ONE model claim for ONE proposal. Null = no valid claim. Evidence must be provenance
 *  code can check: "goal:<id>" behind the proposal, "txh:<hash>" its own evidence hash, or a
 *  verbatim phrase (4+ chars) from its title/detail. Unverifiable items are dropped; none left = invalid. */
export function validateNordeaRiskClaim(raw: unknown, c: RiskContent & { goalIds: string[] }): NordeaRiskClaim | null {
  const r = raw as { risk?: unknown; reason?: unknown; evidence?: unknown } | null | undefined;
  if (!r || (r.risk !== 'low' && r.risk !== 'medium' && r.risk !== 'high')) return null;
  const reason = typeof r.reason === 'string' ? r.reason.trim() : '';
  if (reason.length < 8 || reason.length > 300) return null;
  const hay = `${c.title}\n${c.detail}`.toLowerCase();
  const evidence = (Array.isArray(r.evidence) ? r.evidence : [])
    .filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
    .filter((x) => {
      const g = /^goal:(.+)$/.exec(x); if (g) return c.goalIds.includes(g[1]);
      const h = /^txh:([0-9a-f]+)$/i.exec(x); if (h) return h[1].toLowerCase() === (c.transactionIdsHash ?? '').toLowerCase();
      return x.length >= 4 && x.length <= 200 && hay.includes(x.toLowerCase());
    })
    .slice(0, 5);
  if (!evidence.length) return null;
  return { risk: r.risk, reason, evidence };
}

/** D9: the raising-only CODE FLOOR for a bank-side proposal: offers, sharing beyond the three
 *  agents, a code-derived inference (F20), or a sensitive topic (F21) is HIGH whatever the model says. */
export function proposalRiskFloor(proposal: AgentMessage): { reason: string } | null {
  const p = (proposal.payload ?? {}) as { detail?: string; forOffers?: boolean; shareBeyond?: boolean };
  if (p.forOffers === true || p.shareBeyond === true) return { reason: 'code floor: offers or sharing beyond the three agents' };
  if (deriveObserved(proposal) === 'inferred') return { reason: 'code floor: an inference about the customer (F20)' };
  if (isSensitiveTopic(`${proposal.summary} ${p.detail ?? ''}`)) return { reason: 'code floor: a sensitive topic (F21)' };
  return null;
}

export interface NordeaRiskOutcome { risk: Risk; uncertified: boolean; reason: string }

/**
 * D9: the effective risk of a NORDEA (bank-side) proposal at gate time.
 * - NO_MODEL (no provider, or the mock stand-in) and pre-D9 proposals: the existing deterministic
 *   code rules - an explicit scripted path, NOT a model failure.
 * - A proposal the model was asked about (payload.riskModel 'model'/'error'): the claim must be
 *   valid AND its receipt must match the current content + claimed risk. Missing, invalid or stale
 *   (edited) = UNCERTIFIED HIGH with the reason - never a silent low, never auto-stored.
 * - modelExpected but not yet leveled (unmarked): UNCERTIFIED HIGH - it waits for the model.
 * The code floor only RAISES; the model may distinguish evidenced low/medium or raise (highest wins).
 * observed/inferred is ALWAYS code-derived (F20), never the model's own label.
 */
export function effectiveProposalRisk(proposal: AgentMessage, opts: { modelExpected: boolean }): NordeaRiskOutcome {
  const p = (proposal.payload ?? {}) as { detail?: string; goalIds?: string[]; transactionIdsHash?: string; total?: number; riskModel?: string; riskClaim?: unknown; riskError?: string };
  const content: RiskContent & { goalIds: string[] } = {
    title: proposal.summary, detail: p.detail ?? '', observed: deriveObserved(proposal),
    transactionIdsHash: p.transactionIdsHash, total: p.total, goalIds: p.goalIds ?? [],
  };
  const floor = proposalRiskFloor(proposal);
  const withFloor = (risk: Risk, reason: string, uncertified: boolean): NordeaRiskOutcome =>
    floor ? { risk: 'high', uncertified, reason: [reason, floor.reason].filter(Boolean).join('; ') } : { risk, uncertified, reason };
  const marker = p.riskModel;
  if (marker === undefined || marker === 'scripted') {
    if (marker === undefined && opts.modelExpected) {
      return { risk: 'high', uncertified: true, reason: 'the Nordea AI has not assessed this proposal yet' };
    }
    return withFloor(assessProposalRisk(proposal), '', false); // NO_MODEL: the deterministic path
  }
  if (marker === 'error') {
    return { risk: 'high', uncertified: true, reason: `the Nordea AI could not assess this proposal${p.riskError ? `: ${p.riskError}` : ''}` };
  }
  const claim = validateNordeaRiskClaim(p.riskClaim, content);
  if (!claim) return { risk: 'high', uncertified: true, reason: 'the Nordea AI gave no valid risk assessment' };
  if ((p.riskClaim as { receipt?: string }).receipt !== nordeaRiskReceipt({ ...content, risk: claim.risk })) {
    return { risk: 'high', uncertified: true, reason: 'the risk assessment no longer matches the proposal content' };
  }
  return withFloor(claim.risk, claim.reason, false);
}

/* ---------- D9 test seam: drive the model/error paths without a real provider ---------- */

/** One proposal as the risk runner sees it (normalized, storage-independent). */
export interface NordeaRiskItem { messageId: string; title: string; detail: string; observed: 'observed' | 'inferred'; goalIds: string[]; transactionIdsHash?: string; total?: number }
export interface NordeaRiskRun { claims: Record<string, unknown> | null; status: 'model' | 'error'; error?: string; answeredBy?: string }
let runnerForTests: ((uid: string, items: NordeaRiskItem[]) => Promise<NordeaRiskRun>) | null = null;
/** Tests only: replace the model risk attempt (the production runner is the Nordea agent's own LLM call). */
export function setNordeaRiskRunnerForTests(fn: ((uid: string, items: NordeaRiskItem[]) => Promise<NordeaRiskRun>) | null) { runnerForTests = fn; }
export const nordeaRiskRunner = () => runnerForTests;
