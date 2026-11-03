import fs from 'fs';
import pg from 'pg';
const file = process.argv[2];
const table = process.argv[3];
const url = fs.readFileSync(file, 'utf8').trim();
const host = (url.match(/@([^:/]+)/) || [])[1];
console.log('host:', host, 'user:', (url.match(/:\/\/([^:]+)/) || [])[1]);
const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 15000 });
try {
  const total = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
  const fresh = await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = 'g15live'`);
  console.log(`table ${table}: total_rows=${total.rows[0].n} g15live_rows=${fresh.rows[0].n}`);
} catch (e) {
  console.log('QUERY FAILED:', String(e.message || e).slice(0, 200));
} finally { await pool.end(); }
