/** Product source identity only. It never approves an answer or establishes customer eligibility. */
import {loadRules} from './rules.js';
import {sourceRevision} from '../arch/text.js';
import {purposeOf} from './purpose.js';
export type AspSourceIdentity={id:string;revision:string};
export function currentAspIdentity(today:string):AspSourceIdentity|null{
 const r=loadRules().rules.find(r=>r.id==='asp-account'&&r.validFrom<=today&&(!r.validTo||today<r.validTo)&&Date.parse(today)-Date.parse(r.source.checkedAt)<=r.reviewDays*86400000);
 return r?{id:r.id+'@'+r.version,revision:sourceRevision(r)}:null;
}
export function aspRequestIdentity(request:string,today:string,prior?:AspSourceIdentity):AspSourceIdentity|undefined{
 const current=currentAspIdentity(today);if(!current)return;
 if(/\b(?:new topic|different topic|change (?:the )?subject|PS account)\b/i.test(request))return;
 if(['banking','plan'].includes(purposeOf(request)))return;
 const question=/\?\s*$/.test(request)||/^(?:and\s+|so\s+|wait[, ]+)?(?:what|how|why|when|who|is|are|does|do|can I|could I|explain|tell me about)\b/i.test(request.trim());
 if(!question)return;
 const explicit=/\bASP\b|first[- ](?:home|place)/i.test(request);
 const linked=prior?.id===current.id&&prior.revision===current.revision&&(/\b(?:bonus|deposit interest|accrual|monthly deposits?|quarterly|opening age)\b/i.test(request)||/^(?:(?:and|so|wait)[, ]+)?(?:what about (?:that|it)|could you (?:put|explain) that|can you explain that|tell me more|more simply|why is that|is that|how does that)\b/i.test(request.trim()));
 return explicit||linked?current:undefined;
}
