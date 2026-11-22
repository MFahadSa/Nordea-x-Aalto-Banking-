// Refund Tracker screens. Everything is a demo: fictional credits, nothing is sent to a shop or bank.
import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from '../ui/icons.js';
import { DetailHead, NRow, Band, NChev } from './Nordea.js';

export interface RCase {
  id: string; state: string; withdrawn: boolean; itemCount: number;
  merchant?: string; orderRef?: string; item?: string; chargeDate?: string;
  shopDeclinedAt?: string;
  expected?: number; received?: number; remaining?: number; promiseDate?: string; late?: boolean;
  credits?: { eventId: string; amount: number; date: string; currency: string }[];
  flags?: { eventId: string; reason: string; amount?: number; currency?: string; needsReview: boolean }[];
  needsReview?: number;
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

export function useRefund(userId: string) {
  const [v, setV] = useState<RView | null>(null);
  const load = useCallback(() => api(`/api/refund/${userId}`).then(setV).catch(() => setV(null)), [userId]);
  useEffect(() => { load(); window.addEventListener(EVT, load); return () => window.removeEventListener(EVT, load); }, [load]);
  return { v, load };
}
const openCase = (v: RView | null) => v?.cases.find((c) => !c.withdrawn);

const Demo: React.FC<{ text: string }> = ({ text }) => <p className="rf-demo">{text}</p>;

export const RefundHomeCard: React.FC<{ userId: string; onOpen: () => void }> = ({ userId, onOpen }) => {
  const { v } = useRefund(userId);
  const c = openCase(v);
  if (!v || !c) return null;
  const got = (c.received ?? 0) >= (c.expected ?? 0) && (c.received ?? 0) > 0;
  if (!got && !c.late && !c.shopDeclinedAt && !(c.received ?? 0)) return null;
  const late = workdaysLate(c.promiseDate);
  return (
    <button className="ncard notice" onClick={onOpen}>
      <span className="nt-ic" aria-hidden="true"><Icon name="clock" /></span>
      <span className="nt-t">
        <b>{got ? `Your ${c.merchant} refund arrived` : c.shopDeclinedAt ? `The shop declined your ${c.merchant} refund` : `Your ${c.merchant} refund is later than the shop promised`}</b>
        <span>{got ? `${eur(c.expected!)} · simulated credit counted` : c.shopDeclinedAt ? `${eur(c.remaining!)} still unpaid · the case stays open` : `${eur(c.expected!)} · promised by ${dayShort(c.promiseDate)} · ${late} working days later`}</span>
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
  const full = (c.received ?? 0) >= (c.expected ?? 0) && (c.received ?? 0) > 0;
  const partial = (c.received ?? 0) > 0 && !full;
  const status = c.shopDeclinedAt && !full ? 'Shop declined' : full ? 'Refund received' : partial ? `${eur(c.received!)} of ${eur(c.expected!)} received` : c.late ? 'Later than promised' : 'Refund on its way';
  const check = async (eventId: string) => { try { await api(`/api/refund/case/${c.id}/review`, { eventId, outcome: 'checked_fine' }); ping(); } catch (e: any) { setErr(e.message); } };
  const late = workdaysLate(c.promiseDate);
  return (
    <>
      <DetailHead title="Refund" big={eur(c.expected!)} sub={`${c.merchant} · ${status}`} onBack={onBack} />
      <div className="nbody">
        <Demo text={v.demo} />
        {err && <p className="rf-err">{err}</p>}
        <Band left="Status" />
        <div className="ncard flat">
          {(c.credits || []).map((x) => (
            <NRow key={x.eventId} name={<><Icon name="check" />Refund received</>} sub={dayShort(x.date)} amount={eur(x.amount)} note={<span className="rf-chip">Simulated credit</span>} chevron={false} />
          ))}
          {(c.flags || []).filter((f) => f.needsReview).map((f) => (
            <NRow key={f.eventId} name={<><Icon name="shield" />Another {eur(f.amount ?? c.expected!)} came in</>} sub="Not counted. Needs a check" chevron={false}
              right={<button className="btn small" onClick={() => check(f.eventId)}>Checked, fine</button>} />
          ))}
          {partial && !c.shopDeclinedAt && (
            <NRow name={<><Icon name="clock" />{eur(c.remaining!)} still to come</>} sub={c.late ? `Later than promised: ${late} working days` : `Promised by ${day(c.promiseDate)}`} chevron={false} />
          )}
          {c.shopDeclinedAt && !full && (
            <NRow name={<><Icon name="shield" />The shop declined the refund</>} sub={`${eur(c.remaining!)} still unpaid. The case stays open. Nothing is sent for you and no dispute is started.`} chevron={false} />
          )}
          {!full && !c.shopDeclinedAt && (c.credits || []).length === 0 && (
            <NRow name={<><Icon name="clock" />Refund on its way</>} sub={c.late ? `Later than promised: ${late} working days` : `Promised by ${day(c.promiseDate)}`} chevron={false} />
          )}
          {(c.flags || []).filter((f) => f.reason === 'pending').map((f) => (
            <NRow key={f.eventId} name={<><Icon name="clock" />Refund on its way</>} sub="Pending, not counted yet" chevron={false} />
          ))}
        </div>
        <Band left="Purchase" />
        <div className="ncard flat">
          <NRow name={c.item} sub={`Order ${c.orderRef} · credit card`} amount={`−${eur(c.expected!)}`} note={`Charged ${day(c.chargeDate)}`} chevron={false} />
        </div>
        <Band left="About the dates" />
        <div className="ncard flat"><p className="rf-rules">
          The shop promised {day(c.promiseDate)}. That is the shop's own date, not a legal deadline. Whether a legal deadline applies depends on how and when you cancelled, and on the item. Abel does not decide that and does not contact the shop for you.
        </p></div>
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
        <NRow name={`${c.merchant} refund`} sub={`Abel reads ${c.itemCount} items for this case`} chevron={false}
          right={<button className="btn small" onClick={() => setAsk(true)}>Withdraw</button>} />
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
