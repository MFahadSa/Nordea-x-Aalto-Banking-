# Superseded by round 4

Read `CLAUDE-ROUND4-REVIEW.md` for the latest correction and independent review. The fifteen-story matrix below remains the acceptance checklist, not a record of completed published journeys.

# Nora correction review, round 3

Review branch: `fix/rule-rendering-and-explicit-requests`
Base: `522be4067d0f0409a064d1c6ee5a6b33e71b4ef2` (main after PR61)
Date: 23 November 2026
Repository: https://github.com/MFahadSa/Nordea-x-Aalto-Banking-

## Release status

Not approved for release. This is a separate review branch, not a main update or deployment. The owner controls merge and publication. PR60 and PR61 are already in the base. Review this round's diff, not the superseded deterministic-answer design described in the older PR60 document.

Local regression checks pass except the existing customer-ID fuzz failure described below. Corrected live-model answer quality has NOT been established. A fresh real-model check of the published app failed the PS scenario. That app's backend revision is unknown, so the failure is baseline evidence, not a test of this unshipped branch.

## Confirmed defects and changes

1. **Years were formatted as money-like numbers.** The supplied patch was inspected, then reproduced red: the new rendering assertion failed (112/113). Four rule files now store year parameters as strings. The shared card, explanation and checked-background tests pass (113/113). Numeric money parameters remain numbers. An actual local mobile screenshot shows `In 2026 and 2027`, without grouped digits.
2. **Declined moving offers still appeared.** Added refusals covering won't hire/need, skip, avoid, stop, hide, decline, not interested and short `Movers? No thanks` wording. Refusal remains a separate check after intent matching.
3. **Purpose filtering hid explicit requests.** Banking or planning words no longer suppress a clearly requested energy/movers/ASP/Kela/household-credit card. The explicit-request exception is topic-specific; ordinary balances, goal progress and money transfers still do not advertise unrelated services. Existing offer settings, age, eligibility and duplicate checks remain downstream.
4. **Bare PS balance questions lacked checked context.** Bare PS now selects the PS catalogue background. Generic pension investing does not. Background explicitly forbids substituting current/savings/car-fund totals for a PS balance. Model facts distinguish a PS product and its dated balance from ordinary accounts, and retain unknown historical data as null. No PS account in the bank records is not evidence about external holdings.
5. **A no-note refusal still allowed code-inferred facts to save.** Storage refusal now removes inferred facts before rule-card evaluation as well as blocking a model-proposed save. Added an end-to-end turn test that compares cabinet entries before and after a cleaning-credit question with a no-note request. This prevents structured-note changes, not retention of the conversation itself.
6. **Source wording and maintenance.** Updated ASP to the observed official account URL. Removed duplicated PS explanation text. PS exclusion keeps the source's conjunction: retirement age reached AND planned withdrawals started. Do not change that to OR without authoritative support. The current rule's explanation already describes the enacted 2027 transition; no future-version selection was added.

The earlier task-takeover fix stays intact: checked material is background for the normal model/tool response, never an early canned answer.

## Verification actually performed

All checks below ran locally with isolated demo/test data. Scripted providers exercise real application paths but do not establish live model reasoning.

| Check | Result |
|---|---|
| TypeScript, production build, whitespace | Pass |
| Customer-path correction script | Pass: original 24 turns, latest refusal/explicit-request probes, seven financial-background cases, goal/recurring-transfer/no-save tool proposals, inferred-save refusal and PS account boundary |
| Rules | 113/113 |
| Advice | Intent 45/45; advice 56/56; home 73/73 |
| Trust | 75/75 |
| v31 | 78/78 |
| Full chained refund suite | Pass, final phase 32/32 |
| Workspace, pipeline | 24/24; 18/18 |
| Bank-record suite | Pass |
| Architecture and migration | 410/410; migration 43/43 |
| Insight and loader-init | Pass |
| Adapter, remote, e2e | 44/44; 36/36; 37/37 |
| Environment, guards, self-test | 7/7; 12/12; 3/3 |
| Load/merge, D9, architecture events | Pass; 24/24; 19/19 |
| Architecture UI | 37/37 |
| Customer-ID chain | Fails at fuzz: 4110 passed, 1 failed |
| Fail-closed routes and ID-length checks after fuzz | Separately run: 7/7 and 20/20 |

The customer-ID fuzz reports an unexpected `refunds.json` file after requests without guarded customer-ID input. The same failure was reported on the pre-PR60 baseline by the independent reviewer and reproduces here. This round does not fix it, weaken the assertion, or claim a clean full-suite pass. Earlier customer-ID chain stages, including server checks (63/63), completed before fuzz stopped the chain.

### Rendered UI evidence

A real local server and React mobile UI at 460 x 940 rendered the household credit card. Its year text was inspected directly in the screenshot. The reply was a scripted stand-in; only card rendering is demonstrated. The earlier money-transfer and home-progress screenshots established no unrelated movers/homes card on those probes. Not every card/action endpoint received fresh pixel inspection this round.

### Published real-model baseline, failed

URL: https://the-banking-context-cabinet.ai.studio/

At 12:32:39 UTC on 23 November 2026, the published app answered a PS-balance/2027-withdrawal question using the customer's total ordinary account balances, about EUR 18,371, and discussed withdrawing from current, savings and car-fund accounts. It did not answer the PS eligibility question. The response identified its source as model. The app reported a configured provider chain, but configuration alone is not acceptance.

Evidence identifiers: conversation `conv-1795437142899-v80nd`, response `msg-agent-1795437159559-fn8c0`. The captured response also assured the customer that nothing was saved, wording that must distinguish a structured note from retained chat. The screenshot was taken during animation and is not the decisive evidence; the captured response is.

This live failure motivated the PS product/account boundary in this branch. No corrected-branch real-provider run was possible with the available local configuration. Do not certify final prose simply because the prompt now contains the right facts.

## Fifteen-path coverage and remaining gates

These are coverage categories, not fifteen newly passed production journeys.

| Story | Local evidence | Still required after reviewed publication |
|---|---|---|
| 1. ASP at 31 | Rules, explicit opening request, normal response path, home arithmetic suites | Real eligibility prose, current versus projected shortfall, no unwanted opening |
| 2. Youth investing | Age-boundary rules and checked-context probe | Real 26/27/28/29 wording, custody/trading distinction and next screen |
| 3. Kela | Compensation rules, explicit request and checked source | Real compensation amount/cohort/timing explanation |
| 4. Gifts | Threshold/donor rules and mixed-topic regression | 7,499/7,500, prior gifts, no false structured note |
| 5. Household credit | Rules, explicit request, no-save turn and inspected year card | Labour versus materials, EUR 600 conditional calculation, final prose |
| 6. PS 2026 | Catalogue and checked-context tests | Contribution versus balance, actual eligibility and tax explanation |
| 7. PS 2027 | Historical-snapshot rules and model-context boundary | Exact dated snapshot, retirement/withdrawal conjunction and normal tax; published baseline failed |
| 8. Homes | Positive browsing and negative goal-progress routing | Fictional examples, incentive, no affordability claim, endpoint |
| 9. Energy | Positive original and explicit cheaper-contract probes | No actual switching or guaranteed saving, comparison endpoint |
| 10. Insurance | Positive intent and existing advice/consent suites | No invented policy binding or guaranteed coverage, endpoint |
| 11. Movers | Original urgent request plus five refusal variants | Availability, price and simulated booking labels, endpoint |
| 12. Financial planning | Positive request and partner price context | Paid Vakaa versus free bank advice and endpoint |
| 13. Home-loan adviser | Existing trust/v31/workspace/e2e suites | Fresh published consent, scoped desktop case and customer return |
| 14. Monthly saving | Actual recurring-transfer tool proposal and confirmation suites | Fresh published account/amount/frequency confirmation and saved plan |
| 15. Refund | Complete chained refund suite | Fresh published intake, editable send, simulation labels, exactly-once credit and Done |

Existing earlier story videos are not evidence that this branch is published. Remaining videos stay paused until independent review, owner publication and a fresh public-UI retest.

## Independent review work requested

1. Check out this branch separately; inspect the complete diff against the stated base. Preserve unrelated local changes. Do not merge, push main, revert or deploy.
2. Reproduce the supplied year defect before the data fix and confirm all three render paths now agree. Try year values in every active version, not only household credit.
3. Challenge positive and negative routing with compound requests, negation, punctuation, contractions and follow-ups. These are constrained text classifiers, not general language understanding. A correct result for the listed probes is not proof for all phrasings.
4. Verify refusal when offers are off, a card is dismissed/duplicated, eligibility is unknown or the user is a minor. The model must not claim an invisible card.
5. Test explicit no-save wording against both model-proposed and code-inferred changes. Check sensitive consent, exploratory goals, undo, duplicates and normal declarative goal creation. Distinguish chat retention from cabinet-note storage in the final answer.
6. Inspect PS account selection and multiple-product/same-day snapshot semantics. Confirm future or later snapshots cannot establish the statutory balance. A null must not become an ordinary account total. Test missing, external and multiple PS accounts.
7. Run a real configured provider on the corrected code. Inspect final prose against cards and source facts. Include personal figures, mixed requests, Finnish/CALM, ordinary pension investing, goal/transfer follow-ups and all fifteen gates above.
8. Reproduce the existing fuzz failure independently and determine its actual impact separately. Do not hide it in an all-green statement or broaden this fix without review.
9. Inspect mobile pixels and supported next screens for every story after publication. Test consent and state transitions, not just card text. No invented real bank, merchant, insurer, tax or booking integration is acceptable in this fictional concept.

Return findings by severity with file/line references, reproductions, commands actually run and unresolved release blockers. State clearly which evidence is local, scripted-provider, live-model or published UI. Do not certify the change by repeating this document.

## Official source ledger

Previously verified for this work; recheck if release is delayed. The rule catalogue retains checked dates and review windows.

- ASP: https://www.nordea.fi/en/personal/our-services/savings-investments/savings-accounts/asp-account.html
- ASP reform: https://www.valtiokonttori.fi/en/reform-of-asp-legislation/
- Youth custody/prices: https://www.nordea.fi/en/personal/our-services/savings-investments/investments/other-prices-for-trading-and-safe-custody-services.html
- Equity savings: https://www.nordea.fi/en/personal/our-services/savings-investments/investments/equity-savings-account.html
- Kela: https://www.kela.fi/student-loan-compensation
- Gifts: https://www.vero.fi/en/individuals/property/gifts/when-do-i-need-to-pay-gift-tax/
- Household credit: https://www.vero.fi/en/individuals/deductions/Tax-credit-for-household-expenses/tax-credit-amount/
- PS: https://www.nordea.fi/en/personal/our-services/savings-investments/savings-accounts/tax-change-to-ps-accounts.html
- 2027 tax changes: https://www.vero.fi/en/incomes-register/about-us/newsroom/news/2026/annual-changes-2027/
- Capital income: https://www.vero.fi/en/individuals/tax-cards-and-tax-returns/income/capital-income/
