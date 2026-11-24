/** Unit checks for verifiedProseFigures: a personal figure in Nora's own words passes only when its value,
 *  unit and meaning match one current role-bound fact. Fictional figures (Lauri's demo data shape). */
import assert from 'node:assert/strict';
import { verifiedProseFigures } from '../src/server/advice/proseFigures.js';
import type { VerifiedFact } from '../src/server/advice/financialRegistry.js';

const q = (entity: string, field: string, role: VerifiedFact['role'], value: number, per?: 'month'): VerifiedFact => ({ id: `${entity}:${field}`, sourceId: 'bank:test', sourceRevision: 'r', entity, field, role, kind: 'quantity', quantity: { value, unit: 'EUR', ...(per ? { per } : {}) }, evidence: { type: 'typed-field' } });
const facts: VerifiedFact[] = [
  q('Income', 'current_income', 'income', 3900, 'month'),
  q('All tracked spending', 'average_spending', 'cost', 2107, 'month'),
  q('Spending: housing', 'average_spending', 'cost', 1150, 'month'),
  q('Spending: groceries', 'average_spending', 'cost', 410, 'month'),
  q('Spending: restaurants (2026-09)', 'last_full_month_spending', 'cost', 510),
  q('Payday plan', 'saving_rate', 'saving', 400, 'month'),
  q('Payday plan', 'left_over_after_spending_and_saving', 'balance', 1390, 'month'),
  { id: 'loan:end', sourceId: 'cab:loan', sourceRevision: 'r', entity: 'Student loan', field: 'end_date', role: 'calendar', kind: 'calendar', calendar: { year: 2027, month: 6 }, evidence: { type: 'typed-field' } },
];
facts.push({ id: 'card:0:transfer_amount', sourceId: 'card:0', sourceRevision: 'this-turn', entity: 'Car fund', field: 'transfer_amount', role: 'saving', kind: 'quantity', quantity: { value: 40, unit: 'EUR' }, evidence: { type: 'typed-field' } });
let pass = 0;
const ok = (text: string) => { const r = verifiedProseFigures(text, facts); assert.equal(r.ok, true, `${text} → ${JSON.stringify(r)}`); pass++; };
const no = (text: string, why: RegExp) => { const r = verifiedProseFigures(text, facts); assert.equal(r.ok, false, `${text} should be refused`); assert.match((r as any).reason, why); pass++; };

// Accepted: value, unit and meaning agree.
ok('Your average spending is 2 107 € a month.');
ok('Housing is your biggest cost at about 1 150 € a month, then groceries at 410 €.');
ok('You save 400 € a month, which leaves about 1 390 € left over after spending and saving.');
ok('Your salary is 3 900 € a month.');
ok('You spent 510 € on restaurants in September.');
ok('Saving 400 € a month is 4 800 € a year.');            // derived ×12 from a verified figure
ok('Your student loan ends in 2027.');
ok('Hi Lauri! Would you like a quick look at your budget?'); // no figures at all
ok('You have 2 goals and 3 ideas to look at.');
ok('Which month do you want to start, January or March?'); // months offered as a choice, not a claim
ok('I can set up a transfer of 40 € from your current account to the car fund.'); // the amount on the card prepared this turn             // small counts are not amounts

// Refused: invented values.
no('You earn 3 200 € a month.', /not one of the current personal facts/);
no('Groceries cost 455 € a month.', /not one of the current personal facts/);
no('Your car fund balance is 40 €.', /does not describe it as that/); // the card amount is not a balance
// Refused: a real value described as something else (role swap).
no('Your salary is 2 107 € a month.', /does not describe it as that/);
no('You have 1 390 € on your account right now.', /does not describe it as that/);
no('Your savings goal target is 1 150 €.', /does not describe it as that/);
// Refused: percentage, unchecked month.
no('You spend 54 % of your income.', /percentage/);
// Refused: names the item but not what the figure is.
no('Your payday plan has 400 € a month.', /does not describe it as that/);
no('You spent 510 € on restaurants in October.', /month "october"/);
console.log(`PASS prose figures: ${pass} checks (accepts verified figures in their own role, refuses invented values, role swaps, percentages and unchecked months)`);
