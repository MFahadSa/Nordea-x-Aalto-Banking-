import assert from 'node:assert/strict';import {checkGoalWrite as check} from '../src/server/advice/goalWriteEvidence.js';
const today='2026-10-23';
assert.equal(check('I earn 3 000 a month and I want a Lisbon trip fund next June',{amount:3000,date:'2027-06-30'},'add',today).amount,undefined);
assert.equal(check('I start my job in March. I want to save 1 200 for an e-bike at some point',{amount:1200,date:'2027-03-31'},'add',today).date,undefined);
let x=check('change my Lisbon trip target to 2 600',{amount:2600,date:'2029-01-31'},'update',today);assert.equal(x.amount,2600);assert.equal(x.date,undefined);
x=check('I got paid 3 900 this month, make Lisbon later in autumn 2027',{amount:3900,date:'2027-10-31'},'update',today);assert.equal(x.amount,undefined);assert.equal(x.date,undefined);
x=check('I want to save 5 000 euros for an observatory by June 2027',{amount:5000,date:'2027-06-30'},'add',today);assert.equal(x.amount,5000);assert.equal(x.date,'2027-06-30');assert.equal(x.dateEvidence?.precision,'month-end');
x=check('move Lisbon trip to 2 600 euros by September 2027',{amount:2600,date:'2027-09-30'},'update',today);assert.equal(x.amount,2600);assert.equal(x.date,'2027-09-30');
for(const text of ['save 200 a month','save 200 euros per month','save 200 monthly']){const r=check(text,{amount:200,date:'2027-12-31'},'add',today);assert.ok(r.question);if(!text.endsWith('monthly'))assert.equal(r.amount,undefined);}
for(const [text,amount] of [['save 1 20 euros by June 2027',120],['save 1 200,50 euros by June 2027',200.5],['I do not want to save 5000 by June 2027',5000],['maybe save 5000 by June 2027',5000]] as const)assert.ok(check(text,{amount,date:'2027-06-30'},'add',today).question,text);
x=check('save 1 200,50 euros by June 2027',{amount:1200.5,date:'2027-06-30'},'add',today);assert.equal(x.amount,1200.5);
assert.equal(check('save 5000 by 2028',{amount:5000,date:'2028-12-31'},'add',today).dateEvidence?.precision,'year-end');
assert.equal(check('save 5000 by 2027-06-30',{amount:5000,date:'2027-06-30'},'add',today).dateEvidence?.precision,'exact');
assert.ok(check('Haluan säästää 3000 euroa pyörään ensi kesäksi',{amount:3000,date:'2027-06-30'},'add',today).question);
console.log('PASS bounded goal field validation: cross-role and unrelated date rejection, exact create/update, unchanged date, period is not target, grouping/decimal, negation/uncertainty, seasonal hold, explicit precision. Not universal prose parsing.');

assert.match(check('I want to save 3000 dollars for a car by March 2027',{amount:3000,date:'2027-03-31'},'add',today).question||'',/currency/);
const multi=check('I want to save 1000 euros for a trip by May 2027 and 500 euros for a phone by August 2027',{amount:1000,date:'2027-08-31'},'add',today);assert.equal(multi.amount,undefined);assert.equal(multi.date,undefined);assert.match(multi.question||'',/more than one/);
console.log('PASS non-EUR and multi-goal proposals do not mint wrong partial facts.');
const idiom=check('I never remember to save money, can you help me set up a goal of 200 a month?',{amount:2400,date:'2027-12-31'},'add',today);assert.equal(idiom.amount,undefined);assert.equal(idiom.date,undefined);assert.match(idiom.question||'',/regular saving amount/);
assert.match(check('Never save 2400 for a holiday by December 2027',{amount:2400,date:'2027-12-31'},'add',today).question||'',/not changed/);
console.log('PASS habitual forgetting is not a save refusal; explicit never-save remains no-change.');
for(const [text,amount,date] of [
 ['Create a new goal: telescope fund 700 euros by 2028-02-01',700,'2028-02-01'],
 ['Please add a goal: 4500 for a bicycle by 2028-07-31',4500,'2028-07-31'],
 ['New goal: bicycle, 4,500 euros, by July 31 2028',4500,'2028-07-31'],
] as const){const x=check(text,{amount,date},'add',today);assert.equal(x.amount,amount,text);assert.equal(x.date,date,text);assert.equal(x.question,undefined,text);}
x=check('I am saving up 1700 for a laptop by next summer',{amount:1700,date:'2027-08-31'},'add',today);assert.equal(x.amount,1700);assert.equal(x.date,undefined);assert.match(x.question!,/1700 EUR.*deadline/);
for(const text of ['My balance: 4500 euros. Please add a bicycle goal by July 2028','My payday: July 2028. Create a goal: 4500 euros for a bicycle','New goal: 50 euros per month for a bicycle by July 2028','Do not create a goal: 4500 euros for a bicycle by July 2028']){x=check(text,{amount:4500,date:'2028-07-31'},'add',today);assert.ok(x.question,text);assert.ok(!x.amount||!x.date,text);}
console.log('PASS scoped colon goal continuations, comma thousands and English day date; saving-up retains amount while seasonal date asks; unrelated balance/date, period and refusal stay blocked');
for(const text of ['Save a new goal: bike by 2027-06-30, my rent is 900 euros','Create a goal: bike by 2027-06-30, our heating costs 900 euros','New goal: bike by 2027-06-30, the repair bill is 900 euros','New goal: bike by 2027-06-30, I pay 900 euros in fees']){const r=check(text,{amount:900,date:'2027-06-30'},'add',today);assert.equal(r.amount,undefined,text);assert.ok(r.question,text);}
assert.match(check('New goal: bike, do not save 900 euros by 2027-06-30',{amount:900,date:'2027-06-30'},'add',today).question!,/not changed or saved/);
console.log('PASS colon continuation stops distinct-subject cost clauses; explicit embedded do-not-save wins');

assert.equal(check('Add a goal: bike by 2027-06-30 (my rent is 900 euros)',{amount:900,date:'2027-06-30'},'add',today).amount,undefined);
x=check('Add a goal: bike (target 900 euros) by 2027-06-30',{amount:900,date:'2027-06-30'},'add',today);assert.equal(x.amount,900);assert.equal(x.date,'2027-06-30');console.log('PASS parenthetical other-subject cost excluded; explicit parenthetical target retained');
