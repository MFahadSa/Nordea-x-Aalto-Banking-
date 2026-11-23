import type { MessageCard } from '../../types.js';

/** Role checks supplement number membership. They reject explicit field attribution,
 * not every possible semantic paraphrase. Unsupported formulations still need model acceptance review.
 */
const amounts = (text: string) => [...text.matchAll(/(?:€\s*)?(\d{1,3}(?:[ \u00a0\u202f,.]\d{3})+|\d+)(?:[,.](\d{1,2}))?\s*(?:€|euros?|euroa|eur\b)/gi)].map(m => Number(m[1].replace(/[ \u00a0\u202f,.]/g, '')) + Number('0.' + (m[2] || '0')));
const clauses = (text:string) => text.normalize('NFKC').split(/;|\n|(?<=[.!?])\s+|\band\b|\bja\b/i);
export function personalRoleProblem(reply: string, facts: any, cards: MessageCard[]): string | null {
  const fail = (s:string) => 'A factual role is wrong: '+s+'. Rewrite using the exact labelled FACTS and actual allowed sharing scope, or leave the unverified claim out.';
  const goals = facts.goals || [];
  for (const clause of clauses(reply)) {
    const nums=amounts(clause);if(!nums.length)continue;
    const negated=/\b(?:not|isn.t|aren.t|ei ole)\b/i.test(clause);
    if(negated)continue;
    // Multiple relevant goals require explicit identification; do not silently pick one.
    const named=goals.filter((g:any)=> String(g.title).toLowerCase().split(/\W+/).filter((w:string)=>w.length>3).some((w:string)=>clause.toLowerCase().includes(w)));
    const eligible=named.length===1?named:goals.length===1?goals:[];
    const fields:[RegExp,string][]=[[/\b(?:saved(?: so far)?|säästössä|säästetty)\b/i,'saved'],[/\b(?:monthly contribution|monthly deposit|each month|every month|per month|kuukaudessa|kuukausisäästö)\b/i,'monthlyGoingIn']];
    for(const [anchor,key] of fields){
      if(!anchor.test(clause)||/\b(?:extra|additional|increase|could|would|suggest|more|lisä)\b/i.test(clause))continue;
      if(eligible.length===1 && !nums.some(n=>Math.abs(n-eligible[0][key])<0.011))return fail(`the goal's ${key} does not match its value`);
    }
  }
  const handoff=cards.find(c=>c.type==='handoff');
  if(handoff){
    const titles=(handoff.data?.gets||[]).map((x:any)=>String(x.title)).join(' ');
    for(const sentence of reply.split(/(?<=[.!?])\s+/)){
      if(!/\b(?:adviser|advisor|they|shared|share|see|sees|sent)\b/i.test(sentence)||/\b(?:not|nothing|never|won.t|cannot|can.t|until|unless|only if)\b/i.test(sentence))continue;
      if(/\b(?:salary|income|pay rise)\b/i.test(sentence)&&!/salary|income|pay|job/i.test(titles))return fail('salary is not in the handoff preview');
      if(/\b(?:spending|transactions?|account balance)\b/i.test(sentence)&&!/spending|transaction|balance/i.test(titles))return fail('spending or account data is not in the handoff preview');
    }
  }
  return null;
}
