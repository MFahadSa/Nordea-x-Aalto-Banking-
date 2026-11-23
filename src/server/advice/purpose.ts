/** Purpose precedes topic. A topic mention is not permission to advertise or replace a task. */
export type Purpose = 'banking' | 'plan' | 'information' | 'conversation';
export function purposeOf(text: string): Purpose {
  const t = text.trim();
  if (/\b(balance|transactions?|payments?|refund|returned|headphones|spent|spend|spending|progress|on track|how .*savings .*going)\b/i.test(t)
    || /\b(move|transfer)\b[^.?!]{0,35}\b(money|euros?|savings|account)\b/i.test(t)) return 'banking';
  if (/\b(put|set|save|saving|aside|goal|plan|remember|forget|remove|delete)\b/i.test(t)
    && (/\b(each|every|a|per) month\b|\bmonthly\b|\bby (?:20\d\d|next|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(t)
      || /\b(save|remember|forget|remove|delete)\b[^.?!]{0,30}\b(this|that|it|goal|salary|note)\b/i.test(t))) return 'plan';
  return /\?|\b(how|what|why|when|can|could|does|is|are|worth|explain|tell me)\b/i.test(t) ? 'information' : 'conversation';
}

/** A refusal is not the idiom 'never remember to save money'. */
export function refusesStorage(text: string): boolean {
  // Privacy is a high-stakes boundary. Prefer withholding automatic retention when
  // negated recording language is ambiguous, while leaving saving-money idioms alone.
  const t = text.replace(/[’]/g, "'");
  if (/\boff the record\b|\bkeep this private\b|(?:^|\s)älä\s+(?:tallenna|kirjaa|muista)|\bei tarvitse (?:tallentaa|kirjata)/i.test(t)) return true;
  const clauses=t.split(/[.!?;,]|\bbut\b/i);
  const recording=/\b(?:sav(?:e|ed|ing)|stor(?:e|ed|ing)|remember(?:ed|ing)?|not(?:e|ed|ing)|log(?:ged|ging)?|record(?:ed|ing)?|keep|kept|writ(?:e|ing|ten)|add(?:ed|ing)?\s+.{0,18}notes?)\b/i;
  const negative=/\b(?:don't|do not|never|no need|didn't|wouldn't|rather.{0,10}not|not want|not.{0,12}(?:saved|stored|noted|recorded|kept))\b/i;
  return clauses.some(clause=>{
    // Only discard clearly financial saving, not a memory request about money.
    const c=clause.replace(/\b(?:remember|forget)\s+to\s+save\s+(?:money|euros?)\b/gi,'').replace(/\bsave\s+(?:money|euros?)\b/gi,'');
    if (negative.test(c) && recording.test(c)) return true;
    return /\b(?:don't|do not|never)\s+want\b.{0,35}\b(?:saved|stored|noted|recorded|kept)\b/i.test(c);
  });
}

/** Only an explicit positive service request may create a partner card. */
export function declinesPartner(text: string, partner: string): boolean {
  const terms: Record<string, string> = { movers: 'movers?|moving compan(?:y|ies)|packing help|moving van', homes: 'homes?|houses?|flats?|listings?', energy: 'energy|electricity|offers?', insure: 'insurance|cover', planner: 'planner|planning|offers?' };
  if (partner === 'movers') {
    const objects=[/\bmovers?\b|\bmoving compan(?:y|ies)\b|\bmuutto\w*/i,/\bpacking help\b|\bpakkausapu\w*/i,/\bmoving van\b/i];
    const states: (boolean | undefined)[] = objects.map(()=>undefined);
    const clauses=text.replace(/[’]/g,"'").split(/[.!?;,]|\b(?:but|however|instead|although|though|and)\b/i);
    let last:number[]=[];
    for(const raw of clauses){const c=raw.trim();if(!c)continue;
      const matches=objects.map((re,i)=>re.test(c)?i:-1).filter(i=>i>=0);
      const neg=/^no\b|\b(?:don't|do not|won't|will not|aren't|are not|not|no thanks|without|skip|avoid|hide|decline|stop|en tarvitse|en halua)\b/i.test(c);
      if(matches.length){for(const i of matches)states[i]=!neg;last=matches;}
      else if(last.length && /^(?:no(?: thanks)?|i'?d rather not|rather not|no thank you)$/i.test(c))for(const i of last)states[i]=false;
    }
    // Declining packing does not cancel a company request (and vice versa).
    return states.some(v=>v===false) && !states.some(v=>v===true);
  }
  const service = `(?:${terms[partner] || partner})`;
  // Contrast clauses can change the customer's request. A later explicit positive request
  // wins for that service; money/cost talk is never itself a refusal of the service.
  const clauses = text.split(/(?:[.!?;]|,?\s+\b(?:but|however|instead|although|though)\b\s*)/i).map(s=>s.trim()).filter(Boolean);
  let declined = false;
  for (const clause of clauses) {
    const object = `${service}(?!['’]s?\\s+(?:prices?|costs?))\\b`;
    const negative = new RegExp(`\\b(?:do not|don't|don’t|won't|won’t|will not|aren't|aren’t|are not|isn't|isn’t|not going to)\\s+(?:be\\s+|going to\\s+)?(?:need(?:ing)?|want(?:ing)?|hir(?:e|ing)|us(?:e|ing)|show|suggest)\\s+(?:(?:any|a|an|the)\\s+)?${object}`, 'i').test(clause)
      || new RegExp(`\\b(?:not interested in|not looking for|not needing|no need for|no thanks to|skip|avoid|hide|decline|stop showing|stop suggesting)\\s+(?:the\\s+|any\\s+)?${object}`, 'i').test(clause)
      || new RegExp(`\\bno\\s+${object}|^${service}\\s*[,?:]?\\s*no thanks$`, 'i').test(clause)
      || (partner === 'movers' && /\ben (?:tarvitse|halua)\s+(?:muutto\w*|pakkausapu\w*)/i.test(clause));
    if (negative) declined = true;
    else if (new RegExp(`\\b(?:need|want|hire|find|book|compare|show|get|looking for)\\s+(?:(?:a|an|some|any|the|cheaper)\\s+)?${service}\\b`, 'i').test(clause)) declined = false;
  }
  // Preserve the short two-sentence refusal without matching a refusal of another object.
  if (new RegExp(`^${service}\\s*[?!,:]\\s*no thanks[.!]?$`, 'i').test(text.trim())) return true;
  return declined;
}

/** A requested service/rule is considered separately from incidental money words. */
export function explicitlyRequests(text: string, topic: string): boolean {
  const requests: Record<string, RegExp> = {
    energy: /\b(?:get|find|compare|switch|cheaper|show|see)\b[^.?!]{0,45}\b(?:electricity|energy|contract|tariff|plans?)\b|\b(?:electricity|energy)\b[^.?!]{0,70}\b(?:cheaper contract|compare|switch)\b/i,
    movers: /\b(?:need|hire|find|book|want|looking for)\b[^.?!]{0,35}\b(?:movers?|moving company|packing help|moving van)\b/i,
    homes: /\b(?:show|see|find|browse)\s+(?:me\s+)?(?:some\s+)?(?:homes|flats|houses|apartments|listings)\b/i,
    'asp-account': /\b(?:open|opening|apply for|eligible for)\b[^.?!]{0,25}\basp\b/i,
    'kela-loan-writeoff': /\bkela\b[^.?!]{0,55}\b(?:help|loan|compensation)\b|\b(?:claim|eligible|compensation)\b[^.?!]{0,35}\bstudent loan\b/i,
    'household-credit': /\b(?:claim|eligible|calculate|receive)\b[^.?!]{0,45}\bhousehold (?:tax )?credit\b/i,
  };
  return requests[topic]?.test(text) || false;
}
