// Reproduction for review rounds b171d35f/b62dd4be. Place in scripts/, run: npx tsx scripts/weak-skip-http-probe.ts
// Real server.ts + real /api/cabinet,/api/chat,/api/conversations. Scripted provider NEVER calls getMoreSaved (weak-skip case). No model traffic.
// Exit code 1 if any CONTRACT line fails. Contracts are state checks, not wordlists:
//  C1 (no unsearched absence): if the customer asks about saved/remembered info, and the saved fact exists, the reply shown must not be an absence claim unless a search ran this turn that covered the fact's terms and was exhausted. Test oracle here = reply must not equal the scripted absence text (shown verbatim = fail).
//  C2 (pager terminates): repeated 'show more' must end with a completion state and then never repeat a row already shown for this ask.
//  C3 (no dropped second clause): mixed message with a task clause must reach the model (calls>=1) with retrieved rows in context.
//  C4 (privacy): offers-only, abel-off, withdrawn sentinels never in any provider request or shown reply; revoking between pages hides the entry.
//  C5 (continuity): edit/delete/abel-off of the exposed entry -> no leak; unrelated edit keeps the question and reaches model.
// Place in scripts/ of the repo (needs the patch under review applied). Run: npx tsx scripts/continuity-probe.ts
// Real server.ts, real /api/cabinet and /api/chat routes, scripted capturing provider, temp data dir.
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
const CHECK=(name:string,ok:boolean,info:string)=>{if(!ok)fails++;out.push((ok?'ok   ':'FAIL ')+name+' :: '+info.replace(/\n/g,' ').slice(0,200));};
const newConv=async()=>(await J('POST','/api/conversations',{userId:'lauri',helperId:'abel'})).conversation.id;
const mk=async(title:string,detail:string,rb:any={abel:true,offers:false},type='fact')=>(await J('POST','/api/cabinet',{userId:'lauri',type,title,detail,readableBy:rb})).entry;
const say=(r:any)=>(r.messages||[]).filter((m:any)=>m.sender!=='user').map((m:any)=>m.text).join(' | ');
const ask=async(c:string,t:string)=>{const s=prompts.length;const r=await J('POST','/api/chat',{userId:'lauri',conversationId:c,text:t});return {p:prompts.slice(s).join('\n'),n:prompts.length-s,say:say(r)};};
await mk('Car fund wish ZQ','Saving for a used Volvo ZQ by spring');
await mk('OFFERSONLY_SENT1','offers only secret 7781',{abel:false,offers:true});
await mk('ABELOFF_SENT2','abel off secret 7782',{abel:false,offers:false});
const wd=await mk('WITHDRAWN_SENT3','to be withdrawn 7783');await J('DELETE','/api/cabinet/'+wd.id);
for(let k=0;k<14;k++)await mk('Filler note '+k,'filler detail number '+k+' tea');
const SENT=['OFFERSONLY_SENT1','offers only secret','ABELOFF_SENT2','abel off secret','WITHDRAWN_SENT3','to be withdrawn'];
const leaks=(p:string)=>SENT.filter(x=>p.includes(x)).join(',');
// C1: 15 phrasings. rep = scripted model reply (an absence claim). Fail when it reaches the customer verbatim, or when the car fact is expected but absent.
const qs:[string,string,boolean][]=[
['Have you got anything on my car?','Nope, nothing there.',true],
['Is there a note somewhere about a car I want?','I could not find any note about a car.',true],
['Remind me what I said about the Volvo','I have no record of a Volvo.',true],
['Did I mention a vehicle?','You have not mentioned a vehicle.',true],
['Onko sinulla tietoa autosta jota haluan?','Minulla ei ole tietoa autosta.',true],
['Muistatko mitä sanoin autohaaveesta?','En muista, mitään ei ole tallennettu.',true],
['Mitä kaikkea minusta on muistissa?','Ei mitään.',false],
['List everything you remember about me','I remember nothing.',false],
['Anything saved about holidays or my car?','Nothing saved on either.',true],
['my car thing, what was it','I am not sure what you mean, nothing saved.',true],
['Wat do u no abut my cra','I have nothing on that.',true],
['Do I have any saved notes?','You have no saved notes.',false],
['Mitä tallennettuja muistiinpanoja minulla on?','Sinulla ei ole muistiinpanoja.',false],
['What did I save about a vehicle purchase in spring?','No such note.',true],
['Kerro autostani ja kerro myös paljonko säästän kuussa','Autostasi ei ole tietoa.',true]];
for(const [q,rep,needCar] of qs){G.reply=rep;const c=await newConv();const r=await ask(c,q);
 const shownAbsence=r.say.includes(rep.slice(0,12));
 const wrongCopy=/did not find a matching saved item|couldn.t verify my answer/i.test(r.say);
 CHECK('C1 '+q.slice(0,40),!shownAbsence&&!wrongCopy&&(!needCar||r.say.includes('Volvo')||r.p.includes('Volvo ZQ'))&&!leaks(r.p+r.say),'calls='+r.n+' shown='+r.say.slice(0,120));}
// C1b: follow-up with a NEW topic after a complete recall must be searched, not model-guessed
{G.reply='I have nothing more.';const c=await newConv();await ask(c,'What do you know about my car?');const r=await ask(c,'what about holidays?');
 CHECK('C1b new-topic follow-up searched',!r.say.includes('nothing more')||r.p.includes('Japan')||/holiday|trip/i.test(r.p),'calls='+r.n+' shown='+r.say.slice(0,100));}
// C2: pager terminates, no repeats
{G.reply='x';const c=await newConv();let r=await ask(c,'What do you know about me?');const seen=new Map<string,number>();const cnt=(t:string)=>(t.match(/Filler note \d+/g)||[]).forEach(x=>seen.set(x,(seen.get(x)||0)+1));cnt(r.say);let ended=false,i=0;
 for(;i<8;i++){r=await ask(c,'show more');cnt(r.say);if(/complete|that.s all|everything/i.test(r.say)&&!/partial view/i.test(r.say)){ended=true;break;}}
 CHECK('C2 pager ends',ended,'pages='+(i+1)+' distinct='+seen.size);
 CHECK('C2 no repeated row',[...seen.values()].every(v=>v===1),'repeats='+[...seen.entries()].filter(([,v])=>v>1).map(([k])=>k).join(','));}
// C3: mixed -> model reached with rows in context
for(const m of ['What do you know about me, and also help me plan saving 200 euros a month','Plan my saving of 200 a month and tell me what you know about me','Hi! what have you saved about me? also is 50 euros a week too much to save?','Kerro autostani ja kerro myös paljonko säästän kuussa']){G.reply='MODEL_TASK_ANSWER';const c=await newConv();const r=await ask(c,m);
 CHECK('C3 '+m.slice(0,40),r.n>=1&&r.say.includes('MODEL_TASK_ANSWER'),'calls='+r.n+' shown='+r.say.slice(0,100));}
// C4 revoke between pages
{G.reply='x';const c=await newConv();const a=await mk('PAGEPERM_A','perm test A');await ask(c,'What do you know about me?');await J('PATCH','/api/cabinet/'+a.id,{readableBy:{abel:false,offers:false}});const r2=await ask(c,'show more');CHECK('C4 revoke between pages',!(r2.p+r2.say).includes('perm test A'),r2.say.slice(0,80));}
// C5 privacy + unrelated
for(const variant of ['paraphrase','exact']) for(const action of ['edit','delete','abel-off']){
 const conv=await newConv();const T='Flat budget Zeta'+variant+action;const D='Deposit target is 41230 euros '+variant+action;const e=await mk(T,D);
 G.reply=variant==='paraphrase'?'You are putting money aside for a flat, around forty thousand.':'You have "'+T+'" noted, '+D+'.';
 await ask(conv,'What did I tell you about the flat?');G.reply='Sure. Which month do you want to start, January or March?';await ask(conv,'Can you help me plan it?');
 if(action==='edit')await J('PATCH','/api/cabinet/'+e.id,{title:'NEWTITLE'+variant,detail:'newdetail 5'});
 if(action==='delete')await J('DELETE','/api/cabinet/'+e.id);
 if(action==='abel-off')await J('PATCH','/api/cabinet/'+e.id,{readableBy:{abel:false,offers:false}});
 G.reply='Great, January it is. What amount do you want to put aside each month?';const r=await ask(conv,'January please');
 CHECK('C5 privacy '+variant+' '+action,!(r.p.includes(T)||r.p.includes(D)||r.p.includes('forty thousand')),'calls='+r.n);}
{const conv=await newConv();const a=await mk('Unrelated A','likes tea');G.reply='Sure. Which month, January or March?';await ask(conv,'Help me plan');await J('PATCH','/api/cabinet/'+a.id,{detail:'likes coffee'});G.reply='Great, January it is. What amount do you want to put aside each month?';const r=await ask(conv,'January please');
 CHECK('C5 unrelated edit continues',r.n>=1&&r.say.startsWith('Great, January'),'calls='+r.n+' shown='+r.say.slice(0,60));}
console.log(out.join('\n'));console.log('FAILS='+fails);process.exit(fails?1:0);
