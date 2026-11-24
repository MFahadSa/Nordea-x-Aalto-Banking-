import type { MessageCard } from '../../types.js';

/** Reject observed contradictions, never compose the customer's answer. A failed retry is
 * an explicitly labelled failure, not permission to publish an unsafe reply. Not a legal validator. */
export function reviewedReplyProblem(request: string, reply: string, checked: string, cards: MessageCard[] = [], productValidated = false): string | null {
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
    const internalDenial = /\b(?:does not|doesn't|do not|don't) (?:include|provide|contain|have|offer)\b|\b(?:is not|isn't|are not|aren't)\b|\b(?:has|contains|includes|provides) no (?:an? )?(?:adviser|advisor)\b/i.test(m[0]);
    return !directNo && !prefixDenial && !suffixDenial && !internalDenial;
  });
  if ( /\b(?:Advis|becau|with the|such as|would like to|you can|want to|for example|would you like me to:?)\s*$/i.test(reply) || /(?:^|[.!?]\s+)One thing to double-check\s*$/i.test(reply)) return fix('it ends mid-word or mid-sentence');
  if(/Kela student-loan compensation/.test(checked)){
    if(asserted(/(?:Kela (?:started paying|student grant start)|(?:when|date)[^.!?]{0,25}(?:student grant|grant payments?)[^.!?]{0,20}(?:start|began))/i))return fix('student-grant payment start is not the admission or attendance cohort condition');
    if(asserted(/(?:check|find|view)[^.!?]{0,55}(?:loan balance|repayment terms)[^.!?]{0,35}(?:in|on|through)[^.!?]{0,15}(?:Kela|OmaKela)/i))return fix('loan balance and bank repayment terms must be checked with the lending bank, not an invented Kela loan dashboard');
    if(asserted(/(?:must|need to|should|can) apply (?:now|today)|(?:application is|apply)[^.!?]{0,35}(?:straightforward|admission letter|grant start)/i))return fix('Kela normally decides compensation after degree completion automatically; do not invent an immediate application workflow');
  }
  if (asserted(/\bguaranteed\s+(?:returns?|profits?)\b/i)) return fix('investments do not have guaranteed returns');
  if (/Open an ASP account/.test(checked) && asserted(/(?:\b(?:age|aged|ages|old|age limit)[^.!?]{0,25}\b(?:40|44|45)\b|\b(?:under|below)\s+(?:40|44|45)\s*(?:years? old|years? of age))/i)) return fix('the ASP upper age limit was abolished from 1 June 2026');
  if (/Open an ASP account/.test(checked) && /Aspiring Saver|year you buy[^.!?]{0,55}(?:next|following) five/i.test(reply)) return fix('ASP is the Finnish home savings scheme; bonus accrual begins in the opening/saving year, not purchase year');
  if (/Finnish gift tax/.test(checked)) {
    const fiExact = /7[\s,.]?500\s*(?:euroa|€)?[^.!?]{0,150}\b(?:se|lahja|summa)\s+on\s+verovapaa|7[\s,.]?500\s*(?:euroa|€)?\s*(?:on|olisi)\s+verovapaa/i.test(reply) && !/\b(?:alle|vähemmän kuin)\s*7[\s,.]?500|ei\s+ole\s+verovapaa/i.test(reply);
    const fiInclusive = /(?:enintään|korkeintaan|ei ylitä)\s*7[\s,.]?500[^.!?]{0,100}verovapaa/i.test(reply);
    if (fiExact || fiInclusive) return fix('the Finnish exemption is strictly below 7,500 euros, not inclusive');
    const inclusive = asserted(/(?:up to|including|only (?:the )?(?:amount|part|portion) (?:above|over)|exceeds?)\s*(?:€\s*)?7[\s,.]?500|7[\s,.]?500\s*(?:euros?|€)?\s*(?:or less|and below)/i);
    const exact = [...reply.matchAll(/7[\s,.]?500\s*(?:euros?|€)?\s*(?:is|are|would be|will be)\s*(?:tax.free|exempt)/gi)].some(m => {
      const before=reply.slice(0,m.index);
      const directDenial = /\b(?:it is not true that|it isn't true that|it is false that|it is incorrect that|it is wrong to say that)\s*(?:a (?:single )?gift of\s*)?$/i.test(before);
      return !directDenial && !/\b(?:under|below|less than)\s*(?:€\s*)?$/i.test(before);
    });
    if (inclusive || exact) return fix('the exemption is strictly less than 7,500, and at the threshold the combined taxable value matters, not only the excess');
  }
  if (!productValidated && /PS means/.test(checked) && asserted(/normal capital gain|tax.free withdrawal|balance (?:is|would be|can be) deductible/i)) return fix('PS contributions and withdrawal tax are different; ordinary tax still applies');
  if (!productValidated && /PS means/.test(checked) && /(?:balance|5[\s,.]?000)[^.!?]{0,100}(?:contribut|deduct)[^.!?]{0,70}(?:eligible|deduct)|(?:must not have|no more than|under|below)[^.!?]{0,35}5[\s,.]?000[^.!?]{0,100}(?:deduct|contribut)/i.test(reply)) return fix('the historical PS balance threshold controls the special withdrawal option, not prior contribution deductibility');
  if (/PS means/.test(checked) && /withdraw|nosta/i.test(request) && /exact|conditions|historical/i.test(request) && (!/(?:(?:1|first) January 2027|1\.\s*(?:tammikuuta|tammikuun) 2027|1\.1\.2027)/i.test(reply) || !/2028/.test(reply) || !/retirement|scheduled|regular withdrawals|eläke|säännöllis/i.test(reply))) return fix('the requested historical PS balance test is specifically on 1 January 2027');
  if (/talletussuoja|deposit protection/i.test(request) && /fully protected|täysin suojattuja|valti(?:o|on) takaa/i.test(reply)) return fix('do not give a blanket personal deposit-guarantee assurance without verified scheme, coverage limit and eligible deposits');
  if (/Fictional partner/.test(checked)) {
    if (asserted(/\b(?:Find movers|Move section|Moving section|Move tab|Moving tab)\b/i)) return fix('the app has no Find movers or Move section; use only the actual chat browse control');
    if (asserted(/cancel any\s*time|cancel anytime|guaranteed coverage|no cancellation fee/i)) return fix('cancellation/coverage terms are not supplied in the fictional manifest');
    if (asserted(/(?:card|button|link)[^.!?]{0,55}(?:adviser|advisor)|(?:adviser|advisor)[^.!?]{0,55}(?:card|button|link)|tap[^.!?]{0,35}Connect me/i) && !cards.some(c=>c.type==='handoff')) return fix('the partner card contains a browse button, not an adviser connection');
    if(/Lumivalo/.test(checked)&&reply.split(/(?<=[.!?])\s+|\n/u).some(sentence=>!/(?:does not|doesn't|not a|not the|not fixed|can (?:still )?change|depends on (?:your )?(?:usage|consumption)|but[^.!?]{0,45}(?:bill|total)[^.!?]{0,35}(?:depend|usage|consumption))/i.test(sentence)&&/(?:bill|usage cost|total cost|total price)[^.!?]{0,40}(?:won.t swing|stays? the same|fixed|unchang|stable|predictable)|(?:fixed|steady|same)[^.!?]{0,20}(?:bill|total cost)/i.test(sentence)))return fix('a fixed per-kWh rate does not fix the total bill; consumption and other charges can change');
    if (/Lumivalo/.test(checked) && reply.split(/(?<=[.!?])\s+/).some(clause => /spot|exchange|pörssi/i.test(clause) && /2[.,]9(?:0)?\s*(?:€|euro)/i.test(clause) && !/(?:0[.,]39|margin|marginaali|plus.*(?:usage|consumption|spot|energy)|käyt|kulut)/i.test(clause))) return fix('the spot price has usage cost and a 0.39 c/kWh margin in addition to its monthly fee');
    if (/Lumivalo/.test(checked) && /[23][.,]9(?:0)?\s*(?:€|euro)|€\s*[23][.,]9/i.test(reply) && !/month|kuukau|\/kk\b/i.test(reply)) return fix('3.90 and 2.90 euros are monthly fees, with additional energy usage prices, not total contract prices');
  }
  return null;
}
