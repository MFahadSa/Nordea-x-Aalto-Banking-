// "Add new info" in What Nora knows: one line for anything that changed, with suggestions to tap.
// Nora works out what it is (src/server/addInfo.ts) and shows it before anything is saved:
//  - a change to About you ("I got a raise…") updates that line;
//  - a goal, a life change, a preference or a fact is saved as a new item (with Undo);
//  - a goal without an amount or a date opens the goal form, already filled in;
//  - private topics are never saved.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { saveAbout } from '../services/aboutApi.js';
import { Icon } from '../ui/icons.js';
import type { AboutView, FieldKey } from '../aboutParts.js';

type Draft = { type: 'goal' | 'life_event' | 'preference' | 'fact'; title: string; detail: string; goalType?: string; target?: { amount: number; date: string } };
type Understood =
  | { ok: true; draft: Draft; by: string }
  | { ok: true; about: { key: FieldKey; label: string; before: string; text: string }; by: string }
  | { ok: true; progress: { goalId: string; title: string; saved?: number; monthly?: number }; by: string }
  | { ok: false; reason: 'private' | 'empty'; message: string }
  | { ok: false; reason: 'goal_details'; message: string; title: string; goalType?: string };

const KIND: Record<Draft['type'], string> = { goal: 'Goal', life_event: 'Life change', preference: 'Preference', fact: 'Note' };
const when = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const eur = (n: number) => `${Math.round(n).toLocaleString('fi-FI')} €`;

export const AddInfoSheet: React.FC<{
  userId: string;
  onClose: () => void;
  /** Saved as a new item (Undo through the token), or About you was updated (the new view). */
  onSaved: (message: string, result: { undoToken?: string; about?: AboutView; points?: number }) => void;
  /** A goal that needs an amount and a date: the goal form, filled in. */
  onGoalForm: (title: string, goalType?: string) => void;
}> = ({ userId, onClose, onSaved, onGoalForm }) => {
  const [text, setText] = useState('');
  const [tips, setTips] = useState<string[]>([]);
  const [res, setRes] = useState<Understood | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const [earn, setEarn] = useState<{ points: { new: number; progress: number; about: number; perDay: number }; infoLeftToday: number } | null>(null);

  useEffect(() => {
    fetch(`/api/info/suggestions?userId=${encodeURIComponent(userId)}`).then((r) => r.json()).then((d) => setTips(d.suggestions || [])).catch(() => setTips([]));
    fetch(`/api/info/earn?userId=${encodeURIComponent(userId)}`).then((r) => r.json()).then(setEarn).catch(() => setEarn(null));
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [userId]);

  // A suggestion starts the sentence; the first "…" is selected, so typing fills it in.
  const pick = (t: string) => {
    setText(t); setRes(null); setErr('');
    requestAnimationFrame(() => { const el = input.current; if (!el) return; el.focus(); const i = t.indexOf('…'); if (i >= 0) el.setSelectionRange(i, i + 1); });
  };

  const check = async () => {
    if (/…/.test(text)) { setErr('Fill in the … parts first.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/info/understand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, text }) });
      setRes(await r.json());
    } catch { setErr('That didn’t work. Try again.'); } finally { setBusy(false); }
  };

  // Points for this save (the server checks it is real, new and within today's limit).
  const claim = async (kind: 'new' | 'progress' | 'about', id: string): Promise<number> => {
    try {
      const r = await fetch('/api/info/reward', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, kind, id }) });
      return (await r.json()).points || 0;
    } catch { return 0; }
  };
  const plus = (n: number) => (n ? ` · +${n} points` : '');
  const worth = !res || !res.ok ? 0 : 'draft' in res ? earn?.points.new ?? 0 : 'progress' in res ? earn?.points.progress ?? 0 : earn?.points.about ?? 0;
  const save = async () => {
    if (!res || !res.ok) return;
    setBusy(true); setErr('');
    try {
      if ('progress' in res) {
        const g = res.progress;
        const r = await fetch(`/api/cabinet/${encodeURIComponent(g.goalId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          progress: { ...(g.saved !== undefined ? { saved: g.saved } : {}), ...(g.monthly !== undefined ? { monthly: g.monthly } : {}), at: new Date().toISOString() },
        }) });
        if (!r.ok) throw new Error();
        const j = await r.json();
        const pts = await claim('progress', g.goalId);
        onSaved(`Updated your goal: ${g.title}${plus(pts)}`, { undoToken: j.undoToken, points: pts });
      } else if ('about' in res) {
        const v = await saveAbout(userId, { [res.about.key]: { values: [], text: res.about.text, asIs: true } });
        const pts = await claim('about', res.about.key);
        onSaved(`Updated in About you: ${res.about.label}${plus(pts)}`, { about: v, points: pts });
      } else {
        const d = res.draft;
        const r = await fetch('/api/cabinet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          userId, type: d.type, title: d.title, detail: d.detail, goalType: d.goalType, target: d.target, source: 'customer',
          readableBy: { abel: true, offers: d.type === 'goal' },
        }) });
        if (!r.ok) throw new Error();
        const j = await r.json();
        const pts = await claim('new', j.entry?.id);
        onSaved(`📌 Nora will remember: ${d.title}${plus(pts)}`, { undoToken: j.undoToken, points: pts });
      }
      onClose();
    } catch { setErr('That didn’t work. Try again.'); } finally { setBusy(false); }
  };

  const sheet = (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div className="sheet ofs ai-sheet" role="dialog" aria-modal="true" aria-label="Add new info" onClick={(e) => e.stopPropagation()}>
        <div className="ofs-h">
          <h3>What’s new?</h3>
          <button className="ofs-x" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button>
        </div>
        <p className="ofs-small">Something changed, or a new plan? Tell Nora in your own words, and she updates what she knows.</p>
        {earn && (
          <p className="ai-earn"><Icon name="star" size={15} />
            {earn.infoLeftToday > 0
              ? <span><b>+{earn.points.new} points</b> for each new thing, +{earn.points.progress} for an update · {earn.infoLeftToday} left today</span>
              : <span>You’ve earned today’s points for updates. Thanks! Saving still works.</span>}
          </p>
        )}
        <textarea ref={input} className="ai-input" rows={2} value={text} autoFocus placeholder="E.g. I got a raise, my salary is now 4 200 €"
          onChange={(e) => { setText(e.target.value); setRes(null); setErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim() && !busy) check(); } }} aria-label="What should Nora know?" />
        {!res && tips.length > 0 && (
          <div className="ai-tips" role="group" aria-label="Suggestions">
            {tips.map((t) => <button key={t} className="chip" onClick={() => pick(t)}>{t}</button>)}
          </div>
        )}

        {res && res.ok && 'about' in res && (
          <div className="ai-res">
            <span className="ai-kind"><Icon name="person" size={14} />Updates About you · {res.about.label}</span>
            {res.about.before && <span className="ai-before">{res.about.before}</span>}
            <b>{res.about.text}</b>
          </div>
        )}
        {res && res.ok && 'progress' in res && (
          <div className="ai-res">
            <span className="ai-kind"><Icon name="star" size={14} />Updates your goal · {res.progress.title}</span>
            {res.progress.saved !== undefined && <b>Saved so far: {eur(res.progress.saved)}</b>}
            {res.progress.monthly !== undefined && <b>Each month: {eur(res.progress.monthly)}</b>}
          </div>
        )}
        {res && res.ok && 'draft' in res && (
          <div className="ai-res">
            <span className="ai-kind"><Icon name={res.draft.type === 'goal' ? 'star' : 'spark'} size={14} />New {KIND[res.draft.type].toLowerCase()}</span>
            <b>{res.draft.title}</b>
            {res.draft.target && <span>{eur(res.draft.target.amount)} by {when(res.draft.target.date)}</span>}
          </div>
        )}
        {res && !res.ok && (
          <div className={`ai-res ${res.reason === 'private' ? 'warn' : ''}`} role="status">
            <span>{res.message}</span>
            {res.reason === 'goal_details' && (
              <button className="btn small" onClick={() => { onClose(); onGoalForm(res.title, res.goalType); }}>Add the amount and date</button>
            )}
          </div>
        )}
        {err && <p className="ofs-small" role="alert" style={{ color: '#B3261E' }}>{err}</p>}

        <div className="ofs-acts">
          {res && res.ok ? (
            <>
              <button className="btn primary" disabled={busy} onClick={save}><Icon name="check" size={16} />{busy ? 'Saving…' : `Save${earn?.infoLeftToday && worth ? ` · +${worth} points` : ''}`}</button>
              <button className="btn" disabled={busy} onClick={() => { setRes(null); requestAnimationFrame(() => input.current?.focus()); }}>Change the wording</button>
            </>
          ) : (
            <button className="btn primary" disabled={busy || !text.trim()} onClick={check}>{busy ? 'Reading…' : 'Continue'}</button>
          )}
        </div>
        <p className="ofs-small muted">Nothing is saved until you tap Save. Private things like health are never kept.</p>
      </div>
    </div>
  );
  const host = document.querySelector('.phone');
  return host ? createPortal(sheet, host) : sheet;
};
