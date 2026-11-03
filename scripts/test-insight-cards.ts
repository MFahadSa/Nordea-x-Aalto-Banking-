/**
 * Insight card tests: the deterministic builder computes every figure from the matched rows,
 * honest sparse wording, scenario/projection labeling, the model figure guard, the --init
 * setup SQL idempotency, and the aggregate-evidence regression.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'insight-test-'));
process.env.CABINET_DATA_DIR = CABINET_DATA_DIR;

const I = await import('../src/server/arch/insight.js');
const N = await import('../src/server/arch/agents/nordea.js');
const S = await import('../src/server/arch/store/index.js');

let passed = 0;
let failed = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${extra}`); }
};

// Fixture: 6 covered months of Japan-tagged rows. Spending: restaurants 60x3 + 90x3, shopping 40x6;
// savings transfers 200x6; one salary credit. Expected figures below are tied out by hand.
const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
type Tx = { id: string; userId: string; date: string; category: string; amount: number; account: string; description: string; counterparty: string };
const TX: Tx[] = [];
let n = 0;
const add = (month: string, category: string, amount: number, description: string) =>
  TX.push({ id: `tx${++n}`, userId: 'u', date: `${month}-02`, category, amount, account: 'current', description, counterparty: '' });
months.forEach((m, i) => add(m, 'restaurants', i < 3 ? -60 : -90, 'Japan dinner club'));
months.forEach((m) => add(m, 'shopping', -40, 'Japan phrasebook'));
months.forEach((m) => add(m, 'savings_transfer', -200, 'Japan trip fund'));
add('2026-10', 'salary', 3900, 'Japan project bonus');

const a = I.analyseMatches(TX as never);
check('tie-out: matched rows and evidence totals', a.matched === 19 && a.total === 5790, JSON.stringify({ matched: a.matched, total: a.total }));
check('tie-out: income and savings transfers are never spending', a.spendingRows === 12 && a.spendingTotal === 690, JSON.stringify({ rows: a.spendingRows, total: a.spendingTotal }));
check('tie-out: whole-EUR monthly average over covered months', a.monthlyAvg === 115 && a.coverageMonths === 6 && a.firstDate === '2026-05-02' && a.lastDate === '2026-10-02', JSON.stringify({ avg: a.monthlyAvg, months: a.coverageMonths }));
check('tie-out: changePct is last 3 covered months vs the 3 before, signed', a.changePct === 30, String(a.changePct));
check('tie-out: category shares are consumption-only', a.topCategories.length === 2 && a.topCategories[0].name === 'restaurants' && a.topCategories[0].sharePct === 65 && a.topCategories[1].sharePct === 35, JSON.stringify(a.topCategories));
check('tie-out: savings pace from matched savings transfers', a.savingsMonthlyAvg === 200, String(a.savingsMonthlyAvg));

const card = I.buildGoalCard('Japan trip 3 000 € by 2027-06', a);
check('card leads with meaning, not an aggregate', card.text.startsWith('Spending linked to this goal is mostly restaurants, and it is rising.'), card.text);
check('supporting numbers sit in the expandable evidence, not the headline', !card.text.includes('averages about') && card.evidence.includes('It averages about 115 EUR a month over 6 spending months (12 purchases, 2026-05-02 to 2026-10-02).') && card.evidence.includes('Biggest drivers: restaurants 65%, shopping 35%.'), card.text + ' || ' + card.evidence);
check('card states the direction of change honestly', card.evidence.includes('up about 30% on the three months before.'), card.evidence);
check('scenario is labeled and sized from the code average', card.text.includes('Scenario: cutting restaurants by a third would free about 25 EUR a month'), card.text);
check('projection is labeled and uses the title target with the matched savings pace', card.text.includes('the 3000 EUR target takes about 15 months (goal date 2027-06)'), card.text);
check('card text never repeats the goal title (lifecycle duplicate rule)', !card.text.includes('Japan trip'), card.text);
check('every figure in the card text and evidence is grounded', I.textFiguresGrounded(card.text + ' ' + card.evidence, a.figures), JSON.stringify(I.figuresFromText(card.text + ' ' + card.evidence)));

// Scenario withheld when the cuttable share is too small.
const small = I.analyseMatches([
  ...months.map((m) => ({ id: `a${m}`, userId: 'u', date: `${m}-02`, category: 'restaurants', amount: -10, account: 'current', description: 'Japan snack', counterparty: '' })),
  ...months.map((m) => ({ id: `b${m}`, userId: 'u', date: `${m}-03`, category: 'groceries', amount: -200, account: 'current', description: 'Japan groceries', counterparty: '' })),
] as never);
check('no scenario when the cuttable category is below 20% share', !I.buildGoalCard('Japan trip', small).text.includes('Scenario:'), I.buildGoalCard('Japan trip', small).text);

// Sparse: few rows or short coverage says so, no trend claims.
const sparse = I.buildGoalCard('Japan trip', I.analyseMatches([
  { id: 's1', userId: 'u', date: '2026-10-02', category: 'restaurants', amount: -25, account: 'current', description: 'Japan dinner', counterparty: '' },
  { id: 's2', userId: 'u', date: '2026-10-05', category: 'shopping', amount: -30, account: 'current', description: 'Japan book', counterparty: '' },
  { id: 's3', userId: 'u', date: '2026-10-09', category: 'transport', amount: -12, account: 'current', description: 'Japan metro', counterparty: '' },
] as never));
check('sparse data says so instead of implying a trend', sparse.sparse && sparse.text.startsWith('Only 3 matched transactions so far') && !sparse.text.includes('averages') && !sparse.text.includes('Scenario:'), sparse.text);

// Pure-savings goal: no consumption, the card says what the rows are, then paces the target.
const saveOnly = I.analyseMatches(months.map((m) => ({ id: `v${m}`, userId: 'u', date: `${m}-02`, category: 'savings_transfer', amount: -500, account: 'current', description: 'Japan trip fund', counterparty: '' })) as never);
const saveCard = I.buildGoalCard('Japan trip 6 000 € by 2027-06', saveOnly);
check('pure-savings goal states the rows are not consumption', saveCard.text.includes('none of them consumption spending'), saveCard.text);
check('pure-savings goal still paces the target from matched transfers', saveCard.text.includes('the 6000 EUR target takes about 12 months'), saveCard.text);

// Salary goal regression (baseline bug: income must never be labeled spending anywhere).
const sal = I.analyseMatches(months.map((m) => ({ id: `w${m}`, userId: 'u', date: `${m}-25`, category: 'salary', amount: 3400, account: 'current', description: 'Salary', counterparty: '' })) as never);
const salCard = I.buildGoalCard('Salary review', sal);
check('income-only goal: no spending claim, the card says the rows are not consumption', sal.spendingRows === 0 && sal.monthlyAvg === null && salCard.text.includes('none of them consumption spending') && !salCard.text.includes('averages'), salCard.text);
check('income-only goal: no scenario and no pace (no savings transfers)', !salCard.text.includes('Scenario:') && !salCard.text.includes('target takes'), salCard.text);

// Refunds are credits: a positive amount in a spending category never counts as spending.
const ref = I.analyseMatches([
  ...months.map((m) => ({ id: `r${m}`, userId: 'u', date: `${m}-02`, category: 'restaurants', amount: -50, account: 'current', description: 'Japan dinner', counterparty: '' })),
  { id: 'rr', userId: 'u', date: '2026-10-09', category: 'restaurants', amount: 50, account: 'current', description: 'Japan dinner refund', counterparty: '' },
] as never);
check('a refund (credit in a spending category) is not spending', ref.spendingRows === 6 && ref.spendingTotal === 300, JSON.stringify({ rows: ref.spendingRows, total: ref.spendingTotal }));

// Coverage gaps: the change compares covered months and says so.
const gap = I.analyseMatches(['2026-01', '2026-02', '2026-03', '2026-08', '2026-09', '2026-10'].map((m, i) => ({ id: `g${m}`, userId: 'u', date: `${m}-02`, category: 'restaurants', amount: i < 3 ? -60 : -120, account: 'current', description: 'Japan dinner', counterparty: '' })) as never);
const gapCard = I.buildGoalCard('Japan trip', gap);
check('changePct uses the three covered months vs the three before across a gap', gap.changePct === 100, String(gap.changePct));
check('gapped coverage is labeled "covered months", not implied continuous', gapCard.evidence.includes('the three covered months before'), gapCard.evidence);
check('contiguous coverage keeps the plain wording', card.evidence.includes('the three months before') && !card.evidence.includes('the three covered months'), card.evidence);

// Scenario wording is explicitly conditional, never a directive.
check('scenario is framed as an illustration, not a recommendation', card.text.includes('an illustration from your own averages, not a recommendation you must follow'), card.text);

// Title target parsing (the target crosses the boundary only inside the shared title).
check('target parses amount and ISO month from the shared title', JSON.stringify(I.parseTargetFromTitle('Save 12 000 € by 2026-12')) === JSON.stringify({ amount: 12000, date: '2026-12' }), JSON.stringify(I.parseTargetFromTitle('Save 12 000 € by 2026-12')));
check('target parses a month name', I.parseTargetFromTitle('Japan trip 3 000 € by June 2027')?.date === '2027-06');
check('no amount in the title means no target (details stay in the User DB)', I.parseTargetFromTitle('Emergency fund') === null);
check('an amount without a currency marker is not a target', I.parseTargetFromTitle('Save 12 000 by 2027') === null);
check('a target without a date paces without inventing a goal date', (() => { const c = I.buildGoalCard('Trip 3 000 \u20ac', saveOnly); return c.text.includes('the 3000 EUR target takes about 6 months') && !c.text.includes('goal date'); })());

// Figure guard: a model figure that is not code-computed fails (ISO dates are not figures).
check('guard passes grounded text', I.textFiguresGrounded('About 115 EUR a month, up 30% since 2026-05-02.', [115, 30]));
check('guard drops a hallucinated figure', !I.textFiguresGrounded('About 115 EUR a month, up 42%.', [115, 30]));

// Adversarial semantic guard (Coordinator QC): grounded digits alone are not enough.
check('guard keeps a rewrite that preserves the labels', I.textPreservesLabels(card.text, 'Mostly restaurants and rising. Scenario: cutting restaurants by a third frees about 25 EUR a month - not a recommendation. About 200 EUR a month of savings is a projection, 15 months to 3000 EUR.'));
check('guard drops a rewrite that turns the scenario into a claim', !I.textPreservesLabels(card.text, 'Cutting restaurants by a third frees about 25 EUR a month. Up 30%.'));
check('guard drops a rewrite that drops the projection label', !I.textPreservesLabels(card.text, 'Scenario: cutting restaurants by a third frees about 25 EUR a month - not a recommendation. The 3000 EUR target takes about 15 months.'));
check('guard drops a rewrite that drops the hedging', !I.textPreservesLabels(card.text, 'Scenario: cutting restaurants by a third frees about 25 EUR a month. The 3000 EUR target takes about 15 months - a projection.'));

// Integration: prepareInsightDrafts matches the Nordea DB and returns the deterministic card.
const UID = 'insighttest';
S.saveNordeaDb({ userId: UID, accounts: [], transactions: TX.map((t) => ({ ...t, userId: UID })) as never });
const drafts = N.prepareInsightDrafts(UID, ['Japan trip 3 000 € by 2027-06'], {});
check('prepareInsightDrafts builds the deterministic card from the Nordea DB', drafts.length === 1 && drafts[0].text === card.text && drafts[0].figures.length === a.figures.length, JSON.stringify(drafts.map((d) => d.text)));

// Adversarial semantic QC (Coordinator 983be84): rewrites that KEEP every label and use ONLY
// grounded digits still carry unsupported claims - digits+labels can never be claim safety, so
// the shipped card path is code-assembled only and never consults model prose.
const proj = ' At the matched savings pace of about 200 EUR a month, the 3000 EUR target takes about 15 months - a projection.';
const adversarial = [
  'Your restaurants habit is the reason you will miss your goal. Scenario: cutting restaurants by a third frees about 25 EUR a month - not a recommendation.' + proj,
  'Your shopping is out of control. Scenario: cutting restaurants by a third frees about 25 EUR a month - not a recommendation.' + proj,
  'Scenario: cut restaurants now, you must stop eating out - not a recommendation.' + proj,
  'Your spending always spikes on weekends. Scenario: cutting restaurants by a third frees about 25 EUR a month - not a recommendation.' + proj,
];
check('adversarial rewrites still pass the old digit+label guards (why guards are not the safety mechanism)',
  adversarial.every((t) => I.textFiguresGrounded(t, a.figures) && I.textPreservesLabels(card.text, t)));
check('the shipped card path never consumes model insight texts', (() => { const s = fs.readFileSync('src/server/arch/agents/nordea.ts', 'utf-8'); return !s.includes('insightTexts') && !s.includes('llmDraftInsightTexts'); })());
check('the deterministic card carries none of the adversarial claims', adversarial.every((t) => !card.text.includes(t.split('.')[0]) && !card.evidence.includes(t.split('.')[0])));

// Goal-scope regression (Coordinator QC): generic savings transfers matched via the category
// hint are never earmarked as goal pace, and spending averages use spending-covered months only.
const genSavings = ['2024-11', '2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04']
  .map((m, i) => ({ id: `gs${i}`, userId: 'u', date: `${m}-15`, category: 'savings_transfer', amount: -850, account: 'current', description: 'Monthly buffer', counterparty: '' }));
const mixed = I.analyseMatches([...TX, ...genSavings] as never, 'Japan trip 3 000 \u20ac by 2027-06');
check('generic transfers are never earmarked: pace comes only from goal-tagged transfers', mixed.savingsMonthlyAvg === 200, String(mixed.savingsMonthlyAvg));
check('spending average uses spending-covered months, not transfer-covered months', mixed.monthlyAvg === 115 && mixed.coverageMonths === 24, JSON.stringify({ avg: mixed.monthlyAvg, cov: mixed.coverageMonths }));
const genericOnly = I.analyseMatches(months.map((m) => ({ id: `go${m}`, userId: 'u', date: `${m}-15`, category: 'savings_transfer', amount: -850, account: 'current', description: 'Monthly buffer', counterparty: '' })) as never, 'Japan trip 3 000 \u20ac by 2027-06');
const genericCard = I.buildGoalCard('Japan trip 3 000 \u20ac by 2027-06', genericOnly);
check('no goal-tagged transfers: no pace projection, honest insufficiency instead', genericOnly.genericSavings && genericOnly.savingsMonthlyAvg === null && !genericCard.text.includes('takes about') && genericCard.text.includes('not tagged to this goal'), genericCard.text);

// Regression: the aggregate evidence semantics the cards build on are unchanged.
check('evidence semantics unchanged (matched count, abs total, figures list)', a.matched === 19 && a.total === 5790 && a.figures.includes(19) && a.figures.includes(5790));

// Scenario denominator: sized from spending-covered months, not transfer-diluted coverage.
const mixedCard = I.buildGoalCard('Japan trip 3 000 \u20ac by 2027-06', mixed);
check('scenario is sized from spending-covered months (25 EUR, not 6 from diluted coverage)', mixedCard.text.includes('free about 25 EUR a month'), mixedCard.text);

// F1 persistence: evidenceText survives save -> reload -> retrieval (Coordinator QC).
const cmstore = await import('../src/server/arch/store/cmStore.js');
const evEntry = { id: 'ev-persist-1', title: 'Activity related to goal "Japan trip"', detail: 'x', goalIds: [], proposedBy: 'nordea', evidenceText: 'It averages about 115 EUR a month.', status: 'active', createdAt: '2026-10-15T00:00:00Z' };
cmstore.putEntry(UID, evEntry as never);
check('evidenceText survives putEntry -> reload', cmstore.loadCmDb(UID).entries.find((e) => e.id === 'ev-persist-1')?.evidenceText === 'It averages about 115 EUR a month.');
const dbNow = cmstore.loadCmDb(UID);
cmstore.saveCmDb({ ...dbNow, entries: dbNow.entries.map((e) => e.id === 'ev-persist-1' ? { ...e, detail: 'y' } : e) });
check('evidenceText survives saveCmDb -> reload', cmstore.loadCmDb(UID).entries.find((e) => e.id === 'ev-persist-1')?.evidenceText === 'It averages about 115 EUR a month.');

// --init: the setup SQL prints without executing, is idempotent, and never leaks the URL.
const out1 = execSync('node scripts/run_python.mjs scripts/load_data.py --init --print-sql', { encoding: 'utf-8' });
const out2 = execSync('node scripts/run_python.mjs scripts/load_data.py --init --print-sql', { encoding: 'utf-8' });
check('--init --print-sql is stable and every table is IF NOT EXISTS', out1 === out2 && out1.includes('create table if not exists') && !/create table (?!if not exists)/i.test(out1));
const out3 = execSync('node scripts/run_python.mjs scripts/load_data.py --init --print-sql', { encoding: 'utf-8', env: { ...process.env, SUPABASE_DB_URL: 'postgresql://owner:secretpw@db.example:5432/postgres' } });
check('--init --print-sql never prints the privileged URL', !out3.includes('secretpw'));
const out4 = execSync('node scripts/run_python.mjs scripts/load_data.py --init --print-sql', { encoding: 'utf-8', env: { ...process.env, AGENT_USER_PASSWORD: 'role-secret-1', AGENT_CM_PASSWORD: 'role-secret-2', AGENT_NORDEA_PASSWORD: 'role-secret-3' } });
check('--init never prints role passwords, and the schema+feed SQL is complete', !out4.includes('role-secret') && out4.includes('create table if not exists public.nordea_feed'), 'leak or missing feed');
check('--init never passes the privileged URL in the psql argv (process list)', !fs.readFileSync('scripts/load_data.py', 'utf-8').includes('["psql", db_url'));
const ld = fs.readFileSync('scripts/load_data.py', 'utf-8');
check('--init writes the app key names (USER_/CM_/NORDEA_DB_URL), never AGENT_*_DB_URL', ld.includes('"agent_user": "USER_DB_URL"') && !ld.includes('AGENT_USER_DB_URL') && !ld.includes('AGENT_CM_DB_URL') && !ld.includes('AGENT_NORDEA_DB_URL'));
check('--init detects existing roles via a read-only pg_roles preflight before provisioning (rerun never rotates) - G81: SQL text updated for the reviewed G70/G72 preflight, behavioral intent preserved', ld.includes('left join pg_roles pr on pr.rolname = v.rolname') && ld.includes('(pr.oid is not null)') && ld.includes('existing = {r for r in roles_all if pre[r]["exists"]}'));
check('--init merges .env.local (unrelated keys kept line by line, only managed keys replaced)', ld.includes('kept.append(line)'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
