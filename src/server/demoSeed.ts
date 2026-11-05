// The bundled fictional demo customers (seed/demo), loaded by the app itself when its stores are
// empty. AI Studio has no terminal to run scripts/load_data.py, so without this a fresh copy would
// only ever show "No data yet". It goes through the verified legacy migration path (the same
// mapping the stores use), so the result matches what the loader writes.
// AUTO_DEMO_DATA=0 turns it off (then the app starts empty, as before).
import fs from 'fs';
import path from 'path';

const SEED = path.resolve(process.cwd(), 'seed', 'demo');
const DATA_DIR = process.env.CABINET_DATA_DIR ? path.resolve(process.env.CABINET_DATA_DIR) : path.resolve(process.cwd(), 'data');

export const autoDemoOn = () => process.env.AUTO_DEMO_DATA !== '0';

/** transactions.csv has plain comma-separated cells (no quotes); numbers become numbers. */
function readCsv(file: string): Record<string, unknown>[] {
  const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/).filter((l) => l.trim());
  const head = lines.shift()!.split(',');
  return lines.map((l) => {
    const cells = l.split(',');
    const row: Record<string, unknown> = {};
    head.forEach((h, i) => {
      const v = (cells[i] ?? '').trim();
      row[h] = h === 'amount' ? Number(v) : v;
    });
    return row;
  });
}

/** Write the demo set as a cabinet-db.json snapshot, then migrate it into the three agent stores. */
export async function loadBundledDemo(): Promise<{ ok: boolean; message: string }> {
  if (!fs.existsSync(SEED)) return { ok: false, message: 'seed/demo is missing' };
  // Never overwrite someone's own old data file: that one is moved with npm run migrate:legacy.
  if (fs.existsSync(path.join(DATA_DIR, 'cabinet-db.json'))) return { ok: false, message: 'data/cabinet-db.json exists - run npm run migrate:legacy instead' };
  const read = (n: string) => {
    const f = path.join(SEED, n);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : [];
  };
  const users = read('users.json') as { id: string }[];
  const snapshot = {
    users: Object.fromEntries(users.map((u) => [u.id, u])),
    cabinetEntries: read('cabinetEntries.json'),
    entryHistory: read('entryHistory.json'),
    messages: read('messages.json'),
    accessLog: read('accessLog.json'),
    topicLog: read('topicLog.json'),
    transactions: fs.existsSync(path.join(SEED, 'transactions.csv')) ? readCsv(path.join(SEED, 'transactions.csv')) : [],
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'cabinet-db.json'), JSON.stringify(snapshot), 'utf-8');
  const M = await import('./arch/legacyMigrate.js');
  const { remoteConfigured } = await import('./arch/store/common.js');
  const hosted = remoteConfigured('user') || remoteConfigured('cm') || remoteConfigured('nordea');
  const r = hosted ? await M.runLegacyMigrationHostedSafe() : M.runLegacyMigration();
  return r.ok
    ? { ok: true, message: `Loaded the demo customers (${users.map((u) => u.id).join(', ')})` }
    : { ok: false, message: r.failures.slice(0, 3).join('; ') };
}
