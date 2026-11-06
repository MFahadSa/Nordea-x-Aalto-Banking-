/**
 * v19 guards (from an outside review of the airlock, risk and number rules):
 *  1. The personal agent shares only goals the customer still allows: a removed (archived), disputed or
 *     turned-off goal stays in the User DB but never reaches Abel's facts or the shared document.
 *  2. Abel's number guard checks percentages whatever their size: an invented interest rate is caught,
 *     a percentage that follows from known amounts (a share, a change, a partner fee) is not.
 * Runs on a temporary data folder with the bundled demo customers and the mock model only.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'guards-'));
process.env.CABINET_DATA_DIR = DIR;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail)}`); }
}

const { setProvider } = await import('../src/server/llm.js');
const { mockProvider } = await import('../src/server/llmMock.js');
setProvider(mockProvider);
const { db } = await import('../src/server/db.js');
await db.init();
const O = await import('../src/server/arch/orchestrator.js');
const { unsupportedNumbers } = await import('../src/server/abel.js');

// --- 1. goals leave the User DB only while the customer allows it
const facts = async (c: string) => (await O.abelSharedContext('lauri', c, 'what are my goals')).userDbFacts ?? '';
const before = await facts('guards-1');
check('all three demo goals reach Abel at first', /Japan trip/.test(before) && /Buy a flat/.test(before) && /Save for a car/.test(before), before);
db.updateCabinetEntry('lauri-japan-goal', { status: 'archived' }, { by: 'you' });
const home = db.getCabinetEntry('lauri-home-goal')!;
db.updateCabinetEntry('lauri-home-goal', { readableBy: { ...home.readableBy, abel: false } }, { by: 'you' });
const after = await facts('guards-2');
check('a removed goal no longer reaches Abel', !/Japan trip/.test(after), after);
check('a goal turned off for Abel no longer reaches Abel', !/Buy a flat/.test(after), after);
check('the other goal still does', /Save for a car/.test(after), after);
check('both stay in the User DB (nothing deleted)', db.getCabinetEntries('lauri').filter((e) => e.type === 'goal').length === 3);

// --- 2. percentages
const known = [14600, 30000, 390, 160, 2, 100];
const money = [14600, 30000, 390, 160];
const cases: [string, boolean][] = [
  ['A Nordea mortgage is 3.5 % interest right now.', false],
  ['Interest is 4,2 prosent.', false],
  ['You have saved 49 % of the deposit.', true],
  ['Eating out is up about 140 % from 160 €.', true],
  ['Nordea earns 2 % from Kotiväli.', true],
  ['That is 100 % of it.', true],
  ['You could save 3 months sooner.', true],
];
for (const [text, clean] of cases) {
  const bad = unsupportedNumbers(text, known, money);
  check(`${clean ? 'allowed' : 'caught'}: ${text}`, (bad.length === 0) === clean, bad);
}

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\nRESULT ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
