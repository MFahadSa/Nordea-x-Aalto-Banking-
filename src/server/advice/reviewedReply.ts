import type { MessageCard } from '../../types.js';

/** Reject observed contradictions, never compose the customer's answer. A failed retry is
 * an explicitly labelled failure, not permission to publish an unsafe reply. Not a legal validator. */
export function reviewedReplyProblem(request: string, reply: string, checked: string, cards: MessageCard[] = []): string | null {
  reply = reply.normalize('NFKC');
  const fix = (reason: string) => `The reply is not verified: ${reason}. Rewrite the customer's whole answer using the checked facts and actual tools/cards. Do not change the task or invent terms. If a fact is unknown, say so.`;
  if (reply.length > 80 && /\b(?:Advis|becau|with the|such as|would like to|you can|want to|for example|would you like me to:?)\s*$/i.test(reply)) return fix('it ends mid-word or mid-sentence');
  if (/\bguaranteed\s+(?:returns?|profits?)\b/i.test(reply) && !/\b(?:no|not|never|cannot|can't)\b[^.!?]{0,35}\bguaranteed/i.test(reply)) return fix('investments do not have guaranteed returns');
  if (/Open an ASP account/.test(checked) && /\b(?:up to(?: age)?|under|below|maximum age(?: of)?|aged?\s+15\s*(?:to|[–-]))\s*(?:40|44|45)\b/i.test(reply)) return fix('the ASP upper age limit was abolished from 1 June 2026');
  if (/Finnish gift tax/.test(checked) && /(?:up to|including|only (?:the )?(?:amount|part|portion) (?:above|over)|exceeds)\s*(?:€\s*)?7[\s,.]?500|7[\s,.]?500\s*(?:euros?|€)?\s*(?:is|are|would be|will be)\s*(?:tax.free|exempt)/i.test(reply)) return fix('the exemption is strictly less than 7,500, and at the threshold the combined taxable value matters, not only the excess');
  if (/PS means/.test(checked) && /normal capital gain|tax.free withdrawal|balance (?:is|would be|can be) deductible/i.test(reply)) return fix('PS contributions and withdrawal tax are different; ordinary tax still applies');
  if (/PS means/.test(checked) && /(?:balance|5[\s,.]?000)[^.!?]{0,100}(?:contributions)[^.!?]{0,70}(?:eligible|deduct)/i.test(reply)) return fix('the historical PS balance threshold controls the special withdrawal option, not prior contribution deductibility');
  if (/PS means/.test(checked) && /withdraw|nosta/i.test(request) && /exact|conditions|historical/i.test(request) && (!/(?:1|first) January 2027/i.test(reply) || !/2028/.test(reply) || !/retirement|scheduled|regular withdrawals/i.test(reply))) return fix('the requested historical PS balance test is specifically on 1 January 2027');
  if (/talletussuoja|deposit protection/i.test(request) && /fully protected|täysin suojattuja|valti(?:o|on) takaa/i.test(reply)) return fix('do not give a blanket personal deposit-guarantee assurance without verified scheme, coverage limit and eligible deposits');
  if (/Fictional partner/.test(checked)) {
    if (/cancel any\s*time|cancel anytime|no cancellation fee|guaranteed coverage/i.test(reply)) return fix('cancellation/coverage terms are not supplied in the fictional manifest');
    if (/(?:card|button|link)[^.!?]{0,55}(?:adviser|advisor)|(?:adviser|advisor)[^.!?]{0,55}(?:card|button|link)|tap[^.!?]{0,35}Connect me/i.test(reply) && !cards.some(c=>c.type==='handoff')) return fix('the partner card contains a browse button, not an adviser connection');
    if (/Lumivalo/.test(checked) && /[23][.,]9(?:0)?\s*(?:€|euro)|€\s*[23][.,]9/i.test(reply) && !/month|kuukau/i.test(reply)) return fix('3.90 and 2.90 euros are monthly fees, with additional energy usage prices, not total contract prices');
  }
  return null;
}
