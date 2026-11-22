/** Refund Tracker: HTTP for the customer app and the Presenter tools. All credits are fictional (demo). Nothing is
    sent to a shop or bank; "simulated" is said on every screen the customer sees. */
import type { Express, Request, Response } from 'express';
import { refunds } from './index.js';
import { RefundError, type RefundCase, type RefundStore } from './cases.js';
import { controls, press, type ControlId } from './presenter.js';
import { DEMO_TODAY } from '../finance.js';
import { caseToday } from './cases.js';
import { db } from '../db.js';

const h = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response) => {
  try { fn(req, res); } catch (e: any) { res.status(e instanceof RefundError ? 400 : (e?.status || 500)).json({ error: e?.message || String(e) }); }
};

/** What the consent card offers, as kinds only: no amount, order number or message text before the customer decides. */
const OFFER_TEXT: Record<string, { title: string; sub: string }> = {
  card_transaction: { title: 'Your card purchases at Tuulikki Electronics', sub: 'The shop you named · not your other purchases' },
  receipt: { title: 'Order emails from the shop', sub: 'Order confirmation or receipt' },
  return_tracking: { title: 'Return tracking', sub: 'Parcel tracking for the return' },
  seller_email: { title: 'Emails from the shop', sub: 'Messages about the return or refund' },
};
const ORDER = ['card_transaction', 'receipt', 'return_tracking', 'seller_email'];

export function consentOffer(s: RefundStore, userId: string) {
  return s.sourcesFor(userId)
    .filter((r) => OFFER_TEXT[r.kind])
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    .map((r) => ({ id: r.id, kind: r.kind, ...OFFER_TEXT[r.kind] }));
}

const eur = (cents: number) => cents / 100;
const fmtE = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const fmtD = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? `${Number(m[3])} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1]}` : d; };
/** Plain-language state of one case, written by code from the case view only. Used on the case page and in chat. */
export function explainCase(v: ReturnType<typeof caseView>): { lines: string[]; next: string } {
  if ((v as any).withdrawn) return { lines: [], next: '' };
  const c = v as any; const lines: string[] = [];
  const shop = c.merchant ?? 'the shop';
  if (c.expected != null) lines.push(`Your ${shop} refund${c.item ? ` for ${c.item}` : ''}: ${fmtE(c.expected)} expected, ${fmtE(c.received ?? 0)} received${(c.remaining ?? 0) > 0 ? `, ${fmtE(c.remaining)} still to come` : ''}.`);
  else lines.push('The records you allowed do not show what was bought or for how much, so Abel cannot say how much is owed.');
  if (c.promiseDate) lines.push(`The shop promised it by ${fmtD(c.promiseDate)}.${c.late && (c.remaining ?? 0) > 0 ? ` That was ${c.late.workingDays ?? c.late} working days ago.` : ''}`);
  else lines.push('No promised date is in the records you allowed, so Abel cannot check if it is late.');
  if (c.needsReview) lines.push('A credit came in that needs your check before it is counted.');
  const msgs = c.shopMessages ?? []; const last = msgs[msgs.length - 1];
  if (last) lines.push(last.direction === 'out' ? `You wrote to ${shop} on ${fmtD(last.at)}. No reply yet.` : last.kind === 'will_refund' ? `${shop} replied that it will refund the rest.` : last.kind === 'needs_more' ? `${shop} replied that it needs proof of the return.${c.canWrite === 'answer' ? '' : c.hasTracking ? ' Your return tracking is allowed but does not show enough to answer with.' : ' The records you allowed do not include it. To add it, withdraw this case and start again, allowing the return tracking too.'}` : `${shop} replied that it cannot refund the rest.`);
  if (c.shopDeclinedAt) lines.push('The case stays open and Abel keeps watching.');
  const next = c.canWrite === 'answer' ? 'You can answer with your return tracking. Abel drafts it and you approve the exact words.' : c.canWrite === 'inquiry' ? 'You can write to the shop from here. Abel drafts it and you approve the exact words.' : c.canWrite === 'reminder' ? "The shop's date has passed. You can send a reminder, and you approve the exact words." : (c.remaining ?? 0) <= 0 && c.expected != null ? 'Nothing more to do.' : last?.direction === 'out' ? 'Waiting for the shop to reply.' : '';
  return { lines, next };
}

/** One case, shaped for the screens. Everything the customer sees is computed here from the case, never typed text. */
export function caseView(s: RefundStore, c: RefundCase): any {
  const v = caseViewRaw(s, c);
  if (!v.withdrawn) v.explain = explainCase(v);
  return v;
}
function caseViewRaw(s: RefundStore, c: RefundCase): any {
  const TODAY = caseToday(c, DEMO_TODAY);
  const st = s.status(c.id, TODAY);
  if ('withdrawn' in st && st.withdrawn) {
    return { id: c.id, userId: c.userId, state: c.state, withdrawn: true, withdrawnAt: st.withdrawnAt, grantedAt: c.consent.grantedAt, itemCount: c.consent.items.length };
  }
  const L = c.ledger;
  const ev = (id: string) => s.data.events?.[id]?.event;
  const credits = (L?.credits ?? []).map((x) => ({ eventId: x.eventId, amount: eur(x.cents), date: x.date, currency: ev(x.eventId)?.currency ?? 'EUR', simulated: true }));
  const flags = (L?.flags ?? []).map((f) => {
    const e = ev(f.eventId);
    return { eventId: f.eventId, reason: f.reason, date: f.date, amount: e?.amount, currency: e?.currency, needsReview: f.reason === 'possible_duplicate' || f.reason === 'ambiguous_ask_customer',
      conflicts: f.reason === 'ambiguous_ask_customer' ? s.creditConflicts(f.eventId, c.id) : [] };
  });
  const f = c.facts;
  const canWrite = s.canWrite(c.id, TODAY);
  return {
    explain: undefined as unknown as { lines: string[]; next: string },
    shopMessages: (c.shopMessages ?? []).map((m) => ({ id: m.id, direction: m.direction, at: m.at, text: m.text, kind: m.kind })), canWrite,
    id: c.id, userId: c.userId, state: c.state, withdrawn: false, grantedAt: c.consent.grantedAt, itemCount: c.consent.items.length,
    hasTracking: c.evidence.some((e) => e.kind === 'return_tracking' && !!e.copy), hasReceipt: c.evidence.some((e) => e.kind === 'receipt' && !!e.copy), receiptLabel: c.evidence.find((e) => e.kind === 'receipt' && e.copy)?.label, receiptSavedAt: c.receiptSavedAt,
    hasCard: c.evidence.some((e) => e.kind === 'card_transaction'), merchant: f.merchant, orderRef: f.orderRef, item: f.item, chargeDate: f.chargeDate, deliveryDate: f.deliveryDate, returnSentDate: f.returnSentDate, sellerReceivedDate: f.sellerReceivedDate,
    expected: L ? eur(L.expectedCents) : undefined, received: L ? eur(L.receivedCents) : undefined, remaining: L ? eur(L.expectedCents - L.receivedCents) : undefined,
    asOf: TODAY, shopDeclinedAt: c.shopDeclinedAt, promiseDate: st.promiseDate, late: st.late, credits, flags, needsReview: st.needsReview.length,
    evaluation: { outcome: st.evaluation.outcome },
    log: s.auditFor(c.id).map((a) => ({ seq: a.seq, at: a.at, kind: a.kind, by: a.by, detail: a.detail })),
  };
}

export function registerRefundRoutes(app: Express) {
  const s = () => refunds();

  // The customer's refund cases, plus what the consent card would offer for a new one.
  app.get('/api/refund/:uid', h((req, res) => {
    const uid = String(req.params.uid);
    res.json({ today: DEMO_TODAY, cases: s().data.cases.filter((c) => c.userId === uid).map((c) => caseView(s(), c)), offer: consentOffer(s(), uid), demo: 'Demo: fictional data, nothing is really sent or claimed.' });
  }));

  // The customer ticks records and allows Abel to read them. Only offered records can be ticked.
  app.post('/api/refund/:uid/cases', h((req, res) => {
    const uid = String(req.params.uid);
    const items = Array.isArray(req.body?.consentItems) ? req.body.consentItems.map(String) : [];
    const offered = new Set(consentOffer(s(), uid).map((o) => o.id));
    if (items.some((i: string) => !offered.has(i))) throw new RefundError('one of those records is not offered for a refund case');
    if (!items.length) throw new RefundError('tick at least one item');
    const already = s().data.cases.find((c) => c.userId === uid && !c.consent.withdrawnAt && c.state !== 'closed');
    if (already) throw new RefundError('there is already an open refund case');
    const c = s().openCustomerCase({ userId: uid, consentItems: items, reasons: ['refund_not_received'], country: 'FI' });
    res.status(201).json({ case: caseView(s(), c) });
  }));

  app.get('/api/refund/case/:id', h((req, res) => res.json({ case: caseView(s(), s().get(String(req.params.id))) })));

  app.post('/api/refund/case/:id/withdraw', h((req, res) => {
    const id = String(req.params.id);
    s().withdrawConsent(id);
    // Status answers Abel wrote in chat from this case carry its amounts and order. They go with the case. The customer's own messages stay.
    for (const m of db.getMessages(s().get(id).userId)) if ((m as any).refundCaseId === id) db.updateMessage(m.id, { text: 'This refund status was removed when you withdrew the case.', refundCaseId: undefined } as any);
    res.json({ case: caseView(s(), s().get(id)) });
  }));

  // Writing to the shop: the text Abel would send, then the customer's approval of that exact text.
  app.get('/api/refund/case/:id/shop-draft', h((req, res) => {
    const m = s().composeShopMessage(String(req.params.id), caseToday(s().get(String(req.params.id)), DEMO_TODAY));
    res.json({ caseId: String(req.params.id), basis: m.basis, kind: m.kind, recipient: m.recipient, text: m.text, cites: m.evidenceLabels });
  }));
  app.post('/api/refund/case/:id/shop-send', h((req, res) => {
    const id = String(req.params.id);
    const r = s().sendShopMessage(id, String(req.body?.text ?? ''), caseToday(s().get(id), DEMO_TODAY), String(req.body?.basis ?? ''));
    res.json({ result: r, case: caseView(s(), s().get(id)) });
  }));

  // Keep the allowed receipt in Abel knows until the case is withdrawn.
  app.post('/api/refund/case/:id/save-receipt', h((req, res) => {
    const id = String(req.params.id);
    s().saveReceipt(id);
    res.json({ case: caseView(s(), s().get(id)) });
  }));

  // "Checked, fine" on a possible duplicate.
  app.post('/api/refund/case/:id/review', h((req, res) => {
    const id = String(req.params.id);
    const outcome = String(req.body?.outcome);
    if (outcome !== 'checked_fine' && outcome !== 'reported') throw new RefundError('outcome must be checked_fine or reported');
    s().reviewFlag(id, String(req.body?.eventId), outcome);
    res.json({ case: caseView(s(), s().get(id)) });
  }));

  // The customer picks a credit for this case. A credit that names another order is counted only with every conflict acknowledged.
  app.post('/api/refund/case/:id/assign', h((req, res) => {
    const id = String(req.params.id);
    const accept = Array.isArray(req.body?.acceptConflicts) ? req.body.acceptConflicts.map(String) : [];
    const result = s().assignCredit(String(req.body?.eventId), id, { acceptConflicts: accept });
    res.json({ result, case: caseView(s(), s().get(id)) });
  }));

  // Presenter tools: fictional credits arrive.
  app.get('/api/refund/:uid/presenter', h((req, res) => res.json(controls(s(), String(req.params.uid)))));
  app.post('/api/refund/:uid/presenter/:control', h((req, res) => {
    const uid = String(req.params.uid);
    const r = press(s(), uid, String(req.params.control) as ControlId);
    res.status(r.ok ? 200 : 409).json({ ...r, ...controls(s(), uid) });
  }));
}
