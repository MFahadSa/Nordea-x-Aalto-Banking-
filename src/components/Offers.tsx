// Offers for you (Home). Each card: the offer, one personal reason, ⓘ "Why am I seeing this?" (the data
// used and whether Nordea earns from it), and a row of icon buttons: one tap, no menus, Undo in a toast.
import React, { useEffect, useState } from 'react';
import { fetchOffers, offerAction, type OfferAction, type OfferView } from '../services/aboutApi.js';
import { Icon } from '../ui/icons.js';
import { Band } from './Nordea.js';

export type OfferToast = (message: string, undo?: () => void) => void;

const Act: React.FC<{ icon: string; label: string; on?: boolean; onClick: () => void }> = ({ icon, label, on, onClick }) => (
  <button className={`of-ic${on ? ' on' : ''}`} onClick={onClick} aria-label={label} aria-pressed={on} title={label}>
    <Icon name={icon} size={19} strokeWidth={on ? 2.4 : 2} />
    <span>{label}</span>
  </button>
);

export const OfferCard: React.FC<{ o: OfferView; onAct: (o: OfferView, a: OfferAction) => void; onAsk: (o: OfferView) => void }> = ({ o, onAct, onAsk }) => {
  const [why, setWhy] = useState(false);
  return (
    <div className="card offer-card">
      <div className="ofc-h">
        <h3>{o.title}</h3>
        <button className="ofc-why" aria-expanded={why} aria-label="Why am I seeing this?" title="Why am I seeing this?" onClick={() => setWhy(!why)}><Icon name="info" size={19} /></button>
      </div>
      <p className="ofc-reason"><Icon name="spark" size={14} />{o.reason}</p>
      <p className="ofc-line">{o.line}</p>
      {o.pinned && o.goal && <p className="ofc-pinned"><Icon name="pin" size={14} />In your plan: {o.goal}</p>}
      {why && (
        <div className="ofc-whybox">
          <b>Why am I seeing this?</b>
          <ul>{o.used.map((u) => <li key={u.label}><span>{u.label}: {u.value}</span><span className="ofc-src">{u.from}</span></li>)}</ul>
          <p><b>Does Nordea earn from it?</b> {o.earns}</p>
          {o.note && <p className="ofc-note">{o.note}</p>}
          <p className="ofc-note">Change what Nora uses in What Nora knows.</p>
        </div>
      )}
      <div className="ofc-acts" role="group" aria-label={`Actions for ${o.title}`}>
        <Act icon="pin" label={o.pinned ? 'In my plan' : 'Add to my plan'} on={o.pinned} onClick={() => onAct(o, o.pinned ? 'unpin' : 'pin')} />
        <Act icon="chat" label="Ask Nora" onClick={() => onAsk(o)} />
        <Act icon="clock" label="Later" onClick={() => onAct(o, 'later')} />
        <Act icon="x" label="Not for me" onClick={() => onAct(o, 'hide')} />
      </div>
    </div>
  );
};

/** Offers for you. `skip`: offers already shown elsewhere (e.g. as Nora's "For you" card). */
export const OffersForYou: React.FC<{ userId: string; refreshKey: number; skip?: string[]; onAsk: (o: OfferView) => void; onToast: OfferToast }> = ({ userId, refreshKey, skip = [], onAsk, onToast }) => {
  const [list, setList] = useState<OfferView[] | null>(null);
  const [hiddenNow, setHiddenNow] = useState<OfferView | null>(null);
  const [reasonSent, setReasonSent] = useState(false);
  const load = () => fetchOffers(userId).then((d) => setList(d.offers)).catch(() => setList([]));
  useEffect(() => { load(); }, [userId, refreshKey]);

  const act = async (o: OfferView, a: OfferAction) => {
    try {
      const r = await offerAction(userId, o.id, a);
      setList(r.offers);
      const undo = (back: OfferAction) => async () => { const u = await offerAction(userId, o.id, back); setList(u.offers); if (back === 'unhide') setHiddenNow(null); };
      if (a === 'pin') onToast(`Added to your plan${r.goal ? `: ${r.goal}` : ''}`, undo('unpin'));
      if (a === 'unpin') onToast('Removed from your plan', undo('pin'));
      if (a === 'later') onToast(`Hidden until ${r.until ? new Date(r.until + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'next payday'}`, undo('unlater'));
      if (a === 'hide') { setHiddenNow(o); setReasonSent(false); onToast('Hidden', undo('unhide')); }
    } catch (e: any) { onToast(e?.message || 'That didn’t work. Try again.'); }
  };
  const reason = async (why: string) => {
    if (!hiddenNow) return;
    await offerAction(userId, hiddenNow.id, 'reason', why).catch(() => {});
    setReasonSent(true);
    window.setTimeout(() => setHiddenNow(null), 1600);
  };

  const shown = (list || []).filter((o) => !skip.includes(o.id)).slice(0, 3);
  if (!list || (!shown.length && !hiddenNow)) return null;
  return (
    <>
      <Band left="Offers for you" right={<span className="band-note">Picked from what you told Nora</span>} />
      {hiddenNow && (
        <div className="card ofc-hidden" role="status">
          {reasonSent ? <p>Thanks. Nora will use that.</p> : (
            <>
              <p>Hidden “{hiddenNow.title}”. Want to say why? (optional)</p>
              <div className="ab-chips">
                {['Already have it', 'Not now', 'Not interested'].map((w) => <button key={w} className="chip" onClick={() => reason(w)}>{w}</button>)}
              </div>
            </>
          )}
        </div>
      )}
      {shown.map((o) => <OfferCard key={o.id} o={o} onAct={act} onAsk={onAsk} />)}
    </>
  );
};
