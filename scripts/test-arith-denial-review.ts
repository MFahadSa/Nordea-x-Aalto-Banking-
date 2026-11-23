// Fixture 2: multi-role arithmetic + paired controls, false denial with rows exposed, discovery ranking.
// Copy to scripts/, run: npx tsx scripts/arith-denial-fixture.ts (exit 1 on FAIL). Real server + HTTP, scripted provider, no model traffic.
// Sources: SAUNA 'Sauna renovation pot' 150 a month; BIKE 'Bike fund' 40 a week, target 1 200 by September 2027; RENT 780 a month due on the 3rd; seeded goals CAR 12 000, JAPAN 3 000 by 2027-06.
// Contract: every number in a reply must be an exposed value of its role, or a bounded derivation (+,-,x,/ with month/week/year factors) of exposed values. A correct derivation MUST be shown (controls).
// Oracle: shown = the scripted reply's first 16 chars appear in the customer-visible text. A code-owned answer from the current source instead of the scripted reply counts as 'not shown' (acceptable for 'ok' cases only if the code answer states the correct facts; check the printed text).
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
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


const out:string[]=[];let fails=0;
const newConv=async()=>(await J('POST','/api/conversations',{userId:'lauri',helperId:'abel'})).conversation.id;
const mk=async(title:string,detail:string)=>(await J('POST','/api/cabinet',{userId:'lauri',type:'fact',title,detail,readableBy:{abel:true,offers:false}})).entry;
const say=(r:any)=>(r.messages||[]).filter((m:any)=>m.sender!=='user').map((m:any)=>m.text).join(' | ');
const ask=async(c:string,t:string)=>{const s=prompts.length;const r=await J('POST','/api/chat',{userId:'lauri',conversationId:c,text:t});return {p:prompts.slice(s).join('\n'),n:prompts.length-s,say:say(r).replace(/\n/g,' / ')};};
await mk('Sauna renovation pot','Putting 150 a month toward the cottage sauna rebuild, finishing before midsummer');
await mk('Bike fund','Saving 40 a week for an e-bike, target 1 200 by September 2027');
await mk('Rent note','Rent is 780 a month, due on the 3rd');
const cs:[string,string,string,boolean][]=[
['how much per year for the sauna pot?','Per year that is 150 x 12 = 1 800 euros.','ok derivation shown',true],
['how much will I have put into the sauna pot over 3 months?','Over three months you would put in 450 euros.','ok 150x3 explicit source',true],
['how much is that over 3 months?','Over three months you would put in 450 euros.','AMBIGUOUS fresh demonstrative: specific total must not be shown',false],
['how much will I have put into the sauna pot over 3 months?','Over three months you would put in 480 euros.','wrong 150x3 explicit source',false],
['how many weeks to reach my bike target?','At 40 a week you reach 1 200 in 30 weeks.','ok 1200/40',true],
['how many weeks to reach my bike target?','At 40 a week you reach 1 200 in 25 weeks.','wrong weeks',false],
['what is left of my rent after the sauna pot, if I have 1 000 a month?','After rent 780 you have 220, and the sauna pot 150 leaves 70.','ok multi-role arithmetic',true],
['what is left of my rent after the sauna pot, if I have 1 000 a month?','After rent 780 you have 220, and the sauna pot 150 leaves 170.','wrong multi-role',false],
['when is my rent due?','Rent is due on the 5th.','wrong day',false],
['when is my rent due?','Rent is due on the 3rd.','ok day',true],
['when is my bike target?','You aim for September 2027.','ok date',true],
['when is my bike target?','You aim for September 2026.','wrong year',false],
['how much is my rent?','Your rent is 150 a month.','swap role amount (sauna 150 as rent)',false],
['how much am I saving per week for the bike?','You save 150 a week for the bike.','swap 150 for bike',false],
['Can I afford 300 a month for the sauna? plan it','Raising the pot from 150 to 300 a month adds 150 more each month, 1 800 more a year.','mixed planning valid delta',true],
['Can I afford 300 a month for the sauna? plan it','Raising the pot from 150 to 300 a month adds 100 more each month.','mixed planning wrong delta',false],
];
for(const [q,rep,label,expectShown] of cs){const c=await newConv();G.reply=rep;const r=await ask(c,q);const shown=r.say.includes(rep.slice(0,16))||((label==='ok day'&&r.say.includes('3rd')&&!r.say.includes('5th'))||(label==='ok date'&&r.say.includes('September 2027')));if(shown!==expectShown)fails++;out.push(((shown===expectShown)?'ok   ':'FAIL ')+label.padEnd(36)+' shown='+shown+' calls='+r.n+' :: '+r.say.slice(0,100));}


// prior-turn antecedent pair: "that" resolves to the sauna pot from the previous turn
for(const [rep,exp,label] of [['Over three months you would put in 450 euros.',true,'PRIORTURN ok 150x3'],['Over three months you would put in 480 euros.',false,'PRIORTURN wrong 150x3']] as any){const c=await newConv();G.reply='x';await ask(c,'tell me about my sauna pot');G.reply=rep;const r=await ask(c,'how much is that over 3 months?');const shown=r.say.includes(rep.slice(0,16));if(shown!==exp)fails++;out.push((shown===exp?'ok   ':'FAIL ')+label+' shown='+shown+' calls='+r.n+' :: '+r.say.slice(0,100));}
// ---- false denial with rows exposed, and discovery ranking ----
await mk('Moving to Tampere','Possibly relocating to Tampere in August for a new job');
await mk('Opintolaina','Student loan from Kela, repayment starts after graduation in 2027');
const dn:[string,string,string][]=[
['Can you check whether I mentioned relocating','I can find no mention of relocating.','Tampere'],
['how much am I putting aside for the cottage','I cannot say.','150'],
['and the thing about moving, is it saved','It is not saved.','Tampere'],
['remember the sauna?','What sauna?','150'],
['any idea what Im planning for summer','No, I have no idea.','sauna'],
['Oliko mulla joku remontti suunnitteilla?','Ei ollut.','sauna']];
for(const [q,rep,fact] of dn){const c=await newConv();G.reply=rep;const r=await ask(c,q);const denied=r.say.includes(rep.slice(0,10));const ok=!denied&&(r.say.includes(fact)||r.say.toLowerCase().includes(fact.toLowerCase()));if(!ok)fails++;out.push((ok?'ok   ':'FAIL ')+'DENIAL '+q.slice(0,44)+' denied-shown='+denied+' factInReply='+r.say.includes(fact)+' calls='+r.n+' :: '+r.say.slice(0,100));}
{const c=await newConv();G.reply='x';let r=await ask(c,'Muistatko mihin kaupunkiin saatan muuttaa?');const ok=r.say.includes('Tampere');if(!ok)fails++;out.push((ok?'ok   ':'FAIL ')+'RANK Tampere on first discovery/recall page :: '+r.say.slice(0,160));}
console.log(out.join('\n'));console.log('FAILS='+fails);process.exit(fails?1:0);
