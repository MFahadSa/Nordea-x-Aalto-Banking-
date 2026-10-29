// Where the data lives. With SUPABASE_URL and SUPABASE_SECRET_KEY set (AI Studio → Settings → Secrets),
// every record is a row in the Supabase table "abel_records" and kept files go to the private bucket
// "abel-documents". Without them, the app keeps working on the local file data/cabinet-db.json
// (fine for testing, but it resets when the hosting restarts the app).
import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const TABLE = 'abel_records';
export const BUCKET = 'abel-documents';

export interface Row {
  kind: string;
  id: string;
  user_id: string | null;
  data: any;
}

export interface Remote {
  name: string;
  loadAll(): Promise<Row[]>;
  upsert(rows: Row[]): Promise<void>;
  remove(keys: { kind: string; id: string }[]): Promise<void>;
  putFile(p: string, body: Buffer, contentType: string): Promise<void>;
  getFile(p: string): Promise<Buffer>;
  deleteFiles(paths: string[]): Promise<void>;
}

const key = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const supabaseConfigured = () => !!process.env.SUPABASE_URL && !!key();

/** Error text without anything that looks like a key. */
export function cleanErr(err: any): string {
  const raw = String(err?.message || err?.error_description || err || 'unknown error');
  return raw.replace(/sb_secret_[0-9A-Za-z_-]+/g, '[key]').replace(/eyJ[0-9A-Za-z_.-]{20,}/g, '[key]').slice(0, 300);
}

function fail(what: string, error: any): never {
  const msg = cleanErr(error);
  // PostgREST says this when the table hasn't been created yet.
  if (/abel_records|relation .* does not exist|PGRST205|schema cache/i.test(msg)) throw new Error(`The table "${TABLE}" is missing. Run supabase/setup.sql once in Supabase → SQL Editor.`);
  throw new Error(`${what}: ${msg}`);
}

export function supabaseRemote(): Remote {
  const sb: SupabaseClient = createClient(process.env.SUPABASE_URL!, key(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let bucketReady = false;
  async function ensureBucket() {
    if (bucketReady) return;
    const got = await sb.storage.getBucket(BUCKET);
    if (got.error) {
      const made = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 12 * 1024 * 1024 });
      if (made.error && !/already exists/i.test(made.error.message)) fail('Could not create the file bucket', made.error);
    }
    bucketReady = true;
  }
  return {
    name: 'supabase',
    async loadAll() {
      const out: Row[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from(TABLE).select('kind,id,user_id,data').order('kind').order('id').range(from, from + 999);
        if (error) fail('Could not read from Supabase', error);
        out.push(...((data || []) as Row[]));
        if (!data || data.length < 1000) return out;
      }
    },
    async upsert(rows) {
      const now = new Date().toISOString();
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from(TABLE).upsert(rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: now })), { onConflict: 'kind,id' });
        if (error) fail('Could not save to Supabase', error);
      }
    },
    async remove(keys) {
      const byKind = new Map<string, string[]>();
      keys.forEach((k) => byKind.set(k.kind, [...(byKind.get(k.kind) || []), k.id]));
      for (const [kind, ids] of byKind) {
        for (let i = 0; i < ids.length; i += 200) {
          const { error } = await sb.from(TABLE).delete().eq('kind', kind).in('id', ids.slice(i, i + 200));
          if (error) fail('Could not delete in Supabase', error);
        }
      }
    },
    async putFile(p, body, contentType) {
      await ensureBucket();
      const { error } = await sb.storage.from(BUCKET).upload(p, body, { contentType, upsert: true });
      if (error) fail('Could not store the file', error);
    },
    async getFile(p) {
      const { data, error } = await sb.storage.from(BUCKET).download(p);
      if (error || !data) fail('Could not open the file', error || 'not found');
      return Buffer.from(await data.arrayBuffer());
    },
    async deleteFiles(paths) {
      if (!paths.length) return;
      const { error } = await sb.storage.from(BUCKET).remove(paths);
      if (error) fail('Could not delete the file', error);
    },
  };
}

/** Files without Supabase: a local folder (resets with the hosting, like the JSON file). */
const LOCAL_DIR = path.resolve(process.cwd(), 'data', 'documents');
const safe = (p: string) => path.join(LOCAL_DIR, p.replace(/[^a-zA-Z0-9._/-]/g, '_').replace(/\.\./g, '_'));
export const localFiles = {
  async putFile(p: string, body: Buffer) {
    fs.mkdirSync(path.dirname(safe(p)), { recursive: true });
    fs.writeFileSync(safe(p), body);
  },
  async getFile(p: string) {
    return fs.readFileSync(safe(p));
  },
  async deleteFiles(paths: string[]) {
    paths.forEach((p) => fs.rmSync(safe(p), { force: true }));
  },
};

// ---------------- Nordea account data feed ----------------
// The table "nordea_feed" is where new (fictional) Nordea account data can be dropped in Supabase:
// add a row with user_id 'lauri' and the data as JSON, and the app applies it within about 20 seconds
// (or straight away with More → Nordea account data → Check Supabase now). Created by supabase/nordea-feed.sql.
export const FEED_TABLE = 'nordea_feed';
export interface FeedRow { id: number; user_id: string; data: any; note?: string | null; created_at: string }

let feedClient: SupabaseClient | null = null;
const feed = () => (feedClient ||= createClient(process.env.SUPABASE_URL!, key(), { auth: { persistSession: false, autoRefreshToken: false } }));

/** Rows not applied yet, oldest first. */
export async function feedPending(): Promise<FeedRow[]> {
  const { data, error } = await feed().from(FEED_TABLE).select('id,user_id,data,note,created_at').is('applied_at', null).order('id').limit(20);
  if (error) {
    const msg = cleanErr(error);
    if (/nordea_feed|does not exist|PGRST205|schema cache/i.test(msg)) throw new Error(`The table "${FEED_TABLE}" is missing. Run supabase/nordea-feed.sql once in Supabase → SQL Editor.`);
    throw new Error(`Could not read ${FEED_TABLE}: ${msg}`);
  }
  return (data || []) as FeedRow[];
}

/** Marks a row as done, with what happened (shown in Supabase too). */
export async function feedDone(id: number, result: string) {
  const { error } = await feed().from(FEED_TABLE).update({ applied_at: new Date().toISOString(), result: result.slice(0, 500) }).eq('id', id);
  if (error) throw new Error(`Could not mark ${FEED_TABLE} row ${id} as applied: ${cleanErr(error)}`);
}
