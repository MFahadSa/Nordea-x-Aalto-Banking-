// Refund Tracker screens. Everything is a demo: fictional credits, nothing is sent to a shop or bank.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { eur, dayShort, workdaysLate, refundNotice, laterStore, useLaterVersion, type RNotice } from './refundNotice.js';
export { eur };
import { Icon } from '../ui/icons.js';
import { DetailHead, NRow, Band, NChev } from './Nordea.js';

export interface RCase {
  id: string; state: string; withdrawn: boolean; itemCount: number; closedAckedAt?: string;
  hasCard?: boolean; merchant?: string; orderRef?: string; item?: string; chargeDate?: string;
  shopDeclinedAt?: string;
  expected?: number; received?: number; remaining?: number; promiseDate?: string; asOf?: string; late?: boolean;
  credits?: { eventId: string; amount: number; date: string; currency: string }[];
  flags?: { eventId: string; reason: string; amount?: number; currency?: string; needsReview: boolean; conflicts?: string[] }[];
  needsReview?: number;
  explain?: { lines: string[]; next: string }; canWrite?: 'inquiry' | 'reminder' | 'answer' | null;
  shopMessages?: { id: string; direction: 'out' | 'in'; at: string; text: string; kind: string }[];
  hasReceipt?: boolean; receiptLabel?: string; receiptSavedAt?: string;
}
interface ROffer { id: string; kind: string; title: string; sub: string }
interface RView { cases: RCase[]; offer: ROffer[]; demo: string }
interface RControl { id: string; title: string; label: string; badge?: string; note: string; enabled: boolean }

export const EVT = 'refund-changed';
const ping = () => window.dispatchEvent(new Event(EVT));
const api = async (url: string, body?: unknown) => {
  const r = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 409) throw new Error(d.error || 'Something went wrong');
  return d;
};
const day = (iso?: string) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

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

/** Home: one slim row under Quick actions. Tap to open the detail in place. */
export const RefundHomeCard: React.FC<{ userId: string; onOpen: () => void }> = ({ userId, onOpen }) => {
  const { v } = useRefund(userId);
  const [openKey, setOpenKey] = useState('');
  const n = refundNotice(v as any);
  if (!n) return null;
  const open = openKey === n.key;
  return (
    <div className={`ncard notice rf-row ${n.tone}${open ? ' open' : ''}`}>
      <button className="rf-row-h" aria-expanded={open} onClick={() => setOpenKey(open ? '' : n.key)}>
        <span className="nt-ic" aria-hidden="true"><Icon name="clock" /></span>
        <span className="nt-t"><b>{n.title}</b>{!open && <span>{n.sub}</span>}</span>
        {!open && <span className="nt-go">Open</span>}
      </button>
      {open && (
        <div className="rf-row-d">
          <span>{n.detail}</span>
          <div className="rf-row-b"><button className="btn primary" onClick={onOpen}>Open case</button>{n.done ? <button className="btn" onClick={() => ackClosed(n.caseId)}>Done</button> : <button className="btn" onClick={() => setOpenKey('')}>Later</button>}</div>
        </div>
      )}
    </div>
  );
};

/** The same item as the top card of the bell's From Nora list. Later hides it from the list until something changes. */
export const RefundNoraCard: React.FC<{ userId: string; onOpen: () => void }> = ({ userId, onOpen }) => {
  const { v } = useRefund(userId);
  useLaterVersion();
  const n = refundNotice(v as any);
  if (!n || laterStore.has(n.key)) return null;
  return (
    <div className="ncard rf-abel">
      <span className={`rf-tag ${n.tone}`}>Your refund</span>
      <b>{n.title}</b>
      <span>{n.detail}</span>
      <div className="rf-row-b"><button className="btn primary" onClick={onOpen}>Open case</button>{n.done ? <button className="btn" onClick={() => ackClosed(n.caseId)}>Done</button> : <button className="btn" onClick={() => laterStore.add(n.key)}>Later</button>}</div>
    </div>
  );
};
/** For the bell badge: is there a refund item in From Nora right now. */
export const useRefundNoraCount = (userId: string) => { const { v } = useRefund(userId); useLaterVersion(); const n = refundNotice(v as any); return n && !laterStore.has(n.key) ? 1 : 0; };

/** Done on a completed case: clears the Home row and the bell item. The case and its log stay. */
const ackClosed = async (caseId: string) => { try { await api(`/api/refund/case/${caseId}/ack-closed`, {}); ping(); } catch { /* the row stays; the next poll retries the state */ } };

export const RefundCasePage: React.FC<{ userId: string; onBack: () => void }> = ({ userId, onBack }) => {
  const { v } = useRefund(userId);
  const c = openCase(v);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState<{ mine?: string; caseId: string; basis: string; kind: string; recipient: string; text: string; cites: string[] } | null>(null);
  const caseKey = `${userId}:${c?.id ?? ''}`;
  const reqKey = useRef(caseKey);
  useEffect(() => { reqKey.current = caseKey; setDraft(null); setErr(''); }, [caseKey]);
  const [busy, setBusy] = useState(false);
  if (!v || !c) return (<><DetailHead title="Refund" onBack={onBack} /><div className="nbody"><p className="presenter-note">No refund case is open.</p></div></>);
  const full = c.expected != null && (c.received ?? 0) >= c.expected && (c.received ?? 0) > 0;
  const partial = (c.received ?? 0) > 0 && !full;
  const nomatch = c.expected == null;
  const pend = (c.flags || []).some((f) => f.reason === 'provisional') && !full;
  const status = nomatch ? 'not matched yet' : c.shopDeclinedAt && !full ? 'Shop declined' : pend && !partial ? 'refund pending, not counted yet' : full ? 'Refund received' : partial && c.expected != null ? `${eur(c.received!)} of ${eur(c.expected)} received` : c.late ? 'no refund yet, later than promised' : 'waiting for the refund';
  const check = async (eventId: string) => { try { await api(`/api/refund/case/${c.id}/review`, { eventId, outcome: 'checked_fine' }); ping(); } catch (e: any) { setErr(e.message); } };
  // A response only counts if the customer and case are still the ones that asked for it.
  const openDraft = async () => {
    const key = caseKey; setErr('');
    try { const d = await api(`/api/refund/case/${c.id}/shop-draft`); if (reqKey.current === key && d.caseId === c.id) setDraft(d); }
    catch (e: any) { if (reqKey.current === key) setErr(e.message); }
  };
  const sendDraft = async () => {
    if (!draft || busy || draft.caseId !== c.id) return; const key = caseKey; const mine = draft.text; setBusy(true);
    try { await api(`/api/refund/case/${c.id}/shop-send`, { text: draft.text, basis: draft.basis }); if (reqKey.current === key) { setDraft(null); ping(); } }
    catch (e: any) {
      if (reqKey.current === key) {
        setErr(e.message);
        if (/changed since this draft/i.test(e.message)) {
          // The facts moved on. Show the updated draft and keep the customer's own words visible beside it, never silently replaced.
          try { const fresh = await api(`/api/refund/case/${c.id}/shop-draft`); if (reqKey.current === key && fresh.caseId === c.id) setDraft({ ...fresh, mine: mine }); }
          catch { /* the old draft stays on screen, unsent */ }
        }
      }
    }
    setBusy(false);
  };
  const saveReceipt = async () => { try { await api(`/api/refund/case/${c.id}/save-receipt`, {}); ping(); } catch (e: any) { setErr(e.message); } };
  const assign = async (eventId: string, acceptConflicts: string[]) => { try { await api(`/api/refund/case/${c.id}/assign`, { eventId, acceptConflicts }); ping(); } catch (e: any) { setErr(e.message); } };
  const late = workdaysLate(c.promiseDate, c.asOf);
  return (
    <>
      <DetailHead title="Refund case" big={c.expected != null ? eur(c.expected) : undefined} sub={`${c.merchant ?? 'the shop'} · ${status}`} onBack={onBack} />
      <div className="nbody">
        {err && <p className="rf-err">{err}</p>}
        {c.explain && c.explain.lines.length > 0 && (<>
          <Band left="Where things stand" />
          <div className="ncard flat"><p className="rf-rules">{c.explain.lines.join(' ')}{c.explain.next ? ` ${c.explain.next}` : ''}</p></div>
        </>)}
        <Band left="Status" />
        <div className="ncard flat">
          {(c.credits || []).map((x) => (
            <NRow key={x.eventId} name={<><Icon name="check" />Refund received</>} sub={dayShort(x.date)} amount={eur(x.amount)} chevron={false} />
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
            <NRow name={<><Icon name="shield" />Nora can't match a refund yet</>} sub="The records you allowed do not show what was bought or for how much. To add more, withdraw this case and start again, allowing the card purchase or the order confirmation too." chevron={false} />
          )}
          {c.expected != null && !full && !c.shopDeclinedAt && (c.credits || []).length === 0 && !(c.flags || []).some((f) => f.reason === 'provisional') && (
            <NRow name={<><Icon name="clock" />No refund has arrived yet</>} sub={c.promiseDate ? `The shop promised it by ${day(c.promiseDate)}. Nora keeps watching for it.` : 'Nora keeps watching for it.'} chevron={false} />
          )}
          {c.expected != null && c.late && c.promiseDate && !full && !c.shopDeclinedAt && (
            <NRow name="Later than promised" sub={<><span className="rf-chip rf-chip-w">{late} working days</span><br />Not counted until the money is booked.</>} chevron={false} />
          )}
          {(c.flags || []).filter((f) => f.reason === 'provisional' && !full).map((f) => (
            <NRow key={f.eventId} name={<><Icon name="clock" />Refund on its way</>} amount={eur(f.amount ?? c.expected!)}
              sub={<><span className="rf-chip rf-chip-l">Pending, not counted yet</span><br />{eur(f.amount ?? c.expected!)} from {c.merchant ?? 'the shop'} is pending in your account. Nora counts it once it is booked.</>} chevron={false} />
          ))}
        </div>
        {c.item && c.expected != null && (<>
          <Band left="Purchase" />
          <div className="ncard flat">
            <NRow name={c.item} sub={`Order ${c.orderRef}${c.hasCard ? ' · credit card' : ''}`} amount={`−${eur(c.expected)}`} note={c.chargeDate ? `Charged ${day(c.chargeDate)}` : undefined} chevron={false} />
          </div>
        </>)}
        {(c.canWrite || (c.shopMessages || []).length > 0) && (<>
          <Band left="Your shop" />
          <div className="ncard flat">
            {(c.shopMessages || []).map((m) => (
              <NRow key={m.id} name={m.direction === 'out' ? (m.kind === 'reminder' ? 'You sent a reminder' : m.kind === 'answer' ? 'You answered the shop' : 'You wrote to the shop') : `${c.merchant ?? 'The shop'} replied`} sub={m.text} note={dayShort(m.at.slice(0, 10))} chevron={false} />
            ))}
            {c.canWrite && <NRow name={c.canWrite === 'reminder' ? 'Send a reminder?' : c.canWrite === 'answer' ? 'Answer the shop?' : 'Write to the shop?'} sub={c.canWrite === 'answer' ? 'The shop asked for proof of the return. Nora drafts an answer from your return tracking, you check every word.' : c.canWrite === 'reminder' ? "The date the shop gave has passed. Nora drafts it, you check every word." : 'Nora drafts it from what you allowed. You check every word before it goes.'} chevron={false} right={<button className="btn small" onClick={openDraft}>Draft</button>} />}
            {draft && draft.caseId === c.id && (
              <div className="rf-draftbox">
                <b>{draft.kind === 'reminder' ? 'Reminder to the shop' : draft.kind === 'answer' ? 'Answer to the shop' : 'Message to the shop'}</b>
                <span className="rf-c-s">To {draft.recipient}</span>
                <textarea className="rf-draft" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={9} />
                {draft.mine && draft.mine !== draft.text && <div className="rf-c-s" style={{ display: 'block', whiteSpace: 'pre-wrap' }}><b>Your earlier words (not sent)</b>{'\n'}Amounts and dates in them may no longer be current. The new draft above is up to date.{'\n\n'}{draft.mine}{'\n'}<button className="btn small" onClick={() => setDraft({ ...draft, text: draft.mine!, mine: undefined })}>Use my words</button></div>}
                <span className="rf-c-s">Based on: {draft.cites.join(', ')}</span>
                <button className="btn primary block" disabled={busy || !draft.text.trim()} onClick={sendDraft}>Send this message</button>
                <button className="btn quiet block" onClick={() => setDraft(null)}>Cancel</button>
              </div>
            )}
          </div>
        </>)}
        {c.hasReceipt && (<>
          <Band left="Receipt" />
          <div className="ncard flat">
            {c.receiptSavedAt
              ? <NRow name={<><Icon name="shield" />Receipt saved in Nora knows</>} sub={`${c.receiptLabel ?? 'The receipt you allowed'}. Kept in Nora knows until you withdraw this case, then deleted. The original is untouched.`} chevron={false} />
              : <NRow name="Keep the receipt?" sub="Save it to Nora knows, in case you need it later. Kept until you withdraw this case, then deleted." chevron={false} right={<button className="btn small" onClick={saveReceipt}>Save</button>} />}
          </div>
        </>)}
        {c.promiseDate && (<>
        <Band left="About the dates" />
        <div className="ncard flat"><p className="rf-rules">
          The shop promised {day(c.promiseDate)}. That is the shop's own date, not a legal deadline. Whether a legal deadline applies depends on how and when you cancelled, and on the item. Nora does not decide that. It writes to the shop only when you approve the words.
        </p></div>
        </>)}
      </div>
    </>
  );
};

export const RefundKnows: React.FC<{ userId: string; onOpen?: () => void }> = ({ userId, onOpen }) => {
  const { v } = useRefund(userId);
  const [ask, setAsk] = useState(false);
  const c = openCase(v);
  if (!v || !c) return null;
  const withdraw = async () => { await api(`/api/refund/case/${c.id}/withdraw`, {}); setAsk(false); ping(); };
  return (
    <>
      <Band left="Refund cases" />
      <div className="ncard flat">
        <NRow name={`${c.merchant ?? 'the shop'} refund`} sub={c.state === 'closed' ? `Refund received in full. Nora may keep reading the ${c.itemCount} records you allowed until you withdraw the case.` : `Nora may read the ${c.itemCount} records you allowed and watches for this refund`} chevron={false}
          right={<span className="rf-row-b">{onOpen && <button className="btn small" onClick={onOpen}>Open</button>}<button className="btn small" onClick={() => setAsk(true)}>Withdraw</button></span>} />
        {c.receiptSavedAt && <NRow name={<><Icon name="shield" />Saved receipt</>} sub={`${c.receiptLabel ?? 'The receipt you allowed'}. Deleted when you withdraw this case.`} chevron={false} />}
        <NRow name="What withdrawing does" sub="Nora stops reading and stops watching for the refund. The copies and the facts taken from them are deleted. The log of what Nora did is kept." chevron={false} />
      </div>
      {ask && (
        <div className="cf-bg" onClick={() => setAsk(false)}>
          <div className="cf-sheet" role="dialog" aria-label="Withdraw Nora's access to this case?" onClick={(e) => e.stopPropagation()}>
            <span className="kicker">Refund case</span>
            <h3>Withdraw Nora's access to this case?</h3>
            <p className="cf-p">Nora stops reading and stops watching for the refund. The copies and the facts taken from them are deleted. The log of what Nora did is kept.</p>
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
