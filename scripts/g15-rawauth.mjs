import fs from 'fs';
import pg from 'pg';
const [file, table] = [process.argv[2], process.argv[3]];
const u = fs.readFileSync(file, 'utf8').trim();
const m = u.match(/postgresql:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/(\w+)/);
const [, user, rawPw, host, port, database] = m;
const pool = new pg.Pool({ user, password: rawPw, host, port: Number(port), database, max: 1, connectionTimeoutMillis: 15000 });
try {
  const r = await pool.query('SELECT count(*)::int AS n FROM ' + table);
  console.log(`${table}: RAW password auth OK, total_rows=${r.rows[0].n}`);
} catch (e) {
  console.log(`${table}: RAW auth failed: ${String(e.message || e).slice(0, 120)}`);
} finally { await pool.end(); }
