/** Disposable source identity for product questions, never eligibility or action consent. */
import {loadRules} from './rules.js';
import {sourceRevision} from '../arch/text.js';
import {purposeOf,ownHistoryRead} from './purpose.js';
export type ProductQuestionIdentity={topic:'asp-account'|'ps-account';id:string;revision:string};
export function currentProductIdentity(topic:ProductQuestionIdentity['topic'],today:string):ProductQuestionIdentity|undefined {
 const r=loadRules().rules.find(r=>r.id===topic&&r.validFrom<=today&&(!r.validTo||today<r.validTo)&&Date.parse(today)-Date.parse(r.source.checkedAt)<=r.reviewDays*86400000);
 return r?{topic,id:r.id+'@'+r.version,revision:sourceRevision(r)}:undefined;
}
export function productQuestionIdentity(request:string,today:string,prior?:ProductQuestionIdentity):ProductQuestionIdentity|undefined {
 const t=request.trim();
 const explicitAsp=/\bASP\b|first[- ](?:home|place)/i.test(t),explicitPs=/\bPS\b|pitkäaikaissääst/i.test(t);
 const explicitQuestion=/\b(?:explain|what|how|tell me about|conditions?|rules?|bonus|withdrawals?|account)\b/i.test(t)&&!/^\s*(?:open|close|transfer|move|set up|delete|remove|cancel)\b/i.test(t);
 if(explicitQuestion&&explicitAsp!==explicitPs&&!/\b(?:new topic|different topic)\b/i.test(t))return currentProductIdentity(explicitAsp?'asp-account':'ps-account',today);
 if(/\b(?:new topic|different topic|change (?:the )?subject)\b/i.test(t)||ownHistoryRead(t))return;
 if(/\b(?:afford|affordability|my monthly deposits?|our monthly deposits?|my (?:salary|income|balance)|how much do I (?:currently )?save)\b/i.test(t))return;
 const uncertainty=/^(?:i(?:'m| am) not sure|i (?:do not|don't) know|not sure|no idea|yes|no|yes[, ]+the (?:asp|ps) account)[.!?]*$/i.test(t);
 const productTermsQuestion=/^(?:and\s+)?(?:what|how|is|are|can|could|do|does)\b/i.test(t)&&/\b(?:monthly deposits?|deposit limits?|minimum deposit|maximum deposit|lump.sum|withdrawals?|retirement age)\b/i.test(t)&&!/\b(?:my|our) (?:balance|salary|budget|plan|goal)|\b(?:transfer|move|set up|start|cancel|remember|delete|remove)\b/i.test(t);
 if(['banking','plan'].includes(purposeOf(t))&&!productTermsQuestion)return;
 if(!uncertainty&&!/\?\s*$/.test(t)&&!/^(?:and\s+|so\s+|wait[, ]+)?(?:what|how|why|when|who|is|are|does|do|can I|could I|explain|tell me about)\b/i.test(t))return;
 const asp=/\bASP\b|first[- ](?:home|place)/i.test(t),ps=/\bPS\b|pitkäaikaissääst/i.test(t);
 if(asp&&ps)return; // Mixed questions still get both sources through reviewedContext, not one sticky identity.
 if(asp||ps)return currentProductIdentity(asp?'asp-account':'ps-account',today);
 if(!prior)return;
 const current=currentProductIdentity(prior.topic,today);
 if(!current||current.id!==prior.id||current.revision!==prior.revision)return;
 // Link only referential/product terms, not every question in the conversation.
 if(uncertainty||/\b(?:it|that|this|mine|those|bonus|deposit|deposits|accrual|quarterly|opening age|lump sum|retirement age|withdrawals?)\b/i.test(t)||/^(?:and|so|wait)\b|^(?:tell me more|more simply|why is that|could you explain)/i.test(t))return current;
}
