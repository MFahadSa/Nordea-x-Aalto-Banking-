import type { ChatMessage } from '../../types.js';
import { getPartner } from '../partnerRegistry.js';
import { declinesPartner } from './purpose.js';
import { catalogue } from './guard.js';
import { reviewedContext } from './reviewedAnswer.js';

/** A bounded, disposable view rebuilt each turn, never an independent memory store.
 * Callers MUST remove messages whose data is not readable now before passing them here.
 * It describes previously displayed controls, never grants permission or creates a card.
 */
export function conversationContracts(history: ChatMessage[], current: string, age: number | undefined, today: string, offersOff: boolean, allowedTitles: ReadonlySet<string> = new Set(), blockedRules: ReadonlySet<string> = new Set()) {
  const partners = new Set<string>();
  const rules = new Set<string>();
  const descriptions: string[] = [];
  for (const m of history.slice(-12)) {
    for (const c of m.cards || []) {
      if (c.type === 'import' || c.type === 'confirm_save' || c.type === 'duplicate') continue;
      const d = c.data || {};
      if ((c.type === 'offer' || c.type === 'offer_list') && !offersOff) {
        const id = String(d.partnerId || '');
        if (!getPartner(id) || declinesPartner(current, id)) continue;
        const declined = history.some(x => (x.cards || []).some(k => k.data?.partnerId === id) && /No thanks|Turn off partner offers/i.test(x.resolved || ''));
        if (declined) continue;
        partners.add(id);
      }
      if ((c.type === 'ask_fact' || c.type === 'opportunity') && d.ruleId && !blockedRules.has(String(d.ruleId)) && !/Don't suggest|Don’t suggest|Not now|Not sure/i.test(m.resolved || '')) {
        const rule = catalogue().find(r => r.id === d.ruleId);
        if (offersOff && rule?.kind === 'product') continue;
        rules.add(String(d.ruleId));
        descriptions.push(JSON.stringify({type:c.type,messageId:m.id,title:c.title,ruleId:d.ruleId,fact:d.fact,question:d.question,resolved:m.resolved || null}));
      }
      if (c.type === 'confirm_plan') descriptions.push(JSON.stringify({type:c.type,amount:d.amount,once:d.once,from:d.from,to:d.to,starts:d.starts,resolved:m.resolved || null}));
      if (c.type === 'handoff') descriptions.push(JSON.stringify({type:c.type,title:c.title,gets:Array.isArray(d.gets) ? d.gets.filter((g:any) => allowedTitles.has(String(g.title))) : [],heldBack:d.heldBack,share:d.share,resolved:m.resolved || null}));
    }
  }
  const ruleTerms: Record<string,string> = {'asp-account':'ASP','gift-limit':'gift tax','household-credit':'household credit','kela-loan-writeoff':'Kela student loan compensation','equity-account-under-30':'equity savings account custody','ps-account':'PS'};
  const terms = [...rules].map(id => ruleTerms[id] || '').filter(Boolean).join('; ');
  const partnerTerms = [...partners].map(id => getPartner(id)!.kind).join('; ');
  // Explicitly selecting these actual displayed ids avoids depending on whether a short
  // follow-up repeats a product name or rematches an opening-intent regex.
  const facts = reviewedContext(`${current}; ${terms}; ${partnerTerms}`, age, today, partners, true);
  const partnerControls = [...partners].map(id => {
    const p = getPartner(id)!;
    return `${p.name}: the earlier offer button is "${p.cta}" and opens fictional options in this chat. The list buttons are "${p.view}" and "${p.buy}". No live availability, comparison quote, actual booking or adviser link is established. Never invent another app section or link.`;
  });
  return {facts, text: descriptions.length || partnerControls.length ? `SAME CONVERSATION, previously displayed controls, not new cards. Recheck the latest customer correction and current consent. A term question may refer to these. Do not claim anything is newly shown or completed.\n${descriptions.slice(-4).join('\n')}\n${partnerControls.join('\n')}` : ''};
}
