# Nora correction round 5: scoped recording consent

Status: code corrections and independent internal review complete. No observed blocking consent/routing defect remained in the reviewed cases on code head `5a94ed0`. This is not real-model or release approval. This file is an evidence record, not another Claude assignment.

Repository: https://github.com/MFahadSa/Nordea-x-Aalto-Banking-
Branch: `fix/scoped-recording-consent`
Base: `c0829f9`, main after the owner's merge of PR63. No main write, merge, revert or deployment was performed in this round.

## Why this round exists

The supplied independent PR63 review confirmed the previous offers-off, multi-PS, PS-postscript and listed routing fixes. It also reproduced four ordinary no-save instructions that still allowed a model-proposed fact to save, plus mixed-scope instructions where a blanket turn-level refusal blocked an unrelated explicit goal. The report's suggestion that any positive save should take precedence was not adopted. A positive goal must never authorize saving a forbidden address, old detail or private fact.

## Implementation

- Recording refusals now include indirect requests such as can-you-not-save, no-saving-please, don't-put-this-in-notes, don't-keep-my-data, hold-on-to, prefer-you-not, like-you-to-not, keep-track and leave-out-of-notes forms. Existing positive/negative financial/style/accounting tests remain.
- Automatic inferred rule-card persistence still stops on a detected storage refusal. Chat and read-access logging remain retained; no claim of zero storage is made.
- Model-proposed changes are checked individually. Ordinary facts, life events, preferences, updates and sensitive drafts are not allowed to bypass a refusal merely because another clause contains a positive request.
- A narrow exception can save a single explicit independently understood goal in a mixed turn. It requires a separate specific possessive-data refusal, one explicit save/set/create/add-goal clause, one supported emergency/car/home category and an unambiguous positive amount. Global data, goal/category conflicts and ambiguous cases remain blocked for clarification.
- The saved goal title/detail/amount/category/deadline are constructed from the permitted clause. Model-authored title/detail/date are discarded, preventing an otherwise permitted goal from carrying forbidden facts. A missing goal category is not invented. A month-only future deadline resolves to the end of that month using the demo date; explicit past deadlines and malformed amount grouping fail closed. Any supplied unsupported deadline, including day-first dates, holds for clarification rather than saving an undated goal. Conditional/private/sensitive requests cannot use the exception.
- Partner refusal fixes cover no-listings requests, not-this-time movers replies and explicit later insurance/movers needs without cancelling prior privacy rules.

## Evidence so far

Local isolated-data tests with a scripted provider exercise real application paths, not real answer quality.

- Each of the four supplied no-save bypasses is tested with a provider actively attempting to save a Wolt job fact. Cabinet/advice state remains unchanged.
- Additional indirect refusal forms have runtime mutation checks.
- A mixed old-address refusal plus emergency-goal request is tested with both a forbidden fact proposal and a contaminated goal proposal. Exactly the canonical emergency goal is saved, with no forbidden model text or date.
- Global refusal, goal/category conflicts, unknown category, malformed amounts and past dates fail closed.
- All prior consent/routing, account/date, partner-background and financial-source regression probes remain in the customer-path script.
- TypeScript/build, rules, advice, trust, v31, full refund chain, workspace, pipeline, architecture/migration, insight, adapter, remote, e2e, env, guards, self-test, load, D9 and architecture UI/events were rerun locally. Affected suites must be rerun after any reviewer changes.
- Customer-ID fuzz still fails 4110/4111 for the pre-existing refunds.json creation. The downstream fail-closed and ID-length scripts were separately run. This is not an all-green full-suite result.

## Remaining gates

Independent internal review cloned the branch separately, read the full diff, ran about 95 adversarial probes plus real application turns with a scripted provider, and reran TypeScript/customer-path/rules/advice/trust/v31 suites. It confirmed canonical-goal-only retention, rejection of contaminated prose, sensitive/wrong-amount/update proposals, global/category/conditional/past/malformed holds and partner-card opposite polarities. It caught everyday keep-track/no-saving false positives and unsupported deadlines being dropped in an intermediate head. Those were fixed, then the reviewer verified the complete rerun on `5a94ed0` with no remaining observed blocking consent/routing defect. Test-only follow-up `03429cf` adds author runtime tests for tracking/ASP and date-hold no mutation; no reviewed code changed afterward.

The reviewer independently verified the four supplied runtime no-save bypasses and further true refusals against an adversarial provider, not just the parser. It also verified that ordinary spending-tracking/financial statements still show the requested ASP card and that unsupported date requests leave no undated goal. No further user-run Claude review is needed to repeat these code checks.

No corrected-branch real-provider or full fifteen-flow published acceptance is established. Previous access checks found no local provider credentials and no signed-in AI Studio preview. No secret was requested in chat or extracted. Owner-authorized preview/provider access or owner publication followed by fresh real-model acceptance remains necessary. The fifteen-story checklist in the older review is still an acceptance checklist, not completed production evidence.

English/Finnish phrase handling has limits. Unsupported or ambiguous mixed-save instructions conservatively require clarification. This branch does not promise perfect natural-language coverage, real banking actions or a release-ready pitch.
