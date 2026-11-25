import {contextTerms} from '../contextRetrieval.js';
import {FinancialRegistry,inspectExplicitSource,type Expression,type VerifiedFact} from './financialRegistry.js';
import {registerFinanceOutput} from './financialRegistryAdapters.js';
import {sourceRevision} from '../arch/text.js';
import type {CabinetEntry} from '../../types.js';
/** A general "how am I doing with my money" question: balances and spending are relevant even though no keyword names them.
 *  Without this the handle list stayed empty, the model had nothing it was allowed to quote, and the turn ended at the step limit. */
export const MONEY_OVERVIEW=/\bhow am i (?:doing|going) (?:with|on) (?:my |the )?(?:money|finances?)\b|\bhow(?:'s|\u2019s| is| are) my (?:money|finances?)\b|\b(?:my (?:money|finances?|financial) situation|(?:overview|summary) of my (?:money|finances?)|my (?:money|finance|financial) (?:overview|summary))\b|\brahatilanteeni\b|\bmiten (?:rahani|talouteni) (?:menee|ovat)\b/iu;
export class TurnFinancialEvidence {
 readonly registry:FinancialRegistry;
 private revisions=new Map<string,string>();
 private requestText='';
 private bankData=new Map<string,unknown>();
 private currentGoals=new Set<string>();
 /** Bank tools the model itself called this turn. Their figures are relevant whatever words the question used
  *  (live: after getPayPlan, "keep 500 €… move an extra 300 €" was refused because the pay plan was filtered out). */
 private requestedTools=new Set<string>();
 constructor(customerId:string,conversationId:string,turnId:string,private verifySource?:(id:string,revision:string)=>boolean){this.registry=new FinancialRegistry({customerId,conversationId,turnId},id=>{const r=this.revisions.get(id);return r&&(!this.verifySource||this.verifySource(id,r))?r:undefined;});}
 includeEntry(e:CabinetEntry){const revision=sourceRevision([e.title,e.detail,e.target,e.updatedAt,e.status,e.readableBy]);this.revisions.set(e.id,revision);inspectExplicitSource(this.registry,{id:e.id,revision,title:e.title,detail:e.detail,target:e.target});}
 includeGoal(g:any){
  this.currentGoals.add(String(g.goalId));
  const id='status:'+String(g.goalId),revision=sourceRevision(g);this.revisions.set(id,revision);
  const add=(field:string,role:VerifiedFact['role'],value:unknown,unit:'EUR'|'month'='EUR',per?:'month')=>{if(typeof value==='number'&&Number.isFinite(value))this.registry.register({sourceId:id,sourceRevision:revision,entity:g.title,field,role,kind:'quantity',quantity:{value,unit,...(per?{per}:{})},evidence:{type:'typed-field',path:field}});};
  add('target','target',g.target);
  const linked=g.savingRateKnown!==false;
  if(linked||g.goalType==='car')add('saved','balance',g.saved);
  if(linked||g.goalType==='car')add('remaining','target',g.remainingToTargetNow);
  if(!g.stale&&linked){add('saving_rate','saving',g.monthlyGoingIn,'EUR','month');add('months_left','duration',g.monthsLeft,'month');add('short_by','target',g.shortBy);add('extra_per_month','saving',g.extraPerMonthNeeded,'EUR','month');}
  if(typeof g.targetDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(g.targetDate)){const [year,month,day]=g.targetDate.split('-').map(Number);this.registry.register({sourceId:id,sourceRevision:revision,entity:g.title,field:'target_date',role:'calendar',kind:'calendar',calendar:{year,month,day},evidence:{type:'typed-field',path:'targetDate'}});}
 }
 /** topicText decides which bank facts are relevant (for a bare "yes" it includes the question being answered);
  *  amounts and durations are read only from the customer's own text. */
 includeRequest(text:string,topicText:string=text){
  this.requestText=topicText;
  const id='request:current',revision=sourceRevision(text);this.revisions.set(id,revision);
  const goals=this.list().filter(f=>f.sourceId.startsWith('status:')&&f.field==='saving_rate');const query=new Set(contextTerms(text));
  const matched=goals.filter(f=>contextTerms(f.entity).some(t=>!['saving','savings','goal','fund','pot','target','save','for'].includes(t)&&query.has(t)));
  for(const m of text.matchAll(/\b(?:over |for |going )?(\d{1,2})\s+months?\b/giu)){
   const entity=matched.length===1?matched[0].entity:'Current request';this.registry.register({sourceId:id,sourceRevision:revision,entity,field:'requested_duration',role:'duration',kind:'quantity',quantity:{value:Number(m[1]),unit:'month'},evidence:{type:'exact-span',span:m[0]}});
  }
  if(matched.length===1)for(const m of text.matchAll(/\b(?:extra|additional|another)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:euros?|EUR|€)?\s*(?:a|per|each|every)\s+month\b/giu))this.registry.register({sourceId:id,sourceRevision:revision,entity:matched[0].entity,field:'hypothetical_additional_saving',role:'saving',kind:'quantity',quantity:{value:Number(m[1].replace(',','.')),unit:'EUR',per:'month'},evidence:{type:'exact-span',span:m[0]}});
 }
 /** The model called this bank tool; returns the handles of what it got back, so it can quote them with financialAnswer. */
 requestedBank(tool:'getAccounts'|'getSalary'|'getSpending'|'getPayPlan'){this.requestedTools.add('bank:'+tool);return this.list().filter(f=>f.sourceId==='bank:'+tool).map(({id,entity,field,quantity})=>({id,entity,field,value:quantity?.value,per:quantity?.per}));}
 includeBank(tool:'getAccounts'|'getSalary'|'getSpending'|'getPayPlan',data:unknown){const id='bank:'+tool,revision=sourceRevision(data);this.revisions.set(id,revision);this.bankData.set(id,data);registerFinanceOutput(this.registry,{id,revision},tool,data);}
 list(){return this.registry.list().filter(f=>!this.currentGoals.has(f.sourceId)).filter(f=>{
  if(!this.requestText||!f.sourceId.startsWith('bank:'))return true;
  if(this.requestedTools.has(f.sourceId))return true;
  if(f.sourceId==='bank:getAccounts')return /balance|account|how much.*(?:have|money)|savings|säästötil|käyttötil|saldo|afford/iu.test(this.requestText)||MONEY_OVERVIEW.test(this.requestText);
  if(f.sourceId==='bank:getSalary')return /budgets?|monthly plan|salary|income|pension|payday|palk|eläke|afford/iu.test(this.requestText);
  if(f.sourceId==='bank:getSpending')return /budgets?|monthly plan|spend|spent|cost|pay|gym|phone|restaurant|groc|transport|kulut|käytin|ruoka|afford/iu.test(this.requestText)||MONEY_OVERVIEW.test(this.requestText);
  if(f.sourceId==='bank:getPayPlan')return /budgets?|monthly plan|payday|left|remainder|afford|how much.*save|palkkapäiv|varaa/iu.test(this.requestText);
  return true;
 });}

 handles(){return this.list().map(({id,entity,field,role,kind,quantity,calendar})=>({id,entity,field,role,kind,quantity,calendar}));}
 coverage(proposals:unknown,request:string):string[]{
  if(!Array.isArray(proposals))return ['financial request'];
  const used=new Set<string>();const walk=(x:any)=>{if(!x||typeof x!=='object')return;if(x.fact)used.add(x.fact);if(x.calculation)walk(x.calculation);if(x.left)walk(x.left);if(x.right)walk(x.right);};proposals.forEach(walk);
  const selected=this.list().filter(f=>used.has(f.id));
  const mentioned=this.list().filter(f=>!(f.sourceId.startsWith('status:')||this.currentGoals.has(f.sourceId))||/goal|target|tavoite/iu.test(request)).filter(f=>{const words=f.entity.toLowerCase().replace(/ \(\d{4}-\d{2}\)$/,'').match(/[\p{L}]{3,}/gu)||[];return words.some(w=>!['membership','installments','income','current','saving','savings','account','plan','goal','fund','pot','save','car','for','the','with','buy','and'].includes(w)&&request.toLowerCase().includes(w));});
  const entities=[...new Set(mentioned.map(f=>f.entity))];const sameEntity=(a:string,b:string)=>a.replace(/ \(\d{4}-\d{2}\)$/,'')===b.replace(/ \(\d{4}-\d{2}\)$/,'');const missing=entities.filter(e=>!selected.some(f=>sameEntity(f.entity,e)));
  if(/(?:\bwhen\b|what(?: is|'s) (?:the |my |our )?(?:deadline|date)|which (?:deadline|date)|tell me (?:the |my |our )?(?:deadline|date)|milloin|määräpäiv|päättyy|renew)/iu.test(request)&&!selected.some(f=>f.kind==='calendar'))missing.push('requested date');
  const has=(field:string)=>selected.some(f=>f.field===field);
  if(/\bcar\b/iu.test(request)&&!selected.some(f=>/\bcar\b|carFund/iu.test(f.entity)&&(/car goal/iu.test(request)?f.field==='target':true)))missing.push('requested car goal target');
  if(/(?:extra|additional).*(?:per month|monthly|a month)|(?:per month|monthly).*(?:extra|additional)|(?:more.*(?:need|save)|(?:need|save).*more).*(?:per month|monthly|a month)|lisä.*kuukau/iu.test(request)&&!has('extra_per_month')&&!has('hypothetical_additional_saving'))missing.push('requested monthly additional saving');
  if(/salary|income|pension|palkka|palkkani|eläke/iu.test(request)&&!has('current_income')&&!has('previous_income')&&!has('income_difference'))missing.push('requested income');
  if(/left|remainder|jäljelle|jäännös/iu.test(request)&&!has('left_over_after_spending_and_saving'))missing.push('requested remainder after spending and existing saving');
  if(/(?:did I|already|have I).*(?:move|transfer)|(?:move|transfer).*(?:already|this payday)|will you transfer|siirsin|siirretty/iu.test(request))missing.push('actual transfers, these planning figures do not verify transfer history or execution');
  if(/remain|still need|left to (?:save|reach)|vielä.*tarvi/iu.test(request)&&!has('remaining')){
   const computed=proposals.some((p:any)=>{const e=p?.calculation;if(e?.op!=='subtract'||!e.left?.fact||!e.right?.fact)return false;const a=this.registry.get(e.left.fact),b=this.registry.get(e.right.fact);return a?.field==='target'&&b?.field==='saved'&&a.entity===b.entity;});
   if(!computed)missing.push('requested amount remaining has not been computed');
  }
  if(/afford|can I save|varaa|voin.*sääst/iu.test(request))missing.push('affordability assessment');
  return missing;
 }
 render(proposals:unknown,language:'en'|'fi',request=''):string[]{
  if(!Array.isArray(proposals)||proposals.length>8)throw new Error('Choose up to eight financial facts or calculations');
  const requestedCurrent=/current(?: account)?|checking account|käyttötil/iu.test(request),requestedSavings=/savings(?: account)?|säästötil/iu.test(request);
  const requestedIncome=/salary|pension|income|palk|eläke/iu.test(request),previous=/previous|before|used to|aiemp|edelli/iu.test(request),change=/change|difference|increase|muuttu|ero/iu.test(request);
  const selectedFields=new Set<string>();{const walk=(x:any):void=>{if(!x||typeof x!=='object')return;if(x.fact){const f=this.registry.get(String(x.fact));if(f&&f.sourceId==='bank:getSpending')selectedFields.add(f.field);}if(x.calculation)walk(x.calculation);if(x.left)walk(x.left);if(x.right)walk(x.right);};proposals.forEach(walk);}
  const scopeCheck=(f:VerifiedFact)=>{
   if(f.sourceId==='bank:getSpending'){
    const category=f.entity.replace('Spending: ','').replace(/ \(\d{4}-\d{2}\)$/,'').toLowerCase();const requestedCategory=['restaurants','groceries','transport','housing','bills','subscriptions','shopping','pharmacy'].find(c=>request.toLowerCase().includes(c));
    if(requestedCategory&&category!==requestedCategory)throw new Error('This is not the requested spending category');
    // The figure for the asked period must be in the answer. A labelled comparison (the monthly average, the last full
    // month) may sit beside it, never replace it: each row is rendered with its own period.
    if(/last month|viime kuussa/iu.test(request)&&f.field!=='last_full_month_spending'&&!selectedFields.has('last_full_month_spending'))throw new Error('A monthly average cannot answer last-month spending');
    if(/this month|tässä kuussa|tässä kuussa/iu.test(request)&&f.field!=='current_month_spending'&&!selectedFields.has('current_month_spending'))throw new Error('This is not current month spending');
   }
   if((requestedCurrent||requestedSavings)&&f.sourceId.startsWith('bank:')&&f.field==='balance'&&f.sourceId!=='bank:getAccounts')throw new Error('Use the requested account balance, not a planning figure');
   if(f.sourceId==='bank:getAccounts'&&f.field==='balance'){
    if(requestedCurrent&&!requestedSavings&&f.entity!=='current'||requestedSavings&&!requestedCurrent&&f.entity!=='savings')throw new Error('This account is not the requested account');
   }
   if(requestedIncome&&['current_income','previous_income','income_difference'].includes(f.field)){
    if(!previous&&!change&&f.field!=='current_income'||previous&&!change&&f.field!=='previous_income'||change&&f.field!=='income_difference')throw new Error('This income field is not the requested period or change');
   }
  };
  const queryTerms=new Set(contextTerms(request));const generic=new Set(['saving','savings','goal','fund','pot','account','cost','rate','plan','target','month','year','save']);
  const mentioned=this.list().filter(f=>!f.sourceId.startsWith('bank:')&&contextTerms(f.entity).some(w=>!generic.has(w)&&queryTerms.has(w)));
  const mentionedEntities=new Set(mentioned.map(f=>f.entity));
  const visible=new Set(this.list().map(f=>f.id));
  const verify=(x:any):void=>{if(!x||typeof x!=='object')throw new Error('Invalid expression');if(x.fact){if(!visible.has(x.fact))throw new Error('Handle not supplied');const f=this.registry.get(x.fact);if(f){scopeCheck(f);if(mentionedEntities.size&&!f.sourceId.startsWith('bank:')&&!mentionedEntities.has(f.entity))throw new Error('That source purpose was not requested');}}if(x.left)verify(x.left);if(x.right)verify(x.right);};
  return proposals.map(p=>{
   verify(p&&typeof p==='object'&&'calculation'in p?(p as any).calculation:p);
   if(p&&typeof p==='object'&&'fact'in p){const f=this.registry.get(String(p.fact));if(f&&/(?:when|deadline|milloin|määräpäiv|päättyy|renew)/iu.test(request)&&!/(?:cost|much|amount|target|balance|maksaa|paljonko|summa|tavoite)/iu.test(request)&&f.kind!=='calendar')throw new Error('A calendar question needs the corresponding date field');if(f?.quantity?.per==='month'&&/(?:per year|yearly|annually|vuodessa)/iu.test(request))throw new Error('The requested answer is annual; use a months_per_year calculation');
    if(f?.quantity?.per==='year'&&/(?:per month|monthly|kuukaudessa|kuussa)/iu.test(request))throw new Error('The requested answer is monthly; use a months_per_year calculation');
    if(f?.role==='income'&&/(?:can I save|how much.*save.*salary|afford|varaa|voin.*sääst)/iu.test(request))throw new Error('Income alone does not establish affordable saving capacity');}
   if(p&&typeof p==='object'&&'fact'in p)return this.registry.renderFact(String(p.fact),language,this.registry.scope);
   let expr=(p as {calculation?:Expression})?.calculation;if(!expr)throw new Error('Financial answer needs a supplied fact handle or calculation');
   if('op'in expr&&expr.op==='subtract'&&'fact'in expr.left&&'fact'in expr.right&&/more.+than|less.+than|enemmän.+kuin|vähemmän.+kuin/iu.test(request)){
    const left=this.registry.get(expr.left.fact),right=this.registry.get(expr.right.fact);const where=(entity:string)=>{const t=contextTerms(entity).filter(w=>!['membership','installments','plan','cost','account'].includes(w));return Math.min(...t.map(w=>request.toLowerCase().indexOf(w)).filter(i=>i>=0));};
    if(left&&right&&where(right.entity)<where(left.entity))expr={...expr,left:expr.right,right:expr.left};
   }
   const r=this.registry.evaluate(expr);return this.registry.renderResult(r.id,language,this.registry.scope);
  });
 }
}
