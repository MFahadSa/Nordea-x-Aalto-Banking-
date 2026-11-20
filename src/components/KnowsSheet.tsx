import React, { useEffect, useState } from 'react';
import type { EntryEvent } from '../types.js';
import {
  KnowsSummary, fetchKnowsSummary, fetchKnowsMarkdown, updateCabinetEntry, deleteCabinetEntry,
  editProfileField, removeProfileField, confirmObservation, fetchHistory,
} from '../services/api.js';
import { KnowsCard } from './KnowsCard.js';

// "See what Abel knows": everything in one place, three ways.
//  1. Card: the record card (what Abel uses, at a glance).
//  2. Audit: every item with where it came from, when, and whether Abel uses it; fix it right there.
//  3. .md: the whole thing as one Markdown file. The Profile part is editable and goes back through the
//     review preview; the rest is shown read-only (changed in the audit list, so nothing slips in unchecked).

type Item = KnowsSummary['items'][number];
const ORDER: [string, (i: Item) => boolean][] = [
  ['Profile', (i) => i.type === 'profile'], ['Goals', (i) => i.type === 'goal'], ['Life events', (i) => i.type === 'life_event'],
  ['Preferences', (i) => i.type === 'preference'], ['Money facts', (i) => i.type === 'fact'], ['Nordea noticed', (i) => i.type === 'observation'],
];
const small: React.CSSProperties = { fontSize: 12.5, color: 'var(--muted)', margin: 0 };
const field: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };
const WHO: Record<string, string> = { you: 'You', abel: 'Abel', nordea: 'Nordea' };

const origin = (i: Item) => (i.fromNordea ? 'Nordea noticed' : i.source === 'document' ? 'From a file' : 'You told us');
const state = (i: Item) =>
  i.status === 'disputed' ? 'Marked wrong · not used' : i.fromNordea && !i.reviewed ? 'Waiting for you · not used' : !i.abelUses ? 'Turned off · not used' : i.private ? 'Private · only Abel' : i.status === 'stale' ? 'Looks out of date' : 'In use';

const Row: React.FC<{ i: Item; userId: string; act: (fn: () => Promise<{ undoToken?: string } | unknown>, msg: string) => Promise<void> }> = ({ i, userId, act }) => {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [hist, setHist] = useState<EntryEvent[] | null>(null);
  const used = i.abelUses;
  return (
    <div className="row" data-testid="audit-row">
      <div className="row-main">
        <span className={`dotc ${i.fromNordea ? 'bank' : 'you'}`} />
        <div className="row-txt">
          <h4>{i.title}</h4>
          {i.detail && i.detail !== i.title && <p className={open ? '' : 'clamp1'}>{i.detail}</p>}
          <span className={`meta${used ? '' : ' warn'}`}>{origin(i)} · {i.at} · {state(i)}</span>
        </div>
        <button className="more" aria-expanded={open} aria-label={`${open ? 'Close' : 'Check'} ${i.title}`} onClick={() => setOpen(!open)}>{open ? '×' : '⋯'}</button>
      </div>
      {open && (
        <div className="row-opts" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          {i.why && <p style={small}><b>How do we know?</b> {i.why}</p>}
          {edit !== null && (
            <form onSubmit={async (e) => { e.preventDefault(); await act(() => editProfileField(userId, i.id, { value: edit }), 'Saved'); setEdit(null); }} style={{ display: 'flex', gap: 6 }}>
              <input style={field} value={edit} onChange={(e) => setEdit(e.target.value)} aria-label="New value" autoFocus />
              <button className="btn small primary" disabled={!edit.trim()}>Save</button>
            </form>
          )}
          <div className="wait-act">
            {i.type === 'profile' && edit === null && <button className="btn small" onClick={() => setEdit(i.detail)}>Edit</button>}
            {i.fromNordea && !i.reviewed && i.status !== 'disputed' && <button className="btn small primary" onClick={() => act(() => confirmObservation(userId, i.id), 'Confirmed. Abel will use it.')}>That’s right</button>}
            {i.fromNordea && i.status !== 'disputed' && <button className="btn small" onClick={() => act(() => updateCabinetEntry(i.id, { status: 'disputed' }), 'Marked as wrong. Abel won’t use it.')}>That’s wrong</button>}
            {i.status === 'disputed' && <button className="btn small" onClick={() => act(() => updateCabinetEntry(i.id, { status: 'active' }), 'Abel will use it again.')}>It’s right after all</button>}
            {!i.fromNordea && i.status !== 'disputed' && (
              <button className="toggle" aria-pressed={used} onClick={() => act(() => updateCabinetEntry(i.id, { readableBy: { abel: !used, offers: i.offers } }), used ? 'Abel won’t use it now.' : 'Abel will use it again.')}><span className="knob" />Abel uses it</button>
            )}
            <button className="btn small quiet" aria-expanded={!!hist} onClick={async () => setHist(hist ? null : await fetchHistory(userId, i.id).catch(() => []))}>{hist ? 'Hide history' : 'History'}</button>
            <button className="btn small quiet" onClick={() => act(() => (i.type === 'profile' ? removeProfileField(userId, i.id) : deleteCabinetEntry(i.id)), 'Removed. It’s kept in your history.')}>Remove</button>
          </div>
          {hist && (hist.length
            ? <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--muted)' }}>{hist.slice().reverse().map((h) => <li key={h.id}>{h.at.slice(0, 10)} · {WHO[h.by] || h.by} {h.action.replace('_', ' ')}{h.how ? ` · ${h.how}` : ''}</li>)}</ul>
            : <p style={small}>No changes recorded.</p>)}
        </div>
      )}
    </div>
  );
};

export const KnowsSheet: React.FC<{
  userId: string; onClose: () => void; onChanged: () => void;
  onToast: (message: string, undoToken?: string) => void; onReviewProfile: (text: string) => void;
}> = ({ userId, onClose, onChanged, onToast, onReviewProfile }) => {
  const [tab, setTab] = useState<'card' | 'md'>('card');
  const [data, setData] = useState<KnowsSummary | null>(null);
  const [md, setMd] = useState('');
  const [mdOrig, setMdOrig] = useState('');
  const [err, setErr] = useState('');
  const load = async () => {
    try {
      const [d, m] = await Promise.all([fetchKnowsSummary(userId), fetchKnowsMarkdown(userId)]);
      setData(d); setMd(m); setMdOrig(m);
    } catch (e: any) { setErr(e?.message || 'Could not load it'); }
  };
  useEffect(() => { load(); }, [userId]);
  const act = async (fn: () => Promise<any>, msg: string) => {
    try { const r = await fn(); onToast(msg, r?.undoToken); onChanged(); await load(); }
    catch (e: any) { onToast(e?.message || 'That didn’t work. Try again.'); }
  };
  const mark = '<!-- abel:read-only -->';
  const editable = md.split(mark)[0];
  const changed = editable.trim() !== mdOrig.split(mark)[0].trim();

  return (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div className="sheet" role="dialog" aria-label="What Abel knows" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto', gap: 12 }}>
        <div className="sec-title" style={{ padding: 0 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>What Abel knows about you</h3>
          <button className="btn small quiet" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="chips" role="tablist">
          <button role="tab" aria-selected={tab === 'card'} className={`chip ${tab === 'card' ? 'on' : ''}`} onClick={() => setTab('card')}>Card & check</button>
          <button role="tab" aria-selected={tab === 'md'} className={`chip ${tab === 'md' ? 'on' : ''}`} onClick={() => setTab('md')}>As a .md file</button>
        </div>
        {err && <p role="alert" style={{ color: 'var(--bad, #a4352c)', fontSize: 13, margin: 0 }}>{err}</p>}
        {!data ? <p style={small}>Loading…</p> : tab === 'card' ? (
          <>
            <KnowsCard data={data} />
            <p style={small}>Everything, one by one: where it came from, when, and whether Abel uses it. Tap ⋯ to fix it. Every change can be undone and stays in its history.</p>
            {ORDER.map(([name, has]) => {
              const items = data.items.filter(has);
              if (!items.length) return null;
              return (
                <div key={name} className="drawer">
                  <div className="drawer-h"><h3>{name}</h3><span className="kicker">{items.length}</span></div>
                  <div className="list">{items.map((i) => <Row key={i.id} i={i} userId={userId} act={act} />)}</div>
                </div>
              );
            })}
          </>
        ) : (
          <>
            <p style={small}>The whole of what Abel knows, as one file. Edit the <b>Profile</b> part (above the read-only line) and tap Review: you see every change before it’s saved. The rest is for reading; change it in “Card & check”.</p>
            <textarea style={{ ...field, minHeight: 360, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, lineHeight: 1.5 }}
              aria-label="What Abel knows, as Markdown" spellCheck={false} value={md}
              onChange={(e) => {
                // The read-only part can't be changed here: only the text above the line is kept.
                const v = e.target.value;
                const ro = mdOrig.includes(mark) ? mark + mdOrig.split(mark)[1] : '';
                setMd(v.includes(mark) ? v.split(mark)[0] + ro : v + (ro ? `\n${ro}` : ''));
              }} />
            <div className="wait-act">
              <button className="btn small primary" disabled={!changed} onClick={() => onReviewProfile(editable)}>Review my changes</button>
              <button className="btn small" disabled={!changed} onClick={() => setMd(mdOrig)}>Reset</button>
              <a className="btn small quiet" href={`/api/knows.md?userId=${encodeURIComponent(userId)}`} download="what-abel-knows.md">Download .md</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
