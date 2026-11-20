/**
 * v27: Abel's suggestions outside the chat.
 * - ForYou: the one Home card (a question to answer right there, or a suggestion to open in a chat).
 * - AdviceList: "Abel's suggestions" in What Abel knows, each opening "Why Abel suggested this".
 * - SuggestSettingSheet: how often Abel brings things up on Home by himself.
 * Everything on these cards was built by code on the server; nothing here is written by the AI.
 */
import React, { useState } from 'react';
import type { AdviceHistoryItem, AdviceView, MessageCard } from '../types.js';
import { Band, NRow } from './Nordea.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

const Shield = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="adv-shield">
    <path d="M12 3.5l7 3v5.5c0 4.2-3 7.4-7 8.5-4-1.1-7-4.3-7-8.5V6.5z" />
  </svg>
);

export interface WhyData {
  title: string;
  line?: string;
  reasons: { text: string; from: string }[];
  source?: { url: string; label: string };
  validFrom?: string;
  earns?: string;
  read?: number;
  answers?: { label: string; value: string }[];
}

/** "Why Abel suggested this": what it was based on, the rule and its source, what Nordea earns. */
export const WhySheet: React.FC<{ data: WhyData; actions?: React.ReactNode; onClose: () => void }> = ({ data, actions, onClose }) => (
  <div className="cf-bg" onClick={onClose}>
    <div className="cf-sheet adv-sheet" role="dialog" aria-modal="true" aria-label={`Why Abel suggested ${data.title}`} onClick={(e) => e.stopPropagation()}>
      <span className="kicker">Why Abel suggested this</span>
      <h3>{data.title}</h3>
      {data.line && <p className="cf-p">{data.line}</p>}
      {data.reasons.length > 0 && (
        <>
          <b className="adv-h">What it was based on</b>
          <ul className="adv-ul">
            {data.reasons.map((r, i) => <li key={i}>{r.text} <span className="adv-from">({r.from})</span></li>)}
          </ul>
        </>
      )}
      {data.answers && data.answers.length > 0 && (
        <>
          <b className="adv-h">Your answers</b>
          <ul className="adv-ul">{data.answers.map((a, i) => <li key={i}>{a.label}: {a.value}</li>)}</ul>
        </>
      )}
      {data.source && (
        <>
          <b className="adv-h">The rule</b>
          <p className="adv-p">
            {data.validFrom ? `In force from ${day(data.validFrom)} · ` : ''}
            <a href={data.source.url} target="_blank" rel="noopener noreferrer">{data.source.label}</a>
          </p>
        </>
      )}
      {data.earns && (
        <>
          <b className="adv-h">What Nordea earns</b>
          <p className="adv-p">{data.earns.replace(/^What Nordea earns: /, '').replace(/^./, (c) => c.toUpperCase())}</p>
        </>
      )}
      {data.read != null && <p className="adv-p adv-muted">Abel read {data.read} of your {data.read === 1 ? 'note' : 'notes'} for this check. Every read is listed in Who sees it.</p>}
      <div className="btns stack">
        {actions}
        <button className="btn quiet block" onClick={onClose}>Close</button>
      </div>
    </div>
  </div>
);

/** The one Home card. A question is answered right here; a suggestion opens in a chat with Abel. */
export const ForYou: React.FC<{
  card: MessageCard;
  busy: boolean;
  onAnswer: (value: string) => void;
  onShow: () => void;
  onNotNow: () => void;
}> = ({ card, busy, onAnswer, onShow, onNotNow }) => {
  const [date, setDate] = useState('');
  const [why, setWhy] = useState(false);
  const d = card.data || {};
  if (card.type === 'ask_fact') {
    return (
      <>
        <Band left="For you" />
        <div className="card adv-home" aria-busy={busy}>
          <span className="from bank">One question from Abel</span>
          <div>
            <h3>{d.question}</h3>
            <p>Your answer helps Abel check “{d.forTitle}” for you.</p>
          </div>
          {d.factType === 'date' ? (
            <div className="adv-hdate">
              <label className="adv-lab">
                <span>Date</span>
                <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} min="1950-01-01" onChange={(e) => setDate(e.target.value)} />
              </label>
              <div className="btns adv-eq">
                <button className="btn primary" disabled={busy || !date} onClick={() => onAnswer(date)}>Save</button>
                <button className="btn" disabled={busy} onClick={() => onAnswer('notSure')}>Not sure</button>
              </div>
            </div>
          ) : (
            <div className="btns adv-eq">
              <button className="btn" disabled={busy} onClick={() => onAnswer('no')}>No</button>
              <button className="btn" disabled={busy} onClick={() => onAnswer('yes')}>Yes</button>
              <button className="btn" disabled={busy} onClick={() => onAnswer('notSure')}>Not sure</button>
            </div>
          )}
          <p className="adv-note"><Shield /><span>Saved in What Abel knows, where you can change or delete it.</span></p>
        </div>
      </>
    );
  }
  return (
    <>
      <Band left="For you" />
      <div className="card adv-home" aria-busy={busy}>
        <span className="from bank">For you · {d.kindLabel}</span>
        <div>
          <h3>{card.title}</h3>
          <p>{d.message}</p>
        </div>
        <div className="btns adv-eq">
          <button className="btn primary" disabled={busy} onClick={onShow}>Show me</button>
          <button className="btn" disabled={busy} onClick={onNotNow}>Not now</button>
        </div>
        <button className="btn link adv-whybtn" onClick={() => setWhy(true)}>Why this?</button>
      </div>
      {why && (
        <WhySheet
          data={{ title: card.title || '', line: 'Abel picked this for you on Home.', reasons: d.reasons || [], source: d.source, validFrom: d.validFrom, earns: d.earns }}
          onClose={() => setWhy(false)}
        />
      )}
    </>
  );
};

/** "Abel's suggestions": what Abel suggested or asked, and what you did. */
export const AdviceList: React.FC<{ view: AdviceView; busy: boolean; onChange: (ruleId: string, what: 'allow' | 'forget') => void }> = ({ view, busy, onChange }) => {
  const [open, setOpen] = useState<string | null>(null);
  if (!view.history.length) return null;
  const it = view.history.find((h) => h.ruleId === open);
  return (
    <>
      <Band left="Abel’s suggestions" right={view.history.length} />
      <div className="ncard flat">
        {view.history.map((h) => <NRow key={h.ruleId} name={h.title} sub={h.status} onClick={() => setOpen(h.ruleId)} />)}
      </div>
      {it && <WhySheet data={whyOf(it)} onClose={() => setOpen(null)} actions={<>
        {it.can.includes('allow') && <button className="btn block" disabled={busy} onClick={() => { onChange(it.ruleId, 'allow'); setOpen(null); }}>{it.last === 'never' ? 'Allow it again' : 'Show it again'}</button>}
        {it.can.includes('forget') && <button className="btn block" disabled={busy} onClick={() => { onChange(it.ruleId, 'forget'); setOpen(null); }}>Change my answer</button>}
      </>} />}
    </>
  );
};

function whyOf(h: AdviceHistoryItem): WhyData {
  const where = h.why ? `${h.why.where === 'home' ? 'on Home' : 'in a chat'} on ${day(h.why.at)}` : '';
  return {
    title: h.title,
    line: h.why ? `Shown ${where}. ${h.status.split(' · ')[0]}.` : `${h.status}.`,
    reasons: h.why?.reasons || [],
    // Answers already show in the reasons when the suggestion was shown; otherwise list them here.
    answers: h.why?.reasons.length ? undefined : h.answers,
    source: h.why?.source,
    validFrom: h.why?.validFrom,
    earns: h.why?.earns,
    read: h.why?.read,
  };
}

const OPTIONS: { v: AdviceView['proactive']; name: string; sub: string }[] = [
  { v: 'ask', name: 'Only when I ask', sub: 'Nothing on Home, nothing out of the blue' },
  { v: 'sometimes', name: 'Now and then', sub: 'At most one a week, on Home' },
  { v: 'often', name: 'Whenever something fits', sub: 'Still one at a time, never the same twice in a month' },
];
export const proactiveName = (v: AdviceView['proactive'] | undefined) => OPTIONS.find((o) => o.v === (v || 'sometimes'))!.name;

/** Settings → Suggestions from Abel. A choice is saved as soon as it is tapped. */
export const SuggestSettingSheet: React.FC<{ value: AdviceView['proactive']; busy: boolean; onPick: (v: AdviceView['proactive']) => void; onClose: () => void }> = ({ value, busy, onPick, onClose }) => (
  <div className="cf-bg" onClick={onClose}>
    <div className="cf-sheet adv-sheet" role="dialog" aria-modal="true" aria-label="Suggestions from Abel" onClick={(e) => e.stopPropagation()}>
      <span className="kicker">Settings</span>
      <h3>Suggestions from Abel</h3>
      <p className="cf-p">When you ask Abel about something, he can always tell you what fits. This sets whether he also brings things up on his own.</p>
      <div className="ncard flat adv-opts" role="radiogroup" aria-label="How often">
        {OPTIONS.map((o) => (
          <button key={o.v} className="nrow2" role="radio" aria-checked={value === o.v} disabled={busy} onClick={() => onPick(o.v)}>
            <span className="n-l"><span className="n-name">{o.name}</span><span className="n-sub">{o.sub}</span></span>
            <span className={`adv-radio${value === o.v ? ' on' : ''}`} aria-hidden="true"><i /></span>
          </button>
        ))}
      </div>
      <p className="cf-p adv-small">Whatever you choose: no credit you didn’t ask for, nothing from private notes, and partner offers only if you allow them.</p>
      <div className="btns stack"><button className="btn primary block" onClick={onClose}>Done</button></div>
    </div>
  </div>
);
