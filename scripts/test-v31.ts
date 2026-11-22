/** v31: the retest's transfer, scam, cut-off, import and offline findings, checked through the real routes with a scripted model. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'trust-'));
process.env.CABINET_DATA_DIR = DIR;
delete process.env.SUPABASE_URL;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 900)}`); }
}

// ---------- a scripted model ----------
import type { LlmProvider, StepResult, Turn } from '../src/server/llm.js';
type Script = { re: RegExp; steps: StepResult[] };
let script: Script[] = [];
let lastSystem = '';
const fr = (text: string, extra: Record<string, unknown> = {}): StepResult => ({ calls: [{ id: 'f', name: 'finishReply', args: { text, suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true, ...extra } }] });
const tool = (name: string, args: Record<string, unknown>, text?: string): StepResult => ({ calls: [{ id: name, name, args }], text });
const scripted: LlmProvider = {
  name: 'scripted (tests only)',
  isConfigured: () => true,
  async step({ turns, tools, system }) {
    // The pipeline's own helpers (usefulness filter etc.) get a harmless empty answer.
    if (!tools.some((t) => t.name === 'finishReply')) return { calls: [], text: '[]' };
    lastSystem = system;
    let i = turns.length - 1;
    while (i >= 0 && !(turns[i].role === 'user' && !(turns[i] as any).text.startsWith('(system)'))) i--;
    const userText = (turns[i] as Extract<Turn, { role: 'user' }>).text;
    const n = turns.slice(i + 1).filter((t) => t.role === 'model_calls' || t.role === 'model').length;
    const s = script.find((x) => x.re.test(userText));
    if (!s) return fr('Okay.');
    return s.steps[Math.min(n, s.steps.length - 1)];
  },
};
const { setProvider } = await import('../src/server/llm.js');
setProvider(scripted);

const { db } = await import('../src/server/db.js');
await db.init();
const A = await import('../src/server/abel.js');
const { findSimilar } = await import('../src/server/similar.js');
const { offlineAnswer } = await import('../src/server/abelOffline.js');
const { FRAUD } = await import('../src/server/safety.js');
const { explainFor } = await import('../src/server/advice/chatCard.js');
const { validateRule, loadRules } = await import('../src/server/advice/rules.js') as any;
const { registerV14Routes } = await import('../src/server/routes.js');
const app = express(); app.use(express.json({ limit: '2mb' })); registerV14Routes(app);
const server = app.listen(0);
const BASE = `http://127.0.0.1:${(server.address() as any).port}`;
const post = async (url: string, body: unknown) => { const r = await fetch(BASE + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) as any }; };
let conv: string | undefined;
const say = async (text: string, userId = 'lauri') => {
  const r = await post('/api/chat', { userId, text, conversationId: conv });
  conv = r.body.conversationId;
  const a = r.body.messages?.[1] || {};
  return { text: String(a.text || ''), cards: (a.cards || []) as any[], id: a.id as string, offline: a.supplied?.source === 'scripted', raw: a };
};
const { safetyLinesFor, SAFETY_SHOWN } = await import('../src/server/safety.js');
const { notPast } = await import('../src/server/importPropose.js');

// ================= pure checks =================
// F1: where the money goes is read from the customer's words.
check('F1: "move 40e from my current account to the car fund please" → car fund', A.transferTarget('move 40e from my current account to the car fund please', '') === 'carFund');
check('F1: "move 40e to the car fund" is ONE transfer', A.transferIsOnce('move 40e from my current account to the car fund please', ''));
check('F1: "move 200 to savings" → savings', A.transferTarget('move 200 to savings', '') === 'savings');
check('F1: "transfer 5000 from savings to current" → not possible here', A.transferTarget('transfer 5000 from savings to current', '') === 'unsupported');
check('F1: "yes, 25 then" after asking about the car fund → car fund', A.transferTarget('yes, 25 then', 'move 40 to the car fund please') === 'carFund');
check('F1: "put 100 aside" after talking about the flat → savings', A.transferTarget('put 100 aside', 'how is my flat deposit going') === 'savings');

// Scams: the everyday words, and the right steps for each.
for (const t of ['someone called from nordea asking for my bank codes', 'i got a text saying my account is locked click here', 'there is a payment i dont recognise', 'my grandson asked me to send him 2000 euros quickly', 'someone from the bank called and asked me to move my money to a safe account', 'I lost my card', 'my card was stolen'])
  check(`scam words caught: "${t}"`, FRAUD.test(t));
for (const t of ['How much is in my accounts?', 'can i send my son 50 for his birthday', 'what is my balance', 'I want to give money to my grandchildren', 'move 200 to savings', 'i lost my job'])
  check(`not a scam: "${t}"`, !FRAUD.test(t));
check('lost card: steps about blocking the card, no "link"', /^If your card is lost or stolen/.test(safetyLinesFor('I lost my card')) && !/link/i.test(safetyLinesFor('I lost my card')));
check('grandchild request: call them back on a number you know', /Call the person back on the number you already have/.test(safetyLinesFor('my grandson asked me to send him 2000 euros quickly')));
check('codes by phone: Nordea never asks for codes, never a "safe account"', /never asks for your online banking codes by phone/.test(safetyLinesFor('someone called from nordea asking for my bank codes')) && /safe account/.test(safetyLinesFor('they want me to move money to a safe account')));
check('unknown payment: "I can’t tell from here"', /can’t tell from here/.test(safetyLinesFor('there is a payment i dont recognise')));
check('every kind of steps is recognised as already shown', ['I lost my card', 'my grandson needs money urgently, send it quickly', 'they asked for my codes on the phone', 'a payment i dont recognise'].every((x) => SAFETY_SHOWN.test(safetyLinesFor(x))));
check('reassurance is caught: "It’s probably nothing"', A.REASSURE.test('It’s probably nothing, but check the app.'));
check('reassurance is caught: "it almost certainly didn’t happen"', A.REASSURE.test('If you don’t see it there, it almost certainly didn’t happen.'));
check('calm words are fine: "I can’t tell from here"', !A.REASSURE.test('I can’t tell from here whether it is real.'));

// F2: a tool name inside the words cut them off mid-sentence.
const c1 = A.cleanReply('Please don’t reply to it. If you want, a Nordea adviser (startHandoff) can look at it.');
check('F2: "…a Nordea adviser (startHandoff…" never ends with "("', !/\(\s*$/.test(c1) && c1 === 'Please don’t reply to it.', c1);
const c2 = A.cleanReply('That sounds stressful. Want me to connect startHandoff({})');
check('F2: "Want me to connect" is not left hanging', c2 === 'That sounds stressful.', c2);
check('F2: a normal reply is untouched', A.cleanReply('Here is your balance.') === 'Here is your balance.');

// F9: a plan's date is never in the past.
check('F9: "March 2026" read in November 2026 becomes March 2027', notPast('2026-03-31', '2026-11-20') === '2027-03-31');
check('F9: a future date stays', notPast('2027-08-31', '2026-11-20') === '2027-08-31');
check('F9: this month stays', notPast('2026-11-30', '2026-11-20') === '2026-11-30');
db.addCabinetEntry({ ...db.getCabinetEntries('lauri')[0], createdAt: new Date().toISOString(), id: 'alex-festival', userId: 'alex', type: 'goal', title: 'Festival next summer', detail: 'Tickets and travel', goalType: 'travel', target: { amount: 400, date: '2027-08-31' }, status: 'active', private: false } as any, { by: 'you', how: 'test' });
check('F9: a Tallinn trip is not "the same" as the festival goal', !findSimilar('alex', { type: 'goal', title: 'Weekend trip to Tallinn', detail: 'In March', goalType: 'travel', target: { amount: 300, date: '2027-03-31' } }));
check('F9: a festival goal is still found as the festival', findSimilar('alex', { type: 'goal', title: 'Summer festival tickets', goalType: 'travel', target: { amount: 450, date: '2027-08-31' } })?.id === 'alex-festival');

// ================= the reported conversation, through the real routes =================
// F1: the model asks for a MONTHLY card and says "car fund"; the card must follow the customer.
const before = db.getUser('lauri')!.accounts;
script = [{ re: /car fund/i, steps: [tool('offerTransfer', { amountPerMonth: 40, once: false }), fr('Sure, I can set up a transfer of 40 € from your current account to the car fund. Just confirm below to move the money.', { suggestions: ['Confirm transfer', 'Am I on track?'] })] }];
conv = undefined;
let r = await say('move 40e from my current account to the car fund please');
const card = r.cards.find((c) => c.type === 'confirm_plan');
check('F1: the card is ONE transfer, now', !!card && card.data.once === true, card);
check('F1: the card goes to the car fund (not the flat)', !!card && card.data.to === 'Car fund' && card.data.toAccount === 'carFund', card?.data);
check('F1: the words and the card agree (car fund, not monthly)', /car fund/i.test(r.text) && !/every month|monthly|flat/i.test(r.text), r.text);
check('F1: no second "Confirm transfer" quick reply next to the card', !(r.raw.suggestions || []).some((s: string) => /confirm/i.test(s)), r.raw.suggestions);
const done = await post('/api/actions', { userId: 'lauri', messageId: r.id, action: 'plan_confirm' });
const after = db.getUser('lauri')!.accounts;
check('F1: confirming moves 40 € from current to the car fund, savings untouched', Math.abs((before.current.balance - after.current.balance) - 40) < 0.001 && Math.abs((after.carFund!.balance - before.carFund!.balance) - 40) < 0.001 && after.savings.balance === before.savings.balance, { before, after });
check('F1: the confirmation names the car fund', (done.body.messages || []).some((m: any) => /moved to your car fund now/.test(m.text)), done.body);

// The model names the flat for a car-fund card: the words are replaced by the card's own.
script = [{ re: /car fund/i, steps: [tool('offerTransfer', { amountPerMonth: 25 }), fr('Done, 25 € goes to your flat savings.'), fr('Done, 25 € goes to your flat savings.')] }];
conv = undefined;
r = await say('can you put 25 into the car fund');
check('F1: words naming the flat for a car-fund card never reach the customer', !/flat/i.test(r.text) && /car fund/i.test(r.text), r.text);

// Monthly to the car fund: no card (only savings can be monthly here), and the model is told why.
script = [{ re: /every month/i, steps: [tool('offerTransfer', { amountPerMonth: 100, once: false }), fr('A monthly transfer can only go to savings from here. I can move money to the car fund once now, or you can use Transfers in the app.')] }];
conv = undefined;
r = await say('set up 100 every month to the car fund');
check('monthly to the car fund: no card is shown', !r.cards.some((c) => c.type === 'confirm_plan'), r.cards);
// From savings: no card.
script = [{ re: /from savings/i, steps: [tool('offerTransfer', { amountPerMonth: 500 }), fr('I can only move money from your current account here. Use Transfers in the app.')] }];
conv = undefined;
r = await say('transfer 500 from savings to current');
check('from savings: no card is shown', !r.cards.some((c) => c.type === 'confirm_plan'), r.cards);

// Scams through the routes: the steps come first even when the model says something else.
script = [{ re: /bank codes/i, steps: [fr('It’s probably nothing, but you could check the app.'), fr('It’s probably nothing, but you could check the app.')] }];
conv = undefined;
r = await say('someone called from nordea asking for my bank codes');
check('scam call: the safety steps come first', r.text.startsWith('If this might be a scam, do this now:'), r.text);
check('scam call: no "probably nothing"', !/probably nothing/i.test(r.text), r.text);
script = [{ re: /grandson/i, steps: [fr('That is kind of you.')] }];
conv = undefined;
r = await say('my grandson asked me to send him 2000 euros quickly', 'eeva');
check('grandchild request: Eeva gets "check first" steps', r.text.startsWith('Before you send any money, please check first'), r.text);

script = [{ re: /pension/i, steps: [fr('Hi Lauri! Your pension came in.')] }];
conv = undefined;
r = await say('did my pension come in?', 'eeva');
check('names: Eeva is never greeted as "Lauri"', /Hi Eeva/.test(r.text) && !/Lauri/.test(r.text), r.text);

// ================= offline answers (no AI) =================
const off = (t: string, u = 'lauri', before = '') => offlineAnswer(u, t, db.getCabinetEntries(u).filter((e) => e.status === 'active' && !e.private), 'no_ai', before);
check('offline: "i already gave them" after a codes call → call customer service now', /call Nordea’s customer service now/.test(off('i already gave them', 'lauri', 'someone called from nordea asking for my bank codes').text));
check('offline: partner controls money → kind words, 112, a person', /sorry/i.test(off('my partner controls all my money and wont let me see it').text) && /112/.test(off('my partner controls all my money and wont let me see it').text));
check('offline: lost job → kind words and where they stand', /sorry/i.test(off('i lost my job').text) && /current account/.test(off('i lost my job').text));
check('offline: stressed → kind words', /sorry it’s weighing on you/.test(off('i feel really stressed about money').text));
check('offline: "is my data safe?" → Who sees it', /Who sees it/.test(off('is my data safe?').text));
check('offline: "delete everything you know about me" → Nora knows', /Nora knows/.test(off('delete everything you know about me').text));
check('offline: "please do not save anything about me" → Nora knows', /Nora knows/.test(off('please do not save anything about me', 'eeva').text));
check('offline: "what can you do" → a real list', /balances/.test(off('what can you do').text));
check('offline: "are you a bot?" → AI assistant', /AI assistant/.test(off('are you a bot?').text));
check('offline: "what is my pin" → never share', /can’t see or share your PIN/.test(off('what is my pin').text));
check('offline: "block it" after a lost card → in the app under Cards', /under Cards/.test(off('block it', 'lauri', 'i lost my card').text));
check('offline: "pay my electricity bill" → Payments, not the salary', /Payments/.test(off('pay my electricity bill').text) && !/latest pay/.test(off('pay my electricity bill').text));
check('offline: "what interest does my savings account pay" → no salary answer', !/latest pay/.test(off('what interest does my savings account pay').text));
check('offline: "send 50 euros to my mom" → Payments', /Payments/.test(off('send 50 euros to my mom').text));
const mv = off('move 200 to savings');
check('offline: "move 200 to savings" → the transfer card', (mv.actions || []).some((a) => a.name === 'offerTransfer' && a.args.amountPerMonth === 200), mv);
check('offline: "transfer 5000 from savings to current" → not from here', /only move money from your current account/.test(off('transfer 5000 from savings to current').text));
check('offline: "set up 100 a month to the car fund" → only savings monthly', /monthly transfer can only go to savings/.test(off('set up 100 a month to the car fund').text));
check('offline: "i want a loan for a car" → an adviser card', (off('i want a loan for a car').actions || []).some((a) => a.name === 'startHandoff'));
check('offline: "should i buy nvidia shares" → no advice, an adviser', /can’t give investment/.test(off('should i buy nvidia shares').text));
check('offline: "what is eevas balance" → only your own accounts', /only show your own accounts/.test(off('what is eevas balance').text));
check('offline: "moi, paljonko mulla on rahaa" → the balances', /Current account/.test(off('moi, paljonko mulla on rahaa').text));
check('offline: "bye" → a goodbye', /Bye/.test(off('bye').text));
check('offline: Eeva\'s pension is called a pension', /latest pension was/.test(off('how much is my pension', 'eeva').text));
check('offline: Alex with no spending → no empty list', /can’t see any spending/.test(off('what did i spend on food', 'alex').text));
check('offline: "how much on wolt this month" → the spending', /went out/.test(off('how much did i spend on food last month').text));

check('offline: "and the car fund?" is not an investment question', !/investment/.test(off('and the car fund?').text));
check('offline: "did i pay rent" → spending, not "can’t pay bills"', !/can’t pay bills/.test(off('did i pay rent').text));
check('offline: "what interest does my savings account pay" → not the balances', !/^Current account/.test(off('what interest does my savings account pay').text));
check('offline: "is there a student account" → not the balances', !/^Current account/.test(off('is there a student account', 'alex').text));
check('offline: "forget the car goal" → Nora knows, not the goal list', /Nora knows/.test(off('forget the car goal').text));

server.close();
console.log(`\nRESULT ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
