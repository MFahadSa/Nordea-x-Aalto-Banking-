# Successor blueprint: Nordea x Aalto banking prototype, branch instinct-prototype-v3

> STALE as of 2026-11-03 01:45: R2 @385bb2a, cycles @616f869 and the prep-r2 dataset @d23eb10 are pushed and Bill-accepted. Current state: `review.md`, `DECISIONS.md`.

Project handoff only. Repo: coolkowkank/Nordea-x-Aalto-Banking-. All fixtures are synthetic and NOT live.
Refreshed 2026-11-03 by the temporary successor (identity `instinct-telkomsel`) after ONE batch: **R2 model-assigned level**.
This copy replaces the older repo copy; it is based on the attachment the owner supplied for this session.

## 0. INCOMPLETE WORK (read first)
- **cycles is NOT pushed and NOT suite-run in full.** It was rebased onto ec6b19c, then paused when the owner chose R2 as the
  one batch. Rebased branch `cycles-rebased` head f933aecfd018093ade9f4c22b9964054eb96140e (2 commits on ec6b19c, before Joe's e2f960c docs commit); only tsc 0 and
  arch 367/0 were run on it. It was delivered to the owner as an ATTACHMENT `cycles-rebased-paused.bundle`
  (sha256 b2929ef747e12a33fe843139572570c5e55afd03cdb7afe7884402ae8f6e7bb0, prerequisite ec6b19c). It was NOT committed or pushed.
  It does NOT include R2. README conflict was resolved to 356 and must be set to the real total when it lands.
  The original source stays `unpushed.bundle` (sha256 5713e47c...9cac, branch `cycles` c538583).
- cycles: the "initial review before any gather" path (t4b) is still covered by counts only. Not fully proven.
- R2 (this batch, pushed, awaiting Bill's QC): see section 3. Open items inside R2:
  - Main-app goal writes (`db.ts` -> `appWrites.putGoal`, synchronous) propose the card WITHOUT a level. It waits as UNKNOWN (level 2)
    until the next level pass (next arch chat, contribution, arch goal add/edit, or airlock approve). Safe, but not immediate.
  - Each new or changed user card costs ONE extra model call (one call per pass, all pending cards together) when a model is
    configured. Caps unchanged. A failed/invalid answer is recorded and NOT retried automatically for that card content.
  - Only goal cards exist as user cards today; the level pass handles goal cards. Any future user-card kind needs `goalCard`-style text.
  - Level 1 is exercised by a test fixture answer and the validator; the mock model answers the rubric's L0 for a typed goal.
  - No live/paid provider was run; real-model behaviour of `finishRiskLevels` is unproven.
- Owner question from Bill (ec6b19c), NOT answered: keep default 20 steps per model with LLM_MAX_CALLS unset (uncapped), or set a default cap?
- Joe (e2f960c) lists "4 R2 Qs" for the owner: the four R2 policies are still main-delegated, not owner-confirmed. This push applies them as recorded.

## 1. State
| What | Hash | Notes |
|---|---|---|
| Remote head before this push | e2f960c (Joe docs on ec6b19c) | Bill ec6b19c: G51 verified @3df2f35; line 1 `TURN: Telkomsel` |
| R2 model-assigned level (this push) | see `git log` (one squashed commit on e2f960c) | review.md line 1 = `TURN: Bill` |
| G51 | 3df2f35 | verified by Bill (ec6b19c). Adapter suite: PASS on the R2 tree (this session) |
| G42 | e57313c | verified |
| cycles (paused, local only) | f933aec on ec6b19c (`cycles-rebased-paused.bundle`) | original c538583 in `unpushed.bundle` |
| Old local R2 | bce3665 | superseded by this push (rebased + model level) |
Combining: cycles and R2 both edit `orchestrator.ts`, `agents/personal.ts`, `scripts/test-arch.ts` (and README count). Rebase cycles onto
the R2 push; expect conflicts in `chat()` (cycles adds the review loop; R2 adds `levelUserCards` after the session round).

## 2. Decisions as recorded (provenance: the four R2 policies and G51 are MAIN-DELEGATED choices, not owner words; owner continuation ts 1793658376.346649 said: "I told him to continue"; the other owner originals are quoted in section 7)
- Env: 120s per-call timeout and `LLM_MAX_CALLS` unchanged. Default `LLM_MAX_CALLS` 0 means UNCAPPED. Never raise or disable either. No paid/real provider tests, no merge, no external-agent (A2A) work until after v3. No mobile layout changes except the approval feature in the main app.
- G42: 20 steps per answering model (fresh per model, context kept).
- v3 cycles: one cycle = User AI > Context Memory > Nordea > User AI, max 5 per turn (see section 3, paused).
- R2 approval gateway, USER context cards only, no bank link, one writer per context section:
  - Levels: "No-risk certified (level 0)", "Review everything pass certified (level 1)", "High-risk pass certified (level 2)". The approval ID carries the level.
  - Modes: "No permission" = all levels pass. "Review everything" (default) = levels 1 and 2 cannot pass. "High risk mode" = only level 2 cannot pass. Cards that cannot pass wait in "Waiting for you"; approve in arch.html or the main app. No mode selector in the main app.
  - Delegated policy decisions: highest applicable level wins (L2 sensitive/inferred/disclosure, L1 evidenced non-sensitive personal context, L0 direct non-sensitive facts or generic). Sensitivity guard is a floor. Missing/invalid/stale level = UNKNOWN = effective L2, never counted as AI certification. Approval ID covers a content hash (title, detail, level, source); a substantive change is a new version and is re-evaluated. Unchanged approved cards are never requeued. A mode change releases newly allowed pending cards (audited as a mode pass); a stricter mode never pulls stored cards back; an explicit rejection is never resurrected.
  - Successor decision (this batch, from the rubric, not from old tests): a goal card that restates a goal the customer typed, with no
    new claims, is "intent stated directly by the customer" = L0, written into RUBRIC. The MODEL decides per card; code only raises it.
- G51 (verified): skip a NO_CALLS member for the rest of the run; validate `answeredBy`; ceiling = members x 20. Caps unchanged.

## 3. What this batch built (R2 model-assigned level)
- `approvalGate.ts`: code assigner `assignLevel` REMOVED. New `codeFloor` (sensitive or inferred = 2, else 0; only raises),
  `validateModelLevel` (level must be integer 0-2; reason 8-300 chars; evidence must be `goal:<id>` of THIS card or a verbatim phrase
  from the card or its own goal row; none valid = null = UNKNOWN), `withFloor` (max). RUBRIC gains the typed-goal = L0 example.
- `agents/personal.ts`: `goalCard` (exact card text), `llmAssignLevels` (one run, tools `listMyGoals` + `finishRiskLevels`, own User DB
  only, validated per card, records the answering model), `levelPendingCards` (levels pending personal cards with no level, marks
  `approvalAsked`, writes approval id + reason + evidence + model, audit inform `r2Levels`). Proposals go out with NO level unless the
  same content already has one on the bus (reused, so unchanged cards keep their id and are never re-asked).
- `orchestrator.ts`: `levelUserCards` (pass + CM `regate-user-cards` control) after the session round, `newSession`, `contribute`;
  `reviewQueue`/state add `effectiveApproval` {id, level, unknown, label, why} for personal cards (same derivation as the CM gate).
- `agents/cm.ts`: `regate-user-cards` control re-runs the gate over waiting cards. `routes.ts`: level pass after goal add/edit and airlock approve.
- UI: arch.html "Approval needed" and main app "Waiting for your approval" show UNKNOWN cards too (label says "not an AI certification")
  plus the AI's reason. `llmMock.ts`: deterministic `finishRiskLevels` answer (L0, evidence goal row).
- Test changes with reasons: F7 now asserts the no-model goal card waits as UNKNOWN in High risk mode, then uses "No permission";
  F24 setups use "No permission" (decay pins); F-B now counts 4 calls (level call added); G4 top-up block uses a labelled fixture that
  answers level 1 so the card waits (pin is about top-up wiring); e2e V7 pre-review pin now checks the CM DB holds only the own
  level-0 goal card and not the waiting Nordea aggregate (replies were identical before/after on the mock).

## 4. Tests (all synthetic, no provider calls, ANTHROPIC_* unset, mock or no provider)
- R2 push tree: tsc 0, arch 395/0, e2e 37/0, migrate 43/0, adapter PASS ("All checks passed"), remote PASS, env 7/0, selftest 3/0,
  `npm run test:arch` (review guard + arch + migrate) PASS, `check:review` PASS.
- Mutations (each restored after): unknown->level 0 (4 pins fail), floor off (2), evidence unchecked (3), re-ask every turn (1), no CM re-gate (2).
- Pixels (synthetic seed `seed/demo`, mock then no provider): `evidence/r2/arch-approval-queue.png`, `evidence/r2/main-app-approval.png`
  (a level-2 card raised by the floor with its reason; an UNKNOWN card).
- cycles-rebased (paused): tsc 0, arch 367/0 only.
- Earlier: G51 at 3df2f35 arch 356/0 etc.; G42 at e57313c.

## 5. Known defects and caveats
- See section 0 (main-app sync writes level later; extra model call per new card; real model unproven).
- Auto insights run extra model calls per goal change. Confirm/undo state is in memory only. Cross-provider handover mid-run unproven live.
- README arch count = 395 on this push; must match the real total when cycles lands.
- review.md protocol: write only when line 1 is `TURN: Telkomsel`; entry max 8 lines x 150 chars ending `NEXT: Bill`; run
  `npm run check:review` after the final edit; one squashed commit per push; fetch and verify TURN before push; no force-push.

## 6. Next steps (recommendation; work stays paused until the owner says otherwise)
1. Bill: QC this R2 push (rubric decision L0 for typed goals, UNKNOWN handling, re-gate, UI pixels, the four changed test setups).
2. Then one batch: land cycles from `cycles-rebased-paused.bundle` (or `unpushed.bundle`), rebase onto the R2 push, resolve
   `chat()`/README conflicts, run all suites, add the t4b trajectory pin if a fixture reaches it.
3. Owner: answer Bill's default-cap question. Merge stays the owner's decision. Paid tests stay held.

## 7. Owner originals (exact words, role-labelled, timestamps only)
- 1793655485.676829 OWNER: "20 fresh steps per model"
- 1793656059.606069 OWNER: "Ok, the cycle i mean is the cycles which 1 cycle is equal to user > cm > nordea > user"
- 1793656064.471519 ASSISTANT (reviewed proposal, NOT owner): "Got it: *User AI → CM → Nordea → User AI = one complete cycle.* The returning User AI reviews the contributions and either answers or starts the next cycle, up to five.

  Should I have Telkomsel add this to v3 alongside the 20-step G42 fix, with partial answers or a clear failure instead of a scripted fallback? Paid testing and merge would stay on hold."
- 1793656080.483389 OWNER: "Yes, add this"
- 1793657363.613939 OWNER: "I give you approval on behalf of me, you know the main concept, so decide whatever it takes to achieve the objective when there is question to me."
- 1793658376.346649 OWNER: "I told him to continue"
- R2 owner quotes (levels/modes table, "The user AI will determine the risk level"): `review-findings-detail.md`.
The four R2 policies and G51 are MAIN-delegated applications, not owner-verbatim. Default LLM_MAX_CALLS 0 = uncapped is observed config, not spend authority. Paid tests and merge stay held.

## 8. Handback to Telkomsel (explicit)
The temporary successor's ONE batch (R2) is done and handed to Bill for QC. The successor has stopped and holds no further turn.
Telkomsel resumes only after Bill's verdict: reconcile source (this push + the paused cycles bundle), TURN and QC before any new work.
