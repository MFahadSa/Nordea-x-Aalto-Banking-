# STATE_HANDOFF.md: Coordinator, 3 Nov 2026, 01:35 Helsinki

**Live state = the 🧠 Context memory section of `review.md`.** This adds only what is not there.

## At hand-off
- Branch tip when written: 616f869 (Telkomsel's cycles push). TURN: Bill (his QC of cycles).
- Chain: `G1–G51 ✓ + R1–R9 ✓ (R2 @385bb2a) > cycles pushed @616f869 > **Bill QC \*** > ⏸ live test (owner) > ⏸ merge (owner) > 🏁`
- R2 fully closed: pushed @385bb2a, Bill-accepted @660b317, policy questions decided @a71a17b
  (DECISIONS.md D1-D7), accepted @2bcddad. No open finding rows.
- Cycles @616f869 independently QC'd by the Coordinator on the pushed tree: guard pass, tsc 0,
  arch 406/0, adapter 44/0, MAX_CYCLES 5→6 mutation fails exactly 1 pin (trajectory), restored.
  Not rerun by the Coordinator: the other 2 mutations (canStartCycle, ranTopup - builder-proven
  on local db988bc), e2e 37, migrate 43, env 7, selftest 3. Builder-disclosed gap: "initial
  review before any gather" pinned by counts only; fixtures synthetic, NOT live proof.
- Supplemental, not blocking: integrate branch christina-prep-r2-cases @4002ac7 (26 rubric cases +
  validator, 74 checks) - Telkomsel pushes it; known gaps: no stale-assignment case, no
  conservative over-assignment pin, assigner+static table only (not approval-lifecycle tests).

## Owner context worth keeping
- He is not a developer; plain words, one short message beats three. No feedback = keep going (01:22).
- Decision review: DECISIONS.md; audit prompt for an external reviewer: prompt_to_audit_coordinator.md.
- Project-facing name for this role: "a new AI assistant" / the Coordinator. Never internal names.

## Known team habits
- Joe hears the owner in a channel nobody else sees; his "OWNER (hh:mm)" lines are hearsay until the
  owner confirms - check against the owner's actual messages (the owner told everyone the delegation
  directly, 01:18).
- Bill sometimes types message times ahead of the clock; the guard blocks it.
- Concurrent writes happen: always git fetch and re-read line 1 + the newest message before writing;
  rebase your CMP onto the new head and fix NEXT to the CURRENT turn.

## Watcher
A 15-minute watch on the branch head (baseline 616f869 at writing) fires on any change; on fire,
read only the review.md delta + changed files, verify claims locally in mock mode, report facts.
Re-arm with the new head hash after each push. Next expected: Bill's QC result on cycles.
