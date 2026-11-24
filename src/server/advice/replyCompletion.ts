/** Narrow reply-shape backstop, not a semantic completeness checker.
 * A lone label cannot explain or compare. A clarification question may be brief.
 * Choice/yes-no requests without an explanation request do not enter this check.
 */
export function explanationReplyProblem(request: string, reply: string): string | null {
  const explanationRequested = /\b(?:explain|compare|comparison)\b|\b(?:what(?:'s| is) the|what are the) differences?\b/iu.test(request);
  if (!explanationRequested || /[?？]\s*$/u.test(reply.trim())) return null;
  const words = reply.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
  if (words.length === 1) return 'The customer asked for an explanation or comparison, but the reply is only one word. Give a short complete explanation grounded in the supplied facts, or ask one useful clarification question. Do not claim an action completed.';
  return null;
}

/** Citation-only tails are metadata, not evidence that the preceding sentence is cut off.
 * Only an exact source URL supplied for this turn can be removed for this check.
 * Never edit the displayed answer or treat an arbitrary URL as trusted evidence.
 */
export function unfinishedReplyProblem(text:string, sourceUrls:readonly string[]=[]):string|null {
  let prose=text.trim();
  const normalize=(url:string)=>url.replace(/[.,)\]>]+$/u,'').replace(/\/$/u,'');
  const allowed=new Set(sourceUrls.map(normalize));
  for(let i=0;i<8;i++){
    const tail=/(?:^|\n|\s)(?:[-*]\s*)?(?:\((?:see\s+)?)?(?:Source(?:s)?(?:\s*\([^\n]*?\))?\s*:\s*)?(?:\[[^\]\n]+\]\((https?:\/\/[^\s<>]+)\)|<?(https?:\/\/[^\s<>]+)>?)\s*$/iu.exec(prose);
    if(!tail||!allowed.has(normalize(tail[1]||tail[2])))break;
    prose=prose.slice(0,tail.index).trim();
  }
  if(text.length>400&&!/[.!?]["'’”)]*$/u.test(prose))return 'Your long reply ends without a complete sentence. Rewrite the whole answer in at most 300 characters, complete sentences, no unfinished offer.';
  if(prose.length>40&&/(?:\b(?:a|an|the|to|of|and|or|with|your|is|are|be|for|by|at|in|on)|(?<![\d  ])\d)\s*$/iu.test(prose))return 'Your reply was cut off mid-sentence. Write it again, complete and short.';
  return null;
}

/** Housing references only. "First place" alone can mean a competition result. */
export function requestsFirstHomeBackground(request:string):boolean {
 if(/\bfirst[ -](?:home|flat|house)\b/iu.test(request))return true;
 if(/\bown (?:home|place)\b/iu.test(request))return !/\b(?:already (?:own|bought)|current home|second home)\b/iu.test(request);
 return /\b(?:our|my|a) first place\b/iu.test(request)&&/\b(?:buy|buying|purchase|purchasing|saving|save|deposit|mortgage)\b/iu.test(request)&&!/\b(?:race|competition|contest|finish|finished|win|won|prize)\b/iu.test(request);
}
/** A financial read can accompany advice, but cannot silently replace requested advice. */
export function requestsSavingOptions(request:string):boolean {
 return requestsFirstHomeBackground(request)&&/\b(?:suggest|recommend|options?|where to start|(?:best|sensible|good) way|(?:get|getting) started|how (?:do|should|can) (?:I|we))\b/iu.test(request);
}
