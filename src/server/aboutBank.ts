/** The bank's part of About you: what Nordea's own data says about work, home and money habits. */
import { db } from './db.js';
import * as fin from './finance.js';
import type { FieldKey } from '../aboutParts.js';

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
  // Spending and saving are two different things: two sentences, so a correction to one leaves the other.
  if (money.length) lines.push({ key: 'money', label: 'Money habits', icon: 'pie', values: [], text: money.map((m) => `${m.charAt(0).toUpperCase() + m.slice(1)}.`).join(' ') });
  return { lines, basics: u ? [`${u.age}`, open.city, open.since ? `customer since ${open.since}` : ''].filter(Boolean).join(', ') : '', eatingOut: monthly('restaurants') };
}
