import {catalogue} from './guard.js';
import {sourceRevision} from '../arch/text.js';
import type {Rule} from './rules.js';
export const PRODUCT_FACT_IDS=['asp.overview','asp.deposits','asp.accounts','asp.loan','asp.interest','ps.deduction','ps.withdrawal','ps.above'] as const;
export type ProductFactId=typeof PRODUCT_FACT_IDS[number];
export type ProductFact={id:ProductFactId;ruleId:string;version:string;revision:string;source:string;checkedAt:string;clauseRevision:string;text:string};
/** Indivisible checked clauses, selected by the model, never model-authored numeric rules.
 * These are general terms only, not customer eligibility or a completed action.
 */
export function productFacts(today:string):ProductFact[]{
 const reviewed:Record<string,string>={'asp-account@2026-06-01':'244ef0fbfa3342d9bff7de6cf505c1a836fe5024b3607c92eca45aeed113d9b3','ps-account@2026-01-01':'aecb7802acc5d29ea4ed1460d413fdc29707ed199df7ae7cb73b6b8e93c996e2','ps-account@2027-01-01':'395c857fe06f5f7c1e381140d6a7415d9162557380424ea327e29792421794d8'};
 // today is the fixed fictional banking date, not the source-check clock.
 // Reviewed revisions and the clause checkedAt below bind the current source audit.
 const current=(id:string)=>catalogue().find(r=>r.id===id&&reviewed[r.id+'@'+r.version]===sourceRevision(r)&&r.validFrom<=today&&(!r.validTo||today<r.validTo)&&Number.isFinite(Date.parse(today))&&Date.parse(today)-Date.parse(r.source.checkedAt)<=r.reviewDays*86400000);
 const facts:ProductFact[]=[];
 const add=(r:Rule,id:ProductFactId,text:string)=>facts.push({id,ruleId:r.id,version:r.version,revision:sourceRevision(r),source:r.source.url,checkedAt:'2026-11-25',clauseRevision:sourceRevision({id,text,source:r.source.url,checkedAt:'2026-11-25'}),text});
 const a=current('asp-account');if(a){const p=a.params;
 add(a,'asp.overview',`ASP is a separate savings account for first-time home buyers. You may start from age ${p.minAge} if you have never bought 50% or more of a property. Ages 15 to 17 open with a guardian by calling Nordea. The upper opening-age limit was removed on ${p.reformDate}. These general conditions are not a personal eligibility decision.`);
 add(a,'asp.deposits',`For a new ASP account, the first deposit is at least ${p.minDeposit} euros. The monthly scheme requires at least ${p.deposits} approved monthly deposits, each from ${p.minDeposit} to ${Number(p.maxDeposit).toLocaleString('en-IE')} euros. The months need not be consecutive. Accounts opened before ${p.reformDate} may keep quarterly saving, switch to monthly saving or combine them.`);
 add(a,'asp.accounts','An ASP account is separate from a current account used for everyday banking. You may keep your current account. You may have only one ASP account, but can transfer it between banks. Existing current-account ownership does not establish ASP eligibility.');
 add(a,'asp.loan',`Once ASP savings cover at least ${p.share}% of the home price, or of your share when buying together, you may apply for an ASP loan. This does not promise loan approval.`);
 add(a,'asp.interest',`ASP pays ${p.interest}% annual deposit interest. The separate ${p.bonus}% bonus accrues for the opening/saving year and the next ${p.bonusYears} calendar years, and is paid later after at least ${p.deposits} approved monthly deposits and a qualifying first-home purchase with an ASP or regular home loan. Tax-free treatment depends on using the savings for that first-home purchase with a home loan.`);
 }
 const ps=current('ps-account');if(ps){const p=ps.params;
 if(today<'2027-01-01')add(ps,'ps.deduction',`Eligible PS payments in ${p.lastDeductionYear} may qualify for a tax deduction within a generally combined annual cap of ${Number(p.max).toLocaleString('en-IE')} euros and other conditions. This is not a tax refund or a deductible account balance. The deduction right ends on ${p.endDate}.`);
 add(ps,'ps.withdrawal',`If total PS savings do not exceed ${Number(p.max).toLocaleString('en-IE')} euros on ${p.endDate}, they may be withdrawn in one go in ${p.firstWithdrawalYear} or ${p.lastWithdrawalYear} without the higher tax rate. Normal 30% capital-gains tax still applies. This special lump sum is unavailable if retirement age has already been reached AND planned PS withdrawals have started. A balance on another date does not establish this test.`);
 add(ps,'ps.above',`If total PS savings exceed ${Number(p.max).toLocaleString('en-IE')} euros on ${p.endDate}, premature withdrawal without the higher tax rate requires a specific reason: divorce, a spouse's death, serious illness or prolonged unemployment. This is not an unrestricted or excess-only withdrawal right.`);
 }return facts;
}
export function selectedProductFacts(ids:unknown,available:ProductFact[]):ProductFact[]{
 if(!Array.isArray(ids)||ids.length>3||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw Error('Choose at most three distinct current product fact IDs.');
 return ids.map(id=>{const f=available.find(f=>f.id===id);if(!f)throw Error('Product fact is unknown, expired or unavailable.');return f;});
}
/** Not a semantic proof. Blocks observed unsafe connective prose; facts belong in clauses. */
export function productConnectiveProblem(text:string):string|null{
 if(/\d|%/u.test(text))return 'Put product numbers only in selected productFacts clauses. Do not restate them in text.';
 if(/\b(?:unlimited|no limits?|no conditions?|always eligible|automatically eligible|definitely eligible|you (?:are|qualify|can open|can withdraw)|guaranteed|tax.free|maximum deposit|minimum deposit|any amount|any time|whenever you want)\b/iu.test(text))return 'Keep eligibility and banking conditions in the selected checked clauses, not an unverified claim in connective prose.';
 return null;
}
