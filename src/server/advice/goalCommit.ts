import {equivalentGoalTitles} from '../similar.js';
import {openDb,fileFor} from '../arch/store/common.js';
import {goalRevision} from './goalConfirmation.js';
import type {CabinetEntry,ChatMessage,EntryEvent,UndoRecord} from '../../types.js';
/** Goal row and consumed proposal live in the same User DB and commit together.
 * No await between validation and COMMIT. A failed transaction writes neither. */
export function consumeGoalProposal(userId:string,messageId:string,decline=false,choice:'update'|'both'='update'):CabinetEntry|null {
 const store=openDb(fileFor(userId,'user'),'user');
 try{
  store.exec('BEGIN IMMEDIATE');
  const r=store.prepare('SELECT json FROM app_messages WHERE id=?').get(messageId) as {json:string}|undefined;
  if(!r)throw new Error('Proposal not found');const m=JSON.parse(r.json) as ChatMessage;
  const c=m.cards?.find(c=>c.type==='goal_confirm');const d=c?.data;
  if(m.userId!==userId||!m.conversationId||m.resolved||!d)throw new Error('Proposal already answered or not owned');
  const newer=store.prepare('SELECT json FROM app_messages WHERE rowid>(SELECT rowid FROM app_messages WHERE id=?)').all(m.id) as {json:string}[];
  if(newer.some(x=>{const n=JSON.parse(x.json) as ChatMessage;return n.conversationId===m.conversationId&&n.cards?.some(k=>k.type==='goal_confirm');}))throw new Error('A newer goal proposal replaced this one');
  if(!['add','update','duplicate','archive'].includes(d.operation))throw new Error('Unknown goal proposal');
  if(choice==='both'&&d.operation!=='duplicate')throw new Error('This is not a duplicate choice');
  if(!d.expiresAt||!Number.isFinite(Date.parse(d.expiresAt))||Date.parse(d.expiresAt)<Date.now())throw new Error('Proposal expired. Ask Nora to show it again');
  let e:CabinetEntry|null=null;let previous:CabinetEntry|null=null;
  if(!decline){
   const draft=d.draft;const t=draft?.target;
   if(!draft?.title||(!t&&d.operation==='add')||(t&&(!Number.isFinite(t.amount)||t.amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||new Date(t.date+'T12:00:00Z').toISOString().slice(0,10)!==t.date)))throw new Error('Invalid goal target');
   if(d.operation==='duplicate'&&choice==='both'){
    const r=store.prepare('SELECT doc FROM goals WHERE id=?').get(d.entryId) as {doc:string}|undefined;
    const old=r?.doc?JSON.parse(r.doc) as CabinetEntry:null;
    if(!old||old.userId!==userId||goalRevision(old)!==d.existingRevision)throw new Error('The existing goal changed. Ask Nora to show fresh choices');
   }
   if(d.operation==='add'||(d.operation==='duplicate'&&choice==='both')){
    const goals=store.prepare('SELECT title,doc FROM goals').all() as {title:string;doc:string}[];
    const matches=goals.filter(r=>(!r.doc||JSON.parse(r.doc).status!=='archived')&&equivalentGoalTitles(r.title,draft.title));
    if(matches.some(r=>d.operation!=='duplicate'||!r.doc||JSON.parse(r.doc).id!==d.entryId))throw new Error('A matching goal was saved after this proposal. Ask Nora to show the current goal and choices again');
   }
   const now=new Date().toISOString();
   if(d.operation==='archive'||d.operation==='update'||(d.operation==='duplicate'&&choice==='update')){
    const row=store.prepare('SELECT doc FROM goals WHERE id=?').get(d.entryId) as {doc:string}|undefined;const old=row?.doc?JSON.parse(row.doc) as CabinetEntry:null;
    if(!old||old.userId!==userId||old.status==='archived'||goalRevision(old)!==d.existingRevision)throw new Error('Goal changed after proposal. Ask Nora to show current values again');
    previous=old;
    e={...old,...(d.operation==='archive'?{status:'archived' as const}:d.operation==='update'?{title:draft.title,detail:draft.detail,target:t}:{target:t}),confirmedAt:now,updatedAt:now,provenance:d.operation==='archive'?old.provenance:{...old.provenance,targetFields:draft.provenance?.targetFields||draft.targetFields||old.provenance.targetFields,targetOrigin:{amount:t?.amount!==old.target?.amount?'customer-confirmed-proposal':old.provenance.targetOrigin?.amount||undefined,date:t?.date!==old.target?.date?'customer-confirmed-proposal':old.provenance.targetOrigin?.date||undefined}}};
   }else{
    e={id:'goal-'+m.id,userId,type:'goal',title:draft.title,detail:'',source:'customer',status:'active',private:!!d.private,readableBy:{abel:true,offers:false},target:t,goalType:draft.goalType||'other',reviewed:true,confirmedAt:now,createdAt:now,updatedAt:now,provenance:{channel:'app',messageId:m.id,targetFields:draft.targetFields,targetOrigin:{amount:'customer-confirmed-proposal',date:'customer-confirmed-proposal'}}};
   }
   store.prepare('INSERT INTO goals(id,title,detail,created_at,doc) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET doc=excluded.doc,title=excluded.title,detail=excluded.detail').run(e.id,e.title,e.detail,e.createdAt,JSON.stringify(e));
  }
  if(e){
   const ev:EntryEvent={id:'goal-confirm-'+m.id,entryId:e.id,userId,at:new Date().toISOString(),action:d.operation==='archive'?'removed':previous?'changed':'added',by:'you',how:'Confirmed goal card',title:e.title,changes:previous?['title','detail','target','status'].filter(k=>JSON.stringify((previous as any)[k])!==JSON.stringify((e as any)[k])).map(k=>({field:k,from:(previous as any)[k],to:(e as any)[k]})):undefined};
   const undo:UndoRecord={undoToken:'undo-goal-'+m.id,timestamp:ev.at,userId,action:previous?'update':'create',description:previous?'Changed goal':'Created goal',previousEntry:previous,entryId:e.id};
   const kv=store.prepare('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v');
   kv.run('goal-audit:'+ev.id,JSON.stringify(ev));kv.run('goal-undo:'+undo.undoToken,JSON.stringify({...undo,appliedRevision:goalRevision(e)}));
  }
  if(e)m.usedEntryIds=[...new Set([...(m.usedEntryIds||[]),e.id])];
  m.resolved=decline?'Do not save':'Confirmed goal';
  store.prepare('UPDATE app_messages SET json=? WHERE id=?').run(JSON.stringify(m),m.id);
  store.exec('COMMIT');return e;
 }catch(e){try{store.exec('ROLLBACK');}catch{}throw e;}finally{store.close();}
}

/** Undo this new path atomically, refusing a stale token instead of restoring over later edits. */
export function undoConfirmedGoal(userId:string,token:string):boolean{
 const store=openDb(fileFor(userId,'user'),'user');
 try{
  store.exec('BEGIN IMMEDIATE');
  const r=store.prepare('SELECT v FROM kv WHERE k=?').get('goal-undo:'+token) as {v:string}|undefined;
  if(!r)throw new Error('Undo not found');const rec=JSON.parse(r.v) as UndoRecord&{appliedRevision:string};
  if(rec.userId!==userId)throw new Error('Undo not owned');
  const row=store.prepare('SELECT doc FROM goals WHERE id=?').get(rec.entryId!) as {doc:string}|undefined;
  const current=row?.doc?JSON.parse(row.doc) as CabinetEntry:null;
  if(!current||goalRevision(current)!==rec.appliedRevision)throw new Error('The goal changed after this action. Undo would replace newer edits');
  if(rec.previousEntry){const e=rec.previousEntry;store.prepare('UPDATE goals SET title=?,detail=?,doc=? WHERE id=?').run(e.title,e.detail,JSON.stringify(e),e.id);}
  else store.prepare('DELETE FROM goals WHERE id=?').run(rec.entryId!);
  const ev:EntryEvent={id:'undone-'+token,entryId:current.id,userId,at:new Date().toISOString(),action:'undone',by:'you',how:'Undo goal confirmation',title:current.title};
  store.prepare('INSERT INTO kv(k,v) VALUES(?,?)').run('goal-audit:'+ev.id,JSON.stringify(ev));
  store.prepare('DELETE FROM kv WHERE k=?').run('goal-undo:'+token);
  store.exec('COMMIT');return true;
 }catch(e){try{store.exec('ROLLBACK');}catch{}throw e;}finally{store.close();}
}
