import { useEffect, useState } from 'react';
import type { RCase } from './Refund.js';

export const eur = (n: number) => n.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0€';
export const dayShort = (iso?: string) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
export const workdaysLate = (from?: string, to?: string) => {
  if (!from || !to) return 0;
  let n = 0; const d = new Date(from + 'T12:00:00'); const end = new Date(to + 'T12:00:00');
  while (d < end) { d.setDate(d.getDate() + 1); if (d.getDay() % 6 !== 0) n++; }
  return n;
};

export interface RNotice { key: string; title: string; sub: string; detail: string; tone: 'amber' | 'green' }
const openCase = (v: { cases: RCase[] } | null) => v?.cases.filter((c) => !c.withdrawn).slice(-1)[0];

/** What Home and the bell say about the open refund. Numbers, dates and actions come from the case. */
export const refundNotice = (v: { cases: RCase[] } | null): RNotice | null => {
  const c = openCase(v);
  if (!v || !c) return null;
  const shop = c.merchant ?? 'the shop';
  // A new key means something changed that the customer should see again, even after "Later".
  const last = (c.shopMessages ?? []).slice(-1)[0];
  const sig = [c.received ?? 0, c.remaining ?? 0, c.promiseDate ?? '', c.asOf ?? '', c.needsReview ?? 0, c.canWrite ?? '', c.shopDeclinedAt ? 'd' : '', (c.shopMessages ?? []).length, last?.kind ?? '', (c.flags ?? []).length].join('|');
  const key = `${c.id}:${sig}`;
  if (c.expected == null) return { key, tone: 'amber', title: "Abel can't match your refund yet", sub: 'The records you allowed do not show what was bought or for how much.', detail: 'Open the case to see what Abel could read and what is missing.' };
  // A credit that needs a check comes first, even when the amount looks complete.
  if (c.needsReview) return { key, tone: 'amber', title: 'A credit came in that needs your check', sub: 'It is not counted yet.', detail: 'Open the case to say whether it is yours.' };
  const got = (c.received ?? 0) >= c.expected && (c.received ?? 0) > 0;
  const money = eur(c.expected);
  if (got) return { key, tone: 'green', title: `Your ${shop} refund arrived`, sub: `${money} · counted`, detail: 'The full amount is counted. Open the case to see the credits.' };
  const waiting = last?.direction === 'out';
  const act = c.canWrite === 'reminder' ? 'Abel can prepare a reminder for you to approve.' : c.canWrite === 'answer' ? 'Abel can prepare an answer for you to approve.' : c.canWrite === 'inquiry' ? 'Abel can write to the shop for you to approve.' : waiting ? 'You wrote to the shop and are waiting for its reply.' : 'Open the case to see where it stands.';
  const actShort = c.canWrite === 'reminder' ? 'Abel can prepare a reminder for you' : c.canWrite === 'answer' ? 'Abel can prepare an answer for you' : c.canWrite === 'inquiry' ? 'Abel can write to the shop for you' : waiting ? 'Waiting for the shop to reply' : 'Open the case for details';
  const approve = c.canWrite ? ' Nothing is sent until you say so.' : '';
  if (c.shopDeclinedAt) return { key, tone: 'amber', title: `The shop declined your ${shop} refund`, sub: `${c.remaining != null ? eur(c.remaining) : 'The refund'} still unpaid · the case stays open`, detail: `Abel keeps watching. Nothing is sent without you.` };
  if (c.promiseDate && c.late) {
    const late = workdaysLate(c.promiseDate, c.asOf);
    return { key, tone: 'amber', title: `Your ${shop} refund is ${late === 1 ? '1 working day' : `${late} working days`} late`, sub: actShort, detail: `${money} · promised by ${dayShort(c.promiseDate)}. ${act}${approve}` };
  }
  return { key, tone: 'amber', title: `Abel is watching for your ${shop} refund`, sub: c.promiseDate ? `Promised by ${dayShort(c.promiseDate)}` : 'No promised date in the records you allowed', detail: `${act}${approve}` };
};

/** "Later" in the bell list, kept for this session. Anything that reads it updates at once. */
const subs = new Set<() => void>();
const later = new Set<string>();
export const laterStore = {
  has: (k: string) => later.has(k),
  add: (k: string) => { later.add(k); subs.forEach((f) => f()); },
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  clear: () => { later.clear(); subs.forEach((f) => f()); },
};
export const useLaterVersion = () => {
  const [, bump] = useState(0);
  useEffect(() => laterStore.subscribe(() => bump((x) => x + 1)), []);
};
