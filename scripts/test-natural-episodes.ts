import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.CABINET_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'natural-episodes-'));delete process.env.SUPABASE_URL;
const {db}=await import('../src/server/db.js');const {setProvider}=await import('../src/server/llm.js');const {abelTurn}=await import('../src/server/abel.js');await db.init();
const finish=(text:string)=>({name:'finishReply',args:{text,suggestions:[],usedEntryIds:[],topic:'other',couldHelp:true}});
let seq=0;
function add(conv:string,sender:'user'|'agent',text:string,more:any={}) {const m={id:'ep-'+(++seq),userId:'lauri',conversationId:conv,agentId:'abel',channel:'app',helperId:'abel',sender,text,createdAt:new Date().toISOString(),...more};db.addMessage(m as any);return m;}
async function say(conv:string,text:string){add(conv,'user',text);const r=await abelTurn('lauri',conv,'abel',text);add(conv,'agent',r.text,{cards:r.cards,notes:r.notes,usedEntryIds:r.usedEntryIds});return r;}
let calls=0;let step=0;
setProvider({name:'deterministic-topic-episode',isConfigured:()=>true,step:async()=>{calls++;return {calls:step++===0?[{name:'selectConversationTopic',args:{topic:'asp-account',evidence:'a place of our own'}}]:[finish('There is one detail to check before I can explain what fits.')]}}});
let r=await say('whole-home','We want a place of our own. No clue what to do first.');assert.equal(r.cards[0]?.type,'ask_fact');assert.equal(calls,2);assert.equal(db.getCabinetEntries('lauri').filter(e=>e.factKey==='everOwnedHalfOfHome').length,0);
let pending=db.getMessages('lauri').filter(m=>m.conversationId==='whole-home'&&m.cards?.some(c=>c.type==='ask_fact')).at(-1)!;
step=0;setProvider({name:'deterministic-prose-episode',isConfigured:()=>true,step:async()=>({calls:step++===0?[{name:'answerQuestion',args:{messageId:pending.id,fact:'everOwnedHalfOfHome',value:'no',evidence:'I have rented all my life'}}]:[finish('I understood that you have not owned half of a home. Please check that interpretation before it is saved.')]})});
r=await say('whole-home','I have rented all my life. My partner owned a tiny share years ago.');assert.equal(r.cards[0]?.type,'ask_fact');assert.match(r.cards[0]?.data?.note,/Nothing saved yet/);assert.equal(db.getCabinetEntries('lauri').filter(e=>e.factKey==='everOwnedHalfOfHome').length,0);
pending=db.getMessages('lauri').filter(m=>m.conversationId==='whole-home'&&m.cards?.some(c=>c.type==='ask_fact')).at(-1)!;
step=0;setProvider({name:'deterministic-answer-episode',isConfigured:()=>true,step:async()=>({calls:step++===0?[{name:'answerQuestion',args:{messageId:pending.id,fact:'everOwnedHalfOfHome',value:'no'}},finish('Saved; you qualify.')]:[finish('Thanks. Your answer is saved; the next question is about your own plans.')]})});
r=await say('whole-home','No');assert.notEqual(r.text,'Saved; you qualify.');assert.ok(db.getCabinetEntries('lauri').some(e=>e.factKey==='everOwnedHalfOfHome'&&e.factValue===false));assert.ok(r.cards[0]?.type==='opportunity' || r.cards[0]?.data?.fact==='savingForHome');assert.notEqual(r.cards[0]?.data?.fact,'everOwnedHalfOfHome');
// A provider confidently prepares an incorrect transfer after a cautious timing question.
step=0;setProvider({name:'deterministic-financial-episode',isConfigured:()=>true,step:async()=>({calls:step++===0?[{name:'offerTransfer',args:{amountPerMonth:25,once:true}},finish('Please confirm the transfer now.')]:[finish('Nothing has been prepared. A monthly transfer here starts next month, so let us check the timing first.')]})});
r=await say('whole-transfer','I would feel safer with 25 each month. Would it move today?');assert.ok(!r.cards.some(c=>c.type==='confirm_plan'));assert.doesNotMatch(r.text,/Please confirm/);
step=0;setProvider({name:'deterministic-amount-episode',isConfigured:()=>true,step:async()=>({calls:step++===0?[{name:'offerTransfer',args:{amountPerMonth:2500,once:true}}]:[finish('I have not prepared a transfer.')]})});
r=await say('wrong-amount','Move 25 to savings');assert.ok(!r.cards.some(c=>c.type==='confirm_plan'));
console.log('PASS deterministic multi-turn tool episodes: discovery without invented eligibility, prose interpretation review, literal answer and next question, stale same-step words rejected, timing ambiguity, wrong amount. Scripted fixtures, not real model understanding.');
// Explicit field roles, not merely number membership.
const {personalRoleProblem}=await import('../src/server/advice/personalRoles.js');
const factRoles={goals:[{title:'Buy a flat',saved:14600,monthlyGoingIn:425}]};
assert.ok(personalRoleProblem('Your flat goal has 4 250 € saved so far, 4 250 € monthly contribution.',factRoles,[]));
assert.equal(personalRoleProblem('Your flat goal has 14 600 € saved so far, with 425 € each month.',factRoles,[]),null);
const handoff:any=[{type:'handoff',data:{gets:[{title:'Buy a flat'}]}}];
assert.ok(personalRoleProblem('The adviser will see your salary and spending.',factRoles,handoff));
assert.equal(personalRoleProblem('Your salary and spending are not shared.',factRoles,handoff),null);
console.log('PASS personal-field role and narrow handoff-scope assertions; not a general semantic validator.');
// A bad topic interpretation cannot bypass existing choice/privacy controls.
for (const [conv,text,args] of [
 ['topic-wrong-span','My bills feel too high',{topic:'energy',evidence:'not in this message'}],
 ['topic-declined',"I don't want any movers, thanks",{topic:'movers',evidence:'movers'}],
 ['topic-banking','How much did I spend on electricity?',{topic:'energy',evidence:'electricity'}],
 ['topic-no-save','We want a home. Do not save anything.',{topic:'asp-account',evidence:'want a home'}],
] as const){step=0;setProvider({name:'negative-topic',isConfigured:()=>true,step:async()=>({calls:step++===0?[{name:'selectConversationTopic',args}]:[finish('No offer has been prepared.')]})});r=await say(conv,text);assert.equal(r.cards.length,0,conv);}
const entries=db.getCabinetEntries('lauri').length;
step=0;setProvider({name:'negative-question-save',isConfigured:()=>true,step:async()=>({calls:step++===0?[{name:'answerQuestion',args:{messageId:pending.id,fact:'everOwnedHalfOfHome',value:'no',evidence:'not saved'}}]:[finish('I have not saved that.')]})});r=await say('whole-home',"No, don't save that");assert.equal(db.getCabinetEntries('lauri').length,entries);
console.log('PASS negative topic evidence, declined service, banking purpose, no-save and no hidden answer mutation.');
