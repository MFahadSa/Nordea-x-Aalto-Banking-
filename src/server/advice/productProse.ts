/** Bounded ASP/PS prose validation. Never writes or repairs customer prose.
 * Product-number roles are distinct from personal-account figures. Unknown roles stay in
 * personalText and therefore retain the original personal checker. Condition checks run
 * whether or not this turn has personal financial handles.
 */
import {currentProductFacts} from './productFacts.js';
export type ProductTopic='asp-account'|'ps-account';
export type ProductCheck={ok:true;personalText:string;productClauses:string[]}|{ok:false;reason:string};
const norm=(s:string)=>s.normalize('NFKC').replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[’]/g,"'").replace(/\*\*|__/g,'').replace(/\s+/g,' ').trim();
const number=(s:string)=>Number(s.replace(/[ ,]/g,''));
const nums=(s:string)=>[...s.matchAll(/\d{1,3}(?:[ ,]\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?/g)].map(m=>({value:number(m[0]),start:m.index!,end:m.index!+m[0].length}));
const sentence=(text:string)=>text.split(/(?<=[.!?])\s+|\n+/u).map(x=>x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/,'').trim()).filter(Boolean);
const has=(s:string,re:RegExp)=>re.test(s);
const PERSONAL=/\b(?:your|my|our)\s+(?:current |existing |actual |personal |monthly )?(?:salary|income|balance|deposit|saving|savings|goal|target|account|age|birthday)|\b(?:you (?:have|hold|own|earn|are eligible|qualify)|i (?:have|hold|own|earn)|we (?:have|hold|own|earn))\b/i;
const conditional=(s:string)=>/\b(?:if|when|unless|whether|provided|subject to|may|might|would|could|cannot establish|can't establish|unknown|not (?:known|established|verified))\b/i.test(s);
const percentages=(s:string)=>[...s.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:%|per ?cent)/gi)].map(m=>({value:Number(m[1].replace(',','.')),start:m.index!,end:m.index!+m[0].length}));
// Normalize written quantities before role checks; scope remains English product prose.
function quantityWords(text:string):string {
 const small:Record<string,number>={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
 return text.replace(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[ -]+(?:and[ -]+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand))*(?=[ -]*(?:%|per[ -]?cent|euros?|EUR|ASP accounts?|monthly|months?|deposits?|calendar|years?|days?))/gi,m=>{let total=0,v=0;for(const w of m.toLowerCase().split(/[ -]+/)){if(w==='and')continue;if(w==='hundred')v*=100;else if(w==='thousand'){total+=v*1000;v=0;}else v+=small[w]||0;}return String(total+v);}).replace(/(\d)[ -]*per[ -]?cent\b/gi,'$1%');
}
export function validateProductProse(text:string,topics:ReadonlySet<ProductTopic>,today:string,request=''):ProductCheck {
 if(!topics.size)return /\b(?:ASP|PS)\b/i.test(text)&&/\d|interest|bonus|deduct|withdraw|eligible|qualif/i.test(text)?{ok:false,reason:'No current product source was supplied for this product assertion. The application has not supplied the current public product source. Do not use getMoreSaved, which searches personal saved context, to retrieve product rules. Say the product terms could not be checked on this turn.'}:{ok:true,personalText:text,productClauses:[]};
 const table=currentProductFacts(topics,today);
 if(!table)return {ok:false,reason:'The current reviewed product facts are unavailable or stale.'};
 const active=[...topics];
 const parts=sentence(text).flatMap(x=>x.split(/,?\s+(?:and|but|so|because|since)\s+(?=(?:your|my|our|you (?:save|earn|have|currently)|I (?:have|will|opened|moved))\b)/i));const residual:string[]=[];const accepted:string[]=[];let heading='';
 const fail=(reason:string):ProductCheck=>({ok:false,reason:'Product explanation not verified: '+reason+' Rewrite the answer with the current product facts, preserving every relevant condition. Do not use personal-account handles for general product terms.'});
 for(let i=0;i<parts.length;i++){
  const original=parts[i],s=quantityWords(norm(original)).replace(/(\d+)(?:st|nd|rd|th)\b/g,'$1').replace(/\bfive thousand\b/gi,'5000').replace(/\bten percent\b/gi,'10%').replace(/\bfour percent\b/gi,'4%').replace(/\bone percent\b/gi,'1%').replace(/\bthirty percent\b/gi,'30%'),low=s.toLowerCase(),prior=norm(parts.slice(Math.max(0,i-2),i).join(' '));
  if(/:\s*$/.test(s)&&s.length<160)heading=s;
  const scope=norm(heading+' '+s);
  if(/\b(?:ist|wird|jedes|gezahlt|korko|neljä|prosenttia|maksetaan|talletuksen|jälkeen)\b/i.test(s))return fail('This product-language formulation is outside the current English validation scope. Do not translate factual product terms without a reviewed validation path.');
  const inConditionList=/only paid when|conditions|requirements|to qualify|all of the following/i.test(heading)&&!/not conditions|not requirements/i.test(heading);
  const asp=active.includes('asp-account')&&(/\bASP\b|bonus|deposit interest|first.home|monthly deposits?|saving year|opening year|accru/i.test(scope)||active.length===1);
  const ps=active.includes('ps-account')&&(/\bPS\b|deduct|withdraw|retirement|capital.gains|tax/i.test(scope)||active.length===1);
  if(/\b(?:you (?:are eligible|qualify)|your (?:ASP|PS) (?:balance|savings) (?:is|are|totals?|amounts? to))\b/i.test(s)&&!conditional(s))return fail('A general product rule does not establish personal eligibility or a personal balance.');
  const personalTokens=nums(s).filter(n=>!percentages(s).some(p=>n.start>=p.start&&n.end<=p.end)&&!/^if\b/i.test(s)&&!/(?:historical|on (?:1|first) Jan|today.*does|does.*today)/i.test(s)&&(
    /(?:your|my|our) (?:salary of |car fund of |current (?:account )?balance of )?$/i.test(s.slice(0,n.start))||
    /(?:you currently have|you have|your salary (?:is|of)|your (?:current )?(?:account )?(?:balance|savings) (?:is|of|are)|At|With) $/i.test(s.slice(0,n.start))||
    /\b(?:salary|monthly saving|current savings rate|current saving rate)\b/i.test(s)&&!percentages(s).some(p=>n.start>=p.start&&n.end<=p.end)&&![20,50,1500,31].includes(n.value)));
  const hasPersonalToken=(n:{start:number})=>personalTokens.some(p=>p.start===n.start);
  const maskedPersonal=()=>{let r=s;for(const n of nums(s).filter(n=>!hasPersonalToken(n)).reverse())r=r.slice(0,n.start)+'term'+r.slice(n.end);return r.replace(/term\s*%/g,'term');};
  const personalClause=/^(?:your|my|our)\b|^you (?:currently have|have|save)\b|^I (?:have moved|opened|will set)/i.test(s)||/\b(?:your|my|our) (?:salary|income|current account|car fund|saving rate|savings rate)\b|like your current savings rate|\byou (?:save|spend|have) \d|\byou earn \d+(?! ?%)(?: euros?| EUR)/i.test(s);
  if(personalTokens.length&&/entitled|qualif|eligible|bonus (?:is|will be) (?:secured|guaranteed|yours)|bonus is.*of your|savings.*(?:can be|may be) withdrawn/i.test(s))return fail('Personal income or balances cannot establish a product entitlement or unverified bonus calculation.');
  if(/(?:salary|income|balance|saved|savings).*(?:you are entitled|you qualify|you are eligible)|(?:your|you have).*(?:bonus is secured|bonus is guaranteed)/i.test(s)&&!/(?:not |does not|doesn't|cannot|can't)/i.test(s))return fail('Personal income and ordinary balances do not establish product entitlement.');
  if(asp){
   const deniesInterestHarm=/\b(?:does not|doesn't|will not|won't|not|never|cannot|can't) (?:mean (?:that )?(?:you )?|cause |make (?:you )?)?(?:lose|losing|stop|suspend|cancel|forfeit|miss out)/i.test(s);
   if(!deniesInterestHarm&&/(?:stop|paus|break|skip)/i.test(s)&&/(?:regular|deposit|1\s*%).*interest|interest.*(?:regular|deposit|1\s*%)/i.test(s)&&/miss out|lose|lost|suspend|not earn|won't earn|does not earn|stops? earning|earns? no interest|no interest/i.test(s))return fail('Deposit interest is earned on the savings held in the account. A pause in new deposits does not establish loss or suspension of interest on the existing balance.');
   if(!deniesInterestHarm&&/pause|break|skip|stop (?:paying|saving|deposit)/i.test(s)&&/account earns? no interest|no interest (?:is|will be) earned|balance stops? earning interest|forfeit (?:the )?interest|affect.*(?:loan|eligibility)|(?:loan|eligibility).*(?:harm|hurt|reduce|lost|lose)/i.test(s))return fail('A deposit break is permitted. Do not invent loss of existing-balance interest or harm to loan eligibility from the break.');
   if(/pause|break|skip/i.test(s)&&/reset.*deposit count|bank can close|not get the bonus|longer breaks are not allowed|pause for up to/i.test(s))return fail('Do not invent reset, closure, pause-duration restrictions or future bonus refusal from a permitted deposit break.');
   const retainsBonusRule=/\b(?:does not|doesn't|will not|won't) cancel\b[^.!?]{0,45}\bbonus rule\b/i.test(s);
   const negatesClaim=retainsBonusRule||/^(?:it is not true that|it is false that|the source does not say|the source doesn't say)|(?:bonus|interest) (?:does not|doesn't|cannot|can't|is not|isn't|will not|won't) (?:stop|pause|restart|resume)/i.test(s);
   if(/clos(?:e|ing|ure).*early|early clos(?:e|ing|ure)/i.test(s)&&/bonus|tax/i.test(s)&&!/other purpose|other use|another purpose|another reason|something else/i.test(s))return fail('Other-purpose closure causes loss of bonus and tax on deposit interest. Do not substitute any early closure, including a qualifying first-home purchase.');
   if(/(?:anyone|everyone|any person).*can open/i.test(s)&&!/first.time|first.home|subject to|other conditions/i.test(s))return fail('Age alone does not establish permission to open an ASP account. Preserve the first-time-home-saver and other opening conditions; minors require the stated guardian/contact route.');
   if(/close|clos(?:ing|ure)/i.test(s)&&/any time|anytime/i.test(s)&&/charged nothing|no charge|no tax|without charge/i.test(s))return fail('Other-use closure can cause deposit-interest tax and loss of bonus; do not promise cost-free closure at any time.');
   if(/bonus/i.test(s)&&/break|paus|skip|stop.*deposit|not depositing|resum/i.test(s)&&/stops?|pauses?|resum|starts? again|stays? intact|does not cancel|doesn't cancel|no.*lost|not.*lost/i.test(s)&&!negatesClaim)return fail('Do not turn permitted deposit breaks into a bonus pause/resume or no-loss assurance.');
   // Negation belongs to its proposition, never to another claim joined by a comma/and.
   for(const proposition of s.split(/[,;]|\s+(?:and|but)\s+/i)){
    if((/bonus/i.test(proposition)||/^\s*it\b/i.test(proposition)&&/bonus/i.test(s))&&/\b(?:paid|added|credited)\b/i.test(proposition)&&/yearly|annually|every year|each year|every December|each December|31 December/i.test(proposition)&&!/\b(?:not|never|isn't|is not|won't|will not) (?:paid|added|credited)(?: out)?/i.test(proposition))return fail('Bonus payment is not the annual deposit-interest payment.');
    if(/bonus/i.test(s)&&/without (?:needing |taking |using )?(?:an? )?(?:ASP |home )?loan|no loan (?:is )?(?:needed|required)|do not need (?:an? )?loan/i.test(proposition))return fail('Bonus payment requires the qualifying home purchase with an ASP or regular home loan. A negated annual-payment claim does not remove that loan condition.');
   }
   if(/1\s*%/i.test(s)&&/interest/i.test(s)&&/(?:(?:isn't|is not|not) paid (?:out )?(?:each|every) year|only once when you buy)/i.test(s))return fail('Deposit interest is annual interest on the savings, credited on 31 December; it is not deferred only until a home purchase.');
   if(/bonus/i.test(s)&&/(?:isn't|is not|not) affected/i.test(s)&&/clos/i.test(s)&&/other|another/i.test(s))return fail('Closing for another use loses the bonus; do not negate that condition.');
   if(/(?:several|multiple|many|more than one|more than 1) ASP accounts?/i.test(s)&&!/cannot|can't|not allowed|only one|only 1/i.test(s))return fail('Only one ASP account per person is supported.');
   if(/cancel|cancellation/i.test(s)&&/free|without charge|no charge/i.test(s)&&!/within 14 days/i.test(s))return fail('Free cancellation is the online/app fourteen-day cancellation right, not any-time cancellation.');
   if(/1[ ,]?500/i.test(s)&&/deposit|cap|limit/i.test(s)&&/each year|per year|annual|yearly/i.test(s))return fail('The deposit range is monthly, not an annual allowance.');
   if(!retainsBonusRule&&/bonus/i.test(s)&&/break|paus|stop.*(?:deposit|pay|sav)|skip.*(?:deposit|pay|month)/i.test(s)&&/lose|lost|forfeit|cancel|stays? intact/i.test(s))return fail('The source does not establish bonus forfeiture or a blanket no-loss assurance from a deposit break.');
   if(/ASP account/i.test(s)&&/at each bank|per bank|every bank/i.test(s)&&!/not |cannot|can't/i.test(s))return fail('Only one ASP account is supported, not one per bank.');
   if(/bonus/i.test(s)&&/no further conditions|no (?:other|more) conditions/i.test(s))return fail('Do not waive the required deposit, purchase and loan conditions.');
   if(/(?:two|2|several|multiple|more than (?:one|1)) ASP accounts?/i.test(s)&&!/not |cannot|can't/i.test(s))return fail('Only one ASP account per person is supported.');
   if(/(?:15|16|17) (?:year.old|years? old)/i.test(s)&&/open/i.test(s)&&/online|app|on their own/i.test(s))return fail('Minor opening requires contacting Nordea with a guardian.');
   if(/1 ?%/i.test(s)&&/interest/i.test(s)&&/added|credited|paid/i.test(s)&&/June|January|February|March|April|May|July|August|September|October|November/i.test(s))return fail('Deposit interest is credited on31December, not another stated month.');
   if(/bonus/i.test(s)&&/first (?:five|5) years? only/i.test(s))return fail('Bonus accrual covers the opening year plus the following five calendar years, not only five years.');
   if(/cancel/i.test(s)&&/branch/i.test(s)&&!/not|exclud/i.test(s))return fail('The reviewed fourteen-day cancellation right is for online/app opening, not branch opening.');
   const bonus=/bonus/i.test(scope),loan=/ASP.loan|ASP loan/i.test(scope),dep=/deposit|contribut/i.test(scope);
   if(/bonus[^,;.!?]{0,40}\b(?:pause|resum|suspend|restart|stop|cancel|lost|lose|forfeit)|\b(?:pause|resum|suspend|restart|stop|cancel)[^,;.!?]{0,35}bonus/i.test(s)&&!/\b(?:close|closing|another purpose|other purpose|something else|not |does not|doesn't|isn't|no monthly|not paid monthly)/i.test(s))return fail('The source permits deposit breaks; it does not define a monthly bonus pause, restart, cancellation or forfeiture rule.');
   if(/\b(?:no|not|never|won't|will not)\b[^.!?]{0,50}\bbonus\b[^.!?]{0,50}\b(?:lost|lose|forfeit)|\bbonus\b[^.!?]{0,50}\b(?:not|never|won't|will not)\b[^.!?]{0,30}\b(?:lost|lose|forfeit)/i.test(s)&&/break|paus|stop/i.test(s+' '+prior))return fail('Do not give an unconditional no-loss assurance about the bonus during a deposit break.');
   if(bonus&&/10\s*%|ten per ?cent/i.test(s)&&/(?:must|required|need|qualif|condition|eligible|only if)/i.test(scope)&&!/(?:not true that|false that)|not (?:a |an? )?(?:prerequisite|requirement|condition)|does not (?:apply|require)|not required|not a bonus/i.test(s))return fail('The ten-percent share is an ASP-loan application requirement, not an extra bonus condition for a regular home loan.');
   if(/bonus/i.test(s)&&/\b(?:paid|payable|receive|earn|yours|credited|collect)\b/i.test(s)&&/\b(?:once|when|after|as soon as|then)\b/i.test(s)&&/20|twenty|deposits?/i.test(s)&&!/\b(?:loan|purchase|buy|bought|home buying)\b/i.test(s)&&!/not (?:paid|payable)|not enough|alone|only one/i.test(s))return fail('Do not promise bonus payment on deposits alone. Keep the qualifying home purchase and ASP-or-regular-home-loan condition in the payment statement.');
   if(/bonus/i.test(s)&&/only[^.!?]{0,40}ASP loan|must (?:take|use)[^.!?]{0,20}ASP loan/i.test(s)&&!/regular|or (?:a )?home loan/i.test(s))return fail('The bonus permits an ASP loan or a regular home loan, not only an ASP loan.');
   if(/bonus|accru/i.test(s)&&/purchase year|year (?:you |of )?(?:buy|purchase)/i.test(s)&&/(?:start|begin|following|next five|accru|five years after)/i.test(s)&&!/not |different|rather than/i.test(s))return fail('Bonus accrual starts in the saving/opening year, not the purchase year.');
   if(/deposit/i.test(s)&&/must|need|required|only/i.test(s)&&/consecutive/i.test(s)&&!/not|needn't|do not|don't|no need/i.test(s))return fail('Approved monthly deposits need not be consecutive.');
   if(/bonus/i.test(s)&&/(?:paid|added|earn|receive)/i.test(s)&&/every month|each month|monthly/i.test(s)&&!/not |isn't|doesn't|not paid monthly|monthly deposits/i.test(s))return fail('Bonus interest is paid in arrears under the purchase and loan conditions, not with each monthly deposit.');
   if(/daughter|son|minor|15.to.17/i.test(s)&&/open|opening/i.test(s)&&/online|app/i.test(s)&&!/cannot|can't|not online|must call/i.test(s))return fail('Do not promise online opening for a minor; the source directs minors to call with a guardian.');
   if(/14 days to cancel/i.test(s)){accepted.push(original);continue;}
   if(/\b(?:your|my|our)\s+(?:\d[\d ,]*\s*(?:euro|EUR)?\s*)?(?:monthly )?(?:salary|income|saving|savings|deposit|balance)|\byou (?:currently have|have|save|earn)\b|\bI (?:have moved|opened|will set)/i.test(s)&&!conditional(s)&&!/bonus|annual deposit interest|regular deposit interest|deposit range|deposits? (?:run|range|of)|50|1[ ,]?500/i.test(s)){residual.push(original);continue;}

   // Each numeric token needs a locally stated role, not a number occurring elsewhere in the source.
   let recognized=true;
   for(const n of nums(s)){
    if(hasPersonalToken(n))continue;
    if(n.value===18&&/under 18s? (?:need to )?(?:call|contact).*guardian/i.test(s))continue;
    if(!table.some(f=>f.id.startsWith('asp-account:')&&f.value===n.value))return fail('An ASP figure is absent from the current reviewed fact table.');
    const near=s.slice(Math.max(0,n.start-65),Math.min(s.length,n.end+80));const after=s.slice(n.end);
    const pct=percentages(s).find(p=>n.start>=p.start&&n.end<=p.end);
    const local=s.slice(Math.max(s.lastIndexOf(',',n.start),s.lastIndexOf(';',n.start),s.lastIndexOf(' and ',n.start))+1,s.indexOf(',',n.end)>-1?s.indexOf(',',n.end):s.length);
    if(pct){
     if(pct.value===1&&/annual|year|deposit interest|regular.*interest|31 December|(?:interest|earning).*?(?:savings|balance|already saved)|(?:savings|balance).*?interest/i.test(local)&&!/bonus/i.test(local))continue;
     if(pct.value===4&&/bonus/i.test(local)&&!/ASP loans? need|savings requirement|percent savings/i.test(s))continue;
     if(pct.value===10&&(/not true that|false that/i.test(s)||/ASP.loan|ASP loan|savings.{0,25}(?:share|price)|share.{0,25}price/i.test(s))&&!(/bonus/i.test(heading)&&!/not|rather than|separate/i.test(s)))continue;
     if(pct.value===30&&/tax/i.test(near)&&/clos|other purpose|something else|another purpose/i.test(s+' '+prior))continue;
     if(pct.value===5&&/up to|combined|total/i.test(near)&&/interest/i.test(near))continue;
     recognized=false;break;
    }
    if(n.value===20&&/monthly deposits?|approved.*deposits?|deposit.*count|20-deposit|20 months|20 deposits|20 deposit/i.test(near))continue;
    if([50,1500].includes(n.value)&&/deposit|monthly|opening|each month|a month/i.test(near)&&!/income|salary|bonus rate/i.test(near))continue;
    if(n.value===14&&/cancel|days/i.test(near))continue;
    if(n.value===15&&/age|aged|years? (?:old|or older)|from|15 or older/i.test(near))continue;
    if(n.value===18&&/under 18s? (?:need to )?(?:call|contact).*guardian/i.test(s))continue;
    if([16,17].includes(n.value)&&/minor|guardian|age|aged/i.test(near))continue;
    if(n.value===5&&/calendar years?|following.*years?|next.*years?|opening year\s*\+\s*5\s*years?/i.test(near))continue;
    if(n.value===31&&/December/i.test(after))continue;
    if(n.value===1&&/ASP account/i.test(after))continue;
    if(n.value===1&&/June/i.test(after))continue;
    if(n.value===2026&&/June|reform|upper age/i.test(near))continue;
    recognized=false;break;
   }
   if(!recognized)return fail('An ASP figure is unsupported or assigned to the wrong product role: '+s);
   if(personalTokens.length){residual.push(maskedPersonal());continue;}
   if(nums(s).length&&/interest|deposits?/i.test(s)&&!/\b(?:you (?:have|hold|own|qualify)|your (?:salary|income|savings rate|saving rate|balance is|balance of))\b/i.test(s)){accepted.push(original);continue;}
   if(/1\s*%/i.test(s)&&/interest|earning/i.test(s)&&/on (?:the |your |what is )?(?:savings|balance|already saved)/i.test(s)&&!personalTokens.length){accepted.push(original);continue;}
   if(personalClause&&!/^(?:you earn) \d[.,\d]* ?% (?:annual |regular )?(?:deposit )?interest/i.test(s)&&!/\b(?:14 days|20 deposits|20 months)\b/i.test(s)){residual.push(original);continue;}
   if(nums(s).length&&(!PERSONAL.test(s)||inConditionList||/bonus|annual deposit interest|regular deposit interest/i.test(s))){accepted.push(original);continue;}
   if(nums(s).length&&conditional(s)){accepted.push(original);continue;}
  }
  if(ps){
   if(/(?:you (?:do not|don't) have|since (?:we|you) (?:do not|don't) have|we (?:do not|don't) have)[^.!?]{0,25}PS account/i.test(s)&&!/cannot (?:tell|verify)|can't (?:tell|verify)|unknown|not (?:shown|provided|established)/i.test(s))return fail('No supplied PS account evidence does not establish that the customer has no PS account.');
   if(/withdraw/i.test(s)&&/2027[^.!?]{0,25}(?:or later|onward|onwards)|from 2027 onward/i.test(s))return fail('The stated special withdrawal window is2027or2028, not2027oranylaterdate.');
   if(/only (?:withdraw|take out) the (?:part|portion|amount) above|cannot withdraw anything.*any circumstances/i.test(s))return fail('Do not invent an excess-only withdrawal or absolute early-withdrawal ban.');
   if(/(?:if you |you can |could |may )open (?:a |an? )?PS account/i.test(s)&&/withdraw|qualif|limit|balance/i.test(s))return fail('New PS account opening is not a verified way to qualify. The rule tests total PS savings on1January2027and limits the special withdrawal to2027or2028.');
   if(/submit|request|apply/i.test(s)&&/withdraw/i.test(s)&&/Nordea.?s? app|online|mobile/i.test(s))return fail('The source does not establish an app submission workflow for PS withdrawal.');
   if(/withdraw/i.test(s)&&/any amount/i.test(s)&&/illness|divorce|reason/i.test(s))return fail('Special reasons do not establish an unrestricted any-amount withdrawal entitlement.');
   if(/deduct/i.test(s)&&/2027|2028/i.test(s)&&!/ends?|ended|no longer|not deductible|not tax.deductible|isn't tax.deductible|won't be tax.deductible|cannot|can't|won't|will not|do not|does not|separate|different|balance|withdraw|lump.sum/i.test(s))return fail('The payment deduction applies through2026only; it is removed from2027.');
   if(/limit|figure|test/i.test(s)&&/both|alike/i.test(s)&&/payments?|deduct/i.test(s)&&/lump|withdraw/i.test(s)&&!/not |different|distinct|separate/i.test(s))return fail('The payment deduction cap and historical-balance withdrawal ceiling are separate tests.');
   if(/tax (?:on|only on) the (?:gain|return)/i.test(s)&&!/deposit[^.!?]{0,50}after|funds[^.!?]{0,50}after|payments[^.!?]{0,50}after|from 2027/i.test(s))return fail('Historical PS capital and return are taxable. Return-only taxation is for funds deposited after the start of 2027.');
   if(/deduct/i.test(s)&&/(?:deduct|available|deductible|eligible|continues?|until|through|end of)[^.!?]{0,35}(?:2027|2028)/i.test(s)&&!/not |no longer|not deductible|ends? on|deduction ends|deduct[^.!?]{0,50}from 2027.*end|end(?:s|ed)? (?:on |from )?1 January/i.test(s))return fail('Eligible payment deduction ends after 2026, not after 2027.');
   if(/deduct/i.test(s)&&/(?:total (?:PS )?savings|balance)/i.test(s)&&/must not exceed|must be|has to be|needs? to be|below|under/i.test(s))return fail('Do not attach the historical balance ceiling to the payment deduction.');
   if(/(?:only|just) (?:the )?(?:part|portion|amount) above/i.test(s)&&/tax/i.test(s))return fail('Do not describe only the excess as taxable.');
   if(/otherwise/i.test(s)&&/(?:normal|ordinary|standard|usual) (?:tax |taxation |rate)|(?:normal|ordinary|standard) (?:tax|rate)/i.test(s))return fail('An otherwise conclusion cannot promise ordinary tax for above-threshold early withdrawal.');
   if(/retirement age/i.test(s)&&/payouts?|withdrawals?/i.test(s)&&/underway|already started|started|begun/i.test(s)&&!/cannot|can't|not available|isn't available|is not available|exclud|not eligible|does not|doesn't|not meant|not for|not.*require/i.test(s))return fail('Retirement age reached together with started planned payouts is an exclusion, not the target group.');
   if(/withdraw/i.test(s)&&/(?:only (?:in |during )?2027|withdraw[^.!?]{0,30}only[^.!?]{0,15}2027|not 2028)/i.test(s)&&!/not only|isn't only|not limited/i.test(s))return fail('The special withdrawal window is 2027 or 2028.');
   if(/same|equivalent|one (?:limit|cap|test)/i.test(s)&&/deduct/i.test(s)&&/withdraw|balance/i.test(s)&&!/not |separate|different|distinct/i.test(s))return fail('The contribution deduction and historical balance withdrawal test are distinct rules even though their amounts match.');
   if(/(?:same|difference|different)/i.test(request)&&/withdraw|balance|PS/i.test(request)&&/^yes\b/i.test(s)&&/deduct/i.test(s))return fail('Do not equate the deduction cap with the historical balance withdrawal condition. Explain both roles.');
   if(/retirement age/i.test(s)&&/on its own|alone/i.test(s)&&/rules? out|exclude|not available|cannot|can't/i.test(s)&&!/not |does not|doesn't/i.test(s))return fail('Retirement age alone is not the stated exclusion; planned withdrawals must also have started.');
   if(/retirement age/i.test(s)&&/payout|withdrawal/i.test(s)&&/able to|may|can|must|need|required/i.test(s)&&/start|begun|began/i.test(s)&&!/cannot|can't|not available|not.*covered|doesn't say|does not say|can't tell|cannot tell|exclu/i.test(s))return fail('Do not invert the retirement-and-started-withdrawals exclusion into permission or a requirement.');
   const taxFree=/tax.free|free of tax|no tax|untaxed/i.test(s)&&!/not tax.free|isn't tax.free|not a tax.free|not guaranteed.*tax.free|cannot.*tax.free|can't.*tax.free/i.test(s);
   if(taxFree&&/withdraw|payment|lump.sum|money|savings/i.test(s))return fail('The special withdrawal is not tax-free. Normal tax remains distinct from avoiding the higher rate.');
   if(/(?:without|no|none|not have|absence of|lack of)[^.!?]{0,45}(?:reason|exception|circumstances)/i.test(s)&&/normal|standard|ordinary|usual|30\s*(?:%|percent)/i.test(s)&&!/higher|not |cannot|can't|unknown|does not (?:mean|establish)/i.test(s))return fail('Above-threshold premature withdrawal avoids the higher tax only for the stated special reasons. Do not promise ordinary tax without one.');
   if(/(?:excess|amount (?:above|over)|portion (?:above|over))/i.test(s)&&/only|just|tax/i.test(s)&&!/not |isn't|does not/i.test(s))return fail('The source does not say only the balance above the threshold is taxed.');
   if(/deduct|contribut/i.test(s)&&/balance|historic|total.*savings/i.test(s)&&/depend|qualif|eligible|must|requires?|test|condition/i.test(s)&&!/not |doesn't|do not|does not|separate|different|unrelated|not the same/i.test(s))return fail('The historical balance condition belongs to withdrawal, not the contribution deduction.');
   if(/retirement age/i.test(s)&&/withdrawals?.*(?:start|begun)|(?:start|begun).*withdrawals?/i.test(s)){
    if(/\bor\b/i.test(s)&&/cannot|can't|not available|excluded|ineligible/i.test(s))return fail('The retirement exclusion needs retirement age reached AND planned withdrawals started, not either alone.');
    if(/must|need to|required|only if/i.test(s)&&!/not |exclusion|cannot|can't|not available/i.test(s))return fail('Retirement reached and planned withdrawals started are an exclusion, not requirements for the special lump sum.');
   }
   if(personalClause&&!/deduct|withdraw|retirement|tax/i.test(s)){residual.push(original);continue;}
   let recognized=true;
   for(const n of nums(s)){
    if(hasPersonalToken(n))continue;
    if(!table.some(f=>f.id.startsWith('ps-account:')&&f.value===n.value)&&!(n.value===28&&/2027-28/.test(s)))return fail('A PS figure is absent from the current reviewed fact table.');
    const near=s.slice(Math.max(0,n.start-90),Math.min(s.length,n.end+100)),after=s.slice(n.end);const pct=percentages(s).find(p=>n.start>=p.start&&n.end<=p.end);
    if(pct){if(pct.value===30&&/tax|capital.gains/i.test(near))continue;recognized=false;break;}
    if(n.value===5000&&/deduct|contribut|payment|balance|savings|threshold|withdraw|total|mentioned|above|higher rate|money held|PS account/i.test(near))continue;
    if([2026,2027,2028].includes(n.value)&&/deduct|contribut|payment|withdraw|balance|savings|Jan(?:uary)?|tax|year|right|gone/i.test(near))continue;
    if(n.value===1&&/Jan(?:uary)?/i.test(after))continue;
    if(n.value===28&&/2027-28/.test(near))continue;
    recognized=false;break;
   }
   if(!recognized)return fail('A PS figure is unsupported or assigned to an unknown role.');
   if(personalTokens.length){residual.push(maskedPersonal());continue;}
   if(personalClause&&!/^(?:you earn) \d[.,\d]* ?% (?:annual |regular )?(?:deposit )?interest/i.test(s)&&!/\b(?:14 days|20 deposits|20 months)\b/i.test(s)){residual.push(original);continue;}
   if(nums(s).length&&(!PERSONAL.test(s)||inConditionList||/bonus|annual deposit interest|regular deposit interest/i.test(s))){accepted.push(original);continue;}
   if(nums(s).length&&conditional(s)){accepted.push(original);continue;}
  }
  // A product source cannot establish a customer's eligibility, ownership, balance or income.
  if(PERSONAL.test(s)&&!conditional(s)&&!inConditionList&&!/\b(?:bonus|annual deposit interest|regular deposit interest|ASP loan application|apply for an ASP loan)\b/i.test(s)){
   if(/\b(?:you (?:are eligible|qualify|have an? (?:ASP|PS) account)|your (?:ASP|PS) (?:balance|savings) (?:is|are|totals?|amounts? to))\b/i.test(s))return fail('A general product rule does not establish personal eligibility, account ownership or a personal balance.');
   residual.push(original);continue;
  }
  residual.push(original);
 }
 return {ok:true,personalText:residual.join('\n'),productClauses:accepted};
}
