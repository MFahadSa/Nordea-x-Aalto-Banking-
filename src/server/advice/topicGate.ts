/** A topic mention alone is not an unmet need. Helpful prose may still be proactive;
 * creating persistent intake or a partner card requires a supported current need.
 * This gate is shared by deterministic routing and model topic proposals.
 */
import { declinesPartner,ownHistoryRead,purposeOf,explicitlyRequests,customerAssertion } from './purpose.js';
export function getCurrentNeed(text:string,topic:string):boolean {
 return topic==='energy'&&/\b(?:our|my|the)\s+(?:electricity|energy|power)\s+bill\b[^.!?]{0,35}\b(?:ridiculous|jumped|high|expensive|increased)\b/iu.test(text);
}
export function topicIsUsefulNow(text: string, topic: string): boolean {
 const t=text.trim().replace(/[’]/g,"'");
 if(ownHistoryRead(t))return false;
 // A question about a topic can ask for explanation, not permission for persistent intake.
 // Only an affirmative customer assertion or explicit application/eligibility/service
 // request can cross the stateful topic boundary. The ordinary reply remains available.
 const inquiry=/\?|^(?:what|when|where|why|how|do|did|have|has|am|is|are|can|could|tell|remind|recall|mitä|mikä|miten|olenko|onko|kerro)\b/iu.test(t);
 if(inquiry&&!customerAssertion(t)&&!explicitlyRequests(t,topic)&&!getCurrentNeed(t,topic))return false;
 if(['banking','plan'].includes(purposeOf(t))&&!explicitlyRequests(t,topic))return false;
 if(!t || /^(?:hi|hello|hey|thanks|thank you|ok|okay)[.! ]*$/i.test(t))return false;
 if(/\b(?:stop (?:suggesting|showing|offering)|no (?:more )?(?:offers|suggestions)|just (?:talk|chat)|not interested|leave it|forget it|en halua tarjouksia)\b/i.test(t))return false;
 // Explain terms in ordinary language, without launching intake or a sales card.
 if(/^(?:(?:sorry|wait)[, ]+)?(?:what (?:is|are|does)|what's|explain|what do you mean|mitä tarkoittaa)\b/i.test(t) && !/\b(?:should i|can i|need|want|apply|open|eligible)\b/i.test(t))return false;
 if(declinesPartner(t,topic))return false;
 const tests:Record<string,RegExp>={
  homes:/\b(?:show|see|find|browse|search|look(?:ing)? (?:at|for))\s+(?:me\s+)?(?:some\s+|example\s+|an?\s+|new\s+)?(?:homes?|flats?|houses?|apartments?|listings)\b|\b(?:home|house|flat) (?:viewings|listings)\b/i,
  movers:/\bmovers? (?:sound|sounds|would be) (?:great|good|helpful)\b|\b(?:need|want|hire|find|book|compare|help)\b[^.?!]{0,60}\b(?:movers?|moving compan(?:y|ies)|packing help|moving van)\b|\b(?:can't|cannot)\b[^.?!]{0,25}\b(?:pack|move)\b|\btarvits\w*\s+muutto\w*/i,
  energy:/\b(?:electricity|electric|power|energy)\b[^.?!]{0,45}\b(?:bill|contract|tariff|price|cost)\b|\b(?:compare|switch|cheaper|need)\b[^.?!]{0,45}\b(?:energy|electricity|sähkö\w*)\b|\bsähkösopimu\w*/i,
  insure:/\b(?:need|want|get|find|compare|buy|recommend)\b[^.?!]{0,45}\b(?:home|flat|contents|house) insurance\b|\bhome insurance\b[^.?!]{0,35}\b(?:need|before moving|expire|renew)\b|\bkotivakuutu\w*/i,
  planner:/\b(?:need|want|find|speak|talk|help|looking for)\b[^.?!]{0,50}\b(?:financial planner|certified planner|money plan|financial plan)\b/i,
  'asp-account':/\basp(?:[- ]?til\w*)?\b|\b(?:a )?place of (?:our|my) own\b|\b(?:sav\w*|deposit|buy|first|open|eligible|apply)\b[^.?!]{0,50}\b(?:home|house|flat|apartment|asp)\b|\basp\b[^.?!]{0,35}\b(?:account|eligible|open|apply|saving)\b/i,
  'kela-loan-writeoff':/\b(?:opinnot|Aallossa|opiskelen|aloitin)\b|\b(?:student|university|college|degree|study|studies|studying|aalto|kela|opintolaina\w*)\b/i,
  'equity-account-under-30':/\b(?:start|begin|want|interested|learn|how|buy|should|invest\w*)\b[^.?!]{0,40}\b(?:invest\w*|shares|funds|stocks|etf)\b|\b(?:investing|sijoit\w*)\b/i,
  'gift-limit':/\b(?:give|giving|gift|support|help|pay for)\b[^.?!]{0,45}\b(?:children|kids|grand\w*|son|daughter|family)\b/i,
  'household-credit':/\b(?:pay|paid|hire|hired|claim|cleaner|cleaning|renovat\w*|home repairs|household (?:tax )?credit|kotitalousvähenny\w*)\b/i,
  'ps-account':/\b(?:ps[- ]?(?:account|tili|saving)|pension saving|voluntary pension|eläkesäästö\w*)\b/i,
 };
 return !!tests[topic]?.test(t);
}
