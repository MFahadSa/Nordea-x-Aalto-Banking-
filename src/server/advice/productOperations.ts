/** Product information never executes account opening/closure or pension withdrawal.
 * This guard reads the full original reply, independent of numeric validation.
 * These operations have no executable tool in this application, so no phrase can
 * promote a product question into a completed operation or bank commitment.
 */
export function productOperationProblem(text:string):string|null {
 const normalized=text.normalize('NFKC').replace(/[’]/g,"'");
 for(const clause of normalized.split(/(?<=[.!?])\s+|\n|;|,?\s+but\s+|\s+except\s+/i)){
  if(/\?\s*$/.test(clause)&&/\b(?:should I|shall I|want me to|can I|would you like)\b/i.test(clause))continue;
  const state=/\b(?:I(?:'ve| have|'ll| will)?|we(?:'ve| have|'ll| will)?)\s+(?:(?:now|just|already|successfully)\s+|(?:went|gone) ahead and )?(?:paus(?:e|ed)|suspend(?:ed)?|process(?:ed)?|clos(?:e|ed)|cancel(?:led|ed)?|submit(?:ted)?|sent|moved?|transfer(?:red)?|withdrew|withdrawn|opened?|created?|set up|scheduled?|started?|arranged?)\b|\b(?:account|standing order|deposit|transfer|withdrawal|request|application|payment|plan)\b[^.!?]{0,65}\b(?:has been|have been|is now|was|were|is|are)\s+(?:now |successfully )?(?:created|submitted|sent|moved|transferred|opened|closed|cancelled|scheduled|set up|completed|processed|in place|on its way|active|being paid out)\b|\b(?:money|funds|withdrawal)\b[^.!?]{0,35}\bwill\s+(?:arrive|reach|be (?:sent|transferred|paid|credited))\b/gi;
  if(/\b(?:consider it done|has gone through)\b/i.test(clause))return 'No bank operation was executed. Remove the implied completion claim.';
  for(const match of clause.matchAll(state)){
   const before=clause.slice(Math.max(0,match.index!-35),match.index!);
   const span=match[0];
   if(/\b(?:no|nothing|never|not|cannot|can't|won't|will not|have not|haven't|did not|didn't)\s*(?:\w+\s*){0,3}$/i.test(before)||/\b(?:not|never|cannot|can't|haven't|hasn't|didn't)\b/i.test(span))continue;
   if(/^(?:if|when|once|after|before|unless)\b/i.test(clause.trim())&&!/\bI\b/i.test(span))continue;
   return 'This product explanation cannot execute an account operation, submit a bank request, or promise a transfer arrival. No such tool ran. Remove the execution claim and describe only the customer-controlled next step.';
  }
 }
 return null;
}
