/** Bounded goal-field write validation. The proposal is never its own evidence.
 * This parses explicit goal-changing clauses only. Unsupported prose asks; it does not
 * turn another clause's amount/date into goal intent. No legacy data is rewritten. */
export interface GoalFieldEvidence {quote:string;precision:'exact'|'month-end'|'year-end';kind:'customer-field-evidence';messageId?:string;conversationId?:string;normalization?:'end-of-named-month'|'end-of-named-year'}
export interface GoalWriteCheck {amount?:number;date?:string;amountEvidence?:GoalFieldEvidence;dateEvidence?:GoalFieldEvidence;question?:string}
const M=['january','february','march','april','may','june','july','august','september','october','november','december'];
const N='(?:\\d{1,3}(?:[, \\u00a0\\u202f]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
const numeric=(s:string)=>Number(/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)?s.replace(/,/g,''):s.replace(/[ \u00a0\u202f]/g,'').replace(',','.'));
const end=(year:number,month:number)=>new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
const exactDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
export function goalNameInText(title:string,text:string):boolean {
 const normal=(s:string)=>s.toLowerCase().replace(/[\p{Pd}_]/gu,' ').replace(/[^\p{L}\p{N} ]/gu,' ');
 const t=normal(text),words=normal(title).split(/\s+/).filter(w=>w.length>=3&&!['new','goal','fund','trip','target','saving','savings','the','for'].includes(w));
 return words.some(w=>t.split(/\s+/).some(x=>x===w||x.startsWith(w)&&x.length-w.length<=4));
}
export function checkGoalWrite(text:string,proposal:{amount?:unknown;date?:unknown},mode:'add'|'update',today:string,goalTitle?:string):GoalWriteCheck {
 if(/\b(?:dollars?|USD|GBP|pounds?|kronor|krona|francs?|SEK|NOK|rupees?|PKR|yen|JPY)\b|[$£¥]/iu.test(text))return {question:'The amount is not clearly in euros. Which currency should this goal use? I have not saved or converted it.'};
 if(mode==='add'&&[...text.matchAll(/\bfor\b/giu)].length>1&&[...text.matchAll(/\d[\d \u00a0\u202f,.]*\s*(?:euros?|EUR|€)?\s+for\b/giu)].length>1)return {question:'You mentioned more than one saving goal. Which purpose should I save first, with its own amount and deadline? Nothing has been saved yet.'};
 // Affirmative clauses own write authority, not a matching model-proposed value.
 // Only an explicit leading goal instruction can lend authority across a colon.
 // The continuation ends at the next sentence; unrelated earlier balances never enter it.
 if(mode==='add'&&/^(?:please\s+)?(?:(?:save|add|create|set(?: up)?)\s+(?:a\s+)?(?:new\s+)?goal|new goal)\s*:[^.!?;]*\b(?:do not|don't|never)\s+(?:save|create|add|store|remember)\b/iu.test(text))return {question:'I have not changed or saved your goal.'};
 const parseText=mode==='add'?text.replace(/^(?:please\s+)?(?:(?:save|add|create|set(?: up)?)\s+(?:a\s+)?(?:new\s+)?goal|new goal)\s*:\s*([^.!?;:]+)/iu,(_all,body)=>'Create a goal '+body):text;
 const parts=parseText.split(/(?:,\s*|\(\s*)(?=(?:my|our|his|her|their|the|I|we|he|she|they)\s)|(?<!\d)[.!?;:]|[.!?;:](?!\d)|\b(?:and|but|so)\b(?=\s+(?:I |my |please |never |do not |don't ))/iu).map(s=>s.trim()).filter(Boolean).map(c=>c.replace(/^(?:please\s+)?don.t forget to (?:note|remember) that\s+/iu,''));
 const positive=(c:string)=>/^(?:please\s+)?(?:(?:(?:I\s+(?:want(?:\s+to)?|would like to|am going to|plan to|am)|I[’']m)\s+)?(?:save|saving|set(?: up)?|create|add|put|change|update|move|raise|increase|reduce|make)\b|I(?:’d|'d) like\b|I want\b|Haluan\b|Muuta\b|Vaihda\b)/iu.test(c)&&!/\b(?:not|never|no longer|skip|stop|cancel|forget|if|maybe|perhaps|hypothetical)\b|\b(?:älä|en|ei)\b/iu.test(c);
 const refused=parts.some(c=>/^(?:please\s+)?(?:do not|don.t|never|skip|stop|cancel)\b[^.!?]{0,45}\b(?:save|saving|add|adding|create|creating|change|changing|update|updating|goal|cabinet)\b|\b(?:no longer|don.t|do not)\s+want\b(?!\s+to\s+forget)/iu.test(c));
 if(refused)return {question:'I have not changed or saved your goal.'};
 if(/\b(?:what if|hypothetical|if I|maybe|perhaps|would)\b/iu.test(text))return {question:'I am treating this as a hypothetical, not an instruction to change your goal. Nothing changed. Would you like to compare the proposed plan?'};
 const goalClauses=parts.filter(positive);
 const namedGoalClauses=mode==='update'&&goalTitle?goalClauses.filter(c=>goalNameInText(goalTitle,c)):goalClauses;
 const result:GoalWriteCheck={};
 if(mode==='update'&&proposal.date===undefined&&namedGoalClauses.some(c=>/\b(?:deadline|by|until|end of|20\d{2})\b|mennessä/iu.test(c)))return {question:'You mentioned a deadline change. What exact date or month and year should I use? Nothing changed.'};
 const amount=typeof proposal.amount==='number'?proposal.amount:NaN;
 if(amount>0&&Number.isFinite(amount)){
  const candidates:{value:number;quote:string}[]=[];
  for(const c of namedGoalClauses){
   // The amount is attached to a saving instruction or a target-change verb, not
   // arbitrary numeric membership or a word such as "month" elsewhere.
   const re=new RegExp('(?:\\b(?:save(?: up)?|saving(?: up)?|target(?: to| of)?|goal(?: of)?|fund of|deposit of)|säästää|säästän|tavoite)\\s*('+N+')(?=\\s*(?:euros?|euroa|€|for|by|toward|in|$)|\\s)|\\b(?:change|move|raise|increase|reduce)\\b[^,;.!?]{0,70}?\\bto\\s*('+N+')(?=\\s|$)','giu');
   for(const m of c.matchAll(re)){
    const token=m[1]||m[2];const after=c.slice(m.index!+m[0].length);
    if(/^[ \u00a0\u202f,.]*\d/.test(after)||/^\s*(?:euros?|euroa|€)?\s*(?:a |per |each |every |\/)?(?:monthly|weekly|yearly|months?|weeks?|years?|kuukaudessa|kuussa|viikossa|vuodessa|kk)\b/iu.test(after))continue;
    if(/\b(?:earn|salary|income|got paid|pension|job|wage|not|never|maybe|hypothetical|if|would|could)\b|ehkä|\bei\b/iu.test(c))continue;
    candidates.push({value:numeric(token),quote:m[0]});
   }
   if(mode==='add'&&/^Create a goal /u.test(c)&&!candidates.some(x=>c.includes(x.quote))){
    const bare=new RegExp('^Create a goal (?:[^\\d]{0,50}?)?('+N+')(?=\\s+(?:euros?|for|by)\\b|\\s*[,])','iu').exec(c);
    if(bare&&!/^\s*(?:euros?\s*)?(?:a |per |each |every )?(?:month|week|year)\b/iu.test(c.slice(bare[0].length)))candidates.push({value:numeric(bare[1]),quote:bare[0]});
   }
   if(!candidates.some(x=>c.includes(x.quote))&&(mode==='add'||/\b(?:should be|make|want|target|change|move|raise|increase|reduce|set|muuta|vaihda)\b/iu.test(c))){
    const currency=new RegExp('(?<![\\d.,])('+N+')\\s*(?:euros?|euroa|euroon|EUR|€)(?![\\p{L}])','giu');
    for(const m of c.matchAll(currency)){
     const after=c.slice(m.index!+m[0].length);
     if(/\d[ \u00a0\u202f,.]*$/.test(c.slice(0,m.index))||/\b(?:earn|salary|income|got paid|pension|job|wage|not|never|maybe|hypothetical|if|would|could)\b|ehkä|\bei\b/iu.test(c)||/^\s*(?:a |per |each |every |\/)?(?:monthly|weekly|yearly|months?|weeks?|years?|kuukaudessa|kuussa|viikossa|vuodessa|kk)\b/iu.test(after))continue;
     candidates.push({value:numeric(m[1]),quote:m[0]});
    }
   }
  }
  if(candidates.length===1&&candidates[0].value===amount){result.amount=amount;result.amountEvidence={quote:candidates[0].quote,precision:'exact',kind:'customer-field-evidence'};}
 }
 if(proposal.date!==undefined){
  const candidates:{value:string;quote:string;precision:'exact'|'month-end'|'year-end'}[]=[];
  for(const c of namedGoalClauses){
   if(/\b(?:earn|salary|income|got paid|pension|job|wage|not|never|maybe|hypothetical|if|would|could)\b|ehkä|\bei\b/iu.test(c))continue;
   for(const m of c.matchAll(/\bby(?: the end of)?\s+(20\d{2})(?![-\d])\b/giu))candidates.push({value:`${m[1]}-12-31`,quote:m[0],precision:'year-end'});
   for(const m of c.matchAll(/\b(?:by|until|deadline(?: to| is)?|target date(?: to| is)?|(?:move|push)[^.!?]{0,45}?to)\s+(\d{4}-\d{2}-\d{2})\b/giu))if(exactDate(m[1]))candidates.push({value:m[1],quote:m[0],precision:'exact'});
   const monthDay=new RegExp('\\bby\\s+('+M.join('|')+')\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(20\\d{2})\\b','giu');
   for(const m of c.matchAll(monthDay)){const value=m[3]+'-'+String(M.indexOf(m[1].toLowerCase())+1).padStart(2,'0')+'-'+m[2].padStart(2,'0');if(exactDate(value))candidates.push({value,quote:m[0],precision:'exact'});}
   const finnishMonths=['tammikuuhun','helmikuuhun','maaliskuuhun','huhtikuuhun','toukokuuhun','kesäkuuhun','heinäkuuhun','elokuuhun','syyskuuhun','lokakuuhun','marraskuuhun','joulukuuhun'];
   const fiRe=new RegExp('('+finnishMonths.join('|')+')\\s+(20\\d{2})\\s+mennessä','giu');
   for(const m of c.matchAll(fiRe))candidates.push({value:end(Number(m[2]),finnishMonths.indexOf(m[1].toLowerCase())+1),quote:m[0],precision:'month-end'});
   const re=new RegExp('\\b(?:by(?: the end of)?|until|deadline(?: to| is)?|target date(?: to| is)?|(?:move|push)[^.!?]{0,45}?to)\\s+('+M.join('|')+')\\s+(20\\d{2})\\b','giu');
   for(const m of c.matchAll(re))candidates.push({value:end(Number(m[2]),M.indexOf(m[1].toLowerCase())+1),quote:m[0],precision:'month-end'});
  }
  if(candidates.length===1&&candidates[0].value===proposal.date){result.date=candidates[0].value;result.dateEvidence={quote:candidates[0].quote,precision:candidates[0].precision,kind:'customer-field-evidence',...(candidates[0].precision==='month-end'?{normalization:'end-of-named-month' as const}:candidates[0].precision==='year-end'?{normalization:'end-of-named-year' as const}:{})};}
 }
 if(!exactDate(proposal.date as string)&&proposal.date!==undefined)return {...result,question:'What exact date or month and year should I use? Nothing changed.'};
 if(mode==='add'&&(!result.amount||!result.date))result.question=!result.amount?'What total amount do you want to save for this goal? I have not saved the proposed target.':'What deadline should I save for this goal? Please give a date or a month and year. I have not saved the proposed target.';
 else if(mode==='update'&&!result.amount&&!result.date)result.question='Which goal amount or deadline should I change? Please give the new amount or a date/month and year. Nothing changed.';
 if(result.question&&/\b\d[\d ,]*\s*(?:euros?|€)?\s*(?:a |per |each |every )?(?:month|week)|\d[^.!?]{0,15}(?:kuukaudessa|kuussa|viikossa)/iu.test(text))result.question='I understand this as a regular saving amount, not a total target. What total amount and deadline would you like for the goal? I have not saved a target yet.';
 if(result.question&&result.amount)result.question=`I have ${result.amount} EUR as the total for this goal. What deadline should I use? Please give a date or month and year. Nothing has been saved yet.`;
 if(result.question&&result.date&&!result.amount)result.question=`I have ${result.date} as the deadline${result.dateEvidence?.normalization?' ('+result.dateEvidence.normalization.replace(/-/g,' ')+')':''}. What total amount is the goal? Nothing has been saved yet.`;
 return result;
}
