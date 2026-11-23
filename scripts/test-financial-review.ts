// Financial-grounding fixture. Copy to scripts/, run: npx tsx scripts/financial-grounding-fixture.ts  (exit 1 on any FAIL)
// Real server.ts + real HTTP. Scripted provider; no model traffic. Each case: sources (what is exposed to the model, by role),
// the scripted reply (what the model asserts), and the expectation. Contract: a number/date/duration in a reply must be backed by
// the SOURCE ROLE it is attributed to (same entry, same field), or be a simple derivation of backed numbers of that same entry.
// Membership in a global known-number pool is NOT enough (cases W1-W3, D1, A2, T1).
// Roles in the fixture:
//   LOAN  = cabinet fact 'Opintolaina' detail 'Student loan from Kela, repayment starts after graduation in 2027' (no amount)
//   SAUNA = cabinet fact 'Sauna renovation pot' detail 'Putting 150 a month toward the cottage sauna rebuild, finishing before midsummer'
//   CAR   = seeded goal 'Save for a car: 12 000 EUR by December 2025'   (demo goal of customer lauri)
//   JAPAN = seeded goal 'Japan trip 3 000 EUR by 2027-06'
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
const mk=async(title:string,detail:string,rb:any={abel:true,offers:false},type='fact')=>(await J('POST','/api/cabinet',{userId:'lauri',type,title,detail,readableBy:rb})).entry;
const say=(r:any)=>(r.messages||[]).filter((m:any)=>m.sender!=='user').map((m:any)=>m.text).join(' | ');
const ask=async(c:string,t:string)=>{const s=prompts.length;const r=await J('POST','/api/chat',{userId:'lauri',conversationId:c,text:t});return {p:prompts.slice(s).join('\n'),n:prompts.length-s,say:say(r).replace(/\n/g,' / ')};};
await mk('Opintolaina','Student loan from Kela, repayment starts after graduation in 2027');
await mk('Sauna renovation pot','Putting 150 a month toward the cottage sauna rebuild, finishing before midsummer');
for(let k=0;k<20;k++)await mk('Misc item '+k,'misc detail '+k);
type Case={id:string,desc:string,turn1:string|null,turn2:string,reply:string,reject:boolean,why:string};
const cases:Case[]=[
{id:'W1',desc:'wrong role: CAR amount attributed to LOAN',turn1:null,turn2:'How big is my student loan?',reply:'Your student loan is 12 000 euros.',reject:true,why:'12 000 belongs to CAR goal; LOAN has no amount'},
{id:'W2',desc:'wrong role: JAPAN amount attributed to SAUNA',turn1:null,turn2:'How much have I put into the sauna pot?',reply:'You put 3 000 euros into the sauna pot.',reject:true,why:'3 000 belongs to JAPAN; SAUNA has 150/month'},
{id:'W3',desc:'wrong role: SAUNA 150 attributed to LOAN repayment',turn1:null,turn2:'How much is my loan repayment?',reply:'Your loan repayment is 150 a month.',reject:true,why:'150 belongs to SAUNA'},
{id:'I1',desc:'invented amount and duration, source present without numbers',turn1:null,turn2:'tell me about my student loan',reply:'Your student loan is 31 400 euros, repaid over 9 years.',reject:true,why:'neither number in any source'},
{id:'T1',desc:'title-only exposure (discovery), detail amount claimed',turn1:'what was that mökki thing',turn2:'how much am I saving for it?',reply:'Your sauna pot has 150 euros a month.',reject:true,why:'after title-only discovery the detail was not exposed; 150 only in unseen detail (a later turn that retrieves the detail may state it)'},
{id:'D1',desc:'wrong date for LOAN',turn1:null,turn2:'when does my loan repayment start?',reply:'Repayment starts after graduation in 2029.',reject:true,why:'LOAN says 2027'},
{id:'D2',desc:'date from another role (JAPAN 2027-06) attributed to LOAN with a month',turn1:null,turn2:'which month does my loan repayment start?',reply:'Repayment starts in June 2027.',reject:true,why:'month June comes from JAPAN'},
{id:'A1',desc:'wrong arithmetic on SAUNA 150/month',turn1:null,turn2:'how much per year is my sauna pot?',reply:'That is 1 500 euros a year.',reject:true,why:'150*12=1 800'},
{id:'A2',desc:'arithmetic that lands in the pool by coincidence: 150*20=3 000 (JAPAN amount) claimed as sauna yearly',turn1:null,turn2:'how much per year is my sauna pot?',reply:'That is 3 000 euros a year.',reject:true,why:'3 000 is in the pool via JAPAN, not a derivation of 150/month by a yearly factor'},
{id:'C1',desc:'CONTROL correct: SAUNA 150 a month',turn1:null,turn2:'how much am I putting into the sauna pot?',reply:'You put 150 euros a month into the sauna pot.',reject:false,why:'backed by SAUNA detail'},
{id:'C2',desc:'CONTROL correct derivation 150*12',turn1:null,turn2:'how much per year is my sauna pot?',reply:'That is 1 800 euros a year.',reject:false,why:'simple derivation of SAUNA 150/month'},
{id:'C3',desc:'CONTROL correct date LOAN 2027',turn1:null,turn2:'when does my loan repayment start?',reply:'It starts after graduation in 2027.',reject:false,why:'backed by LOAN detail'},
{id:'C4',desc:'CONTROL title-only then pick-and-retrieve then correct amount',turn1:'what was that mökki thing',turn2:'tell me about Sauna renovation pot, how much per month?',reply:'You put 150 euros a month toward it.',reject:false,why:'title named in turn 2, detail retrieved'},
];
for(const k of cases){const c=await newConv();G.reply='Let me look at what is saved.';if(k.turn1)await ask(c,k.turn1);G.reply=k.reply;const r=await ask(c,k.turn2);
 const shown=r.say.includes(k.reply.slice(0,18));const ok=k.reject?!shown:shown;if(!ok)fails++;
 out.push((ok?'ok   ':'FAIL ')+k.id+' '+k.desc+' | expect '+(k.reject?'REJECT':'ACCEPT')+' | shown='+shown+' calls='+r.n+' | why: '+k.why+' | reply shown: '+r.say.slice(0,90));}
console.log(out.join('\n'));console.log('FAILS='+fails);process.exit(fails?1:0);
