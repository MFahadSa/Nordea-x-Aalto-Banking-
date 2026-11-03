# STATE_HANDOFF.md: Coordinator, 3 Nov 2026, 02:12 Helsinki (rev 4)

**Live state = the 🧠 Context memory section of `review.md`.** This adds only what is not there.
Provenance rule from SYSTEM_PROMPT.md applies: times like 01:18 / 01:22 refer to messages in the
owner's channel as recorded by the Coordinator - unverified from the repo alone.

## At hand-off
- Runtime baseline: 616f869 (Telkomsel's cycles push, Bill-accepted @97d6cb1). Actual doc HEAD:
  this commit (docs-only on 68ee22c). TURN: Telkomsel.
- Chain: `G1–G51 ✓ + R1–R9 ✓ (R2 @385bb2a) > cycles ✓ @616f869 (Bill @97d6cb1) > ⏸ live test (owner) > ⏸ merge (owner) > 🏁`
- R2 fully closed: pushed @385bb2a, Bill-accepted @660b317, policy questions decided @a71a17b
  (DECISIONS.md D1-D7), accepted @2bcddad. No open finding rows.
- Cycles: Bill's probe = session + 4 top-ups = 5 cycles, 5 reviews, 1 compose, then stops; a compose
  provider error returns an honest failure reply, no scripted figures. Logged as approved scope
  (DECISIONS.md D8, owner ts 1793656059.606069 / 1793656064.471519 / 1793656080.483389).
  Coordinator QC on the pushed tree: guard pass, tsc 0, arch 406/0, adapter 44/0, MAX_CYCLES 5→6
  mutation fails exactly 1 pin (trajectory), restored. Not rerun by the Coordinator: 2 of 3
  mutations, e2e 37, migrate 43, env 7, selftest 3. Gap (builder-disclosed): "initial review
  before any gather" pinned by counts only; fixtures synthetic, NOT live proof.
- Prep-r2 dataset landed @d23eb10, Bill-accepted @207f384 (3 new files scripts/prep-r2/,
  byte-identical to christina-prep-r2-cases @4002ac7; validator 74/0; runtime untouched). Known
  gaps stand: no stale-assignment case, no conservative over-assignment pin, static table only.
- Owner-provided independent audit (02:07-02:11): handled. Its one technical claim (goal detail
  bypasses the approval card/hash) was checked through the full path with Bill @68ee22c = NOT a
  defect: detail is blanked at the sharing boundary (personal.ts:523), the card detail is a fixed
  template (personal.ts:235), and the hash binds exactly what is shared. Its policy items (mode
  semantics, call cap, merge route) were not adopted - owner-gated, decisions unchanged.

## Owner context worth keeping
- Plain words, one short message beats three. No feedback = keep going (recorded 01:22).
- Decision review: DECISIONS.md; audit prompt for an external reviewer: prompt_to_audit_coordinator.md.
- Project-facing name for this role: "a new AI assistant" / the Coordinator.

## Known team habits
- Joe hears the owner in a channel nobody else sees; his "OWNER (hh:mm)" lines are hearsay until the
  owner confirms - check against the owner's actual messages (the owner told everyone the delegation
  directly, recorded 01:18). Same rule for Bill's "OWNER (hh:mm, chat to Bill)" lines: a merge go
  counts only as a Coordinator commit quoting the owner's verbatim words + ts, with Bill's QC green
  on the exact head (his rule, 01:40).
- Bill sometimes types message times ahead of the clock; the guard blocks it.
- Concurrent writes happen: always git fetch and re-read line 1 + the newest message before writing;
  rebase your CMP onto the new head and fix NEXT to the CURRENT turn.

## Next checkpoint
Fresh-fetch the current branch and recheck anything that changed before acting on it. The remaining
chain steps (live test, merge) are owner-gated. Test-hardening followup: a clean trajectory pin for
"initial review before any gather" (currently counts-only).
