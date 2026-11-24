import assert from 'node:assert/strict';import fs from 'node:fs';import {validateProductProse} from '../src/server/advice/productProse.js';
const today='2026-10-23';let n=0;
const check=(text:string,topic:'asp-account'|'ps-account',ok:boolean)=>{const r=validateProductProse(text,new Set([topic]),today);assert.equal(r.ok,ok,JSON.stringify({text,r}));n++;return r;};
const goods:[string,'asp-account'|'ps-account'][]=[
 ['ASP pays 1% annual deposit interest. The bonus interest is 4%.','asp-account'],
 ['You need 20 approved monthly deposits, not necessarily consecutive.','asp-account'],
 ['Monthly ASP deposits are between 50 and 1,500 euros.','asp-account'],
 ['An ASP loan application requires savings of at least 10% of the home price.','asp-account'],
 ['The bonus rate is 4%, paid after 20 approved monthly deposits and a home purchase with an ASP loan or regular home loan.','asp-account'],
 ['The bonus accrues for the opening year and the next five calendar years.','asp-account'],
 ['The payment deduction cap is 5,000 euros in 2026. This is separate from the historical PS balance test on 1 January 2027.','ps-account'],
 ['If total PS savings do not exceed 5,000 euros on 1 January 2027, the whole balance may be withdrawn in 2027 or 2028 without the higher tax rate. Normal 30% tax still applies.','ps-account'],
 ['You cannot use the lump-sum option if retirement age has been reached and planned withdrawals have started.','ps-account'],
 ['The account permits a break from saving; deposits do not have to be consecutive.','asp-account'],
];for(const [t,p]of goods)check(t,p,true);
const bads:[string,'asp-account'|'ps-account'][]=[
 ['ASP pays 9% interest.','asp-account'],['The bonus is 1%.','asp-account'],['Annual deposit interest is 4%.','asp-account'],
 ['To qualify for the bonus, your savings must cover 10% of the price.','asp-account'],
 ['Bonus conditions:\nYou need savings equal to 10% of the home price.','asp-account'],
 ['The bonus stops during a saving pause and resumes once you pay in again.','asp-account'],
 ['No bonus or interest is lost while you are on a break.','asp-account'],
 ['Once you reach 20 monthly deposits, the bonus is paid.','asp-account'],
 ['You are eligible for the PS withdrawal.','ps-account'],
 ['Your PS balance is 5,000 euros.','ps-account'],
 ['The PS withdrawal will be tax-free.','ps-account'],
 ['Only the excess over 5,000 euros is taxed.','ps-account'],
 ['Without one of those reasons, any withdrawal will be taxed at the normal 30% capital-gains rate on the amount withdrawn.','ps-account'],
 ['The deduction depends on having a historical balance of 5,000 euros.','ps-account'],
 ['The lump sum is not available if retirement age is reached or planned withdrawals have started.','ps-account'],
 ['To withdraw, you must reach retirement age and planned withdrawals must have started.','ps-account'],
 ['ASP deposits must be consecutive.','asp-account']
];for(const [t,p]of bads)check(t,p,false);
for(const text of ['Your salary is 5,000 euros.','Your current account balance is 1,500 euros.','You save 400 euros a month.']){const r=check(text,'asp-account',true);assert.ok(r.ok&&r.personalText===text);}
assert.equal(validateProductProse('The bonus rate is 4%.',new Set(['asp-account']),'2028-01-01').ok,false);n++;
const high=JSON.parse(fs.readFileSync('review/fixtures/saved-natural-answers.json','utf8'));for(const row of high.records){const p=row.scenario.includes('ps')?'ps-account':'asp-account';const r=validateProductProse(row.answer,new Set([p]),today);console.log('SAVED',row.scenario,r.ok,r.ok?'':r.reason);}
console.log('RESULT product prose:',n,'checks');
