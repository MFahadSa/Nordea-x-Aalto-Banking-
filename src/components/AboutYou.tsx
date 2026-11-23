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
type Ask = { kind: 'check'; key: FieldKey; label: string; text: string } | { kind: 'question'; key: FieldKey; title: string; value: string };

/** One question at a time, inside the card. Nothing pops up: a tap answers it and the next one appears.
 *  Nordea's data comes first ("Is this right?"): Yes / Not right (type what's right) / Skip for now.
 *  Answered questions never come back; skipped ones come back next time. */
export const AboutCard: React.FC<{ userId: string; view: AboutView | null; onSeeNora: () => void; onSaved: (v: AboutView) => void; onRewards: () => void }> = ({ userId, view, onSeeNora, onSaved, onRewards }) => {
  const [skipped, setSkipped] = useState<FieldKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [earned, setEarned] = useState(0);
  const [fixing, setFixing] = useState<string | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  if (!view) return null;
  const asks: Ask[] = [
    ...view.bank.filter((l) => view.fields[l.key].source === 'none').map((l) => ({ kind: 'check' as const, key: l.key, label: l.label, text: l.text })),
    ...QUESTIONS.filter((q) => view.fields[q.field].source === 'none').map((q) => ({ kind: 'question' as const, key: q.field, title: q.title, value: q.value })),
  ];
  const open = asks.filter((a) => !skipped.includes(a.key));
  const cur = open[0];
  const total = asks.length + (view.incentive.remaining === 0 ? 0 : 0);
  const pos = asks.length - open.length + 1;
  const f = cur ? FIELDS[cur.key] : null;
  const initial = cur && cur.kind === 'question' ? view.fields[cur.key].suggestion?.values || [] : [];
  const sel = picks.length || chosen ? picks : initial;

  const save = async (answers: Parameters<typeof saveAbout>[1], confirm: FieldKey[] = []) => {
    setBusy(true); setErr(null);
    try {
      const r = await saveAbout(userId, answers, confirm);
      setEarned((n) => n + r.points); setFixing(null); setPicks([]); setChosen(null);
      onSaved(r);
    } catch (e: any) { setErr(e?.message || 'That didn’t work. Try again.'); } finally { setBusy(false); }
  };
  const skip = () => { if (cur) { setSkipped([...skipped, cur.key]); setFixing(null); setPicks([]); setChosen(null); } };
  const tapOne = (o: string) => {
    if (!cur || busy) return;
    setChosen(o); setPicks([o]);
    window.setTimeout(() => save({ [cur.key]: { values: [o] } }), 280); // a beat to show the tick, then the next question
  };
  const toggle = (o: string) => { setChosen('multi'); setPicks(sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o]); };
  const mine = (Object.keys(view.fields) as FieldKey[]).filter((k) => k !== 'basics' && view.fields[k].source !== 'none').length;

  return (
    <>
      <Band left="About you" />
      <div className="ncard ab-card">
        <p className="about-p">{view.paragraph}</p>
        <p className="ab-srcline">
          <span className="ab-dot bank" />From your Nordea data
          {mine > 0 && <><span className="ab-dot you" />{mine} {mine === 1 ? 'answer' : 'answers'} from you</>}
        </p>
        <button className="btn block ab-try" onClick={onSeeNora}><Icon name="spark" size={18} />See how Nora can help you</button>

        {cur && f ? (
          <div className="ab-value">
            {pos === 1 && !earned ? (
              <>
                <b className="ab-value-h">Answer {open.length} quick {open.length === 1 ? 'question' : 'questions'} and get:</b>
                <div className="ab-gain">
                  <span className="ab-gain-ic pts" aria-hidden="true"><Icon name="star" /></span>
                  <span><b>+{view.incentive.points} points</b>{view.incentive.rewardLine && <> · {view.incentive.rewardLine}</>}</span>
                </div>
                <div className="ab-gain">
                  <span className="ab-gain-ic adv" aria-hidden="true"><Icon name="spark" /></span>
                  <span><b>Advice made for you</b>, like:<ul>{view.incentive.teasers.map((t) => <li key={t}>{t}</li>)}</ul></span>
                </div>
              </>
            ) : (
              <div className="ab-qhead"><span>Question {pos} of {total}</span>{earned > 0 && <span className="ob-pts">+{earned} points</span>}</div>
            )}

            <div className="ab-q" key={cur.key}>
              {cur.kind === 'check' ? (
                <>
                  <span className="ab-q-l">Is this right? · {cur.label}</span>
                  <b className="ab-q-t">{cur.text}</b>
                  <span className="ab-q-from"><span className="ab-dot bank" />From your Nordea data</span>
                  {fixing === cur.key ? (
                    <>
                      <label className="sr" htmlFor="ab-fix">What’s right?</label>
                      <input id="ab-fix" className="ab-text one" autoFocus placeholder="What’s right? E.g. “Works part-time”" onChange={(e) => setPicks([e.target.value])} />
                      <div className="ab-q-btns">
                        <button className="btn small primary" disabled={busy || !(picks[0] || '').trim()} onClick={() => save({ [cur.key]: { values: [], text: picks[0] } })}>Save · +5</button>
                        <button className="btn small quiet" onClick={skip}>Skip for now</button>
                      </div>
                    </>
                  ) : (
                    <div className="ab-q-btns">
                      <button className="btn small primary" disabled={busy} onClick={() => save({}, [cur.key])}><Icon name="check" size={15} strokeWidth={2.6} />Yes, that’s right · +5</button>
                      <button className="btn small" disabled={busy} onClick={() => { setFixing(cur.key); setPicks([]); }}>Not right</button>
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
                        <button key={o} className={`chip${on ? ' on' : ''}`} aria-pressed={on} disabled={busy}
                          onClick={() => (f.multi ? toggle(o) : tapOne(o))}>
                          {on && <Icon name="check" size={14} strokeWidth={2.6} />}{o}
                        </button>
                      );
                    })}
                  </div>
                  <div className="ab-q-btns">
                    {f.multi && <button className="btn small primary" disabled={busy || !sel.length} onClick={() => save({ [cur.key]: { values: sel } })}>Save · +5</button>}
                    <button className="btn small quiet" disabled={busy} onClick={skip}>Skip</button>
                    {f.multi && <span className="ab-q-hint">Pick as many as you like</span>}
                  </div>
                </>
              )}
            </div>
            {err && <p className="ob-err">{err}</p>}
          </div>
        ) : asks.length && skipped.length ? (
          <p className="ab-done">
            {earned > 0 && <b>+{earned} points. </b>}{skipped.length} skipped for now.
            <button className="btn link" onClick={() => setSkipped([])}>Answer them now</button>
          </p>
        ) : (
          <p className="ab-done">
            <Icon name="check" size={16} strokeWidth={2.6} />
            {earned > 0 ? <>Thanks! +{earned} points. <button className="btn link" onClick={onRewards}>See Rewards</button></> : 'Nora has what she needs.'}
          </p>
        )}
      </div>
    </>
  );
};
