import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'purpose-routing-'));
delete process.env.SUPABASE_URL;
const { db } = await import('../src/server/db.js');
const { setProvider } = await import('../src/server/llm.js');
const { abelTurn } = await import('../src/server/abel.js');
const { intentsOf } = await import('../src/server/advice/intent.js');
const { reviewedContext } = await import('../src/server/advice/reviewedAnswer.js');
const { refusesStorage } = await import('../src/server/advice/purpose.js');
await db.init();
let calls = 0, captured = '', answer = 'I will answer your actual question.';
setProvider({ name: 'purpose-regression-probe', isConfigured: () => true, step: async ({system}) => {
  calls++; captured = system;
  return { calls: [{ name: 'finishReply', args: { text: answer, suggestions: ['Help me with this'], usedEntryIds: [], topic: 'other', couldHelp: true } }] };
} });
let n = 0;
async function ask(text: string, user = 'lauri', forbiddenPartner = true) {
  const previous = calls;
  const r = await abelTurn(user, `purpose-${++n}`, 'abel', text);
  assert.ok(calls > previous, `Model/tool path bypassed: ${text}`);
  assert.equal(r.text, answer, `Customer task replaced: ${text}`);
  if (forbiddenPartner) assert.ok(!r.cards.some(c => c.type === 'offer'), `Unrequested advert: ${text}`);
  if (/already have one/.test(text)) assert.ok(!r.cards.some(c=>c.type==='ask_fact' && c.data?.ruleId==='asp-account'), 'No opening eligibility question for existing owner');
  console.log(`PASS task preserved: ${text}`);
  return r;
}
const negatives = [
 'How much did I spend on cleaning last month?',
 'What is my student loan balance?',
 'Any ideas for a birthday gift for my wife under 50 euros?',
 "I'm saving for a home and my mum wants to give me 8,000 euros, is that taxed?",
 'Can you remind me how the ASP account works? I already have one.',
 'Should I invest my savings in index funds or pay down my loan faster?',
 'Can I move money to my savings account?',
 "I'm packing for my holiday next week",
 "I don't need movers, we move ourselves. How much should I budget for the van?",
 'I packed and returned the headphones but no money yet',
 'Show me how my home savings are going',
 'Can you show my progress on the flat goal?',
 "I'm saving 30 000 for a flat by 2028.",
 'I want to put 50 euros aside each month for our first home',
 'I want to put 50 euros aside a month for our first home',
 'I just started at Aalto university!',
];
for (const text of negatives) await ask(text);
await ask('Should I invest some of my pension savings in funds?', 'eeva');
assert.ok(!captured.includes('CHECKED BACKGROUND') || !captured.includes('youth custody exemption'), 'No irrelevant youth background for pensioner');
answer = 'Voin auttaa sähkösopimuksen vertailussa.';
const fi = await ask('Mitä sähkösopimusta suosittelet meille?', 'lauri', false);
assert.equal(fi.text, answer); assert.match(captured, /customer’s language/);
answer = 'We can discuss the options. A person can help too.';
await ask('What is a PS account?', 'eeva'); assert.match(captured, /CALM/);
// Original positive partner paths still reach a card without replacing the reply.
for (const [text,id] of [
 ['Can you show homes that fit our deposit?', 'homes'],
 ['We move next Friday and need a moving company and packing help.', 'movers'],
 ['We need home insurance before moving', 'insure'],
 ['Our electricity bill jumped', 'energy'],
 ['I need a financial planner', 'planner'],
] as const) {
 const r = await ask(text, 'lauri', false);
 assert.ok(r.cards.some(c => c.type === 'offer' && c.data?.partnerId === id), `${id} missing`);
}
assert.equal(refusesStorage('I never remember to save money, can you help me set up a goal of 200 a month?'), false);
for (const t of ["I don't want you to save my salary", 'Do not save this', 'Never remember this', "I don't want my salary stored"]) assert.equal(refusesStorage(t), true, t);
assert.equal(intentsOf('Can I move money to my savings account?').length, 0);
assert.equal(intentsOf('Show me how my home savings are going').length, 0);
assert.match(reviewedContext('ASP and gift tax, please explain both',31,'2026-11-23'), /ASP[\s\S]*Finnish gift tax/);
assert.ok(!reviewedContext('birthday gift ideas',31,'2026-11-23').includes('CHECKED'));
assert.ok(!reviewedContext('Should I invest my pension?',72,'2026-11-23').includes('custody'));
console.log(`RESULT purpose routing: ${n} real turns, no task takeover; positive cards and storage boundaries passed`);

// Real action-tool proposals, not merely checking that the provider was invoked.
let planned: any[] = [];
setProvider({ name: 'tool-regression-probe', isConfigured: () => true, step: async () => ({ calls: planned.length ? planned.splice(0) : [{name:'finishReply',args:{text:'I can help with that.',suggestions:[],usedEntryIds:[],topic:'other',couldHelp:true}}] }) });
const finish = {name:'finishReply',args:{text:'I can help with that.',suggestions:[],usedEntryIds:[],topic:'other',couldHelp:true}};
const goalsBefore = db.getCabinetEntries('lauri').filter(e=>e.type==='goal').length;
planned = [{name:'proposeCabinetChange',args:{action:'add',type:'goal',title:'New home deposit target',detail:'A new deposit plan',targetAmount:30000,targetDate:'2028-12-31',goalType:'home',sensitive:false}},finish];
const goal = await abelTurn('lauri','declarative-tool','abel',"I'm saving 30 000 for a flat by 2028.");
assert.ok(goal.notes.length || goal.cards.some(c=>c.type==='duplicate'), 'Declarative goal can reach save/duplicate flow');
planned = [{name:'offerTransfer',args:{amountPerMonth:50,once:false}},finish];
const monthly = await abelTurn('lauri','monthly-tool','abel','I want to put 50 euros aside each month for our first home');
assert.ok(monthly.cards.some(c=>c.type==='confirm_plan' && c.data?.amount===50 && !c.data?.once), 'Each-month wording reaches confirm plan');
const beforeRefused = db.getCabinetEntries('lauri').length;
planned = [{name:'proposeCabinetChange',args:{action:'add',type:'fact',title:'Private salary request',detail:'Do not retain this',sensitive:false}},finish];
await abelTurn('lauri','no-save-tool','abel',"I don't want you to save my salary");
assert.equal(db.getCabinetEntries('lauri').length,beforeRefused,'Explicit no-save blocks tool mutation');
planned = [{name:'proposeCabinetChange',args:{action:'add',type:'goal',title:'Consistent saving habit',detail:'200 a month',targetAmount:2400,targetDate:'2027-12-31',goalType:'other',sensitive:false}},finish];
const idiom = await abelTurn('lauri','idiom-tool','abel','I never remember to save money, can you help me set up a goal of 200 a month?');
assert.ok(idiom.notes.length || idiom.cards.some(c=>c.type==='duplicate'),'Idiom does not block legitimate goal proposal');
console.log('PASS actual goal, monthly transfer, no-save and idiom tool paths');

assert.equal(reviewedContext('What is gift tax?',31,'2030-01-01'),'','Stale checked facts fail closed');

// Second independent review: refusal, explicit requests and PS context.
answer = 'I can help with the request.';
setProvider({name:'second-review-probe',isConfigured:()=>true,step:async({system})=>{captured=system;calls++;return {calls:[{name:'finishReply',args:{text:answer,suggestions:[],usedEntryIds:[],topic:'other',couldHelp:true}}]}}});
for (const t of ["We won't hire movers, thanks", "We won't need any movers", 'Please skip the movers offer, I just need to know when to tell my landlord', 'We are not interested in movers', 'Movers? No thanks']) await ask(t);
for (const [t,id] of [
 ['I spend a lot on electricity, can you help me get a cheaper contract?','energy'],
 ['I plan to move in a month and need a moving company','movers'],
 ['We want to save for our first home by 2028, should we open an ASP account?','asp-account'],
 ['I returned to university this autumn, can Kela help with my student loan?','kela-loan-writeoff'],
 ['I paid 600 euros to a cleaning company, can I claim the household credit on those payments?','household-credit'],
] as const) {
 const r=await ask(t,'lauri',false);
 assert.ok(r.cards.some(c=>c.data?.partnerId===id||c.data?.ruleId===id),`Explicit request missing ${id}`);
}
await ask('Is my PS balance under 5,000? Can I withdraw it all in 2027?');
assert.match(captured,/historical test[\s\S]*1 January 2027/,'PS balance question gets checked historical rule');
assert.equal(reviewedContext('Should I invest some of my pension savings in funds?',72,'2026-11-23'),'','Generic pension investing is not PS');
for(const t of ["Don't keep a note of this", 'No need to save it', "don't remember that I'm pregnant", 'do not save anything']) assert.ok(refusesStorage(t),t);
// All original factual paths carry applicable checked context, never canned replies.
for(const [t,source] of [
 ['Are we too old at 31 for ASP?','asp-account.html'],
 ['How can I start investing at 26?','equity-savings-account.html'],
 ['Can Kela repay my student loan if I graduate on time?','student-loan-compensation'],
 ['My mother wants to give me 7500 euros, is gift tax due?','when-do-i-need-to-pay-gift-tax'],
 ['Can I claim household tax credit for cleaning?','tax-credit-amount'],
 ['Can I deduct PS contributions in 2026?','tax-change-to-ps-accounts'],
 ['Can I withdraw my PS balance in 2027?','tax-change-to-ps-accounts'],
] as const){await ask(t,'alex');assert.ok(captured.includes(source),`Missing source ${source}`);assert.ok(!/\b2[,\u00a0 ]0\d{2}\b/.test(captured.split('CHECKED BACKGROUND')[1]||''),'No grouped years in checked background');}
console.log('PASS second-review cases, seven factual paths and shared rendered background');

const retained = db.getCabinetEntries('alex').length;
await ask("I paid a cleaning company. Don't keep a note of this",'alex');
assert.equal(db.getCabinetEntries('alex').length, retained, 'Storage refusal also blocks code-inferred fact saves');

await ask('Is my PS balance under 5,000? Can I withdraw it in 2027?');
assert.match(captured, /Ordinary account balances must never be used as a PS balance/);
assert.match(captured, /"psAccount":\s*\{[\s\S]*?"heldAtThisBank":\s*false[\s\S]*?"balance":\s*null/);
console.log('PASS PS product boundary and unknown personal balance in model context');
