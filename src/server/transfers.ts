/** A closed financial proposal interpretation shared by model and offline callers.
 * Request-form politeness is distinct from questions about consequences. Unknown means clarify.
 */
export type TransferMeaning = { once: boolean; target: 'savings'|'carFund'|'unsupported'; clarification: string|null };
export function transferMeaning(now: string, before = '', offered = ''): TransferMeaning {
  const t=now.normalize('NFKC').toLowerCase().replace(/[’]/g,"'");
  const defaultResult:TransferMeaning={once:true,target:'savings',clarification:null};
  const hold=(clarification:string):TransferMeaning=>({...defaultResult,clarification});
  const clauses=t.split(/[.!?;,]|\b(?:then|actually|sitten|oikeastaan)\b|\b(?:but|then|mutta|sitten)\b/).map(x=>x.trim()).filter(Boolean);
  const neg=/(?:^|\s)(?:not|no|never|don't|do not|without|ei|en|älä)(?=\s|$)/;
  const monthly=/\b(?:monthly|recurring|regular(?:ly)?|standing|(?:every|each|per|a)\s+(?:month|payday)|joka kuukausi|kuukausittain|kuukaudessa|toistuva)\b/;
  const once=/\b(?:once|one[- ]?off|one[- ]?time|today|now|single|kerran|nyt|tänään|kertasiirto)\b/;
  const car=/\b(?:car(?:\s*fund|\s+savings|\s+goal)?|autorahasto\w*|autotili\w*)\b/;
  const savings=/\b(?:savings?|save|flat|home|house|apartment|deposit|säästö\w*)\b/;
  // Everyday verbs, and the verbless "50e to savings" shape (an amount sent to one of their own accounts).
  const verb=/(?:^|\s)(?:move|transfer|put|add|set up|save|send|stick|chuck|throw|pop|shift|top up|deposit|siirrä|siirtää|siirtäisitkö|laita|säästä)(?=\s|$)/;
  const amountToAccount=/(?:^|\s)(?:€\s?)?\d+(?:[.,]\d+)?\s*(?:e|eur|euros?|€)?\s+(?:to|into|in)\s+(?:my\s+|the\s+|our\s+)?(?:savings|car\s*fund)\b/;
  if (/\b\d+(?:[.,]\d+)?\s*k\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten) (?:hundred|thousand)\b/i.test(t)) return hold('No card prepared yet. Restate the informal amount as an exact euro amount and ask the customer to confirm it before preparing a transfer.');
  if ((t.match(/\d+(?:[.,]\d+)?/g)||[]).length > 1 && /\b(?:make (?:that|it)|i meant|instead|korjaan|tarkoitin|siis|oikeastaan)\b/.test(t)) return hold('The amount was corrected in this message. Ask the customer to confirm the final exact amount before preparing a transfer.');
  const directives=clauses.filter(c=>verb.test(c)&&/\d/.test(c));
  if(directives.length>1 || (verb.test(t) && (t.match(/\d+(?:[.,]\d+)?/g)||[]).length>1 && /\b(?:and|then|ja|sitten)\b/.test(t)))return hold('There are multiple transfers or amounts. No card prepared. Ask which one to prepare first; do not silently discard the other request.');
  const explicitCancel=clauses.some(c=>/^(?:please\s+)?(?:cancel|stop|forget|never mind|nevermind|wait|hold on|not yet|peru|peruuta|odota)(?:\s+(?:it|that|the transfer|the plan|please|siirto|se))?$/.test(c));
  const retracted = clauses.some(c => /\b(?:cancel|cancel that|never mind|scratch that|scrap that|ignore that|forget it|unohda|ei sittenkään|peruuta|peru se|älä siirrä)\b/.test(c) && !/\b(?:don't|do not|älä)\s+(?:cancel|forget|ignore|unohda|peruuta)\b/.test(c));
  if(explicitCancel || retracted)return hold('No card prepared. The customer cancelled or paused this request.');
  if(/\b(?:maybe|perhaps|might|not sure|thinking (?:of|about)|if i|suppose|hypothetic|what if|ehkä|jos)\b/.test(t))return hold('No card prepared. Answer the exploratory question or ask whether they want a transfer prepared.');
  // A timing question remains informational even alongside an explicit transfer preference.
  if(/\b(?:would|will|does|when|is it|what happens|milloin|tapahtuuko)\b[^.!?]*(?:move|start|happen|now|today|payday|monthly|siir|alkaa|nyt)/.test(t))return hold('No card prepared. Explain timing first: monthly starts on the first of next month here, not necessarily payday. Check that this is wanted.');
  const positiveMonthly=clauses.some(c=>monthly.test(c)&&!neg.test(c));
  const deniedMonthly=clauses.some(c=>monthly.test(c)&&neg.test(c));
  const positiveOnce=clauses.some(c=>once.test(c)&&(!neg.test(c)||/don't want to wait|do not want to wait/.test(c)));
  const explicitMove = clauses.some(c => verb.test(c) && /\d/.test(c) && !neg.test(c) && (savings.test(c) || car.test(c)));
  const nowWithDenial = deniedMonthly && once.test(t) && /\b(?:now|today|just once|one[- ]?off|one[- ]?time|nyt|tänään|kerran)\b/.test(t) && !/\b(?:not|no|älä)\s+(?:now|today|nyt|tänään)\b/.test(t);
  if(deniedMonthly && !positiveOnce && !nowWithDenial && !explicitMove)return hold('Recurrence was denied. Do not prepare monthly. Ask whether they want a one-time transfer.');
  if(positiveMonthly && positiveOnce)return hold('Both monthly and one-time timing are present. Ask which is intended before a card.');
  if(/\bthis month\b|tässä kuussa|tämän kuun/.test(t)&&!positiveMonthly&&!positiveOnce)return hold('This month does not settle one-time versus recurring. Ask which is intended.');
  // Remove whole denied destination clauses, not a small guessed set of filler words.
  const destinations=clauses.filter(c=>!neg.test(c)||verb.test(c)&&/\b(?:don't want to wait|do not want to wait)\b/.test(c));
  const current=destinations.join(' ');
  if(car.test(current)&&savings.test(current.replace(/car\s+savings/g,''))&&/\bor\b|\beither\b|\band\b|\bja\b/.test(current))return hold('Two destinations are present. Ask which account should receive this transfer.');
  let target:TransferMeaning['target']='savings';
  const out=/\bfrom\s+(?:my\s+|the\s+|our\s+)?(?:savings|car\s*fund|car\s+savings)\b|\b(?:to|into)\s+(?:my\s+|the\s+|our\s+)?current\b|\bwithdraw\b/;
  if(out.test(current))target='unsupported';else if(car.test(current))target='carFund';else if(!savings.test(current)){
    const lastCar=[...before.matchAll(/\bcar\b/gi)].at(-1)?.index??-1;
    const lastSav=[...before.matchAll(/\b(?:savings?|flat|home|house|apartment|deposit)\b/gi)].at(-1)?.index??-1;
    if(lastCar>lastSav)target='carFund';
  }
  const assent=/^\s*(?:yes|yeah|yep|sure|ok(?:ay)?|please|do it|go ahead|sounds good|kyllä|joo)\b/.test(t);
  const previousOffer=offered||before;
  if(!verb.test(t)&&!amountToAccount.test(t)&&!(assent&&(verb.test(previousOffer)||/\b(?:car fund|savings|monthly|payday)\b/i.test(previousOffer))))return hold('No clear request to prepare a transfer. Do not revive an older instruction.');
  if(neg.test(current)&&!/(?:don't want to wait|do not want to wait)/.test(current)&&/\b(?:don't|do not|älä)\b[^.!?]{0,30}\b(?:move|transfer|siirrä|laita)\b/.test(current))return hold('The transfer itself was denied. No card prepared.');
  const onceValue=positiveOnce||deniedMonthly?true:positiveMonthly?false:assent&&monthly.test(previousOffer)&&!once.test(previousOffer)?false:true;
  return {once:onceValue,target,clarification:null};
}
export function transferClarification(now:string,before='',offered=''){return transferMeaning(now,before,offered).clarification;}
export function transferIsOnce(now:string,before:string,_modelSays?:unknown,offered=''){
  const t=now.normalize('NFKC').toLowerCase().replace(/[’]/g,"'");
  const clauses=t.split(/[.!?;,]|\b(?:then|actually|sitten|oikeastaan)\b|\b(?:but|then|mutta|sitten)\b/);
  const recurrence=/\b(?:monthly|recurring|regular(?:ly)?|(?:every|each|per|a)\s+(?:month|payday)|joka kuukausi|kuukausittain|kuukaudessa)\b/;
  const neg=/(?:^|\s)(?:not|no|never|don't|do not|ei|en|älä)(?=\s|$)/;
  if(clauses.some(c=>recurrence.test(c)&&!neg.test(c)))return false;
  if(clauses.some(c=>recurrence.test(c)&&neg.test(c)))return true;
  if(/^\s*(?:yes|yeah|yep|sure|ok(?:ay)?|please|do it|go ahead|sounds good)\b/.test(t)&&recurrence.test(offered||before))return false;
  return true;
}
export function transferTarget(now:string,before:string){return transferMeaning(now,before).target;}
