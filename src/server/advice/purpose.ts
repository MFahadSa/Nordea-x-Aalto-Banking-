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
  return /\b(?:don't|don’t|do not|never)\s+(?:note\s+(?:this|that|it|anything)\s+down|make\s+(?:a\s+)?note)|(?:^|\s)älä\s+(?:tallenna|kirjaa|muista)|\bei tarvitse (?:tallentaa|kirjata)/i.test(text)
    || /\b(?:don't|don’t|do not)\s+keep\s+(?:a\s+)?note\s+of\s+(?:this|that|it)\b|\bno need to (?:save|store|remember|keep)\s+(?:this|that|it|anything|a note)\b/i.test(text)
    || /\b(?:do not|don't|don’t|never)\s+(?:(?:want|allow)\s+(?:you|nora)\s+to\s+)?(?:save|remember|store)\s+(?:this|that|it|anything|my|our|what|the|these)\b/i.test(text)
    || /\b(?:do not|don't|don’t)\s+want\s+(?:this|that|it|my\s+\w+)\s+(?:saved|stored|remembered)\b/i.test(text);
}

/** Only an explicit positive service request may create a partner card. */
export function declinesPartner(text: string, partner: string): boolean {
  const terms: Record<string, string> = { movers: 'movers?|moving company|packing help', homes: 'homes?|houses?|flats?|listings?', energy: 'energy|electricity|offers?', insure: 'insurance|cover', planner: 'planner|planning|offers?' };
  const object = terms[partner] || partner;
  // Match refusal of the service itself, not stopping its costs or declining a different object.
  const service = `(?:${object})`;
  return new RegExp(`\\b(?:do not|don't|don’t|won't|won’t|will not)\\s+(?:be\\s+)?(?:need(?:ing)?|want(?:ing)?|hir(?:e|ing)|us(?:e|ing)|show|suggest)\\s+(?:(?:any|a|an|the)\\s+)?${service}\\b`, 'i').test(text)
    || new RegExp(`\\b(?:not interested in|not looking for|no need for|skip|avoid|hide|decline|stop showing|stop suggesting)\\s+(?:the\\s+|any\\s+)?${service}\\b`, 'i').test(text)
    || new RegExp(`\\bno\\s+${service}\\b|\\b${service}\\s*[?!,:]\\s*no thanks(?:[.!]|$)`, 'i').test(text)
    || (partner === 'movers' && /\ben (?:tarvitse|halua)\s+(?:muutto\w*|pakkausapu\w*)/i.test(text));
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
