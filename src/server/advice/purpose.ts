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
  const t = text.toLowerCase().replace(/[’]/g, "'").replace(/\bdont\b/g,"don't").replace(/\bpls\b/g,"please");
  if (/\boff the record\b|\b(?:keep this private|this stays between us)\b|(?:^|\s)älä\s+(?:tallenna|kirjaa|muista)|\bei tarvitse (?:tallentaa|kirjata)/i.test(t)) return true;
  if (/\b(?:nora[, ]+)?forget (?:i said|this|that|what i said)\b/.test(t)) return true;
  if (/\bnothing\b.{0,35}\b(?:should|may|must|can) be (?:saved|stored|noted|recorded|kept)\b/.test(t)) return true;
  // Recognise a directed negative command first, then interpret its verb class.
  // Arbitrary data nouns are allowed; keep/make/add need an explicit recording object.
  const commands = [
    /(?:^|\bplease\s+|\bnora[, ]+)(?:don't|do not|never|no need to)\s+(.+)/,
    /\b(?:don't|do not)\s+(?:want|allow)\s+(?:you|nora)\s+to\s+(.+)/,
    /\brather you (?:didn't|did not|not)\s+(.+)/,
  ];
  for(const raw of t.split(/[.!?;,]|\bbut\b/)) {
    const c=raw.trim();
    if (/\b(?:don't|do not) want\s+.{1,40}\s+(?:saved|stored|noted|recorded|kept)\b/.test(c)) return true;
    const m=commands.map(re=>c.match(re)).find(Boolean);
    if(!m) continue;
    const request=m[1].trim();
    if (/^(?:make\s+(?:(?:a|any)\s+)?(?:note|record)|keep\s+(?:(?:(?:a|any)\s+)?(?:note|record)|.{0,30}on file)|add\s+.{0,30}\b(?:to|in)\s+(?:my\s+|your\s+|the\s+)?notes?)\b/.test(request)) return true;
    const v=request.match(/^(save|store|remember|note|log|record|write)\b\s*(.*)$/);
    if(!v) continue;
    const [,verb,obj]=v;
    if (verb==='save' && /^(?:money|euros?|up|for|enough|more|much|a bit|on\b|it all in\b)/.test(obj)) continue;
    if (verb==='log' && /^(?:in|out)\b/.test(obj)) continue;
    if (verb==='record' && /\bas (?:spending|income|a refund|a payment)\b/.test(obj)) continue;
    if (verb==='write' && !/\bdown\b/.test(obj)) continue;
    return true;
  }
  return false;
}

/** Only an explicit positive service request may create a partner card. */
export function declinesPartner(text: string, partner: string): boolean {
  const terms: Record<string, string> = { movers: 'movers?|moving compan(?:y|ies)|packing help|moving van', homes: 'homes?|houses?|flats?|listings?', energy: 'energy|electricity|offers?', insure: 'insurance|cover', planner: 'planner|planning|offers?' };
  if (partner === 'movers') {
    const objects=[/\bmovers?\b|\bmoving compan(?:y|ies)\b|\bmuutto\w*/i,/\bpacking help\b|\bpakkausapu\w*/i,/\bmoving van\b/i];
    const states: (boolean | undefined)[] = objects.map(()=>undefined);
    const clauses=text.toLowerCase().replace(/[’]/g,"'").split(/[.!?;,]|\b(?:but|however|instead|although|though|and)\b/i);
    let last:number[]=[];
    for(const raw of clauses){const c=raw.trim();if(!c)continue;
      const matches=objects.map((re,i)=>re.test(c)?i:-1).filter(i=>i>=0);
      const refusal = /\b(?:don't|do not|won't|will not|aren't|are not|not)\s+(?:be\s+|going to\s+)?(?:need(?:ing)?|want(?:ing)?(?: to hire)?|hir(?:e|ing)|us(?:e|ing)|plan to use)\b/.test(c)
        || /\b(?:not interested in|not looking for|no need for|no thanks to|skip|avoid|hide|decline|stop showing|stop suggesting|en tarvitse|en halua)\b/.test(c)
        || /^no\b/.test(c)
        || (/\b(?:manage|do|cope)\b.{0,12}\bwithout\b/.test(c) && !/\b(?:can't|cannot|won't|will not|not)\b/.test(c));
      const neg=refusal;
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
