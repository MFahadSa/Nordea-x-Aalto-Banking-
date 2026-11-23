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
  return /\b(?:do not|don't|don’t|never)\s+(?:(?:want|allow)\s+(?:you|nora)\s+to\s+)?(?:save|remember|store)\s+(?:this|that|it|anything|my|our|what|the|these)\b/i.test(text)
    || /\b(?:do not|don't|don’t)\s+want\s+(?:this|that|it|my\s+\w+)\s+(?:saved|stored|remembered)\b/i.test(text);
}

/** Only an explicit positive service request may create a partner card. */
export function declinesPartner(text: string, partner: string): boolean {
  const terms: Record<string, string> = { movers: 'movers?|moving company|packing help', homes: 'homes?|houses?|flats?|listings?', energy: 'energy|electricity|offers?', insure: 'insurance|cover', planner: 'planner|planning|offers?' };
  return new RegExp(`\\b(?:do not|don't|don’t|no|not)\\s+(?:need|want|show|suggest|looking for)?\\s*(?:any\\s+)?(?:${terms[partner] || partner})\\b`, 'i').test(text);
}
