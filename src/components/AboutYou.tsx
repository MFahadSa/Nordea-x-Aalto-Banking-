// About you (what Nora knows), the answer flow, the Home prompt and "Try Nora with this".
// Kept deliberately simple: one paragraph, one "Try Nora with this", one clear reason to add answers,
// one button. Answers are given in a short flow: one question per screen, a tap moves on by itself.
// Wording rule: talk about what the customer gets, never about how much the bank knows.
import React, { useState } from 'react';
import { FIELDS, QUESTIONS, type AboutView, type FieldKey } from '../aboutParts.js';
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
export const AboutCard: React.FC<{ view: AboutView | null; onTry: () => void; onAdd: () => void }> = ({ view, onTry, onAdd }) => {
  if (!view) return null;
  const mine = (['people', 'plans', 'interests', 'risk', 'style', 'mainUse', 'more'] as FieldKey[]).filter((k) => view.fields[k].source === 'you').length
    + (['work', 'home', 'money'] as FieldKey[]).filter((k) => view.fields[k].source !== 'none').length;
  return (
    <>
      <Band left="About you" />
      <div className="ncard ab-card">
        <p className="about-p">{view.paragraph}</p>
        <p className="ab-srcline">
          <span className="ab-dot bank" />From your Nordea data
          {mine > 0 && <><span className="ab-dot you" />{mine} {mine === 1 ? 'answer' : 'answers'} from you</>}
        </p>
        <button className="btn block ab-try" onClick={onTry}><Icon name="spark" size={18} />Try Nora with this</button>
        {view.incentive.remaining > 0 ? (
          <ValueBox view={view} onAdd={onAdd} />
        ) : (
          <p className="ab-done"><Icon name="check" size={16} strokeWidth={2.6} />Nora has what she needs. <button className="btn link" onClick={onAdd}>Change your answers</button></p>
        )}
      </div>
    </>
  );
};

// ---------------- The answer flow ----------------
type Step = 'confirm' | FieldKey | 'summary';

export const Onboarding: React.FC<{
  userId: string; name: string; view: AboutView; start?: FieldKey;
  onSaved: (v: AboutView) => void; onClose: () => void; onTry: (v: AboutView) => void; onRewards: () => void;
}> = ({ userId, name, view: first, start, onSaved, onClose, onTry, onRewards }) => {
  // Confirm only what Nordea's data shows and the customer hasn't confirmed yet; then the questions.
  // Fixed when the flow opens: saving an answer refreshes the data, but the steps must not shift under the customer.
  const [toConfirm] = useState(() => first.bank.filter((l) => first.fields[l.key].source === 'none'));
  const [steps] = useState<Step[]>(() => [...(toConfirm.length ? ['confirm' as Step] : []), ...QUESTIONS.map((q) => q.field), 'summary']);
  const [view, setView] = useState(first);
  const [i, setI] = useState(Math.max(0, start ? steps.indexOf(start) : 0));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [earned, setEarned] = useState(0);
  const [wrong, setWrong] = useState<FieldKey[]>([]);
  const [picks, setPicks] = useState<Partial<Record<FieldKey, string[]>>>(() =>
    Object.fromEntries(QUESTIONS.map((q) => [q.field, first.fields[q.field].values.length ? first.fields[q.field].values : first.fields[q.field].suggestion?.values || []])));
  const step = steps[i];
  const total = steps.length - 1;
  const next = () => { setErr(null); setI((n) => Math.min(steps.length - 1, n + 1)); };

  const save = async (answers: Parameters<typeof saveAbout>[1], confirm: FieldKey[] = []) => {
    setBusy(true);
    try {
      const r = await saveAbout(userId, answers, confirm);
      setView(r); setEarned((p) => p + r.points); onSaved(r);
      next();
    } catch (e: any) { setErr(e?.message || 'That didn’t work. Try again.'); } finally { setBusy(false); }
  };
  const q = QUESTIONS.find((x) => x.field === step);
  const f = q ? FIELDS[q.field] : null;
  const picked = q ? picks[q.field] || [] : [];
  // One choice: the tap is the answer, so it moves on by itself (a short beat to show the tick).
  const tap = (o: string) => {
    if (!q || !f || busy) return;
    if (f.multi) { setPicks({ ...picks, [q.field]: picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o] }); return; }
    setPicks({ ...picks, [q.field]: [o] });
    setBusy(true);
    window.setTimeout(() => { setBusy(false); save({ [q.field]: { values: [o] } }); }, 320);
  };
  const i2 = view.incentive;

  return (
    <div className="ob" role="dialog" aria-label="Add your answers">
      <div className="ob-top">
        {i > 0 && step !== 'summary' ? <button className="ob-back" onClick={() => setI(i - 1)} aria-label="Back"><Icon name="back" /></button> : <span className="ob-back" />}
        {step !== 'summary' ? <span className="ob-count">{i + 1} of {total}{earned > 0 && <span className="ob-pts">+{earned} points</span>}</span> : <span />}
        <button className="ob-x" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
      </div>
      {step !== 'summary' && <div className="ob-bar"><i style={{ width: `${(i / total) * 100}%` }} /></div>}

      <div className="ob-body">
        {step === 'confirm' && (
          <>
            <h2>Is this right?</h2>
            <p className="ob-value"><Icon name="star" size={15} />+{toConfirm.length * 5} points for checking it</p>
            <p className="ob-sub">From your Nordea data. Nora uses only what you confirm.</p>
            <ul className="ob-facts">
              {toConfirm.map((l) => {
                const off = wrong.includes(l.key);
                return (
                  <li key={l.key} className={off ? 'off' : ''}>
                    <span className="ob-fact-ic" aria-hidden="true"><Icon name={off ? 'x' : 'check'} size={15} strokeWidth={2.6} /></span>
                    <span className="ob-fact-t"><span>{l.label}</span><b>{l.text}</b></span>
                    <button className="btn link small" onClick={() => setWrong(off ? wrong.filter((k) => k !== l.key) : [...wrong, l.key])}>{off ? 'Undo' : 'Not right'}</button>
                  </li>
                );
              })}
            </ul>
            {wrong.length > 0 && <p className="ob-sub">Nora won’t use what you marked. You can tell her what’s right in a chat.</p>}
          </>
        )}

        {q && f && (
          <>
            <h2>{q.title}</h2>
            <p className="ob-value"><Icon name="spark" size={15} />{q.value}</p>
            <div className="ob-opts" role="group" aria-label={q.title}>
              {f.options.map((o) => {
                const on = picked.includes(o);
                return (
                  <button key={o} className={`ob-opt${on ? ' on' : ''}`} aria-pressed={on} disabled={busy && !f.multi} onClick={() => tap(o)}>
                    <span>{o}</span>
                    <span className="ob-opt-ck" aria-hidden="true">{on && <Icon name="check" size={16} strokeWidth={2.8} />}</span>
                  </button>
                );
              })}
            </div>
            <p className="ob-sub">{f.multi ? 'Pick as many as you like.' : 'Tap one to continue.'}</p>
          </>
        )}

        {step === 'summary' && (
          <div className="ob-sum">
            <span className="ob-art ok" aria-hidden="true"><Icon name="check" /></span>
            <h1>Thanks, {name}!</h1>
            {earned > 0 && (
              <button className="ob-reward" onClick={onRewards}>
                <span className="ab-gain-ic pts" aria-hidden="true"><Icon name="star" /></span>
                <span><b>+{earned} points</b> · you now have {i2.have}<br /><span>See what you can get in Rewards</span></span>
                <Icon name="chev" size={18} />
              </button>
            )}
            <p>Nora now gives you advice that fits your plans. Try it:</p>
            <div className="ob-tries">
              {introFor(view).suggestions.map((t) => (
                <button key={t} className="ob-tryq" onClick={() => onTry(view)}><Icon name="chat" size={16} />{t}</button>
              ))}
            </div>
          </div>
        )}
        {err && <p className="ob-err">{err}</p>}
      </div>

      <div className="ob-foot">
        {step === 'confirm' && (
          <div className="ob-nav">
            <button className="btn quiet" onClick={next} disabled={busy}>Skip</button>
            <button className="btn primary" disabled={busy || wrong.length === toConfirm.length}
              onClick={() => save({}, toConfirm.map((l) => l.key).filter((k) => !wrong.includes(k)))}>
              {busy ? 'Saving…' : wrong.length ? 'Confirm the rest' : 'Yes, that’s right'}
            </button>
          </div>
        )}
        {q && f && (
          <div className="ob-nav">
            <button className="btn quiet" onClick={next} disabled={busy}>Skip</button>
            {f.multi && (
              <button className="btn primary" disabled={busy || !picked.length} onClick={() => save({ [q.field]: { values: picked } })}>
                {busy ? 'Saving…' : view.fields[q.field].source === 'none' ? 'Continue · +5 points' : 'Continue'}
              </button>
            )}
          </div>
        )}
        {step === 'summary' && (
          <>
            <button className="btn primary block" onClick={() => onTry(view)}><Icon name="spark" size={18} />Try Nora with this</button>
            <button className="btn quiet block" onClick={onClose}>Done</button>
          </>
        )}
      </div>
    </div>
  );
};
