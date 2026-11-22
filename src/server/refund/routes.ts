/** Refund Tracker: HTTP for the customer app and the Presenter tools. All credits are fictional (demo). Nothing is
    sent to a shop or bank; "simulated" is said on every screen the customer sees. */
import type { Express, Request, Response } from 'express';
import { refunds } from './index.js';
import { RefundError, type RefundCase, type RefundStore } from './cases.js';
import { controls, press, type ControlId } from './presenter.js';
import { DEMO_TODAY } from '../finance.js';

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

/** One case, shaped for the screens. Everything the customer sees is computed here from the case, never typed text. */
export function caseView(s: RefundStore, c: RefundCase) {
  const st = s.status(c.id, DEMO_TODAY);
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
  return {
    id: c.id, userId: c.userId, state: c.state, withdrawn: false, grantedAt: c.consent.grantedAt, itemCount: c.consent.items.length,
    merchant: f.merchant, orderRef: f.orderRef, item: f.item, chargeDate: f.chargeDate, deliveryDate: f.deliveryDate, returnSentDate: f.returnSentDate, sellerReceivedDate: f.sellerReceivedDate,
    expected: L ? eur(L.expectedCents) : undefined, received: L ? eur(L.receivedCents) : undefined, remaining: L ? eur(L.expectedCents - L.receivedCents) : undefined,
    shopDeclinedAt: c.shopDeclinedAt, promiseDate: st.promiseDate, late: st.late, credits, flags, needsReview: st.needsReview.length,
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
    const c = s().openCase({ userId: uid, consentItems: items, reasons: ['refund_not_received'], country: 'FI' });
    res.status(201).json({ case: caseView(s(), c) });
  }));

  app.get('/api/refund/case/:id', h((req, res) => res.json({ case: caseView(s(), s().get(String(req.params.id))) })));

  app.post('/api/refund/case/:id/withdraw', h((req, res) => {
    const id = String(req.params.id);
    s().withdrawConsent(id);
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
