/** Refund Tracker, phase 1: the case record, its states, consent, evidence fingerprints and the
    append-only audit log. Everything outward is mock; nothing here can reach a real bank or shop.

    Rules this module enforces (from the plan and the instinct review of 22 Nov 2026):
    - A case reads only the records the customer consented to, and nothing after consent is withdrawn.
    - State changes only through a validated event or a recorded approval, never because of text in a
      record (receipts and shop emails are untrusted data) and never on the model's say-so.
    - Evidence is fingerprinted (SHA-256) when stored; a later change is detected and flagged.
    - Withdrawing consent deletes the stored copies, keeps their fingerprints and keeps the log
      (owner's decision, 22 Nov 2026). Reset wipes everything and re-seeds the demo story.
    - The model may only write draft fields (DRAFT_KEYS). */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { addWorkingDays, daysBetween, workingDaysAfter, type WorkCalendar } from './calendar.js';
import { evaluate, type Evaluation, type PolicyRow } from './policy.js';

export const STATES = ['opened', 'watching', 'seller_contacted', 'dispute_prepared', 'partially_refunded', 'closed', 'handed_off'] as const;
export type CaseState = (typeof STATES)[number];

/** Allowed moves. Anything else throws. */
const MOVES: Record<CaseState, CaseState[]> = {
  opened: ['watching', 'handed_off'],
  watching: ['seller_contacted', 'partially_refunded', 'closed', 'handed_off'],
  seller_contacted: ['dispute_prepared', 'partially_refunded', 'closed', 'handed_off'],
  dispute_prepared: ['partially_refunded', 'closed', 'handed_off'],
  partially_refunded: ['seller_contacted', 'dispute_prepared', 'closed', 'handed_off'],
  closed: ['watching', 'partially_refunded'], // a reversed refund reopens
  handed_off: ['watching'], // a person adds the missing facts
};
/** Which moves need a recorded approval (an outward action) rather than a feed or system event. */
const NEEDS_APPROVAL: Partial<Record<CaseState, true>> = { seller_contacted: true, dispute_prepared: true };

export type Cause =
  | { kind: 'event'; type: 'consent_given' | 'policy_no_match' | 'refund_matched' | 'refund_partial' | 'refund_reversed' | 'facts_added'; ref: string }
  | { kind: 'approval'; approvalId: string };

export interface SourceRecord { id: string; kind: string; label: string; fields: Record<string, unknown>; text: string }
export interface EvidenceItem {
  recordId: string;
  kind: string;
  label: string;
  /** SHA-256 of the stored copy (fields + text), taken when it was stored. Kept after the copy is deleted. */
  hash: string;
  storedAt: string;
  /** The stored copy; null once consent is withdrawn. */
  copy: { fields: Record<string, unknown>; text: string } | null;
}
export interface RefundCase {
  id: string;
  userId: string;
  state: CaseState;
  createdAt: string;
  country: string;
  reasons: string[];
  consent: { items: string[]; grantedAt: string; withdrawnAt?: string };
  evidence: EvidenceItem[];
  /** Facts taken from consented records' structured fields, or given by the customer. Never from free text. */
  facts: Record<string, unknown>;
  /** Where each fact came from (record id or 'customer'), for "Based on" lines. */
  factSources: Record<string, string>;
  /** Text the model may write (uncommitted). Never changes state, amounts or approvals. */
  drafts: Record<string, string>;
}
export type AuditKind = 'consent' | 'read' | 'evidence' | 'fact' | 'draft' | 'state' | 'flag' | 'approval' | 'adapter' | 'reset';
export interface AuditEntry { seq: number; caseId: string; at: string; kind: AuditKind; by: 'customer' | 'abel' | 'system' | 'presenter'; detail: string }

export interface RefundStoreData { cases: RefundCase[]; audit: AuditEntry[]; sources: Record<string, SourceRecord[]>; seq: number }

/** Fields a record may contribute, by fact name. Free text is never parsed for facts or commands. */
const FACT_FIELDS: Record<string, string> = {
  merchantId: 'merchantId', merchant: 'merchant', amount: 'amount', currency: 'currency', chargeDate: 'chargeDate',
  cardType: 'cardType', posted: 'posted', paymentRef: 'paymentRef', txId: 'txId', orderRef: 'orderRef', item: 'item',
  deliveryDate: 'deliveryDate', trackingRef: 'trackingRef', returnSentDate: 'returnSentDate',
  sellerReceivedDate: 'sellerReceivedDate', promiseWorkingDays: 'promiseWorkingDays', promiseFrom: 'promiseFrom',
};
/** Facts the customer may state (e.g. "I emailed them on 1 Oct to cancel"). */
export const CUSTOMER_FACTS = ['withdrawalNoticeDate', 'withdrawalNoticeMethod', 'exclusionCheck', 'goodsReceivedOrProofDate', 'deliveryDate'] as const;
/** The only fields the model may write. */
export const DRAFT_KEYS = ['sellerMessage', 'disputeNote', 'summary', 'nextStepSuggestion'] as const;

export const hashCopy = (fields: Record<string, unknown>, text: string) =>
  crypto.createHash('sha256').update(JSON.stringify({ fields, text })).digest('hex');

export class RefundError extends Error {}

export class RefundStore {
  data: RefundStoreData = { cases: [], audit: [], sources: {}, seq: 0 };
  constructor(private file: string | null, private seedDir: string, private policy: () => PolicyRow[], private cal: () => WorkCalendar) {}

  // ---------- persistence ----------
  load() {
    if (this.file && fs.existsSync(this.file)) {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
      this.data.audit.forEach((a) => Object.freeze(a));
    } else this.resetAndSeed(true);
    return this;
  }
  private save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
  /** Reset: wipes all cases, copies and logs, then re-seeds the demo story (seed=false wipes only). */
  resetAndSeed(seed = true) {
    this.data = { cases: [], audit: [], sources: {}, seq: 0 };
    if (seed && fs.existsSync(this.seedDir)) {
      for (const f of fs.readdirSync(this.seedDir).filter((x) => x.endsWith('.json')).sort()) {
        const s = JSON.parse(fs.readFileSync(path.join(this.seedDir, f), 'utf-8'));
        this.data.sources[s.userId] = s.records;
      }
    }
    this.save();
  }

  // ---------- audit (append-only) ----------
  private log(caseId: string, kind: AuditKind, by: AuditEntry['by'], detail: string, at = new Date().toISOString()) {
    const e: AuditEntry = Object.freeze({ seq: ++this.data.seq, caseId, at, kind, by, detail });
    this.data.audit.push(e);
    return e;
  }
  auditFor(caseId: string): readonly AuditEntry[] { return Object.freeze(this.data.audit.filter((a) => a.caseId === caseId)); }

  // ---------- reading ----------
  sourcesFor(userId: string): SourceRecord[] { return this.data.sources[userId] ?? []; }
  get(caseId: string): RefundCase {
    const c = this.data.cases.find((x) => x.id === caseId);
    if (!c) throw new RefundError(`no case ${caseId}`);
    return c;
  }
  casesFor(userId: string) { return this.data.cases.filter((c) => c.userId === userId); }

  /** Reads one source record for a case. Only consented, not-withdrawn records. Logged. */
  private readRecord(c: RefundCase, recordId: string): SourceRecord {
    if (c.consent.withdrawnAt) throw new RefundError('consent was withdrawn: nothing more is read');
    if (!c.consent.items.includes(recordId)) throw new RefundError(`record ${recordId} is not in the customer's consent`);
    const r = this.sourcesFor(c.userId).find((x) => x.id === recordId);
    if (!r) throw new RefundError(`record ${recordId} not found`);
    this.log(c.id, 'read', 'system', `Read ${r.label} (consented)`);
    return r;
  }

  // ---------- opening ----------
  /** Opens a case after the customer's explicit consent to exactly `consentItems`. */
  openCase(input: { userId: string; consentItems: string[]; reasons: string[]; country: string; now?: string }): RefundCase {
    if (!input.consentItems.length) throw new RefundError('a case needs consent to at least one record');
    const known = new Set(this.sourcesFor(input.userId).map((r) => r.id));
    const unknownItems = input.consentItems.filter((i) => !known.has(i));
    if (unknownItems.length) throw new RefundError(`unknown records: ${unknownItems.join(', ')}`);
    const at = input.now ?? new Date().toISOString();
    const c: RefundCase = {
      id: `rc-${crypto.randomUUID().slice(0, 8)}`, userId: input.userId, state: 'opened', createdAt: at, country: input.country,
      reasons: [...input.reasons], consent: { items: [...input.consentItems], grantedAt: at }, evidence: [], facts: {}, factSources: {}, drafts: {},
    };
    this.data.cases.push(c);
    this.log(c.id, 'consent', 'customer', `Consent given to read: ${input.consentItems.join(', ')}`, at);
    for (const id of input.consentItems) {
      const r = this.readRecord(c, id);
      const fields = structuredClone(r.fields);
      c.evidence.push({ recordId: r.id, kind: r.kind, label: r.label, hash: hashCopy(fields, r.text), storedAt: at, copy: { fields, text: r.text } });
      this.log(c.id, 'evidence', 'system', `Stored ${r.label} with fingerprint ${hashCopy(fields, r.text).slice(0, 12)}…`, at);
      for (const [fact, field] of Object.entries(FACT_FIELDS)) {
        if (fields[field] !== undefined && c.facts[fact] === undefined) { c.facts[fact] = fields[field]; c.factSources[fact] = r.id; }
      }
    }
    const ev = this.evaluation(c.id);
    if (ev.outcome === 'unknown') this.transition(c.id, 'handed_off', { kind: 'event', type: 'policy_no_match', ref: ev.reason ?? '' }, 'system');
    else this.transition(c.id, 'watching', { kind: 'event', type: 'consent_given', ref: c.consent.grantedAt }, 'system');
    this.save();
    return c;
  }

  // ---------- state ----------
  transition(caseId: string, to: CaseState, cause: Cause, by: AuditEntry['by'] = 'system') {
    const c = this.get(caseId);
    if (!STATES.includes(to)) throw new RefundError(`unknown state ${to}`);
    if (!MOVES[c.state].includes(to)) throw new RefundError(`not allowed: ${c.state} → ${to}`);
    if (!cause || (cause.kind !== 'event' && cause.kind !== 'approval')) throw new RefundError('a state change needs a validated event or a recorded approval');
    if (NEEDS_APPROVAL[to] && cause.kind !== 'approval') throw new RefundError(`${to} needs a recorded approval`);
    const from = c.state;
    c.state = to;
    this.log(caseId, 'state', by, `${from} → ${to} (${cause.kind === 'approval' ? `approval ${cause.approvalId}` : `${cause.type}: ${cause.ref}`})`);
    this.save();
  }

  // ---------- facts and drafts ----------
  /** Facts the customer states. Only CUSTOMER_FACTS; each logged. */
  addCustomerFacts(caseId: string, facts: Partial<Record<(typeof CUSTOMER_FACTS)[number], unknown>>) {
    const c = this.get(caseId);
    for (const [k, v] of Object.entries(facts)) {
      if (!(CUSTOMER_FACTS as readonly string[]).includes(k)) throw new RefundError(`the customer can't set ${k}`);
      c.facts[k] = v; c.factSources[k] = 'customer';
      this.log(caseId, 'fact', 'customer', `Customer stated ${k} = ${JSON.stringify(v)}`);
    }
    // A handed-off case can come back once a person/customer supplies the missing facts.
    if (c.state === 'handed_off' && this.evaluation(caseId).outcome === 'rows') this.transition(caseId, 'watching', { kind: 'event', type: 'facts_added', ref: Object.keys(facts).join(',') });
    this.save();
  }
  /** The model's only write path: draft text. */
  setDraft(caseId: string, key: string, text: string) {
    if (!(DRAFT_KEYS as readonly string[]).includes(key)) throw new RefundError(`the model may not write ${key}`);
    const c = this.get(caseId);
    c.drafts[key] = String(text);
    this.log(caseId, 'draft', 'abel', `Draft ${key} updated (${String(text).length} characters)`);
    this.save();
  }

  // ---------- consent and evidence ----------
  /** Withdrawing consent: stop reading, delete stored copies, keep fingerprints and the log. */
  withdrawConsent(caseId: string) {
    const c = this.get(caseId);
    if (c.consent.withdrawnAt) return;
    c.consent.withdrawnAt = new Date().toISOString();
    for (const e of c.evidence) e.copy = null;
    this.log(caseId, 'consent', 'customer', `Consent withdrawn: ${c.evidence.length} stored copies deleted; fingerprints and this log kept`);
    this.save();
  }
  /** Re-hashes each stored copy. A mismatch is flagged in the log and returned. */
  verifyEvidence(caseId: string): { recordId: string; ok: boolean }[] {
    const c = this.get(caseId);
    const out = c.evidence.filter((e) => e.copy).map((e) => ({ recordId: e.recordId, ok: hashCopy(e.copy!.fields, e.copy!.text) === e.hash }));
    for (const r of out.filter((x) => !x.ok)) this.log(caseId, 'flag', 'system', `Evidence ${r.recordId} changed after it was stored (fingerprint mismatch); not used`);
    return out;
  }
  /** Evidence that is still present and unchanged. */
  usableEvidence(caseId: string) {
    const bad = new Set(this.verifyEvidence(caseId).filter((x) => !x.ok).map((x) => x.recordId));
    return this.get(caseId).evidence.filter((e) => e.copy && !bad.has(e.recordId));
  }

  // ---------- derived status ----------
  /** Shop promise (from the working-day calendar), lateness, and the policy evaluation. Computed, never stored as text. */
  status(caseId: string, today: string) {
    const c = this.get(caseId);
    const cal = this.cal();
    const f = c.facts;
    const promise = typeof f.promiseFrom === 'string' && typeof f.promiseWorkingDays === 'number'
      ? addWorkingDays(f.promiseFrom, f.promiseWorkingDays, cal) : undefined;
    const late = promise && today > promise ? { calendarDays: daysBetween(promise, today), workingDays: workingDaysAfter(promise, today, cal) } : undefined;
    return { state: c.state, promiseDate: promise, late, evaluation: this.evaluation(caseId, today) };
  }
  /** The policy evaluation. `breachEvidence` is derived in code: the shop's own written promise (a consented
      shop email) has passed with the case not closed. Flagged for instinct's review in the phase 1 PR. */
  evaluation(caseId: string, today?: string): Evaluation {
    const c = this.get(caseId);
    const facts = { ...c.facts };
    if (today && c.state !== 'closed') {
      const cal = this.cal();
      const hasEmail = c.evidence.some((e) => e.kind === 'seller_email');
      if (hasEmail && typeof facts.promiseFrom === 'string' && typeof facts.promiseWorkingDays === 'number' && today > addWorkingDays(facts.promiseFrom, facts.promiseWorkingDays, cal)) facts.breachEvidence = 'seller_refund_promise_overdue';
    }
    return evaluate(this.policy(), { country: c.country, cardType: typeof facts.cardType === 'string' ? facts.cardType : undefined, reasons: c.reasons }, facts, this.cal());
  }
}
