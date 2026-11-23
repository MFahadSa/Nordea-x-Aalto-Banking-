// Offers for you (Home): a horizontal row of cards. Each card has the offer, one personal reason and three
// buttons: Details (what it is, why it fits, how to set it up, the official page), Not for me, Ask Nora.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchOffers, offerAction, type OfferAction, type OfferView } from '../services/aboutApi.js';
import { Icon } from '../ui/icons.js';
import { Band } from './Nordea.js';

export type OfferToast = (message: string, undo?: () => void) => void;

export const OfferCard: React.FC<{ o: OfferView; onDetails: (o: OfferView) => void; onHide: (o: OfferView) => void; onAsk: (o: OfferView) => void }> = ({ o, onDetails, onHide, onAsk }) => (
  <article className="offer-card" aria-label={o.title}>
    <h3>{o.title}</h3>
    <p className="ofc-reason"><Icon name="spark" size={14} />{o.reason}</p>
    <p className="ofc-line">{o.line}</p>
    <div className="ofc-acts">
      <button className="btn primary small" onClick={() => onDetails(o)}>Details</button>
      <button className="btn small" onClick={() => onAsk(o)}><Icon name="chat" size={15} />Ask Nora</button>
      <button className="btn link small ofc-no" onClick={() => onHide(o)}>Not for me</button>
    </div>
  </article>
);

/** Details: what it is, why it fits, how to set it up, and the official Nordea page when there is one. */
export const OfferSheet: React.FC<{ o: OfferView; onClose: () => void; onAsk: (o: OfferView) => void; onHide: (o: OfferView) => void }> = ({ o, onClose, onAsk, onHide }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const sheet = (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div className="sheet ofs" role="dialog" aria-modal="true" aria-label={o.title} onClick={(e) => e.stopPropagation()}>
        <div className="ofs-h">
          <h3>{o.title}</h3>
          <button className="ofs-x" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button>
        </div>
        <p className="ofs-about">{o.about}</p>
        <section>
          <h4>Why it fits you</h4>
          <p className="ofc-reason"><Icon name="spark" size={14} />{o.reason}</p>
          <ul className="ofs-used">{o.used.map((u) => <li key={u.label}><span>{u.label}: {u.value}</span><span className="ofc-src">{u.from}</span></li>)}</ul>
        </section>
        {o.steps.length > 0 && (
          <section>
            <h4>How to set it up</h4>
            <ol className="ofs-steps">{o.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </section>
        )}
        <section>
          <h4>Good to know</h4>
          <p className="ofs-small"><b>Does Nordea earn from it?</b> {o.earns}</p>
          {o.note && <p className="ofs-small">{o.note}</p>}
        </section>
        {o.url && (
          <a className="ofs-link" href={o.url} target="_blank" rel="noopener noreferrer">
            Read more on nordea.fi <Icon name="arrow" size={15} />
          </a>
        )}
        <div className="ofs-acts">
          <button className="btn primary" onClick={() => { onClose(); onAsk(o); }}><Icon name="chat" size={16} />Ask Nora about it</button>
          <button className="btn" onClick={() => { onClose(); onHide(o); }}>Not for me</button>
        </div>
        <p className="ofs-small muted">Change what Nora uses in Nora knows.</p>
      </div>
    </div>
  );
  const host = document.querySelector('.phone');
  return host ? createPortal(sheet, host) : sheet;
};

/** Offers for you. `skip`: offers already shown elsewhere (e.g. as Nora's "For you" card). */
export const OffersForYou: React.FC<{ userId: string; refreshKey: number; skip?: string[]; onAsk: (o: OfferView) => void; onToast: OfferToast }> = ({ userId, refreshKey, skip = [], onAsk, onToast }) => {
  const [list, setList] = useState<OfferView[] | null>(null);
  const [open, setOpen] = useState<OfferView | null>(null);
  const [hiddenNow, setHiddenNow] = useState<OfferView | null>(null);
  const [reasonSent, setReasonSent] = useState(false);
  useEffect(() => { fetchOffers(userId).then((d) => setList(d.offers)).catch(() => setList([])); }, [userId, refreshKey]);

  const act = async (o: OfferView, a: OfferAction) => {
    try {
      const r = await offerAction(userId, o.id, a);
      setList(r.offers);
      if (a === 'hide') {
        setHiddenNow(o); setReasonSent(false);
        onToast('Hidden', async () => { const u = await offerAction(userId, o.id, 'unhide'); setList(u.offers); setHiddenNow(null); });
      }
    } catch (e: any) { onToast(e?.message || 'That didn’t work. Try again.'); }
  };
  const hide = (o: OfferView) => act(o, 'hide');
  const reason = async (why: string) => {
    if (!hiddenNow) return;
    await offerAction(userId, hiddenNow.id, 'reason', why).catch(() => {});
    setReasonSent(true);
    window.setTimeout(() => setHiddenNow(null), 1600);
  };

  const shown = (list || []).filter((o) => !skip.includes(o.id)).slice(0, 5);
  if (!list || (!shown.length && !hiddenNow)) return null;
  return (
    <>
      <Band left="Offers for you" right={<span className="band-note">From Nordea, picked for you</span>} />
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
      {shown.length > 0 && (
        <div className="offer-row" role="list" aria-label="Offers for you">
          {shown.map((o) => <div role="listitem" key={o.id}><OfferCard o={o} onDetails={setOpen} onHide={hide} onAsk={onAsk} /></div>)}
        </div>
      )}
      {open && <OfferSheet o={open} onClose={() => setOpen(null)} onAsk={onAsk} onHide={hide} />}
    </>
  );
};
