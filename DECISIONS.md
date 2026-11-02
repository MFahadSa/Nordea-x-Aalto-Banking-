# Decision log - delegated project decisions

Project: Nordea x Aalto banking prototype, branch `instinct-prototype-v3`.
Maintained by the Coordinator (`instinct-christina`), acting under the owner's delegation
(Slack ts `1793661367.512989`; evidence routing per owner ts `1793661385.367849`).

The owner reviews this log at his own pace and sends feedback when something needs to change.
Per the owner (ts `1793661732.934049`): no feedback yet means the decisions stand and work continues.
Not delegated, still owner-only: merge, spending / paid runs, live provider runs, security.

Status terms: **recorded** = stated by the Coordinator in `review.md` (commit `a71a17b`, 2026-11-03 01:20).
**acknowledged** = accepted in the review loop by Bill (commit `2bcddad`, 2026-11-03 01:27:
"Coordinator decisions D1-D7 accepted as the owner's delegated word... R2 verified @385bb2a.
No open finding rows.").

## D1 - Risk-level rubric (R2)
- **Question:** how should the User AI choose between level 0, 1 and 2?
- **Decision:** highest applicable level wins. L2 = sensitive personal content, an unsupported or
  inferred personal conclusion, or intended external disclosure/offers. L1 = evidenced, non-sensitive
  personal context. L0 = non-sensitive facts or intent stated directly by the customer, or generic
  non-personal content.
- **Reason:** the level names and pass table are the owner's own definitions; the mapping of content
  kinds to levels (sensitive/inferred/disclosure -> L2, evidenced non-sensitive -> L1, direct or
  generic -> L0) is the Coordinator's delegated interpretation of them. The sensitivity guard is a
  code floor the model cannot lower.
- **Status:** recorded @ `a71a17b`; acknowledged by Bill @ `2bcddad`.

## D2 - Missing, invalid or stale level
- **Question:** what happens to a card the AI cannot classify (no answer, out-of-range, wrong type, stale)?
- **Decision:** UNKNOWN = effective level 2 for gating, and never counted as AI certification.
- **Reason:** fail-safe toward more review, never less.
- **Status:** recorded @ `a71a17b`; acknowledged by Bill @ `2bcddad`.

## D3 - Edits and re-approval
- **Question:** if a user edits an approved card, does it need approval again?
- **Decision:** a substantive change creates a new content hash (version) and is checked again under the
  current mode. An unchanged approved card is never requeued.
- **Reason:** the approval ID binds a content hash (title, detail, level, source).
- **Status:** recorded @ `a71a17b`; acknowledged by Bill @ `2bcddad`.

## D4 - Mode changes
- **Question:** when switching from "Review everything" to "High risk mode", are waiting cards released?
- **Decision:** cards the new mode permits are released, audited as a mode pass (not human approval).
  A stricter mode never pulls back UNCHANGED approved or stored content; a substantive edit is still
  a new version and is re-gated (D3). An explicit rejection is never resurrected.
- **Reason:** a mode is a review preference, not new evidence about already-approved content; changing
  it should not silently revoke what was approved, while anything genuinely new still gets checked.
- **Status:** recorded @ `a71a17b`; acknowledged by Bill @ `2bcddad`.

## D5 - Typed non-sensitive goals
- **Question (Bill, 01:09):** under default "Review everything", a typed non-sensitive goal is now L0 and
  enters the memory database unreviewed; before R2 it waited. Should it still wait?
- **Decision:** no. A goal the customer typed themselves, restated without new claims, is "stated directly"
  = L0 and may pass under "Review everything", consistent with the owner's level table. Sensitive,
  inferred or disclosure content still overrides to L2. The pre-R2 waiting behavior is not restored, and
  the unaccepted fixed "goal summary = L1" choice stays rejected.
- **Reason:** the owner's pass table lets L0 pass under "Review everything"; content the customer stated
  directly is the lowest-risk kind by his own definitions, and the floor still catches sensitive or
  inferred content.
- **Status:** recorded @ `a71a17b`; acknowledged by Bill @ `2bcddad`.

## D6 - Model-call cap
- **Question:** keep the default of 20 steps per model with `LLM_MAX_CALLS` unset (default 0 = uncapped)?
- **Decision:** keep the current configuration for this checkpoint. This is a configuration observation
  only - it does NOT approve any spend. Paid/live provider testing stays held until the owner approves
  an explicit bounded spend with a configured cap.
- **Reason:** the question asked about the configuration default, not about running paid tests; changing
  a default mid-checkpoint adds risk without evidence it is wrong. The uncapped default is a known
  exposure and stays visible as an owner decision.
- **Status:** recorded @ `a71a17b`; acknowledged by Bill @ `2bcddad`.

## D7 - Who may decide (authority)
- **Question (Joe, 01:14 / 01:16):** who carries the owner's delegation, with what scope and evidence?
- **Decision:** the Coordinator (`instinct-christina`) is the project-facing name of the assistant the
  owner granted on his channel: "Carry the decisions under my delegation and represent me. You have been
  granted permission to make decision on behalf on me regarding this project" (ts `1793661367.512989`).
  Decisions under that grant settle the delegated questions; they are the Coordinator's delegated
  decisions, not verbatim owner words. Exact owner words and timestamps are held and supplied when the
  review loop needs them (owner ts `1793661385.367849`). Merge, spend, live and security gates are not
  covered by this grant and remain the owner's own.
- **Reason:** the grant names decisions and representation for the project and does not name merge,
  spend, live or security, so those stay with the owner.
- **Status:** recorded @ `a71a17b`; acknowledged by Bill @ `2bcddad`.

## Feedback log
- 2026-11-03 (review pass): D1 reason now separates the owner's level definitions from the
  Coordinator's delegated interpretation; D4 scope narrowed to unchanged approved/stored content with
  substantive edits still re-gated; explicit reasons added for D4-D7.
- Owner feedback will be applied here as revisions with date and source.
