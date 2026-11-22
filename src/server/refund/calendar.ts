/** Refund Tracker: working-day and month arithmetic on ISO dates (YYYY-MM-DD, UTC). The weekend and
    holiday list come from refund-config/calendar.json, never from code. */
import fs from 'fs';
import path from 'path';

export interface WorkCalendar { weekend: number[]; holidays: string[] }

export function loadCalendar(file = path.resolve(process.cwd(), 'refund-config', 'calendar.json')): WorkCalendar {
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (!Array.isArray(raw.weekend) || !Array.isArray(raw.holidays)) throw new Error('calendar.json needs "weekend" and "holidays" lists');
  return { weekend: raw.weekend.map(Number), holidays: raw.holidays.map(String) };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const toUtc = (d: string) => {
  if (!ISO.test(d)) throw new Error(`not an ISO date: ${d}`);
  return new Date(`${d}T00:00:00Z`);
};
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function isWorkingDay(d: string, cal: WorkCalendar): boolean {
  return !cal.weekend.includes(toUtc(d).getUTCDay()) && !cal.holidays.includes(d);
}

export function addDays(d: string, n: number): string {
  const x = toUtc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toIso(x);
}

/** The n-th working day after `d` (d itself is not counted). */
export function addWorkingDays(d: string, n: number, cal: WorkCalendar): string {
  let cur = d;
  let left = n;
  while (left > 0) {
    cur = addDays(cur, 1);
    if (isWorkingDay(cur, cal)) left--;
  }
  return cur;
}

/** `d` itself when it is a working day, else the next working day. */
export function nextWorkingDay(d: string, cal: WorkCalendar): string {
  let cur = d;
  while (!isWorkingDay(cur, cal)) cur = addDays(cur, 1);
  return cur;
}

/** Same day `n` months later; a day past the month's end lands on its last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: string, n: number): string {
  const x = toUtc(d);
  const day = x.getUTCDate();
  const first = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return toIso(first);
}

/** Calendar days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

/** Working days after `a` up to and including `b` (0 when b is not later than a). */
export function workingDaysAfter(a: string, b: string, cal: WorkCalendar): number {
  let n = 0;
  for (let cur = addDays(a, 1); cur <= b; cur = addDays(cur, 1)) if (isWorkingDay(cur, cal)) n++;
  return n;
}
