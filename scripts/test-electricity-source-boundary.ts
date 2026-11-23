import assert from 'node:assert/strict';
import {reviewedContext as context} from '../src/server/advice/reviewedAnswer.js';
const opening="I'm confused about my electricity bill. I don't know my usage yet, but I want more predictable costs. Can you help me understand my options? Please don't change or sign me up for anything.";
const noOffer=context(opening,31,'2026-10-23',new Set());assert.match(noOffer,/ELECTRICITY EXPLANATION BOUNDARY/);assert.match(noOffer,/not the total bill/);assert.match(noOffer,/no current commercial option or availability is verified/);assert.doesNotMatch(noOffer,/Fictional partner|7\.9|3\.90|Lumivalo|25 €/);
assert.equal(context('I do not want electricity offers',31,'2026-10-23'), '');
const credit=context('Can I claim household tax credit for qualifying cleaning labour?',31,'2026-10-23');assert.match(credit,/BENEFIT STATUS/);assert.match(credit,/not a decision that a credit is approved/);assert.match(credit,/credit against tax/);
const unrelated=context('How do I change my bank card PIN?',31,'2026-10-23');assert.doesNotMatch(unrelated,/ELECTRICITY EXPLANATION|BENEFIT STATUS/);
const disclosed=context(opening,31,'2026-10-23',new Set(['energy']));assert.match(disclosed,/Fictional partner Lumivalo/);assert.match(disclosed,/ELECTRICITY EXPLANATION BOUNDARY/);
console.log('PASS electricity educational boundary without catalogue disclosure, conditional credit versus approved benefit, unrelated path unchanged. Source prompt contract only, not model factuality proof.');
