/** Whole-product audit, 24 Nov 2026: conversation-state regressions through the real /api/chat route with a
 *  scripted provider. Scripted model output: proves the app's contracts, not live model quality. */
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-conv-')); process.env.PORT = '3821'; process.env.NODE_ENV = 'production';
for (const k of ['SUPABASE_URL', 'GEMINI_API_KEY', 'LLM_API_KEY', 'GROQ_API_KEY', 'USER_DB_URL', 'AGENT_DB_URL', 'SHARED_DB_URL']) delete process.env[k];
const { db } = await import('../src/server/db.js'); const finance = await import('../src/server/finance.js'); const { setProvider } = await import('../src/server/llm.js');
let script: any[] = []; let calls = 0;
setProvider({ name: 'audit-scripted', isConfigured: () => true, step: async (a: any) => { calls++; const x = script.shift(); return typeof x === 'function' ? x(a) : x ?? fin('[script empty]'); } } as any);
await import('../server.ts'); await new Promise((r) => setTimeout(r, 500));
const base = 'http://127.0.0.1:3821';
const J = async (url: string, b?: any) => { const r = await fetch(base + url, { method: b ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json() as any }; };
function fin(text: string, extra: any = {}) { return { calls: [{ name: 'finishReply', args: { text, suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true, ...extra } }] }; }
const tool = (name: string, args: any) => ({ calls: [{ name, args }] });
const conv = async () => (await J('/api/conversations', { userId: 'lauri', helperId: 'abel' })).body.conversation.id;
const say = async (c: string, text: string) => (await J('/api/chat', { userId: 'lauri', conversationId: c, text })).body.messages.at(-1);
let n = 0; const failed: string[] = []; const pass = (m: string) => { n++; console.log('PASS ', m); };
let c = ''; let r: any; let t1: any;
const section = async (name: string, fn: () => Promise<void>) => { script = []; try { await fn(); } catch (e: any) { failed.push(name); console.log('FAIL ', name, '—', String(e.message).replace(/\n+/g, ' ').slice(0, 400)); } };

// 1. Correct personal figures in Nora's own words are shown as written (before: rejected, generic failure).
await section('figures in prose', async () => {
c = await conv();
script = [fin('Your average tracked spending is 2107 EUR per month, with housing at 1150 EUR.')];
r = await say(c, 'how is my budget looking?');
assert.equal(r.text, 'Your average tracked spending is 2107 EUR per month, with housing at 1150 EUR.'); assert.ok(!r.offline); pass('verified figures in prose are accepted as the model wrote them');
// …but a real value given another role is never shown, even after a retry.
c = await conv(); script = [fin('Your salary is 2107 EUR a month.'), fin('Your salary is 2107 EUR a month.')];
r = await say(c, 'what is my salary?');
assert.doesNotMatch(r.text, /2107/); pass('a role-swapped figure ("salary" for spending) is refused');
// …and the failure says what happened, without calling a budget question a calculation.
assert.doesNotMatch(r.text, /calculation/); assert.match(r.text, /could not check the figures/); assert.deepEqual(r.suggestions, ['Try answering again', 'Ask a Nordea adviser']); pass('figure-check failure is labelled as such, not "calculation"');
// Greeting → bare "yes" → budget: the "yes" answers Nora's own question, so budget facts are the relevant ones.
c = await conv(); script = [fin('Hi Lauri! Would you like a quick look at your budget?')]; await say(c, 'hey');
script = [fin('Your average tracked spending is 2107 EUR per month. Housing is your biggest cost at 1150 EUR.'), fin('[retry]')];
r = await say(c, 'yes');
assert.equal(r.text, 'Your average tracked spending is 2107 EUR per month. Housing is your biggest cost at 1150 EUR.'); pass('greeting → "yes" → budget figures in prose are accepted (the "yes" resolves to the budget question)');
// Negative control: the same "yes" with no pending question does not widen what counts as relevant.
c = await conv(); script = [fin('Your average tracked spending is 2107 EUR per month.'), fin('Your average tracked spending is 2107 EUR per month.')];
r = await say(c, 'yes');
assert.doesNotMatch(r.text, /2107/); pass('a bare "yes" with no question before it does not unlock budget figures');
// A real calculation request keeps the calculation wording and retry label.
c = await conv(); script = [fin('That takes 99 months.'), fin('That takes 99 months.')];
r = await say(c, 'How many months until I reach my flat goal if I save 50 more a month?');
assert.match(r.text, /calculation/); assert.ok(r.suggestions.includes('Retry the calculation')); pass('a calculation request keeps its calculation-specific failure and retry');

});
// 2. A typed "yes" never completes an action, and Nora cannot say it did.
await section('typed yes / completion', async () => {
c = await conv();
script = [tool('offerTransfer', { amountPerMonth: 40, once: true }), fin('Here is the one-time transfer for you to check.')];
t1 = await say(c, 'move 40 euros to my savings');
assert.ok(t1.cards.some((x: any) => x.type === 'confirm_plan'));
const before = JSON.stringify(finance.accounts('lauri'));
script = [fin('Great, done! The money is on its way.'), fin('All done!')];
r = await say(c, 'yes');
assert.equal(JSON.stringify(finance.accounts('lauri')), before); assert.doesNotMatch(r.text, /\bdone\b/i); assert.match(r.text, /use the button on the card above/); pass('typed "yes" with a waiting transfer card: nothing moves and no false "done"');
// The card itself still works once, and a second tap is refused.
const tap = await J('/api/actions', { userId: 'lauri', messageId: t1.id, action: 'plan_confirm' });
assert.equal(tap.status, 200); assert.match(tap.body.messages.at(-1).text, /moved/);
const afterTap = JSON.stringify(finance.accounts('lauri')); assert.notEqual(afterTap, before, 'the tap changes the balances (so the typed-yes check above is not vacuous)');
assert.equal((await J('/api/actions', { userId: 'lauri', messageId: t1.id, action: 'plan_confirm' })).status, 409); assert.equal(JSON.stringify(finance.accounts('lauri')), afterTap, 'a repeated tap moves nothing'); pass('the confirmation tap runs once; a repeated tap is refused');
// After a real tap, an honest "it went through" is allowed.
script = [fin('Yes, that transfer went through after you confirmed it.')];
r = await say(c, 'did it go through?');
assert.match(r.text, /went through/); pass('after a confirmed tap, a completion statement is not blocked');
// Negative control: wording that says it still needs a tap is fine.
c = await conv(); script = [tool('offerTransfer', { amountPerMonth: 25, once: true }), fin('Once you tap the button on the card, the money will be moved. Nothing has moved yet.')];
r = await say(c, 'put 25 into savings');
assert.match(r.text, /Nothing has moved yet/); pass('"once you tap … nothing has moved" is not treated as a completion claim');
// No card at all: "done" is still refused.
c = await conv(); script = [fin('Done! Your monthly saving is set up.'), fin('All set, it is set up.')];
r = await say(c, 'start a monthly saving for the flat');
assert.doesNotMatch(r.text, /set up\b(?!.*confirm)/i); assert.match(r.text, /Nothing has been done yet/); pass('"Done, it is set up" with no card and no tap is refused');

});
// 3. A refused fact save does not produce goal wording, and Nora cannot say she saved it.
await section('refused save', async () => {
c = await conv();
script = [tool('proposeCabinetChange', { action: 'add', type: 'fact', title: 'Getting divorced', sensitive: false }), tool('offerTransfer', { amountPerMonth: 50, once: true }), fin('I have noted that. Here is the transfer for you to check.'), fin('Here is the transfer for you to check. I have not saved anything.')];
const entries = db.getCabinetEntries('lauri').length;
r = await say(c, "Don't save this, I'm getting divorced. Move 50 to my savings please.");
assert.equal(db.getCabinetEntries('lauri').length, entries); assert.doesNotMatch(r.text, /goal name/); assert.doesNotMatch(r.text, /noted/); assert.ok(r.cards.some((x: any) => x.type === 'confirm_plan')); pass('refused fact save: transfer card kept, no goal wording, no "noted"');
// The goal-specific outcome text still applies to a refused goal write.
const g = db.getCabinetEntries('lauri').find((e) => e.type === 'goal' && e.status === 'active')!;
c = await conv(); script = [tool('proposeCabinetChange', { action: 'add', type: 'goal', title: g.title, targetAmount: g.target?.amount, targetDate: g.target?.date, goalType: g.goalType }), fin('Saved your goal!')];
r = await say(c, `Save a goal: ${g.title}`);
assert.doesNotMatch(r.text, /Saved your goal/); pass('a refused or duplicate goal write keeps its code-owned outcome text');

});
// 5. Defects seen in the live run on the published app (24 Nov 2026), reproduced here with scripted output.
await section('live-run follow-ups', async () => {
  // A completion claim next to a card prepared in the same reply: describe the card, not "nothing has been done".
  c = await conv(); script = [tool('offerTransfer', { amountPerMonth: 40, once: true }), fin('I have set up your transfer, all done!'), fin('All done, it is set up!')];
  r = await say(c, 'move 40 euros to my savings');
  assert.ok(r.cards.some((x: any) => x.type === 'confirm_plan')); assert.doesNotMatch(r.text, /Tell me what you would like to do/); assert.match(r.text, /prepared a one-time move of 40 €.*Nothing has moved yet/s);
  pass('a false "done" beside a fresh card is replaced by a description of that card');
  // A typed "yes" must not add a second card for the same waiting transfer.
  c = await conv(); script = [tool('offerTransfer', { amountPerMonth: 50, once: true }), fin('Here is the transfer for you to check.')];
  await say(c, 'move 50 to my savings please');
  script = [tool('offerTransfer', { amountPerMonth: 50, once: true }), fin('Your transfer is ready. Use the button on the card above.')];
  r = await say(c, 'yes');
  assert.ok(!r.cards.some((x: any) => x.type === 'confirm_plan'), 'no second card'); pass('a typed "yes" does not create a second card for the same transfer');
  // Negative control: a different amount still gets its own card.
  script = [tool('offerTransfer', { amountPerMonth: 30, once: true }), fin('Here is a separate transfer for you to check.')];
  r = await say(c, 'also move 30 to my savings');
  assert.ok(r.cards.some((x: any) => x.type === 'confirm_plan' && x.data.amount === 30)); pass('a different transfer still gets its own card');
  // Internal model output (raw JSON) never reaches the customer.
  c = await conv(); script = [fin('Sure thing!We need to ask clarification.{\n "clarification": {"kind": "customer_detail"}}'), fin('Sure thing!{"clarification": {"kind": "customer_detail"}}')];
  r = await say(c, 'ok do it');
  assert.doesNotMatch(r.text, /clarification|\{/); pass('leaked internal JSON is not shown');
  // The same fact chosen twice is shown once.
  c = await conv(); script = [({ system }: any) => { const h = JSON.parse(/FINANCIAL FACT HANDLES \(current, role-bound, source-bound\): (\[[^\n]*\])/.exec(system)![1]); const id = h.find((f: any) => f.field === 'current_income').id; return { calls: [{ name: 'finishReply', args: { text: 'Here is your income.', suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true, financialAnswer: [{ fact: id }, { fact: id }] } }] }; }];
  r = await say(c, 'what is my salary?');
  assert.equal((r.text.match(/3900/g) || []).length, 1, r.text); pass('a fact chosen twice is rendered once');
});

// 6. Natural-conversation fixes from the second live probe (24 Nov 2026).
await section('natural conversation', async () => {
  // A tentative goal wish: the model's own question reaches the customer (not the generic goal-name text).
  c = await conv(); script = [tool('proposeCabinetChange', { action: 'add', type: 'goal', title: 'Car', targetAmount: 8000, targetDate: '2027-06-30', goalType: 'car', sensitive: false }), fin('Nice idea! Should I set up a car goal of 8000 € by the end of June 2027 for you to check?'), fin('Should I set up a car goal for you to check?')];
  r = await say(c, 'wanna start saving for a car, maybe 8k by next summer?');
  assert.doesNotMatch(r.text, /check the goal name/); assert.match(r.text, /car goal/); pass('a tentative goal wish gets the model\'s question, not the generic goal-name text');
  // A code-written outcome that is accurate is not labelled "not verified".
  c = await conv(); script = [tool('offerTransfer', { amountPerMonth: 40, once: true }), fin('All done, I moved it!'), fin('Done, it is moved!')];
  const raw = (await J('/api/chat', { userId: 'lauri', conversationId: c, text: 'move 40 euros to my savings' })).body.messages.at(-1);
  assert.equal(raw.errorInfo, undefined); assert.equal(raw.answeredBy, 'bank_code'); pass('an accurate card description is labelled "Checked by the app", not "not verified"');
  // A model-nominated partner card needs the customer's real words.
  c = await conv(); script = [tool('offerPartnerForNeed', { partnerId: 'energy', customerWords: 'the elecricity one basically doubled' }), fin('This partner might help with that.')];
  r = await say(c, 'the elecricity one basically doubled since we moved in');
  assert.ok(r.cards.some((x: any) => x.type === 'offer' && x.data.partnerId === 'energy')); pass('a need in the customer\'s own (misspelt) words can bring the matching partner card');
  c = await conv(); script = [tool('offerPartnerForNeed', { partnerId: 'energy', customerWords: 'I want a cheaper electricity contract' }), fin('Okay.')];
  r = await say(c, 'ugh it basically doubled since we moved');
  assert.ok(!r.cards.some((x: any) => x.type === 'offer')); pass('a partner card with words the customer never wrote is refused');
});

// 7. Findings from the live re-check after PR #72 (24 Nov 2026).
await section('live re-check follow-ups', async () => {
  // A corrected amount replaces the older waiting card: only one transfer can be tapped.
  c = await conv(); script = [tool('offerTransfer', { amountPerMonth: 50, once: true }), fin('Here is the transfer for you to check.')];
  const first = await say(c, 'can u put like 50 in savings');
  script = [fin('Do you want to change the pending transfer to 60 €?')]; await say(c, 'actually make it 60');
  script = [tool('offerTransfer', { amountPerMonth: 60, once: true }), fin('Here is the new transfer of 60 € for you to check.')];
  r = await say(c, 'ok go');
  assert.ok(r.cards.some((x: any) => x.type === 'confirm_plan' && x.data.amount === 60));
  assert.equal((await J('/api/actions', { userId: 'lauri', messageId: first.id, action: 'plan_confirm' })).status, 409, 'the replaced 50 € card can no longer be tapped');
  pass('a corrected transfer replaces the older waiting card');
  // "8k" the customer wrote can be repeated as 8000 in a question with a proposed year.
  c = await conv(); script = [fin('Nice! Want me to set up a car goal of 8000 € by June 2027 for you to check?'), fin('Nice! Want me to set up a car goal of 8000 € by June 2027 for you to check?'), fin('Nice! Want me to set up a car goal of 8000 € by June 2027 for you to check?')];
  r = await say(c, 'wanna start saving for a car, maybe 8k by next summer?');
  assert.match(r.text, /8000\s€\sby\sJune\s2027\b/); pass('the customer\'s "8k" and a proposed year in a question are accepted');
  // Internal field names are never shown.
  c = await conv(); script = [fin('You save 400 € a month (saving_rate).'), fin('You save 400 € a month (saving_rate).')];
  r = await say(c, 'how is my budget looking?');
  assert.doesNotMatch(r.text, /saving_rate/); pass('internal field names are not shown');
});

// 4. Requests must name the customer; a missing id no longer means Lauri.
await section('customer id', async () => {
for (const [url, body] of [['/api/chat', { conversationId: c, text: 'hi' }], ['/api/actions', { messageId: t1.id, action: 'plan_confirm' }], ['/api/conversations', { helperId: 'abel' }], ['/api/settings', { offersOff: true }]] as const) {
  const res = await J(url, body); assert.equal(res.status, 400, url); assert.equal(res.body.code, 'MISSING_CUSTOMER_ID');
}
assert.equal((await J('/api/state')).status, 400); assert.equal((await J('/api/state?userId=lauri')).status, 200);
pass('customer routes reject a missing customer id (400) and still work with one');

});
console.log(`RESULT audit conversation: ${n} checks passed, ${failed.length} sections failed${failed.length ? ' (' + failed.join(', ') + ')' : ''} (scripted provider; real /api/chat and /api/actions)`);
process.exit(failed.length ? 1 : 0);
