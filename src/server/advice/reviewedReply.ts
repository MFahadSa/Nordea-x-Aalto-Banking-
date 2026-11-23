import type { MessageCard } from '../../types.js';

/** Reject observed contradictions, never compose the customer's answer. A failed retry is
 * an explicitly labelled failure, not permission to publish an unsafe reply. Not a legal validator. */
export function reviewedReplyProblem(request: string, reply: string, checked: string, cards: MessageCard[] = []): string | null {
  reply = reply.normalize('NFKC');
  const fix = (reason: string) => `The reply is not verified: ${reason}. Rewrite the customer's whole answer using the checked facts and actual tools/cards. Do not change the task or invent terms. If a fact is unknown, say so.`;
  // Negation belongs to the matched predicate, never to an entire sentence.
  // In particular, reassurance ("no worries") and independent benefits ("no fee")
  // cannot turn a positive product/tax assertion into a denial.
  const asserted = (pattern: RegExp) => [...reply.matchAll(new RegExp(pattern.source, 'gi'))].some(m => {
    const before = reply.slice(0,m.index).split(/[;.!?]\s+|\b(?:but|and|however)\b|,/i).at(-1) || '';
    const after = reply.slice(m.index!+m[0].length);
    const directNo = /\bno\s*$/.test(before) && /^(?:guaranteed|adviser|advisor)/i.test(m[0]);
    const prefixDenial = /(?:\b(?:not|never|cannot|can't|doesn't|don't)|\b(?:do|does) not (?:say|state|confirm|specify) whether)(?:\s+(?:a|an|the|any|you|can|have|offer|confirm|promise|guarantee|include|provide|receive|enjoy|that|it|is|are|be|treated|as|simply|necessarily|fully|eligible|for|gifts?|of|amounts?|up|to))*\s*$/i.test(before);
    const suffixDenial = /^\s*(?:euros?|€)?\s*(?:(?:is|are|would be|will be)\s+(?:not|never)\b|(?:do|does) not exist\b|(?:is|are) (?:unknown|unspecified|unverified)\b)/i.test(after);
    const internalDenial = /\b(?:does not|doesn't|do not|don't) (?:include|provide|contain|have|offer)\b|\b(?:is not|isn't|are not|aren't)\b/i.test(m[0]);
    return !directNo && !prefixDenial && !suffixDenial && !internalDenial;
  });
  if ( /\b(?:Advis|becau|with the|such as|would like to|you can|want to|for example|would you like me to:?)\s*$/i.test(reply)) return fix('it ends mid-word or mid-sentence');
  if (asserted(/\bguaranteed\s+(?:returns?|profits?)\b/i)) return fix('investments do not have guaranteed returns');
  if (/Open an ASP account/.test(checked) && asserted(/(?:\b(?:age|aged|ages|old|age limit)[^.!?]{0,25}\b(?:40|44|45)\b|\b(?:under|below)\s+(?:40|44|45)\s*(?:years? old|years? of age))/i)) return fix('the ASP upper age limit was abolished from 1 June 2026');
  if (/Finnish gift tax/.test(checked)) {
    const inclusive = asserted(/(?:up to|including|only (?:the )?(?:amount|part|portion) (?:above|over)|exceeds?)\s*(?:€\s*)?7[\s,.]?500|7[\s,.]?500\s*(?:euros?|€)?\s*(?:or less|and below)/i);
    const exact = [...reply.matchAll(/7[\s,.]?500\s*(?:euros?|€)?\s*(?:is|are|would be|will be)\s*(?:tax.free|exempt)/gi)].some(m => {
      const before=reply.slice(0,m.index);
      return !/\b(?:under|below|less than)\s*(?:€\s*)?$/i.test(before);
    });
    if (inclusive || exact) return fix('the exemption is strictly less than 7,500, and at the threshold the combined taxable value matters, not only the excess');
  }
  if (/PS means/.test(checked) && asserted(/normal capital gain|tax.free withdrawal|balance (?:is|would be|can be) deductible/i)) return fix('PS contributions and withdrawal tax are different; ordinary tax still applies');
  if (/PS means/.test(checked) && /(?:balance|5[\s,.]?000)[^.!?]{0,100}(?:contributions)[^.!?]{0,70}(?:eligible|deduct)/i.test(reply)) return fix('the historical PS balance threshold controls the special withdrawal option, not prior contribution deductibility');
  if (/PS means/.test(checked) && /withdraw|nosta/i.test(request) && /exact|conditions|historical/i.test(request) && (!/(?:(?:1|first) January 2027|1\.\s*(?:tammikuuta|tammikuun) 2027|1\.1\.2027)/i.test(reply) || !/2028/.test(reply) || !/retirement|scheduled|regular withdrawals|eläke|säännöllis/i.test(reply))) return fix('the requested historical PS balance test is specifically on 1 January 2027');
  if (/talletussuoja|deposit protection/i.test(request) && /fully protected|täysin suojattuja|valti(?:o|on) takaa/i.test(reply)) return fix('do not give a blanket personal deposit-guarantee assurance without verified scheme, coverage limit and eligible deposits');
  if (/Fictional partner/.test(checked)) {
    if (asserted(/cancel any\s*time|cancel anytime|guaranteed coverage|no cancellation fee/i)) return fix('cancellation/coverage terms are not supplied in the fictional manifest');
    if (asserted(/(?:card|button|link)[^.!?]{0,55}(?:adviser|advisor)|(?:adviser|advisor)[^.!?]{0,55}(?:card|button|link)|tap[^.!?]{0,35}Connect me/i) && !cards.some(c=>c.type==='handoff')) return fix('the partner card contains a browse button, not an adviser connection');
    if (/Lumivalo/.test(checked) && /[23][.,]9(?:0)?\s*(?:€|euro)|€\s*[23][.,]9/i.test(reply) && !/month|kuukau|\/kk\b/i.test(reply)) return fix('3.90 and 2.90 euros are monthly fees, with additional energy usage prices, not total contract prices');
  }
  return null;
}
