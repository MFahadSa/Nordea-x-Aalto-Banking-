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

// Offers off: no card, so no partner prices or incentive in the model's background either.
db.cloneUser('lauri', 'offers-off'); db.updateUser('offers-off', { offersOff: true } as any);
await ask('Our electricity bill is ridiculous, can you help?', 'offers-off');
assert.ok(!/Fictional partner/.test(captured), 'Offers off: no partner background');
await ask('We move next Friday and I need a moving company and packing help.', 'offers-off');
assert.ok(!/Fictional partner/.test(captured), 'Offers off: no movers background');
const shown = await abelTurn('lauri', 'offers-on-check', 'abel', 'Our electricity bill is ridiculous, can you help?');
assert.ok(shown.cards.some(c => c.type === 'offer') && /Fictional partner Lumivalo/.test(captured), 'Offers on: card and its background together');
console.log('PASS partner background only with a shown partner card');

// Adversarial boundaries: object-specific refusals, locale, compounds and no-note mutations.
const { declinesPartner } = await import('../src/server/advice/purpose.js');
for (const t of ["We won't be needing movers", "We won’t be needing movers", 'En tarvitse muuttofirmaa, kiitos', 'En halua muuttopalvelua', 'No movers please', 'Stop showing movers', 'Movers? No thanks']) {
  assert.ok(declinesPartner(t,'movers'), `Refusal missed: ${t}`); await ask(t);
}
for(const [t,id] of [
 ['How can I stop electricity costs rising? Compare cheaper electricity contracts','energy'],
 ['Movers sound great, no thanks to the van though','movers'],
 ["I don't need movers, but compare electricity contracts",'energy'],
] as const){assert.equal(declinesPartner(t,id),false,t);const r=await ask(t,'lauri',false);assert.ok(r.cards.some(c=>c.data?.partnerId===id),t);}
for(const t of ["Don't note this down, but I just started at Aalto university", 'Do not make a note, I just started at Aalto', 'Älä tallenna tätä, I just started at Aalto']){
 assert.ok(refusesStorage(t),t);const before=db.getCabinetEntries('alex').length;const noSaveReply=await ask(t,'alex');assert.ok(!noSaveReply.cards.some(c=>c.type==='ask_fact'),'No saving-answer card after refusal');assert.equal(db.getCabinetEntries('alex').length,before,t);
}
for(const t of ['I never remember to save money','Make a note that I started at Aalto','Please note this down','No need to save money for a van, we have one']){
 assert.equal(refusesStorage(t),false,t);
}
assert.equal(reviewedContext("Thanks! PS: what's my balance?",31,'2026-11-23'),'','Postscript is not PS savings');
assert.ok(reviewedContext('PS: can I withdraw my PS account?',31,'2026-11-23').includes('restricted long-term'),'Explicit PS after postscript retained');

// Both the card facts and the model context must fail closed for multiple PS contracts.
const { buildFacts } = await import('../src/server/advice/facts.js');
const { evaluate } = await import('../src/server/advice/evaluate.js');
const { catalogue } = await import('../src/server/advice/guard.js');
db.cloneUser('lauri','multi-ps');
for(const [key,balance] of [['ps-one',3000],['ps-two',4000]] as const){db.upsertBankAccount('multi-ps',key,{type:'PS account'});db.addBalanceSnapshot({id:key,userId:'multi-ps',accountKey:key,balance,at:'2027-01-01',source:'isolated test'});}
const psFacts=buildFacts({user:db.getUser('multi-ps'),entries:[],transactions:[],bankAccounts:db.getBankAccounts('multi-ps'),balances:db.getBalanceSnapshots('multi-ps'),purpose:'abel',today:'2027-01-02'});
assert.equal(psFacts.hasPsAccount.value,true);assert.equal(psFacts.psBalance.state,'unknown');assert.equal(psFacts.psBalanceAt2027Start.state,'unknown');
assert.notEqual(evaluate(catalogue().filter(r=>r.id==='ps-account'&&r.version==='2027-01-01'),psFacts,'2027-01-02').status,'eligible');
await ask('Is my PS balance below 5000?', 'multi-ps');
assert.match(captured,/Multiple PS contracts: personal eligibility unknown/);assert.match(captured,/"accountCount":\s*2/);
assert.match(captured,/"balanceOn1January2027":\s*null/);
console.log('PASS compound/refusal/locale/storage/multiple-PS adversarial boundaries');

for(const t of ["We won't be hiring movers", 'We do not need a moving company', "I don't want any movers"]){assert.ok(declinesPartner(t,'movers'),t);await ask(t);}
// Current/history boundaries stay consistent for exactly one contract.
const one=db.getBankAccounts('multi-ps').filter(a=>a.key==='ps-one');
const oneInput={user:db.getUser('multi-ps'),entries:[],transactions:[],bankAccounts:one,balances:db.getBalanceSnapshots('multi-ps'),purpose:'abel' as const,today:'2026-12-31'};
assert.equal(buildFacts(oneInput).psBalance.state,'unknown','Future snapshots are not current');
assert.equal(buildFacts(oneInput).psBalanceAt2027Start.state,'unknown','Future statutory snapshot not known early');
const dated=buildFacts({...oneInput,today:'2027-01-02'});assert.equal(dated.psBalance.value,3000);assert.equal(dated.psBalanceAt2027Start.value,3000);
assert.equal(buildFacts({...oneInput,today:'2027-01-02',balances:[{id:'later',userId:'multi-ps',accountKey:'ps-one',balance:100,at:'2027-01-02',source:'test'}]}).psBalanceAt2027Start.state,'unknown','Later low balance does not establish the date');
// Duplicate/hidden card must not supply new marketing context.
const firstOffer = await abelTurn('lauri','repeat-card-check','abel','We need a moving company');
db.addMessage({id:'repeat-card-message',agentId:'abel',channel:'app',userId:'lauri',conversationId:'repeat-card-check',sender:'agent',helperId:'abel',text:firstOffer.text,cards:firstOffer.cards,createdAt:new Date().toISOString()});
const repeated=await abelTurn('lauri','repeat-card-check','abel','We need a moving company');
assert.ok(!repeated.cards.some(c=>c.type==='offer'));assert.ok(!/Fictional partner/.test(captured),'Duplicate card gets no fresh partner context');
console.log('PASS single/multiple dated PS and duplicate-card context boundaries');

const adviceBefore=JSON.stringify(db.getUser('alex')?.advice);
await ask("I paid a cleaning company. Don't note this down",'alex');
assert.equal(JSON.stringify(db.getUser('alex')?.advice),adviceBefore,'No inferred rule display/reason snapshots after storage refusal');
await ask('Our electricity bill is too high','offers-off');assert.match(captured,/PARTNER OFFERS ARE OFF/);

for(const t of ['No need to save', "Don't write this down", "Don't keep a note", "Forget this, don't keep it"]){assert.ok(refusesStorage(t),t);const before=db.getCabinetEntries('alex').length;await ask(t+', I just started at Aalto','alex');assert.equal(db.getCabinetEntries('alex').length,before,t);}
for(const t of ["We're not going to need movers", "We aren't hiring movers", 'no thanks to movers', 'Not needing movers, but need insurance']){assert.ok(declinesPartner(t,'movers'),t);assert.ok(!intentsOf(t).some(i=>i.partner==='movers'),t);}
for(const t of ["we won't hire movers but need packing help", "I don't need movers' prices but need a moving company"]){assert.equal(declinesPartner(t,'movers'),false,t);assert.ok(intentsOf(t).some(i=>i.partner==='movers'),t);}
console.log('PASS independent reviewer consent and clause-boundary probes');

// Refusal of another service must not erase a clearly requested one.
for(const [t,id] of [
 ["We aren't hiring movers, but need home insurance",'insure'],
 ['No thanks to movers; compare cheaper electricity contracts','energy'],
 ["We won't need movers. Need packing help instead",'movers'],
 ['Movers? No thanks. Compare electricity contracts instead','energy'],
] as const){assert.ok(intentsOf(t).some(i=>i.partner===id),t);}
// Refusing storage has priority even when a misbehaving model proposes saving.
planned=[{name:'proposeCabinetChange',args:{action:'add',type:'fact',title:'University',detail:'Aalto',sensitive:false}},finish];
setProvider({name:'refusal-action-review',isConfigured:()=>true,step:async()=>({calls:planned.length?planned.splice(0):[finish]})});
const refusedCount=db.getCabinetEntries('alex').length;
await abelTurn('alex','refuse-action-review','abel',"Don't write this down, I started at Aalto");
assert.equal(db.getCabinetEntries('alex').length,refusedCount);
console.log('PASS final compound-service and misbehaving-provider no-save checks');

for(const t of ["Don't save", "Don't remember I said that", "I'd rather you didn't save this", "Please don't note it", "Don't log this", "Keep this private, don't save", "I don't want this noted", "Don't add this to my notes", "Don't note my salary", "Off the record, I started at Aalto"]){assert.ok(refusesStorage(t),t);}
for(const t of ["I don't want to hire movers, I'll do it myself", "We don't plan to use movers", 'We will manage without movers', 'Hire movers? No.', "Do we need movers? I'd rather not"]){assert.ok(declinesPartner(t,'movers'),t);}
for(const t of ["We need a moving company, don't need packing help", "We won't hire movers but need packing help"]){assert.equal(declinesPartner(t,'movers'),false,t);}
console.log('PASS structural privacy and service-item choice probes');

for(const t of ["I don't save much, should I open an ASP account?", "I didn't save anything last month, help me plan", "I don't remember my PIN, how do I reset it?", "I never keep more than 500 in checking", "I don't want to keep paying rent, should we open an ASP account?", "We don't record our spending, is there an easy way?", "Don't forget to note that I'm saving for a car", "I don't log in often, how do I add notes?"]){assert.equal(refusesStorage(t),false,t);}
for(const t of ['Nora, forget I said that','This stays between us','Pls dont save'])assert.ok(refusesStorage(t),t);
for(const t of ["I don't know any good movers, can you find some?", "We can't do it without movers", "We won't manage without a moving company", "I don't have time to find movers, please help"]){assert.equal(declinesPartner(t,'movers'),false,t);}
console.log('PASS directed privacy versus ordinary banking and service need');

// Ordinary financial self-description must not prevent the requested ASP card.
setProvider({name:'directed-boundary-review',isConfigured:()=>true,step:async({system})=>{captured=system;calls++;return {calls:[finish]}}});
const normalAsp=await abelTurn('lauri','normal-asp-directed','abel',"I don't save much, should I open an ASP account?");
assert.ok(normalAsp.cards.some(c=>c.data?.ruleId==='asp-account'));
planned=[{name:'proposeCabinetChange',args:{action:'add',type:'goal',title:'A new car goal',detail:'Saving for a car',targetAmount:5000,targetDate:'2028-12-31',goalType:'car',sensitive:false}},finish];
setProvider({name:'positive-note-review',isConfigured:()=>true,step:async()=>({calls:planned.length?planned.splice(0):[finish]})});
const positiveNote=await abelTurn('alex','positive-note-review','abel',"Don't forget to note that I'm saving 5000 for a car by 2028");
assert.ok(positiveNote.notes.length||positiveNote.cards.some(c=>c.type==='duplicate'));
console.log('PASS normal ASP and affirmative note runtime paths');

for(const t of ["Don't save my balance", "Don't save my income, I started at Aalto", "Please don't remember my address", "Don't note my age", "Please don't store my IBAN", "Don't save any of this", "Don't save these details", "I'd rather you not save that", 'Nothing from this chat should be saved', "Don't keep any record of this"]){assert.ok(refusesStorage(t),t);}
for(const t of ["Don't make this complicated, should we open an ASP account?", "Please don't keep it long, how does the ASP work?", "Don't make it a big deal, but should we open an ASP account", 'Never save it all in one account, right?', "Don't add this to the total, what is my balance?", "Don't record that as spending, it was a refund", "Don't keep this simple, give me details on PS"]){assert.equal(refusesStorage(t),false,t);}
console.log('PASS recording verb classes and arbitrary data objects');

setProvider({name:'object-boundary-runtime',isConfigured:()=>true,step:async({system})=>{captured=system;calls++;return {calls:[finish]}}});
for(const t of ["Don't save my income, I started at Aalto", "Don't save any of this, I started at Aalto", 'Nothing from this chat should be saved, I started at Aalto']){
 const before=JSON.stringify([db.getCabinetEntries('alex'),db.getUser('alex')?.advice]);await abelTurn('alex',`object-runtime-${++n}`,'abel',t);assert.equal(JSON.stringify([db.getCabinetEntries('alex'),db.getUser('alex')?.advice]),before,t);
}
for(const t of ["Don't make this complicated, should we open an ASP account?", "Please don't keep it long, should we open an ASP account?"]){const r=await abelTurn('lauri',`style-runtime-${++n}`,'abel',t);assert.ok(r.cards.some(c=>c.data?.ruleId==='asp-account'),t);}
console.log('PASS arbitrary-data no-save mutation and style-not-privacy runtime checks');

// Round 5: all supplied runtime bypasses and adversarial mixed-scope proposals.
const { scopedGoalOnRefusal } = await import('../src/server/advice/purpose.js');
const refusedTurns=["Don't put this in my notes: I started a new job at Wolt", "Can you not save this? I started a new job at Wolt", "Don't keep my data. I started a new job at Wolt", "No saving please, I started a new job at Wolt", "Please don't hold on to this", "I'd prefer you not save this", "I'd like you to not save this", 'Do not keep track of this', 'Leave this out of your notes'];
for(const t of refusedTurns){assert.ok(refusesStorage(t),t);planned=[{name:'proposeCabinetChange',args:{action:'add',type:'fact',title:'New job at Wolt',detail:'I work at Wolt',sensitive:false}},finish];setProvider({name:'privacy-adversary',isConfigured:()=>true,step:async()=>({calls:planned.length?planned.splice(0):[finish]})});const before=JSON.stringify([db.getCabinetEntries('alex'),db.getUser('alex')?.advice]);await abelTurn('alex',`r5-${++n}`,'abel',t);assert.equal(JSON.stringify([db.getCabinetEntries('alex'),db.getUser('alex')?.advice]),before,t);}
const mixed="Don't remember my old address; please save a goal of 5,000 for an emergency fund by June";
assert.ok(scopedGoalOnRefusal(mixed,'2026-11-23'));
planned=[{name:'proposeCabinetChange',args:{action:'add',type:'fact',title:'Old address',detail:'Forbidden address',sensitive:false}},{name:'proposeCabinetChange',args:{action:'add',type:'goal',title:'Emergency plus old address',detail:'Forbidden address',targetAmount:5000,targetDate:'2030-01-01',goalType:'other',sensitive:false}},finish];
setProvider({name:'mixed-adversary',isConfigured:()=>true,step:async()=>({calls:planned.length?planned.splice(0):[finish]})});
const idsBefore=new Set(db.getCabinetEntries('alex').map(e=>e.id));await abelTurn('alex','r5-mixed','abel',mixed);const additions=db.getCabinetEntries('alex').filter(e=>!idsBefore.has(e.id));
assert.equal(additions.length,1);assert.equal(additions[0].title,'Emergency fund');assert.ok(!JSON.stringify(additions).includes('Forbidden'));assert.equal(additions[0].target?.date,'2027-06-30');
for(const t of ["Don't save anything. Please save a goal of 5000 for an emergency fund by June", "Don't save my emergency fund; please save a goal of 5000 for an emergency fund by June", "Don't save my address; please save a goal of 5000 by June"]){assert.equal(scopedGoalOnRefusal(t,'2026-11-23'),null,t);}
for(const [t,id,want] of [["Don't show me listings, just my goal",'homes',true],['Movers? Not this time','movers',true],['No movers yet, but we do need some for Friday','movers',false],["I don't need cover for my bike, but I do want home insurance",'insure',false]] as const)assert.equal(declinesPartner(t,id),want,t);
console.log('PASS round5 refusal runtime, scoped sanitized goal and partner edges');

for(const t of ["Don't keep my data; please save a goal of 5000 for an emergency fund by June", "Don't save my address; save a goal of 5,00 for an emergency fund by June", "Don't save my address; save a goal of 5000 for an emergency fund by June 2025"]){assert.equal(scopedGoalOnRefusal(t,'2026-11-23'),null,t);}

for(const t of ["Don't save my address; maybe save a goal of 5000 for an emergency fund by June", "Don't save my address; save a private goal of 5000 for an emergency fund by June", "Don't save my address; save a goal of 5000 for an emergency fund by June if I decide later"]){assert.equal(scopedGoalOnRefusal(t,'2026-11-23'),null,t);}

for(const t of ["I don't keep track of my spending, should I open an ASP account?", "We don't keep track of every euro", 'No saving this month, we spent it all on the move', 'Is there no saving plan in this app?', 'Leave nothing out of the notes, I want the full summary', "Don't hold on to your old receipts", "Please don't log me out"]){assert.equal(refusesStorage(t),false,t);}
for(const t of ['No saving please, I started at Aalto','Do not keep track of this',"Please don't hold on to this"]){assert.ok(refusesStorage(t),t);}
assert.equal(scopedGoalOnRefusal("Don't save my address; save a goal of 5000 for an emergency fund by 30 June 2027",'2026-11-23'),null,'Unsupported deadline must hold, not drop date');
console.log('PASS financial tracking/recording distinction and unsupported deadline hold');
