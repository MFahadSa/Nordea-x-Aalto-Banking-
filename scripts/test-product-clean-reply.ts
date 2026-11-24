import assert from 'node:assert/strict';import {cleanReply} from '../src/server/abel.js';
assert.equal(cleanReply('A Nord\u202fea adviser can help.'),'A Nordea adviser can help.');
for(const t of ['Ask Nord ea about this.','Ask Anna Maria about this.','You save 1\u202f500 euros.','The first home is yours.'])assert.equal(cleanReply(t),t);
console.log('RESULT narrow brand corruption repair5checks');
