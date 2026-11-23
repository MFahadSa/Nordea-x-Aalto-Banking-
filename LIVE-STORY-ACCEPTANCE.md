# Published-story correction evidence

## Status

Candidate branch: `fix/live-story-acceptance`.
Implementation reviewed next: `21c64c553a0a14ed18c2787be50a94400cc4476c`.
Base: `24e86da532d5c5c8de90ed9a5cf4e307c7ec9a67`.

This is an evidence record, not another review assignment for the owner. Independent full re-review passed bff1699. Focused independent recheck passed21c64c5 with no new blocker. The corrected branch has not been tested with the real provider or published. No final video or pitch-readiness claim is made.

## Published acceptance inventory

The owner confirmed publication of https://the-banking-context-cabinet.ai.studio/ on 23 November 2026. Tests retained complete responses, customer IDs, screenshots and state reads. The hosted backend does not expose its revision. Local source replay cannot prove the exact prompt received by a hosted model.

| Story | Observed published result |
| --- | --- |
| ASP | Correct remaining savings of EUR15,400, but obsolete upper-age rule in prose. Failed. |
| Youth investing | Verified Alex26 got under28 custody, trading-fee and ETF restrictions right. Stored response ended mid-word. Failed completeness. |
| Kela | Core compensation formula and date-answer endpoint worked. Attendance exception incomplete; duplicate general student note. Partial. |
| Gift | EUR7,500 itself incorrectly described as exempt. Failed. |
| Household credit | EUR600 eligible labour produced EUR90 credit and distinguished tax from income. Passed tested calculation. |
| PS contributions2026 | Core last-year/cap and no balance deduction correct; explanation later confused historical test. Partial. |
| PS withdrawal2027 | Unknown personal balance acknowledged, but historical eligibility and tax framing wrong. Failed. |
| Homes | Fictional browse options worked; not an affordability assessment. Initial prose invented adviser navigation. Partial. |
| Energy | Browse options worked; initial prose dropped monthly and usage-price basis and invented adviser navigation. Failed prose. |
| Insurance | Browse options worked; initial prose invented cancellation and coverage terms. Failed prose. |
| Movers | Prices and unavailable live availability check explained; browse endpoint worked. Tested endpoint passed. |
| Planner | Paid/free distinction and prices right; initial reply pointed to absent Connect me button. Failed navigation prose. |
| Adviser | Sharing, staff AI summary, question, decision, customer return and answer worked. Proposed scope included irrelevant student/cleaning facts. Partial. |
| Monthly saving | Confirmation increased monthly plan EUR25 without immediate debit. Passed tested state transition. |
| Refund | Four opt-ins, editable message, simulated reply, arrival, duplicate protection, Done and withdrawal worked. Intake did not explain EUR129 versus EUR89.90 mismatch. Partial. |

The first attempted youth/CALM retests raced the customer switch and sent as Lauri. They were excluded. Corrected tests waited for the exact customer state and verified returned customer IDs. One excluded turn exposed a missing Gemini thought-signature error, which remains a valid provider-compatibility finding.

## Consent and state checks

- Explicit no-save request added no notes or cards.
- Mixed old-address refusal and emergency-goal request saved only a canonical goal, not the forbidden address.
- Declining movers did not produce movers or home-listing cards.
- Partner offers-off suppressed the partner card on a new mover request.
- Actual Eeva received Finnish model prose, but a blanket personal deposit-protection assurance was unsupported.
- Refund duplicate left current balance at EUR1,510.40, unchanged after the first EUR89.90 arrival.
- Refund Done dismissal persisted after reload. Deliberate withdrawal returned only withdrawn-case metadata, not readable source details.
- An immediate stale consent-card label initially suggested withdrawal. Direct current-state verification showed active consent; it was not treated as a confirmed consent defect.

## Root causes and corrections

1. ASP context lacked upper-age abolition. Added the official reform condition to parameterized rule data.
2. Kela context lacked a clear earlier-admission/first-attendance exception. Added it and narrowed duplicate enrollment-note suppression.
3. Partner context dropped item descriptions and billing units. It now includes both and states that unknown terms and absent adviser controls must not be invented.
4. Final-answer validation checked numbers more readily than their meaning and could accept repeated contradictions. Added scoped contradiction/completeness rejection and model rewrite. It does not substitute a canned topic answer. Persistent rejected wording fails visibly rather than reaching the customer as accepted model prose.
5. Gemini could receive foreign model tool calls as fabricated native calls without signatures. Foreign tool history is preserved as labelled history; native raw content is retained unchanged.
6. Customer switching left the previous customer actionable while the new state loaded. Old actions are cleared, and late state reads for the prior customer are ignored.
7. Loan relevance matched generic home/student wording. Cleaning and general enrollment facts are excluded while renovation-loan facts remain eligible.
8. Refund approximate amounts were discarded on merchant recognition. Prefix and suffix currency forms now carry the stated amount through consent, and a discrepancy is disclosed only after reading allowed records. It is not represented as a verified purchase match.

## Independent review round one

The reviewer reproduced false positives in the first candidate: strict-under gift exemptions, negated partner claims, monetary ASP examples and Finnish monthly units. Refund amount suffixes/prefixes were also missed. These findings were corrected in35c9854 with positive and negative tests.

The same revision addresses bounded plain-text retries, separate reviewed-problem retries, short cutoffs, denial of guaranteed returns, and overly broad student deduplication. A second review found sentence-wide negation could hide unsafe assertions. It was replaced with predicate-scoped denial checks; full independent suites and unsafe runtime controls then passed atbff1699. Two remaining narrow false positives, absent-link predicates and explicit gift-threshold denial, were corrected at21c64c5 and passed focused independent recheck.

## Tests

Latest local checks passed:

- TypeScript and production build.
- Exact stored published ASP/gift/PS failure fixtures.
- Adversarial model runtime: correction success and persistent contradiction failure.
- Positive wording probes for strict-under gifts, absent adviser links, unknown cancellation terms and Finnish monthly units.
- Refund currency variants and consent-gated HTTP discrepancy checks, final section34/34.
- Full existing refund suite.
- Customer-path consent/routing suite.
- Rules113/113, advice73/73, trust75/75, v31 78/78, workspace24/24.
- Bank records, architecture/migration and E2E37/37 on the initial candidate code.
- Delayed customer-switch browser tests: old actions hidden; outgoing chat customer ID was Alex. A delayed prior-customer404 also arrived after Alex selection without changing Alex or exposing the previous customer.

The earlier customer-ID4110/4111 report was corrected by independent isolated testing: a stray server contaminated that run. Isolated base and branch checks passed35/35. This document does not describe it as an outstanding product defect.

Local scripted/adversarial checks are not real-provider quality evidence. The provider-history correction is structurally tested, not live-verified.

## Remaining gate

The reviewed code is ready for the owner-only step: make this reviewed version available with real AI. No local provider credentials or authorized preview/deployment control are available. No production keys were extracted. Then repeat real-model acceptance of failed prose, working endpoints and consent/state regressions before recording the final continuous customer videos.

## Sources

- ASP reform: https://www.valtiokonttori.fi/en/reform-of-asp-legislation/
- ASP account: https://www.nordea.fi/en/personal/our-services/savings-investments/savings-accounts/asp-account.html
- Youth custody: https://www.nordea.fi/en/personal/our-services/savings-investments/investments/other-prices-for-trading-and-safe-custody-services.html
- Equity savings account: https://www.nordea.fi/en/personal/our-services/savings-investments/investments/equity-savings-account.html
- Kela: https://www.kela.fi/student-loan-compensation
- Gift tax: https://www.vero.fi/en/individuals/property/gifts/when-do-i-need-to-pay-gift-tax/
- Household credit: https://www.vero.fi/en/individuals/deductions/Tax-credit-for-household-expenses/tax-credit-amount/
- PS changes: https://www.nordea.fi/en/personal/our-services/savings-investments/savings-accounts/tax-change-to-ps-accounts.html
