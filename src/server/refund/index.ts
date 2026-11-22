/** Refund Tracker: the app's one store, kept in the runtime data folder (data/refunds.json, never committed). */
import path from 'path';
import { loadCalendar } from './calendar.js';
import { loadPolicy } from './policy.js';
import { RefundStore } from './cases.js';
import { DEMO_TODAY } from '../finance.js';
import { db } from '../db.js';

const DATA_DIR = process.env.CABINET_DATA_DIR ? path.resolve(process.env.CABINET_DATA_DIR) : path.resolve(process.cwd(), 'data');
let store: RefundStore | null = null;
/** The demo's "now": the demo date with today's time of day, so case dates and the log match the status (23 Oct 2026). */
const demoNow = () => `${DEMO_TODAY}T${new Date().toISOString().slice(11)}`;

/** Counted refund money moves the fictional current-account balance, the same way transfers between the
    customer's own accounts do. A customer without loaded balances (bare test stores) is a no-op. */
const moveBalance = (userId: string, deltaCents: number) => {
  const u = db.getUser(userId);
  if (!u) return;
  const cur = u.accounts.current.balance;
  db.updateUser(userId, { accounts: { ...u.accounts, current: { ...u.accounts.current, balance: Math.round((cur + deltaCents / 100) * 100) / 100 } } });
};

export function refunds(): RefundStore {
  if (!store) {
    store = new RefundStore(path.join(DATA_DIR, 'refunds.json'), path.resolve(process.cwd(), 'seed', 'refund'), () => loadPolicy(), () => loadCalendar(), demoNow, moveBalance).load();
    // Cases counted before the balance link existed catch up once here, never twice (the counter persists).
    for (const c of store.data.cases) store.reconcileBalance(c.id);
  }
  return store;
}

/** Called by the demo reset: wipe everything; re-seed the story unless the demo data is switched off. */
export function resetRefunds(seed: boolean) { refunds().resetAndSeed(seed); }
