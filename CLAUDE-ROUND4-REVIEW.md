# Nora correction round 4: independent review and release gates

Status: independent code review found no release-blocking consent or routing defect on code head `355e5f87c221033b280cd2b458a171873870ee46`. This is not release approval. No merge, main update, revert or deployment is part of this work.

Repository: https://github.com/MFahadSa/Nordea-x-Aalto-Banking-
Branch: `fix/offer-background-and-consent`
Base: main `5a1ddc4`, which merged PR62. The supplied review's statement that PR62 was open was stale when received; remote ancestry confirms it is merged.

## Changes

- Partner prices and incentives are supplied as checked model background only for a partner whose offer card is actually shown this turn. Offers-off also has an explicit prompt restriction, including offers discussed earlier. The supplied test was run before the code fix and failed with the expected missing-background assertion, then passed after the inspected patch.
- Multiple PS contracts no longer silently select the first. Both eligibility facts and model facts fail closed: current and statutory balances are unknown, with an explicit personal-eligibility warning. This does not invent a legal aggregation rule. Exactly-one-contract historical snapshot behavior is preserved. Future and later low balances cannot establish 1 January 2027.
- Storage refusal first recognises directed commands, then separates recording verbs from ambiguous verbs. Save/store/remember/note/record/log accept arbitrary data objects; keep/make/add require note/record/on-file/to-notes constructions. Financial-saving modifiers, log in/out, style requests and accounting classification are not privacy commands. Off-the-record/private/passive and Finnish handling is separate. First-person financial self-descriptions are not treated as instructions to the assistant. It covers no-note/write-down/log/keep-it variants and bare no-need-to-save. Savings-money idioms remain positive. Ambiguous privacy wording conservatively withholds automatic storage. Explicit no-save turns skip rule-card evaluation/persistence entirely, preventing inferred cabinet answers, advice-reason snapshots and save-answer question cards. Educational background and normal model/tool answers remain. Chat retention is unchanged and must not be described as no storage.
- Service refusal is object-specific and processes contrast clauses. Moving company, packing help and moving van have separate item states, so stopping electricity costs is not declining electricity comparisons and a later explicit packing-help request can survive a movers refusal. English future/progressive negatives and Finnish movers refusals are covered.
- Removed bare singular `showing` as a homes trigger after a new compound test found that `Stop showing movers` could otherwise display homes.
- `PS:` used as a postscript no longer alone selects PS savings rules. Explicit PS-account wording later in that message still does.

## Evidence and checks

Tests use isolated demo data and scripted providers. They exercise application code but do not prove final real-model reasoning.

The customer-path regression script now includes prior 24-turn routing probes, financial sources, refusal positives/negatives, compound and locale cases, actual action-tool proposals, no-save cabinet/advice-state comparisons, offers-off/duplicate-card prompt inspection, multi-contract PS eligibility and model facts, and single-contract date boundaries. Supplied and independent-review reproductions are included.

Broad local suites were rerun: TypeScript/build; rules 113/113; advice 45/45, 56/56, 73/73; trust 75/75; v31 78/78; full refund chain; workspace 24/24; pipeline 18/18; architecture/migration; insight; adapter; remote; e2e; environment; guards; self-test; loader; D9; architecture events/UI and bank-record checks. Affected suites were rerun after subsequent consent/refusal edits.

Customer-ID fuzz still fails 4110/4111 with unexpected `refunds.json`, as on the earlier base. This branch does not hide or fix it. The remaining fail-closed and ID-length scripts were separately run after the chain stopped. No all-green full-suite claim is appropriate.

Actual local mobile screenshots were inspected for the no-note/Aalto and future-negative movers cases. No inferred-save note or save-answer question appears, and no movers/homes card appears on refusal. Replies visibly use a mock provider. These screenshots establish routing/layout only.

## Separate review

An independent reviewer was assigned before final handoff. Initial review confirmed the offers-background and multi-PS fixes, but found more common storage refusals and clause-global over-refusal. Those reproductions were added and fixed, then a second review found additional ordinary phrases and separate packing/company preferences. A clause-wide negation version then proved too broad in independent review. It was replaced with directed command/object matching and financial self-description exclusions. Opposite-polarity cases and runtime normal-ASP/affirmative-goal tests were added; all reproductions are retained. During self-review the initial transient-fact design was replaced because advice snapshots could still retain reasons on no-save turns. Later review found a closed data-object list missed arbitrary personal fields and generic keep/make/add caused style/accounting false positives. Verb-class handling replaced that design, with direct function and runtime mutation/card tests. Final independent review verified code head `355e5f87c221033b280cd2b458a171873870ee46`, reran all prior probe lists plus about 35 new examples, and ran the correction test script without failures. It found no release-blocking consent/routing defect on that head. Earlier independent runtime checks confirmed offers-off with prior offer history, cabinet/advice/topic-log equality on detected no-save turns, and multi-PS unknown balances. Those reviewed paths were unchanged by the final refusal-only edit. This evidence settles the known code findings internally; another user-driven Claude loop is not required merely to repeat it.

Residual language limits remain: unusual financial `save cash at home` or `save me a seat` phrasing can conservatively suppress storage/cards for that turn. `Do not log me out` is also treated as privacy refusal. Detection is English/Finnish phrase-based, not a general language understanding guarantee. Retained conversation and read-access logging still occur. The multiple-contract historical edge was not independently exercised beyond the fail-closed null path; the author's single-contract exact/future/later-date regression tests pass. These are documented limits, not proof of live answer quality.

## Real-provider access and remaining acceptance

No local provider credential or environment file is available. The saved credentials cover GitHub only. AI Studio's existing session redirected to Google sign-in, so no authenticated preview route is currently available. No secrets were extracted, requested in chat or copied from the published app; no project/deployment was changed.

The published app at https://the-banking-context-cabinet.ai.studio/ previously failed the real-model PS question by substituting ordinary account totals. Its backend revision was not established. This branch is not published, and that old failure cannot certify or disprove the corrected branch.

A securely configured provider or owner-authorized preview is required for corrected-code real-model testing. Otherwise the owner must merge/publish only after review, followed by fresh published acceptance before using these flows in a pitch or recording more videos. All fifteen story gates and their acceptance requirements remain listed in `CLAUDE-ROUND3-REVIEW.md`; that coverage matrix is not a claim of fifteen passed production journeys.

Remaining checks include final prose versus facts/cards, offers-off prior-history behavior, natural follow-up prices, Finnish/CALM, mixed tasks, consent and undo, multi-PS ambiguity, historical hydration/remote storage, supported next screens and mobile pixels for every story. No guarantee of perfect natural-language coverage follows from listed examples.

## Reviewer instructions

Compare the latest branch head against base `5a1ddc4`, inspect surrounding code and challenge the changes with new examples. Report confirmed findings by severity with reproductions, line references, tests actually run and whether evidence is local/scripted, real-model or published UI. Do not merge, push main, deploy or infer owner approval from this document. The owner controls publication.
