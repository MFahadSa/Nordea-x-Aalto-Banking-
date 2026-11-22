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
  partially_refunded: ['watching', 'seller_contacted', 'dispute_prepared', 'closed', 'handed_off'], // watching: the only partial was reversed
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
  /** Set when the shop said no (demo). Only records the fact: no money, no state change, nothing sent. */
  shopDeclinedAt?: string;
  /** Demo credits the Presenter sent for this case (control keys). Cleared on withdraw. */
  demoSent?: string[];
  evidence: EvidenceItem[];
  /** Facts taken from consented records' structured fields, or given by the customer. Never from free text. */
  facts: Record<string, unknown>;
  /** Where each fact came from (record id or 'customer'), for "Based on" lines. */
  factSources: Record<string, string>;
  /** Text the model may write (uncommitted). Never changes state, amounts or approvals. */
  drafts: Record<string, string>;
  /** Phase 2: money expected back and the credits matched to this case (cents, so no rounding drift). */
  ledger?: Ledger;
}
export interface Ledger {
  expectedCents: number;
  receivedCents: number;
  credits: { eventId: string; cents: number; date: string }[];
  /** Credits seen but not counted, with why (provisional, possible duplicate, other currency, ambiguous…). */
  flags: { eventId: string; reason: CreditFlag; date: string }[];
}
export type CreditFlagEntry = Ledger['flags'][number];
export type CreditFlag = 'provisional' | 'possible_duplicate' | 'other_currency' | 'ambiguous_ask_customer' | 'case_with_a_person' | 'reversal_unknown';

/** A credit (or reversal) from the account feed. Its text is never read; only these structured fields. */
export interface CreditEvent {
  eventId: string;
  userId: string;
  date: string;
  kind: 'refund' | 'reversal';
  /** Positive amount of money coming in (refund) or taken back (reversal). */
  amount: number;
  currency: string;
  merchantId: string;
  orderRef?: string;
  paymentRef?: string;
  /** The purchase this credit says it refunds (link to the original transaction). */
  originalTxId?: string;
  status: 'posted' | 'pending';
  /** For a reversal: the refund event it takes back. */
  reversesEventId?: string;
}
export interface HandledEvent { caseId: string | null; outcome: 'counted' | 'flagged' | 'no_match' | 'ambiguous' | 'reversed'; reason?: CreditFlag; event: CreditEvent }
export type ApprovalAction = 'seller_inquiry' | 'dispute_pack';
export interface Approval {
  id: string; caseId: string; action: ApprovalAction;
  recipient: string; text: string; evidenceIds: string[];
  /** SHA-256 of recipient + text + the evidence fingerprints at the moment of approval. */
  fingerprint: string;
  status: 'approved' | 'revoked' | 'used';
  at: string;
}
/** The approval each outward state needs. */
const APPROVAL_FOR: Partial<Record<CaseState, ApprovalAction>> = { seller_contacted: 'seller_inquiry', dispute_prepared: 'dispute_pack' };
export type CreditResult =
  | { result: 'replay_ignored'; caseId: string | null }
  | { result: 'no_match' }
  | { result: 'flagged'; caseId: string; reason: CreditFlag }
  | { result: 'ambiguous'; caseIds: string[] }
  | { result: 'counted'; caseId: string; remainingCents: number; state: CaseState }
  | { result: 'reversed'; caseId: string; remainingCents: number; state: CaseState };
export type AuditKind = 'consent' | 'read' | 'evidence' | 'fact' | 'draft' | 'state' | 'flag' | 'approval' | 'adapter' | 'reset';
export interface AuditEntry { seq: number; caseId: string; at: string; kind: AuditKind; by: 'customer' | 'abel' | 'system' | 'presenter'; detail: string }

export interface RefundStoreData {
  cases: RefundCase[]; audit: AuditEntry[]; sources: Record<string, SourceRecord[]>; seq: number;
  /** Every credit event ever handled, by event id: where it went and why. One event, one case at most. */
  events?: Record<string, HandledEvent>;
  /** Recorded customer approvals for outward actions (phase 4/5 use them; the state gate checks them now). */
  approvals?: Approval[];
  /** Phase 2: demo feed events the Presenter can send, by user (from the seed). */
  presets?: Record<string, CreditEvent[]>;
}

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

/** A short opaque id for something that must be kept as a marker but must not say what it was. */
export const opaqueId = (prefix: string, id: string) => `${prefix}-${crypto.createHash('sha256').update(id).digest('hex').slice(0, 10)}`;
export class RefundStore {
  data: RefundStoreData = { cases: [], audit: [], sources: {}, seq: 0 };
  /** `clock` gives the demo's "now" (ISO date-time) so case dates and the log use the same calendar as the status. */
  constructor(private file: string | null, private seedDir: string, private policy: () => PolicyRow[], private cal: () => WorkCalendar, private clock: () => string = () => new Date().toISOString()) {}

  // ---------- persistence ----------
  load() {
    if (this.file && fs.existsSync(this.file)) {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
      this.data.audit.forEach((a) => Object.freeze(a));
      // Phase 2 stored only the case id per event; those carry no payload to look at again.
      for (const [k, v] of Object.entries(this.data.events ?? {})) if (typeof v !== 'object' || v === null) delete this.data.events![k];
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
    this.data = { cases: [], audit: [], sources: {}, seq: 0, events: {}, presets: {} };
    if (seed && fs.existsSync(this.seedDir)) {
      for (const f of fs.readdirSync(this.seedDir).filter((x) => x.endsWith('.json')).sort()) {
        const s = JSON.parse(fs.readFileSync(path.join(this.seedDir, f), 'utf-8'));
        this.data.sources[s.userId] = s.records;
        if (Array.isArray(s.feedEvents)) (this.data.presets ??= {})[s.userId] = s.feedEvents;
      }
    }
    this.save();
  }

  // ---------- audit (append-only) ----------
  private log(caseId: string, kind: AuditKind, by: AuditEntry['by'], detail: string, at = this.clock()) {
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
    this.log(c.id, 'read', 'system', `Read ${r.kind.replace(/_/g, ' ')} ${r.id} (consented)`);
    return r;
  }

  // ---------- opening ----------
  /** Opens a case after the customer's explicit consent to exactly `consentItems`. */
  /** The one way a customer's own action opens a case (chat card and API): at most one open case per customer. */
  openCustomerCase(input: { userId: string; consentItems: string[]; reasons: string[]; country: string }): RefundCase {
    if (this.data.cases.some((x) => x.userId === input.userId && !x.consent.withdrawnAt)) throw new RefundError('there is already a refund case for this customer: open it, or withdraw it first');
    return this.openCase(input);
  }
  openCase(input: { userId: string; consentItems: string[]; reasons: string[]; country: string; now?: string }): RefundCase {
    if (!input.consentItems.length) throw new RefundError('a case needs consent to at least one record');
    const known = new Set(this.sourcesFor(input.userId).map((r) => r.id));
    const unknownItems = input.consentItems.filter((i) => !known.has(i));
    if (unknownItems.length) throw new RefundError(`unknown records: ${unknownItems.join(', ')}`);
    const at = input.now ?? this.clock();
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
      this.log(c.id, 'evidence', 'system', `Stored ${r.kind.replace(/_/g, ' ')} ${r.id} with fingerprint ${hashCopy(fields, r.text).slice(0, 12)}…`, at);
      for (const [fact, field] of Object.entries(FACT_FIELDS)) {
        if (fields[field] !== undefined && c.facts[fact] === undefined) { c.facts[fact] = fields[field]; c.factSources[fact] = r.id; }
      }
    }
    if (typeof c.facts.amount === 'number') c.ledger = { expectedCents: Math.round(Math.abs(c.facts.amount) * 100), receivedCents: 0, credits: [], flags: [] };
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
    // An approval moves the case only through executeApproved: checks, then the (mock) action, then the move.
    if (cause.kind === 'approval') throw new RefundError('an approved action moves the case only through executeApproved');
    const from = c.state;
    c.state = to;
    this.log(caseId, 'state', by, `${from} → ${to} (${cause.type}: ${cause.ref})`);
    this.save();
  }

  /** Test hook: stands in for the mock adapter failing. Never set by the app. */
  adapterFailure: ((a: Approval) => string | null) | null = null;

  /** Runs one approved outward action. Everything is checked first: the approval (exists, this case, right
      action, still approved), consent (not withdrawn), evidence (present and unchanged), the fingerprint
      (recipient, text and evidence as approved) and, when given, the current draft (an edit after approval
      makes it stale). Then the mock adapter runs: it only writes to the log, nothing is sent. Only when it
      succeeds is the approval marked used and the case moved. Any refusal or failure changes neither. */
  executeApproved(approvalId: string, current?: { recipient: string; text: string; evidenceIds: string[] }, by: AuditEntry['by'] = 'customer') {
    const a = (this.data.approvals ?? []).find((x) => x.id === approvalId);
    if (!a) throw new RefundError(`no recorded approval ${approvalId}`);
    const c = this.get(a.caseId);
    const to: CaseState = a.action === 'seller_inquiry' ? 'seller_contacted' : 'dispute_prepared';
    if (APPROVAL_FOR[to] !== a.action) throw new RefundError(`approval ${a.id} is for ${a.action}, not ${to}`);
    if (a.status !== 'approved') throw new RefundError(`approval ${a.id} is ${a.status}`);
    if (c.consent.withdrawnAt) throw new RefundError('consent was withdrawn: nothing can be sent for this case');
    if (!MOVES[c.state].includes(to)) throw new RefundError(`not allowed: ${c.state} → ${to}`);
    const ev = a.evidenceIds.map((id) => c.evidence.find((e) => e.recordId === id));
    if (ev.some((e) => !e || !e.copy)) throw new RefundError('evidence in the approval is no longer stored');
    if (this.verifyEvidence(c.id).some((x) => !x.ok && a.evidenceIds.includes(x.recordId))) throw new RefundError('evidence changed after it was approved: approve again');
    if (this.approvalFingerprint(c.id, a) !== a.fingerprint) throw new RefundError('the approved message or evidence changed: approve again');
    if (current && this.approvalFingerprint(c.id, current) !== a.fingerprint) throw new RefundError('the message was edited after approval: approve again');
    const failure = this.adapterFailure?.(a) ?? null;
    if (failure) { this.log(c.id, 'flag', 'system', `Mock ${a.action} did not run (${failure}); nothing sent, nothing changed`); this.save(); throw new RefundError(`mock adapter failed: ${failure}`); }
    this.log(c.id, 'adapter', 'system', `MOCK ${a.action} to ${a.recipient}: ${a.text.length} characters, evidence ${a.evidenceIds.join(', ')}. Demo only: nothing was sent.`);
    a.status = 'used';
    const from = c.state;
    c.state = to;
    this.log(c.id, 'state', by, `${from} → ${to} (approval ${a.id}, mock action done)`);
    this.save();
    return { approvalId: a.id, state: c.state };
  }

  // ---------- facts and drafts ----------
  /** Facts the customer states. Only CUSTOMER_FACTS; each logged. */
  addCustomerFacts(caseId: string, facts: Partial<Record<(typeof CUSTOMER_FACTS)[number], unknown>>) {
    const c = this.get(caseId);
    if (c.consent.withdrawnAt) throw new RefundError('consent was withdrawn: start a new case to continue');
    for (const [k, v] of Object.entries(facts)) {
      if (!(CUSTOMER_FACTS as readonly string[]).includes(k)) throw new RefundError(`the customer can't set ${k}`);
      c.facts[k] = v; c.factSources[k] = 'customer';
      this.log(caseId, 'fact', 'customer', `Customer stated ${k} = ${JSON.stringify(v)}`);
    }
    // A handed-off case can come back once a person/customer supplies the missing facts.
    if (c.state === 'handed_off' && this.evaluation(caseId).outcome === 'rows') {
      this.transition(caseId, 'watching', { kind: 'event', type: 'facts_added', ref: Object.keys(facts).join(',') });
      this.recheckFlagged(caseId); // credits noted while it was with a person are looked at again
    }
    this.save();
  }
  /** The model's only write path: draft text. */
  setDraft(caseId: string, key: string, text: string) {
    if (!(DRAFT_KEYS as readonly string[]).includes(key)) throw new RefundError(`the model may not write ${key}`);
    const c = this.get(caseId);
    if (c.consent.withdrawnAt) throw new RefundError('consent was withdrawn: nothing more is drafted for this case');
    c.drafts[key] = String(text);
    this.log(caseId, 'draft', 'abel', `Draft ${key} updated (${String(text).length} characters)`);
    this.save();
  }

  // ---------- consent and evidence ----------
  /** Withdrawing consent (owner's decisions, 22 Nov 2026): Abel stops reading and stops watching for the
      refund; the stored copies AND the facts taken from them (amount, references, dates, money seen) are
      deleted; open approvals are revoked; fingerprints and the log are kept. The log names records by kind
      and id, not by their contents. */
  withdrawConsent(caseId: string) {
    const c = this.get(caseId);
    if (c.consent.withdrawnAt) return;
    c.consent.withdrawnAt = this.clock();
    for (const e of c.evidence) { e.copy = null; e.label = `${e.kind.replace(/_/g, ' ')} (deleted)`; }
    // Credit events tied to this case keep only what replay protection needs (the id and how it was handled).
    // The amount, order and payment references and the link to the purchase are removed.
    // The event is re-filed under an opaque key (a hash of its id), so a replay is still recognised but the id itself,
    // which can name an amount or a shop, is gone.
    const evs = (this.data.events ??= {});
    for (const [key, h] of Object.entries(evs)) {
      if (h.caseId !== caseId) continue;
      const tomb = opaqueId('h', key);
      delete evs[key];
      evs[tomb] = { caseId: h.caseId, outcome: h.outcome, reason: h.reason, event: { eventId: tomb, kind: h.event.kind, amount: 0, currency: '', merchantId: '', status: h.event.status } as CreditEvent };
    }
    c.demoSent = [];
    c.consent.items = c.consent.items.map((i) => opaqueId('r', i));
    for (const e of c.evidence) e.recordId = opaqueId('r', e.recordId);
    // The log is kept, but record and credit ids inside it become opaque.
    this.data.audit = this.data.audit.map((a) => a.caseId !== caseId ? a : Object.freeze({ ...a, detail: a.detail.replace(/\b(?:ev|rec)-[A-Za-z0-9-]+/g, (m) => opaqueId('x', m)) }));
    for (const a of this.data.approvals ?? []) if (a.caseId === caseId) a.evidenceIds = a.evidenceIds.map((i) => opaqueId('r', i));
    const nFacts = Object.keys(c.facts).length;
    c.facts = {}; c.factSources = {}; c.drafts = {}; c.ledger = undefined;
    for (const a of this.data.approvals ?? []) if (a.caseId === caseId) { if (a.status === 'approved') a.status = 'revoked'; a.recipient = ''; a.text = ''; }
    this.log(caseId, 'consent', 'customer', `Consent withdrawn: reading and refund watching stopped; ${c.evidence.length} stored copies and ${nFacts} facts deleted; open approvals revoked; fingerprints and this log kept`);
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

  // ---------- phase 2: matching credits to cases ----------
  presetsFor(userId: string): CreditEvent[] { return this.data.presets?.[userId] ?? []; }

  /** Handles one credit or reversal from the feed. A credit counts only when the shop, the order or payment
      reference, the link to the original purchase and the currency all match, and it is posted. The amount
      alone never matches. Each event goes to at most one case. The same event id arriving again is ignored,
      unless it was held back for a reason that has since changed (pending → posted, the case is back from a
      person); then it is looked at again. */
  applyCredit(ev: CreditEvent, by: AuditEntry['by'] = 'system'): CreditResult {
    const events = (this.data.events ??= {});
    // A credit that belongs to a withdrawn case is final: it is never read again, logged by its raw id or stored again.
    const gone = events[opaqueId('h', ev.eventId)];
    if (gone) return { result: 'replay_ignored', caseId: gone.caseId };
    const prev = events[ev.eventId];
    if (prev && prev.caseId && this.data.cases.find((x) => x.id === prev.caseId)?.consent.withdrawnAt) return { result: 'replay_ignored', caseId: prev.caseId };
    if (prev) {
      const c = prev.caseId ? this.data.cases.find((x) => x.id === prev.caseId) : undefined;
      const changed = prev.outcome === 'flagged' && c && (
        (prev.reason === 'provisional' && ev.status === 'posted') ||
        (prev.reason === 'case_with_a_person' && c.state !== 'handed_off'));
      if (!changed) {
        if (prev.caseId) this.log(prev.caseId, 'flag', by, `Credit ${events[ev.eventId] ? ev.eventId : opaqueId('x', ev.eventId)} arrived again (same event): ignored, not counted twice`);
        this.save();
        return { result: 'replay_ignored', caseId: prev.caseId };
      }
      this.clearFlag(c!, ev.eventId);
      delete events[ev.eventId];
      this.log(c!.id, 'flag', by, prev.reason === 'provisional' ? `Credit ${ev.eventId} is now posted: looked at again` : `Credit ${ev.eventId} looked at again now the case is back`);
    }
    if (ev.kind === 'reversal') return this.reverse(ev, by);

    // Which cases does this credit fully match? Partial signals only (same shop, no reference) = ask.
    const mine = this.casesFor(ev.userId).filter((c) => c.ledger && !c.consent.withdrawnAt); // withdrawn: not watched any more
    const sameShop = mine.filter((c) => c.facts.merchantId === ev.merchantId);
    const refOk = (c: RefundCase) => (!!ev.orderRef && ev.orderRef === c.facts.orderRef) || (!!ev.paymentRef && ev.paymentRef === c.facts.paymentRef);
    const linkOk = (c: RefundCase) => !!ev.originalTxId && ev.originalTxId === c.facts.txId;
    const full = sameShop.filter((c) => refOk(c) && linkOk(c));
    if (!full.length) {
      const near = sameShop.filter((c) => c.state !== 'closed');
      if (near.length === 1) return this.flag(near[0], ev, 'ambiguous_ask_customer', `Credit ${ev.eventId} from the same shop has no matching order reference or purchase link: not counted, ask the customer`, by);
      events[ev.eventId] = { caseId: null, outcome: 'no_match', event: ev }; this.save();
      return { result: 'no_match' };
    }
    if (full.length > 1) {
      events[ev.eventId] = { caseId: null, outcome: 'ambiguous', event: ev };
      for (const c of full) this.log(c.id, 'flag', by, `Credit ${ev.eventId} fits more than one case: not counted, ask the customer`);
      this.save();
      return { result: 'ambiguous', caseIds: full.map((c) => c.id) };
    }
    return this.count(full[0], ev, by);
  }

  /** The customer says which case a held-back credit belongs to (same shop, no reference; or it fit two cases).
      The usual checks still apply: currency, posted, not over the amount owed. */
  /** What a held-back credit says that does not fit the case (another order number, payment reference or purchase). */
  creditConflicts(eventId: string, caseId: string): string[] {
    const h = this.data.events?.[eventId];
    const c = this.get(caseId);
    if (!h) return [];
    const e = h.event, out: string[] = [];
    if (e.orderRef && c.facts.orderRef && e.orderRef !== c.facts.orderRef) out.push(`order ${e.orderRef}, not ${String(c.facts.orderRef)}`);
    if (e.paymentRef && c.facts.paymentRef && e.paymentRef !== c.facts.paymentRef) out.push(`payment reference ${e.paymentRef}, not ${String(c.facts.paymentRef)}`);
    if (e.originalTxId && c.facts.txId && e.originalTxId !== c.facts.txId) out.push('it refers to a different purchase');
    return out;
  }

  /** The customer says which case a held-back credit belongs to. If the credit names another order, payment or
      purchase, it is refused unless the customer has seen those conflicts and confirms (acceptConflicts). */
  assignCredit(eventId: string, caseId: string, opts: { acceptConflicts?: string[] } = {}): CreditResult {
    const h = this.data.events?.[eventId];
    if (!h) throw new RefundError(`no credit ${eventId}`);
    const ok = h.outcome === 'ambiguous' || (h.outcome === 'flagged' && h.reason === 'ambiguous_ask_customer');
    if (!ok) throw new RefundError(`credit ${eventId} is not waiting for the customer to pick a case`);
    const c = this.get(caseId);
    if (c.userId !== h.event.userId) throw new RefundError('that case belongs to another customer');
    if (c.consent.withdrawnAt) throw new RefundError('consent was withdrawn: this case is not watched any more');
    if (c.facts.merchantId !== h.event.merchantId) throw new RefundError('a credit from another shop cannot be assigned to this case');
    const conflicts = this.creditConflicts(eventId, caseId);
    const seen = new Set(opts.acceptConflicts ?? []);
    if (conflicts.some((x) => !seen.has(x))) throw new RefundError(`this credit does not fit the case: ${conflicts.join('; ')}. Show these to the customer and ask them to confirm`);
    if (h.caseId) { const old = this.data.cases.find((x) => x.id === h.caseId); if (old) this.clearFlag(old, eventId); }
    delete this.data.events![eventId];
    this.log(caseId, 'fact', 'customer', conflicts.length
      ? `Customer confirmed credit ${eventId} is the refund for this case although it says ${conflicts.join('; ')}`
      : `Customer said credit ${eventId} is the refund for this case`);
    return this.count(c, h.event, 'customer');
  }

  /** A person (or the customer) has checked a possible duplicate: it leaves "needs a check". Nothing is counted;
      the credit stays handled, so the same event can never be counted later. */
  reviewFlag(caseId: string, eventId: string, outcome: 'checked_fine' | 'reported', by: AuditEntry['by'] = 'customer') {
    const c = this.get(caseId);
    const f = c.ledger?.flags.find((x) => x.eventId === eventId);
    if (!f) throw new RefundError(`no open check for ${eventId} on this case`);
    if (f.reason !== 'possible_duplicate') throw new RefundError(`credit ${eventId} is waiting for ${f.reason}, not a check`);
    this.clearFlag(c, eventId);
    this.log(caseId, 'flag', by, outcome === 'checked_fine' ? `Possible duplicate ${eventId} checked: fine, not counted` : `Possible duplicate ${eventId} reported for a closer look; not counted`);
    this.save();
  }

  markDemoSent(caseId: string, key: string) { const c = this.get(caseId); (c.demoSent ??= []).includes(key) || c.demoSent.push(key); this.save(); }
  /** The shop said no. Recorded only: the case stays as it is, counted credits stay counted, and nothing is sent or started. */
  recordShopDeclined(caseId: string, by: AuditEntry['by'] = 'system') {
    const c = this.get(caseId);
    if (c.consent.withdrawnAt) throw new RefundError('consent was withdrawn');
    if (c.shopDeclinedAt) return;
    c.shopDeclinedAt = this.clock();
    this.log(caseId, 'flag', by, 'The shop declined the refund (demo). The case stays open. Nothing was sent and no dispute was started');
    this.save();
  }

  /** Credits held back only because the case was with a person: look at them again. */
  recheckFlagged(caseId: string) {
    const held = Object.values(this.data.events ?? {}).filter((h) => h.caseId === caseId && h.outcome === 'flagged' && h.reason === 'case_with_a_person');
    return held.map((h) => this.applyCredit(h.event));
  }

  // ---------- approvals (the gate for anything outward) ----------
  /** Records the customer's approval of one exact outward action. Phase 4/5 screens call this. */
  recordApproval(caseId: string, a: { action: ApprovalAction; recipient: string; text: string; evidenceIds: string[] }): Approval {
    const c = this.get(caseId);
    if (c.consent.withdrawnAt) throw new RefundError('consent was withdrawn: nothing can be approved for this case');
    if (a.action !== 'seller_inquiry' && a.action !== 'dispute_pack') throw new RefundError(`unknown action ${String(a.action)}`);
    if (!String(a.recipient ?? '').trim()) throw new RefundError('an approval needs the exact recipient');
    if (!String(a.text ?? '').trim()) throw new RefundError('an approval needs the full message text');
    if (!Array.isArray(a.evidenceIds) || !a.evidenceIds.length) throw new RefundError('an approval needs the exact evidence list (at least one item)');
    const ev = a.evidenceIds.map((id) => c.evidence.find((e) => e.recordId === id));
    if (ev.some((e) => !e || !e.copy)) throw new RefundError('every evidence item must be stored and not withdrawn');
    if (this.verifyEvidence(caseId).some((x) => !x.ok && a.evidenceIds.includes(x.recordId))) throw new RefundError('evidence changed after it was stored; it cannot be sent');
    const approval: Approval = {
      id: `ap-${crypto.randomUUID().slice(0, 8)}`, caseId, action: a.action, recipient: a.recipient, text: a.text, evidenceIds: [...a.evidenceIds],
      fingerprint: this.approvalFingerprint(caseId, a), status: 'approved', at: this.clock(),
    };
    (this.data.approvals ??= []).push(approval);
    this.log(caseId, 'approval', 'customer', `Approved ${a.action} to ${a.recipient} with ${a.evidenceIds.length} evidence items (${approval.fingerprint.slice(0, 12)}…)`);
    this.save();
    return approval;
  }
  approvalFingerprint(caseId: string, a: { recipient: string; text: string; evidenceIds: string[] }) {
    const c = this.get(caseId);
    const hashes = a.evidenceIds.map((id) => c.evidence.find((e) => e.recordId === id)?.hash ?? 'missing');
    return crypto.createHash('sha256').update(JSON.stringify({ r: a.recipient, t: a.text, e: hashes })).digest('hex');
  }
  /** Revoking before the send: the approval can no longer move the case. */
  revokeApproval(approvalId: string) {
    const a = (this.data.approvals ?? []).find((x) => x.id === approvalId);
    if (!a) throw new RefundError(`no approval ${approvalId}`);
    if (a.status !== 'approved') throw new RefundError(`approval ${approvalId} is already ${a.status}`);
    a.status = 'revoked';
    this.log(a.caseId, 'approval', 'customer', `Approval ${approvalId} revoked before sending`);
    this.save();
  }

  // ---------- matching helpers ----------
  private flag(c: RefundCase, ev: CreditEvent, reason: CreditFlag, text: string, by: AuditEntry['by']): CreditResult {
    this.data.events![ev.eventId] = { caseId: c.id, outcome: 'flagged', reason, event: ev };
    c.ledger!.flags.push({ eventId: ev.eventId, reason, date: ev.date });
    this.log(c.id, 'flag', by, text);
    this.save();
    return { result: 'flagged', caseId: c.id, reason };
  }
  private clearFlag(c: RefundCase, eventId: string) {
    if (c.ledger) c.ledger.flags = c.ledger.flags.filter((f) => f.eventId !== eventId);
  }
  private count(c: RefundCase, ev: CreditEvent, by: AuditEntry['by']): CreditResult {
    const L = c.ledger!;
    const cents = Math.round(Math.abs(ev.amount) * 100);
    if (ev.currency !== c.facts.currency) return this.flag(c, ev, 'other_currency', `Credit ${ev.eventId} is in ${ev.currency}, the purchase was in ${String(c.facts.currency)}: not counted`, by);
    if (ev.status !== 'posted') return this.flag(c, ev, 'provisional', `Credit ${ev.eventId} is still pending (provisional): noted, not counted until posted`, by);
    if (c.state === 'handed_off') return this.flag(c, ev, 'case_with_a_person', `Credit ${ev.eventId} arrived while the case is with a person: noted for them, not counted yet`, by);
    if (L.receivedCents >= L.expectedCents || L.receivedCents + cents > L.expectedCents) {
      return this.flag(c, ev, 'possible_duplicate', `Credit ${ev.eventId} would go over the amount owed: possible duplicate, needs review`, by);
    }
    L.credits.push({ eventId: ev.eventId, cents, date: ev.date });
    L.receivedCents += cents;
    this.data.events![ev.eventId] = { caseId: c.id, outcome: 'counted', event: ev };
    const remaining = L.expectedCents - L.receivedCents;
    this.log(c.id, 'evidence', by, `Credit ${ev.eventId} matched the case. ${remaining === 0 ? 'Nothing remains owed' : 'Some amount remains owed'}`);
    if (remaining === 0) this.transition(c.id, 'closed', { kind: 'event', type: 'refund_matched', ref: ev.eventId }, by);
    else if (c.state !== 'partially_refunded') this.transition(c.id, 'partially_refunded', { kind: 'event', type: 'refund_partial', ref: ev.eventId }, by);
    this.save();
    return { result: 'counted', caseId: c.id, remainingCents: remaining, state: this.get(c.id).state };
  }
  private reverse(ev: CreditEvent, by: AuditEntry['by']): CreditResult {
    const events = this.data.events!;
    const c = this.casesFor(ev.userId).find((x) => x.ledger?.credits.some((k) => k.eventId === ev.reversesEventId));
    if (!c) { events[ev.eventId] = { caseId: null, outcome: 'no_match', event: ev }; this.save(); return { result: 'no_match' }; }
    const L = c.ledger!;
    const k = L.credits.find((x) => x.eventId === ev.reversesEventId)!;
    L.credits = L.credits.filter((x) => x !== k);
    L.receivedCents -= k.cents;
    events[ev.eventId] = { caseId: c.id, outcome: 'reversed', event: ev };
    this.log(c.id, 'flag', by, `Refund ${k.eventId} was reversed by the shop or bank`);
    const to: CaseState = L.receivedCents > 0 ? 'partially_refunded' : 'watching';
    if (c.state !== to && (c.state === 'closed' || c.state === 'partially_refunded')) this.transition(c.id, to, { kind: 'event', type: 'refund_reversed', ref: ev.eventId }, by);
    this.save();
    return { result: 'reversed', caseId: c.id, remainingCents: L.expectedCents - L.receivedCents, state: this.get(c.id).state };
  }

  // ---------- derived status ----------
  /** Shop promise (from the working-day calendar), lateness, and the policy evaluation. Computed, never stored as text. */
  status(caseId: string, today: string) {
    const c = this.get(caseId);
    if (c.consent.withdrawnAt) return { state: c.state, withdrawn: true as const, withdrawnAt: c.consent.withdrawnAt, promiseDate: undefined, late: undefined, money: undefined, needsReview: [] as CreditFlagEntry[], evaluation: this.evaluation(caseId, today) };
    const cal = this.cal();
    const f = c.facts;
    const promise = typeof f.promiseFrom === 'string' && typeof f.promiseWorkingDays === 'number'
      ? addWorkingDays(f.promiseFrom, f.promiseWorkingDays, cal) : undefined;
    const L = c.ledger;
    const owed = !L || L.receivedCents < L.expectedCents;
    // Late only while money is still owed and the case is open: never stale after a full refund.
    const waiting = owed && c.state !== 'closed' && c.state !== 'handed_off';
    const late = waiting && promise && today > promise ? { calendarDays: daysBetween(promise, today), workingDays: workingDaysAfter(promise, today, cal) } : undefined;
    const money = L ? { expected: L.expectedCents / 100, received: L.receivedCents / 100, remaining: (L.expectedCents - L.receivedCents) / 100, flags: L.flags } : undefined;
    // Shown on the case even when it is closed: a possible duplicate or a credit waiting for the customer's pick.
    const needsReview = (L?.flags ?? []).filter((f) => f.reason === 'possible_duplicate' || f.reason === 'ambiguous_ask_customer');
    return { state: c.state, promiseDate: promise, late, money, needsReview, evaluation: this.evaluation(caseId, today) };
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
