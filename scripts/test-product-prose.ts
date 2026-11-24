/** Exact reviewed ASP/PS sentences may pass the personal-number gate. Scripted, no paid model calls. */
import assert from 'node:assert/strict';
import { verifiedProseFigures, verifiedReplyFigures } from '../src/server/advice/proseFigures.js';
import { reviewedProductSentences } from '../src/server/advice/reviewedAnswer.js';
const asp = reviewedProductSentences('Explain ASP', '2026-10-23');
const ps = reviewedProductSentences('Explain PS', '2026-10-23');
let n=0;
const check=(text:string, sources:string[], expected:boolean)=>{assert.equal(verifiedReplyFigures(text,[],sources).ok,expected,text);n++;};
for(const sentence of [...asp,...ps].filter(s=>/\d/.test(s)))check(sentence,[...asp,...ps],true);
assert.ok(asp.some(s=>/4 %/.test(s)));assert.ok(ps.some(s=>/1 January 2027/.test(s)));
for(const sentence of asp.filter(s=>!verifiedProseFigures(s,[]).ok))check(sentence,ps,false);
for(const sentence of ps.filter(s=>!verifiedProseFigures(s,[]).ok))check(sentence,asp,false);
for(const sentence of [...asp,...ps].filter(s=>/\d/.test(s))){
 const altered=sentence.replace(/\d/,d=>String((Number(d)+1)%10));
 if(!verifiedProseFigures(altered,[]).ok)check(altered,[...asp,...ps],false);
 check('Your balance is 5000 euros. '+sentence,[...asp,...ps],false);
 check(sentence.replace(/\.$/,'')+' and your balance is 5000 euros.',[...asp,...ps],false);
}
check('Your PS balance is 5000 euros on 1 January 2027.',ps,false);
check('ASP pays 4 % interest plus a 1 % bonus.',asp,false);
check('Withdrawals are tax-free in 2027.',ps,false);
check('You qualify for an ASP account at age 15.',asp,false);
check('Your pension balance is 5000 euros and is deductible in 2026.',ps,false);
assert.deepEqual(reviewedProductSentences('Explain ASP','2027-12-01'),[]);
assert.deepEqual(reviewedProductSentences('Explain PS','2025-12-31'),[]);
assert.deepEqual(reviewedProductSentences('what is my salary?','2026-10-23'),[]);
assert.deepEqual(reviewedProductSentences('PS: thanks','2026-10-23'),[]);
console.log(`PASS product prose: ${n} exact-source/negative checks, plus stale/date/topic boundaries`);
