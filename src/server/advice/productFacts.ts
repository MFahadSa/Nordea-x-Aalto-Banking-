/** One current-rule-bound table for product quantities, separate from customer facts. */
import {loadRules} from './rules.js';import {sourceRevision} from '../arch/text.js';
import type {ProductTopic} from './productProse.js';
export type ProductFact={id:string;role:string;value:number;unit:'percent'|'EUR'|'count'|'year'|'day';sourceId:string;revision:string;sourceUrl:string};
export function currentProductFacts(topics:ReadonlySet<ProductTopic>,today:string):ProductFact[]|null {
 const out:ProductFact[]=[];
 const reviewed:Record<string,string>={'asp-account@2026-06-01':'1d7357cb6a0a0dc9fe95842cfd42418ab3d15b03bb248c2c2717bb9aa9b79b56','ps-account@2026-01-01':'aecb7802acc5d29ea4ed1460d413fdc29707ed199df7ae7cb73b6b8e93c996e2','ps-account@2027-01-01':'395c857fe06f5f7c1e381140d6a7415d9162557380424ea327e29792421794d8'};
 for(const topic of topics){const r=loadRules().rules.find(r=>r.id===topic&&r.validFrom<=today&&(!r.validTo||today<r.validTo)&&Date.parse(today)-Date.parse(r.source.checkedAt)<=r.reviewDays*86400000);if(!r||reviewed[r.id+'@'+r.version]!==sourceRevision(r))return null;
 const add=(id:string,role:string,value:number,unit:ProductFact['unit'])=>out.push({id:topic+':'+id,role,value,unit,sourceId:r.id+'@'+r.version,revision:sourceRevision(r),sourceUrl:r.source.url});
 if(topic==='asp-account'){
  const p=r.params;for(const [key,role,unit]of [['interest','annual deposit interest','percent'],['bonus','bonus interest','percent'],['deposits','qualifying monthly deposits','count'],['minDeposit','minimum monthly deposit','EUR'],['maxDeposit','maximum monthly deposit','EUR'],['share','ASP loan savings share','percent'],['bonusYears','following bonus accrual years','year'],['taxIfOtherUse','tax on interest after other-use closure','percent'],['minAge','minimum opening age','year']] as const){if(typeof p[key]!=='number')return null;add(key,role,p[key] as number,unit);}
  // Calendar values originate in the same reviewed rule, not from personal dates.
  if(p.interestDay!=='31 December'||p.reformDate!=='1 June 2026')return null;
  add('cancellation-days','online/app cancellation period',14,'day');add('interest-day','annual deposit-interest credit day',31,'day');add('reform-day','upper-age reform day',1,'day');add('reform-year','upper-age reform year',2026,'year');
  // Minor ages and combined interest are source-derived constants requiring the reviewed version.
  if(r.version!=='2026-06-01')return null;add('minor-age-16','minor opening age',16,'year');add('minor-age-17','minor opening age',17,'year');add('combined-interest','maximum combined interest',(p.interest as number)+(p.bonus as number),'percent');
 }else{
  const p=r.params;if(typeof p.max!=='number')return null;
  add('deduction-cap','annual eligible payment deduction cap',p.max,'EUR');add('withdrawal-balance','total historical PS balance ceiling',p.max,'EUR');
  for(const [id,key,role]of [['deduction-year','lastDeductionYear','last eligible payment deduction year'],['withdrawal-first','firstWithdrawalYear','first special withdrawal year'],['withdrawal-last','lastWithdrawalYear','last special withdrawal year']] as const){const v=Number(p[key]);if(!Number.isInteger(v))return null;add(id,role,v,'year');}
  if(p.endDate!=='1 January 2027')return null;add('historical-day','historical balance test day',1,'day');add('historical-year','historical balance test year',2027,'year');
  // Current official PS page gives normal capital-gains rate; existing catalogue deliberately only says normal tax.
  // No exemption is minted from this rate alone. Bind supplemental source evidence to the reviewed rule version.
  if(!['2026-01-01','2027-01-01'].includes(r.version))return null;add('normal-tax','normal capital gains tax',30,'percent');
 }
 }
 return out;
}
