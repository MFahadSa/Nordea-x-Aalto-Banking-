/** Refund Tracker: the Presenter's stateful test-credit controls (demo only, fictional credits).
    Each control reads the case and the credit log, so a press never repeats an event and never skips ahead. */
import type { CreditEvent, RefundCase, RefundStore } from './cases.js';

export type ControlId = 'partial' | 'arrives' | 'decoy' | 'duplicate' | 'pending' | 'other_currency' | 'no_reference' | 'reversal' | 'declined';
export interface Control { id: ControlId; title: string; label: string; badge?: string; note: string; enabled: boolean }

const PARTS = ['ev-partial-40', 'ev-partial-49-90'];
const sent = (s: RefundStore, id: string) => !!s.data.events?.[id];
const fmt = (n: number) => n.toFixed(2).replace('.', ',');

/** The case the controls act on: the customer's newest case that is still reading (not withdrawn). */
export function activeCase(s: RefundStore, userId: string): RefundCase | undefined {
  return s.data.cases.filter((c) => c.userId === userId && !c.consent.withdrawnAt).slice(-1)[0];
}

export function controls(s: RefundStore, userId: string): { caseId: string | null; controls: Control[] } {
  const c = activeCase(s, userId);
  const none = (title: string, id: ControlId, note: string): Control => ({ id, title, label: 'Send', note, enabled: false });
  if (!c) {
    return { caseId: null, controls: [
      none('Partial refund', 'partial', 'Needs an open refund case'), none('Refund arrives', 'arrives', 'Needs an open refund case'),
      none('Decoy credit', 'decoy', 'Needs an open refund case'), none('Duplicate credit', 'duplicate', 'Needs an open refund case'),
      none('Pending credit', 'pending', 'Needs an open refund case'), none('Credit in another currency', 'other_currency', 'Needs an open refund case'),
      none('Credit with no reference', 'no_reference', 'Needs an open refund case'), none('Shop refuses', 'declined', 'Needs an open refund case'), none('Reversal', 'reversal', 'Needs an open refund case'),
    ] };
  }
  const L = c.ledger;
  const received = L?.receivedCents ?? 0, expected = L?.expectedCents ?? 0, remaining = expected - received;
  const full = !!L && remaining <= 0;
  const out: Control[] = [];

  const nPart = PARTS.filter((p) => sent(s, p)).length;
  const preset = (id: string) => s.presetsFor(userId).find((e) => e.eventId === id);
  const p0 = preset(PARTS[0]), p1 = preset(PARTS[1]);
  out.push(nPart === 0
    ? { id: 'partial', title: 'Partial refund', label: 'Send 1st', note: p0 ? `Sends ${fmt(p0.amount)} €` : 'Not available', enabled: !!p0 && !full }
    : nPart === 1
      ? { id: 'partial', title: 'Partial refund', label: 'Send 2nd', badge: '1 of 2 sent', note: `${fmt(p0!.amount)} € sent, next press sends ${fmt(p1!.amount)} €`, enabled: !!p1 && !full }
      : { id: 'partial', title: 'Partial refund', label: 'Sent', badge: '2 of 2 sent', note: 'Both parts sent', enabled: false });

  out.push(full
    ? { id: 'arrives', title: 'Refund arrives', label: 'Send', note: 'Fully refunded already', enabled: false }
    : { id: 'arrives', title: 'Refund arrives', label: 'Send', note: received > 0 ? `Not sent, sends what is still owed (${fmt(remaining / 100)} €)` : `Not sent, sends the full ${fmt((expected || 8990) / 100)} €`, enabled: !!L });

  const decoyDone = sent(s, 'ev-decoy-other-shop');
  out.push({ id: 'decoy', title: 'Decoy credit', label: decoyDone ? 'Sent' : 'Send', badge: decoyDone ? 'Sent' : undefined, note: decoyDone ? '89,90 € from another shop, did not match' : 'A credit from another shop, should not match', enabled: !decoyDone });

  const dupDone = sent(s, 'ev-lookalike');
  out.push({ id: 'duplicate', title: 'Duplicate credit', label: dupDone ? 'Sent' : 'Send', badge: dupDone ? 'Sent' : undefined,
    note: dupDone ? 'A second credit went to review' : full ? 'A second credit for the same order' : 'Available once the refund has fully arrived', enabled: full && !dupDone });

  for (const [id, title, evId, note] of [
    ['pending', 'Pending credit', 'ev-pending', 'A credit still pending: not counted until booked'],
    ['other_currency', 'Credit in another currency', 'ev-other-currency', 'A credit in SEK: flagged, not counted'],
    ['no_reference', 'Credit with no reference', 'ev-no-reference', 'No order or payment reference: customer is asked'],
  ] as const) {
    const done = sent(s, evId);
    out.push({ id, title, label: done ? 'Sent' : 'Send', badge: done ? 'Sent' : undefined, note, enabled: !done });
  }
  const declined = !!c.shopDeclinedAt;
  out.push({ id: 'declined', title: 'Shop refuses', label: declined ? 'Sent' : 'Send', badge: declined ? 'Sent' : undefined,
    note: declined ? 'Recorded: the shop declined. Nothing is sent' : full ? 'Already fully refunded' : 'The shop says no. Records it only, no dispute, nothing sent', enabled: !declined && !full });
  const lastCredit = L?.credits.slice(-1)[0];
  out.push({ id: 'reversal', title: 'Reversal', label: 'Send', note: lastCredit ? 'The shop or bank takes back the last counted credit' : 'Nothing counted to take back', enabled: !!lastCredit });
  return { caseId: c.id, controls: out };
}

/** One press. Returns the event it sent (or an error text). Never throws for a disabled control. */
export function press(s: RefundStore, userId: string, id: ControlId): { ok: boolean; message: string; eventId?: string; result?: unknown } {
  const state = controls(s, userId);
  const ctl = state.controls.find((x) => x.id === id);
  if (!ctl) return { ok: false, message: 'Unknown control' };
  if (!ctl.enabled) return { ok: false, message: ctl.note };
  const c = activeCase(s, userId)!;
  const tmpl = (evId: string) => s.presetsFor(userId).find((e) => e.eventId === evId);
  let ev: CreditEvent | undefined;
  const L = c.ledger!;
  if (id === 'declined') { s.recordShopDeclined(c.id, 'presenter'); return { ok: true, message: 'The shop declined (recorded only)' }; }
  if (id === 'partial') ev = tmpl(PARTS.find((p) => !sent(s, p))!);
  else if (id === 'arrives') {
    const remaining = L.expectedCents - L.receivedCents;
    const base = tmpl('ev-refund-full');
    if (base) ev = L.receivedCents === 0 ? base : { ...base, eventId: `ev-remaining-${L.credits.length}-${remaining}`, amount: remaining / 100 };
  } else if (id === 'decoy') ev = tmpl('ev-decoy-other-shop');
  else if (id === 'duplicate') ev = tmpl('ev-lookalike');
  else if (id === 'pending') ev = tmpl('ev-pending');
  else if (id === 'other_currency') ev = tmpl('ev-other-currency');
  else if (id === 'no_reference') ev = tmpl('ev-no-reference');
  else if (id === 'reversal') {
    const last = L.credits.slice(-1)[0]; const base = tmpl('ev-reversal');
    if (last && base) ev = { ...base, eventId: `ev-reversal-of-${last.eventId}`, reversesEventId: last.eventId, amount: last.cents / 100 };
  }
  if (!ev) return { ok: false, message: 'This credit is not in the demo data' };
  const result = s.applyCredit(ev, 'presenter');
  return { ok: true, message: `Sent ${ev.eventId}`, eventId: ev.eventId, result };
}
