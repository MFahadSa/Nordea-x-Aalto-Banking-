/**
 * "Add new info" in What Nora knows: the customer types one line ("We're moving to Espoo in March") and
 * Nora works out what it is (a goal, a life change, a preference or a fact) before it is saved.
 *
 * - The AI reads the line and returns a short title and type; rules decide when there is no AI.
 * - Nothing is invented: an amount or a date is kept only if it is in the customer's words.
 * - Private topics (health, relationships, religion…) are never saved (More → Memory).
 * - Suggestions to tap are picked from what Nora doesn't know yet (About you, goals, notes).
 * Saving itself goes through the usual POST /api/cabinet, so Undo, history and the gateway apply.
 */
import type { Express, Request } from 'express';
import { db } from './db.js';
import * as fin from './finance.js';
import { getProvider } from './llm.js';
import { isSensitiveTopic } from './sensitive.js';
import { aboutView, smartCorrection } from './aboutYou.js';
import type { FieldKey } from '../aboutParts.js';

type InfoType = 'goal' | 'life_event' | 'preference' | 'fact';
export interface InfoDraft {
  type: InfoType; title: string; detail: string;
  goalType?: 'home' | 'car' | 'travel' | 'buffer' | 'other';
  target?: { amount: number; date: string };
}
export type Understood =
  | { ok: true; draft: InfoDraft; by: 'ai' | 'rules' }
  /** Progress on a goal: what they have saved, or put in each month (for goals not linked to an account). */
  | { ok: true; progress: { goalId: string; title: string; saved?: number; monthly?: number }; by: 'rules' }
  /** A change to something About you already says: that line is updated, not a second note added. */
  | { ok: true; about: { key: FieldKey; label: string; before: string; text: string }; by: 'ai' | 'rules' }
  | { ok: false; reason: 'private' | 'empty'; message: string }
  | { ok: false; reason: 'goal_details'; message: string; title: string; goalType: InfoDraft['goalType'] };

const uidOf = (req: Request) => String((req.method === 'GET' ? req.query.userId : req.body?.userId) || 'lauri');
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Amounts written in the line: "3000", "3 000 €", "3k", "30,000". */
export function amountsIn(text: string): number[] {
  return [...text.matchAll(/(\d[\d\s.,]*\d|\d)\s*(k\b)?/gi)]
    .map((m) => Number(m[1].replace(/\s/g, '').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')) * (m[2] ? 1000 : 1))
    .filter((n) => n >= 10 && !(n >= 1900 && n <= 2100));
}

/** A date in the line ("by June 2027", "next summer", "in March"), as the last day of that month. Never in the past. */
export function dateIn(text: string, today = fin.DEMO_TODAY): string | undefined {
  const t = text.toLowerCase();
  const y0 = Number(today.slice(0, 4)), m0 = Number(today.slice(5, 7));
  const end = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const mi = MONTHS.findIndex((m) => new RegExp(`\\b${m.slice(0, 3)}[a-z]*\\b`).test(t));
  const year = t.match(/\b(20\d\d)\b/);
  if (mi >= 0) {
    let y = year ? Number(year[1]) : y0;
    if (!year && mi + 1 < m0) y++;
    return end(y, mi + 1);
  }
  if (year) return end(Number(year[1]), 12);
  const inN = t.match(/\bin (\d{1,2}) (month|year)s?\b/);
  if (inN) { const n = Number(inN[1]) * (inN[2] === 'year' ? 12 : 1); const m = m0 - 1 + n; return end(y0 + Math.floor(m / 12), (m % 12) + 1); }
  if (/\bnext year\b/.test(t)) return end(y0 + 1, 12);
  if (/\bnext summer\b|\bthis summer\b/.test(t)) return end(m0 > 8 || /next/.test(t) && m0 > 5 ? y0 + 1 : y0, 8);
  return undefined;
}

const GOAL = /\b(save|saving|saving up|put aside|goal|buy|buying|afford|fund|deposit|down payment|trip|holiday|vacation|travel|car|flat|apartment|house|home|wedding|buffer|emergency)\b/i;
const LIFE = /\b(mov(e|ing)|moved|new job|started|start(ing)? (a |my )?(job|studies|school)|graduat\w*|retir\w*|wedding|getting married|married|engaged|baby|kids?|child|promot\w*|laid off|quit|lost my job|salary|raise|pay ?rise|studies|exchange|semester)\b/i;
const PREF = /\b(prefer|i like|i don'?t like|i'd rather|always|never|rather|low[- ]risk|no risk|safe|ethical|sustainable|esg|short answers|more detail)\b/i;
const goalTypeOf = (t: string): InfoDraft['goalType'] =>
  /\b(flat|apartment|house|home|deposit|down payment)\b/i.test(t) ? 'home'
  : /\bcar\b/i.test(t) ? 'car'
  : /\b(trip|holiday|vacation|travel|journey)\b/i.test(t) ? 'travel'
  : /\b(buffer|emergency|rainy day)\b/i.test(t) ? 'buffer' : 'other';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const shortTitle = (t: string) => {
  let x = t.replace(/^(i'?m|i am|we'?re|we are|i|we)\s+/i, '').replace(/^(want|would like|plan|need|hope)( to)?\s+/i, '').replace(/[.!]+$/, '').replace(/\s+(of|for|to|by|in|about)\s*$/i, '').trim();
  if (/^prefer\b/i.test(x)) x = x.replace(/^prefer/i, 'prefers');
  return cap(x).slice(0, 70);
};

/**
 * A line that changes what About you says NOW (not a plan): new pay, a new job, moved, now owns.
 * "We're moving in March" is a plan (a life change), not an update yet.
 */
const ABOUT_NOW: { key: FieldKey; re: RegExp }[] = [
  { key: 'work', re: /\b(got a (raise|pay ?rise|promotion)|(my )?(new )?salary is|i (now )?earn|i make|got (a|the) (new )?job|started (a |my )?(new )?job|i work as|i'?m (now )?working as|lost my job|got laid off|i'?m unemployed|i retired|i graduated|i'?m (now )?a student|i (now )?study)\b/i },
  { key: 'home', re: /\b(i (have )?moved|we (have )?moved|my rent is|our rent is|rent (went|goes) up|i (now )?own|we (now )?own|bought (a|my|our) (flat|home|house|apartment)|i live with|we live with|moved in with|moved back)\b/i },
  { key: 'money', re: /\b(i (now )?save|i'?m saving \d|i don'?t save|i stopped saving|i spend (most|a lot)|i now spend)\b/i },
];

/** Rules: used when there is no AI, and as the floor under the AI's answer. */
function byRules(text: string): Understood {
  const t = text.trim();
  const amounts = amountsIn(t);
  const date = dateIn(t);
  const wantsGoal = GOAL.test(t) && (/\b(save|saving|put aside|goal|fund|afford|buy|buying)\b/i.test(t) || amounts.length > 0);
  if (wantsGoal && !LIFE.test(t.replace(/\b(trip|holiday|travel)\b/gi, '')) || wantsGoal && amounts.length) {
    const goalType = goalTypeOf(t);
    const title = shortTitle(t.replace(/\b(by|before|in|until)\b.*$/i, '').replace(/\b(a|per|each|every) month\b|\bmonthly\b/gi, '').replace(/\b(about|around|roughly)?\s*\d[\d\s.,]*\s*(k\b|€|eur(os?)?\b)?/gi, '').replace(/\s{2,}/g, ' ')) || 'Savings goal';
    if (!amounts.length || !date) return { ok: false, reason: 'goal_details', title, goalType,
      message: `To track it as a goal, Nora needs ${!amounts.length && !date ? 'an amount and a date' : !amounts.length ? 'an amount' : 'a date'}.` };
    return { ok: true, by: 'rules', draft: { type: 'goal', title, detail: t, goalType, target: { amount: amounts[0], date } } };
  }
  const type: InfoType = PREF.test(t) ? 'preference' : LIFE.test(t) ? 'life_event' : 'fact';
  return { ok: true, by: 'rules', draft: { type, title: shortTitle(t), detail: t } };
}

/** What the customer's line is, ready to save. The AI words it; rules check it. */
export async function understandInfo(text: string, userId?: string): Promise<Understood> {
  const t = String(text || '').trim().slice(0, 300);
  if (!t) return { ok: false, reason: 'empty', message: 'Type what Nora should know.' };
  if (isSensitiveTopic(t)) return { ok: false, reason: 'private', message: 'Nora doesn’t keep private things like health, relationships or religion. Leave that out, and add the money part if there is one.' };
  // Progress on a goal they already have ("I've saved 800 € for Japan", "I put 150 € a month into it").
  const prog = userId ? goalProgressIn(userId, t) : null;
  if (prog) return { ok: true, by: 'rules', progress: prog };
  // Something changed in what About you already says: update that line (the same smart correction as "Not right").
  // A goal ("I'm saving 5 000 € for a car by August 2027") is never a money-habit update: the goal wording wins.
  const goalLike = GOAL.test(t) && (!!dateIn(t) || /\b(for|towards)\b[^.]*\b(by|before|until)\b/i.test(t) || /\b(save|saving|saved|putting? (aside|away))\b[^.]*\b(for|towards)\b/i.test(t));
  const now = userId && !goalLike ? ABOUT_NOW.find((a) => a.re.test(t)) : undefined;
  if (userId && now) {
    const v = aboutView(userId);
    const f = v.fields[now.key];
    const before = f.text || (f.removed ? '' : v.bank.find((b) => b.key === now.key)?.text || '');
    const r = before ? await smartCorrection(now.key, before, t) : { text: shortTitle(t), by: 'rules' as const };
    return { ok: true, by: r.by, about: { key: now.key, label: f.label, before, text: r.text } };
  }
  const rules = byRules(t);
  const p = getProvider();
  if (!p.isConfigured()) return rules;
  try {
    const r = await p.step({
      system: [
        'A bank customer adds one line to what their bank assistant knows about them. Work out what it is.',
        'type: goal (something they save money towards), life_event (a change in their life: moving, new job, studies, a baby, a wedding), preference (how they like things: risk, ethics, how they want answers) or fact (anything else about their money or situation).',
        'title: at most 8 words, plain, in their language, third person or neutral, no name. detail: their line, lightly cleaned.',
        'For a goal: targetAmount and targetDate (YYYY-MM-DD) ONLY if they said them; never guess.',
        'Answer only with the understand tool.',
      ].join('\n'),
      turns: [{ role: 'user', text: `Today is ${fin.DEMO_TODAY}. Line: ${t}` }],
      tools: [{ name: 'understand', description: 'What the line is.', parameters: { type: 'object', properties: {
        type: { type: 'string', enum: ['goal', 'life_event', 'preference', 'fact'] }, title: { type: 'string' }, detail: { type: 'string' },
        goalType: { type: 'string', enum: ['home', 'car', 'travel', 'buffer', 'other'] }, targetAmount: { type: 'number' }, targetDate: { type: 'string' },
      }, required: ['type', 'title'] } }],
      temperature: 0, timeoutMs: 9000, maxWaitMs: 9000,
    });
    const a = r.calls.find((c) => c.name === 'understand')?.args;
    if (!a?.title || !['goal', 'life_event', 'preference', 'fact'].includes(a.type)) return rules;
    const title = String(a.title).trim().slice(0, 70);
    const digits = (x: string) => (x.match(/\d[\d\s.,]*/g) || []).map((d) => d.replace(/[\s.,]/g, ''));
    if (digits(title).some((d) => !digits(t).includes(d))) return rules; // a number they didn't say
    if (a.type === 'goal') {
      // Amount and date: only what the line says (checked here, not left to the AI).
      const amount = amountsIn(t).find((n) => Math.abs(n - Number(a.targetAmount)) < 1) ?? amountsIn(t)[0];
      const date = dateIn(t);
      const goalType = ['home', 'car', 'travel', 'buffer', 'other'].includes(a.goalType) ? a.goalType : goalTypeOf(t);
      if (!amount || !date) return { ok: false, reason: 'goal_details', title, goalType,
        message: `To track it as a goal, Nora needs ${!amount && !date ? 'an amount and a date' : !amount ? 'an amount' : 'a date'}.` };
      return { ok: true, by: 'ai', draft: { type: 'goal', title, detail: t, goalType, target: { amount, date } } };
    }
    return { ok: true, by: 'ai', draft: { type: a.type, title, detail: String(a.detail || t).slice(0, 200) } };
  } catch {
    return rules;
  }
}

const PROGRESS = /\b(i'?ve|i have|we'?ve|we have|i'?d|already)\s+(already\s+)?(saved|put (aside|away))\b|\bsaved so far\b|\bso far\b.*\bsaved\b|\b(put|putting|add|adding|save|saving|move|moving)\b[^.]*\b(a|per|each|every) month\b|\bmonthly\b/i;
const COMMON = new Set(['save', 'saving', 'saved', 'goal', 'for', 'the', 'and', 'with', 'my', 'our', 'a', 'to', 'by', 'buy', 'trip', 'fund', 'month']);
/** Money that is never goal progress, whatever the sentence also says: rent, salary, bills and other obligations. */
const NOT_GOAL_MONEY = /\b(rent|rents|salary|salaries|wages?|income|paycheck|bills?|mortgage|electricity|heating|phone|internet|insurance|subscriptions?|spotify|netflix|loan|loans|invoice|invoices|groceries|expenses?)\b/i;
const wordsOf = (x: string) => new Set((x.toLowerCase().match(/[a-zåäö]{3,}/g) || []).filter((w) => !COMMON.has(w)));
const AMOUNT = /(\d[\d\s.,]*\d|\d)\s*(k\b)?\s*(€|eur(?:os?)?\b)?/gi;
const num = (m: RegExpMatchArray) => Number(m[1].replace(/\s/g, '').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')) * (m[2] ? 1000 : 1);

/** "I've saved 800 € for the Japan trip, and I put 150 € a month in": which goal, and the two amounts. */
export function goalProgressIn(userId: string, text: string): { goalId: string; title: string; saved?: number; monthly?: number } | null {
  if (!PROGRESS.test(text)) return null;
  const goals = db.getCabinetEntries(userId).filter((e) => e.type === 'goal' && e.status === 'active' && e.target);
  if (!goals.length) return null;
  const tw = wordsOf(text);
  const named = goals.filter((g) => [...wordsOf(`${g.title} ${g.goalType || ''}`)].some((w) => tw.has(w) || [...tw].some((x) => x.length > 4 && w.startsWith(x.slice(0, 5)))));
  const goal = named.length === 1 ? named[0] : goals.length === 1 ? goals[0] : null;
  if (!goal) return null;
  const gw = wordsOf(`${goal.title} ${goal.goalType || ''}`);
  const goalish = (clause: string) => {
    const cw = wordsOf(clause);
    return [...gw].some((w) => cw.has(w) || [...cw].some((x) => x.length > 4 && w.startsWith(x.slice(0, 5))));
  };
  const aboutSaving = (clause: string) => /\b(saved|save|saving|put|putting|aside|away|add|adding|so far|monthly|into it|towards)\b/i.test(clause);
  // Each amount belongs to its own clause: "saved 800 for Japan, and my rent is 1150 a month" records 800 only.
  const clauses = text.split(/[,;.!?]|\band\b|\bbut\b|\bwhile\b/i);
  let saved: number | undefined, monthly: number | undefined;
  for (const clause of clauses) {
    if (NOT_GOAL_MONEY.test(clause)) continue;
    const tied = goalish(clause) || aboutSaving(clause);
    if (!tied) continue;
    AMOUNT.lastIndex = 0;
    for (const m of clause.matchAll(AMOUNT)) {
      const n = num(m);
      if (!(n > 0) || (n >= 1900 && n <= 2100 && !m[3])) continue;
      const after = clause.slice((m.index || 0) + m[0].length, (m.index || 0) + m[0].length + 18);
      const isMonthly = /^\s*(a|per|each|every) month|^\s*monthly/i.test(after) || /\b(a|per|each|every) month\b|\bmonthly\b/i.test(clause);
      if (isMonthly) { if (monthly === undefined) monthly = n; }
      else if (saved === undefined) saved = n;
    }
  }
  if (saved === undefined && monthly === undefined) return null;
  // A saved amount bigger than the target is not "saved so far" (probably the target): leave it.
  if (saved !== undefined && goal.target && saved > goal.target.amount) saved = undefined;
  if (saved === undefined && monthly === undefined) return null;
  // What they didn't mention stays as it was.
  saved ??= goal.progress?.saved; monthly ??= goal.progress?.monthly;
  return { goalId: goal.id, title: goal.title, ...(saved !== undefined ? { saved } : {}), ...(monthly !== undefined ? { monthly } : {}) };
}

/** Lines to tap, picked from what Nora doesn't know yet. Each starts a sentence the customer finishes. */
export function infoSuggestions(userId: string): string[] {
  const v = aboutView(userId);
  const has = (k: keyof typeof v.fields) => v.fields[k].source !== 'none';
  const goals = db.getCabinetEntries(userId).filter((e) => e.type === 'goal' && e.status === 'active');
  const goal = (re: RegExp) => goals.some((g) => re.test(`${g.goalType} ${g.title}`));
  const plans = v.fields.plans.values;
  // Things that change in life first (the usual reason to come here), then goals and preferences.
  const unknownGoal = goals.find((g) => g.target && fin.goalStatus(userId, g).saved === undefined);
  const out = [
    unknownGoal ? `I’ve saved … € for ${unknownGoal.title} so far` : '',
    has('work') || v.bank.some((b) => b.key === 'work') ? 'I got a raise, my salary is now … €' : 'I work as …',
    'I started a new job at …',
    'We’re moving to … in …',
    has('home') && /rent/i.test(v.fields.home.text) ? 'I bought a flat, I own it now' : 'My rent is now … €',
    plans.includes('A home') && !goal(/home|flat|house|apartment/i) ? 'I want to save … € for a home by …' : 'I’m saving … € for … by …',
    plans.includes('Travel') && !goal(/travel|trip|holiday/i) ? 'I’m saving … € for a trip to … by …' : '',
    !goal(/buffer|emergency/i) ? 'I want a safety buffer of … € by …' : '',
    'I’ll get a bonus of … € in …',
    !has('risk') ? 'I prefer low-risk savings' : '',
  ].filter(Boolean);
  return [...new Set(out)].slice(0, 7);
}

/**
 * Points for keeping Nora up to date. Worth more than a single About you answer, because it takes more:
 * a new goal, life change, preference or note 20; a goal's progress or a changed About you line 10.
 * Paid once per item, only for something the customer really just saved, at most 5 times a day.
 */
export const INFO_POINTS = { new: 20, progress: 10, about: 10, perDay: 5 } as const;
type InfoReward = { ref: string; at: string; pts: number };
const freshly = (iso?: string) => !!iso && Date.now() - Date.parse(iso) < 10 * 60_000;

export function rewardInfo(userId: string, kind: 'new' | 'progress' | 'about', id: string): { points: number; why?: string } {
  const u = db.getUser(userId) as unknown as { points?: number; infoRewards?: InfoReward[] } | undefined;
  if (!u) return { points: 0, why: 'unknown customer' };
  // About you: the id is the field ("work"); the reward goes to its current answer.
  const e = kind === 'about'
    ? db.getCabinetEntries(userId).filter((x) => x.aboutPart === id && x.status !== 'archived' && x.status !== 'disputed').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0]
    : db.getCabinetEntry(id);
  if (!e || e.userId !== userId) return { points: 0, why: 'not found' };
  const ok = kind === 'new' ? e.source === 'customer' && !e.aboutPart && freshly(e.createdAt)
    : kind === 'progress' ? e.type === 'goal' && freshly(e.progress?.at)
    : !!e.aboutPart && freshly(e.updatedAt || e.createdAt);
  if (!ok) return { points: 0, why: 'not a fresh save' };
  const ref = kind === 'about' ? `about:${e.aboutPart}:${e.id}` : `${kind}:${e.id}`;
  const done = u.infoRewards || [];
  if (done.some((r) => r.ref === ref)) return { points: 0, why: 'already rewarded' };
  const today = new Date().toISOString().slice(0, 10);
  if (done.filter((r) => r.at.slice(0, 10) === today).length >= INFO_POINTS.perDay) return { points: 0, why: 'daily limit' };
  const pts = INFO_POINTS[kind];
  db.updateUser(userId, { points: (u.points || 0) + pts, infoRewards: [...done.slice(-200), { ref, at: new Date().toISOString(), pts }] } as never);
  return { points: pts };
}

/** For Rewards → Earn more: what each way pays and what is left to do. */
export function earnInfo(userId: string) {
  const u = db.getUser(userId) as unknown as { infoRewards?: InfoReward[] } | undefined;
  const today = new Date().toISOString().slice(0, 10);
  const usedToday = (u?.infoRewards || []).filter((r) => r.at.slice(0, 10) === today).length;
  const v = aboutView(userId);
  const goals = db.getCabinetEntries(userId).filter((e) => e.type === 'goal' && e.status === 'active' && e.target);
  return {
    points: INFO_POINTS,
    infoLeftToday: Math.max(0, INFO_POINTS.perDay - usedToday),
    aboutQuestionsLeft: v.incentive.remaining,
    aboutPoints: v.incentive.points,
    goalsWithoutProgress: goals.filter((g) => fin.goalStatus(userId, g).saved === undefined).map((g) => g.title),
  };
}

export function registerInfoRoutes(app: Express) {
  app.get('/api/info/earn', (req, res) => {
    const userId = uidOf(req);
    if (!db.getUser(userId)) return res.status(404).json({ error: 'Customer not found' });
    res.json(earnInfo(userId));
  });
  // Called after a save from Add new info: the server checks the item is real, new and not yet paid.
  app.post('/api/info/reward', (req, res) => {
    const userId = uidOf(req);
    const kind = String(req.body?.kind || '') as 'new' | 'progress' | 'about';
    if (!['new', 'progress', 'about'].includes(kind)) return res.status(400).json({ error: 'Unknown kind' });
    res.json(rewardInfo(userId, kind, String(req.body?.id || '')));
  });
  app.get('/api/info/suggestions', (req, res) => {
    const userId = uidOf(req);
    if (!db.getUser(userId)) return res.status(404).json({ error: 'Customer not found' });
    res.json({ suggestions: infoSuggestions(userId) });
  });
  // Nothing is saved here: the app shows what Nora understood, and the customer saves it.
  app.post('/api/info/understand', async (req, res) => {
    const userId = uidOf(req);
    if (!db.getUser(userId)) return res.status(404).json({ error: 'Customer not found' });
    res.json(await understandInfo(String(req.body?.text || ''), userId));
  });
}
