// About you (what Nora knows, like Claude's memory), the onboarding, "Get more from Nora" and "Try Nora with this".
// Wording rule: talk about what the customer gets, never about how much the bank knows.
import React, { useEffect, useState } from 'react';
import { FIELDS, PARTS, QUESTIONS, type AboutView, type FieldKey, type FieldView } from '../aboutParts.js';
import { saveAbout, type Answers } from '../services/aboutApi.js';
import { Icon } from '../ui/icons.js';
import { Band } from './Nordea.js';

const sourceLabel = (f: FieldView) => (f.source === 'you' ? 'You told us' : f.source === 'nordea' ? (f.key === 'basics' ? 'Nordea knows' : 'Nordea knew · you confirmed') : '');
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const listOf = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] || '');

/** The source in words, as a small badge. */
const From: React.FC<{ text: string; you?: boolean }> = ({ text, you }) => (text ? <span className={`ab-from ${you ? 'you' : 'bank'}`}>{text}</span> : null);

/** Tap answers. Single choice saves on tap; several can be picked when the field allows it. */
const Chips: React.FC<{ f: FieldView | { options: string[]; multi: boolean }; picked: string[]; onChange: (v: string[]) => void; label: string }> = ({ f, picked, onChange, label }) => (
  <div className="ab-chips" role="group" aria-label={label}>
    {f.options.map((o) => {
      const on = picked.includes(o);
      return (
        <button key={o} className={`chip${on ? ' on' : ''}`} aria-pressed={on}
          onClick={() => onChange(f.multi ? (on ? picked.filter((x) => x !== o) : [...picked, o]) : on ? [] : [o])}>
          {on && <Icon name="check" size={14} strokeWidth={2.6} />}{o}
        </button>
      );
    })}
  </div>
);

// ---------------- Try Nora with this ----------------
/** Nora's first message, built from the answers, plus three questions to tap. */
export function introFor(view: AboutView, name: string): { text: string; suggestions: string[] } {
  const v = (k: FieldKey) => view.fields[k].values;
  const plans = v('plans');
  const PLAN: Record<string, string> = { 'A home': 'a home', Travel: 'travel', Studies: 'studies', Wedding: 'a wedding', Baby: 'a baby', Car: 'a car', 'A buffer': 'a safety buffer' };
  const risk = v('risk')[0];
  const want = plans.length ? `You’re planning for ${listOf(plans.map((p) => PLAN[p] || lower(p)))}` : 'Thanks for telling me a bit about yourself';
  const safe = risk === 'Keep it safe' ? ' and like to keep things safe' : risk === 'A little' ? ' and are OK with a little risk' : risk === 'Comfortable' ? ' and are comfortable with risk' : '';
  const so = [
    plans.length ? `keep an eye on ${plans.includes('A home') ? 'your home savings' : 'your plans'} and tell you if you fall behind` : '',
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
  if (ints.includes('Budgeting')) q.push('Where does my money go each month?');
  if (ints.includes('Pensions')) q.push('Am I saving enough for later?');
  q.push('What should I focus on this month?', 'Where does my money go each month?');
  return {
    text: `${want}${safe}, so ${so.length ? `I’ll ${listOf(so)}` : 'my suggestions will fit that'}. Here’s where I’d start:`,
    suggestions: [...new Set(q)].slice(0, 3),
  };
}

// ---------------- Get more from Nora (Home) ----------------
export const GetMoreCard: React.FC<{ view: AboutView | null; onStep: (step: FieldKey | 'confirm' | 'start') => void }> = ({ view, onStep }) => {
  if (!view) return null;
  const left = view.setup.filter((s) => !s.done);
  if (!left.length) return null; // done: the card goes away
  // More than one thing left: one button runs them all in a row (single items open straight away below).
  const none = left.length > 1;
  return (
    <section className="ncard getmore" aria-labelledby="gm-h">
      <div className="gm-head">
        <span className="gm-ic" aria-hidden="true"><Icon name="spark" /></span>
        <span className="gm-t">
          <h2 id="gm-h">Get more from Nora</h2>
          <span>{left.length === 1 ? '1 quick thing' : `${left.length} quick things`} · about a minute</span>
        </span>
        {none && <button className="btn small primary" onClick={() => onStep('start')}>Start</button>}
      </div>
      <ul className="gm-list">
        {view.setup.map((s) => (
          <li key={s.key}>
            {s.done ? (
              <span className="gm-item done"><span className="gm-tick" aria-hidden="true"><Icon name="check" size={14} strokeWidth={2.6} /></span>{s.doneText}</span>
            ) : (
              <button className="gm-item" onClick={() => onStep(s.step)}>
                <span className="gm-tick todo" aria-hidden="true" />{s.todoText}<Icon name="chev" size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

// ---------------- About you (What Nora knows) ----------------
export const AboutCard: React.FC<{
  userId: string; name: string; view: AboutView | null;
  onSaved: (v: AboutView, points: number) => void; onStart: () => void; onToast: (m: string) => void;
}> = ({ userId, name, view, onSaved, onStart, onToast }) => {
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState('');
  const [moneyText, setMoneyText] = useState<string | null>(null);
  useEffect(() => { setMore(view?.fields.more.text || ''); }, [view?.fields.more.text]);
  if (!view) return null;
  const save = async (answers: Answers, confirm: FieldKey[] = []) => {
    setBusy(true);
    try { const r = await saveAbout(userId, answers, confirm); onSaved(r, r.points); }
    catch (e: any) { onToast(e?.message || 'That didn’t work. Try again.'); }
    finally { setBusy(false); }
  };
  const open = view.setup.filter((s) => !s.done).length;

  const field = (k: FieldKey) => {
    const f = view.fields[k];
    if (k === 'basics') return (
      <div className="ab-field" key={k}>
        <span className="ab-v">{f.text || 'Not set yet'}</span>
        <From text={sourceLabel(f)} />
      </div>
    );
    if (k === 'more') return (
      <div className="ab-field" key={k}>
        <label className="sr" htmlFor="ab-more">Tell us more</label>
        <textarea id="ab-more" className="ab-text" rows={3} placeholder={`Anything else Nora should know, ${name}? E.g. “We’re saving for a wedding next summer.”`} value={more} onChange={(e) => setMore(e.target.value)} />
        <div className="ab-row">
          {f.source !== 'none' && <From text="You told us" you />}
          <button className="btn small primary" disabled={busy || more.trim() === (f.text || '')} onClick={() => save({ more: { values: [], text: more } })}>Save</button>
        </div>
      </div>
    );
    if (k === 'money') return (
      <div className="ab-field" key={k}>
        {f.source !== 'none' ? (
          <><span className="ab-v">{f.text}</span><From text={sourceLabel(f)} /></>
        ) : f.suggestion ? (
          <>
            <span className="ab-v">{f.suggestion.text}</span>
            <span className="ab-sug-from">{f.suggestion.from} · is this right?</span>
            {moneyText === null ? (
              <div className="ab-chips">
                <button className="chip sug" disabled={busy} onClick={() => save({}, ['money'])}><Icon name="check" size={14} strokeWidth={2.6} />Right</button>
                <button className="chip" onClick={() => setMoneyText(f.suggestion!.text)}>Change</button>
              </div>
            ) : (
              <div className="ab-row">
                <input className="ab-text one" aria-label="Your money habits" value={moneyText} onChange={(e) => setMoneyText(e.target.value)} />
                <button className="btn small primary" disabled={busy || !moneyText.trim()} onClick={() => { save({ money: { values: [], text: moneyText } }); setMoneyText(null); }}>Save</button>
              </div>
            )}
          </>
        ) : <span className="ab-v muted">Nothing yet</span>}
      </div>
    );
    // Tap answers. Nordea's pre-filled answer shows ticked and marked as a suggestion: one tap confirms it.
    const sug = f.source === 'none' ? f.suggestion : undefined;
    const base = f.values.length ? f.values : sug?.values || [];
    const many = PARTS.find((p) => p.fields.includes(k))!.fields.length > 1;
    return (
      <div className="ab-field" key={k}>
        {many && <span className="ab-flabel">{f.label}</span>}
        {sug && <span className="ab-sug-from">{sug.from}: {lower(sug.text)}. Is that right?</span>}
        <div className="ab-chips" role="group" aria-label={f.label}>
          {f.options.map((o) => {
            const on = base.includes(o);
            const next = f.multi ? (on ? base.filter((x) => x !== o) : [...base, o]) : on && !sug ? [] : [o];
            const confirmTap = !!sug && !f.multi && sug.values.includes(o);
            return (
              <button key={o} className={`chip${on ? (sug ? ' sug' : ' on') : ''}`} aria-pressed={on} disabled={busy}
                onClick={() => (confirmTap ? save({}, [k]) : save({ [k]: { values: next } }))}>
                {on && <Icon name="check" size={14} strokeWidth={2.6} />}{o}
              </button>
            );
          })}
        </div>
        {sug && f.multi && <button className="btn small ab-confirm" disabled={busy} onClick={() => save({}, [k])}><Icon name="check" size={15} />Yes, that’s right</button>}
        {f.source !== 'none' && <From text={sourceLabel(f)} you={f.source === 'you'} />}
      </div>
    );
  };

  return (
    <>
      <Band left="About you" right={<button className="btn link band-act" aria-expanded={edit} onClick={() => setEdit(!edit)}>{edit ? 'Done' : 'Edit'}</button>} />
      <div className="ncard ab-card">
        <p className="about-p">{view.paragraph}</p>
        {open > 0 && !edit && (
          <button className="ab-start" onClick={onStart}>
            <span className="ab-start-ic" aria-hidden="true"><Icon name="spark" /></span>
            <span className="ab-start-t"><b>Help Nora help you</b><span>5 quick taps, about a minute. Skip any of it.</span></span>
            <Icon name="chev" size={18} />
          </button>
        )}
        {edit && (
          <div className="ab-parts">
            {PARTS.map((p) => (
              <div className="ab-part" key={p.id}>
                <h3>{p.label}</h3>
                {p.fields.map(field)}
              </div>
            ))}
            <p className="hint">Only what you choose is saved. Remove anything any time.</p>
          </div>
        )}
      </div>
    </>
  );
};

// ---------------- Onboarding ----------------
type Step = 'intro' | 'confirm' | FieldKey | 'summary';
const ORDER: Step[] = ['intro', 'confirm', ...QUESTIONS.map((q) => q.field), 'summary'];

export const Onboarding: React.FC<{
  userId: string; name: string; view: AboutView; start: Step;
  onSaved: (v: AboutView, points: number) => void; onClose: () => void; onTry: (v: AboutView) => void;
}> = ({ userId, name, view: first, start, onSaved, onClose, onTry }) => {
  const [view, setView] = useState(first);
  const [step, setStep] = useState<Step>(start);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [points, setPoints] = useState(0);
  // Confirm step: per field, 'right' or a changed answer.
  // Only what Nordea's data says. Plans and risk come pre-filled in their own questions.
  const confirmable = (['work', 'home', 'money'] as FieldKey[]).filter((k) => view.fields[k].source === 'none' && view.fields[k].suggestion);
  const [checks, setChecks] = useState<Partial<Record<FieldKey, 'right' | string[]>>>({});
  const [picks, setPicks] = useState<Partial<Record<FieldKey, string[]>>>(() => Object.fromEntries(QUESTIONS.map((q) => [q.field, first.fields[q.field].values.length ? first.fields[q.field].values : first.fields[q.field].suggestion?.values || []])));
  const [extra, setExtra] = useState<Partial<Record<FieldKey, string>>>({});
  const idx = ORDER.indexOf(step);
  const go = (d: number) => { setErr(null); setStep(ORDER[Math.max(0, Math.min(ORDER.length - 1, idx + d))]); };

  const saveThen = async (answers: Answers, confirm: FieldKey[]) => {
    if (!Object.keys(answers).length && !confirm.length) return go(1);
    setBusy(true);
    try {
      const r = await saveAbout(userId, answers, confirm);
      setView(r); setPoints((p) => p + r.points); onSaved(r, r.points);
      go(1);
    } catch (e: any) { setErr(e?.message || 'That didn’t work. Try again.'); } finally { setBusy(false); }
  };
  const next = () => {
    if (step === 'confirm') {
      const confirm = confirmable.filter((k) => checks[k] === 'right');
      const answers: Answers = {};
      for (const k of confirmable) { const c = checks[k]; if (Array.isArray(c) && c.length) answers[k] = { values: c }; }
      return saveThen(answers, confirm);
    }
    if (step !== 'intro' && step !== 'summary') {
      const k = step as FieldKey;
      const vals = picks[k] || [];
      const same = JSON.stringify(vals) === JSON.stringify(view.fields[k].values) && !extra[k];
      return same ? go(1) : saveThen({ [k]: { values: vals, ...(extra[k] ? { text: extra[k] } : {}) } }, []);
    }
    go(1);
  };

  const q = QUESTIONS.find((x) => x.field === step);
  const dots = ORDER.slice(1, -1);
  const used = (['work', 'home', 'people', 'money', 'plans', 'interests', 'risk', 'mainUse'] as FieldKey[]).filter((k) => view.fields[k].source !== 'none');

  return (
    <div className="ob" role="dialog" aria-label="Help Nora help you">
      <div className="ob-top">
        {idx > 0 && step !== 'summary' ? <button className="ob-back" onClick={() => go(-1)} aria-label="Back"><Icon name="back" /></button> : <span className="ob-back" />}
        {step !== 'intro' && step !== 'summary' ? (
          <div className="ob-dots" aria-label={`Step ${idx} of ${dots.length}`}>{dots.map((d, i) => <i key={d} className={i < idx ? 'on' : ''} />)}</div>
        ) : <span />}
        <button className="ob-x" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
      </div>

      <div className="ob-body">
        {step === 'intro' && (
          <div className="ob-intro">
            <span className="ob-art" aria-hidden="true"><Icon name="spark" /></span>
            <h1>Help Nora help you</h1>
            <p>5 quick taps, about a minute. You can skip any of it.</p>
            <ul className="ob-gets">
              <li><Icon name="check" size={16} strokeWidth={2.6} />See if you’re on track for your plans</li>
              <li><Icon name="check" size={16} strokeWidth={2.6} />Tips and offers that fit you, no spam</li>
              <li><Icon name="check" size={16} strokeWidth={2.6} />Nothing you’d be uneasy with</li>
            </ul>
            <p className="ob-small">You decide what’s saved, and can change it any time in What Nora knows. You also get a few points in Rewards.</p>
          </div>
        )}

        {step === 'confirm' && (
          <>
            <h2>Here’s what we already know. Is it right?</h2>
            <p className="ob-value">One tap each. Nora only uses what you confirm.</p>
            {confirmable.length === 0 && <p className="ob-value">All checked. Nothing to confirm.</p>}
            {confirmable.map((k) => {
              const f = view.fields[k];
              const c = checks[k];
              return (
                <div className="ob-conf" key={k}>
                  <span className="ob-conf-l">{f.label}</span>
                  <b>{f.suggestion!.text}</b>
                  <span className="ab-sug-from">{f.suggestion!.from}</span>
                  <div className="ab-chips">
                    <button className={`chip${c === 'right' ? ' on' : ''}`} aria-pressed={c === 'right'} onClick={() => setChecks({ ...checks, [k]: c === 'right' ? undefined : 'right' })}>
                      <Icon name="check" size={14} strokeWidth={2.6} />Right
                    </button>
                    {f.options.length > 0 && (
                      <button className={`chip${Array.isArray(c) ? ' on' : ''}`} aria-pressed={Array.isArray(c)} onClick={() => setChecks({ ...checks, [k]: Array.isArray(c) ? undefined : [] })}>Change</button>
                    )}
                  </div>
                  {Array.isArray(c) && <Chips f={f} picked={c} onChange={(v) => setChecks({ ...checks, [k]: v })} label={f.label} />}
                </div>
              );
            })}
          </>
        )}

        {q && (
          <>
            <h2>{q.title}</h2>
            <p className="ob-value"><Icon name="spark" size={15} />{q.value}</p>
            <Chips f={FIELDS[q.field]} picked={picks[q.field] || []} onChange={(v) => setPicks({ ...picks, [q.field]: v })} label={q.title} />
            {(q.field === 'plans' || q.field === 'interests') && (
              <>
                <label className="pf-l" htmlFor="ob-extra">Something else? (optional)</label>
                <input id="ob-extra" className="ab-text one" value={extra[q.field] || ''} onChange={(e) => setExtra({ ...extra, [q.field]: e.target.value })} placeholder={q.field === 'plans' ? 'E.g. a new job next year' : 'E.g. saving for my kids'} />
              </>
            )}
            {FIELDS[q.field].multi && <p className="ob-small">Pick as many as you like.</p>}
          </>
        )}

        {step === 'summary' && (
          <div className="ob-sum">
            <span className="ob-art ok" aria-hidden="true"><Icon name="check" /></span>
            <h1>All set, {name}</h1>
            <p>Nora will use this to help you:</p>
            <ul className="ob-sum-l">
              {used.map((k) => <li key={k}><span>{view.fields[k].label}</span><b>{view.fields[k].text}</b></li>)}
              {!used.length && <li><b>Nothing yet. That’s fine: you can add things any time.</b></li>}
            </ul>
            {points > 0 && <p className="ob-small">+{points} points in Rewards.</p>}
          </div>
        )}
        {err && <p className="ob-err">{err}</p>}
      </div>

      <div className="ob-foot">
        {step === 'intro' && (<><button className="btn primary block" onClick={() => go(1)}>Start</button><button className="btn quiet block" onClick={onClose}>Not now</button></>)}
        {step !== 'intro' && step !== 'summary' && (
          <div className="ob-nav">
            <button className="btn quiet" onClick={() => go(1)} disabled={busy}>Skip</button>
            <button className="btn primary" onClick={next} disabled={busy}>{busy ? 'Saving…' : 'Next'}</button>
          </div>
        )}
        {step === 'summary' && (<><button className="btn primary block" onClick={() => onTry(view)}><Icon name="spark" size={18} />Try Nora with this</button><button className="btn quiet block" onClick={onClose}>Done</button></>)}
      </div>
    </div>
  );
};
