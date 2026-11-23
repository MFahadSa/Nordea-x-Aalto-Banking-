import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.CABINET_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'natural-foundation-'));delete process.env.SUPABASE_URL;
const {conversationContracts}=await import('../src/server/advice/conversation.js');const {transferIsOnce,transferTarget}=await import('../src/server/transfers.js');const {db}=await import('../src/server/db.js');const {setProvider}=await import('../src/server/llm.js');const {abelTurn}=await import('../src/server/abel.js');await db.init();
const partner:any={id:'p',userId:'lauri',conversationId:'c',sender:'agent',text:'Some options.',cards:[{type:'offer',data:{partnerId:'energy'}}]};
let x=conversationContracts([partner],'What does that cost?',31,'2026-10-23',false);assert.match(x.facts,/Lumivalo/);assert.match(x.facts,/7,9 c\/kWh/);assert.match(x.facts,/0,39 c\/kWh/);assert.match(x.text,/NO|No|not/);
assert.equal(conversationContracts([partner],'What does that cost?',31,'2026-10-23',true).facts,'');
assert.equal(conversationContracts([{...partner,resolved:'No thanks'}],'What does that cost?',31,'2026-10-23',false).facts,'');
assert.equal(conversationContracts([partner],'I do not want electricity offers',31,'2026-10-23',false).facts,'');
const handoff:any={...partner,cards:[{type:'handoff',data:{gets:[{title:'Allowed home goal'},{title:'Revoked job fact'}],heldBack:0}}]};
x=conversationContracts([handoff],'What will they see?',31,'2026-10-23',false,new Set(['Allowed home goal']));assert.match(x.text,/Allowed home goal/);assert.doesNotMatch(x.text,/Revoked job fact/);
for(const t of ['25 every month, not today.','I want 25 each month. Would that move money now, or wait until payday?','No, not a one-off. I meant 25 monthly.'])assert.equal(transferIsOnce(t,''),false,t);
assert.equal(transferTarget('Not the car fund, put it in savings.',''),'savings');assert.equal(transferTarget('Move 25 to the car fund.',''),'carFund');
let providerCalls=0;setProvider({name:'incomplete-fixture',isConfigured:()=>true,step:async()=>{providerCalls++;return {calls:[{name:'finishReply',args:{text:'This is a partially emitted answer',suggestions:[],usedEntryIds:[],topic:'other',couldHelp:true}}],incomplete:true,finishReason:'length'}}});
let r=await abelTurn('lauri','incomplete-check','abel','Can you explain my balance?');assert.equal(providerCalls,2);assert.ok(r.offline);assert.doesNotMatch(r.text,/partially emitted/);assert.match(r.errorDetail||'',/incomplete response/);
setProvider({name:'provenance-fixture',isConfigured:()=>true,step:async()=>({answeredBy:'provider-for-this-turn',calls:[{name:'finishReply',args:{text:'We can take this one step at a time.',suggestions:[],usedEntryIds:[],topic:'other',couldHelp:true}}]})});r=await abelTurn('lauri','provenance-check','abel','Hi there');assert.equal(r.provider,'provider-for-this-turn');
let captured='';const secret='UNREADABLE_STORED_FACT';db.addMessage({...partner,id:'revoked-msg',conversationId:'revoked-check',text:secret,cards:[{type:'offer',data:{partnerId:'energy'}}],usedEntryIds:['missing-or-revoked-entry'],createdAt:new Date().toISOString()} as any);db.addMessage({...partner,id:'new-u',conversationId:'revoked-check',sender:'user',text:'What does that cost?',cards:[],createdAt:new Date().toISOString()} as any);
setProvider({name:'privacy-context-fixture',isConfigured:()=>true,step:async({system,turns})=>{captured=system+JSON.stringify(turns);return {calls:[{name:'finishReply',args:{text:'What would you like to look at?',suggestions:[],usedEntryIds:[],topic:'other',couldHelp:true}}]}}});await abelTurn('lauri','revoked-check','abel','What does that cost?');assert.doesNotMatch(captured,new RegExp(secret));assert.doesNotMatch(captured,/Lumivalo/);
console.log('PASS natural foundation: same-chat exact partner context, current opt-out/decline/permission filtering, transfer corrections, incomplete-provider rejection, per-turn provenance. Deterministic only, not real-AI conversation acceptance.');
// A later withdrawal must remove the source customer's earlier words as well as Nora's derived reply.
const at=new Date().toISOString();
db.addMessage({id:'source-private-u',userId:'lauri',conversationId:'source-withdrawal',sender:'user',text:'My PRIVATE_SOURCE_SENTINEL budget is 18643 euros.',usedEntryIds:['withdrawn-context-id'],createdAt:at} as any);
db.addMessage({id:'source-private-a',userId:'lauri',conversationId:'source-withdrawal',sender:'agent',text:'I have noted that.',notes:[{text:'Saved',entryId:'withdrawn-context-id'}],createdAt:at} as any);
db.addMessage({id:'source-private-now',userId:'lauri',conversationId:'source-withdrawal',sender:'user',text:'Can we continue?',createdAt:at} as any);
await abelTurn('lauri','source-withdrawal','abel','Can we continue?');assert.doesNotMatch(captured,/PRIVATE_SOURCE_SENTINEL|18643/);
// Continuity beyond the old six exchanges, within the same bounded complete-message budget.
for(let i=0;i<22;i++)db.addMessage({id:'long-'+i,userId:'lauri',conversationId:'long-continuity',sender:i%2?'agent':'user',text:i===0?'I need a quiet home office, CONTINUITY_ANCHOR.':i===18?'Correction: not the city centre, CONTINUITY_CORRECTION.':'Continuing a short ordinary exchange '+i,createdAt:at} as any);
db.addMessage({id:'long-now',userId:'lauri',conversationId:'long-continuity',sender:'user',text:'What about that?',createdAt:at} as any);
await abelTurn('lauri','long-continuity','abel','What about that?');assert.match(captured,/CONTINUITY_ANCHOR/);assert.match(captured,/CONTINUITY_CORRECTION/);
console.log('PASS longer whole-message continuity and withdrawn-source exchange non-resurrection.');

const currentSource=db.getCabinetEntries('lauri').find(e=>e.type==='goal'&&e.status==='active')!;
db.updateCabinetEntry(currentSource.id,{title:'CURRENT_CORRECTION_SENTINEL',detail:'Current corrected version',updatedAt:'2026-11-23T20:00:00.000Z'});
for(const sender of ['user','agent'] as const)db.addMessage({id:'correction-old-'+sender,userId:'lauri',conversationId:'corrected-history',sender,text:'OLD_CORRECTION_SENTINEL',usedEntryIds:[currentSource.id],createdAt:'2026-11-22T19:00:00.000Z'} as any);
db.addMessage({id:'correction-now',userId:'lauri',conversationId:'corrected-history',sender:'user',text:'Continue from the corrected version',createdAt:'2026-11-23T21:00:00.000Z'} as any);
await abelTurn('lauri','corrected-history','abel','Continue from the corrected version');assert.ok(!captured.includes('OLD_CORRECTION_SENTINEL'));assert.ok(captured.includes('CURRENT_CORRECTION_SENTINEL'));
console.log('PASS source-referenced historical wording predating a source revision cannot compete with the current cabinet version.');
