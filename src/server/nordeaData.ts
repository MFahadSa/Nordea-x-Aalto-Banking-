// Nordea's side of the cabinet: the bank's own (fictional) account data for a customer.
// New data can come from a file uploaded in More → Nordea account data, or from a row added to the Supabase
// table "nordea_feed". Either way:
//  1. the customer's transactions are replaced (snapshot mode, the default) or merged in (incremental mode)
//     and the balances updated (Abel's FACTS change at once);
//  2. "Nordea noticed" is worked out again from the new data: new observations are added, changed ones are
//     updated, and ones the data no longer shows are archived. New or changed observations wait for the
//     customer to confirm them (until then Abel can't read them, as before).
//
// Data-structuring rules kept here:
//  - Stable identity: a transaction keeps the same id across re-imports (the bank's own reference when the
//    feed supplies one, otherwise a fingerprint of date+amount+description+account). Re-applying the same
//    data never duplicates rows.
//  - Original vs enrichment: a category the feed supplied is kept verbatim (originalCategory) and marked
//    categorySource 'feed' - the feed supplying a value does NOT prove the bank authored it (upstream
//    tooling may already have normalized it), so the app never calls it the bank's own. A keyword-guessed
//    category is marked 'app'.
//  - Unknown stays unknown: booking/value dates, status, currency, counterparty, reference and payment
//    method are stored only when the data actually carries them. The app never invents banking detail.
//  - Evidence: every "Nordea noticed" entry records the transactions and period it was computed from, so it
//    can be checked, and recomputed when the underlying data changes.
import { db } from './db.js';
import * as fin from './finance.js';
import { CabinetEntry, Transaction } from '../types.js';

export interface NordeaFeedTransaction {
  date: string;
  amount: number;
  category?: string;
  description?: string;
  account?: string;
  // Optional banking detail (stored only when present):
  bankId?: string;
  bankReference?: string; // accepted alias of bankId
  valueDate?: string;
  status?: string;
  currency?: string;
  counterparty?: string;
  reference?: string;
  type?: string; // payment method as banks usually name the field
  paymentMethod?: string;
  originalCategory?: string;
}

export interface NordeaData {
  customer?: string;
  /** snapshot (default): the data is the whole statement and replaces the old one.
      incremental: only new transactions are added; known ones are skipped. */
  mode?: 'snapshot' | 'incremental';
  /** Optional explicit account records. Only the fields supplied are stored; nothing is invented. */
  accounts?: { key: string; type?: string; iban?: string; currency?: string }[];
  balances?: { current?: number; savings?: number; carFund?: number; monthlySavingsDeposit?: number; asOf?: string };
  transactions?: NordeaFeedTransaction[];
}

export interface ApplyResult {
  ok: boolean;
  message: string;
  mode?: 'snapshot' | 'incremental';
  transactions?: number;
  added?: number;
  skipped?: number;
  updated?: number;
  batchId?: string;
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

/** Small deterministic fingerprint (FNV-1a), so the same bank row gets the same id on every import. */
function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** What identifies a bank row when the feed gives no reference of its own. */
const contentKey = (t: { date: string; amount: number; description?: string; account?: string; currency?: string }) =>
  `${t.date}|${t.amount.toFixed(2)}|${(t.description || '').toLowerCase()}|${t.account || 'current'}|${t.currency || ''}`;

const cleanIdPart = (s: string) => s.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 60);

/**
 * Stable ids for one import list. A bank-supplied reference wins; otherwise the content fingerprint.
 * Repeated identical rows get -2, -3… in order, so re-importing the same file yields the same ids.
 */
function assignIds(userId: string, items: { bankId?: string; date: string; amount: number; description?: string; account?: string }[]): string[] {
  const counts = new Map<string, number>();
  return items.map((x) => {
    const base = x.bankId ? `nd-${userId}-bank-${cleanIdPart(x.bankId)}` : `nd-${userId}-h-${fingerprint(contentKey(x))}`;
    const n = (counts.get(base) || 0) + 1;
    counts.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const optDate = (v: unknown) => {
  const s = String(v || '').slice(0, 10);
  return DATE_RE.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined;
};
const optStr = (v: unknown, max = 120) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : undefined;
};

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
  const mode: 'snapshot' | 'incremental' = data.mode === 'incremental' ? 'incremental' : 'snapshot';
  const batchId = `batch-${userId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // 1. Transactions
  let txCount: number | undefined;
  let addedCount: number | undefined;
  let skippedCount: number | undefined;
  let updatedCount = 0;
  let rejected = 0;
  if (Array.isArray(data.transactions)) {
    const rows: { tx: Transaction; bankId?: string }[] = [];
    const bad: number[] = [];
    data.transactions.forEach((x, i) => {
      const date = optDate(x?.date);
      const amount = Number(x?.amount);
      if (!date || !Number.isFinite(amount) || amount === 0) { bad.push(i + 1); return; }
      const desc = String(x.description || '').slice(0, 80);
      const rawCategory = optStr(x.category, 60);
      const fromFeed = rawCategory && CATEGORIES.has(rawCategory as Transaction['category']);
      // A category the feed supplied is used verbatim when it's one we know; otherwise the app guesses and
      // says so. 'feed' means "came in the data", not "the bank categorized it". The original value is
      // never thrown away.
      const category = fromFeed ? (rawCategory as Transaction['category']) : guessCategory(desc, amount);
      const originalCategory = optStr(x.originalCategory, 60) || (rawCategory && rawCategory !== category ? rawCategory : undefined);
      const status = /^\s*pending\s*$/i.test(String(x.status || '')) ? 'pending' : /^\s*booked\s*$/i.test(String(x.status || '')) ? 'booked' : undefined;
      const currency = /^[A-Za-z]{3}$/.test(String(x.currency || '')) ? String(x.currency).toUpperCase() : undefined;
      rows.push({
        bankId: optStr(x.bankId, 60) || optStr(x.bankReference, 60),
        tx: {
          bankId: optStr(x.bankId, 60) || optStr(x.bankReference, 60),
          id: '',
          userId,
          date,
          category,
          amount: Math.round(amount * 100) / 100,
          account: x.account === 'savings' ? 'savings' : 'current',
          description: desc || undefined,
          valueDate: optDate(x.valueDate),
          status,
          currency,
          counterparty: optStr(x.counterparty),
          reference: optStr(x.reference),
          paymentMethod: optStr(x.paymentMethod, 60) || optStr(x.type, 60),
          originalCategory,
          categorySource: fromFeed ? 'feed' : 'app',
          batchId,
        },
      });
    });
    if (!rows.length) return { ok: false, message: 'No usable transactions: each needs a date (YYYY-MM-DD) and an amount.' };
    if (bad.length > rows.length / 4) return { ok: false, message: `Too many rows couldn’t be read (rows ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? '…' : ''}). Check the date (YYYY-MM-DD) and amount columns.` };
    rejected = bad.length;
    const ids = assignIds(userId, rows.map((r) => ({ bankId: r.bankId, ...r.tx })));
    const list: Transaction[] = rows.map((r, i) => ({ ...r.tx, id: ids[i] }));
    list.sort((a, b) => a.date.localeCompare(b.date));
    if (mode === 'incremental') {
      const { added, skipped, updated } = db.upsertTransactions(userId, list);
      addedCount = added.length;
      skippedCount = skipped.length;
      updatedCount = updated.length;
      txCount = db.getTransactions(userId).length;
    } else {
      db.replaceTransactions(userId, list);
      addedCount = list.length;
      skippedCount = 0;
      txCount = list.length;
    }
  }

  // 2. Balances (current values on the customer, plus a dated snapshot per account for the history)
  const b = data.balances;
  let balances = false;
  if (b && typeof b === 'object') {
    const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
    const cur = num(b.current), sav = num(b.savings), car = num(b.carFund), dep = num(b.monthlySavingsDeposit);
    const acc = JSON.parse(JSON.stringify(user.accounts));
    const at = optDate(b.asOf) || new Date().toISOString().slice(0, 10);
    const snap = (accountKey: string, balance: number | undefined) => {
      if (balance === undefined || !Number.isFinite(balance)) return;
      db.addBalanceSnapshot({ id: `snap-${userId}-${accountKey}-${at}-${batchId}`, userId, accountKey, balance, at, source: from, batchId });
    };
    if (cur !== undefined && Number.isFinite(cur)) acc.current.balance = cur;
    if (sav !== undefined && Number.isFinite(sav)) acc.savings.balance = sav;
    if (dep !== undefined && Number.isFinite(dep) && dep >= 0) acc.savings.monthlyDeposit = dep;
    if (car !== undefined && Number.isFinite(car)) acc.carFund = { ...(acc.carFund || { iban: 'FI29 1234 5678 9012 36' }), balance: car };
    snap('current', cur);
    snap('savings', sav);
    snap('carFund', car);
    db.updateUser(userId, { accounts: acc });
    balances = true;
  }
  // 2b. Explicit account records (optional; only supplied fields are stored).
  let accountsApplied = 0;
  if (Array.isArray(data.accounts)) {
    for (const a of data.accounts) {
      const key = optStr(a?.key, 40);
      if (!key) continue;
      db.upsertBankAccount(userId, key, { type: optStr(a.type, 60), iban: optStr(a.iban, 40), currency: /^[A-Za-z]{3}$/.test(String(a.currency || '')) ? String(a.currency).toUpperCase() : undefined });
      accountsApplied++;
    }
  }
  if (txCount === undefined && !balances && !accountsApplied) return { ok: false, message: 'Nothing to apply: the data needs "transactions", "balances" and/or "accounts".' };

  // 3. Remember the import itself: where it came from, its mode, and what it did.
  db.addImportBatch({
    id: batchId, userId, source: from, mode, at: new Date().toISOString(),
    received: Array.isArray(data.transactions) ? data.transactions.length : 0,
    added: addedCount ?? 0, skipped: skippedCount ?? 0, rejected, updated: updatedCount,
  });

  // 4. What Nordea noticed, worked out again from the new data (observations whose inputs changed are
  //    recomputed here; ones the data no longer shows are archived).
  const noticed = refreshObservations(userId);
  db.updateUser(userId, { nordeaData: { from, at: new Date().toISOString(), transactions: txCount ?? db.getTransactions(userId).length, balances } });
  const parts = [
    mode === 'incremental'
      ? `${addedCount} new transaction${addedCount === 1 ? '' : 's'}${skippedCount ? ` (${skippedCount} already known)` : ''}${updatedCount ? `, ${updatedCount} corrected` : ''}`
      : `${addedCount} transaction${addedCount === 1 ? '' : 's'}`,
    balances ? 'balances' : '',
    accountsApplied ? `${accountsApplied} account record${accountsApplied === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' and ');
  const n = noticed;
  const what = [n.added.length ? `${n.added.length} new` : '', n.updated.length ? `${n.updated.length} changed` : '', n.removed.length ? `${n.removed.length} no longer seen` : ''].filter(Boolean).join(', ');
  return {
    ok: true,
    message: `Updated ${parts}.${what ? ` Nordea noticed: ${what}.` : ' Nothing new for Nordea to notice.'}`,
    mode, transactions: txCount, added: addedCount, skipped: skippedCount, updated: updatedCount, batchId, balances, noticed,
  };
}

// ---------------- What Nordea notices ----------------
const LABEL: Record<string, string> = { restaurants: 'eating out', groceries: 'groceries', shopping: 'shopping', transport: 'transport', bills: 'bills', subscriptions: 'subscriptions', pharmacy: 'the pharmacy' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const eur = (n: number) => `${Math.round(n).toLocaleString('fi-FI').replace(/\s/g, ' ')} €`;

interface Seen {
  key: string;
  title: string;
  detail: string;
  why: string;
  /** What the conclusion rests on: the transactions and the analysis window. */
  transactionIds: string[];
  periodFrom: string;
  periodTo: string;
}

function detect(userId: string): Seen[] {
  const out: Seen[] = [];
  const tx = db.getTransactions(userId);
  if (!tx.length) return out;

  // Salary or pension changed in the last 12 months.
  const s = fin.salaryInfo(userId);
  if (s.found && s.changed && s.changeMonth && fin.monthsBetween(s.changeMonth, fin.CUR_MONTH) <= 12) {
    const up = s.difference > 0;
    const pay = tx.filter((t) => (t.category === 'salary' || t.category === 'pension'));
    const n = pay.filter((t) => t.date.slice(0, 7) >= s.changeMonth!).length;
    out.push({
      key: 'salary',
      title: `Your salary went ${up ? 'up' : 'down'} in ${monthName(s.changeMonth)}`,
      detail: `From ${eur(s.from)} to ${eur(s.to)} a month.`,
      why: `Your last ${n} salary ${n === 1 ? 'payment was' : 'payments were'} ${eur(s.to)}. Before ${MONTHS[Number(s.changeMonth.slice(5, 7)) - 1]} they were ${eur(s.from)}.`,
      transactionIds: pay.map((t) => t.id),
      periodFrom: fin.addMonths(s.changeMonth, -6),
      periodTo: fin.CUR_MONTH,
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
      const evidenceIds = tx.filter((t) => t.category === cat && t.amount < 0 && [...recentMonths, ...baseMonths].some((m) => t.date.startsWith(m))).map((t) => t.id);
      if (recent >= base * 1.4 && recent - base >= 60) {
        out.push({
          key: cat,
          title: cat === 'restaurants' ? 'You’ve been eating out more' : `You’ve been spending more on ${LABEL[cat]}`,
          detail: `About ${eur(r)} a month lately. Usually about ${eur(bb)}.`,
          why: `${cat === 'restaurants' ? 'Restaurant' : LABEL[cat][0].toUpperCase() + LABEL[cat].slice(1)} payments averaged ${eur(r)} a month in ${span}. In the ${baseMonths.length} months before, ${eur(bb)}. Numbers can’t tell us why, so we ask.`,
          transactionIds: evidenceIds,
          periodFrom: baseMonths[baseMonths.length - 1],
          periodTo: recentMonths[0],
        });
      } else if (base >= 100 && recent <= base * 0.6 && base - recent >= 60) {
        out.push({
          key: cat,
          title: cat === 'restaurants' ? 'You’ve been eating out less' : `You’re spending less on ${LABEL[cat]}`,
          detail: `About ${eur(r)} a month lately. Usually about ${eur(bb)}.`,
          why: `${cat === 'restaurants' ? 'Restaurant' : LABEL[cat][0].toUpperCase() + LABEL[cat].slice(1)} payments averaged ${eur(r)} a month in ${span}, down from ${eur(bb)}.`,
          transactionIds: evidenceIds,
          periodFrom: baseMonths[baseMonths.length - 1],
          periodTo: recentMonths[0],
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
    const matches = outgoing.filter((t) => key(t) === k && recentMonths.some((m) => t.date.startsWith(m)));
    const name = matches[0]!.description!;
    out.push({
      key: `regular-${desc.replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`,
      title: `New regular payment: ${name}`,
      detail: `${eur(Number(amt))} a month since ${monthName(recentMonths[2])}.`,
      why: `The same payment to ${name} appeared in each of the last 3 months, and not before.`,
      transactionIds: matches.map((t) => t.id),
      periodFrom: recentMonths[2],
      periodTo: recentMonths[0],
    });
  }
  return out;
}

/** Fingerprint of an observation's inputs: when this changes, the conclusion was recomputed. */
const evidenceHash = (o: Seen) => fingerprint([...o.transactionIds].sort().join(',') + '|' + o.title + '|' + o.detail);

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
    const evidence = { transactionIds: o.transactionIds, periodFrom: o.periodFrom, periodTo: o.periodTo, computedAt: now, inputsHash: evidenceHash(o) };
    const old = db.getCabinetEntry(id);
    if (!old) {
      const e: CabinetEntry = {
        id, userId, type: 'observation', title: o.title, detail: o.detail, why: o.why, source: 'nordea', status: 'active', private: false,
        readableBy: { abel: true, offers: false }, provenance: { channel: 'system', detectedFrom: 'transactions' },
        evidence,
        reviewed: false, createdAt: now, updatedAt: now,
      };
      db.addCabinetEntry(e, { by: 'nordea', how });
      res.added.push(o.title);
    } else if (old.title !== o.title || old.detail !== o.detail || (old.status === 'archived' && lastRemovedBy(id) === 'nordea')) {
      // (If the customer removed it themselves, it only comes back when the data says something new.)
      // Changed: the customer checks it again (Abel can't read it until they do).
      db.updateCabinetEntry(id, { title: o.title, detail: o.detail, why: o.why, status: 'active', reviewed: false, evidence }, { by: 'nordea', how });
      res.updated.push(o.title);
    } else if (!old.evidence || old.evidence.inputsHash !== evidence.inputsHash) {
      // Same conclusion, but it predates evidence-keeping or its inputs moved underneath it: refresh the
      // evidence quietly so the entry always says what it currently rests on.
      db.updateCabinetEntry(id, { evidence }, { by: 'nordea', how });
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
