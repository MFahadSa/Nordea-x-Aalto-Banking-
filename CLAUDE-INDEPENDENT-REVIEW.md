# Independent Claude review: Nora customer-path corrections

## Owner's requested workflow

Review the scoped fix branch and pull request independently before the owner merges it. Do not treat the author's test results as proof. The owner authorized publishing only the fix branch and opening a review pull request. No merge, main-branch update or app deployment is included. After the owner publishes an updated build, customer-UI retesting is still required before recording the remaining videos.

## Baseline and package

- Repository: https://github.com/MFahadSa/Nordea-x-Aalto-Banking-
- Base: main at `c876f8bd95ff80b8b0220034c4e16a936b666ab2`.
- Review branch: `fix/customer-path-accuracy-20261123`.
- Deliverables: full source ZIP, patch against that base, and this review file. No dependencies, secrets, local data, `.git` directory or production build are included in the source ZIP.
- These changes are being handed off through a separate review branch and pull request. The public demonstration is still the previous version. Review the live PR head SHA before testing; do not assume an earlier ZIP or patch is the latest revision.

Prefer checking out the PR branch in a separate worktree. If the owner's local branch has moved or contains uncommitted work, do not overwrite it with the ZIP. Apply the patch in a separate worktree or branch, inspect conflicts, and preserve unrelated changes. Suggested starting check: `git apply --check nora-customer-path-corrections.patch`. Apply only after that check succeeds and the diff is reviewed.

## What was wrong and what changed

### Financial rules and replies

1. Youth custody offer used under 30 in both its age condition and title. The persisted rule ID stays `equity-account-under-30` for compatibility, but its condition is now age 18–27, title says under 28, and wording separates custody from trading fees and separate advice.
2. Gift response used a five-year/EUR 5,000/excess-only rule. The reviewed response and rule now use less than EUR 7,500, same donor and recipient, rolling three years, threshold itself taxable on combined value. A gift-receipt question no longer saves the unrelated assertion that the customer helps children/grandchildren with money.
3. Household response confused tax credit with income deduction. Rule and reviewed response now describe a credit against tax, company labour including VAT, 40%, EUR 150 annual own liability and EUR 2,100 maximum in 2026/2027, plus eligibility/tax limits. The EUR 600 example gives EUR 90 conditionally.
4. Kela response substituted student-support income testing and bank repayment breaks for compensation. Reviewed answer distinguishes the capped compensation, timing and cohort conditions. The rule now allows the earlier-admission/later-first-attendance exception through an additional fact, rather than rejecting every pre-August-2014 admission.
5. PS answers lacked qualifications and the 2027 rule used today's balance. New `psBalanceAt2027Start` is populated only by a bank snapshot dated 1 January 2027. A current or December-2026 balance does not establish this test. Reviewed educational answer explains 2026 contribution deductions, the 2027/2028 whole-balance transition and normal taxable treatment without claiming personal eligibility.
6. ASP response confused projected future shortfall with money remaining to save now. `goalStatus` now exposes `remainingToTargetNow`, distinct from `shortBy`. The reviewed ASP response selects the home goal, not the first arbitrary goal, and uses 30,000 minus 14,600 equals 15,400. It describes conditional interest/bonus and does not open an account.

### Routing and partner honesty

- Homes intent accepts natural see/show wording; movers accepts the recorded next-Friday/packing-help wording.
- Removed the unsupported promise that example homes fit a target deposit. Both initial headline and offer-list introduction now say examples, not live listings or an affordability assessment.
- Reviewed partner introductions say prices/offers are fictional, distinguish options from execution, avoid guaranteed insurance coverage and do not call paid Vakaa planning a free session. Free Nordea advice remains separate.
- Safety words retain priority over reviewed partner/product answers. The new response path is not used for action, adviser, transfer, removal and similar tool turns.
- Explicit no-save instructions and exploratory goal questions now have code checks before a model-proposed save. Existing sensitive-save/undo paths remain.

### Main files to inspect

- `src/server/advice/reviewedAnswer.ts`: new deterministic educational responses for the known failed topics.
- `src/server/abel.ts`: selects reviewed answers before model generation for covered informational requests, retains existing action paths, adds goal-save boundaries and corrected goal selection/offer headline.
- `src/server/advice/intent.ts`: scoped natural-language routing and separate gift-information intent.
- `src/server/advice/facts.ts`: first-attendance and statutory PS snapshot facts.
- `src/server/advice/cards.ts`: formats the statutory balance as money.
- `src/server/advice/chatCard.ts`: uses the catalogue message when an explicit explanation is absent.
- `src/server/finance.ts`: explicit current remaining-goal amount.
- `src/server/routes.ts`: honest example-home list text.
- Six rule catalogue JSON files: conditions, verified wording, sources and embedded edge tests. Existing ASP rule file is unchanged.
- `scripts/test-customer-path-corrections.ts`: real `abelTurn` tests with an intentionally unavailable/throwing model on covered paths.
- `scripts/test-rules.ts`, `scripts/test-advice-home.ts`: updated tests for corrected policy boundaries, not disabled tests.
- `package.json`: adds `test:customer-paths` only.

## Author-run verification on 23 November 2026

Run these yourself from the source folder after `npm ci`:

| Command | Observed result |
|---|---|
| `npm run lint` | TypeScript passed |
| `npm run build` | Production build passed |
| `npm run test:customer-paths` | Twelve known informational/partner reproductions passed; blocked-card/action boundaries and safety test passed |
| `npm run test:rules` | 112/112 passed |
| `npm run test:advice` | Intent 45/45, advice 56/56, home 73/73 passed |
| `npm run test:trust` | 75/75 passed |
| `npm run test:v31` | 78/78 passed |
| `npm run test:refund` | All chained refund phase scripts completed successfully; final phase 32 passed, 0 failed |
| `npm run test:workspace` | 24/24 passed |
| `npm run test:pipeline` | 18/18 passed |
| `npm test` | Existing bank-record checks passed |
| `git diff --check` | No whitespace errors |

The safety test intentionally causes the model stub to throw, then checks the existing safe fallback. A log line about that intentional model failure is expected, not evidence of a successful hosted provider call.

Local mobile browser check ran the real local server and React UI at 460×940. Inspected rendered gift and movers screenshots: correct gift threshold/three-year/combined-value explanation without the incorrect saved family-help fact; movers card visible with its referral disclosure and See prices button. This was a local build using a scripted provider for unrelated paths, not a new test of the hosted app. No production API keys were used.

## Required independent checks, challenge these changes

1. Verify every factual sentence against the primary sources below. Check the exact tax years, exemptions, first-attendance exception and distinction between normal tax and withholding. The app remains an educational fictional concept, not a bank service.
2. Review whether deterministic educational replies are the right trade-off for the known failure set. They avoid model-recall errors but are deliberately generic, sometimes long, and do not fully understand every follow-up, negation or mixed topic. Do not interpret the matcher tests as broad language coverage.
3. Check that repeated partner questions, offers-off, age/minor restrictions, privacy settings and previously dismissed cards cannot lead to unsupported guarantees through the remaining model path. New reviewed partner introductions require a new offer card; follow-ups without one still use the existing conversation/model path. Test that path independently with a live provider.
4. Review consistency of the standalone reviewed-answer text with the versioned rule catalogue. They are separate reviewed representations and need coordinated maintenance. The existing fixed demo clock and catalogue staleness checks are preserved; the new answer text is not a general live legal-update mechanism. Do not use it beyond the checked rule scope without review.
5. Check `firstAttendanceDate` and historical PS snapshot handling across imports, hydration and hosted persistence. Missing 1 January PS data must fail closed, not be reconstructed from a later snapshot. Multiple same-day snapshot semantics need confirmation against the actual bank feed.
6. Verify the goal filter uses only gateway-permitted goals. No invisible/private goal may enter the reviewed reply. Check non-primary home goals and any mismatch between aggregate savings and a specific goal allocation.
7. Try natural correction and removal messages, do-not-save wording, ordinary declarative goal creation, undo, sensitive-save and duplicate handling. The new no-save/exploratory checks are narrow guards, not a complete consent parser.
8. Re-run confirmation/cancel paths for EUR 25 monthly saving, adviser handoff with scoped data, refund draft/send/withdrawal/arrival and duplicate credit. Existing test suites passed, but no new full video was recorded for them in this change set.
9. The existing fictional partner completion screens still simulate bookings/purchases and rewards. This work does not add real integrations, booking availability, insurance policy terms, utility switching, or live housing affordability. Keep that boundary explicit and evaluate whether clearer final-screen labels are needed before any presentation.
10. Check mobile layout for all longer answers, including scroll position, URLs, screen readers and quick-reply continuity. Only gift and movers received new direct pixel inspection in this patch round. Youth/ASP/Kela/household/PS/insurance/planner need fresh pixel checks on the updated published build.
11. Run additional architecture, migration, remote-store and customer-ID suites as relevant. They were not all rerun in this patch round. Do not claim hosted integration acceptance from a local build.

## All fifteen story gates after publication

1. ASP at age 31: correct eligibility explanation and current-versus-projected goal arithmetic; no unapproved opening.
2. Youth investing: ages 26/27/28/29 boundaries, custody/trading fee distinction and supported next screen.
3. Kela: compensation-specific explanation, capped amount, first degree and timing/attendance checks.
4. Gift: 7,499 / 7,500, same/different donors, earlier gifts, no excess-only rule or false saved family-help fact.
5. Household: labour/material distinction, credit against tax, annual limits and conditional EUR 600 example.
6. PS 2026: eligible contributions, not balance, no implication of cash back or blanket eligibility.
7. PS 2027: exact historical snapshot, whole balance, 2027/2028 and taxable treatment.
8. Homes: natural browsing intent, examples and disclosed incentive, no affordability or real listing claim.
9. Energy: examples, incentive and supported comparison endpoint, no actual switch or guaranteed saving.
10. Insurance: cover options and terms caveats, no guarantee or invented policy binding.
11. Movers: urgent natural wording reaches the card; availability and booking remain appropriately qualified.
12. Planning: paid Vakaa prices versus separate free Nordea advice, consistent card and next step.
13. Home-loan handoff: consent, desktop case and question/answer return; no approval fiction.
14. Monthly saving: correct accounts/amount/frequency, explicit confirm and saved plan, no premature debit.
15. Refund: scoped records, editable message, explicit send, labelled simulated reply/arrival, exactly-once credit and working Done.

## Primary source ledger

Checked through official-source research on 23 November 2026. Recheck before release if delayed or circumstances change.

- ASP: https://www.nordea.fi/en/personal/our-services/savings-investments/savings-accounts/asp-account.html
- ASP reform: https://www.valtiokonttori.fi/en/reform-of-asp-legislation/
- Youth custody/prices: https://www.nordea.fi/en/personal/our-services/savings-investments/investments/other-prices-for-trading-and-safe-custody-services.html
- Equity account: https://www.nordea.fi/en/personal/our-services/savings-investments/investments/equity-savings-account.html
- Kela compensation: https://www.kela.fi/student-loan-compensation
- Gifts: https://www.vero.fi/en/individuals/property/gifts/when-do-i-need-to-pay-gift-tax/
- Household credit: https://www.vero.fi/en/individuals/deductions/Tax-credit-for-household-expenses/tax-credit-amount/
- PS transition: https://www.nordea.fi/en/personal/our-services/savings-investments/savings-accounts/tax-change-to-ps-accounts.html
- 2027 changes: https://www.vero.fi/en/incomes-register/about-us/newsroom/news/2026/annual-changes-2027/
- Capital-income tax: https://www.vero.fi/en/individuals/tax-cards-and-tax-returns/income/capital-income/

## Review output requested

Return findings by severity with file/line references and reproductions. Separate confirmed failures from concerns and untested cases. State which tests you ran yourself, which passed, which failed, and anything that prevents release. Do not certify the change simply by repeating this file. If you fix anything, provide a focused diff and rerun the affected checks. The owner decides whether to merge and publish. Do not merge, update main or deploy as part of the independent review.
