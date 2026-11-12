/**
 * v20: the three agent tables over Supabase's web API, with the project's existing
 * SUPABASE_URL + secret key - for a hosted copy (AI Studio) that has those keys but not the
 * three role connection strings (USER_DB_URL / CM_DB_URL / NORDEA_DB_URL).
 *
 * Same tables and row shape as the role path (supabase/three-agents.sql): one row per local
 * SQLite row, (user_id, table_name, id) -> data. remote.ts sends a "supabase-rest:<kind>" URL
 * here instead of to Postgres. The trade-off, written down on purpose: one project key serves
 * all three tables, so the per-agent role separation of three-agents.sql does not apply in this
 * mode. The key is used only by this sync layer (startup pull, push after writes), never by an
 * agent or a prompt. Set AGENT_STORES_VIA_SUPABASE=0 to turn the mode off.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RemoteRow } from './remote.js';

const key = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const restMirrorAvailable = () => !!process.env.SUPABASE_URL && !!key() && process.env.AGENT_STORES_VIA_SUPABASE !== '0';

let client: SupabaseClient | null = null;
const sb = () => (client ||= createClient(process.env.SUPABASE_URL!, key(), { auth: { persistSession: false, autoRefreshToken: false } }));

const PAGE = 1000; // Supabase returns at most 1000 rows per request by default

export async function restPull(table: string): Promise<RemoteRow[]> {
  const out: RemoteRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb().from(table).select('user_id, table_name, id, data').order('user_id').order('table_name').order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data || []) as RemoteRow[]));
    if (!data || data.length < PAGE) return out;
  }
}

export async function restHasRows(table: string, uid: string): Promise<boolean> {
  const { data, error } = await sb().from(table).select('id').eq('user_id', uid).limit(1);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data || []).length > 0;
}

/** Replace one customer's rows: upsert the current rows, then delete the ones that are gone.
 *  (Two requests, not one transaction - but never a moment with the customer's rows missing.) */
export async function restPush(table: string, uid: string, rows: RemoteRow[]): Promise<void> {
  const stamp = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ user_id: uid, table_name: r.table_name, id: r.id, data: r.data, updated_at: stamp }));
    const { error } = await sb().from(table).upsert(chunk, { onConflict: 'user_id,table_name,id' });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  // Rows this push did not touch belong to deleted local rows.
  const { error } = await sb().from(table).delete().eq('user_id', uid).lt('updated_at', stamp);
  if (error) throw new Error(`${table}: ${error.message}`);
}
