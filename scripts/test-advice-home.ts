/**
 * v27: Nora's suggestions outside the chat, and layer 4 of the build plan (12 named test customers).
 * - Named customers: exactly what each should and must never get, on several dates (pure, every commit).
 * - Home "For you", "Nora's suggestions" and the setting, pressed through the real HTTP routes:
 *   sticky card, weekly limit, "Only when I ask", calm view, offers off, stale cards, double taps,
 *   "Show me" into a chat, "Change my answer", "Allow it again", the audit log, and a reset.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'advice-home-'));
process.env.CABINET_DATA_DIR = DIR;
delete process.env.SUPABASE_URL;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 700)}`); }
}

const F = await import('../src/server/advice/facts.js');
const G = await import('../src/server/advice/guard.js');
const R = await import('../src/server/advice/rules.js');
const rules = R.loadRules().rules;

// ---------------- Layer 4: twelve named customers ----------------
type Who = { age: number | null; offersOff: boolean; calm: boolean };
interface Named { name: string; who: Who; facts: Record<string, unknown>; hidden?: string[]; days: string[]; should: string[]; never: string[]; home?: string | null }
// should: "ruleId:eligible" or "ruleId:ask:fact". never: rule ids (or "regulated" / "product").
const NAMED: Named[] = [
  { name: 'Lauri, 31, renting couple saving for a flat', who: { age: 31, offersOff: false, calm: false }, facts: { age: 31, hasAspAccount: false, savingForHome: true }, days: ['2026-11-20'], should: ['asp-account:ask:everOwnedHalfOfHome'], never: ['equity-account-under-30'], home: 'asp-account' },
  { name: 'Lauri after answering "never owned"', who: { age: 31, offersOff: false, calm: false }, facts: { age: 31, hasAspAccount: false, savingForHome: true, everOwnedHalfOfHome: false }, days: ['2026-11-20', '2027-03-01'], should: ['asp-account:eligible'], never: ['equity-account-under-30'], home: 'asp-account' },
  { name: 'ASP before it changed (31 May 2026): not live', who: { age: 50, offersOff: false, calm: false }, facts: { age: 50, hasAspAccount: false, savingForHome: true, everOwnedHalfOfHome: false }, days: ['2026-05-31'], should: [], never: ['asp-account'] },
  { name: 'Eeva, 72, calm view, grandchildren', who: { age: 72, offersOff: false, calm: true }, facts: { age: 72, incomeType: 'pension', hasAspAccount: false }, days: ['2026-11-20'], should: ['gift-limit:ask:helpsFamilyWithMoney'], never: ['equity-account-under-30'], home: 'gift-limit' },
  { name: 'Eeva after "yes, I help family"', who: { age: 72, offersOff: false, calm: true }, facts: { age: 72, incomeType: 'pension', helpsFamilyWithMoney: true }, days: ['2026-11-20'], should: ['gift-limit:eligible'], never: ['equity-account-under-30'], home: 'gift-limit' },
  { name: 'Alex, 26, new customer, empty cabinet: questions only', who: { age: 26, offersOff: false, calm: false }, facts: { age: 26, hasAspAccount: false, hasEquitySavingsAccount: false }, days: ['2026-11-20'], should: ['equity-account-under-30:ask:interestedInInvesting'], never: [], home: 'equity-account-under-30' },
  { name: 'Sara, 19, student', who: { age: 19, offersOff: false, calm: false }, facts: { age: 19, incomeType: 'student_aid', hasAspAccount: false, hasEquitySavingsAccount: false }, days: ['2026-11-20'], should: ['kela-loan-writeoff:ask:isHigherEducationStudent'], never: [] },
  { name: 'Onni, 15, minor who wants to invest', who: { age: 15, offersOff: false, calm: false }, facts: { age: 15, hasEquitySavingsAccount: false, interestedInInvesting: true, hasAspAccount: false }, days: ['2026-11-20'], should: [], never: ['regulated'] },
  { name: 'Mikko and Anna, homeowners', who: { age: 34, offersOff: false, calm: false }, facts: { age: 34, hasAspAccount: false, everOwnedHalfOfHome: true, savingForHome: true }, days: ['2026-11-20'], should: [], never: ['asp-account', 'equity-account-under-30'] },
  { name: 'Juha, 45, owned a home before', who: { age: 45, offersOff: false, calm: false }, facts: { age: 45, hasAspAccount: false, everOwnedHalfOfHome: true }, days: ['2026-11-20'], should: [], never: ['asp-account'] },
  { name: 'Pirkko, 58, PS account in 2026', who: { age: 58, offersOff: false, calm: false }, facts: { age: 58, hasPsAccount: true, psBalance: 12000 }, days: ['2026-11-20'], should: ['ps-account:eligible'], never: ['asp-account', 'equity-account-under-30'] },
  { name: 'Pirkko in 2027: the old deduction is gone', who: { age: 58, offersOff: false, calm: false }, facts: { age: 58, hasPsAccount: true, psBalance: 12000 }, days: ['2027-01-02'], should: [], never: ['ps-account@2026-01-01'] },
  { name: 'Timo, 40, entrepreneur', who: { age: 40, offersOff: false, calm: false }, facts: { age: 40, incomeType: 'none', interestedInInvesting: true, hasEquitySavingsAccount: false }, days: ['2026-11-20'], should: [], never: ['equity-account-under-30'] },
  { name: 'Leena, 50, partner offers off', who: { age: 50, offersOff: true, calm: false }, facts: { age: 50, hasAspAccount: false, savingForHome: true, everOwnedHalfOfHome: false, helpsFamilyWithMoney: true }, days: ['2026-11-20'], should: ['gift-limit:eligible'], never: ['product'] },
  { name: 'Kari, 37, saved a private note: never asked or used', who: { age: 37, offersOff: false, calm: false }, facts: { age: 37, hasAspAccount: false, everOwnedHalfOfHome: false }, hidden: ['savingForHome'], days: ['2026-11-20'], should: [], never: ['asp-account'] },
  { name: 'Maya, 29, outside youth exemption', who: { age: 29, offersOff: false, calm: false }, facts: { age: 29, interestedInInvesting: true, hasEquitySavingsAccount: false }, days: ['2026-11-20'], should: [], never: ['equity-account-under-30'] },
];
for (const n of NAMED) {
  for (const day of n.days) {
    const facts = F.factsFrom(n.facts as any);
    for (const h of n.hidden || []) facts[h as keyof typeof facts] = { key: h as any, state: 'hidden', value: null, from: 'private note' };
    const { list } = G.selectCandidates(rules, facts, undefined, n.who, day);
    const got = list.map((c) => c.status === 'ask' ? `${c.rule.id}:ask:${c.ask!.fact}` : `${c.rule.id}:${c.status}`);
    const missing = n.should.filter((s) => !got.includes(s));
    const wrong = list.filter((c) => n.never.some((x) => x === c.rule.id || x === `${c.rule.id}@${c.rule.version}` || (x === 'regulated' && c.rule.regulated) || (x === 'product' && c.rule.kind === 'product')));
    const askedHidden = list.filter((c) => c.ask && (n.hidden || []).includes(c.ask.fact));
    check(`named: ${n.name} (${day})`, !missing.length && !wrong.length && !askedHidden.length, { got, missing, wrong: wrong.map((c) => c.rule.id) });
    if (n.home !== undefined) {
      const home = list.find((c) => G.oneAnswerAway(c, facts, day, rules));
      check(`named: ${n.name}: Home picks ${n.home ?? 'nothing'}`, (home?.rule.id ?? null) === n.home, home?.rule.id);
    }
  }
}
// Home asks only when one answer is all that is missing.
const two = F.factsFrom({ age: 72, hasAspAccount: false });
const aspAsk = G.selectCandidates(rules, two, undefined, { age: 72, offersOff: false, calm: false }, '2026-11-20').list.find((c) => c.rule.id === 'asp-account');
check('Home never asks a question when two answers are still missing (ASP for a 72-year-old)', !!aspAsk && !G.oneAnswerAway(aspAsk!, two, '2026-11-20', rules));

// ---------------- Through HTTP ----------------
const { db } = await import('../src/server/db.js');
await db.init();
const { DEMO_TODAY } = await import('../src/server/finance.js');
const { registerV14Routes } = await import('../src/server/routes.js');
const app = express(); app.use(express.json()); registerV14Routes(app);
const server = app.listen(0);
const BASE = `http://127.0.0.1:${(server.address() as any).port}`;
const req = async (method: string, url: string, body?: unknown) => { const r = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) as any }; };
const get = (url: string) => req('GET', url);
const post = (url: string, body: unknown) => req('POST', url, body);
const view = async (u: string) => (await get(`/api/advice?userId=${u}`)).body;
const home = (u: string, fy: any, action: string, payload: any = {}) => post('/api/advice/home', { userId: u, ruleId: fy.data.ruleId, version: fy.data.version, action, payload: { ...payload, ...(fy.data.fact ? { fact: fy.data.fact } : {}) } });
const forYouLogs = (u: string) => db.getAccessLog(u).filter((l) => l.purpose === 'Nora suggestions: For you on Home').length;

check('unknown customer: 404', (await get('/api/advice?userId=nobody')).status === 404);
let v = await view('lauri');
check('Lauri: default is "Now and then", a question on Home, nothing in the history yet', v.proactive === 'sometimes' && v.forYou?.type === 'ask_fact' && v.forYou.data.fact === 'everOwnedHalfOfHome' && v.history.length === 0, v);
const st = (await get('/api/state?userId=lauri')).body;
check('the app state carries the same card', st.advice?.forYou?.data?.ruleId === 'asp-account');
const logs1 = forYouLogs('lauri');
for (let i = 0; i < 5; i++) await view('lauri');
check('opening Home again and again is one logged read, not six', forYouLogs('lauri') === logs1 && logs1 >= 1, { logs1, now: forYouLogs('lauri') });
check('the same card stays on Home (sticky)', (await view('lauri')).forYou?.data?.ruleId === 'asp-account');

const q = v.forYou;
check('stale version: 409 and nothing saved', (await post('/api/advice/home', { userId: 'lauri', ruleId: 'asp-account', version: '2001-01-01', action: 'fact_answer', payload: { value: 'no', fact: 'everOwnedHalfOfHome' } })).status === 409 && !db.getCabinetEntries('lauri').some((e) => e.factKey === 'everOwnedHalfOfHome'));
check('a different question than the one on Home: 409', (await home('lauri', { data: { ...q.data, fact: 'savingForHome' } }, 'fact_answer', { value: 'no' })).status === 409);
check('a rule that is not on Home: 409', (await post('/api/advice/home', { userId: 'lauri', ruleId: 'gift-limit', version: '2026-01-01', action: 'opp_notnow' })).status === 409);
check('an unknown action: 400', (await home('lauri', q, 'delete_everything')).status === 400);
check('opening an account from Home is not allowed (only in a chat, with the full card): 400', (await home('lauri', q, 'opp_accept')).status === 400);
check('a bad answer is refused (400)', (await home('lauri', q, 'fact_answer', { value: 'maybe' })).status === 400);

const a1 = await home('lauri', q, 'fact_answer', { value: 'no' });
check('answering on Home: saved, and the suggestion takes its place', a1.status === 200 && a1.body.forYou?.type === 'opportunity' && a1.body.forYou.data.ruleId === 'asp-account' && /Here’s what fits you/.test(a1.body.text), a1.body);
check('the answer is in What Nora knows, from the customer', db.getCabinetEntries('lauri').some((e) => e.factKey === 'everOwnedHalfOfHome' && e.factValue === false && e.source === 'customer'));
check('a double tap on the old question: 409, still one answer', (await home('lauri', q, 'fact_answer', { value: 'no' })).status === 409 && db.getCabinetEntries('lauri').filter((e) => e.factKey === 'everOwnedHalfOfHome' && e.status === 'active').length === 1);
v = await view('lauri');
const s1 = v.forYou;
check('history: the rule is listed, with why it was shown (reasons, source, what Nordea earns)', v.history[0]?.ruleId === 'asp-account' && v.history[0].why?.reasons.length >= 3 && v.history[0].why.source.url.startsWith('https://') && !!v.history[0].why.earns && v.history[0].why.where === 'home', v.history[0]);

// "Show me": the full card in a chat; Home no longer shows it.
check('"Show me" for a rule that is not on Home: 409', (await post('/api/advice/show', { userId: 'lauri', ruleId: 'gift-limit' })).status === 409);
const sh = await post('/api/advice/show', { userId: 'lauri', ruleId: 'asp-account' });
const chatMsg = db.getMessages('lauri').find((m) => m.conversationId === sh.body.conversationId && (m.cards || []).some((c) => c.type === 'opportunity'));
check('"Show me" opens a chat with the full card', sh.status === 200 && !!chatMsg);
check('…and Home no longer shows it', (await view('lauri')).forYou === null);
check('…and "Show me" twice is refused', (await post('/api/advice/show', { userId: 'lauri', ruleId: 'asp-account' })).status === 409);
const acc = await post('/api/actions', { userId: 'lauri', messageId: chatMsg!.id, action: 'opp_accept' });
check('the card in the chat works: the ASP account opens', acc.status === 200 && db.getBankAccounts('lauri').some((b) => /asp/i.test(b.type || '')), acc.body);
v = await view('lauri');
check('history says Opened, and nothing to undo', /^Opened · /.test(v.history[0].status) && v.history[0].can.length === 1 && v.history[0].can[0] === 'forget', v.history[0]);
check('"Now and then": no new Home card within a week of the last one', v.forYou === null);

// Settings.
check('a made-up setting is refused', (await post('/api/advice/setting', { userId: 'lauri', proactive: 'always' })).status === 400);
const often = (await post('/api/advice/setting', { userId: 'lauri', proactive: 'often' })).body.forYou;
check('"Whenever something fits": the next thing that is one answer away comes at once (the gift question), never ASP again', often?.data?.ruleId === 'gift-limit' && often.type === 'ask_fact', often);

// Alex: "Not now", "never", "Allow it again", "Change my answer".
v = await view('alex');
check('Alex: a question about investing (one answer away)', v.forYou?.type === 'ask_fact' && v.forYou.data.ruleId === 'equity-account-under-30', v.forYou);
const ax = await home('alex', v.forYou, 'fact_answer', { value: 'yes' });
check('Alex says yes: the equity account card (regulated: advice from a person)', ax.body.forYou?.type === 'opportunity' && ax.body.forYou.data.regulated === true, ax.body.forYou);
const nn = await home('alex', ax.body.forYou, 'opp_notnow');
check('"Not now" on Home: gone, and the history says when it may come back', nn.status === 200 && nn.body.forYou === null && /^Not now · back after /.test(nn.body.history.find((h: any) => h.ruleId === 'equity-account-under-30').status), nn.body);
check('"Not now" from Home cannot be pressed twice', (await home('alex', ax.body.forYou, 'opp_notnow')).status === 409);
const al = await post('/api/advice/change', { userId: 'alex', ruleId: 'equity-account-under-30', what: 'allow' });
check('"Show it again" removes the wait', al.status === 200 && !al.body.history.some((h: any) => h.ruleId === 'equity-account-under-30'));
check('…and since it is the card Home picked this week, it is back on Home', al.body.forYou?.data?.ruleId === 'equity-account-under-30', al.body.forYou);
await post('/api/advice/setting', { userId: 'alex', proactive: 'often' });
v = await view('alex');
check('"Whenever something fits": it is back on Home at once', v.forYou?.data?.ruleId === 'equity-account-under-30', v.forYou);
const fg = await post('/api/advice/change', { userId: 'alex', ruleId: 'equity-account-under-30', what: 'forget' });
check('"Change my answer" with no rule memory is refused (nothing to change)', fg.status === 400);
await home('alex', v.forYou, 'opp_never');
v = await view('alex');
const hx = v.history.find((h: any) => h.ruleId === 'equity-account-under-30');
check('"Don’t suggest this again" from Home: listed with "Allow it again" and "Change my answer"', hx?.last === 'never' && hx.can.includes('allow') && hx.can.includes('forget'), hx);
const fg2 = await post('/api/advice/change', { userId: 'alex', ruleId: 'equity-account-under-30', what: 'forget' });
check('"Change my answer": the answer is archived, "never" is kept', fg2.status === 200 && !db.getCabinetEntries('alex').some((e) => e.factKey === 'interestedInInvesting' && e.status === 'active') && fg2.body.history.find((h: any) => h.ruleId === 'equity-account-under-30')?.last === 'never');
check('…and the rule stays off Home', fg2.body.forYou?.data?.ruleId !== 'equity-account-under-30');
check('"Only when I ask": nothing on Home', (await post('/api/advice/setting', { userId: 'alex', proactive: 'ask' })).body.forYou === null);
check('…and it is saved with the customer', db.getUser('alex')?.advice?.proactive === 'ask');

// Eeva: calm view, one a week even with "Whenever something fits".
db.cloneUser('eeva', 'eeva2');
await post('/api/advice/setting', { userId: 'eeva2', proactive: 'often' });
v = await view('eeva2');
check('Eeva (calm): one question on Home', v.forYou?.type === 'ask_fact' && v.forYou.data.ruleId === 'gift-limit' && v.forYou.data.calm === true, v.forYou);
const e1 = await home('eeva2', v.forYou, 'fact_answer', { value: 'yes' });
check('…answer yes: the gift-limit card, in calm form', e1.body.forYou?.type === 'opportunity' && e1.body.forYou.data.calm === true);
const e2 = await home('eeva2', e1.body.forYou, 'opp_ok');
check('…"Good to know": nothing else for a week in the calm view, even on "Whenever something fits"', e2.status === 200 && e2.body.forYou === null, e2.body.forYou);
const e3 = await home('eeva2', { data: { ruleId: 'gift-limit', version: e1.body.forYou.data.version } }, 'opp_ok');
check('…and the same button again is refused', e3.status === 409);

// The calm view: the card on Home may still be shown in a chat when the customer asks about it
// (it is the same suggestion, not an extra one), and then Home stops showing it.
const { setProvider } = await import('../src/server/llm.js');
const { mockProvider } = await import('../src/server/llmMock.js');
let plan: any[][] = [];
setProvider({ ...mockProvider, async step(args: any) {
  if (!args.tools.some((t: any) => t.name === 'showOpportunity')) return (mockProvider as any).step(args);
  const next = plan.shift();
  if (next) return { calls: next.map((c, i) => ({ id: `t${i}${Math.random()}`, name: c.name, args: c.args })) };
  return { calls: [{ id: 'fin', name: 'finishReply', args: { text: 'Here is something that may help you with that, have a look below.', suggestions: [], usedEntryIds: [], topic: 'goals', couldHelp: true } }] };
} } as any);
db.cloneUser('eeva', 'eeva3');
v = await view('eeva3');
check('Eeva (calm): the gift question is on Home', v.forYou?.data?.ruleId === 'gift-limit');
plan = [[{ name: 'showOpportunity', args: { ruleId: 'gift-limit' } }]];
const ch = await post('/api/chat', { userId: 'eeva3', text: 'I would like to help my grandchildren' });
const chCards = (ch.body.messages || []).flatMap((m: any) => m.cards || []).filter((c: any) => c.type === 'ask_fact' || c.type === 'opportunity');
check('…she asks about it in a chat: Nora can show that same card there, even in the calm view', chCards.length === 1 && chCards[0].data.ruleId === 'gift-limit', ch.body);
check('…and Home stops showing it (one place at a time)', (await view('eeva3')).forYou === null);
plan = [[{ name: 'showOpportunity', args: { ruleId: 'household-credit' } }]];
const ch2 = await post('/api/chat', { userId: 'eeva3', text: 'Can someone help me clean?' });
check('…but a second, different suggestion the same week is still refused in the calm view', !(ch2.body.messages || []).some((m: any) => (m.cards || []).some((c: any) => c.type === 'ask_fact' || c.type === 'opportunity')));

// Offers off: no product suggestion on Home.
db.cloneUser('lauri', 'leena'); db.updateUser('leena', { offersOff: true, advice: undefined } as any);
for (const e of db.getCabinetEntries('leena')) if (e.factKey) db.updateCabinetEntry(e.id, { status: 'archived' });
for (const b of db.getBankAccounts('leena')) if (/asp/i.test(b.type || '')) db.upsertBankAccount('leena', b.id, { type: 'Savings account' } as any);
v = await view('leena');
check('partner offers off: Home never shows a product suggestion', !v.forYou || v.forYou.data?.kindLabel !== 'Nordea product' && !/asp|equity/.test(v.forYou.data?.ruleId), v.forYou);

// Who sees it: Home's reads are in the audit log.
check('the audit log names the Home check', forYouLogs('lauri') >= 1 && forYouLogs('alex') >= 1);

// Reset leaves nothing behind (the same steps as POST /api/users/reset in server.ts).
const { loadBundledDemo } = await import('../src/server/demoSeed.js');
await db.clearAll(); await loadBundledDemo(); await db.reload();
const after = await view('lauri');
check('after a reset: no history, the default setting, and Lauri’s question is back', after.history.length === 0 && after.proactive === 'sometimes' && after.forYou?.type === 'ask_fact', after);
check('after a reset: no answers left in the cabinet', !db.getCabinetEntries('lauri').some((e) => e.factKey));

server.close();
console.log(`\nRESULT ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
