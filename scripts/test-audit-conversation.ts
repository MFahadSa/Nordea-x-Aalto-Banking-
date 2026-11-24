/** Whole-product audit, 24 Nov 2026: conversation-state regressions through the real /api/chat route with a
 *  scripted provider. Scripted model output: proves the app's contracts, not live model quality. */
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-conv-')); process.env.PORT = '3821'; process.env.NODE_ENV = 'production';
for (const k of ['SUPABASE_URL', 'GEMINI_API_KEY', 'LLM_API_KEY', 'GROQ_API_KEY', 'USER_DB_URL', 'AGENT_DB_URL', 'SHARED_DB_URL']) delete process.env[k];
const { db } = await import('../src/server/db.js'); const finance = await import('../src/server/finance.js'); const { setProvider } = await import('../src/server/llm.js');
let script: any[] = []; let calls = 0;
setProvider({ name: 'audit-scripted', isConfigured: () => true, step: async () => { calls++; return script.shift() ?? fin('[script empty]'); } } as any);
await import('../server.ts'); await new Promise((r) => setTimeout(r, 500));
const base = 'http://127.0.0.1:3821';
const J = async (url: string, b?: any) => { const r = await fetch(base + url, { method: b ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json() as any }; };
function fin(text: string, extra: any = {}) { return { calls: [{ name: 'finishReply', args: { text, suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true, ...extra } }] }; }
const tool = (name: string, args: any) => ({ calls: [{ name, args }] });
const conv = async () => (await J('/api/conversations', { userId: 'lauri', helperId: 'abel' })).body.conversation.id;
const say = async (c: string, text: string) => (await J('/api/chat', { userId: 'lauri', conversationId: c, text })).body.messages.at(-1);
let n = 0; const failed: string[] = []; const pass = (m: string) => { n++; console.log('PASS ', m); };
let c = ''; let r: any; let t1: any;
const section = async (name: string, fn: () => Promise<void>) => { script = []; try { await fn(); } catch (e: any) { failed.push(name); console.log('FAIL ', name, '—', String(e.message).split('\n')[0].slice(0, 160)); } };

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
