// Checks for the bank-records data model (docs/bank-records.md). Runs against a throwaway data
// directory; the demo database is never touched. Run: npm test
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cabinet-test-'));

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  ${extra}`}`);
  if (!cond) failures++;
}

const { db } = await import('../src/server/db.js');
const { applyNordeaData, parseCsv } = await import('../src/server/nordeaData.js');

const USER = 'lauri';

// Salary rows that trigger a "salary changed" observation in the demo window (demo today = 2026-10-23).
const salaryRows = [] as any[];
for (let m = 1; m <= 10; m++) {
  salaryRows.push({
    date: `2026-${String(m).padStart(2, '0')}-25`,
    amount: m >= 8 ? 3500 : 3000,
    category: 'salary',
    description: 'ACME OY PALKKA',
    bankId: `NDBANK-2026-${String(m).padStart(2, '0')}-001`,
    valueDate: `2026-${String(m).padStart(2, '0')}-25`,
    status: 'booked',
    currency: 'EUR',
    counterparty: 'Acme Oy',
    reference: 'SALARY 2026',
    type: 'credit transfer',
  });
}
const feed = {
  balances: { current: 5000, savings: 12000, asOf: '2026-10-23' },
  transactions: [
    ...salaryRows,
    // Two truly identical card purchases (no bank id): same-day duplicate content.
    { date: '2026-10-02', amount: -4.5, description: 'CAFE KAVU', type: 'card purchase' },
    { date: '2026-10-02', amount: -4.5, description: 'CAFE KAVU', type: 'card purchase' },
    // An unrecognized feed category: original kept, app guess marked as such.
    { date: '2026-10-03', amount: -45, category: 'TRAVEL', description: 'HSL ticket' },
  ],
};

// 1. Snapshot import preserves banking detail and marks enrichment honestly.
const r1 = applyNordeaData(USER, feed, 'test feed 1');
check('snapshot import ok', r1.ok, r1.message);
let tx = db.getTransactions(USER);
check('all rows stored', tx.length === 13, `got ${tx.length}`);
const sal = tx.find((t) => t.bankId === 'NDBANK-2026-08-001')!;
check('bank detail preserved', sal.valueDate === '2026-08-25' && sal.status === 'booked' && sal.currency === 'EUR' && sal.counterparty === 'Acme Oy' && sal.reference === 'SALARY 2026' && sal.paymentMethod === 'credit transfer');
check('feed-supplied category marked feed (not claimed as bank-authored)', sal.categorySource === 'feed' && sal.category === 'salary');
const travel = tx.find((t) => t.originalCategory === 'TRAVEL')!;
check('unrecognized category kept as original, guess marked app', travel.category === 'transport' && travel.categorySource === 'app', JSON.stringify(travel));
const cafe = tx.filter((t) => t.description === 'CAFE KAVU');
check('identical rows get distinct stable ids', cafe.length === 2 && cafe[0].id !== cafe[1].id, cafe.map((c) => c.id).join(' '));
check('no invented detail on sparse rows', cafe[0].valueDate === undefined && cafe[0].status === undefined && cafe[0].counterparty === undefined && cafe[0].reference === undefined);
check('batch recorded', db.getImportBatches(USER).length === 1 && db.getImportBatches(USER)[0].mode === 'snapshot' && db.getImportBatches(USER)[0].added === 13);
check('balance snapshots recorded', db.getBalanceSnapshots(USER).length === 2 && db.getBalanceSnapshots(USER, 'current')[0].balance === 5000 && db.getBalanceSnapshots(USER, 'current')[0].at === '2026-10-23');
check('current balances still updated', db.getUser(USER)!.accounts.current.balance === 5000);
const ids1 = tx.map((t) => t.id).sort().join(',');

// 2. Observations carry evidence.
const obs = db.getCabinetEntries(USER).find((e) => e.id === `${USER}-obs-salary`);
check('salary observation exists', !!obs);
check('observation has evidence', !!obs?.evidence && (obs.evidence.transactionIds?.length || 0) === 10 && !!obs.evidence.computedAt && !!obs.evidence.inputsHash && obs.evidence.periodTo === '2026-10', JSON.stringify(obs?.evidence?.transactionIds?.length));
check('evidence ids point at real transactions', (obs?.evidence?.transactionIds || []).every((id) => tx.some((t) => t.id === id)));

// 3. Re-importing the same data as a snapshot keeps the same ids.
const r2 = applyNordeaData(USER, feed, 'test feed 2');
const ids2 = db.getTransactions(USER).map((t) => t.id).sort().join(',');
check('snapshot re-import keeps stable ids', r2.ok && ids1 === ids2);

// 4. Incremental re-import is a no-op.
const r3 = applyNordeaData(USER, { ...feed, mode: 'incremental' }, 'test feed 3');
check('incremental re-import adds nothing', r3.ok && r3.added === 0 && r3.skipped === 13, JSON.stringify({ added: r3.added, skipped: r3.skipped }));
check('still 13 transactions', db.getTransactions(USER).length === 13);

// 5. Incremental with one new row adds exactly one.
const r4 = applyNordeaData(USER, { mode: 'incremental', transactions: [...feed.transactions, { date: '2026-10-24', amount: -9.9, description: 'NEW KIOSK', account: 'current' }] }, 'test feed 4');
check('incremental adds only the new row', r4.ok && r4.added === 1 && r4.skipped === 13, JSON.stringify({ added: r4.added, skipped: r4.skipped }));
check('14 transactions now', db.getTransactions(USER).length === 14);
check('old ids untouched by merge', db.getTransactions(USER).filter((t) => t.description === 'CAFE KAVU').every((t) => ids1.includes(t.id)));

// 6. Half of an incremental batch can be new.
const r5 = applyNordeaData(USER, { mode: 'incremental', transactions: [{ date: '2026-10-24', amount: -9.9, description: 'NEW KIOSK', account: 'current' }, { date: '2026-10-25', amount: -1, description: 'ANOTHER NEW ONE' }] }, 'test feed 5');
check('partial dedupe', r5.ok && r5.added === 1 && r5.skipped === 1, JSON.stringify({ added: r5.added, skipped: r5.skipped }));

// 7. The exact shape of our earlier delivered feed: upstream-normalized category + original kept.
{
  const r = applyNordeaData(USER, { mode: 'incremental', transactions: [{ date: '2026-10-26', amount: -30, category: 'transport', originalCategory: 'TRAVEL', description: 'HSL single ticket' }] }, 'test feed normalized');
  const t = db.getTransactions(USER).find((x) => x.description === 'HSL single ticket')!;
  check('upstream-normalized category: kept, original preserved, marked feed', r.ok && t.category === 'transport' && t.originalCategory === 'TRAVEL' && t.categorySource === 'feed', JSON.stringify(t));
}

// 8. Same date/amount/description/account but different currency = two different transactions.
{
  const r = applyNordeaData(USER, { mode: 'incremental', transactions: [
    { date: '2026-10-27', amount: -20, description: 'BORDER SHOP', currency: 'EUR' },
    { date: '2026-10-27', amount: -20, description: 'BORDER SHOP', currency: 'SEK' },
  ] }, 'test feed currency');
  const both = db.getTransactions(USER).filter((x) => x.description === 'BORDER SHOP');
  check('currency distinguishes otherwise-identical rows', r.ok && r.added === 2 && both.length === 2 && both[0].id !== both[1].id, JSON.stringify({ added: r.added, ids: both.map((b) => b.id) }));
}

// 9. A pending transaction that later books, re-sent under the same bank id, is corrected in place.
{
  const row = { date: '2026-10-28', amount: -55, description: 'FUEL NESTE', bankId: 'BK-PEND-1', status: 'pending', currency: 'EUR' };
  const r1 = applyNordeaData(USER, { mode: 'incremental', transactions: [row] }, 'test feed pending');
  const id1 = db.getTransactions(USER).find((x) => x.bankId === 'BK-PEND-1')!.id;
  const r2 = applyNordeaData(USER, { mode: 'incremental', transactions: [{ ...row, status: 'booked' }] }, 'test feed booked');
  const t = db.getTransactions(USER).find((x) => x.bankId === 'BK-PEND-1')!;
  check('pending -> booked under same bank id updates in place', r1.ok && r2.ok && r2.added === 0 && r2.updated === 1 && t.id === id1 && t.status === 'booked', JSON.stringify({ added: r2.added, updated: r2.updated, status: t.status }));
}

// 10. Explicit account records: derived from the customer record, extended only by supplied fields.
{
  const accs = db.getBankAccounts(USER);
  check('account records derived', accs.some((a) => a.key === 'current') && accs.some((a) => a.key === 'savings'), JSON.stringify(accs));
  check('no invented currency on derived records', accs.every((a) => a.currency === undefined));
  const r = applyNordeaData(USER, { accounts: [{ key: 'current', currency: 'EUR', type: 'current account' }, { key: 'asp', type: 'ASP' }] }, 'test feed accounts');
  const cur = db.getBankAccounts(USER).find((a) => a.key === 'current')!;
  const asp = db.getBankAccounts(USER).find((a) => a.key === 'asp')!;
  check('feed-supplied account fields stored, new account key added', r.ok && cur.currency === 'EUR' && cur.type === 'current account' && !!asp && asp.type === 'ASP' && asp.currency === undefined, JSON.stringify({ cur, asp }));
}

// 11. CSV parsing still works (sparse rows, guessed categories).
const csv = parseCsv('date,description,amount\n2026-10-01,K-MARKET,-32.40\n2026-10-02,PALKKA,3000');
check('csv parses', csv.transactions?.length === 2 && csv.transactions[1].amount === 3000);

// 12. Old saved databases migrate: new lists appear.
const st: any = db.getState();
check('state has new lists', Array.isArray(st.balanceSnapshots) && Array.isArray(st.importBatches) && Array.isArray(st.bankAccounts));

fs.rmSync(process.env.CABINET_DATA_DIR, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
