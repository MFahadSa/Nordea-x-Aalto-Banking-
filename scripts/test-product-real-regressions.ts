import assert from 'node:assert/strict';import {validateProductProse} from '../src/server/advice/productProse.js';
const ps=new Set<'ps-account'>(['ps-account']);const day='2026-10-23';
for(const text of ['Contributions made after 1 January 2027 are not tax-deductible.',"Contributions after 2026 won't be tax-deductible."]){const r=validateProductProse(text,ps,day);assert.ok(r.ok,JSON.stringify({text,r}));}
for(const text of ['Contributions made in 2027 are tax-deductible.','If you open a PS account and keep the balance under the limit, the amount could be withdrawn then without extra tax.','Funds could be withdrawn in 2027 or later.']){const r=validateProductProse(text,ps,day);assert.ok(!r.ok,JSON.stringify({text,r}));}
for(const text of ['If you stop paying for a while, you lose the 4% bonus.','Taking a break means you lose the bonus.','If you stop saving for a while, the bonus will be cancelled.'])assert.ok(!validateProductProse(text,new Set(['asp-account']),day).ok,text);
assert.ok(!validateProductProse('Stopping deposits also means you miss out on the regular 1% interest for the months you do not have a balance growing.',new Set(['asp-account']),day).ok);
assert.ok(validateProductProse('A first-time home saver 15 years or older may open an ASP account, subject to the other conditions.',new Set(['asp-account']),day).ok);
assert.ok(!validateProductProse('Closing the account early cancels the bonus and triggers 30% tax on interest.',new Set(['asp-account']),day).ok);
assert.ok(!validateProductProse('Anyone 15 years or older can open one and make monthly deposits.',new Set(['asp-account']),day).ok);
console.log('RESULT actual-diagnostic causal product regressions12checks');
