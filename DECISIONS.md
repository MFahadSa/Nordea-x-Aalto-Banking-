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
   personal context. L0 = non-sensitive facts or intent the customer stated directly, or
   generic non-personal content.
Why: the level names and pass table are the owner's own definitions; the content-to-level mapping
   is the Coordinator's delegated interpretation of them. The sensitivity guard is a code floor
   the model cannot lower.

## D2 - Missing, invalid or stale level
Q: a card the AI cannot classify (no answer, out-of-range, wrong type, stale)?
D: UNKNOWN = effective level 2 for gating, and never counted as AI certification. The
   applicable mode table still governs release.
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

## D9 - Nordea AI decides bank-side proposal risk (approved scope) (Bill ASK @ `0900976`)
D: approved scope. The Nordea AI levels its own pending proposals: code validates each claim,
   derives observed/inferred itself, binds a server-recomputed content+risk receipt, and keeps a
   raising-only floor; attempted-failure/invalid/stale = UNCERTIFIED HIGH, never a silent low;
   NO_MODEL = the deterministic code rules. Implemented @ `3527ac7`; Bill code OK 03:00, ACCEPTED
   03:06 (scope basis: verbatim in Coordinator commit `998fd0f`).
Owner basis: ts `1793665947.464749`: "Can you make the Nordea AI decide the risk by themself,
   similarly like User AI. Make it flexible to all types of database, so that in the future if we
   change the Nordea database type, we don't have to change anything with the AI model."
Spend note (Bill FACT): one Nordea model call per round/import/resume when proposals are pending.
   Paid runs stay the owner's gate (D6).
Status: recorded 2026-11-03 with the Coordinator rule-28 commit answering Bill's ASK #d9.

## D10 - Autosave standing permissions (approved scope)
D: approved scope. Both permission dropdowns autosave on change; the Save button is removed; the
   latest pair wins, stale confirmations are ignored, and a failed save keeps the choice with a
   visible honest error. Implemented @ `bd15980` (supersedes the Save-only UI @ `68f576f`); Bill
   code OK @ `5e1d570`.
Owner basis: ts `1793666702.534939`: "Can we make it automatically? Without using that save
   button?" (first quoted in Coordinator commit `f376d3b`, since archived to `review-archive.md`).
Status: recorded 2026-11-03 with the same Coordinator rule-28 commit as D9.

## D11 - Realtime arch view (approved scope) (builder ASK #realtime)
D: approved scope. arch.html is live via per-customer SSE: version-only sequenced events from the
   common store write layer, 200-event replay, 350ms coalescing, 25s keepalive; one guarded
   refresh per burst, reconnect = full resync, 30s CONNECTING grace then a bounded 30s fallback
   poll, no polling while OPEN. Implemented @ `b8d22d1`; Bill code OK 03:06; scope = this record.
Owner basis: ts `1793666107.466069`: "Why not make the arch.html real-time instead of refreshing
   every seconds?"
Status: recorded 2026-11-03 with the same Coordinator rule-28 commit as D9.
Closeout (@ `250dc1e`; Bill G53-G55 verified 03:27): a permission save is bound to the
   customer it started on (a mid-save switch abandons it without touching the new customer's
   own save); the SSE route subscribes on the store-sanitized uid key; a failed save offers
   "Retry now." which re-saves the current pair - no intermediate value is ever persisted.
Identity disclosure: a customer's identity IS the sanitized store filename (`fileFor`,
   common.ts:20). Raw uids that sanitize alike ("a.b" vs "a_b") already share ONE database
   file, so SSE events keyed the same way isolate exactly what the store isolates - no blanket
   cross-customer isolation claim beyond that boundary. `registerCustomer` keeps the raw id
   (common.ts:344); the 5 existing customers are simple ids, no observed collision. Normalizing
   or rejecting aliases at registration is a behavior change and stays an owner scope decision.

## D12 - Fail-closed customer ids (implemented 2026-11-03; QC in progress)
Decision: a customer id is canonical only if it is one or more of `[a-z0-9_-]`: lowercase only, no length cap.
   Anything else (`a.b`, `a b`, `a/b`, email-like ids, `Lauri`) is rejected with a typed error, never
   rewritten, never lowercased for the caller. Lowercase-only was chosen by the Coordinator under the
   project delegation (Bill G58: `Lauri` and `lauri` would share one file on a case-insensitive disk).
   It is a Coordinator-authored decision, not an owner quote.
Where: one rule in `src/server/customerId.ts`, mirrored in `scripts/load_data.py`. HTTP: `/api` answers 400
   `INVALID_CUSTOMER_ID` before any handler when `userId` (query or body) or the `:userId` path param is not
   canonical; `/api/arch/:uid/*` does the same. Store: `fileFor`, `registerCustomer`, `deleteDbFile`, the
   context store and `archUidKey` throw before any file is opened or written. The loader checks every id in
   the input first, so one bad id writes nothing.
Stored ids: `listCustomers()` returns canonical ids only, so an old non-canonical index entry cannot break
   iteration. The index keeps it untouched (`listStoredIds()`). `/api/arch/customers` returns `customers`
   plus `rejected` and `hydrateSkipped`; the dev monitor shows `unsupportedIds`. /arch.html does not offer
   rejected ids, and clears every panel when a customer cannot be shown, so no other customer's data
   stays under the wrong name.
Hosted: rows under a non-canonical id are skipped on hydrate (count, store, id, row count are shown in the
   status above), never written, deleted or renamed. No hosted calls were made to test this.
Not done: no migration, no file move or delete, no hosted change, no auth redesign, no merge.
Effect: this REPLACES the D11 identity disclosure ("a.b" and "a_b" sharing one file). Canonical ids keep
   their files: lauri, eeva, alex and the other checked ids. That is not a hosted or historical inventory:
   any existing id with a dot, space, uppercase letter or similar now gets 400 by design. Email-like ids stay
   unsupported until a separate storage-encoding change.
Tests: `npm run test:customer-id` (rule, loader, hydrate with a pool double, real server over HTTP, arch.html
   mock-DOM switching).

## Feedback log
- 2026-11-03 (review pass): D1 reason now separates the owner's level definitions from the
  Coordinator's delegated interpretation; D4 scope narrowed to unchanged approved/stored content
  with substantive edits still re-gated; explicit reasons added for D4-D7.
- 2026-11-03 (token pass, owner request): wording compacted; no decision content changed.
- 2026-11-03 (owner-provided independent audit): the audit's goal-detail claim was checked
  through the full path with Bill (@68ee22c) and is NOT a defect: goal details never cross the
  sharing boundary - the Customer section shares titles with detail blanked (personal.ts:523,
  AC2/AC3), the card detail is a fixed template (personal.ts:235), and the content hash binds
  exactly what is shared. Detail only influences which titles are selected for sharing
  (personal.ts:522). Three further items assessed as POLICY PROPOSALS, not defects, and not
  adopted: UNKNOWN handling in "No permission" mode (matches the owner's mode table), a finite
  LLM_MAX_CALLS default (would reverse D6), and the auditor's attempt to rescind the merge route
  (void). Auditor "FIXED" labels were not accepted. Record states: proposed -> confirmed ->
  implemented -> independently verified.
- Owner feedback will be applied here as revisions with date and source.
