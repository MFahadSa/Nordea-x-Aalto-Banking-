// Place in scripts/ of the repo (needs the patch under review applied). Run: npx tsx scripts/continuity-probe.ts
// Real server.ts, real /api/cabinet and /api/chat routes, scripted capturing provider, temp data dir.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.CABINET_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'probe-'));process.env.PORT='3779';process.env.NODE_ENV='production';delete process.env.SUPABASE_URL;delete process.env.GEMINI_API_KEY;delete process.env.LLM_API_KEY;
const {setProvider}=await import('../src/server/llm.js');
const prompts:string[]=[];const turnsLog:any[]=[];const G:any=globalThis;G.reply='x';G.useIds=[];
setProvider({name:'probe',isConfigured:()=>true,step:async({system,turns,tools}:any)=>{prompts.push(system+'\n'+JSON.stringify(turns));turnsLog.push(turns);
 const finish=tools.find((t:any)=>t.name.startsWith('finish'));
 const reads=tools.filter((t:any)=>['listMyEntries','listMyGoals','listMyFacts','listMyCategories','sampleMyDescriptionWords'].includes(t.name));
 if(reads.length&&!turns.some((t:any)=>t.role==='tool_results'))return {answeredBy:'probe',calls:reads.map((r:any,i:number)=>({id:'r'+i,name:r.name,args:{}}))};
 if(finish&&finish.name!=='finishReply'){const a=finish.name==='finishRetrievalPlan'?{goalTitles:[]}:finish.name==='finishMatchTerms'?{terms:{}}:{levels:[]};return {answeredBy:'probe',calls:[{name:finish.name,args:a}]};}
 return {answeredBy:'probe',calls:[{name:'finishReply',args:{text:G.reply,suggestions:[],usedEntryIds:G.useIds,topic:'other',couldHelp:true}}]};}} as any);
await import('../server.ts');await new Promise(r=>setTimeout(r,1500));
const base='http://127.0.0.1:3779';
const J=async(m:string,u:string,b?:any)=>{const r=await fetch(base+u,{method:m,headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined});const t=await r.text();try{return JSON.parse(t)}catch{return {raw:t}}};
const out:string[]=[];
for(const variant of ['paraphrase','exact']) for(const action of ['edit','delete','abel-off']){
 const conv=(await J('POST','/api/conversations',{userId:'lauri',helperId:'abel'})).conversation.id;
 const T='Flat budget Zeta'+variant+action;const D='Deposit target is 41230 euros '+variant+action;
 const e=(await J('POST','/api/cabinet',{userId:'lauri',type:'fact',title:T,detail:D,readableBy:{abel:true,offers:false}})).entry;
 G.useIds=[];G.reply=variant==='paraphrase'?'You are putting money aside for a flat, around forty thousand.':'You have "'+T+'" noted, '+D+'.';
 const ask=async(t:string)=>{const s=prompts.length;const response=await J('POST','/api/chat',{userId:'lauri',conversationId:conv,text:t});return {reply:response.messages.at(-1),p:prompts.slice(s).join('\n'),t:turnsLog.at(-1)};};
 await ask('What did I tell you about the flat?');                       // turn 1: customer asks, Nora (scripted) replies with the quote/paraphrase above
 G.reply='Sure. Which month do you want to start, January or March?';await ask('Can you help me plan it?'); // turn 2: Nora asks a plain question, free-text, no card
 if(action==='edit')await J('PATCH','/api/cabinet/'+e.id,{title:'NEWTITLE'+variant,detail:'newdetail 5'});
 if(action==='delete')await J('DELETE','/api/cabinet/'+e.id);
 if(action==='abel-off')await J('PATCH','/api/cabinet/'+e.id,{readableBy:{abel:false,offers:false}});
 G.reply='ok';
 const r=await ask('January please');                                     // turn 3: customer answers the plain question
 assert.match(r.reply.text,/context behind my earlier question has changed/);assert.ok(!r.reply.cards?.length);const t=JSON.stringify(r.t);
 assert.ok(!r.p.includes(T)&&!r.p.includes(D)&&!r.p.includes('forty thousand'));
 out.push(variant.padEnd(11)+action.padEnd(9)+' leak='+(r.p.includes(T)||r.p.includes(D)||r.p.includes('forty thousand'))+' previousProviderSnapshotHasQuestion='+t.includes('January or March')+' keepsUserWords='+t.includes('Can you help me plan it'));
}
// Unrelated edit: an entry that has nothing to do with the question
const conv=(await J('POST','/api/conversations',{userId:'lauri',helperId:'abel'})).conversation.id;
const a=(await J('POST','/api/cabinet',{userId:'lauri',type:'fact',title:'Unrelated A',detail:'likes tea',readableBy:{abel:true,offers:false}})).entry;
G.reply='Sure. January or March?';
const ask2=async(t:string)=>{const response=await J('POST','/api/chat',{userId:'lauri',conversationId:conv,text:t});if(t==='January')assert.match(response.messages.at(-1).text,/context behind my earlier question has changed/);return JSON.stringify(turnsLog.at(-1));};
await ask2('Help me plan');await J('PATCH','/api/cabinet/'+a.id,{detail:'likes coffee'});G.reply='ok';const t2=await ask2('January');
out.push('unrelated-edit previousProviderSnapshotHasQuestion='+t2.includes('January or March'));
console.log(out.join('\n'));process.exit(0);
