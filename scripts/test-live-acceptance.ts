import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.CABINET_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'live-acceptance-'));
delete process.env.SUPABASE_URL;
const {reviewedContext}=await import('../src/server/advice/reviewedAnswer.js');
const {reviewedReplyProblem:problem}=await import('../src/server/advice/reviewedReply.js');
const {geminiContents,setProvider}=await import('../src/server/llm.js');
const {relevantForLoan}=await import('../src/server/pipeline/loan.js');
const {refundIntake}=await import('../src/server/refund/intake.js');
const {db}=await import('../src/server/db.js');
const {abelTurn}=await import('../src/server/abel.js');
await db.init();
const context=(q:string)=>reviewedContext(q,31,'2026-11-23');
assert.match(context('Are we too old for ASP?'),/upper age limit.*abolished/);
assert.match(context('Kela student loan compensation?'),/earlier admission with first registration as attending/);
const energy=reviewedContext('Our electricity bill is high',31,'2026-11-23',new Set(['energy']));
assert.match(energy,/3.9 €\/month/);assert.match(energy,/7,9 c\/kWh/);
const gift=context('Is this gift tax free?');
assert.ok(problem('gift tax','Up to 7,500 euros is tax-free.',gift));
assert.ok(problem('gift tax','A single gift of 7 500 € would be tax-free.',gift));
assert.equal(problem('gift tax','Gifts totalling less than 7,500 euros may be exempt. At the threshold, tax applies to the combined taxable value.',gift),null);
assert.ok(problem('ASP','It is open up to age 40.',context('ASP')));
assert.equal(problem('ASP','The upper age limit was abolished. Other conditions still apply.',context('ASP')),null);
assert.ok(problem('energy','The price is 3.9 euros.',energy));
assert.equal(problem('energy','The monthly fee is 3.90 euros plus the listed usage price.',energy),null);
assert.ok(problem('insurance','You can cancel anytime.',energy));
assert.ok(problem('planner','Tap the Connect me button on the card.',energy));
assert.ok(problem('PS exact historical withdrawal conditions','You may withdraw based on the balance now.',context('PS')));
assert.ok(problem('invest','The model completes the eligibility explanation, but then it stops in the middle of a Nordea Advis',''));
assert.ok(problem('talletussuoja','Sinun tilisi ovat täysin suojattuja.',''));
const native:any={role:'model',parts:[{thoughtSignature:'test-signature',functionCall:{name:'read',args:{}}}]};
const call={name:'read',args:{}};
const nativeHistory=geminiContents([{role:'model_calls',calls:[call],raw:native},{role:'tool_results',results:[{call,result:{ok:true}}]}]);
assert.equal(nativeHistory[0],native);assert.ok(nativeHistory[1].parts[0].functionResponse);
const foreign=geminiContents([{role:'model_calls',calls:[call]},{role:'tool_results',results:[{call,result:{ok:true}}]}]);
assert.ok(foreign.every(x=>x.parts.every((p:any)=>!p.functionCall&&!p.functionResponse)));
assert.deepEqual(relevantForLoan([{type:'fact',title:'Pays for cleaning at home',detail:''},{type:'fact',title:'Studies at a university or UAS: Yes',detail:'student loan'},{type:'goal',goalType:'home',title:'Buy a flat',detail:''}] as any).map(e=>e.title),['Buy a flat']);
assert.deepEqual(refundIntake('It was Tuulikki Electronics, about 129 euros.',true),{kind:'consent',statedAmount:129});
// Exact stored published failures, independent of local capture paths.
const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/live-story-replies.json',import.meta.url),'utf8'));
for (const f of fixtures) assert.ok(problem(f.request,f.reply,context(f.request)), `Stored live failure not rejected: ${f.id}`);
let n=0;setProvider({name:'adversarial-live-regression',isConfigured:()=>true,step:async()=>{n++;return{calls:[{name:'finishReply',args:{text:'Up to 7,500 euros is tax-free.',suggestions:[],usedEntryIds:[],topic:'other',couldHelp:true}}]}}});
const rejected=await abelTurn('lauri','live-retry-reject','abel','Is this gift tax free?');
assert.ok(n>=2);assert.ok(rejected.offline);assert.doesNotMatch(rejected.text,/Up to 7,500/);
n=0;setProvider({name:'correction-live-regression',isConfigured:()=>true,step:async()=>({calls:[{name:'finishReply',args:{text:++n===1?'Up to 7,500 euros is tax-free.':'Gifts totalling less than 7,500 euros may be exempt. At the threshold, tax applies to the combined taxable value.',suggestions:[],usedEntryIds:[],topic:'other',couldHelp:true}}]})});
const corrected=await abelTurn('lauri','live-retry-success','abel','Is this gift tax free?');
assert.equal(n,2);assert.ok(!corrected.offline);assert.match(corrected.text,/less than/);
console.log('PASS live-story context, contradictions, retry/fail-closed, provider history, minimal handoff and amount intake regressions');

for (const text of ['Gifts under 7,500 euros are exempt.','A gift below 7,500 € is exempt.','The 7,500 euro threshold itself is not exempt.']) assert.equal(problem('gift tax',text,gift),null,text);
for (const text of ['The offer details do not say whether you can cancel anytime.','This card does not include an adviser link.','Cancellation terms are unknown.']) assert.equal(problem('insurance',text,energy),null,text);
assert.equal(problem('ASP','You can deposit up to 40 €.',context('ASP')),null);
assert.equal(problem('energy','Kuukausimaksu on 3,90 €/kk.',energy),null);
assert.equal(problem('invest','Guaranteed returns do not exist.',''),null);
assert.ok(problem('invest','Nordea Advis',''));
for (const text of ['Tuulikki, 129 euros','Tuulikki, EUR 129','Tuulikki, 129€','Tuulikki, €129','Tuulikki, about 129']) assert.deepEqual(refundIntake(text,true),{kind:'consent',statedAmount:129},text);
assert.deepEqual(refundIntake('Tuulikki in 2024',true),{kind:'consent'});
n=0;setProvider({name:'plain-persistent',isConfigured:()=>true,step:async()=>{n++;return {calls:[],text:'Up to 7,500 euros is tax-free.'}}});
const plain=await abelTurn('lauri','plain-rejected','abel','Is this gift tax free?');assert.equal(n,2);assert.ok(plain.offline);
n=0;setProvider({name:'distinct-problems',isConfigured:()=>true,step:async()=>({calls:[{name:'finishReply',args:{text:++n===1?'I am connecting you now.':n===2?'Up to 7,500 euros is tax-free.':'Gifts under 7,500 euros are exempt.',suggestions:[],usedEntryIds:[],topic:'other',couldHelp:true}}]})});
const distinct=await abelTurn('lauri','distinct-problems','abel','Is this gift tax free?');assert.equal(n,3);assert.ok(!distinct.offline);
console.log('PASS independent-review positive/negative wording, amount variants and bounded separate retries');

const unsafeClauses = [
 ['gift tax','Gifts up to 7,500 euros are exempt and no reporting is needed.',gift],
 ['insurance','You can cancel anytime with no cancellation fee.',energy],
 ['insurance','No problem, you can cancel anytime.',energy],
 ['insurance','The exclusions are unknown but you can cancel anytime.',energy],
 ['invest','This investment has guaranteed returns with no risk.',''],
 ['ASP','No worries, the maximum age is 40.',context('ASP')],
] as const;
for (const [request,reply,checked] of unsafeClauses) assert.ok(problem(request,reply,checked),reply);
for (const [request,reply,checked] of [
 ['gift tax','Gifts up to 7,500 euros are not exempt.',gift],
 ['insurance','You cannot cancel anytime.',energy],
 ['insurance','I cannot confirm that you can cancel anytime.',energy],
 ['insurance','Whether you can cancel anytime is unknown.',energy],
 ['planner','This card does not include an adviser link.',energy],
 ['PS','It is not simply a normal capital gain.',context('PS')],
 ['invest','There are no guaranteed returns.',''],
] as const) assert.equal(problem(request,reply,checked),null,reply);
for (const [i,[request,unsafe]] of unsafeClauses.entries()) {
 let count=0;
 setProvider({name:'independent-clause-runtime',isConfigured:()=>true,step:async()=>({calls:[{name:'finishReply',args:{text:++count===1?unsafe:'I cannot verify that claim from the supplied facts.',suggestions:[],usedEntryIds:[],topic:'other',couldHelp:true}}]})});
 const result=await abelTurn('lauri',`unsafe-clause-${i}`,'abel',request==='insurance'?'We need home insurance before moving':request==='invest'?'I want to start investing':request);
 assert.equal(count,2,`Unsafe first answer accepted: ${unsafe}`);assert.notEqual(result.text,unsafe);
}
console.log('PASS predicate-scoped negation, independent unsafe clauses, direct denials and first-answer runtime rejection');
