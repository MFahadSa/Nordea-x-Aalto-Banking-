/**
 * v25: the recommender's rules layer. Layer 1 (every rule at its edges, from the tests inside each
 * rule file), layer 2 (dates and versions), layer 6 (messy and conflicting data through the real
 * database), plus the validator refusing broken rules. No AI is involved anywhere here.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-'));
process.env.CABINET_DATA_DIR = DIR;
delete process.env.SUPABASE_URL;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 500)}`); }
}

const F = await import('../src/server/advice/facts.js');
const R = await import('../src/server/advice/rules.js');
const E = await import('../src/server/advice/evaluate.js');

// ---------------- The catalogue ----------------
const cat = R.loadRules();
check('every rule file loads; none rejected', cat.rejected.length === 0, cat.rejected);
const ids = [...new Set(cat.rules.map((r) => r.id))].sort();
check('six rules, seven versions', ids.length === 6 && cat.rules.length === 7, ids);
check('every compute step the validator knows exists in code, and back', JSON.stringify(Object.keys(R.COMPUTE_OUTPUTS).sort()) === JSON.stringify(Object.keys(E.COMPUTE).sort()));
check('no rule can read health or other special data (not in the fact catalogue)', !F.FACT_KEYS.some((k) => /health|illness|diagnos|religion|ethnic|union/i.test(k)));
check('every rule has an https source, an owner and a check date', cat.rules.every((r) => r.source.url.startsWith('https://') && r.source.owner && r.source.checkedAt));
const versionsOf = (id: string) => cat.rules.filter((r) => r.id === id);

// ---------------- Layer 1: each rule's own tests ----------------
let embedded = 0;
for (const r of cat.rules) for (const t of r.tests) {
  embedded++;
  const vs = t.reviewedOn ? versionsOf(r.id).map((v) => ({ ...v, source: { ...v.source, checkedAt: t.reviewedOn! } })) : versionsOf(r.id);
  const ev = E.evaluate(vs, F.factsFrom(t.facts as any), t.today);
  const got = ev.status === 'ask' ? `ask:${ev.ask?.fact}` : ev.status;
  check(`${r.id}@${r.version}: ${t.name}`, got === t.expect, { got, expect: t.expect, reasons: ev.reasons });
  if (ev.status === 'eligible') {
    const msg = ev.message || '';
    const stripped = Object.values(ev.values || {}).sort((p, q) => q.length - p.length).reduce((s, v) => s.split(v).join(''), msg);
    check(`${r.id}@${r.version}: ${t.name}: every number in the text comes from the rule`, !/\{\w+\}/.test(msg) && !/\d/.test(stripped), msg);
  }
}
check('at least 35 edge tests ran from the rule files', embedded >= 35, embedded);

// ---------------- Layer 2: dates and versions ----------------
const asp = { age: 31, hasAspAccount: false, everOwnedHalfOfHome: false, savingForHome: true };
check('ASP: 31 May 2026 not live, 1 June 2026 live', E.evaluate(versionsOf('asp-account'), F.factsFrom(asp), '2026-05-31').status === 'notLive' && E.evaluate(versionsOf('asp-account'), F.factsFrom(asp), '2026-06-01').status === 'eligible');
const ps = { hasPsAccount: true, psBalance: 4200, psWithdrawalsStarted: false };
const ps31 = E.evaluate(versionsOf('ps-account'), F.factsFrom(ps), '2026-12-31');
const ps01 = E.evaluate(versionsOf('ps-account'), F.factsFrom(ps), '2027-01-01');
check('PS: 31 December 2026 uses the deduction version, 1 January 2027 the withdrawal version', ps31.version === '2026-01-01' && ps01.version === '2027-01-01' && ps31.status === 'eligible' && ps01.status === 'eligible', [ps31.version, ps01.version]);
check('PS: the two versions say different things', ps31.message !== ps01.message && /deducted/.test(ps31.message || '') && /has ended/.test(ps01.message || ''));
const hcRechecked = versionsOf('household-credit').map((v) => ({ ...v, source: { ...v.source, checkedAt: '2027-12-01' } }));
check('household credit (re-checked in Dec 2027): 31 December 2027 live, 1 January 2028 not', E.evaluate(hcRechecked, F.factsFrom({ paysForHouseholdWork: true }), '2027-12-31').status === 'eligible' && E.evaluate(hcRechecked, F.factsFrom({ paysForHouseholdWork: true }), '2028-01-01').status === 'notLive');
check('household credit not re-checked by Dec 2027 switches itself off', E.evaluate(versionsOf('household-credit'), F.factsFrom({ paysForHouseholdWork: true }), '2027-12-31').status === 'stale');
check('a rule past its review period switches itself off', E.evaluate(versionsOf('gift-limit'), F.factsFrom({ helpsFamilyWithMoney: true }), '2027-06-01').status === 'stale');
check('the day the review runs out it still works', E.evaluate(versionsOf('gift-limit'), F.factsFrom({ helpsFamilyWithMoney: true }), '2027-05-19').status === 'eligible');
const planNov = E.evaluate(versionsOf('asp-account'), F.factsFrom(asp), '2026-11-20');
const planDec = E.evaluate(versionsOf('asp-account'), F.factsFrom(asp), '2026-12-01');
check('ASP: the 20th deposit month is computed from today (Nov 2026 → June 2028; Dec 2026 → July 2028)', planNov.values?.twentiethDepositMonth === 'June 2028' && planDec.values?.twentiethDepositMonth === 'July 2028', [planNov.values, planDec.values]);
check('a rule id with no versions is never live', E.evaluate([], F.factsFrom({}), '2026-11-20').status === 'notLive');

// ---------------- The validator refuses broken rules ----------------
const good = JSON.parse(JSON.stringify(versionsOf('gift-limit')[0]));
const broken: [string, (r: any) => void, RegExp][] = [
  ['unknown fact', (r) => { r.when = { all: [{ fact: 'healthCondition', eq: true }] }; }, /unknown fact "healthCondition"/],
  ['asking the customer what Nordea knows', (r) => { r.when = { all: [{ fact: 'age', gte: 18 }] }; r.ask = { age: 'How old are you?' }; }, /Nordea already knows/],
  ['a question the rule never uses', (r) => { r.ask.interestedInInvesting = 'Do you invest?'; }, /does not use this fact/],
  ['a question without a question mark', (r) => { r.ask.helpsFamilyWithMoney = 'Tell me'; }, /ending in "\?"/],
  ['a number typed into the message', (r) => { r.message = 'Give up to 7500 euros.'; }, /numbers go in params/],
  ['a placeholder with no value', (r) => { r.message = 'Up to {nothing} euros.'; }, /\{nothing\} has no value/],
  ['a regulated in-app offer', (r) => { r.regulated = true; r.action = 'appOffer'; }, /regulated rule cannot be an in-app offer/],
  ['validTo before validFrom', (r) => { r.validTo = '2025-01-01'; }, /validTo must be after validFrom/],
  ['a plain http source', (r) => { r.source.url = 'http://vero.fi'; }, /source.url/],
  ['no owner', (r) => { r.source.owner = ''; }, /source.owner/],
  ['review period 0', (r) => { r.reviewDays = 0; }, /reviewDays/],
  ['an unknown field', (r) => { r.priority = 1; }, /unknown field "priority"/],
  ['"more than" on a yes/no fact', (r) => { r.when = { all: [{ fact: 'helpsFamilyWithMoney', gte: 1 }] }; }, /helpsFamilyWithMoney is a boolean|cannot compare/],
  ['two operators in one condition', (r) => { r.when = { all: [{ fact: 'age', gte: 18, lt: 30 }] }; }, /exactly one of/],
  ['a wrong-typed list', (r) => { r.when = { all: [{ fact: 'age', in: ['old'] }] }; }, /"in" needs a list of number/],
  ['only one test', (r) => { r.tests = r.tests.slice(0, 1); }, /at least two/],
  ['an empty "all"', (r) => { r.when = { all: [] }; }, /at least one condition/],
  ['a test with an unknown fact', (r) => { r.tests[0].facts = { mood: 'happy' }; }, /unknown fact "mood"/],
];
for (const [name, mutate, re] of broken) {
  const r = JSON.parse(JSON.stringify(good)); mutate(r);
  const errs = R.validateRule(r);
  check(`validator refuses: ${name}`, errs.some((x) => re.test(x)), errs);
}
check('the real rule passes the validator', R.validateRule(good).length === 0, R.validateRule(good));

// Overlapping versions and a broken file in a folder: those are rejected, the rest still load.
const RD = fs.mkdtempSync(path.join(os.tmpdir(), 'rulesdir-'));
const a = JSON.parse(JSON.stringify(good)); a.version = '2026-01-01'; a.validTo = null;
const b = JSON.parse(JSON.stringify(good)); b.version = '2026-06-01'; b.validFrom = '2026-06-01';
fs.writeFileSync(path.join(RD, 'gift@a.json'), JSON.stringify(a));
fs.writeFileSync(path.join(RD, 'gift@b.json'), JSON.stringify(b));
fs.writeFileSync(path.join(RD, 'broken.json'), '{ not json');
fs.writeFileSync(path.join(RD, 'household.json'), JSON.stringify(versionsOf('household-credit')[0]));
const mixed = R.loadRules(RD);
check('overlapping versions are both rejected; a broken file is named; good rules still load', mixed.rules.length === 1 && mixed.rules[0].id === 'household-credit' && mixed.rejected.length === 3, mixed.rejected);

// ---------------- Layer 6: messy data through the real database ----------------
const { db } = await import('../src/server/db.js');
await db.init();
const { DEMO_TODAY } = await import('../src/server/finance.js');
const factsFor = (uid: string, today = DEMO_TODAY) => F.buildFacts({
  user: db.getUser(uid), entries: db.getCabinetEntries(uid), transactions: db.getTransactions(uid),
  bankAccounts: db.getBankAccounts(uid), balances: db.getBalanceSnapshots(uid), purpose: 'abel', today,
});
const now = `${DEMO_TODAY}T09:00:00.000Z`;
let n = 0;
const answer = (uid: string, key: string, value: unknown, extra: Record<string, unknown> = {}) => db.addCabinetEntry({
  id: `ans-${uid}-${++n}`, userId: uid, type: 'fact', title: `Answer: ${key}`, detail: String(value), source: 'customer', status: 'active',
  private: false, readableBy: { abel: true, offers: false }, provenance: { channel: 'app' }, reviewed: true,
  factKey: key, factValue: value as any, createdAt: now, updatedAt: now, ...extra,
} as any, { by: 'you' } as any);

const l = factsFor('lauri');
check('Lauri: age, rent, monthly saving and products come from Nordea data', l.age.value === 31 && l.paysRent.value === true && l.savesMonthly.value === true && l.hasAspAccount.value === false && l.incomeType.value === 'salary', { age: l.age, rent: l.paysRent, save: l.savesMonthly, asp: l.hasAspAccount, inc: l.incomeType });
check('Lauri: his flat goal means he is saving for a home', l.savingForHome.value === true && /flat/i.test(l.savingForHome.from), l.savingForHome);
check('Lauri: whether he ever owned a home is unknown, not guessed', l.everOwnedHalfOfHome.state === 'unknown');
const aspL = E.evaluate(versionsOf('asp-account'), l, DEMO_TODAY);
check('Lauri: ASP asks exactly one question first', aspL.status === 'ask' && aspL.ask?.fact === 'everOwnedHalfOfHome', aspL);

answer('lauri', 'everOwnedHalfOfHome', false);
const l2 = factsFor('lauri');
const aspL2 = E.evaluate(versionsOf('asp-account'), l2, DEMO_TODAY);
check('Lauri answers "no": ASP becomes eligible, from his own answer', l2.everOwnedHalfOfHome.value === false && l2.everOwnedHalfOfHome.from === 'You told us' && aspL2.status === 'eligible', aspL2);
check('the answer survives storage with its key and value', db.getCabinetEntries('lauri').some((e) => e.factKey === 'everOwnedHalfOfHome' && e.factValue === false));

answer('lauri', 'everOwnedHalfOfHome', true);
const l3 = factsFor('lauri');
check('two answers that disagree are a conflict, and Abel asks again', l3.everOwnedHalfOfHome.state === 'conflict' && E.evaluate(versionsOf('asp-account'), l3, DEMO_TODAY).ask?.fact === 'everOwnedHalfOfHome', l3.everOwnedHalfOfHome);

answer('eeva', 'helpsFamilyWithMoney', true, { createdAt: '2025-09-01T09:00:00.000Z', updatedAt: '2025-09-01T09:00:00.000Z' });
const e1 = factsFor('eeva');
check('an answer older than a year is stale and asked again', e1.helpsFamilyWithMoney.state === 'stale' && E.evaluate(versionsOf('gift-limit'), e1, DEMO_TODAY).status === 'ask', e1.helpsFamilyWithMoney);
check('Eeva: pension is her income', e1.incomeType.value === 'pension', e1.incomeType);

answer('eeva', 'paysForHouseholdWork', true, { private: true });
const e2 = factsFor('eeva');
const hc = E.evaluate(versionsOf('household-credit'), e2, DEMO_TODAY);
check('a private answer is never used, and never asked again', e2.paysForHouseholdWork.state === 'hidden' && hc.status === 'notEligible', { fact: e2.paysForHouseholdWork, hc });

answer('eeva', 'interestedInInvesting', true, { readableBy: { abel: false, offers: false } });
check('an answer Abel may not read stays hidden', factsFor('eeva').interestedInInvesting.state === 'hidden');
answer('eeva', 'savingForHome', 'yes');
check('a wrongly typed answer ("yes" for a yes/no) is ignored, not trusted', factsFor('eeva').savingForHome.state === 'unknown');
answer('eeva', 'healthCondition', true);
check('an answer for a fact outside the catalogue is ignored', !('healthCondition' in factsFor('eeva')));
answer('eeva', 'everOwnedHalfOfHome', false, { status: 'archived' });
check('an archived answer is ignored', factsFor('eeva').everOwnedHalfOfHome.state === 'unknown');

const x = factsFor('alex');
check('Alex (no account history): income is unknown, never "none"', x.incomeType.state === 'unknown' && x.paysRent.state === 'unknown', x.incomeType);

// Hidden home goal: no inference from it.
const goal = db.getCabinetEntries('lauri').find((e) => e.type === 'goal' && e.goalType === 'home')!;
db.updateCabinetEntry(goal.id, { readableBy: { ...goal.readableBy, abel: false } } as any, { by: 'you' } as any);
check('a home goal Abel may not read says nothing about saving for a home', factsFor('lauri').savingForHome.state === 'unknown');
db.updateCabinetEntry(goal.id, { readableBy: { ...goal.readableBy, abel: true } } as any, { by: 'you' } as any);

// Pirkko, 58: a PS account with a balance; a future snapshot is ignored.
db.cloneUser('eeva', 'pirkko');
db.updateUser('pirkko', { age: 58, name: 'Pirkko' } as any);
db.upsertBankAccount('pirkko', 'ps', { type: 'PS account' });
db.addBalanceSnapshot({ id: 'ps1', userId: 'pirkko', accountKey: 'ps', balance: 4200, at: '2026-12-31', source: 'test' });
db.addBalanceSnapshot({ id: 'ps2', userId: 'pirkko', accountKey: 'ps', balance: 9000, at: '2027-06-01', source: 'test' });
const p26 = factsFor('pirkko', '2026-11-20');
check('Pirkko: Nordea knows her PS account', p26.hasPsAccount.value === true && E.evaluate(versionsOf('ps-account'), p26, '2026-11-20').status === 'eligible', p26.hasPsAccount);
const p27 = factsFor('pirkko', '2027-01-05');
check('Pirkko in January 2027: balance 4 200 € (a later snapshot is ignored), so Abel asks about withdrawals', p27.psBalance.value === 4200 && E.evaluate(versionsOf('ps-account'), p27, '2027-01-05').ask?.fact === 'psWithdrawalsStarted', p27.psBalance);

// Sara, 19: student aid paid into Nordea.
db.cloneUser('alex', 'sara');
db.updateUser('sara', { age: 19, name: 'Sara' } as any);
db.replaceTransactions('sara', [
  { id: 'sara-1', userId: 'sara', date: '2026-10-01', category: 'other', amount: 279.88, account: 'current', description: 'Kela opintotuki' },
  { id: 'sara-2', userId: 'sara', date: '2026-09-01', category: 'other', amount: 279.88, account: 'current', description: 'Kela opintotuki' },
] as any);
const s = factsFor('sara');
check('Sara: Kela student aid is her income', s.incomeType.value === 'student_aid', s.incomeType);
check('Sara: the equity account asks about interest; the Kela rule asks about her studies', E.evaluate(versionsOf('equity-account-under-30'), s, DEMO_TODAY).ask?.fact === 'interestedInInvesting' && E.evaluate(versionsOf('kela-loan-writeoff'), s, DEMO_TODAY).ask?.fact === 'isHigherEducationStudent');

// Onni, 15: ASP yes; the equity account no, and no question about investing.
db.cloneUser('alex', 'onni');
db.updateUser('onni', { age: 15, name: 'Onni' } as any);
answer('onni', 'everOwnedHalfOfHome', false); answer('onni', 'savingForHome', true);
const o = factsFor('onni');
check('Onni, 15: ASP is open to him', E.evaluate(versionsOf('asp-account'), o, DEMO_TODAY).status === 'eligible');
check('Onni, 15: no investing question for a minor', E.evaluate(versionsOf('equity-account-under-30'), o, DEMO_TODAY).status === 'notEligible');

// Juha, 45: owned a home: ASP is closed and nothing more is asked.
db.cloneUser('alex', 'juha');
db.updateUser('juha', { age: 45, name: 'Juha' } as any);
answer('juha', 'everOwnedHalfOfHome', true);
const j = E.evaluate(versionsOf('asp-account'), factsFor('juha'), DEMO_TODAY);
check('Juha owned a home: ASP is not for him, and no further question', j.status === 'notEligible' && !j.ask, j);

// A customer Nordea has no record of: nothing is known, nothing is asked about products.
const ghost = F.buildFacts({ user: undefined, entries: [], transactions: [], bankAccounts: [], balances: [], purpose: 'abel', today: DEMO_TODAY });
check('an unknown customer has only unknown facts', F.FACT_KEYS.every((k) => ghost[k].state === 'unknown'));
check('…and the ASP rule cannot ask them about Nordea products', E.evaluate(versionsOf('asp-account'), ghost, DEMO_TODAY).status === 'notEligible');

fs.rmSync(DIR, { recursive: true, force: true });
fs.rmSync(RD, { recursive: true, force: true });
console.log(`\nRESULT ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
