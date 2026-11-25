import type {CabinetEntry} from '../../types.js';
import type {Clarification} from './clarification.js';
import {UNKNOWN_REPLY} from './clarification.js';
export function goalProgressReply(text:string, goals:CabinetEntry[], previous:Clarification|undefined, status:(goal:CabinetEntry)=>any, today:string) {
 const progress=/^(?:am i on track|how (?:are|is) my (?:savings|saving|goals?) (?:going|doing)|how is my progress)[?.! ]*$/iu.test(text.trim());
 const selection=previous?.purpose==='goal_progress';
 const named=goals.filter(g=>g.title.toLocaleLowerCase()===text.trim().toLocaleLowerCase());
 const goalWords=(g:CabinetEntry)=>g.title.split(/\W+/).filter(w=>w.length>3&&!['with','goal','saving','savings'].includes(w.toLowerCase()));
 const namesGoal=(g:CabinetEntry)=>text.toLocaleLowerCase().includes(g.title.toLocaleLowerCase())||goalWords(g).some(w=>new RegExp('\\b'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','iu').test(text));
 const goalQuestion=/\b(?:on track|progress|how.*(?:goal|saving).*(?:going|doing))\b/iu.test(text) && goals.some(namesGoal);
 if(!progress&&!goalQuestion&&!(selection&&named.length))return null;
 const matching=named.length?named:goals.filter(g=>goalQuestion&&goalWords(g).some(w=>new RegExp('\\b'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','iu').test(text)));
 const chosen=matching.length===1?matching[0]:goals.length===1?goals[0]:undefined;
 if(!chosen){
  const question=goals.length?'Which savings goal would you like to check?':'What are you saving towards?';
  return {text:question,clarification:{kind:'customer_detail' as const,question,purpose:'goal_progress' as const},suggestions:[...goals.map(g=>g.title).filter(t=>t.length<=40).slice(0,2),UNKNOWN_REPLY],usedEntryIds:[]};
 }
 const g=status(chosen);
 if(chosen.status==='stale'||!chosen.target?.date||chosen.target.date<today)return {text:`The saved deadline for "${chosen.title}" has passed, so its old forecast cannot tell us whether you are on track now. What deadline would you like to use for this conversation?`,clarification:{kind:'customer_detail' as const,question:'What deadline would you like to use for this conversation?'},suggestions:[UNKNOWN_REPLY],usedEntryIds:[chosen.id]};
 // Any source with real numbers answers: a linked account, or the figures the customer told us (customer-stated).
 const money=(n:number)=>new Intl.NumberFormat('en-FI',{maximumFractionDigits:2}).format(n)+' EUR';
 const stated=g.source==='customer-stated'?` These are the figures you told me${g.statedAt?` on ${g.statedAt}`:''}, not an account balance.`:'';
 // One figure can be known without the other: acknowledge what we have, ask only for what is missing.
 if(!Number.isFinite(g.saved)){
  const head=Number.isFinite(g.monthlyGoingIn)?`I can read the target for "${chosen.title}" and your monthly contribution of ${money(g.monthlyGoingIn)}.${stated} But there is no linked saved balance.`:`I can read the target for "${chosen.title}", but there is no linked saved balance and monthly contribution.`;
  return {text:`${head} That does not mean you have saved nothing. How much have you already saved towards this goal?`,clarification:{kind:'customer_detail' as const,question:'How much have you already saved towards this goal?'},suggestions:[UNKNOWN_REPLY],usedEntryIds:[chosen.id]};
 }
 if(!Number.isFinite(g.monthlyGoingIn))return {text:`For "${chosen.title}", you have ${money(g.saved)} saved towards ${money(g.target)} by ${g.targetDate}.${stated} I do not have your monthly contribution for this goal, so I cannot forecast whether you are on track. That does not mean the rest is zero. How much do you add each month?`,clarification:{kind:'customer_detail' as const,question:'How much do you add each month?'},suggestions:[UNKNOWN_REPLY],usedEntryIds:[chosen.id]};
 return {text:`For "${chosen.title}", you have ${money(g.saved)} saved towards ${money(g.target)} by ${g.targetDate}.${stated} At ${money(g.monthlyGoingIn)} per month for ${g.monthsLeft} months, the projection is ${money(g.projectedByTargetDate)}.\n\n${g.onTrack?'You are on track at that pace, assuming the contributions continue.':`That leaves a projected gap of ${money(g.shortBy)}. The current estimate is about ${money(g.extraPerMonthNeeded)} extra each month. This is a projection, not a guarantee or an affordability check.`}\n\nNothing has been changed.`,suggestions:[],usedEntryIds:[chosen.id]};
}
