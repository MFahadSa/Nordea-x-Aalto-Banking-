import assert from 'node:assert/strict';
import {transferMeaning,transferClarification,transferIsOnce} from '../src/server/transfers.js';
for(const t of ["move 100 to savings, don't make it monthly",'no need for monthly, just move 100 to savings','no recurring, move 100 to savings','siirrä 100 säästötilille, älä kuukausittain']) {assert.equal(transferClarification(t),null,t);assert.equal(transferIsOnce(t,''),true,t);}
for(const t of ['Can you move 200 to savings every month?','can u move 20 2 savings pls',"I don't want to wait, move 100 now",'siirrä 25 säästötilille nyt','Voisitko siirtää 25 säästötilille joka kuukausi?'])assert.equal(transferClarification(t),null,t);
for(const t of ['Move 100 to savings this month','move 100 to car fund then 50 to savings','move 100 to savings and 50 to car fund','When does it start?','Will it move today?','odota'])assert.ok(transferClarification(t),t);
assert.equal(transferMeaning('Move 25 to savings just once').once,true);assert.equal(transferMeaning('Move 25 to savings not every month').clarification!==null,true);
for(const t of ['No recurring','Not monthly','Not today, maybe monthly later','When would it move if not monthly?'])assert.ok(transferClarification(t),t);
for(const t of ['Move 100 now to savings, not monthly','No recurring, move 100 to savings','Move 100 to savings today, not every month'])assert.equal(transferClarification(t),null,t);
for(const t of ['move 1k to savings','move 1,5k to savings','move two hundred to savings'])assert.match(transferClarification(t)||'',/exact euro amount/);
console.log('PASS independent-review transfer negatives, polite requests, Finnish requests, compound and timing ambiguities. Deterministic mechanics only.');

for(const t of ['move 100 to savings then actually no wait cancel that','siirrä 100 säästötilille mutta peruuta se','move 100 to savings, no wait make that 200'])assert.ok(transferClarification(t),t);
