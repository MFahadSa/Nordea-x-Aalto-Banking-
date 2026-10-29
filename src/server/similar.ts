// Duplicate and contradiction check, done in code (not by the model) before anything new is saved.
import { db } from './db.js';
import { CabinetEntry } from '../types.js';

const STOP = new Set(
  'the and for new our you are was but not all any can get got set one two out per off own too yes now its his her him she who how why may way day '.concat('with from that this about month months year years want have save saving for the and into your will would more less some plan plans really just like also been them they their there what when then than very january february march april june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec').split(' '),
);

export function words(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-zåäö]{3,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.replace(/s$/, '')));
}

export interface Candidate {
  type: string;
  title: string;
  detail?: string;
  goalType?: string;
  target?: { amount: number; date: string };
}

/** The closest active thing Abel already knows that looks like the same thing, if any. */
export function findSimilar(userId: string, c: Candidate): CabinetEntry | undefined {
  const mine = words(`${c.title} ${c.detail || ''}`);
  const titleW = words(c.title);
  let best: { e: CabinetEntry; score: number } | undefined;
  for (const e of db.getCabinetEntries(userId)) {
    if (e.status === 'archived' || e.type === 'blind_spot') continue;
    const theirs = words(`${e.title} ${e.detail}`);
    const overlap = [...mine].filter((w) => theirs.has(w)).length;
    const titleHit = [...titleW].filter((w) => theirs.has(w)).length;
    const sameGoalKind = c.type === 'goal' && e.type === 'goal' && !!c.goalType && c.goalType !== 'other' && c.goalType === e.goalType;
    const ok = sameGoalKind || overlap >= 2 || (c.type === e.type && titleHit >= 1);
    if (!ok) continue;
    const score = overlap + titleHit + (sameGoalKind ? 3 : 0) + (c.type === e.type ? 1 : 0);
    if (!best || score > best.score) best = { e, score };
  }
  return best?.e;
}

/**
 * How a new candidate relates to the thing already known:
 * - conflict: both have an amount/date and they differ (e.g. 30 000 € vs 35 000 €)
 * - adds: the new one has an amount/date, the old one doesn't
 * - same: nothing new (every meaningful word is already there)
 * - different: similar, but not clearly the same, so the customer decides
 */
export function compare(existing: CabinetEntry, c: Candidate): 'conflict' | 'adds' | 'same' | 'different' {
  if (c.target && existing.target) {
    if (Math.abs(c.target.amount - existing.target.amount) > 1 || c.target.date.slice(0, 7) !== existing.target.date.slice(0, 7)) return 'conflict';
  } else if (c.target && !existing.target) return 'adds';
  const theirs = words(`${existing.title} ${existing.detail}`);
  const mine = [...words(c.title)];
  return mine.length && mine.every((w) => theirs.has(w)) ? 'same' : 'different';
}
