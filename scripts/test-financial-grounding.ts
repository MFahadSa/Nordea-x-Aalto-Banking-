import assert from 'node:assert/strict';
import {financialGroundingProblem as p} from '../src/server/advice/financialGrounding.js';
assert.ok(p('Your cottage budget is 8765 euros.',[{label:'Cottage plan',text:'A summer visit is planned.'}]));
assert.ok(p('Your loan is 8765 euros.',[{label:'Cottage budget',text:'Cottage budget 8765 euros'}]));
assert.ok(p('Your loan runs for 7 years.',[{label:'Loan',text:'Student loan details are not known.'}]));
assert.equal(p('The cottage budget is 8765 euros.',[{label:'Cottage budget',text:'Cottage budget 8765 euros'}]),null);
assert.equal(p('The contribution is 200 × 12 = 2400 euros.',[{label:'Contribution',text:'Contribution is 200 euros for 12 months.'}]),null);
assert.ok(p('The contribution is 200 × 12 = 2500 euros.',[{label:'Contribution',text:'Contribution is 200 euros for 12 months.'}]));
console.log('PASS financial source grounding unit: unrelated numeral, title-only missing detail, invented duration, exact source and explicit arithmetic. Not a universal role-semantic proof.');
