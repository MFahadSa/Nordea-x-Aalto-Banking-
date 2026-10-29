// Nordea's side of the cabinet: the bank's own (fictional) account data for a customer.
// New data can come from a file uploaded in More → Nordea account data, or from a row added to the Supabase
// table "nordea_feed". Either way:
//  1. the customer's transactions are replaced and the balances updated (Abel's FACTS change at once);
//  2. "Nordea noticed" is worked out again from the new data: new observations are added, changed ones are
//     updated, and ones the data no longer shows are archived. New or changed observations wait for the
//     customer to confirm them (until then Abel can't read them, as before).
import { db } from './db.js';
import * as fin from './finance.js';
import { CabinetEntry, Transaction } from '../types.js';

export interface NordeaData {
  customer?: string;
  balances?: { current?: number; savings?: number; carFund?: number; monthlySavingsDeposit?: number };
  transactions?: { date: string; amount: number; category?: string; description?: string; account?: string }[];
}

export interface ApplyResult {
  ok: boolean;
  message: string;
  transactions?: number;
  balances?: boolean;
  noticed?: { added: string[]; updated: string[]; removed: string[] };
}

const CATEGORIES = new Set<Transaction['category']>(['salary', 'housing', 'groceries', 'restaurants', 'transport', 'bills', 'subscriptions', 'shopping', 'pharmacy', 'savings_transfer', 'savings_transfer_in', 'pension', 'other']);

/** A category from the description when the data doesn't give one. */
function guessCategory(desc: string, amount: number): Transaction['category'] {
  const d = desc.toLowerCase();
  if (amount > 0 && /salary|palkka|payroll|wage/.test(d)) return 'salary';
  if (amount > 0 && /pension|eläke|keva/.test(d)) return 'pension';
  if (/saving|säästö/.test(d)) return amount < 0 ? 'savings_transfer' : 'savings_transfer_in';
  if (/rent|vuokra|housing|vastike/.test(d)) return 'housing';
  if (/k-market|k-supermarket|s-market|prisma|lidl|alepa|citymarket|grocer|ruoka/.test(d)) return 'groceries';
  if (/restaurant|ravintola|wolt|foodora|cafe|café|kahvila|pizza|sushi|bar\b|burger/.test(d)) return 'restaurants';
  if (/hsl|vr\b|bus|train|taxi|bolt|uber|fuel|neste|st1|parking/.test(d)) return 'transport';
  if (/netflix|spotify|disney|hbo|youtube|subscription|gym|elixia|fitness/.test(d)) return 'subscriptions';
  if (/elisa|dna|telia|electric|sähkö|helen|water|insurance|vakuutus|bill/.test(d)) return 'bills';
  if (/pharmacy|apteekki/.test(d)) return 'pharmacy';
  return amount < 0 ? 'shopping' : 'other';
}

/** CSV: date,description,amount[,category][,account]. Header names may vary a little. */
export function parseCsv(text: string): NordeaData {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return {};
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const head = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, ''));
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iDate = col('date', 'päivämäärä', 'booking date'), iDesc = col('description', 'selite', 'text', 'payee'), iAmt = col('amount', 'summa', 'eur');
  const iCat = col('category', 'kategoria'), iAcc = col('account', 'tili');
  if (iDate < 0 || iAmt < 0) throw new Error('The CSV needs at least a "date" and an "amount" column.');
  const transactions = lines.slice(1).map((l) => {
    const c = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''));
    return { date: c[iDate], description: iDesc >= 0 ? c[iDesc] : '', amount: Number(String(c[iAmt]).replace(/\s/g, '').replace(',', '.')), category: iCat >= 0 ? c[iCat] : undefined, account: iAcc >= 0 ? c[iAcc] : undefined };
  });
  return { transactions };
}

/** Accepts the parsed JSON object, or CSV text. */
export function readNordeaFile(text: string, fileName = ''): NordeaData {
  const t = text.trim();
  if (/\.json$/i.test(fileName) || t.startsWith('{')) return JSON.parse(t);
  return parseCsv(t);
}

export function applyNordeaData(userId: string, data: NordeaData, from: string): ApplyResult {
  const user = db.getUser(userId);
  if (!user) return { ok: false, message: `Unknown customer “${userId}”.` };
  if (!data || typeof data !== 'object') return { ok: false, message: 'The data is empty.' };

  // 1. Transactions
  let txCount: number | undefined;
  if (Array.isArray(data.transactions)) {
    const list: Transaction[] = [];
    const bad: number[] = [];
    data.transactions.forEach((x, i) => {
      const date = String(x?.date || '').slice(0, 10);
      const amount = Number(x?.amount);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || !Number.isFinite(amount) || amount === 0) { bad.push(i + 1); return; }
      const desc = String(x.description || '').slice(0, 80);
      const category = CATEGORIES.has(x.category as any) ? (x.category as Transaction['category']) : guessCategory(desc, amount);
      list.push({ id: `nd-${userId}-${i}`, userId, date, category, amount: Math.round(amount * 100) / 100, account: x.account === 'savings' ? 'savings' : 'current', description: desc || undefined });
    });
    if (!list.length) return { ok: false, message: 'No usable transactions: each needs a date (YYYY-MM-DD) and an amount.' };
    if (bad.length > list.length / 4) return { ok: false, message: `Too many rows couldn’t be read (rows ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? '…' : ''}). Check the date (YYYY-MM-DD) and amount columns.` };
    list.sort((a, b) => a.date.localeCompare(b.date));
    db.replaceTransactions(userId, list);
    txCount = list.length;
  }

  // 2. Balances
  const b = data.balances;
  let balances = false;
  if (b && typeof b === 'object') {
    const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
    const cur = num(b.current), sav = num(b.savings), car = num(b.carFund), dep = num(b.monthlySavingsDeposit);
    const acc = JSON.parse(JSON.stringify(user.accounts));
    if (cur !== undefined && Number.isFinite(cur)) acc.current.balance = cur;
    if (sav !== undefined && Number.isFinite(sav)) acc.savings.balance = sav;
    if (dep !== undefined && Number.isFinite(dep) && dep >= 0) acc.savings.monthlyDeposit = dep;
    if (car !== undefined && Number.isFinite(car)) acc.carFund = { ...(acc.carFund || { iban: 'FI29 1234 5678 9012 36' }), balance: car };
    db.updateUser(userId, { accounts: acc });
    balances = true;
  }
  if (txCount === undefined && !balances) return { ok: false, message: 'Nothing to apply: the data needs "transactions" and/or "balances".' };

  // 3. What Nordea noticed, worked out again from the new data.
  const noticed = refreshObservations(userId);
  db.updateUser(userId, { nordeaData: { from, at: new Date().toISOString(), transactions: txCount ?? db.getTransactions(userId).length, balances } });
  const parts = [
    txCount !== undefined ? `${txCount} transactions` : '',
    balances ? 'balances' : '',
  ].filter(Boolean).join(' and ');
  const n = noticed;
  const what = [n.added.length ? `${n.added.length} new` : '', n.updated.length ? `${n.updated.length} changed` : '', n.removed.length ? `${n.removed.length} no longer seen` : ''].filter(Boolean).join(', ');
  return { ok: true, message: `Updated ${parts}.${what ? ` Nordea noticed: ${what}.` : ' Nothing new for Nordea to notice.'}`, transactions: txCount, balances, noticed };
}

// ---------------- What Nordea notices ----------------
const LABEL: Record<string, string> = { restaurants: 'eating out', groceries: 'groceries', shopping: 'shopping', transport: 'transport', bills: 'bills', subscriptions: 'subscriptions', pharmacy: 'the pharmacy' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const eur = (n: number) => `${Math.round(n).toLocaleString('fi-FI').replace(/\s/g, ' ')} €`;

interface Seen { key: string; title: string; detail: string; why: string }

function detect(userId: string): Seen[] {
  const out: Seen[] = [];
  const tx = db.getTransactions(userId);
  if (!tx.length) return out;

  // Salary or pension changed in the last 12 months.
  const s = fin.salaryInfo(userId);
  if (s.found && s.changed && s.changeMonth && fin.monthsBetween(s.changeMonth, fin.CUR_MONTH) <= 12) {
    const up = s.difference > 0;
    const n = tx.filter((t) => (t.category === 'salary' || t.category === 'pension') && t.date.slice(0, 7) >= s.changeMonth!).length;
    out.push({
      key: 'salary',
      title: `Your salary went ${up ? 'up' : 'down'} in ${monthName(s.changeMonth)}`,
      detail: `From ${eur(s.from)} to ${eur(s.to)} a month.`,
      why: `Your last ${n} salary ${n === 1 ? 'payment was' : 'payments were'} ${eur(s.to)}. Before ${MONTHS[Number(s.changeMonth.slice(5, 7)) - 1]} they were ${eur(s.from)}.`,
    });
  }

  // A spending category clearly up (or down) lately: last 3 full months against the 9 before.
  const recentMonths = [1, 2, 3].map((i) => fin.addMonths(fin.CUR_MONTH, -i));
  const baseMonths = Array.from({ length: 9 }, (_, i) => fin.addMonths(fin.CUR_MONTH, -(i + 4))).filter((m) => tx.some((t) => t.date.startsWith(m)));
  if (baseMonths.length >= 3) {
    for (const cat of Object.keys(LABEL)) {
      const avg = (ms: string[]) => ms.reduce((a, m) => a + (fin.monthSpend(userId, m)[cat] || 0), 0) / ms.length;
      const recent = avg(recentMonths), base = avg(baseMonths);
      const r = Math.round(recent / 10) * 10, bb = Math.round(base / 10) * 10;
      const span = `${MONTHS[Number(recentMonths[2].slice(5, 7)) - 1]}–${MONTHS[Number(recentMonths[0].slice(5, 7)) - 1]}`;
      if (recent >= base * 1.4 && recent - base >= 60) {
        out.push({
          key: cat,
          title: cat === 'restaurants' ? 'You’ve been eating out more' : `You’ve been spending more on ${LABEL[cat]}`,
          detail: `About ${eur(r)} a month lately. Usually about ${eur(bb)}.`,
          why: `${cat === 'restaurants' ? 'Restaurant' : LABEL[cat][0].toUpperCase() + LABEL[cat].slice(1)} payments averaged ${eur(r)} a month in ${span}. In the ${baseMonths.length} months before, ${eur(bb)}. Numbers can’t tell us why, so we ask.`,
        });
      } else if (base >= 100 && recent <= base * 0.6 && base - recent >= 60) {
        out.push({
          key: cat,
          title: cat === 'restaurants' ? 'You’ve been eating out less' : `You’re spending less on ${LABEL[cat]}`,
          detail: `About ${eur(r)} a month lately. Usually about ${eur(bb)}.`,
          why: `${cat === 'restaurants' ? 'Restaurant' : LABEL[cat][0].toUpperCase() + LABEL[cat].slice(1)} payments averaged ${eur(r)} a month in ${span}, down from ${eur(bb)}.`,
        });
      }
    }
  }

  // A new regular payment: the same payee and amount in each of the last 3 months, never before.
  const key = (t: Transaction) => `${(t.description || '').toLowerCase()}|${Math.abs(t.amount).toFixed(2)}`;
  const outgoing = tx.filter((t) => t.amount < 0 && t.description && !['housing', 'savings_transfer'].includes(t.category));
  const inMonth = (m: string) => new Set(outgoing.filter((t) => t.date.startsWith(m)).map(key));
  const sets = recentMonths.map(inMonth);
  const before = new Set(outgoing.filter((t) => t.date.slice(0, 7) < recentMonths[2]).map(key));
  const fresh = [...sets[0]].filter((k) => sets[1].has(k) && sets[2].has(k) && !before.has(k)).slice(0, 2);
  for (const k of fresh) {
    const [desc, amt] = k.split('|');
    const name = outgoing.find((t) => key(t) === k)!.description!;
    out.push({
      key: `regular-${desc.replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`,
      title: `New regular payment: ${name}`,
      detail: `${eur(Number(amt))} a month since ${monthName(recentMonths[2])}.`,
      why: `The same payment to ${name} appeared in each of the last 3 months, and not before.`,
    });
  }
  return out;
}

/** Who last removed this entry: Nordea (no longer in the data) or the customer. */
function lastRemovedBy(id: string) {
  const ev = db.getEntryHistory(id).filter((h) => h.action === 'removed');
  return ev.length ? ev[ev.length - 1].by : undefined;
}

/** Brings Nordea's observations in line with the current data. */
export function refreshObservations(userId: string) {
  const prefix = `${userId}-obs-`;
  const seen = detect(userId);
  const now = new Date().toISOString();
  const res = { added: [] as string[], updated: [] as string[], removed: [] as string[] };
  const how = 'From new account data';
  for (const o of seen) {
    const id = prefix + o.key;
    const old = db.getCabinetEntry(id);
    if (!old) {
      const e: CabinetEntry = {
        id, userId, type: 'observation', title: o.title, detail: o.detail, why: o.why, source: 'nordea', status: 'active', private: false,
        readableBy: { abel: true, offers: false }, provenance: { channel: 'system', detectedFrom: 'transactions' },
        reviewed: false, createdAt: now, updatedAt: now,
      };
      db.addCabinetEntry(e, { by: 'nordea', how });
      res.added.push(o.title);
    } else if (old.title !== o.title || old.detail !== o.detail || (old.status === 'archived' && lastRemovedBy(id) === 'nordea')) {
      // (If the customer removed it themselves, it only comes back when the data says something new.)
      // Changed: the customer checks it again (Abel can't read it until they do).
      db.updateCabinetEntry(id, { title: o.title, detail: o.detail, why: o.why, status: 'active', reviewed: false }, { by: 'nordea', how });
      res.updated.push(o.title);
    }
  }
  const keys = new Set(seen.map((o) => prefix + o.key));
  for (const e of db.getCabinetEntries(userId)) {
    if (!e.id.startsWith(prefix) || keys.has(e.id) || e.status === 'archived') continue;
    db.updateCabinetEntry(e.id, { status: 'archived' }, { by: 'nordea', how: 'No longer seen in your account data' });
    res.removed.push(e.title);
  }
  return res;
}
