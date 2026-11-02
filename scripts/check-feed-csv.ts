// Dry-run check for a nordea_feed CSV before uploading it to Supabase.
// Parses the file exactly as a CSV reader (quoted JSON cell), validates the JSON payload, then
// applies it twice against a THROWAWAY copy of the demo database - once to prove it applies,
// once to prove re-applying is a safe no-op. The real demo database and Supabase are never touched.
// Run: npm run check:feed  (or: npx tsx scripts/check-feed-csv.ts path/to/other.csv)
import fs from 'fs';
import os from 'os';
import path from 'path';

const csvPath = path.resolve(process.argv[2] || 'supabase/nordea-feed-example.csv');

// --- Minimal RFC-4180 reader (quoted fields, "" escapes, commas, CRLF) ---
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = '', row: string[] = [], inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

let failures = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  ${extra}`}`);
  if (!cond) failures++;
};

// --- 1. CSV structure ---
check('file exists', fs.existsSync(csvPath), csvPath);
const rows = parseCsvRows(fs.readFileSync(csvPath, 'utf8'));
check('header + exactly one data row (one coherent batch)', rows.length === 2, `got ${rows.length} rows`);
const header = rows[0].map((h) => h.trim());
check('header is user_id,data,note', header.join(',') === 'user_id,data,note', header.join(','));
// id / created_at / applied_at / result are server-managed: including them risks import errors.
check('no server-managed columns (id, created_at, applied_at, result)', !header.some((h) => ['id', 'created_at', 'applied_at', 'result'].includes(h)));
const rec = Object.fromEntries(header.map((h, i) => [h, rows[1][i]]));
check('user_id present', !!rec.user_id);

// --- 2. JSON payload ---
let data: any;
try { data = JSON.parse(rec.data); } catch (e: any) { data = undefined; check('data cell is valid JSON', false, String(e?.message || e)); }
if (data) {
  check('data cell is valid JSON', true);
  const txs = Array.isArray(data.transactions) ? data.transactions : [];
  check('has transactions', txs.length > 0);
  const bad = txs.map((t: any, i: number) => ({ t, i })).filter(({ t }: any) => !/^\d{4}-\d{2}-\d{2}$/.test(String(t.date || '')) || !Number.isFinite(Number(t.amount)) || Number(t.amount) === 0);
  check('every transaction has YYYY-MM-DD date and non-zero amount', bad.length === 0, bad.map(({ i }: any) => `row ${i + 1}`).join(','));
  check('mode is snapshot or incremental when set', data.mode === undefined || data.mode === 'snapshot' || data.mode === 'incremental', String(data.mode));
}

// --- 3. Dry-run against a throwaway copy of the demo database ---
if (data) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-check-'));
  // The app ships with no data: seed the throwaway directory from the bundled demo dataset.
  const { writeDemoDb } = await import('./demo-data.js');
  writeDemoDb(tmp);
  process.env.CABINET_DATA_DIR = tmp;
  const { db } = await import('../src/server/db.js');
  const { applyNordeaData } = await import('../src/server/nordeaData.js');
  await db.init();
  const userId = rec.user_id;
  check('customer exists in the demo database', !!db.getUser(userId), `unknown customer "${userId}"`);
  const before = db.getTransactions(userId).length;
  const r1 = applyNordeaData(userId, data, `CSV check ${path.basename(csvPath)}`);
  check('first apply succeeds', r1.ok, r1.message);
  console.log(`  first apply:  ${r1.message}`);
  const mid = db.getTransactions(userId).length;
  check('transactions added', r1.added === (data.transactions || []).length && mid === before + (r1.added || 0), JSON.stringify({ before, mid, added: r1.added }));
  const r2 = applyNordeaData(userId, data, `CSV check ${path.basename(csvPath)} (re-apply)`);
  check('re-apply is a safe no-op (all skipped, none added)', r2.ok && r2.added === 0 && r2.skipped === (data.transactions || []).length, JSON.stringify({ added: r2.added, skipped: r2.skipped }));
  check('no duplicates after re-apply', db.getTransactions(userId).length === mid);
  const accs = db.getBankAccounts(userId).filter((a) => a.userId === userId);
  console.log(`  account records now: ${accs.map((a) => `${a.key}(${[a.type, a.currency].filter(Boolean).join(', ') || 'derived only'})`).join(', ')}`);
  console.log(`  balance snapshots: ${db.getBalanceSnapshots(userId).length}, import batches: ${db.getImportBatches(userId).length}`);
  console.log(`  balances after apply: current=${db.getUser(userId)!.accounts.current.balance}, savings=${db.getUser(userId)!.accounts.savings.balance}`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) FAILED - fix the CSV before uploading.` : '\nAll checks passed - the CSV is valid and applies cleanly.');
process.exit(failures ? 1 : 0);
