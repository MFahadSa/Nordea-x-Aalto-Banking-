/**
 * About you, onboarding answers and "Offers for you".
 *
 * - About you: every field is one cabinet entry (aboutPart = field key, aboutValues = the answers), so
 *   it sits in the Context Cabinet with the customer's other notes and the usual Share / Delete rules.
 *   What Nordea already knows is offered as a pre-filled suggestion the customer confirms with one tap.
 * - Answers that a rule in rules/ can use are also written as fact entries (factKey / factValue), the
 *   format src/server/advice/facts.ts already reads, so they unlock the existing "For you" suggestions.
 * - Offers for you: what a current Nordea offer needs decides what is asked. Each offer shows one personal
 *   reason, the data used and what Nordea earns. The customer pins, asks Nora, hides till payday or
 *   hides for good; every action can be undone.
 * - A few points per first answer (Rewards), never the main reason.
 */
import type { Express, Request } from 'express';
import { db } from './db.js';
import * as fin from './finance.js';
import { loadBus } from './arch/store/busStore.js';
import { decideProposal } from './arch/orchestrator.js';
import type { CabinetEntry } from '../types.js';
import { REWARDS } from './routes.js';
import { FIELDS, QUESTIONS, type AboutView, type FieldKey, type FieldView } from '../aboutParts.js';

const now = () => new Date().toISOString();
const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const uidOf = (req: Request) => String((req.method === 'GET' ? req.query.userId : req.body?.userId) || 'lauri');
const POINTS_PER_ANSWER = 5;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** What Nordea knows from opening the account (fictional demo customers). */
const OPENING: Record<string, { city?: string; since?: number; occupation?: string; demo?: { work?: string; home?: string; money?: string } }> = {
  lauri: { city: 'Helsinki', since: 2017, occupation: 'UX designer' },
  eeva: { city: 'Espoo', since: 1979, occupation: 'teacher' },
  // A new customer: only a few weeks of data, so the demo fills in a fictional picture.
  alex: { city: 'Tampere', since: 2026, demo: {
    work: 'Studies, with a part-time job: about 900 € a month, paid on the 15th',
    home: 'Rents a student flat, about 480 € a month',
    money: 'Spends most on groceries, then eating out and transport',
  } },
};

type Extra = { aboutRewarded?: string[]; offerState?: OfferState };
const userX = (userId: string) => db.getUser(userId) as unknown as (ReturnType<typeof db.getUser> & Extra) | undefined;

const live = (e: CabinetEntry) => e.status !== 'archived' && e.status !== 'disputed';
const fieldEntry = (entries: CabinetEntry[], key: FieldKey) =>
  entries.filter((e) => e.aboutPart === key && live(e)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

/** A write the customer just made lands straight away (their tap is the consent). */
function land(userId: string, entryId: string) {
  const waiting = loadBus(userId).messages.find((m) => m.type === 'propose' && m.status === 'pending'
    && (m.payload as { entry?: { id?: string } } | undefined)?.entry?.id === entryId);
  if (waiting) decideProposal(userId, waiting.id, true);
}

function sentence(key: FieldKey, values: string[], free?: string): string {
  if (key === 'more' || key === 'basics' || key === 'money') return free || values.join(', ');
  if (!values.length) return '';
  const low = values.map((v) => v.charAt(0).toLowerCase() + v.slice(1));
  const list = low.length > 1 ? `${low.slice(0, -1).join(', ')} and ${low.at(-1)}` : low[0];
  switch (key) {
    case 'work': return free || ({ Working: 'Works', Studying: 'Studies', Both: 'Studies and works', 'Between jobs': 'Between jobs', Retired: 'Retired' } as Record<string, string>)[values[0]] || values[0];
    case 'home': return ({ Rents: 'Rents', Owns: 'Owns a home', 'With parents': 'Lives with parents', 'Student housing': 'Student housing' } as Record<string, string>)[values[0]] || values[0];
    case 'people': return free || (values[0] === 'Alone' ? 'Lives alone' : `Lives with ${low[0]}`);
    case 'plans': return list.charAt(0).toUpperCase() + list.slice(1);
    case 'interests': return `Interested in ${list}`;
    case 'risk': return ({ 'Keep it safe': 'Keeps savings safe', 'A little': 'OK with a little risk', Comfortable: 'Comfortable with risk' } as Record<string, string>)[values[0]] || values[0];
    case 'style': return values[0] === 'Short answers' ? 'Prefers short answers' : 'Likes more detail';
    case 'mainUse': return `Mostly uses Nordea for ${list}`;
  }
  return values.join(', ');
}

const eur = (n: number) => `${Math.round(n).toLocaleString('fi-FI')} €`;
const CAT: Record<string, string> = { groceries: 'groceries', restaurants: 'eating out', transport: 'transport', subscriptions: 'subscriptions', shopping: 'shopping', bills: 'bills', pharmacy: 'pharmacy' };

/** What Nordea's own data shows: work and salary, home and rent, spending by category, saving. */
export function bankPicture(userId: string) {
  const u = db.getUser(userId);
  const open = OPENING[userId] || {};
  const tx = db.getTransactions(userId);
  const sal = fin.salaryInfo(userId);
  const acc = fin.accounts(userId);
  // The last three months of data (counted back from the newest transaction, so the demo data stays current).
  const last = tx.map((t) => t.date).sort().at(-1);
  const from = last ? new Date(Date.parse(last) - 91 * 864e5).toISOString().slice(0, 10) : '';
  const recent = tx.filter((t) => t.date > from);
  const monthly = (cat: string) => -recent.filter((t) => t.category === cat && t.amount < 0).reduce((a, t) => a + t.amount, 0) / 3;
  const pension = recent.filter((t) => t.category === 'pension' && t.amount > 0).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const rentTx = recent.filter((t) => t.category === 'housing' && t.amount < 0).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const rents = !!rentTx && /rent|vuokra/i.test(rentTx.description || '');
  const spend = Object.keys(CAT).map((c) => ({ c, v: monthly(c) })).filter((x) => x.v >= 20).sort((a, b) => b.v - a.v).slice(0, 3);
  const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] || '');
  const salaryNow = recent.some((t) => t.category === 'salary' && t.amount > 0);
  // Patterns, not exact sums (hard for anyone to check): where most money goes, and what changed lately.
  const cut = last ? new Date(Date.parse(last) - 30 * 864e5).toISOString().slice(0, 10) : '';
  const lately = (cat: string) => -recent.filter((t) => t.category === cat && t.amount < 0 && t.date > cut).reduce((a, t) => a + t.amount, 0);
  const before = (cat: string) => -recent.filter((t) => t.category === cat && t.amount < 0 && t.date <= cut).reduce((a, t) => a + t.amount, 0) / 2;
  const rising = spend.filter((x) => before(x.c) > 20 && lately(x.c) > before(x.c) * 1.25).map((x) => CAT[x.c]);
  const falling = spend.filter((x) => before(x.c) > 20 && lately(x.c) < before(x.c) * 0.75).map((x) => CAT[x.c]);
  // What Nordea already noticed counts too (e.g. "You've been eating out more").
  for (const e of db.getCabinetEntries(userId)) {
    if (e.source !== 'nordea' || e.status === 'disputed' || e.status === 'archived') continue;
    if (/eating out more/i.test(e.title) && !rising.includes('eating out')) rising.push('eating out');
  }
  const pattern = [
    spend.length ? `Spends most on ${spend[0] ? CAT[spend[0].c] : ''}${spend[1] ? `, then ${and(spend.slice(1).map((x) => CAT[x.c]))}` : ''}` : '',
    rising.length ? `${and(rising).charAt(0).toLowerCase() + and(rising).slice(1)} ${rising.length > 1 ? 'have' : 'has'} gone up lately` : '',
    falling.length ? `${and(falling)} ${falling.length > 1 ? 'have' : 'has'} gone down lately` : '',
  ].filter(Boolean);
  const lines: { key: FieldKey; label: string; icon: string; text: string; values: string[] }[] = [];
  if (pension && !salaryNow) lines.push({ key: 'work', label: 'Work', icon: 'pay', values: ['Retired'], text: `Retired${open.occupation ? ` ${open.occupation}` : ''}, pension of ${eur(pension.amount)} a month` });
  else if (sal.found) lines.push({ key: 'work', label: 'Work', icon: 'pay', values: ['Working'],
    text: `${open.occupation ? `${open.occupation.charAt(0).toUpperCase() + open.occupation.slice(1)}, s` : 'S'}teady salary of ${eur(sal.latest!)} a month, paid on the ${sal.payday}${[, 'st', 'nd', 'rd'][sal.payday! % 10] && ![11, 12, 13].includes(sal.payday!) ? [, 'st', 'nd', 'rd'][sal.payday! % 10] : 'th'}` });
  if (!lines.some((l) => l.key === 'work') && open.demo?.work) lines.push({ key: 'work', label: 'Work', icon: 'pay', values: ['Both'], text: open.demo.work });
  if (!rentTx && open.demo?.home) lines.push({ key: 'home', label: 'Home', icon: 'home', values: ['Rents'], text: open.demo.home });
  if (rentTx) lines.push({ key: 'home', label: 'Home', icon: 'home', values: rents ? ['Rents'] : [], text: rents ? `Rents, about ${eur(-rentTx.amount)} a month` : `Housing costs about ${eur(-rentTx.amount)} a month` });
  const money = [
    pattern.length ? pattern.join('; ') : open.demo?.money || '',
    acc?.savings?.monthlyDeposit ? `saves ${eur(acc.savings.monthlyDeposit)} every month` : '',
  ].filter(Boolean);
  if (money.length) lines.push({ key: 'money', label: 'Money habits', icon: 'pie', values: [], text: money.map((m, i) => (i ? m : m.charAt(0).toUpperCase() + m.slice(1))).join('; ') });
  return { lines, basics: u ? [`${u.age}`, open.city, open.since ? `customer since ${open.since}` : ''].filter(Boolean).join(', ') : '', eatingOut: monthly('restaurants') };
}

/** Nordea's pre-filled answers: what the bank data and the customer's own goals already say. */
function suggestions(userId: string, entries: CabinetEntry[]): Partial<Record<FieldKey, { values: string[]; text: string; from: string }>> {
  const out: Partial<Record<FieldKey, { values: string[]; text: string; from: string }>> = {};
  if (!db.getUser(userId)) return out;
  const bank = bankPicture(userId);
  out.basics = { values: [], text: bank.basics, from: 'Nordea knows' };
  for (const l of bank.lines) out[l.key] = { values: l.values, text: l.text, from: 'From your Nordea data' };
  // The customer's own goals and notes already say some things: suggest them, never assume them.
  const goals = entries.filter((e) => e.type === 'goal' && e.status === 'active');
  const plans = [
    goals.some((g) => g.goalType === 'home' || /flat|home|house|apartment/i.test(g.title)) ? 'A home' : '',
    goals.some((g) => g.goalType === 'travel' || /trip|travel|holiday/i.test(g.title)) ? 'Travel' : '',
    goals.some((g) => g.goalType === 'buffer' || /buffer|emergency/i.test(g.title)) ? 'A buffer' : '',
  ].filter(Boolean);
  if (plans.length) out.plans = { values: plans, text: sentence('plans', plans), from: 'From your goals' };
  if (entries.some((e) => e.type === 'preference' && live(e) && /low-risk|safe/i.test(`${e.title} ${e.detail}`))) out.risk = { values: ['Keep it safe'], text: 'Keeps savings safe', from: 'From your notes' };
  return out;
}

/** The answers that earn points, in the order the flow asks them. */
export const ASKED: FieldKey[] = ['work', 'home', 'money', 'plans', 'interests', 'risk', 'mainUse'];

export function aboutView(userId: string): AboutView {
  const u = db.getUser(userId);
  const entries = db.getCabinetEntries(userId);
  const sug = suggestions(userId, entries);
  const bank = bankPicture(userId);
  const fields = {} as Record<FieldKey, FieldView>;
  for (const def of Object.values(FIELDS)) {
    const e = fieldEntry(entries, def.key);
    const values = e?.aboutValues || [];
    const s = sug[def.key];
    const said = !!e;
    fields[def.key] = {
      key: def.key, label: def.label, options: def.options, multi: def.multi, values,
      text: said ? (e!.detail || sentence(def.key, values)) : def.key === 'basics' && s ? s.text : '',
      source: said ? (e!.source === 'nordea' ? 'nordea' : 'you') : def.key === 'basics' && s ? 'nordea' : 'none',
      suggestion: !said && def.key !== 'basics' ? s : undefined,
    };
  }
  const f = fields;
  const has = (k: FieldKey) => f[k].source !== 'none';
  const name = u?.name || '';
  // The paragraph: Nordea's data first (it is what Nordea already sees), then what the customer added.
  const bankText = (k: FieldKey) => (has(k) ? f[k].text : bank.lines.find((l) => l.key === k)?.text || '');
  const parts = [
    `${name}${f.basics.text ? `, ${f.basics.text}` : ''}.`,
    bankText('work'),
    [f.people.text, has('home') ? f.home.text : bankText('home')].filter(Boolean).join(', '),
    bankText('money'),
    f.plans.text ? `Plans: ${lower(f.plans.text)}` : '',
    f.interests.text,
    [f.risk.text, f.style.text].filter(Boolean).join('; '),
    f.more.text,
  ].filter(Boolean).map((s) => (/[.!?]$/.test(s) ? s : `${s}.`));
  const goals = entries.filter((e) => e.type === 'goal' && e.status === 'active');

  // What answering is worth: points toward a real reward, and examples of advice it unlocks.
  // Screens left: one to check Nordea's data (if anything is unchecked), then one per open question.
  const unchecked = bank.lines.filter((l) => !has(l.key)).length;
  const remaining = (unchecked ? 1 : 0) + QUESTIONS.filter((q) => !has(q.field)).length;
  const earn = ASKED.filter((k) => !has(k)).length * POINTS_PER_ANSWER;
  const now = u?.points || 0;
  const rewards = [...REWARDS].sort((a, b) => a.pts - b.pts);
  const reach = rewards.find((r) => r.pts > now && r.pts <= now + earn);
  const next = rewards.find((r) => r.pts > now);
  const rewardLine = !earn ? '' : reach ? `Enough for ${lower(reach.title)}` : next ? `${earn} points closer to ${lower(next.title)}` : '';
  const home = goals.find((g) => g.goalType === 'home' || /flat|home|house|apartment/i.test(g.title));
  const travel = goals.find((g) => g.goalType === 'travel' || /trip|travel|holiday/i.test(g.title));
  const teasers = [
    home ? `How much to save each month to reach “${home.title}” on time` : 'How much to save each month for what matters to you',
    travel && home ? `A travel budget that keeps your flat on track` : travel ? `How much to put aside for “${travel.title}”` : '',
    bank.eatingOut >= 150 ? 'Where you could cut back on eating out, which has gone up lately' : 'Where your money goes, and where you could save',
    'Only savings and offers that fit your comfort with risk',
  ].filter(Boolean).slice(0, 3);
  return {
    paragraph: parts.join(' '),
    fields,
    bank: bank.lines.map((l) => ({ key: l.key, label: l.label, icon: l.icon, text: l.text })),
    incentive: { remaining, points: earn, have: now, rewardLine, teasers },
    setup: [
      { key: 'plans', done: has('plans') || goals.length > 0, doneText: 'Your goal is set', todoText: 'Add your plans → see if you’re on track', step: 'plans' },
      { key: 'interests', done: has('interests'), doneText: 'Tips matched to your interests', todoText: 'Pick your topics → get tips that fit you', step: 'interests' },
      { key: 'risk', done: has('risk'), doneText: 'Offers that suit you', todoText: 'Set your comfort with risk → only offers that suit you', step: 'risk' },
      { key: 'confirm', done: (['work', 'home', 'money'] as FieldKey[]).every((k) => has(k) || !f[k].suggestion), doneText: 'What we know is checked', todoText: 'Check what we already know → one tap each', step: 'confirm' },
    ],
  };
}

/** Rule facts the answers unlock (read by src/server/advice/facts.ts). */
const FACT_TITLE: Record<string, string> = { savingForHome: 'Saving towards a home', interestedInInvesting: 'Interested in investing', isHigherEducationStudent: 'Studies', everOwnedHalfOfHome: 'Owns a home' };
const FACT_OF: { field: FieldKey; fact: string; when: (v: string[]) => boolean }[] = [
  { field: 'plans', fact: 'savingForHome', when: (v) => v.includes('A home') },
  { field: 'interests', fact: 'interestedInInvesting', when: (v) => v.includes('Investing basics') },
  { field: 'work', fact: 'isHigherEducationStudent', when: (v) => v.includes('Studying') || v.includes('Both') },
  { field: 'home', fact: 'everOwnedHalfOfHome', when: (v) => v.includes('Owns') },
];

function writeField(userId: string, key: FieldKey, values: string[], free: string | undefined, fromNordea: boolean) {
  const entries = db.getCabinetEntries(userId);
  const old = entries.filter((e) => e.aboutPart === key && live(e));
  const def = FIELDS[key];
  const clean = values.filter((v) => def.options.includes(v) || key === 'money');
  const text = (free || '').trim().slice(0, 400);
  // A new answer replaces the old one (not kept as a removed note: About you shows the current answer).
  for (const e of old) db.deleteCabinetEntry(e.id, { by: 'you', how: 'Replaced by your new answer', purge: true });
  if (!clean.length && !text) return; // cleared
  // Plans and interests keep the tapped answers and add anything typed; elsewhere typed words win.
  const detail = (key === 'plans' || key === 'interests') && clean.length ? `${sentence(key, clean)}${text ? `; ${text}` : ''}` : text || sentence(key, clean);
  const e: CabinetEntry = {
    id: newId('about'), userId, type: key === 'plans' ? 'life_event' : key === 'risk' || key === 'style' || key === 'mainUse' || key === 'interests' ? 'preference' : 'fact',
    title: `${def.label}: ${clean.length ? clean.join(', ') : detail}`, detail, source: fromNordea ? 'nordea' : 'customer', status: 'active', private: false,
    readableBy: { abel: true, offers: false }, provenance: { channel: 'app', detectedFrom: fromNordea ? 'Nordea data, confirmed by you' : 'About you' },
    reviewed: true, confirmedAt: now(), createdAt: now(), updatedAt: now(), aboutPart: key, aboutValues: clean,
  };
  db.addCabinetEntry(e, { by: 'you', how: fromNordea ? 'You confirmed what Nordea knew' : 'You told Nora in About you' });
  land(userId, e.id);
  // Facts for the rules: replace this field's facts.
  for (const m of FACT_OF.filter((x) => x.field === key)) {
    for (const f of entries.filter((x) => x.factKey === m.fact && x.aboutPart === `fact:${key}` && live(x))) db.deleteCabinetEntry(f.id, { by: 'you', how: 'Replaced by your new answer', purge: true });
    if (m.when(clean)) {
      const fe: CabinetEntry = {
        id: newId('fact'), userId, type: 'fact', title: FACT_TITLE[m.fact] || detail, detail: 'From your answer in About you. Used for suggestions that fit you.', source: 'customer', status: 'active', private: false,
        readableBy: { abel: true, offers: false }, provenance: { channel: 'app', detectedFrom: 'About you' }, reviewed: true, createdAt: now(), updatedAt: now(),
        factKey: m.fact, factValue: true, aboutPart: `fact:${key}`,
      };
      db.addCabinetEntry(fe, { by: 'you', how: 'From your answer in About you' });
      land(userId, fe.id);
    }
  }
}

function reward(userId: string, keys: string[]): number {
  const u = userX(userId);
  if (!u) return 0;
  const done = new Set(u.aboutRewarded || []);
  const fresh = keys.filter((k) => !done.has(k));
  if (!fresh.length) return 0;
  db.updateUser(userId, { points: (u.points || 0) + POINTS_PER_ANSWER * fresh.length, aboutRewarded: [...done, ...fresh] } as never);
  return POINTS_PER_ANSWER * fresh.length;
}

// ---------------- Offers for you ----------------
interface OfferState { pinned?: Record<string, string>; later?: Record<string, string>; hidden?: Record<string, { at: string; reason?: string }> }
export interface OfferView {
  id: string; title: string; line: string; reason: string; note?: string; earns: string;
  used: { label: string; value: string; from: string }[];
  goal?: string; pinned: boolean;
  /** Details: what it is, how to set it up, and the official page when we have one. */
  about: string; steps: string[]; url?: string;
}
interface OfferDef {
  id: string; title: string; earns: string; note?: string;
  fit: (c: Ctx) => null | { reason: string; line?: string; used: OfferView['used'] };
  line: string; goal?: (c: Ctx) => string | undefined;
}
interface Ctx { age: number; v: (k: FieldKey) => string[]; from: (k: FieldKey) => string; hasAsp: boolean; goals: CabinetEntry[] }

const used = (c: Ctx, k: FieldKey, label = FIELDS[k].label): OfferView['used'][number] => ({ label, value: c.v(k).join(', '), from: c.from(k) });
const ageUsed = (c: Ctx) => ({ label: 'Age', value: String(c.age), from: 'Nordea customer record' });
const homeGoal = (c: Ctx) => c.goals.find((g) => g.goalType === 'home' || /flat|home|house|apartment/i.test(g.title))?.title || 'A home';
const travelGoal = (c: Ctx) => c.goals.find((g) => g.goalType === 'travel' || /trip|travel|holiday/i.test(g.title))?.title || 'Travel';

/** The offers that exist today, and the one thing each needs to know. */
const OFFERS: OfferDef[] = [
  { id: 'asp', title: 'ASP account for your first home', line: 'Up to 5% interest, tax-free. With ASP savings you can apply for an ASP loan.',
    earns: 'The interest margin on your savings, and on a loan if you take one later.', goal: homeGoal,
    fit: (c) => c.v('plans').includes('A home') && !c.v('home').includes('Owns') && !c.hasAsp && c.age <= 44
      ? { reason: `Because you want a home${c.v('home').includes('Rents') ? ' and rent today' : ''}`, used: [used(c, 'plans'), ...(c.v('home').length ? [used(c, 'home', 'Housing')] : []), ageUsed(c)] } : null },
  { id: 'asp-loan', title: 'ASP loan', line: 'From 1 June 2026 you qualify after at least 20 monthly deposits of 50–1,500 euros.',
    earns: 'Interest on the loan.', note: 'A loan needs an application and a credit decision.', goal: homeGoal,
    fit: (c) => c.hasAsp && c.v('plans').includes('A home') ? { reason: 'Because you save in ASP for your first home', used: [used(c, 'plans'), { label: 'ASP account', value: 'Yes', from: 'Your Nordea accounts' }] } : null },
  { id: 'young', title: 'Young customer benefits', line: 'Low-cost or free daily banking, and saving and investing benefits for 18–27-year-olds.',
    earns: 'Nothing extra: these are discounts on Nordea’s own services.',
    fit: (c) => (c.age >= 18 && c.age <= 27) || c.v('work').includes('Studying') || c.v('work').includes('Both')
      ? { reason: c.age >= 18 && c.age <= 27 ? `Because you’re ${c.age}` : 'Because you study', used: [ageUsed(c), ...(c.v('work').length ? [used(c, 'work')] : [])] } : null },
  { id: 'funds', title: 'Monthly fund saving', line: 'Start with as little as 10 euros a month. With the digital adviser Nora it takes about 7 minutes.',
    earns: 'A yearly management fee from the fund.', note: 'Funds can go down as well as up.',
    fit: (c) => (c.v('interests').includes('Investing basics') || c.v('mainUse').includes('Investing')) && !c.v('risk').includes('Keep it safe')
      ? { reason: `Because you want to learn about investing${c.v('risk').length ? ` and are ${c.v('risk')[0] === 'Comfortable' ? 'comfortable with' : 'OK with a little'} risk` : ''}`, used: [used(c, 'interests'), ...(c.v('risk').length ? [used(c, 'risk')] : [])] } : null },
  { id: 'equity-savings', title: 'Equity savings account', line: 'Buy shares and pay tax only when you take money out. No custody fees aged 18–27.',
    earns: 'Trading fees on the shares you buy.', note: 'Shares can go down as well as up.',
    fit: (c) => c.age >= 18 && c.age <= 27 && (c.v('interests').includes('Investing basics') || c.v('mainUse').includes('Investing'))
      ? { reason: `Because you’re ${c.age} and want to learn about investing`, used: [ageUsed(c), used(c, 'interests')] } : null },
  { id: 'if-home', title: 'Home insurance from If', line: '25% discount on new If home insurance for Nordea customers.',
    earns: 'A commission from If if you buy the insurance.', note: 'Sold by our partner If.',
    fit: (c) => c.v('home').includes('Rents') || c.v('home').includes('Owns') || c.v('plans').includes('A home')
      ? { reason: c.v('plans').includes('A home') ? 'Because you’re planning a move to your own home' : `Because you ${c.v('home').includes('Owns') ? 'own' : 'rent'} your home`, used: [...(c.v('home').length ? [used(c, 'home', 'Housing')] : []), ...(c.v('plans').length ? [used(c, 'plans')] : [])] } : null },
  { id: 'home-loan', title: 'Home loan with FlexiPayment', line: 'Adjust your monthly payment free of charge when life changes.',
    earns: 'Interest and fees on the loan.', note: 'A loan needs an application and a talk with an adviser.', goal: homeGoal,
    fit: (c) => c.v('plans').includes('A home') && c.v('work').includes('Working')
      ? { reason: 'Because you plan to buy a home and have a steady income', used: [used(c, 'plans'), used(c, 'work')] } : null },
  { id: 'renovation', title: 'Renovation loan or FlexiCredit', line: 'Spread the cost of fixing up your home.',
    earns: 'Interest on the credit.', note: 'Credit needs an application and a credit decision.',
    fit: (c) => c.v('home').includes('Owns') ? { reason: 'Because you own your home', used: [used(c, 'home', 'Housing')] } : null },
  { id: 'gold', title: 'Gold package', line: 'Travel insurance and cashback on card purchases in one package.',
    earns: 'The monthly package fee and card fees.', goal: travelGoal,
    fit: (c) => c.v('plans').includes('Travel')
      ? { reason: 'Because you plan to travel', line: c.age <= 27 ? 'Travel insurance and cashback, for under one euro a month for young customers.' : undefined, used: [used(c, 'plans'), ageUsed(c)] } : null },
];

/** Details per offer. Links only where the project has a real Nordea page (rules/*.json sources). */
const DETAILS: Record<string, { about: string; steps: string[]; url?: string }> = {
  asp: {
    about: 'An ASP account is a savings account for your first home. You save regularly; when you buy, the savings earn extra interest, tax-free, and you can apply for an ASP loan with state guarantee.',
    steps: ['Open the account in the app: Save and invest → ASP account.', 'Set a monthly transfer of 50–1,500 €.', 'Keep saving for at least 20 months; then you can apply for an ASP loan.'],
    url: 'https://www.nordea.fi/en/personal/our-services/savings-investments/saving-for-a-home.html',
  },
  'asp-loan': {
    about: 'An ASP loan finances your first home on top of your ASP savings, with a state guarantee and an interest subsidy.',
    steps: ['Make at least 20 monthly ASP deposits of 50–1,500 €.', 'Ask Nora what you could afford.', 'Apply for the loan and talk it through with an adviser.'],
  },
  young: {
    about: 'Customers aged 18–27 get daily banking for little or no cost, and benefits for saving and investing.',
    steps: ['Check that your details (age or student status) are up to date.', 'The benefits switch on by themselves; no application needed.'],
  },
  funds: {
    about: 'Put a fixed amount into a fund every month, from 10 €. Spreading it over time evens out the ups and downs.',
    steps: ['Pick an amount you can keep up, from 10 € a month.', 'Answer a few questions with the digital adviser (about 7 minutes).', 'Choose a fund and start the monthly saving. You can pause any time.'],
  },
  'equity-savings': {
    about: 'An equity savings account lets you buy shares and pay tax only when you take money out. Customers aged 18–27 pay no custody fees; trading fees still apply.',
    steps: ['Open the account in the app: Save and invest → Equity savings account.', 'Move money in (up to 100,000 € in total).', 'Buy shares; nothing is taxed until you withdraw.'],
    url: 'https://www.nordea.fi/en/personal/our-services/savings-investments/investments/equity-savings-account.html',
  },
  'if-home': {
    about: 'Home insurance from our partner If covers your belongings and liability. Nordea customers get 25% off new If home insurance.',
    steps: ['Get a quote from If (about 5 minutes).', 'Pick the cover that fits your home.', 'The discount is applied when you buy.'],
  },
  'home-loan': {
    about: 'A home loan with FlexiPayment: when life changes, you can lower or pause your monthly payment free of charge.',
    steps: ['Ask Nora how much you could borrow.', 'Fill in a loan application.', 'Book a meeting with an adviser to go through the offer.'],
  },
  renovation: {
    about: 'A renovation loan or FlexiCredit spreads the cost of fixing up your home over time.',
    steps: ['Estimate the cost of the work.', 'Apply in the app; you get a decision quickly.', 'Pay back at your own pace.'],
  },
  gold: {
    about: 'The Gold package bundles travel insurance and cashback on card purchases.',
    steps: ['Switch your package in the app: Services → Packages.', 'Your card gets travel insurance straight away.'],
  },
};

function ctxOf(userId: string): Ctx {
  const u = db.getUser(userId)!;
  const view = aboutView(userId);
  const entries = db.getCabinetEntries(userId);
  const v = (k: FieldKey) => (view.fields[k].values.length ? view.fields[k].values : view.fields[k].suggestion?.values || []);
  const from = (k: FieldKey) => (view.fields[k].values.length ? (view.fields[k].source === 'nordea' ? 'Nordea knew, you confirmed' : 'You told us') : view.fields[k].suggestion?.from || '');
  const hasAsp = db.getBankAccounts?.(userId)?.some((a) => /\basp\b/i.test(a.type || '')) ?? false;
  return { age: u.age, v, from, hasAsp, goals: entries.filter((e) => e.type === 'goal' && e.status === 'active') };
}

export function offersFor(userId: string, today = now().slice(0, 10)) {
  const u = userX(userId);
  if (!u) return { offers: [] as OfferView[], hidden: 0 };
  const st = u.offerState || {};
  const c = ctxOf(userId);
  const offers: OfferView[] = [];
  let hidden = 0;
  for (const o of OFFERS) {
    const f = o.fit(c);
    if (!f) continue;
    if (st.hidden?.[o.id] || (st.later?.[o.id] && st.later[o.id] > today)) { hidden++; continue; }
    const d = DETAILS[o.id] || { about: o.line, steps: [] };
    offers.push({ id: o.id, title: o.title, line: f.line || o.line, reason: f.reason, note: o.note, earns: o.earns, used: f.used, goal: o.goal?.(c), pinned: !!st.pinned?.[o.id], about: d.about, steps: d.steps, url: d.url });
  }
  return { offers, hidden };
}

function nextPayday(userId: string, today: string): string {
  try { const p = fin.payPlan(userId).nextPayday; if (p && p > today) return p; } catch { /* no salary */ }
  return new Date(Date.parse(today) + 30 * 864e5).toISOString().slice(0, 10);
}

export function registerAboutRoutes(app: Express) {
  app.get('/api/about', (req, res) => {
    const userId = uidOf(req);
    if (!db.getUser(userId)) return res.status(404).json({ error: 'Customer not found' });
    res.json(aboutView(userId));
  });

  // Save answers: { answers: { field: { values: [], text? } }, confirm: [field] } - one call for the whole onboarding.
  app.post('/api/about', (req, res) => {
    const userId = uidOf(req);
    if (!db.getUser(userId)) return res.status(404).json({ error: 'Customer not found' });
    const answers = (req.body?.answers || {}) as Record<string, { values?: string[]; text?: string }>;
    const confirm = (Array.isArray(req.body?.confirm) ? req.body.confirm : []) as string[];
    const before = aboutView(userId);
    const rewarded: string[] = [];
    for (const k of confirm) {
      if (!(k in FIELDS)) continue;
      const s = before.fields[k as FieldKey].suggestion;
      if (!s) continue;
      writeField(userId, k as FieldKey, s.values, s.text, s.from.startsWith('Nordea'));
      if (k === 'money') {
        // Confirming the habits also confirms the observations they came from.
        for (const e of db.getCabinetEntries(userId).filter((x) => x.source === 'nordea' && x.type === 'observation' && !x.reviewed && live(x) && !/salary/i.test(x.title))) {
          db.updateCabinetEntry(e.id, { reviewed: true, confirmedAt: now() }, { by: 'you', how: 'You confirmed it in About you' });
        }
      }
      rewarded.push(k);
    }
    for (const [k, a] of Object.entries(answers)) {
      if (!(k in FIELDS) || k === 'basics') continue;
      writeField(userId, k as FieldKey, Array.isArray(a?.values) ? a.values.map(String) : [], typeof a?.text === 'string' ? a.text : undefined, false);
      rewarded.push(k);
    }
    const points = reward(userId, rewarded);
    res.json({ ...aboutView(userId), points });
  });

  app.get('/api/offers', (req, res) => {
    const userId = uidOf(req);
    if (!db.getUser(userId)) return res.status(404).json({ error: 'Customer not found' });
    res.json(offersFor(userId));
  });

  // pin / unpin · later / unlater · hide / unhide · reason (after "Not for me")
  app.post('/api/offers/action', (req, res) => {
    const userId = uidOf(req);
    const u = userX(userId);
    if (!u) return res.status(404).json({ error: 'Customer not found' });
    const id = String(req.body?.id || '');
    const offer = OFFERS.find((o) => o.id === id);
    if (!offer) return res.status(404).json({ error: 'Unknown offer' });
    const today = now().slice(0, 10);
    const st: OfferState = JSON.parse(JSON.stringify(u.offerState || {}));
    st.pinned ||= {}; st.later ||= {}; st.hidden ||= {};
    const action = String(req.body?.action || '');
    if (action === 'pin') st.pinned[id] = offer.goal?.(ctxOf(userId)) || 'Your plan';
    else if (action === 'unpin') delete st.pinned[id];
    else if (action === 'later') st.later[id] = nextPayday(userId, today);
    else if (action === 'unlater') delete st.later[id];
    else if (action === 'hide') st.hidden[id] = { at: today };
    else if (action === 'unhide') delete st.hidden[id];
    else if (action === 'reason') { if (st.hidden[id]) st.hidden[id].reason = String(req.body?.reason || '').slice(0, 40); }
    else return res.status(400).json({ error: 'Unknown action' });
    db.updateUser(userId, { offerState: st } as never);
    res.json({ ...offersFor(userId, today), until: st.later[id], goal: st.pinned[id] });
  });

  // Demo: start the About you story again (answers, points markers, offer choices).
  app.post('/api/about/reset', (req, res) => {
    const userId = uidOf(req);
    for (const e of db.getCabinetEntries(userId).filter((x) => x.aboutPart)) db.deleteCabinetEntry(e.id, { by: 'you', how: 'Demo reset', purge: true });
    db.updateUser(userId, { aboutRewarded: [], offerState: {} } as never);
    res.json(aboutView(userId));
  });
}
