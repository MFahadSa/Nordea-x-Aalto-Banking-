export interface GroundingSource {label:string;text:string}
const parse=(s:string)=>Number(s.replace(/[ \u00a0\u202f]/g,'').replace(/,(?=\d{3}(?:\D|$))/g,'').replace(',','.'));
const values=(s:string)=>[...s.matchAll(/\d{1,3}(?:[ \u00a0\u202f,]\d{3})+(?:[,.]\d+)?|\d+(?:[,.]\d+)?/g)].map(m=>parse(m[0]));
const significant=(s:string)=>new Set((s.toLowerCase().match(/[\p{L}]{3,}/gu)||[]).filter(w=>!['the','and','for','you','your','have','has','that','this','with','from','are','was','will','would','could','about','euros','euro','eur','month','months','year','years','saved','saving','amount','put','putting','into','per','after','before','starts','start','is','over','three','more','each','month'].includes(w)));
/** A source-specific check for money, dates and durations. A numeral in an unrelated
 * source, an opaque ID, or implicit arithmetic cannot authorize a financial claim. */
export function financialGroundingProblem(reply:string,sources:GroundingSource[],request=''):string|null {
 // A structured ISO date also supplies its exact human month name. Do not infer
 // a date from free text or another source; expansion stays on that same source.
 sources=sources.map(s=>({...s,text:s.text.replace(/"date"\s*:\s*"(20\d{2})-(\d{2})-(\d{2})"/g,(m,y,mo,d)=>{const dt=new Date(`${y}-${mo}-${d}T12:00:00Z`);return !Number.isNaN(+dt)&&dt.toISOString().slice(0,10)===`${y}-${mo}-${d}`?m+' '+Number(d)+' '+['January','February','March','April','May','June','July','August','September','October','November','December'][Number(mo)-1]+' '+y+' '+Number(d)+'.'+Number(mo)+'.'+y:m;})}));
 for(const clause of reply.replace(/^\s*\d{1,2}[.)]\s+/gm,'').split(/(?<=[.!?])\s+|\n/)){
  const money=/\b(?:euros?|eur)\b|€|\b(?:loan|debt|balance|budget|salary|pension|cost|saved|target|laina|velka|saldo|maksaa)\b/iu.test(clause);
  const duration=/\b(?:months?|years?|days?|weeks?|kuukau|vuot|päiv|viik)/iu.test(clause);
  const date=/\b20\d{2}\b/.test(clause);
  if(!money&&!duration&&!date&&!/\d/.test(clause))continue;
  const nums=values(clause);if(!nums.length)continue;
  const words=significant(clause);
  const months=clause.match(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/gi)||[];
  const scopedSources=sources.filter(s=>!(s.label==='Checked product background'&&/Fictional partner/.test(s.text)&&(/\b(?:your|my|our|current|existing)\b/iu.test(clause)||/\b(?:loan|debt|balance|salary|pension|savings|goal|gym|phone)\b/iu.test(clause))));
  let candidates=scopedSources.filter(s=>{
   const terms=significant(s.label+' '+s.text);
   return [...words].some(w=>terms.has(w)) || /^(?:it|that|this)\b/i.test(clause.trim()) && [...significant(request)].some(w=>terms.has(w));
  });
  const requestWords=significant(request);
  const requestMatched=scopedSources.filter(s=>{const terms=significant(s.label+' '+s.text);return [...requestWords].some(w=>terms.has(w));});
  if(!candidates.length || /^(?:per year|over|at|raising|after|that|it|you)/i.test(clause.trim()))candidates=requestMatched;
  const derived:number[]=[];
  for(const source of candidates){
   const v=values(source.text);const monthly=/a month|per month|monthly|kuukaudessa/iu.test(source.text);
   if(monthly&&/year|annual|vuodessa/iu.test(request+' '+clause))for(const x of v)derived.push(x*12);
   const count=/(\d+)\s*months?/i.exec(request);if(monthly&&count)for(const x of v)derived.push(x*Number(count[1]));
   if(/weeks?.*(?:target|reach)|(?:target|reach).*weeks?/iu.test(request)&&/a week|per week|weekly/iu.test(source.text)){
    const rate=/(\d+) a week/i.exec(source.text),target=/target\s+([\d ]+)/i.exec(source.text);if(rate&&target)derived.push(parse(target[1])/parse(rate[1]));
   }
   if(/raising|adds|more each|more a year/i.test(clause)&&monthly){
    const target=values(request)[0],rate=/(\d+) a month/i.exec(source.text);if(target&&rate){const delta=target-Number(rate[1]);derived.push(delta,delta*12);}
   }
  }
  // Sequential remainder uses the request's income and the specifically named costs.
  if(/left|leaves|after rent/i.test(request+' '+clause)){
   const income=values(request)[0];const costs=candidates.filter((s,i,a)=>s.label!=='Customer request'&&a.findIndex(x=>x.label===s.label)===i).filter(s=>[...requestWords].some(w=>significant(s.label).has(w))).map(s=>/(\d+) a month/i.exec(s.text)).filter(Boolean).map(m=>Number(m![1]));
   if(income&&costs.length){derived.push(...costs.map(c=>income-c));let left=income;for(const cost of costs){left-=cost;derived.push(left);}}
  }
  for(const month of months)if(month.toLowerCase()==='may'&&!/\bMay\b/u.test(clause))continue;else if(!candidates.some(s=>s.text.toLowerCase().includes(month.toLowerCase())))return 'The stated calendar month is not supplied for this source. Do not infer a month from a year or another goal date.';
  for(const n of nums){
   if(derived.some(v=>Math.abs(v-n)<0.011))continue;
   if(candidates.some(s=>values(s.text).some(v=>Math.abs(v-n)<0.011)))continue;
   if(/per year|a year|annually|vuodessa/iu.test(clause+' '+request)&&candidates.some(s=>/a month|per month|monthly|kuukaudessa/iu.test(s.text)&&values(s.text).some(v=>Math.abs(v*12-n)<0.011)))continue;
   // Explicit arithmetic is permitted only when its operands occur together in one
   // source or in the customer's actual request. No arbitrary pairwise derivation.
   const equation=/(\d[\d ,.]*?)\s*([+−\-×x*÷/])\s*(\d[\d ,.]*?)\s*=\s*(\d[\d ,.]*)(?:\b|$)/g;
   let proven=false;
   for(const m of clause.matchAll(equation)){
    const a=parse(m[1]),b=parse(m[3]),r=parse(m[4]);const op=m[2];
    const expected=op==='+'?a+b:['−','-'].includes(op)?a-b:['×','x','*'].includes(op)?a*b:b?a/b:NaN;
    if(Math.abs(expected-r)>0.011)continue;
    if(!sources.some(s=>{const v=values(s.text);return v.includes(a)&&(v.includes(b)||b===12&&/a month|per month|monthly/i.test(s.text))}))continue;
    if([a,b,r].includes(n))proven=true;
   }
   if(!proven)return 'The financial figure, date or duration is not tied to a relevant supplied source or an explicit supported calculation. Do not borrow a numeral from another field or derive arbitrary numbers. Use the labelled current source or leave this claim out.';
  }
 }
 return null;
}
