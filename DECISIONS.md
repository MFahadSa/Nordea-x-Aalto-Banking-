# Decision log - delegated project decisions

Project: Nordea x Aalto banking prototype, branch `instinct-prototype-v3`. Maintained by the
Coordinator (`instinct-christina`) under the owner's delegation (ts `1793661367.512989`; evidence
routing ts `1793661385.367849`). The owner reviews at his own pace; no feedback = decisions stand
(ts `1793661732.934049`). Owner-only, never delegated: merge, spend/paid, live runs, security.

Status terms: **recorded** = stated by the Coordinator in `review.md`; **acknowledged** = accepted
by Bill in the review loop. D1-D7: recorded @ `a71a17b` (01:20), acknowledged @ `2bcddad` (01:27:
"accepted as the owner's delegated word... R2 verified @385bb2a. No open finding rows.").

## D1 - Risk-level rubric (R2)
Q: how does the User AI choose level 0/1/2?
D: highest applicable level wins. L2 = sensitive personal content, an unsupported or inferred
   personal conclusion, or intended external disclosure/offers. L1 = evidenced, non-sensitive
   personal context. L0 = facts or intent the customer stated directly, or generic non-personal
   content.
Why: the level names and pass table are the owner's own definitions; the content-to-level mapping
   is the Coordinator's delegated interpretation of them. The sensitivity guard is a code floor
   the model cannot lower.

## D2 - Missing, invalid or stale level
Q: a card the AI cannot classify (no answer, out-of-range, wrong type, stale)?
D: UNKNOWN = effective level 2 for gating, and never counted as AI certification.
Why: fail-safe toward more review, never less.

## D3 - Edits and re-approval
Q: does an edited approved card need approval again?
D: a substantive change creates a new content hash (version), checked again under the current
   mode. An unchanged approved card is never requeued.
Why: the approval ID binds a content hash (title, detail, level, source).

## D4 - Mode changes
Q: switching "Review everything" -> "High risk mode": are waiting cards released?
D: cards the new mode permits are released, audited as a mode pass (not human approval). A
   stricter mode never pulls back UNCHANGED approved or stored content; a substantive edit is a
   new version and is re-gated (D3). An explicit rejection is never resurrected.
Why: a mode is a review preference, not new evidence about already-approved content.

## D5 - Typed non-sensitive goals (question: Bill, 01:09)
Q: under default "Review everything" a typed non-sensitive goal is L0 and enters memory
   unreviewed; before R2 it waited. Should it still wait?
D: no. A goal the customer typed themselves, restated without new claims, is "stated directly"
   = L0 and may pass. Sensitive, inferred or disclosure content still overrides to L2. The pre-R2
   waiting behavior is not restored, and the unaccepted fixed "goal summary = L1" choice stays
   rejected.
Why: the owner's pass table lets L0 pass under "Review everything"; directly-stated content is
   the lowest-risk kind by his own definitions, and the floor still catches the rest.

## D6 - Model-call cap
Q: keep 20 steps per model with `LLM_MAX_CALLS` unset (default 0 = uncapped)?
D: keep the current configuration for this checkpoint. Configuration observation only - it does
   NOT approve any spend. Paid/live provider testing stays held until the owner approves an
   explicit bounded spend with a configured cap.
Why: the question was about the configuration default, not about running paid tests; changing a
   default mid-checkpoint adds risk without evidence. The uncapped default is a known exposure
   and stays visible as an owner decision.

## D7 - Who may decide (authority) (question: Joe, 01:14 / 01:16)
Q: who carries the owner's delegation, with what scope and evidence?
D: the Coordinator (`instinct-christina`), under the owner's grant on his channel: "Carry the
   decisions under my delegation and represent me. You have been granted permission to make
   decision on behalf on me regarding this project" (ts `1793661367.512989`). Decisions under
   that grant are the Coordinator's delegated decisions, not verbatim owner words; exact owner
   words and timestamps are supplied when the review loop needs them (ts `1793661385.367849`).
   Merge, spend, live and security are not covered by this grant and remain the owner's own.
Why: the grant names decisions and representation for the project and does not name merge, spend,
   live or security, so those stay with the owner.

## D8 - Cycles + honest-failure reply (approved scope) (Bill ASK @ `97d6cb1`)
D: approved scope. Cycles (User AI > CM > Nordea > User AI, max 5) @ `616f869`, accepted by Bill
   @ `97d6cb1` (probe: session + 4 top-ups = 5 cycles, 5 reviews, 1 compose, then stops; a
   compose provider error returns an honest failure reply, no scripted figures). It replaces the
   grounded scripted fallback of G4/F-D.
Owner basis: cycle definition, owner ts `1793656059.606069`: "Ok, the cycle i mean is the cycles
   which 1 cycle is equal to user > cm > nordea > user". Assistant proposal ts
   `1793656064.471519` (up to five cycles; partial answers or a clear failure instead of a
   scripted fallback; paid testing and merge stay on hold). Owner approval ts
   `1793656080.483389`: "Yes, add this".
Status: recorded @ `fc20aa6`; this entry was requested by Bill @ `97d6cb1`.

## Feedback log
- 2026-11-03 (review pass): D1 reason now separates the owner's level definitions from the
  Coordinator's delegated interpretation; D4 scope narrowed to unchanged approved/stored content
  with substantive edits still re-gated; explicit reasons added for D4-D7.
- 2026-11-03 (token pass, owner request): wording compacted; no decision content changed.
- Owner feedback will be applied here as revisions with date and source.
