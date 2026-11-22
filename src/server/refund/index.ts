/** Refund Tracker: the app's one store, kept in the runtime data folder (data/refunds.json, never committed). */
import path from 'path';
import { loadCalendar } from './calendar.js';
import { loadPolicy } from './policy.js';
import { RefundStore } from './cases.js';

const DATA_DIR = process.env.CABINET_DATA_DIR ? path.resolve(process.env.CABINET_DATA_DIR) : path.resolve(process.cwd(), 'data');
let store: RefundStore | null = null;

export function refunds(): RefundStore {
  if (!store) store = new RefundStore(path.join(DATA_DIR, 'refunds.json'), path.resolve(process.cwd(), 'seed', 'refund'), () => loadPolicy(), () => loadCalendar()).load();
  return store;
}

/** Called by the demo reset: wipe everything; re-seed the story unless the demo data is switched off. */
export function resetRefunds(seed: boolean) { refunds().resetAndSeed(seed); }
