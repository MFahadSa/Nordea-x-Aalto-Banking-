// About you (what Nora knows), the answer flow, the Home prompt and "Try Nora with this".
// Kept deliberately simple: one paragraph, one "Try Nora with this", one clear reason to add answers,
// one button. Answers are given in a short flow: one question per screen, a tap moves on by itself.
// Wording rule: talk about what the customer gets, never about how much the bank knows.
import React, { useState } from 'react';
import { FIELDS, QUESTIONS, type AboutView, type FieldKey, mergeCorrection } from '../aboutParts.js';
import { saveAbout } from '../services/aboutApi.js';
import { Icon } from '../ui/icons.js';
import { Band } from './Nordea.js';

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const listOf = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] || '');

// ---------------- Try Nora with this ----------------
/** Nora's first message, built from what she knows, plus three questions to tap. */
export function introFor(view: AboutView): { text: string; suggestions: string[] } {
  const v = (k: FieldKey) => view.fields[k].values;
  const plans = v('plans');
  const PLAN: Record<string, string> = { 'A home': 'a home', Travel: 'travel', Studies: 'studies', Wedding: 'a wedding', Baby: 'a baby', Car: 'a car', 'A buffer': 'a safety buffer' };
  const risk = v('risk')[0];
  const want = plans.length ? `You’re planning for ${listOf(plans.map((p) => PLAN[p] || lower(p)))}` : 'I’ve looked at your accounts';
  const safe = risk === 'Keep it safe' ? ' and like to keep things safe' : risk === 'A little' ? ' and are OK with a little risk' : risk === 'Comfortable' ? ' and are comfortable with risk' : '';
  const so = [
    plans.length ? `keep an eye on ${plans.includes('A home') ? 'your home savings' : 'your plans'} and tell you if you fall behind` : 'help with what you ask',
    risk === 'Keep it safe' ? 'only suggest safe options' : '',
    v('style')[0] === 'Short answers' ? 'keep my answers short' : '',
  ].filter(Boolean);
  const q: string[] = [];
  if (plans.includes('A home')) q.push('Am I on track for my home?');
  if (plans.includes('Travel')) q.push('How much should I put aside for travel each month?');
  if (plans.includes('Wedding')) q.push('How do I save for a wedding next to my other plans?');
  if (plans.includes('A buffer')) q.push('How big should my safety buffer be?');
  const ints = v('interests');
  if (ints.includes('Investing basics')) q.push(risk === 'Keep it safe' ? 'What are the safest ways to start investing?' : 'How do I start investing with little money?');
  if (ints.includes('Taxes')) q.push('Which tax deductions could I use?');
  if (ints.includes('Pensions')) q.push('Am I saving enough for later?');
  q.push('Where does my money go each month?', 'What should I focus on this month?');
  return { text: `${want}${safe}, so I’ll ${listOf(so)}. Here’s where I’d start:`, suggestions: [...new Set(q)].slice(0, 3) };
}

// ---------------- The reason to add answers (shared by Home and What Nora knows) ----------------
const ValueBox: React.FC<{ view: AboutView; onAdd: () => void; compact?: boolean }> = ({ view, onAdd, compact }) => {
  const i = view.incentive;
  return (
    <div className={`ab-value${compact ? ' compact' : ''}`}>
      <b className="ab-value-h">Answer {i.remaining} quick {i.remaining === 1 ? 'question' : 'questions'} and get:</b>
      <div className="ab-gain">
        <span className="ab-gain-ic pts" aria-hidden="true"><Icon name="star" /></span>
        <span><b>+{i.points} points</b>{i.rewardLine && <> · {i.rewardLine}</>}</span>
      </div>
      <div className="ab-gain">
        <span className="ab-gain-ic adv" aria-hidden="true"><Icon name="spark" /></span>
        <span><b>Advice made for you</b>, like:
          <ul>{i.teasers.slice(0, compact ? 2 : 3).map((t) => <li key={t}>{t}</li>)}</ul>
        </span>
      </div>
      <button className="btn primary block" onClick={onAdd}><Icon name="plus" size={18} />Add your answers · 1 min</button>
    </div>
  );
};

/** Home: the same offer, in one card. Gone once everything is answered. */
export const GetMoreCard: React.FC<{ view: AboutView | null; onAdd: () => void }> = ({ view, onAdd }) => {
  if (!view || view.incentive.remaining === 0) return null;
  return (
    <section className="ncard getmore" aria-label="Get more from Nora">
      <ValueBox view={view} onAdd={onAdd} compact />
    </section>
  );
};

// ---------------- About you (top of What Nora knows) ----------------
type Ask = { kind: 'check'; key: FieldKey; label: string; text: string } | { kind: 'question'; key: FieldKey; title: string; value: string };
const EDITABLE: FieldKey[] = ['work', 'home', 'money', 'plans', 'interests', 'risk', 'mainUse'];

/** One question at a time, inside the card. Pick, then Save (every question has a Save button).
 *  Nordea's data comes first ("Is this right?"): Yes / Not right (type what's right) / Skip.
 *  Answered questions never come back; skipped ones can be answered later. Edit changes any answer.
 *  The question area keeps the same height, so the page doesn't jump between questions. */
export const AboutCard: React.FC<{ userId: string; view: AboutView | null; onSeeNora: () => void; onSaved: (v: AboutView) => void; onRewards: () => void }> = ({ userId, view, onSeeNora, onSaved, onRewards }) => {
  const [skipped, setSkipped] = useState<FieldKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [earned, setEarned] = useState(0);
  const [fixing, setFixing] = useState(false);
  const [text, setText] = useState('');
  const [picks, setPicks] = useState<string[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [editKey, setEditKey] = useState<FieldKey | null>(null);
  // Answered in this visit: keeps "Question 3 of 7" counting up while answered questions drop out.
  const [answered, setAnswered] = useState(0);
  // The questions start with a Start button, so the first screen is the reason, not a form.
  const [started, setStarted] = useState(false);
  if (!view) return null;
  const QS = Object.fromEntries(QUESTIONS.map((q) => [q.field, q]));
  const askFor = (k: FieldKey): Ask => {
    const b = view.bank.find((l) => l.key === k);
    return QS[k] ? { kind: 'question', key: k, title: QS[k].title, value: QS[k].value } : { kind: 'check', key: k, label: FIELDS[k].label, text: (view.fields[k].source !== 'none' && view.fields[k].text) || b?.text || view.fields[k].text };
  };
  const asks: Ask[] = [
    ...view.bank.filter((l) => view.fields[l.key].source === 'none').map((l) => askFor(l.key)),
    ...QUESTIONS.filter((q) => view.fields[q.field].source === 'none').map((q) => askFor(q.field)),
  ];
  const open = asks.filter((a) => !skipped.includes(a.key));
  const cur: Ask | undefined = editKey ? askFor(editKey) : open[0];
  const f = cur ? FIELDS[cur.key] : null;
  const current = cur ? (view.fields[cur.key].values.length ? view.fields[cur.key].values : view.fields[cur.key].suggestion?.values || []) : [];
  const sel = picks ?? current;
  const pos = answered + skipped.length + 1;
  const total = answered + asks.length;
  const reset = () => { setFixing(false); setText(''); setPicks(null); setErr(null); };

  const save = async (answers: Parameters<typeof saveAbout>[1], confirm: FieldKey[] = []) => {
    setBusy(true); setErr(null);
    try {
      const r = await saveAbout(userId, answers, confirm);
      setEarned((n) => n + r.points); reset();
      if (!editKey) setAnswered((n) => n + 1);
      if (editKey) setEditKey(null);
      onSaved(r);
    } catch (e: any) { setErr(e?.message || 'That didn’t work. Try again.'); } finally { setBusy(false); }
  };
  const skip = () => { if (cur) { if (editKey) setEditKey(null); else setSkipped([...skipped, cur.key]); reset(); } };
  const tap = (o: string) => { if (!f) return; setPicks(f.multi ? (sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o]) : [o]); };
  const mine = (Object.keys(view.fields) as FieldKey[]).filter((k) => k !== 'basics' && view.fields[k].source !== 'none').length;
  const fresh = cur && !editKey && view.fields[cur.key].source === 'none';

  // The question (or the correction), with its buttons. Same box for answering and for editing.
  const question = cur && f && (
    <div className="ab-q" key={`${cur.key}-${editKey ? 'edit' : 'ask'}`}>
      <span className="ab-q-l">{editKey ? `Change: ${FIELDS[cur.key].label}` : `Question ${pos} of ${total}`}{earned > 0 && !editKey && <span className="ob-pts">+{earned} points</span>}</span>
      {cur.kind === 'check' ? (
        <>
          <b className="ab-q-t">{editKey ? 'What should Nora know?' : 'Is this right?'}</b>
          <span className="ab-q-fact">{cur.text}</span>
          <span className="ab-q-from"><span className={`ab-dot ${view.fields[cur.key].source === 'you' ? 'you' : 'bank'}`} />{view.fields[cur.key].source === 'you' ? 'You told us' : 'From your Nordea data'}</span>
          {fixing || editKey ? (
            <>
              <label className="sr" htmlFor="ab-fix">What’s right?</label>
              <input id="ab-fix" className="ab-text one" autoFocus placeholder="Just the part that changed, e.g. “4 000 €” or “paid on the 15th”" value={text} onChange={(e) => setText(e.target.value)} />
              {text.trim() && mergeCorrection(cur.text, text) !== text.trim().replace(/[.]+$/, '') && (
                <span className="ab-q-preview" aria-live="polite"><Icon name="check" size={14} />Nora will save: {mergeCorrection(cur.text, text)}</span>
              )}
              <div className="ab-q-btns">
                <button className="btn small primary" disabled={busy || !text.trim()} onClick={() => save({ [cur.key]: { values: [], text } })}>Save{fresh ? ' · +5' : ''}</button>
                <button className="btn small quiet" onClick={skip}>{editKey ? 'Cancel' : 'Skip for now'}</button>
              </div>
            </>
          ) : (
            <div className="ab-q-btns">
              <button className="btn small primary" disabled={busy} onClick={() => save({}, [cur.key])}><Icon name="check" size={15} strokeWidth={2.6} />Yes, that’s right · +5</button>
              <button className="btn small" disabled={busy} onClick={() => setFixing(true)}>Not right</button>
              <button className="btn small quiet" disabled={busy} onClick={skip}>Skip</button>
            </div>
          )}
        </>
      ) : (
        <>
          <b className="ab-q-t">{cur.title}</b>
          <span className="ab-q-v"><Icon name="spark" size={14} />{cur.value}</span>
          <div className="ab-chips" role="group" aria-label={cur.title}>
            {f.options.map((o) => {
              const on = sel.includes(o);
              return (
                <button key={o} className={`chip${on ? ' on' : ''}`} aria-pressed={on} disabled={busy} onClick={() => tap(o)}>
                  {on && <Icon name="check" size={14} strokeWidth={2.6} />}{o}
                </button>
              );
            })}
          </div>
          <span className="ab-q-hint">{f.multi ? 'Pick as many as you like, then Save.' : 'Pick one, then Save.'}</span>
          <div className="ab-q-btns">
            <button className="btn small primary" disabled={busy || !sel.length} onClick={() => save({ [cur.key]: { values: sel } })}>{busy ? 'Saving…' : `Save${fresh ? ' · +5' : ''}`}</button>
            <button className="btn small quiet" disabled={busy} onClick={skip}>{editKey ? 'Cancel' : 'Skip'}</button>
          </div>
        </>
      )}
      {err && <p className="ob-err">{err}</p>}
    </div>
  );

  return (
    <>
      <Band left="About you" right={<button className="btn link band-act" aria-expanded={editing} onClick={() => { setEditing(!editing); setEditKey(null); reset(); }}><Icon name="sliders" size={15} />{editing ? 'Done' : 'Edit'}</button>} />
      <div className="ncard ab-card">
        <p className="about-p">{view.paragraph}</p>
        <p className="ab-srcline">
          <span className="ab-dot bank" />From your Nordea data
          {mine > 0 && <><span className="ab-dot you" />{mine} {mine === 1 ? 'answer' : 'answers'} from you</>}
        </p>

        {editing ? (
          // Edit: every answer in one list; Change opens it in the same box.
          editKey ? question : (
            <div className="ab-edit">
              {EDITABLE.map((k) => {
                const fv = view.fields[k];
                const shownText = fv.text || view.bank.find((l) => l.key === k)?.text || '';
                return (
                  <div className="ab-edit-row" key={k}>
                    <span className="ab-edit-t"><span>{FIELDS[k].label}</span><b>{shownText || 'Not set yet'}</b></span>
                    <button className="btn small" onClick={() => { reset(); setEditKey(k); }}>{shownText ? 'Change' : 'Add'}</button>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <>
            <button className="btn block ab-try" onClick={onSeeNora}><Icon name="spark" size={18} />See how Nora can help you</button>
            {cur && f ? (
              <div className="ab-value">
                {/* The reason stays the same while answering, so the box doesn't change size. */}
                <b className="ab-value-h">{started || answered > 0 ? `${open.length} quick ${open.length === 1 ? 'question' : 'questions'} left. Answer them and get:` : `Answer ${open.length} quick ${open.length === 1 ? 'question' : 'questions'} and get:`}</b>
                <div className="ab-gain">
                  <span className="ab-gain-ic pts" aria-hidden="true"><Icon name="star" /></span>
                  <span><b>+{view.incentive.points} points</b>{view.incentive.rewardLine && <> · {view.incentive.rewardLine}</>}</span>
                </div>
                <div className="ab-gain">
                  <span className="ab-gain-ic adv" aria-hidden="true"><Icon name="spark" /></span>
                  <span><b>Advice made for you</b>, like:<ul>{view.incentive.teasers.map((t) => <li key={t}>{t}</li>)}</ul></span>
                </div>
                {started || answered > 0 ? question : (
                  <button className="btn primary block ab-start-btn" onClick={() => setStarted(true)}><Icon name="spark" size={18} />Start · about a minute</button>
                )}
              </div>
            ) : (
              <div className="ab-reward">
                <span className="ab-gain-ic pts" aria-hidden="true"><Icon name="star" /></span>
                <span className="ab-reward-t">
                  <b>{earned > 0 ? `Thanks! +${earned} points` : 'Nora has what she needs'}</b>
                  <span>You have {view.incentive.have} points.{skipped.length > 0 && ` ${skipped.length} skipped for now.`}</span>
                </span>
                <span className="ab-reward-b">
                  <button className="btn small primary" onClick={onRewards}>See your rewards</button>
                  {skipped.length > 0 && <button className="btn small" onClick={() => setSkipped([])}>Answer the rest</button>}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};
