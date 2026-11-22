/**
 * v29: what the customer is told must be true. One check (or a few) for each conversation in the
 * stress-test reports, pressed through the real HTTP routes with a scripted model that misbehaves
 * the way the live model did:
 *  - claims it is "connecting you with an adviser" (nothing was connected),
 *  - adds payments up wrongly and blames "timing",
 *  - calls a monthly transfer "right away",
 *  - overwrites a private note with a reminder,
 *  - says "I don't store your data", leaks "Quick replies" lists, writes ISO dates, misspells the name.
 * Plus the pure checks behind them. Temporary data folder, bundled demo customers, no network.
 */
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

// ================= pure checks =================
// C2: exact amounts must be exact; round numbers may still be rounded.
check('C2: 18 470,50 is caught when the true total is 18 370,50', A.unsupportedNumbers('Together that is 18 470,50 €.', [18370.5], [18370.5]).length === 1);
check('C2: 18 370,50 itself is fine', A.unsupportedNumbers('Together that is 18 370,50 €.', [18370.5], [18370.5]).length === 0);
check('C2: "about 18 400 €" (round) is still fine', A.unsupportedNumbers('That is about 18 400 €.', [18370.5], [18370.5]).length === 0);
check('C2: 1 237 € for a known 1 236,80 is fine', A.unsupportedNumbers('You pay 1 237 € a month.', [1236.8], [1236.8]).length === 0);
check('C2: 1 273 € for a known 1 236,80 is caught', A.unsupportedNumbers('You pay 1 273 € a month.', [1236.8], [1236.8]).length === 1);
check('C2: a sum with cents is checked exactly (100,25 + 200,25 = 300,50 ok; 310,50 not)', A.unsupportedNumbers('In all 300,50 €.', [], [100.25, 200.25]).length === 0 && A.unsupportedNumbers('In all 310,50 €.', [], [100.25, 200.25]).length === 1);

// C1: claims of doing what Nora can't.
for (const t of ['I’m connecting you with an adviser now. Keep your phone nearby.', 'I have blocked your card.', 'An adviser will call you shortly.', 'I’ll set a reminder for the rent.', 'I’ve booked a meeting for Tuesday.', 'We’ve alerted the fraud team.'])
  check(`C1: claim caught: "${t}"`, A.ACTION_CLAIM.test(t));
for (const t of ['Tap Connect me below to reach a Nordea adviser.', 'You can block the card in the app under Cards.', 'An adviser can help with that.', 'I can’t set reminders, but your phone’s calendar can.', 'Call Nordea’s customer service: the number is on the back of your card.'])
  check(`C1: honest words not flagged: "${t}"`, !A.ACTION_CLAIM.test(t));

// Privacy words.
for (const t of ['I don’t store any of your data.', 'Nothing is saved.', 'I have no memory of past chats.'])
  check(`privacy: wrong claim caught: "${t}"`, A.NOT_STORED_CLAIM.test(t));
check('privacy: "I keep only what you’ve approved" is fine', !A.NOT_STORED_CLAIM.test('I keep only what you’ve approved in Nora knows.'));

// Scam words.
for (const t of ['I think I got scammed', 'I clicked a link in an SMS and typed my codes', 'someone used my card', 'I lost my wallet', 'I didn’t make this payment'])
  check(`fraud words: "${t}"`, FRAUD.test(t));
for (const t of ['How much is in my accounts?', 'I want to save for a flat', 'Is my card working abroad?'])
  check(`not fraud: "${t}"`, !FRAUD.test(t));

// Once or every month: the customer's words decide.
check('transfer: "move 50 € to savings" is once', A.transferIsOnce('move 50 € to savings', ''));
check('transfer: "move 50 € to savings every month" is monthly', !A.transferIsOnce('move 50 € to savings every month', ''));
check('transfer: "put 200 a month aside" is monthly', !A.transferIsOnce('put 200 a month aside', ''));
check('transfer: "yes, do it" after "50 € now please" is once', A.transferIsOnce('yes, do it', 'can I move 50 € now please'));
check('transfer: "yes" after "set up a monthly saving" is monthly', !A.transferIsOnce('yes', 'can you set up a monthly saving'));

// cleanReply.
const cr = A.cleanReply('Here you go.\n\nQuick replies:\n- Am I on track?\n- Plan my payday');
check('clean: a "Quick replies" list is removed', cr === 'Here you go.', cr);
check('clean: "Nord‑Nordea" becomes "Nordea"', A.cleanReply('Ask Nord‑Nordea about it.') === 'Ask Nordea about it.', A.cleanReply('Ask Nord‑Nordea about it.'));
check('clean: ISO dates become words', A.cleanReply('It lands on 2026-11-05.') === 'It lands on 5 November 2026.', A.cleanReply('It lands on 2026-11-05.'));
check('names: "Eevi" becomes "Eeva"', A.fixName('Hi Eevi! How are you?', 'Eeva') === 'Hi Eeva! How are you?');
check('names: other names stay ("Eino", "Mia")', A.fixName('Eino and Mia', 'Eeva') === 'Eino and Mia');

// Which note was named.
check('notes: "delete my car goal" names "Save for a car"', A.namesEntry({ title: 'Save for a car' }, 'delete my car goal'));
check('notes: "remind me to pay rent" does not name "Mia is pregnant"', !A.namesEntry({ title: 'Mia is pregnant' }, 'remind me to pay rent'));

// Duplicates: a reminder is never "like" a private note.
const priv = { ...db.getCabinetEntries('lauri')[0], id: 'lauri-test-private', title: 'Mia is pregnant', detail: 'Lauri asked to keep this private', type: 'fact' as const, private: true, status: 'active' as const };
db.addCabinetEntry(priv as any, { by: 'you', how: 'test' });
check('duplicates: "Pay rent" is not similar to the private "Mia is pregnant"', !findSimilar('lauri', { type: 'fact', title: 'Pay rent', detail: 'Lauri asked to remember the rent' }));
check('duplicates: names alone never make two notes alike', !findSimilar('lauri', { type: 'fact', title: 'Lauri asked about dentists', detail: 'Lauri said keep it' }));

// Offline.
const off = offlineAnswer('lauri', 'thanks! and can I give my grandkids money tax-free?', [], 'no_ai');
check('offline: a question after "thanks" is not answered with only "You’re welcome"', !/^You’re welcome/.test(off.text), off.text);
check('offline: no "in a few minutes" promise', !/few minutes/.test(offlineAnswer('lauri', 'what is the meaning of life', [], 'no_ai').text));
check('offline: scam gives the balances', /current account has/.test(offlineAnswer('lauri', 'I think I got scammed', [], 'no_ai').text));

// The rule's own explanation (ASP bonus is paid once, afterwards).
const ex = explainFor('asp-account', '2026-10-23');
check('ASP explanation says the bonus is paid once, afterwards, never per deposit', /paid once, afterwards/.test(ex) && /not paid on every deposit/.test(ex) && /31 December/.test(ex), ex);
check('gift explanation names the limit and says not to calculate tax', /7 500 €/.test(explainFor('gift-limit', '2026-10-23')) && /Never work out the tax/.test(explainFor('gift-limit', '2026-10-23')));
if (typeof validateRule === 'function') {
  const bad = validateRule({ ...JSON.parse(fs.readFileSync('rules/asp-account@2026-06-01.json', 'utf8')), explain: 'It pays 4 % on every deposit.' });
  check('rules: a number typed into explain is refused', (bad || []).some((e: string) => /explain/.test(e)), bad);
} else check('rules: the catalogue still loads with explain', loadRules().rules.length > 0);

// ================= conversations from the reports =================
// C1 + scam: "I clicked a link and typed my codes" → the model claims it is connecting an adviser.
script = [{ re: /clicked a link/i, steps: [fr('I’m connecting you with a Nordea adviser right now. Keep your phone nearby.'), fr('I’m connecting you with a Nordea adviser right now. Keep your phone nearby.')] }];
conv = undefined;
let r = await say('Help, I clicked a link in an SMS and typed my bank codes');
check('scam: the safety steps come first', r.text.startsWith('If this might be a scam, do this now:'), r.text);
check('scam: neutral wording (number on the back of the card / nordea.fi), no phone number written', /back of your card/.test(r.text) && /nordea\.fi/.test(r.text) && !/\+?358|0200/.test(r.text), r.text);
check('C1: no "connecting you" and no "keep your phone nearby"', !/connecting you|phone nearby/i.test(r.text), r.text);
check('C1: the adviser card is really there, and the words point to it', r.cards.some((c) => c.type === 'handoff') && /Tap Connect me below/.test(r.text), { text: r.text, cards: r.cards.map((c) => c.type) });
script = [{ re: /what now/i, steps: [fr('Did you manage to call them?')] }, { re: /typed my codes again/i, steps: [fr('Please call customer service now.')] }];
r = await say('ok what now');
check('scam: the safety steps are not repeated when the customer moves on', !/If this might be a scam/.test(r.text), r.text);
r = await say('oh no I typed my codes again on that site');
check('scam: shown once per conversation, even when scam words come again', !/If this might be a scam/.test(r.text), r.text);

// C1 for "talk to a person": a claim without the card gets the card, once.
script = [{ re: /real person/i, steps: [fr('Sure, an adviser will call you this afternoon.'), fr('Sure, an adviser will call you this afternoon.')] }];
conv = undefined;
r = await say('Can I talk to a real person about my savings?');
check('person: the card is shown and nobody "will call"', r.cards.some((c) => c.type === 'handoff') && !/adviser will call/.test(r.text) && /nobody will call until you connect/.test(r.text), { text: r.text, cards: r.cards.map((c) => c.type) });
script = [{ re: /thanks.*buffer/i, steps: [tool('startHandoff', {}), fr('Here you go.')] }];
r = await say('thanks, and how big should my buffer be?');
check('person: the adviser card is not offered again in the next answer', !r.cards.some((c) => c.type === 'handoff'), r.cards.map((c) => c.type));

// C2: payments added up wrongly, then "timing" blamed → caught; the reply never shows the wrong total.
script = [{ re: /add up/i, steps: [fr('Together they come to 18 470,50 €.'), fr('Together they come to 18 470,50 €, there is a small timing difference.')] }];
conv = undefined;
r = await say('Can you add up my two balances? Current 4 120,25 € and savings 14 250,25 €');
check('C2: a wrong exact total never reaches the customer', !/18 470,50/.test(r.text), r.text);

// Lost context: "the payment I asked about" → findTransactions is a real tool with real results.
script = [{ re: /supermarket/i, steps: [tool('findTransactions', { text: 'K-Supermarket', minAmount: 100 }), fr('I found it.')] }];
conv = undefined;
r = await say('When did I last pay at the supermarket over 100 €?');
check('payments: findTransactions runs without an error (reply not replaced by the offline answer)', !r.offline, r.raw);

// C3: a one-time transfer, described as monthly → corrected; confirming moves the balances once.
const before = db.getUser('lauri')!.accounts;
script = [{ re: /move 50/i, steps: [tool('offerTransfer', { amountPerMonth: 50 }), fr('I set up 50 € every month for you.'), fr('I set up 50 € every month for you.')] }];
conv = undefined;
r = await say('Please move 50 € to my savings');
const plan = r.cards.find((c) => c.type === 'confirm_plan');
check('C3: "move 50 €" gives a ONE-TIME transfer card', !!plan && plan.data.once === true && /now/.test(plan.title), plan);
check('C3: the words don’t say "every month" for a one-time card', !/every month|monthly/i.test(r.text), r.text);
const done = await post('/api/actions', { userId: 'lauri', messageId: r.id, action: 'plan_confirm' });
const after = db.getUser('lauri')!.accounts;
check('C3: confirming moves 50 € once (current −50, savings +50)', Math.abs((before.current.balance - after.current.balance) - 50) < 0.001 && Math.abs((after.savings.balance - before.savings.balance) - 50) < 0.001, { before, after, done: done.body });
check('C3: the confirmation says it was a one-time move', (done.body.messages || []).some((m: any) => /moved to .* now\. This was a one-time move/.test(m.text)), done.body);
const extraBefore = db.getUser('lauri')!.extraMonthly || 0;
script = [{ re: /every month/i, steps: [tool('offerTransfer', { amountPerMonth: 60 }), fr('Great, 60 € will move right away.'), fr('Great, 60 € will move right away.')] }];
r = await say('and set up 60 € every month too');
const plan2 = r.cards.find((c) => c.type === 'confirm_plan');
check('C3: "every month" gives a MONTHLY card', !!plan2 && !plan2.data.once, plan2);
check('C3: the words don’t say "right away" for a monthly card', !/right away/i.test(r.text), r.text);
await post('/api/actions', { userId: 'lauri', messageId: r.id, action: 'plan_confirm' });
check('C3: confirming the monthly card moves nothing now, and adds 60 € a month', (db.getUser('lauri')!.extraMonthly || 0) - extraBefore === 60 && Math.abs(db.getUser('lauri')!.accounts.current.balance - after.current.balance) < 0.001);

// C4: "remind me to pay rent" must not touch the private "Mia is pregnant" note.
script = [{ re: /remind me/i, steps: [tool('proposeCabinetChange', { action: 'update', entryId: 'lauri-test-private', title: 'Remind: pay rent' }), fr('Done, I’ll remind you.'), fr('Okay.')] }];
conv = undefined;
r = await say('remind me to pay rent on the 1st');
const kept = db.getCabinetEntry('lauri-test-private')!;
check('C4: the private note is untouched', kept.title === 'Mia is pregnant' && kept.status === 'active', kept);
check('C4: no reminder claim in the reply', !/I’ll remind you/.test(r.text), r.text);
script = [{ re: /pay rent/i, steps: [tool('proposeCabinetChange', { action: 'add', type: 'fact', title: 'Remind: pay rent' }), fr('Okay.')] }];
r = await say('please note: pay rent');
check('C4: a reminder is never saved as a note', !db.getCabinetEntries('lauri').some((e) => /remind/i.test(e.title)));
script = [{ re: /japan/i, steps: [tool('proposeCabinetChange', { action: 'archive', entryId: 'lauri-car-goal' }), fr('Done.'), fr('Okay.')] }];
r = await say('I am not going to Japan after all');
check('notes: archiving a goal the customer never named is refused (car goal kept)', db.getCabinetEntry('lauri-car-goal')!.status !== 'archived');

// Privacy wording, Quick-replies leak, ISO date, name.
script = [{ re: /what do you keep/i, steps: [fr('I don’t store any of your data. Quick replies:\n- Show my notes'), fr('I don’t store any of your data.')] }];
conv = undefined;
r = await say('what do you keep about me?');
check('privacy: no "I don’t store" claim reaches the customer', !/don’t store/.test(r.text) && /approved in Nora knows/.test(r.text), r.text);
check('privacy: no "Quick replies" text', !/Quick replies/i.test(r.text), r.text);

// Off-topic: the prompt carries the customer's own wording.
check('prompt: off-topic rule with the agreed sentence', /keep you company for a moment/.test(lastSystem), lastSystem.slice(0, 200));
check('prompt: no reminders, never saved as a note', /reminder/i.test(lastSystem));

// ASP follow-up: the explanation stays available after the card.
script = [{ re: /saving for a flat/i, steps: [fr('Good to know.')] }, { re: /bonus work/i, steps: [fr('The bonus is paid once, afterwards.')] }];
conv = undefined;
await say('We are saving for a flat with Mia');
await say('how does the bonus work?');
check('ASP: the follow-up question gets the official explanation in the prompt', /paid once, afterwards/.test(lastSystem), lastSystem.match(/THIS TURN:[^\n]*/)?.[0]);

server.close();
console.log(`\nRESULT ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
