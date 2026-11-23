import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.CABINET_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'retrieval-http-'));
delete process.env.SUPABASE_URL;delete process.env.GEMINI_API_KEY;delete process.env.LLM_API_KEY;
const {db}=await import('../src/server/db.js');const {setProvider}=await import('../src/server/llm.js');const {registerV14Routes}=await import('../src/server/routes.js');await db.init();
let reply='Which month would you like to start, January or March?';let toolQuery:string|undefined;let omitTool=true;let toolBroad=false;let followPages=false;let toolCursor:string|undefined;
const trace:any[]=[];
setProvider({name:'bounded-mechanics-fixture',isConfigured:()=>true,step:async({system,turns,tools})=>{
 trace.push({system,turns,toolNames:tools.map(t=>t.name)});
 assert.ok(!tools.some(t=>t.name==='finishRetrievalPlan'),'No hidden eager planning provider path');
 const last:any=turns.at(-1);
 if(!omitTool && (last?.role!=='tool_results' || followPages && last.results.some((r:any)=>r.result?.nextCursor))){
 if(last?.role==='tool_results')toolCursor=last.results.find((r:any)=>r.result?.nextCursor)?.result.nextCursor;
 return {answeredBy:'bounded-mechanics-fixture',calls:[{name:'getMoreSaved',args:{query:toolQuery,broad:toolBroad,cursor:toolCursor}}]};}
 return {answeredBy:'bounded-mechanics-fixture',calls:[{name:'finishReply',args:{text:reply,suggestions:[],usedEntryIds:[],topic:'other',couldHelp:true}}]};
}});
process.env.PORT='3782';process.env.NODE_ENV='production';await import('../server.ts');await new Promise(r=>setTimeout(r,500));const base='http://127.0.0.1:3782';
const request=async(method:string,url:string,body?:unknown)=>{const r=await fetch(base+url,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,await r.clone().text());return await r.json() as any;};
const ask=async(conv:string,text:string)=>{const start=trace.length;const result=await request('POST','/api/chat',{userId:'lauri',conversationId:conv,text});return {m:result.messages.at(-1),requests:trace.slice(start),all:JSON.stringify(trace.slice(start))};};
const create=async(title:string,detail:string)=> (await request('POST','/api/cabinet',{userId:'lauri',type:'fact',title,detail,readableBy:{abel:true,offers:false}})).entry;
try {
 const tea=await create('Unrelated beverage preference','UNRELATED_TEA_SENTINEL');
 const car=await create('Auton korjaus','Auton korjaus maksaa 27341 euroa');
 const conv=(await request('POST','/api/conversations',{userId:'lauri',helperId:'abel'})).conversation.id;
 let r=await ask(conv,'Help me plan');assert.ok(!r.all.includes('UNRELATED_TEA_SENTINEL'));assert.ok(!r.all.includes('27341'));assert.ok(!r.m.exposedSources.some((s:any)=>s.id===tea.id));
 await request('PATCH','/api/cabinet/'+tea.id,{detail:'UNRELATED_COFFEE_SENTINEL'});reply='January works. What would you like to plan next?';
 r=await ask(conv,'January please');assert.ok(r.all.includes('January or March'),'Unrelated edit preserves antecedent');assert.ok(!r.m.text.includes('context behind my earlier question'));assert.ok(!r.all.includes('UNRELATED_COFFEE_SENTINEL'));
 reply='Auton korjaus maksaa 27341 euroa';r=await ask(conv,'Mitä auton korjaus maksaa?');assert.ok(r.all.includes('27341'));assert.equal(r.m.supplied.source,'model');assert.ok(r.m.exposedSources.some((s:any)=>s.id===car.id));
 const nonBank=new Set(r.m.exposedSources.filter((s:any)=>s.owner!=='nordea').map((s:any)=>s.owner+':'+s.id));assert.equal(r.m.supplied.notes,nonBank.size,'Seen count reflects actual source refs');
 // A later reply must inherit actual included source-bearing history, even without another read.
 reply='That repair is the one we were planning.';r=await ask(conv,'Could you explain?');assert.ok(r.m.exposedSources.some((s:any)=>s.id===car.id));
 await request('PATCH','/api/cabinet/'+car.id,{readableBy:{abel:false,offers:false}});reply='We can work from what you share now.';r=await ask(conv,'Can we continue planning that repair?');assert.ok(!r.all.includes('27341'));assert.ok(!r.all.includes('That repair is the one we were planning.'));
 // Semantic tool reformulation reaches a withheld fact; initial unrelated reply omitted it.
 const second=await create('Vehicle service reserve','Cost budget 38179 euros');
 const conv2=(await request('POST','/api/conversations',{userId:'lauri',helperId:'abel'})).conversation.id;
 reply='I can help with planning.';r=await ask(conv2,'Hello');assert.ok(!r.all.includes('38179'));
 omitTool=false;toolQuery='Vehicle service reserve';reply='Cost budget 38179 euros';r=await ask(conv2,'Can we work out the motor budget?');assert.ok(r.all.includes('38179'));assert.ok(r.m.exposedSources.some((s:any)=>s.id===second.id));assert.equal(r.m.supplied.source,'model');
 // A nonexposed number cannot be grounded just because it exists in another permitted row.
 const hiddenNumber=await create('Distant unrelated object','Budget 876543 euros');
 const numConv=(await request('POST','/api/conversations',{userId:'lauri',helperId:'abel'})).conversation.id;
 reply='The budget is 876543 euros.';r=await ask(numConv,'Hello');assert.ok(!r.all.includes('Budget 876543 euros'));assert.notEqual(r.m.supplied.source,'model');assert.ok(!r.m.exposedSources.some((s:any)=>s.id===hiddenNumber.id));
 reply='I have no saved fact about that.';r=await ask(numConv,'What did I tell you about my rocket?');assert.notEqual(r.m.supplied.source,'model','Weak model false absence is not accepted');
 // Independent weak-skip regressions: lookup state, not a phrase blacklist, owns recall answers.
 const englishCar=await create('Car plans','The car colour is dark green');
 for(const question of ['Tell me about me','Mitä tiedät autostani?','What do you know about my car plans?']) {
  const c=(await request('POST','/api/conversations',{userId:'lauri',helperId:'abel'})).conversation.id;
  reply=question.startsWith('Mitä')?'En tiedä mitään autostasi.':'No saved information is available.';
  r=await ask(c,question);assert.equal(r.requests.length,0);assert.ok(!r.m.text.includes(reply));
  if(question!=='Tell me about me')assert.ok(r.m.text.includes('dark green'));
 }
 for(const question of ['Do you know anything about my car?','What have I saved?','Mitä olen tallentanut?']) {
  const c=(await request('POST','/api/conversations',{userId:'lauri',helperId:'abel'})).conversation.id;
  reply='No, I have nothing about your car.';r=await ask(c,question);assert.equal(r.requests.length,0);assert.ok(!r.m.text.includes(reply));
  if(question.includes('car')){assert.ok(r.m.text.includes('dark green'));let page=r;for(let i=0;i<8&&!page.m.savedContextPage.complete;i++)page=await ask(c,'Show more');assert.ok(page.m.savedContextPage.complete);const done=await ask(c,'Show more');assert.equal(done.requests.length,0);assert.match(done.m.text,/search is complete/);}
  else assert.ok(r.m.text.includes('From the saved context')||r.m.text.includes('Jaetusta tallennetusta'));
 }
 const mix=(await request('POST','/api/conversations',{userId:'lauri',helperId:'abel'})).conversation.id;
 reply='We can work on a monthly plan together.';r=await ask(mix,'Tell me about me and help me plan 200 monthly');assert.ok(r.requests.length>0);assert.equal(r.m.text,reply);assert.ok(r.all.includes('200 monthly'));
 // Title discovery is bounded actual exposure, never permission to infer unseen detail.
 const discoveryConv=(await request('POST','/api/conversations',{userId:'lauri',helperId:'abel'})).conversation.id;
 reply='I can look for the saved topic.';r=await ask(discoveryConv,'Could we revisit that thing?');
 assert.ok(r.m.exposedSources.some((s:any)=>s.id.endsWith(':title')));
 assert.ok(!r.all.includes('UNRELATED_COFFEE_SENTINEL'));
 const titleRef=r.m.exposedSources.find((s:any)=>s.id===tea.id+':title');assert.ok(titleRef);
 await request('PATCH','/api/cabinet/'+tea.id,{detail:'DETAIL_NOT_EXPOSED_CHANGED'});
 reply='We can continue with the topic you choose.';r=await ask(discoveryConv,'January please');assert.ok(r.requests.length>0,'Unexposed detail edit must not invalidate title-only history');assert.ok(!r.all.includes('DETAIL_NOT_EXPOSED_CHANGED'));
 // Explicit broad inspection is bounded and honestly partial, with paging inside fixed tool limits.
 omitTool=true;reply='We can review the saved context in parts.';
 for(let i=0;i<14;i++)await create('Broad item '+i,'BROAD_DETAIL_'+i);
 const broadConv=(await request('POST','/api/conversations',{userId:'lauri',helperId:'abel'})).conversation.id;
 r=await ask(broadConv,'Tell me everything you know about me');assert.match(r.m.text,/partial view/);assert.ok(r.m.exposedContentKeys.length<=7);assert.equal(r.requests.length,0);
 const firstPage=r.m.text;r=await ask(broadConv,'More');assert.equal(r.requests.length,0);assert.notEqual(r.m.text,firstPage);assert.ok(r.m.savedContextPage);
 let terminal=r;const pageStates:string[]=[];
 for(let i=0;i<12;i++){terminal=await ask(broadConv,'Show more');pageStates.push(JSON.stringify(terminal.m.savedContextPage));if(terminal.m.savedContextPage?.complete)break;}
 assert.ok(terminal.m.savedContextPage?.complete,'Broad pager must terminate '+pageStates.join('\n'));
 for(let i=0;i<3;i++){const end=await ask(broadConv,'Show more');assert.match(end.m.text,/search is complete/);assert.ok(end.m.savedContextPage.complete);}
 omitTool=false;toolBroad=true;followPages=true;toolQuery='Tell me everything you know about me';toolCursor=undefined;
 r=await ask(broadConv,'Tell me about me');assert.match(r.m.text,/partial view/);assert.ok(r.requests.length===0);
 omitTool=true;toolBroad=false;followPages=false;toolCursor=undefined;
 // Current purpose permission, parked state and personas remain source-owner decisions.
 const BUS=await import('../src/server/arch/store/busStore.js');BUS.setCabinetParkedMirror('lauri',true);
 reply='We can continue using the context currently shared.';r=await ask(conv2,'What is the vehicle service reserve?');assert.ok(!r.all.includes('38179'));BUS.setCabinetParkedMirror('lauri',false);
 const CM=await import('../src/server/arch/store/cmStore.js');
 CM.putEntry('lauri',{id:'bounded-cm',title:'Cabin equipment',detail:'CM_BOUNDARY_SENTINEL',goalIds:[],proposedBy:'user',status:'active',createdAt:new Date().toISOString()});
 const cmConv=(await request('POST','/api/conversations',{userId:'lauri',helperId:'abel'})).conversation.id;
 r=await ask(cmConv,'What cabin equipment did I save?');assert.ok(r.all.includes('CM_BOUNDARY_SENTINEL'));assert.ok(r.requests.length<=2,'One source-evidence correction is bounded');
 CM.putEntry('lauri',{...CM.loadCmDb('lauri').entries.find(e=>e.id==='bounded-cm')!,status:'archived'});
 r=await ask(cmConv,'Please explain the cabin equipment again');assert.ok(!r.all.includes('CM_BOUNDARY_SENTINEL'));
 // Current source edits replace nonnumeric paraphrases without relying on quoted IDs.
 const colour=await create('Garden shed','The finish is burnt orange');
 const editConv=(await request('POST','/api/conversations',{userId:'lauri',helperId:'abel'})).conversation.id;
 reply='Your garden shed is a warm rusty shade.';r=await ask(editConv,'Can we plan the garden shed?');assert.ok(r.all.includes('burnt orange'));
 await request('PATCH','/api/cabinet/'+colour.id,{detail:'The finish is pale blue'});reply='We can plan from the current shared note.';
 r=await ask(editConv,'Please continue the garden shed plan');assert.ok(!r.all.includes('warm rusty shade'));assert.ok(!r.all.includes('burnt orange'));assert.ok(r.all.includes('pale blue'));
 // Personal User DB airlock facts remain reachable without a catalogue/model planning call.
 const U=await import('../src/server/arch/store/userStore.js');const u=U.loadUserDb('lauri');u.personalFacts.push({id:'bounded-airlock',text:'Camping lantern replacement PERSONAL_AIRLOCK_SENTINEL',source:'notes',viaAirlockId:'approved-fixture',at:new Date().toISOString()} as any);U.saveUserDb(u);
 const factConv=(await request('POST','/api/conversations',{userId:'lauri',helperId:'abel'})).conversation.id;
 r=await ask(factConv,'Can we plan the camping lantern replacement?');assert.ok(r.all.includes('PERSONAL_AIRLOCK_SENTINEL'));assert.equal(r.requests.length,1);
 const u2=U.loadUserDb('lauri');u2.personalFacts=u2.personalFacts.filter(f=>f.id!=='bounded-airlock');U.saveUserDb(u2);
 r=await ask(factConv,'Can we continue the camping lantern replacement?');assert.ok(!r.all.includes('PERSONAL_AIRLOCK_SENTINEL'));
 const eeva=(await request('POST','/api/conversations',{userId:'eeva',helperId:'abel'})).conversation.id;
 const before=trace.length;await request('POST','/api/chat',{userId:'eeva',conversationId:eeva,text:'What is the vehicle service reserve?'});assert.ok(!JSON.stringify(trace.slice(before)).includes('38179'));
 console.log('PASS bounded HTTP: no eager planning, unrelated-edit continuity, Finnish first lookup without tools, omitted later fact via tool, actual seen count, transitive withdrawal, bounded broad paging, numeric grounding pair, false-absence hold, CM archive, parked cabinet and persona isolation. Scripted mechanics only.');
 fs.writeFileSync(path.join(process.env.CABINET_DATA_DIR!, 'retrieval-provider-trace.json'),JSON.stringify(trace,null,2));
}catch(error){console.error(error);process.exitCode=1;}finally{setTimeout(()=>process.exit(process.exitCode || 0),100);}
