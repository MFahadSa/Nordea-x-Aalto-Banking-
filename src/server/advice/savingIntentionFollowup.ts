import {sourceRevision} from '../arch/text.js';

/** Isolated follow-up state prototype. Integration must store this on the exact agent
 * message that visibly asks the proposition. No persistence or transfer happens here. */
export interface PendingSavingIntention {
 version:1;id:string;kind:'ordinary-intention-note';customerId:string;conversationId:string;
 sourceMessageId:string;sourceText:string;sourceRevision:string;createdAt:string;expiresAt:string;
 visibleAgentMessageId:string;visibleQuestion:string;amount:number;period:'month'|'week';
 status:'pending'|'confirmed'|'canceled';
}
export type FollowupResult={status:'confirmed';note:{type:'fact';title:string;detail:string;sourceMessageId:string;confirmationMessageId:string};state:PendingSavingIntention}|{status:'canceled'|'expired'|'stale'|'unrelated'|'already-handled';state:PendingSavingIntention};
const minutes=20;
/** Source is an original customer turn, not model-authored title/detail. A limited
 * explicit intention grammar; unsupported wording creates no pending proposition. */
export function proposeIntentionNote(input:{customerId:string;conversationId:string;sourceMessageId:string;sourceText:string;now:string;visibleAgentMessageId:string}):PendingSavingIntention|null {
 if(!input.sourceMessageId||!input.visibleAgentMessageId||/\b(?:not|never|maybe|if|would|could|don't|do not|cancel|stop)\b/iu.test(input.sourceText))return null;
 const re=/\b(?:I want to save|I plan to save|save)\s+(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:euros?|EUR|€)?\s*(?:a|per|each|every)\s+(month|week)\s+(?:for|towards?)\s+([^.!?;\n]{2,80})[.!?]?$/giu;
 const matches=[...input.sourceText.matchAll(re)];if(matches.length!==1)return null;
 const m=matches[0],amount=Number(m[1].replace(/[ \u00a0\u202f]/g,'')+(m[2]?'.'+m[2]:''));
 if(!(amount>0&&amount<=1e9)||m.index!==0)return null;
 const now=Date.parse(input.now);if(!Number.isFinite(now))return null;
 const period=m[3].toLowerCase() as 'month'|'week';
 const question=`You said: "${input.sourceText}" Should I save just this saving intention as an ordinary note? This will not set a total target or deadline, and it will not move money.`;
 const bound={customerId:input.customerId,conversationId:input.conversationId,sourceMessageId:input.sourceMessageId,sourceRevision:sourceRevision(input.sourceText),visibleAgentMessageId:input.visibleAgentMessageId};
 return {...bound,version:1,id:'intention-'+sourceRevision(bound).slice(0,24),kind:'ordinary-intention-note',sourceText:input.sourceText,createdAt:input.now,expiresAt:new Date(now+minutes*60000).toISOString(),visibleQuestion:question,amount,period,status:'pending'};
}
/** Only a direct reply to the currently visible proposition can confirm. Callers
 * supply freshly read current source text and conversation sequence, not the model. */
export function consumeIntentionReply(state:PendingSavingIntention,input:{customerId:string;conversationId:string;messageId:string;text:string;now:string;lastAgentMessageId:string;currentSourceText:string|undefined;alreadySavedSourceMessageIds:ReadonlySet<string>}):FollowupResult {
 const same=input.customerId===state.customerId&&input.conversationId===state.conversationId;
 if(!same)return {status:'unrelated',state};
 if(state.status!=='pending'||input.alreadySavedSourceMessageIds.has(state.sourceMessageId))return {status:'already-handled',state};
 if(!Number.isFinite(Date.parse(input.now))||Date.parse(input.now)>Date.parse(state.expiresAt)||Date.parse(input.now)<Date.parse(state.createdAt))return {status:'expired',state:{...state,status:'canceled'}};
 if(input.currentSourceText===undefined||sourceRevision(input.currentSourceText)!==state.sourceRevision||input.lastAgentMessageId!==state.visibleAgentMessageId)return {status:'stale',state:{...state,status:'canceled'}};
 const text=input.text.trim().replace(/[.!]+$/,'').toLowerCase();
 if(/^(?:yes|yes please|save that intention|save the note|kyllä|joo)$/.test(text))return {status:'confirmed',state:{...state,status:'confirmed'},note:{type:'fact',title:'Saving intention',detail:state.sourceText,sourceMessageId:state.sourceMessageId,confirmationMessageId:input.messageId}};
 // A correction or topic switch cancels this proposition, even if it starts yes.
 return {status:'canceled',state:{...state,status:'canceled'}};
}
