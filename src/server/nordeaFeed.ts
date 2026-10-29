// Watches the Supabase table "nordea_feed" for new Nordea account data and applies it (see nordeaData.ts).
// Without Supabase, new data can still be uploaded as a file in More → Nordea account data.
import { supabaseConfigured, feedPending, feedDone } from './store.js';
import { applyNordeaData, ApplyResult } from './nordeaData.js';
import { db } from './db.js';

export interface FeedStatus {
  enabled: boolean;
  ok: boolean;
  message: string;
  lastCheck?: string;
  lastApplied?: { at: string; rowId: number; userId: string; result: string };
}

let status: FeedStatus = { enabled: false, ok: true, message: 'Supabase isn’t set up, so the feed is off. You can still upload a file.' };
let busy = false;

export const feedStatus = () => status;

/** Look for new rows now. Returns what was applied. */
export async function checkFeed(): Promise<{ applied: { rowId: number; userId: string; result: ApplyResult }[]; status: FeedStatus }> {
  const applied: { rowId: number; userId: string; result: ApplyResult }[] = [];
  if (!supabaseConfigured()) return { applied, status };
  if (busy) return { applied, status };
  busy = true;
  try {
    const rows = await feedPending();
    for (const r of rows) {
      const userId = String(r.user_id || 'lauri');
      let result: ApplyResult;
      try {
        const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        result = db.getUser(userId) ? applyNordeaData(userId, data, `Supabase nordea_feed row ${r.id}${r.note ? ` (${r.note})` : ''}`) : { ok: false, message: `Unknown customer “${userId}”.` };
      } catch (err: any) {
        result = { ok: false, message: `Couldn’t read the data: ${String(err?.message || err).slice(0, 200)}` };
      }
      await feedDone(r.id, `${result.ok ? 'Applied' : 'Not applied'}: ${result.message}`);
      applied.push({ rowId: r.id, userId, result });
      status = { ...status, lastApplied: { at: new Date().toISOString(), rowId: r.id, userId, result: result.message } };
    }
    if (applied.length) await db.flush();
    status = { ...status, enabled: true, ok: true, message: 'Watching Supabase → nordea_feed for new account data.', lastCheck: new Date().toISOString() };
  } catch (err: any) {
    status = { ...status, enabled: true, ok: false, message: String(err?.message || err).slice(0, 300), lastCheck: new Date().toISOString() };
  } finally {
    busy = false;
  }
  return { applied, status };
}

/** Checks every 20 seconds while the server runs (only with Supabase). */
export function startFeedWatcher(everyMs = 20000) {
  if (!supabaseConfigured()) return;
  status = { ...status, enabled: true, message: 'Starting…' };
  checkFeed().catch(() => {});
  setInterval(() => checkFeed().catch(() => {}), everyMs).unref?.();
}
