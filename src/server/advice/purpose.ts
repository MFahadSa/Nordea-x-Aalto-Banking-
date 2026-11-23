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
  if (/\b(?:no saving|leave .{0,25}out of (?:your|my|the) notes|do not keep track|don't keep track)\b/.test(t)) return true;
  if (/\bnothing\b.{0,35}\b(?:should|may|must|can) be (?:saved|stored|noted|recorded|kept)\b/.test(t)) return true;
  // Recognise a directed negative command first, then interpret its verb class.
  // Arbitrary data nouns are allowed; keep/make/add need an explicit recording object.
  const commands = [
    /(?:^|\bplease\s+|\bnora[, ]+)(?:don't|do not|never|no need to)\s+(.+)/,
    /\b(?:don't|do not)\s+(?:want|allow)\s+(?:you|nora)\s+to\s+(.+)/,
    /\b(?:rather|prefer) you (?:didn't|did not|not)\s+(.+)/,
    /\b(?:can|could|would) you not\s+(.+)/,
    /\b(?:i'd|i would) like you to not\s+(.+)/,
  ];
  for(const raw of t.split(/[.!?;,]|\bbut\b/)) {
    const c=raw.trim();
    if (/\b(?:don't|do not) want\s+.{1,40}\s+(?:saved|stored|noted|recorded|kept)\b/.test(c)) return true;
    const m=commands.map(re=>c.match(re)).find(Boolean);
    if(!m) continue;
    const request=m[1].trim();
    if (/^(?:make\s+(?:(?:a|any)\s+)?(?:note|record)|keep\s+(?:(?:(?:a|any)\s+)?(?:note|record)|my data|track of|.{0,30}on file)|hold on to\s+|(?:add|put)\s+.{0,30}\b(?:to|in)\s+(?:my\s+|your\s+|the\s+)?notes?)\b/.test(request)) return true;
    const v=request.match(/^(save|store|remember|note|log|record|write)\b\s*(.*)$/);
    if(!v) continue;
    const [,verb,obj]=v;
    if (verb==='save' && /^(?:money|euros?|up|for|enough|more|much|less|a bit|on\b|it all in\b)/.test(obj)) continue;
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
    let lastObjects:number[]=[];
    for(const raw of clauses){const c=raw.trim();if(!c)continue;
      let matches=objects.map((re,i)=>re.test(c)?i:-1).filter(i=>i>=0);
      if (!matches.length && /\b(?:need|want)\s+some\b/.test(c)) matches=lastObjects;
      const refusal = /\b(?:don't|do not|won't|will not|aren't|are not|not)\s+(?:be\s+|going to\s+)?(?:need(?:ing)?|want(?:ing)?(?: to hire)?|hir(?:e|ing)|us(?:e|ing)|plan to use)\b/.test(c)
        || /\b(?:not interested in|not looking for|no need for|no thanks to|skip|avoid|hide|decline|stop showing|stop suggesting|en tarvitse|en halua)\b/.test(c)
        || /^no\b/.test(c)
        || (/\b(?:manage|do|cope)\b.{0,12}\bwithout\b/.test(c) && !/\b(?:can't|cannot|won't|will not|not)\b/.test(c));
      const neg=refusal;
      if(matches.length){for(const i of matches)states[i]=!neg;last=matches;lastObjects=matches;}
      else if(last.length && /^(?:no(?: thanks)?|i'?d rather not|rather not|no thank you|not this time)$/i.test(c))for(const i of last)states[i]=false;
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
    const negative = new RegExp(`\\b(?:do not|don't|don’t|won't|won’t|will not|aren't|aren’t|are not|isn't|isn’t|not going to)\\s+(?:be\\s+|going to\\s+)?(?:need(?:ing)?|want(?:ing)?|hir(?:e|ing)|us(?:e|ing)|show(?:\\s+me)?|suggest)\\s+(?:(?:any|a|an|the)\\s+)?${object}`, 'i').test(clause)
      || new RegExp(`\\b(?:not interested in|not looking for|not needing|no need for|no thanks to|skip|avoid|hide|decline|stop showing|stop suggesting)\\s+(?:the\\s+|any\\s+)?${object}`, 'i').test(clause)
      || new RegExp(`\\bno\\s+${object}|^${service}\\s*[,?:]?\\s*no thanks$`, 'i').test(clause)
      || (partner === 'movers' && /\ben (?:tarvitse|halua)\s+(?:muutto\w*|pakkausapu\w*)/i.test(clause));
    if (negative) declined = true;
    else if (new RegExp(`\\b(?:(?:do\\s+)?(?:need|want)|hire|find|book|compare|show|get|looking for)\\s+(?:(?:a|an|some|any|the|cheaper|home)\\s+)?${service}\\b`, 'i').test(clause)) declined = false;
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

/** A narrow safe exception on mixed privacy turns. No model-authored text is retained.
 * Unsupported/ambiguous goals stay blocked for clarification, never blanket positive precedence.
 */
export function scopedGoalOnRefusal(text: string, today: string): {title: string; detail: string; targetAmount: number; targetDate?: string; goalType: string} | null {
  if (!refusesStorage(text)) return null;
  const clauses=text.replace(/[’]/g,"'").split(/[;.!?]|\bbut\b/i);
  const positives=clauses.filter(c=>/\b(?:please\s+)?(?:save|set|create|add)\s+(?:a\s+)?goal\b/i.test(c) && !refusesStorage(c) && !/\b(?:don't|do not|not|never)\b/i.test(c));
  if(positives.length!==1)return null;
  const c=positives[0];
  const kinds=[{re:/\bemergency (?:fund|saving)/i,title:'Emergency fund',type:'other'},{re:/\bcar\b/i,title:'Car savings',type:'car'},{re:/\b(?:home|flat|house)\b/i,title:'Home savings',type:'home'}].filter(k=>k.re.test(c));
  if(kinds.length!==1)return null;
  const kind=kinds[0];
  const restrictions=clauses.filter(x=>refusesStorage(x));
  if (!restrictions.length || restrictions.some(x=>! /\b(?:my|our)\s+/i.test(x))) return null;
  // A refusal that names this goal/category conflicts, even if another clause sounds positive.
  if(clauses.some(x=>refusesStorage(x)&&(/\b(?:goals?|anything|nothing|any of this|all of this|everything)\b|off the record|between us/i.test(x)||kind.re.test(x))))return null;
  const amount=c.match(/\b(?:of|for)\s+(\d[\d ,]*(?:\.\d{1,2})?)(?:\s*(?:euros?|€))?/i);
  const value=amount?Number(amount[1].replace(/[ ,]/g,'')):NaN;
  if(!Number.isFinite(value)||value<=0)return null;
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  const m=c.match(/\bby\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(20\d\d))?\b/i);
  let targetDate:string|undefined;
  if(m){let year=m[2]?Number(m[2]):Number(today.slice(0,4));const month=months.indexOf(m[1].toLowerCase())+1;if(!m[2]&&`${year}-${String(month).padStart(2,'0')}-01`<today)year++;targetDate=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);}
  if (targetDate && targetDate < today) return null;
  return {title:kind.title,detail:`Save ${value} euros for ${kind.title.toLowerCase()}${targetDate?` by ${targetDate}`:''}.`,targetAmount:value,...(targetDate?{targetDate}:{}),goalType:kind.type};
}
