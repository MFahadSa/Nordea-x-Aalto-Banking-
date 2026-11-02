/**
 * AC7: risk levels are decided by CODE RULES, never by an agent's judgement.
 * High risk waits for the customer; everything else can be stored automatically once the
 * customer has set standing permissions (first start). Deletions stay customer-driven.
 *
 * F20: "observed" is DERIVED from the evidence (transaction ids + a total, or the customer's
 * own direct input), never trusted from the proposing agent's own payload flag.
 */
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
  const p = (proposal.payload ?? {}) as { detail?: string; forOffers?: boolean; shareBeyond?: boolean };
  if (p.forOffers === true || p.shareBeyond === true) return 'high'; // offers, or shared beyond the three agents
  if (deriveObserved(proposal) === 'inferred') return 'high'; // an inference about the customer (F20: derived, not self-labelled)
  if (isSensitiveTopic(`${proposal.summary} ${p.detail ?? ''}`)) return 'high'; // a sensitive topic (F21: shared word-bounded list)
  if (proposal.from === 'personal') return 'low'; // the customer's own direct input
  return 'medium'; // observed aggregates from the bank side
}
