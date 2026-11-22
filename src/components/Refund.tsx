// Refund Tracker screens. Everything is a demo: fictional credits, nothing is sent to a shop or bank.
import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from '../ui/icons.js';
import { DetailHead, NRow, Band, NChev } from './Nordea.js';

export interface RCase {
  id: string; state: string; withdrawn: boolean; itemCount: number;
  hasCard?: boolean; merchant?: string; orderRef?: string; item?: string; chargeDate?: string;
  shopDeclinedAt?: string;
  expected?: number; received?: number; remaining?: number; promiseDate?: string; late?: boolean;
  credits?: { eventId: string; amount: number; date: string; currency: string }[];
  flags?: { eventId: string; reason: string; amount?: number; currency?: string; needsReview: boolean; conflicts?: string[] }[];
  needsReview?: number;
  hasReceipt?: boolean; receiptLabel?: string; receiptSavedAt?: string;
}
interface ROffer { id: string; kind: string; title: string; sub: string }
interface RView { cases: RCase[]; offer: ROffer[]; demo: string }
interface RControl { id: string; title: string; label: string; badge?: string; note: string; enabled: boolean }

const EVT = 'refund-changed';
const ping = () => window.dispatchEvent(new Event(EVT));
const api = async (url: string, body?: unknown) => {
  const r = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 409) throw new Error(d.error || 'Something went wrong');
  return d;
};
export const eur = (n: number) => n.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0€';
const day = (iso?: string) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const dayShort = (iso?: string) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const workdaysLate = (from?: string, to = '2026-10-23') => {
  if (!from) return 0;
  let n = 0; const d = new Date(from + 'T12:00:00'); const end = new Date(to + 'T12:00:00');
  while (d < end) { d.setDate(d.getDate() + 1); if (d.getDay() % 6 !== 0) n++; }
  return n;
};

// One shared fetch per customer, however many screens or old chat cards use it. Only the newest request may set the result,
// and a result for a customer who was switched away from is dropped.
const hub = { uid: '', v: null as RView | null, seq: 0, subs: new Set<(v: RView | null) => void>(), timer: 0 as number };
const refetch = () => {
  const uid = hub.uid; const mine = ++hub.seq;
  api(`/api/refund/${uid}`).then((d) => d, () => null).then((d) => { if (mine === hub.seq && uid === hub.uid) { hub.v = d; hub.subs.forEach((f) => f(d)); } });
};
export function useRefund(userId: string) {
  const [v, setV] = useState<RView | null>(hub.uid === userId ? hub.v : null);
  useEffect(() => {
    if (hub.uid !== userId) { hub.uid = userId; hub.v = null; hub.seq++; }
    setV(hub.v);
    hub.subs.add(setV);
    if (hub.subs.size === 1) { window.addEventListener(EVT, refetch); hub.timer = window.setInterval(() => { if (!document.hidden) refetch(); }, 3000); }
    refetch();
    return () => { hub.subs.delete(setV); if (hub.subs.size === 0) { window.removeEventListener(EVT, refetch); window.clearInterval(hub.timer); } };
  }, [userId]);
  return { v, load: refetch };
}
const openCase = (v: RView | null) => v?.cases.filter((c) => !c.withdrawn).slice(-1)[0];

const Demo: React.FC<{ text: string }> = ({ text }) => <p className="rf-demo">{text}</p>;

export const RefundHomeCard: React.FC<{ userId: string; onOpen: () => void }> = ({ userId, onOpen }) => {
  const { v } = useRefund(userId);
  const c = openCase(v);
  if (!v || !c) return null;
  const got = c.expected != null && (c.received ?? 0) >= c.expected && (c.received ?? 0) > 0;
  const generic = (
    <button className="ncard notice" onClick={onOpen}>
      <span className="nt-ic" aria-hidden="true"><Icon name="clock" /></span>
      <span className="nt-t"><b>{c.needsReview ? 'A credit came in that needs your check' : `Abel is watching for your ${c.merchant ?? 'shop'} refund`}</b><span>{c.needsReview ? 'It is not counted yet. Open the case to answer.' : c.promiseDate ? 'Nothing needs you right now.' : 'No promised date is in the records you allowed, so Abel cannot check if it is late.'}</span><span className="rf-demo-s">{v.demo}</span></span>
      <span className="nt-go">Open</span>
    </button>
  );
  if (c.expected == null) return (
    <button className="ncard notice" onClick={onOpen}>
      <span className="nt-ic" aria-hidden="true"><Icon name="clock" /></span>
      <span className="nt-t"><b>Abel can't match your refund yet</b><span>The records you allowed do not show what was bought or for how much.</span><span className="rf-demo-s">{v.demo}</span></span>
      <span className="nt-go">Open</span>
    </button>
  );
  if (!got && !c.shopDeclinedAt && !(c.received ?? 0) && (!c.promiseDate || !c.late)) return generic;
  const late = workdaysLate(c.promiseDate);
  return (
    <button className="ncard notice" onClick={onOpen}>
      <span className="nt-ic" aria-hidden="true"><Icon name="clock" /></span>
      <span className="nt-t">
        <b>{got ? `Your ${c.merchant ?? 'the shop'} refund arrived` : c.shopDeclinedAt ? `The shop declined your ${c.merchant ?? 'the shop'} refund` : `Your ${c.merchant ?? 'the shop'} refund is later than the shop promised`}</b>
        <span>{got ? `${eur(c.expected!)} · simulated credit counted` : c.shopDeclinedAt ? `${c.remaining != null ? eur(c.remaining) : 'The refund'} still unpaid · the case stays open` : `${c.expected != null ? eur(c.expected) : 'Refund'} · promised by ${dayShort(c.promiseDate)} · ${late} working days later`}</span>
        <span className="rf-demo-s">{v.demo}</span>
      </span>
      <span className="nt-go">Open</span>
    </button>
  );
};

export const RefundCasePage: React.FC<{ userId: string; onBack: () => void }> = ({ userId, onBack }) => {
  const { v } = useRefund(userId);
  const c = openCase(v);
  const [err, setErr] = useState('');
  if (!v || !c) return (<><DetailHead title="Refund" onBack={onBack} /><div className="nbody"><p className="presenter-note">No refund case is open.</p></div></>);
  const full = c.expected != null && (c.received ?? 0) >= c.expected && (c.received ?? 0) > 0;
  const partial = (c.received ?? 0) > 0 && !full;
  const nomatch = c.expected == null;
  const pend = (c.flags || []).some((f) => f.reason === 'provisional') && !full;
  const status = nomatch ? 'not matched yet' : c.shopDeclinedAt && !full ? 'Shop declined' : pend && !partial ? 'refund pending, not counted yet' : full ? 'Refund received' : partial && c.expected != null ? `${eur(c.received!)} of ${eur(c.expected)} received` : c.late ? 'no refund yet, later than promised' : 'waiting for the refund';
  const check = async (eventId: string) => { try { await api(`/api/refund/case/${c.id}/review`, { eventId, outcome: 'checked_fine' }); ping(); } catch (e: any) { setErr(e.message); } };
  const saveReceipt = async () => { try { await api(`/api/refund/case/${c.id}/save-receipt`, {}); ping(); } catch (e: any) { setErr(e.message); } };
  const assign = async (eventId: string, acceptConflicts: string[]) => { try { await api(`/api/refund/case/${c.id}/assign`, { eventId, acceptConflicts }); ping(); } catch (e: any) { setErr(e.message); } };
  const late = workdaysLate(c.promiseDate);
  return (
    <>
      <DetailHead title="Refund case" big={c.expected != null ? eur(c.expected) : undefined} sub={`${c.merchant ?? 'the shop'} · ${status}`} onBack={onBack} />
      <div className="nbody">
        <Demo text={v.demo} />
        {err && <p className="rf-err">{err}</p>}
        <Band left="Status" />
        <div className="ncard flat">
          {(c.credits || []).map((x) => (
            <NRow key={x.eventId} name={<><Icon name="check" />Refund received</>} sub={dayShort(x.date)} amount={eur(x.amount)} note={<span className="rf-chip">Simulated credit</span>} chevron={false} />
          ))}
          {(c.flags || []).filter((f) => f.reason === 'possible_duplicate').map((f) => (
            <NRow key={f.eventId} name={<><Icon name="shield" />Another {f.amount != null ? eur(f.amount) : 'credit'} came in</>} sub="Not counted. Needs a check" chevron={false}
              right={<button className="btn small" onClick={() => check(f.eventId)}>Checked, fine</button>} />
          ))}
          {(c.flags || []).filter((f) => f.reason === 'ambiguous_ask_customer').map((f) => (
            <NRow key={f.eventId} name={<><Icon name="shield" />A credit came in without a clear order</>}
              sub={`${f.amount != null ? eur(f.amount) + '. ' : ''}Not counted.${f.conflicts && f.conflicts.length ? ' It says ' + f.conflicts.join('; ') + '.' : ''} Is it the refund for this order?`} chevron={false}
              right={<button className="btn small" onClick={() => assign(f.eventId, f.conflicts || [])}>Yes, count it</button>} />
          ))}
          {partial && !c.shopDeclinedAt && (
            <NRow name={<><Icon name="clock" />{c.remaining != null ? eur(c.remaining) : 'The rest'} has not arrived yet</>} sub={c.late ? `Later than promised: ${late} working days` : `Promised by ${day(c.promiseDate)}`} chevron={false} />
          )}
          {c.shopDeclinedAt && !full && (
            <NRow name={<><Icon name="shield" />The shop declined the refund</>} sub={`${c.remaining != null ? eur(c.remaining) : 'The refund'} still unpaid. The case stays open. Nothing is sent for you and no dispute is started.`} chevron={false} />
          )}
          {c.expected == null && (
            <NRow name={<><Icon name="shield" />Abel can't match a refund yet</>} sub="The records you allowed do not show what was bought or for how much. To add more, withdraw this case and start again, allowing the card purchase or the order confirmation too." chevron={false} />
          )}
          {c.expected != null && !full && !c.shopDeclinedAt && (c.credits || []).length === 0 && !(c.flags || []).some((f) => f.reason === 'provisional') && (
            <NRow name={<><Icon name="clock" />No refund has arrived yet</>} sub={c.promiseDate ? `The shop promised it by ${day(c.promiseDate)}. Abel keeps watching for it.` : 'Abel keeps watching for it.'} chevron={false} />
          )}
          {c.expected != null && c.late && c.promiseDate && !full && !c.shopDeclinedAt && (
            <NRow name="Later than promised" sub={<><span className="rf-chip rf-chip-w">{late} working days</span><br />Not counted until the money is booked.</>} chevron={false} />
          )}
          {(c.flags || []).filter((f) => f.reason === 'provisional' && !full).map((f) => (
            <NRow key={f.eventId} name={<><Icon name="clock" />Refund on its way</>} amount={eur(f.amount ?? c.expected!)}
              sub={<><span className="rf-chip rf-chip-l">Pending, not counted yet</span><br />{eur(f.amount ?? c.expected!)} from {c.merchant ?? 'the shop'} is pending in your account. Abel counts it once it is booked.</>} chevron={false} />
          ))}
        </div>
        {c.item && c.expected != null && (<>
          <Band left="Purchase" />
          <div className="ncard flat">
            <NRow name={c.item} sub={`Order ${c.orderRef}${c.hasCard ? ' · credit card' : ''}`} amount={`−${eur(c.expected)}`} note={c.chargeDate ? `Charged ${day(c.chargeDate)}` : undefined} chevron={false} />
          </div>
        </>)}
        {c.hasReceipt && (<>
          <Band left="Receipt" />
          <div className="ncard flat">
            {c.receiptSavedAt
              ? <NRow name={<><Icon name="shield" />Receipt saved in Abel knows</>} sub={`${c.receiptLabel ?? 'The receipt you allowed'}. Kept in Abel knows until you withdraw this case, then deleted. The original is untouched.`} chevron={false} />
              : <NRow name="Keep the receipt?" sub="Save it to Abel knows, in case you need it later. Kept until you withdraw this case, then deleted." chevron={false} right={<button className="btn small" onClick={saveReceipt}>Save</button>} />}
          </div>
        </>)}
        {c.promiseDate && (<>
        <Band left="About the dates" />
        <div className="ncard flat"><p className="rf-rules">
          The shop promised {day(c.promiseDate)}. That is the shop's own date, not a legal deadline. Whether a legal deadline applies depends on how and when you cancelled, and on the item. Abel does not decide that and does not contact the shop for you.
        </p></div>
        </>)}
      </div>
    </>
  );
};

export const RefundKnows: React.FC<{ userId: string }> = ({ userId }) => {
  const { v } = useRefund(userId);
  const [ask, setAsk] = useState(false);
  const c = openCase(v);
  if (!v || !c) return null;
  const withdraw = async () => { await api(`/api/refund/case/${c.id}/withdraw`, {}); setAsk(false); ping(); };
  return (
    <>
      <Band left="Refund cases" />
      <div className="ncard flat">
        <NRow name={`${c.merchant ?? 'the shop'} refund`} sub={`Abel may read the ${c.itemCount} records you allowed and watches for this refund`} chevron={false}
          right={<button className="btn small" onClick={() => setAsk(true)}>Withdraw</button>} />
        {c.receiptSavedAt && <NRow name={<><Icon name="shield" />Saved receipt</>} sub={`${c.receiptLabel ?? 'The receipt you allowed'}. Deleted when you withdraw this case.`} chevron={false} />}
        <NRow name="What withdrawing does" sub="Abel stops reading and stops watching for the refund. The copies and the facts taken from them are deleted. The log of what Abel did is kept." chevron={false} />
      </div>
      {ask && (
        <div className="cf-bg" onClick={() => setAsk(false)}>
          <div className="cf-sheet" role="dialog" aria-label="Withdraw Abel's access to this case?" onClick={(e) => e.stopPropagation()}>
            <span className="kicker">Refund case</span>
            <h3>Withdraw Abel's access to this case?</h3>
            <p className="cf-p">Abel stops reading and stops watching for the refund. The copies and the facts taken from them are deleted. The log of what Abel did is kept.</p>
            <div className="btns stack">
              <button className="btn primary block" onClick={withdraw}>Withdraw and delete</button>
              <button className="btn quiet block" onClick={() => setAsk(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const RefundDemoTools: React.FC<{ userId: string }> = ({ userId }) => {
  const [c, setC] = useState<{ caseId: string | null; controls: RControl[] } | null>(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api(`/api/refund/${userId}/presenter`).then(setC), [userId]);
  useEffect(() => { load(); window.addEventListener(EVT, load); return () => window.removeEventListener(EVT, load); }, [load]);
  const press = async (id: string) => { const r = await api(`/api/refund/${userId}/presenter/${id}`, {}); setMsg(r.message || ''); ping(); };
  return (
    <>
      <Band left="Refund demo" />
      <div className="ncard flat">
        {(c?.controls || []).map((x) => (
          <NRow key={x.id} name={<>{x.title}{x.badge && <span className="rf-chip">{x.badge}</span>}</>} sub={x.note} chevron={false}
            right={<button className="btn small" disabled={!x.enabled} onClick={() => press(x.id)}>{x.label}</button>} />
        ))}
      </div>
      {msg && <p className="presenter-note">{msg}</p>}
    </>
  );
};
export { NChev };

/** After the customer withdrew, an old "Allowed" answer in the chat must say so. */
export const RefundResolved: React.FC<{ userId: string; text?: string; caseId?: string }> = ({ userId, text, caseId }) => {
  const { v } = useRefund(userId);
  // The card is bound to the case it created, so withdrawing that case marks it, whatever the customer allowed later.
  const mine = v?.cases.find((c) => c.id === caseId);
  const gone = !!v && /^Allowed/.test(text || '') && (!mine || mine.withdrawn);
  return <p className="n-sub">{text}{gone ? ' · access withdrawn' : ''}</p>;
};
