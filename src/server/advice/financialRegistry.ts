import {sourceRevision} from '../arch/text.js';

export type Unit='EUR'|'month'|'week'|'year'|'day'|'count';
export type Quantity={value:number;unit:Unit;per?:'month'|'week'|'year'};
export type RegistryScope={customerId:string;conversationId:string;turnId:string};
export type FactRole='income'|'cost'|'saving'|'target'|'balance'|'fee'|'duration'|'calendar';
export interface VerifiedFact {
 id:string;sourceId:string;sourceRevision:string;entity:string;field:string;role:FactRole;
 kind:'quantity'|'calendar';quantity?:Quantity;calendar?:{year?:number;month?:number;day?:number};
 evidence:{type:'typed-field'|'exact-span';path?:string;span?:string};
}
export type Expression={fact:string}|{constant:'months_per_year'}|{op:'add'|'subtract'|'multiply'|'divide';left:Expression;right:Expression};
export interface ComputedResult {id:string;quantity:Quantity;facts:string[];expression:Expression}
type Fraction={n:bigint;d:bigint};
const fail=(message:string):never=>{throw new Error(message);};
const copy=<T>(value:T):T=>structuredClone(value);
const eq=(a:Quantity,b:Quantity)=>a.unit===b.unit&&a.per===b.per;
const gcd=(a:bigint,b:bigint):bigint=>b?gcd(b,a%b):a<0n?-a:a;
const fraction=(n:bigint,d=1n):Fraction=>{if(!d)fail('Division by zero');if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};};
function decimal(value:number):Fraction {
 const s=String(value);if(!/^-?\d+(?:\.\d+)?$/.test(s))fail('Unsupported decimal magnitude');
 const [whole,part='']=s.split('.');return fraction(BigInt(whole+part),10n**BigInt(part.length));
}
function arithmetic(op:string,a:Fraction,b:Fraction):Fraction {
 if(op==='add')return fraction(a.n*b.d+b.n*a.d,a.d*b.d);
 if(op==='subtract')return fraction(a.n*b.d-b.n*a.d,a.d*b.d);
 if(op==='multiply')return fraction(a.n*b.n,a.d*b.d);
 if(op==='divide')return fraction(a.n*b.d,a.d*b.n);
 return fail('Unsupported operation');
}

/** A registry belongs to exactly one reply.
 * Owning adapters mint fields; model proposals can only select existing handles. */
export class FinancialRegistry {
 private facts=new Map<string,VerifiedFact>();
 private results=new Map<string,ComputedResult & {exact:Fraction}>();
 constructor(readonly scope:RegistryScope={customerId:'isolated-test',conversationId:'isolated-test',turnId:'isolated-test'},private currentRevision?:(id:string)=>string|undefined){}
 register(fact:Omit<VerifiedFact,'id'>):VerifiedFact {
  if(fact.kind==='quantity'&&(!fact.quantity||!Number.isFinite(fact.quantity.value)||Math.abs(fact.quantity.value)>1e12))fail('Invalid quantity');
  if(fact.quantity)decimal(fact.quantity.value);
  const c=fact.calendar;
  if(fact.kind==='calendar'&&(!c||!Object.keys(c).length||c.month!==undefined&&(!Number.isInteger(c.month)||c.month<1||c.month>12)||c.day!==undefined&&(!Number.isInteger(c.day)||c.day<1||c.day>31)||c.year!==undefined&&(!Number.isInteger(c.year)||c.year<1900||c.year>2200)))fail('Invalid calendar field');
  const entry={...copy(fact),id:'fact-'+sourceRevision({scope:this.scope,fact}).slice(0,24)};
  this.facts.set(entry.id,entry);return copy(entry);
 }
 list(){return copy([...this.facts.values()]);}
 get(id:string){const f=this.facts.get(id);return f?copy(f):undefined;}
 private validate(ids:string[],scope:RegistryScope){
  if(sourceRevision(scope)!==sourceRevision(this.scope))fail('Result scope changed');
  for(const id of ids){const f=this.facts.get(id);if(!f)fail('Unknown fact');if(this.currentRevision&&this.currentRevision(f!.sourceId)!==f!.sourceRevision)fail('Source changed or unavailable');}
 }
 evaluate(expression:Expression):ComputedResult {
  let visited=0;
  const run=(node:Expression,depth:number):{q:Quantity;exact:Fraction;refs:string[]}=>{
   if(++visited>31||depth>5)fail('Calculation exceeds bounded expression size');
   if('fact'in node){const f=this.facts.get(node.fact);if(!f||f.kind!=='quantity'||!f.quantity)fail('Unknown or nonnumeric fact');return {q:copy(f!.quantity!),exact:decimal(f!.quantity!.value),refs:[f!.id]};}
   if('constant'in node){if(node.constant!=='months_per_year')fail('Unsupported constant');return {q:{value:12,unit:'month',per:'year'},exact:fraction(12n),refs:[]};}
   const a=run(node.left,depth+1),b=run(node.right,depth+1);let q:Quantity;
   if(node.op==='add'||node.op==='subtract'){
    if(!eq(a.q,b.q)&&a.q.unit==='EUR'&&b.q.unit==='EUR'&&['month','year'].includes(a.q.per||'')&&['month','year'].includes(b.q.per||'')&&a.refs.every(id=>this.facts.get(id)?.role==='cost')&&b.refs.every(id=>this.facts.get(id)?.role==='cost')){
     if(a.q.per==='year'){a.exact=arithmetic('divide',a.exact,fraction(12n));a.q={...a.q,per:'month'};}
     if(b.q.per==='year'){b.exact=arithmetic('divide',b.exact,fraction(12n));b.q={...b.q,per:'month'};}
    }
    if(!eq(a.q,b.q))fail('Amounts have incompatible units or periods');q={...a.q};
   }else if(node.op==='multiply'){
    if(a.q.per===b.q.unit&&!b.q.per)q={value:0,unit:a.q.unit};
    else if(b.q.per===a.q.unit&&!a.q.per)q={value:0,unit:b.q.unit};
    else if(a.q.unit==='EUR'&&a.q.per==='month'&&b.q.unit==='month'&&b.q.per==='year')q={value:0,unit:'EUR',per:'year'};
    else if(b.q.unit==='EUR'&&b.q.per==='month'&&a.q.unit==='month'&&a.q.per==='year')q={value:0,unit:'EUR',per:'year'};
    else fail('Multiplication has incompatible dimensions');
   }else if(node.op==='divide'){
    if(!b.exact.n)fail('Division by zero');
    if(a.q.unit===b.q.unit&&!a.q.per&&b.q.per)q={value:0,unit:b.q.per};
    else if(a.q.unit==='EUR'&&a.q.per==='year'&&b.q.unit==='month'&&b.q.per==='year')q={value:0,unit:'EUR',per:'month'};
    else if(eq(a.q,b.q))q={value:0,unit:'count'};
    else fail('Division has incompatible dimensions');
   }else fail('Unsupported operation');
   const af=a.refs.map(id=>this.facts.get(id)!),bf=b.refs.map(id=>this.facts.get(id)!);
   const sameEntity=af.length&&bf.length&&af.every(f=>bf.every(g=>f.entity===g.entity));
   if(node.op==='add'&&af.length&&bf.length&&!af.every(f=>bf.every(g=>f.role===g.role)))fail('Addition cannot mix financial roles');
   if(node.op==='subtract'&&af.length&&bf.length&&!af.every(f=>bf.every(g=>f.role===g.role||f.role==='income'&&g.role==='cost'||f.role==='target'&&g.role==='balance'&&sameEntity)))fail('Subtraction cannot mix unrelated financial roles');
   if(node.op==='divide'&&a.q.unit==='EUR'&&!a.q.per&&b.q.per&&(!sameEntity||!af.every(f=>f.role==='target')||!bf.every(f=>f.role==='saving')))fail('Target duration requires a saving rate for the same purpose');
   if(node.op==='multiply'&&af.some(f=>f.role==='duration')&&bf.length&&!sameEntity||node.op==='multiply'&&bf.some(f=>f.role==='duration')&&af.length&&!sameEntity)fail('Payment duration belongs to another purpose');
   const exact=arithmetic(node.op,a.exact,b.exact);q!.value=Number(exact.n)/Number(exact.d);
   if(!Number.isFinite(q!.value)||Math.abs(q!.value)>1e12)fail('Calculation result outside safe range');
   return {q:q!,exact,refs:[...new Set([...a.refs,...b.refs])]};
  };
  const r=run(expression,0);this.validate(r.refs,this.scope);
  const result={id:'result-'+sourceRevision({scope:this.scope,expression}).slice(0,24),quantity:r.q,facts:r.refs,expression:copy(expression)};
  this.results.set(result.id,{...copy(result),exact:r.exact});return copy(result);
 }
 renderResult(id:string,language:'en'|'fi',scope:RegistryScope):string {
  const result=this.results.get(id);if(!result)fail('Unknown result');this.validate(result!.facts,scope);
  const labels=result!.facts.map(id=>this.facts.get(id)!).map(f=>`${({current:'Current account',savings:'Savings account',carFund:'Car saving account'} as Record<string,string>)[f.entity]||f.entity} (${fieldLabel(f.field,language)})`);
  const entities=[...new Set(labels)].join(' + '),q=result!.quantity;
  // Round only at display, using integer arithmetic with explicit approximation marker.
  const negative=result!.exact.n<0n,n=negative?-result!.exact.n:result!.exact.n,d=result!.exact.d;
  const scaled=(n*100n+d/2n)/d;const rounded=n*100n%d!==0n;
  const raw=(negative?'-':'')+String(scaled/100n)+(scaled%100n?'.'+String(scaled%100n).padStart(2,'0').replace(/0$/,''):'');
  const number=language==='fi'?raw.replace('.',','):raw;
  const units:Record<Unit,string>=language==='fi'?{EUR:'euroa',month:'kuukautta',week:'viikkoa',year:'vuotta',day:'päivää',count:'kertaa'}:{EUR:'EUR',month:'months',week:'weeks',year:'years',day:'days',count:'times'};
  const per=language==='fi'?{month:'kuukaudessa',week:'viikossa',year:'vuodessa'}:{month:'per month',week:'per week',year:'per year'};
  const inputs=result!.facts.map(id=>this.facts.get(id)!);
  const names=[...new Set(inputs.map(f=>f.entity))].join(language==='fi'?' ja ':' and ');
  const allCost=inputs.every(f=>f.role==='cost');
  const quantity=`${rounded?(language==='fi'?'noin ':'about '):''}${number} ${units[q.unit]}${q.per?' '+per[q.per]:''}`;
  if('op' in result!.expression&&result!.expression.op==='divide'&&q.unit==='month'&&inputs.some(f=>f.role==='target')&&inputs.some(f=>f.role==='saving')){
   const target=inputs.find(f=>f.role==='target')!,saving=inputs.find(f=>f.role==='saving')!;
   return language==='fi'?`Tallennetulla säästötahdilla ${target.entity} -tavoitesumman säästäminen vie ${quantity}, kun aloitussumma on nolla. Tarkoittaako tavoite koko summaa vai vielä puuttuvaa osaa?`:`At the saved saving rate, putting aside the ${target.entity} target amount takes ${quantity}, starting from zero. Is the target the full amount, or the amount still left to save?`;
  }
  if('op' in result!.expression&&result!.expression.op==='multiply'&&q.unit==='EUR'&&!q.per&&inputs.some(f=>f.role==='cost')&&inputs.some(f=>f.role==='duration')){
   const cost=inputs.find(f=>f.role==='cost')!;return language==='fi'?`Tallennettujen tietojen mukaan ${cost.entity}: maksut ovat yhteensä ${quantity} koko tallennetulta maksuajalta.`:`The saved ${cost.entity} payments total ${quantity} over the saved payment period.`;
  }
  if('op'in result!.expression&&result!.expression.op==='subtract'){
   const expr=result!.expression;
   if('fact'in expr.left&&'fact'in expr.right){const lf=this.facts.get(expr.left.fact)!,rf=this.facts.get(expr.right.fact)!;if(lf.role===rf.role&&q.value!==0){const abs=String(Math.abs(q.value));const unit=q.unit==='EUR'?(language==='fi'?' euroa':' EUR'):' '+q.unit;const period=q.per?' '+per[q.per]:'';return language==='fi'?`${lf.entity} on ${abs}${unit}${period} ${q.value>0?'enemmän':'vähemmän'} kuin ${rf.entity}.`:`${lf.entity} is ${abs}${unit}${period} ${q.value>0?'more':'less'} than ${rf.entity}.`;}}
   const left=result!.expression.left,right=result!.expression.right;
   const leftName='fact'in left?this.facts.get(left.fact)?.entity+' ('+fieldLabel(this.facts.get(left.fact)!.field,language)+')':'left expression';const rightName='fact'in right?this.facts.get(right.fact)?.entity+' ('+fieldLabel(this.facts.get(right.fact)!.field,language)+')':'right expression';
   return language==='fi'?`Erotus (${leftName} miinus ${rightName}) on ${quantity}. Miinusmerkki tarkoittaa, että ensimmäinen on pienempi.`:`The difference (${leftName} minus ${rightName}) is ${quantity}. ${q.value<0?'The first amount is smaller.':''}`;
  }
  if(allCost&&q.unit==='EUR')return language==='fi'?`Tallennettujen tietojen mukaan ${names}: ${quantity}.`:`Based on the saved costs for ${names}, ${'op' in result!.expression&&result!.expression.op==='add'?'the combined cost is':'the calculated cost is'} ${quantity}.`;
  return language==='fi'?`Laskelman lähteet ovat ${entities}. Tulos on ${quantity}.`:`Using the saved ${entities}, the result is ${quantity}.`;
 }
 renderFact(id:string,language:'en'|'fi',scope:RegistryScope):string {
  this.validate([id],scope);const f=this.facts.get(id)!;
  if(f.quantity){
   const q=f.quantity;const amount=language==='fi'?String(q.value).replace('.',','):String(q.value);const per=q.per?(language==='fi'?{month:' kuukaudessa',week:' viikossa',year:' vuodessa'}:{month:' per month',week:' per week',year:' per year'})[q.per]:'';
   const unit=q.unit==='EUR'?(language==='fi'?' euroa':' EUR'):q.unit==='month'?(language==='fi'?' kuukautta':' months'):' '+q.unit;
   const entity=({current:language==='fi'?'Käyttötili':'Current account',savings:language==='fi'?'Säästötili':'Savings account',carFund:language==='fi'?'Autosäästötili':'Car saving account'} as Record<string,string>)[f.entity]||f.entity;
   // Bank figures in plain English (seen live: 'For "Income", current income is 3900 EUR per month.' read like a form).
   if(language==='en'&&f.sourceId.startsWith('bank:')){
    const e=f.entity,v=`${amount} €`,pm=q.per==='month'?' a month':'';
    const spendOn=/^Spending: (.+?)(?: \((\d{4})-(\d{2})\))?$/.exec(e);
    const bank:Record<string,string|undefined>={
     current_income:`Your current income is ${v}${pm}.`,
     previous_income:`Your previous income was ${v}${pm}.`,
     income_difference:`That is a change of ${v}${pm} in your income.`,
     average_spending:spendOn?`${spendOn[1][0].toUpperCase()+spendOn[1].slice(1)} costs you about ${v}${pm} on average.`:`On average you spend ${v}${pm} (tracked spending).`,
     current_month_spending:spendOn?`So far this month you have spent ${v} on ${spendOn[1]}.`:`So far this month you have spent ${v}.`,
     last_full_month_spending:spendOn?`In the last full demo month${spendOn[3]?' ('+MONTHS[Number(spendOn[3])-1][0].toUpperCase()+MONTHS[Number(spendOn[3])-1].slice(1)+')':''} you spent ${v} on ${spendOn[1]}.`:undefined,
     saving_rate:`You put ${v}${pm} into savings.`,
     left_over_after_spending_and_saving:`After spending and saving, about ${v}${pm} is left over (an estimated remainder).`,
     buffer_kept_by_plan:`The plan keeps ${v} in your current account as a buffer.`,
     suggested_extra_not_approved:`You could move about ${v}${pm} more into savings. That is only a suggestion, not approved or scheduled.`,
     balance:`Your ${entity.toLowerCase()} has ${v}.`,
    };
    if(bank[f.field])return bank[f.field]!;
   }
   if(language==='en'&&f.sourceId.startsWith('status:')){
    const goal=`Your "${entity}" goal`;
    const sentences:Record<string,string>={target:`${goal} has a target of ${amount} EUR.`,saved:`You have ${amount} EUR set aside for "${entity}".`,saving_rate:`You are currently putting ${amount} EUR per month toward "${entity}".`,short_by:`At the current saving rate, "${entity}" is projected to fall short by ${amount} EUR.`,extra_per_month:`The saved plan estimates that "${entity}" needs about ${amount} EUR per month more, on top of the current contribution.`,remaining:`You still need ${amount} EUR to reach "${entity}".`};
    if(sentences[f.field])return sentences[f.field];
   }
   return language==='fi'?`Lähteen "${entity}" ${fieldLabel(f.field,language)} on ${f.field==='extra_per_month'?'noin ':''}${amount}${unit}${per}.`:`For "${entity}", ${fieldLabel(f.field,language)} is ${f.field==='extra_per_month'?'about ':''}${amount}${unit}${per}.`;
  }
  const c=f.calendar!,months=language==='fi'?FI_MONTHS:MONTHS;
  const value=[c.day,c.month?months[c.month-1]:undefined,c.year].filter(v=>v!==undefined).join(' ');
  if(language==='en'&&f.field==='target_date')return `Your saved deadline for "${f.entity}" is ${value}.`;
  if(f.field==='contract_end'&&c.month&&!c.day&&!c.year)return language==='fi'?`Tallennettujen tietojen mukaan sopimus "${f.entity}" päättyy ${FI_MONTHS[c.month-1]}ssa. Vuotta ei ole tallennettu.`:`Your saved ${f.entity} contract ends in ${MONTHS[c.month-1][0].toUpperCase()+MONTHS[c.month-1].slice(1)}. No year is saved.`;
  return language==='fi'?`Tallennetun lähteen "${f.entity}" kenttä "${fieldLabel(f.field,language)}" on ${value}.`:`The saved source "${f.entity}" gives ${value} for ${fieldLabel(f.field,language)}.`;
 }
}
function fieldLabel(field:string,language:'en'|'fi'){
 const labels:Record<string,[string,string]>={last_full_month_spending:['spending in the last full demo month','kulut viimeisessä täydessä demokuukaudessa'],average_spending:['average tracked spending','seurattujen kulujen keskiarvo'],current_month_spending:['current month spending so far','kuluvan kuun kulut tähän mennessä'],left_over_after_spending_and_saving:['estimated monthly remainder after tracked spending and existing saving','arvioitu kuukausittainen jäännös seurattujen kulujen ja säästöjen jälkeen'],suggested_extra_not_approved:['suggested extra saving, not approved or scheduled','ehdotettu lisäsäästö, ei hyväksytty eikä ajastettu'],balance:['account balance','tilin saldo'],income_difference:['change in monthly income','kuukausitulon muutos'],requested_duration:['duration requested for this calculation','pyydetty laskentajakso'],hypothetical_additional_saving:['hypothetical additional saving, not scheduled','hypoteettinen lisäsäästö, ei ajastettu'],remaining:['amount still needed','vielä tarvittava summa'],current_income:['current income','nykyinen tulo'],saved:['saved amount','säästetty summa'],months_left:['months left','kuukausia jäljellä'],short_by:['projected shortfall','arvioitu vajaus'],extra_per_month:['additional saving needed','tarvittava lisäsäästö'],previous_income:['previous income','aiempi tulo'],cost_rate:['cost','kulu'],saving_rate:['saving contribution','säästöön menevä määrä'],target:['target amount','tavoitesumma'],duration:['duration','kesto'],contract_end:['contract end','sopimuksen päättyminen'],renewal:['renewal','uusiminen'],target_date:['target date','tavoiteaika'],repayment_start:['repayment starts','takaisinmaksun alku'],due_day:['due day of month','eräpäivä kuukaudessa']};
 return labels[field]?.[language==='fi'?1:0]||field;
}
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
const FI_MONTHS=['tammikuu','helmikuu','maaliskuu','huhtikuu','toukokuu','kesäkuu','heinäkuu','elokuu','syyskuu','lokakuu','marraskuu','joulukuu'];
const FI_MONTH_CASES=FI_MONTHS.map(m=>m.replace(/kuu$/,'kuu(?:ssa|hun|ta)?'));
const N='(\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)';
const number=(s:string)=>Number(s.replace(/[ \u00a0\u202f]/g,'').replace(',','.'));
/** Reject substring-tail matches and malformed numeric grouping. The exact source
 * token, not a model-selected substring, establishes each numeric fact. */
function wholeToken(text:string,start:number,span:string):boolean {
 return !/\d[ \u00a0\u202f.,]*$/.test(text.slice(0,start))&&!/^[ \u00a0\u202f.,]*\d/.test(text.slice(start+span.length));
}
export function registerExplicitSource(registry:FinancialRegistry,source:{id:string;revision:string;title:string;detail:string},skipTarget=false):VerifiedFact[]{
 // An isolated span does not cancel negation, uncertainty or historical framing.
 // These clauses require an explicit adapter or a current-source quote/question.
 if(/\b(?:not|no|never|maybe|about|approximately|used to|previously|was|were|from|would|could|if|perhaps|ei|en|ehkä|noin|ennen)\b/iu.test(source.detail))return [];
 const before=new Set(registry.list().map(f=>f.id));const base={sourceId:source.id,sourceRevision:source.revision,entity:source.title};
 const addQ=(field:string,role:FactRole,m:RegExpMatchArray,quantity:Quantity)=>{if(wholeToken(source.detail,m.index!,m[0]))registry.register({...base,field,role,kind:'quantity',quantity,evidence:{type:'exact-span',span:m[0]}});};
 for(const m of source.detail.matchAll(new RegExp(N+'\\s*(?:euros?|euroa|EUR|€)?\\s*(?:(?:a|per|each|every|/)\\s*)?(month|week|year|mo|kk|kuukaudessa|viikossa|vuodessa)\\b','giu'))){
  const per=/^month$|^mo$|^kk$|kuukaudessa/i.test(m[2])?'month':/^week$|viikossa/i.test(m[2])?'week':'year';
  const prefix=source.detail.slice(0,m.index).split(/[.!?;]/).at(-1)!.trim();
  // No generic rate bucket. The saved sentence must explicitly label its role.
  const saving=/^(?:putting|saving|I save|säästän)$/iu.test(prefix);
  const cost=/^(?:gym costs|gym|rent(?: is)?|phone plan|car insurance|insurance|kuntosali maksaa)$/iu.test(prefix);
  const income=/^(?:salary is|pension is|income is|palkka on|eläke on)$/iu.test(prefix);
  if(saving||cost||income)addQ(saving?'saving_rate':cost?'cost_rate':'current_income',saving?'saving':cost?'cost':'income',m,{value:number(m[1]),unit:'EUR',per});
 }
 if(!skipTarget)for(const m of source.detail.matchAll(new RegExp('(?:target|goal|tavoite)\\s*'+N,'giu')))addQ('target','target',m,{value:number(m[1]),unit:'EUR'});
 for(const m of source.detail.matchAll(new RegExp('(?:for|over|duration)\\s*'+N+'\\s*(months?|weeks?|years?)\\b','giu')))addQ('duration','duration',m,{value:number(m[1]),unit:m[2].toLowerCase().startsWith('month')?'month':m[2].toLowerCase().startsWith('week')?'week':'year'});
 for(const m of source.detail.matchAll(/due on (?:the )?(\d{1,2})(?:st|nd|rd|th)\b/giu)){const day=Number(m[1]);if(day>=1&&day<=31)registry.register({...base,field:'due_day',role:'calendar',kind:'calendar',calendar:{day},evidence:{type:'exact-span',span:m[0]}});}
 const calendarRe=new RegExp('(?:(contract ends|ends|renewal|renews|target|by|repayment starts|graduation|sopimus päättyy|uusiutuu|tavoite)[^.!?]{0,35}?)(?:in |by )?('+[...MONTHS,...FI_MONTH_CASES].join('|')+')(?:\\s+(20\\d{2}))?(?![\\p{L}\\p{N}])','giu');
 for(const m of source.detail.matchAll(calendarRe)){
  const word=m[2].toLowerCase(),month=MONTHS.indexOf(word)>=0?MONTHS.indexOf(word)+1:FI_MONTHS.findIndex(w=>word.startsWith(w.replace(/kuu$/,'kuu')))+1;
  if(!month)continue;
  const field=/renew|uusiut/i.test(m[1])?'renewal':/end|päättyy/i.test(m[1])?'contract_end':/repayment|graduation/i.test(m[1])?'repayment_start':'target_date';
  if(skipTarget&&field==='target_date')continue;
  registry.register({...base,field,role:'calendar',kind:'calendar',calendar:{month,...(m[3]?{year:Number(m[3])}:{})},evidence:{type:'exact-span',span:m[0]}});
 }
 return registry.list().filter(f=>!before.has(f.id));
}
export interface SourceInspection {status:'supported'|'partial'|'unsupported';facts:VerifiedFact[];unparsedNumericSpans:string[];limitations:string[]}
/** Audit result, not a semantic completeness guarantee. A zero-digit note may still
 * contain spelled quantities or relative dates, which this parser does not interpret. */
export function inspectExplicitSource(registry:FinancialRegistry,source:{id:string;revision:string;title:string;detail:string;target?:{amount:number;date?:string}}):SourceInspection {
 const facts=registerExplicitSource(registry,source,!!source.target);
 if(source.target){
  facts.push(registry.register({sourceId:source.id,sourceRevision:source.revision,entity:source.title,field:'target',role:'target',kind:'quantity',quantity:{value:source.target.amount,unit:'EUR'},evidence:{type:'typed-field',path:'target.amount'}}));
  if(source.target.date&&/^\d{4}-\d{2}-\d{2}$/.test(source.target.date)){
   const [year,month,day]=source.target.date.split('-').map(Number);
   if(new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10)===source.target.date)facts.push(registry.register({sourceId:source.id,sourceRevision:source.revision,entity:source.title,field:'target_date',role:'calendar',kind:'calendar',calendar:{year,month,day},evidence:{type:'typed-field',path:'target.date'}}));
  }
 }
 const spans=[...source.detail.matchAll(/\d[\d \u00a0\u202f,.]*/g)].map(m=>m[0].trim());
 const unparsedNumericSpans=spans.filter(s=>!facts.some(f=>f.evidence.span?.includes(s)));
 return {status:!facts.length?'unsupported':unparsedNumericSpans.length?'partial':'supported',facts,unparsedNumericSpans,limitations:['Status measures documented grammar only, not arbitrary source meaning.','Typed fields describe current persisted app state, not retrospective proof of original customer intent.','Spelled quantities, relative dates, implicit roles, annual fee percentages and uncertain or negated clauses are outside this extraction grammar.']};
}
export function renderVerifiedResult(registry:FinancialRegistry,result:ComputedResult,language:'en'|'fi'='en'):string{return registry.renderResult(result.id,language,registry.scope);}
