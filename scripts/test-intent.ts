/**
 * v28: the card in a chat reply comes from the customer's words, decided by code. The same words must
 * always give the same card, and words that are not about a product must give none.
 */
const { intentsOf } = await import('../src/server/advice/intent.js');
let passed = 0, failed = 0;
const first = (t: string) => { const i = intentsOf(t)[0]; return i ? (i.partner ? `partner:${i.partner}` : `rule:${i.rule}`) : 'none'; };
const cases: [string, string][] = [
  // Progress, plans and everyday talk: never a card.
  ['am i on track for the flat', 'none'],
  ['Am I on track for the flat?', 'none'],
  ['How much is in my accounts?', 'none'],
  ['Plan my next payday', 'none'],
  ['Can I afford a 1 000 € holiday?', 'none'],
  ['Mia and I are getting married next summer, about 15 000 €', 'none'],
  ['Delete my car goal', 'none'],
  ['Can I get a mortgage pre-approval for the flat?', 'none'],
  ['Mia has knee surgery in March', 'none'],
  ['What do you know about me?', 'none'],
  ['Hi Abel', 'none'],
  ['We bought a new sofa', 'none'],
  ['My salary went up', 'none'],
  // Looking for a home right now: the homes partner.
  ['We are going to flat viewings in Kalasatama on Saturday', 'partner:homes'],
  ['We are going to flat viewings in Kalasatama on Saturday”', 'partner:homes'],
  ['we are looking at flats in Espoo', 'partner:homes'],
  ['Any good apartments for sale?', 'partner:homes'],
  ['searching for a house', 'partner:homes'],
  // Saving for a home: the ASP question.
  ['We are saving for a flat with Mia', 'rule:asp-account'],
  ['I am saving towards my first home', 'rule:asp-account'],
  ['what is ASP', 'rule:asp-account'],
  // Investing, studies, family, household work, PS.
  ['How should I start to invest?', 'rule:equity-account-under-30'],
  ['“How should I start to invest?”', 'rule:equity-account-under-30'],
  ['should I buy index funds', 'rule:equity-account-under-30'],
  ['I just started at Aalto', 'rule:kela-loan-writeoff'],
  ['I got into university this autumn', 'rule:kela-loan-writeoff'],
  ['what about my student loan', 'rule:kela-loan-writeoff'],
  ['I would like to help my grandchildren', 'rule:gift-limit'],
  ['Can I give money to my kids tax-free?', 'rule:gift-limit'],
  ['We pay a cleaner every week', 'rule:household-credit'],
  ['We are renovating the bathroom', 'rule:household-credit'],
  ['Should I keep my PS account?', 'rule:ps-account'],
  // Partners for their own jobs.
  ['Our electricity bill jumped since we started charging the new EV at home', 'partner:energy'],
  ['Do I need home insurance?', 'partner:insure'],
  ['We need movers for next month', 'partner:movers'],
  ['I want a money plan with a financial planner', 'partner:planner'],
];
for (const [t, want] of cases) {
  const got = first(t);
  if (got === want) passed++; else { failed++; console.log(`FAIL  "${t}" → ${got}, expected ${want}`); }
}
// What the words already answer.
const imp = (t: string) => JSON.stringify(intentsOf(t)[0]?.implies || {});
for (const [t, want] of [
  ['How should I start to invest?', '{"interestedInInvesting":true}'],
  ['I just started at Aalto', '{"isHigherEducationStudent":true}'],
  ['We are saving for a flat with Mia', '{"savingForHome":true}'],
  ['I would like to help my grandchildren', '{"helpsFamilyWithMoney":true}'],
  ['We are renovating the bathroom', '{}'],
] as [string, string][]) {
  if (imp(t) === want) passed++; else { failed++; console.log(`FAIL  implies "${t}" → ${imp(t)}, expected ${want}`); }
}
console.log(`\nRESULT ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
