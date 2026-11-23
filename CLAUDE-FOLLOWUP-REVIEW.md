# Superseded by round 3

Read `CLAUDE-ROUND3-REVIEW.md` first. The content below records the PR61 handoff and is not the current acceptance report.

# Independent follow-up review: customer-purpose routing

This file supersedes the PR60 handoff for the routing correction. Review the new `fix/customer-purpose-routing` branch against main `fce684de4f8b9c9db8512aea9ad02641c81d7107`, which merged PR60. Do not merge, update main, revert production or deploy. The owner controls those actions.

## Why this follow-up exists

Claude correctly found that PR60's topic-first deterministic answers replaced unrelated banking requests and that widened matchers could advertise movers for money transfers and homes for goal progress. My earlier positive-only tests did not establish general correctness. This follow-up removes the response takeover rather than adding a longer action-exception list.

## Actual changes

- Removed the `abelTurn` early return for reviewed answers. Every normal request again reaches the existing model/tool/finish flow, including follow-ups, mixed topics, goals, personal figures, Finnish and CALM users.
- Replaced duplicated canned replies with checked background rendered from the same versioned rule catalogue as cards. Named numeric/date parameters replace `figureN` strings. Source date/review-window checks apply. Missing/stale background is not silently treated as current law.
- A separate purpose classifier identifies personal banking/figure requests and goal/regular-saving tasks before card selection. Those do not create unrelated product/partner cards. It does not answer or execute the request; the existing tools and consent paths do that.
- Movers requires a moving service, van or packing-help context. Bare `pack`, `I move` and `we move` no longer trigger it. Explicit refusals are checked. Homes accepts explicit plural property browsing, not `show ... home progress`.
- Youth custody background is supplied only to an adult under 28 asking about the relevant account/fee/start-investing subject. It does not replace investment advice for pensioners.
- Existing ASP ownership stated in the current message suppresses an opening eligibility question. Prompt requires the named goal or clarification if multiple home goals fit. No first-home-goal arithmetic is injected by canned text.
- Storage refusal handling distinguishes `I never remember to save money` from `I don't want you to save my salary`.
- The general conversation prompt preserves customer language and existing CALM constraints. No English canned return bypasses them.
- Updated PS explanations use tense appropriate to the rule version. Nordea's retirement-age/scheduled-withdrawal exclusion is stated using the conjunction in its source, not silently widened into a new legal rule.

## Review findings disposition

| Finding | Treatment |
|---|---|
| H1 topic takeover | Early return removed; original model/tool path exercised for every supplied probe |
| H2 movers false positives | Money-movement purpose precedes cards; broad pack/move patterns removed; refusal check added |
| H3 progress becomes listings | Personal-progress purpose precedes cards; explicit property objects required |
| H4 goals/plans blocked | Model/tool path restored; real save and recurring-transfer proposal tests added |
| M1 language/CALM/follow-ups | No response bypass; prompt preserves language/CALM. Live language quality remains unverified |
| M2 youth answer irrelevant at age | No automatic answer; age-relevant background only |
| M3 storage refusal | Intent-specific refusal check plus positive/negative and mutation tests |
| M4 figureN duplication | Replaced with semantic catalogue params and a shared renderer, no duplicated financial response text |
| L1 ASP wording | No new canned minimum-age sentence. Existing ASP catalogue still describes the required deposit count/bonus conditions |
| L2 PS exclusion | Source wording added. Source says retirement age reached AND planned withdrawals started; do not infer a broader exclusion without legal support |
| L3 youth lower bound | Wording says under 28; adult-only demo eligibility guard remains |
| L4 source URL not clickable | Not changed. Chat source rendering remains a UI follow-up, not a factual routing blocker |
| L5 arbitrary first home goal | Removed canned first-goal selection; normal tool path and clarification instruction restored |

## Verification run for this follow-up

- TypeScript and production build pass.
- `test:customer-paths`: 24 real `abelTurn` turns cover all supplied H1–H4 probes, pensioner/Finnish/CALM cases and five positive partner paths. A scripted provider proves the normal path is invoked and its answer/suggestions survive. Additional actual tool proposals verify declarative goal save/duplicate handling, EUR 50 each-month confirmation, explicit no-save mutation blocking and the saving-memory idiom. Stale facts fail closed.
- Existing suites pass: rule 112/112; advice intent 45/45, advice 56/56, home 73/73; trust 75/75; v31 78/78; workspace 24/24; pipeline 18/18; full chained refund suite; architecture/migration and guards 12/12.
- `test:customer-id` still stops on the reported existing fuzz failure: 4110 passed, 1 failed, creation of `refunds.json` during bad-ID fuzz. Claude's independent report reproduces the same failure on the pre-PR60 base. This follow-up does not claim to fix it.
- Actual local mobile screenshots inspected for `Can I move money to my savings account?` and `Show me how my home savings are going`: no movers/homes card. The screenshots show the mock provider's reply, deliberately not a claim of live answer quality.

## Remaining checks before release

1. Independently reproduce all review probes and inspect the full diff. Do not replace this with regex-only positive assertions.
2. Run the real configured provider. Check correct spending/balance tool use, no unsupported youth promotion, all parts of mixed requests, natural goal/transfer handling, Finnish/CALM replies and follow-ups. No production API credentials were used in this fix round.
3. Challenge the purpose classifier with broader wording, negation, compound requests and false positives. It is a constrained card router, not full natural-language understanding. Model action/consent safety remains independently important.
4. Ensure the model follows checked facts and does not contradict cards. Supplying correct background is not proof of correct final prose. Re-run the financial boundary cases and all fifteen original story gates from PR60's review.
5. Check card/action behavior when the requested offer is disabled, dismissed, duplicated or age-inappropriate. The model must never claim an invisible card or completion that did not occur.
6. Verify multiple goals and account allocations with actual permitted data. Clarification instructions require live-provider testing.
7. Check hosted hydration, historical PS snapshot semantics, remote-store behavior, screen readers and full mobile layout. These are not established by local unit tests.
8. Independent review, owner merge/publication, then the newly published customer UI retest must precede remaining videos.

## Repository and publication state checked

Git remote ancestry and GitHub's PR record confirm PR60 merged at 11:30:18 UTC on 23 November 2026 as `fce684d`. The connected PR-list result returned an inconsistent `merged=false`, so it was not used as the sole source. No revert, main push or merge was performed in this follow-up.

The public app responds at https://the-banking-context-cabinet.ai.studio/ and serves `main-DkA5rhNW.js`. That frontend asset does not identify the backend revision. Whether PR60 was published is not established, and this follow-up is not deployed.

Primary factual sources remain the official URLs in the catalogue and prior review. The PS source was read again for its exact exclusion wording: https://www.nordea.fi/en/personal/our-services/savings-investments/savings-accounts/tax-change-to-ps-accounts.html

## Requested independent output

Report confirmed problems by severity with file/line references, reproductions and tests actually run. Separate live-provider/published-UI limits from code failures. Focus any fixes on the review branch and rerun affected tests. Do not merge, push main or deploy without the owner's approval.
