# Successor blueprint: Nordea x Aalto banking prototype, branch instinct-prototype-v3

Project handoff only. Repo: coolkowkank/Nordea-x-Aalto-Banking-. All fixtures are synthetic and NOT live.

## 0. INCOMPLETE WORK (read first)
- R2: the User AI level assigner is NOT model-driven. The owner's requirement is that the User AI determines the risk level; today only a code rubric (sensitivity guard floor plus fixed rules) assigns it. A model-assigned level (with reason and evidence provenance, per the rubric) is NOT built, so the delegated R2 policy set is NOT fully implemented.
- R2: giving goal-summary cards level 1 is a local, unaccepted code choice. It is not an approved AI-risk semantic and must not be justified by keeping older tests green; the next worker should decide it from the rubric.
- R2: e2e, migrate, adapter, remote, env, selftest and new pixel checks were not run on branch `r2`.
- G51 not started. Nothing from `cycles` or `r2` is pushed or QC'd.

## 1. State
| What | Hash | Notes |
|---|---|---|
| Remote head | a7c9cff | Bill (QC) wrapped a 156-char review.md line. review.md line 1 = `TURN: Telkomsel` |
| G42 (pushed) | e57313c | 20 fresh steps per answering model, conversation kept. Bill verified. |
| Local, unpushed: v3 cycles | c73befa (branch `cycles`) | one commit on e57313c, arch 363/0 |
| Local, unpushed: R2 | bce3665 (branch `r2`) | one commit on e57313c, arch 377/0 |
The two local branches both edit `src/server/arch/orchestrator.ts`, `src/server/arch/agents/personal.ts` and `scripts/test-arch.ts`, so expect real merge conflicts when combining them (the cycles patch also edits README.md; the R2 patch does not). Files: `unpushed.bundle` (git bundle, requires e57313c), `patches-cycles/`, `patches-r2/`.

## 2. Approved product decisions
- Env: 120s per-call timeout and `LLM_MAX_CALLS` unchanged. Default `LLM_MAX_CALLS` 0 means UNCAPPED. Never raise or disable either. No paid/real provider tests, no merge, no external-agent (A2A) work until after v3. No mobile layout changes except the approval feature in the main app.
- G42: 20 steps per answering model (fresh per model, context kept).
- v3 cycles: one cycle = User AI > Context Memory > Nordea > User AI, max 5 per turn. The returning User AI reviews evidence and named gaps and either answers or starts the next cycle. At the ceiling: supported or partial model answer and/or ONE focused question only the customer can answer. A configured-model failure gives an explicit honest failure reply, never a canned task answer. The mock/no-provider path stays separate and unchanged.
- R2 approval gateway, USER context cards only, no bank link, one writer per context section:
  - Levels: "No-risk certified (level 0)", "Review everything pass certified (level 1)", "High-risk pass certified (level 2)". The approval ID carries the level.
  - Modes: "No permission" = all levels pass. "Review everything" (default) = levels 1 and 2 cannot pass. "High risk mode" = only level 2 cannot pass. Cards that cannot pass wait in "Waiting for you"; approve in arch.html or the main app. No mode selector in the main app.
  - Delegated policy decisions (made by the other side's Instinct under its owner's delegation): highest applicable level wins (L2 sensitive/inferred/disclosure, L1 evidenced non-sensitive personal context, L0 direct non-sensitive facts or generic). Sensitivity guard is a floor. Missing/invalid/stale level = UNKNOWN = effective L2, never counted as AI certification. Approval ID covers a content hash (title, detail, level, source); a substantive change is a new version and is re-evaluated. Unchanged approved cards are never requeued. A mode change releases newly allowed pending cards (audited as a mode pass, not human approval); a stricter mode never pulls stored cards back; an explicit rejection is never resurrected.
- G51 (adopted, NOT started): skip a member that returned no tool calls (or is exhausted) for the rest of the SAME run so it is not re-asked every step; validate `answeredBy` against the configured members; add a hard total-iteration ceiling = configured members x 20. Caps unchanged.

## 3. What each local branch contains
- `cycles` (commit c73befa): `src/server/arch/cycles.ts` (MAX_CYCLES 5, minimum-call reserve helpers), `orchestrator.ts` (review loop after the session or top-up round; explicit failure replies), `agents/personal.ts` (`llmReviewCycle`, ceiling note), `src/server/llm.ts` (`llmCallsRemaining`, null = uncapped), README (arch 363, LLM_MAX_CALLS default 0 = uncapped). Reserve is best effort: review needs 2 calls left, another cycle needs 4; it is a minimum, not a guarantee. A related question adds one review call when a model is on. Boundary: a fresh session counts as cycle 1 and a follow-up top-up as cycle 1; a follow-up with no gather round starts with an initial review (not a boundary) then at most 5 gap rounds. An earlier off-by-one (6 rounds) is fixed with a pin.
- `r2` (commit bce3665): `approvalGate.ts` (table, names, RUBRIC, contentHash, assignLevel, effectiveApproval), `agents/cm.ts` (gate by effective approval, version dedupe/replace, mode-change release with audit), `agents/personal.ts` (the User AI assigner: goal-summary cards = level 1, sensitive = level 2, with reason), store/schema columns `approval_id`/`approval_level`, routes and orchestrator `userCardMode`, arch.html "User card approval" select and "Approval needed" rows, main app "Waiting for your approval" section with Approve/Reject. Existing pins that auto-stored own goals now set `'High risk mode'` explicitly (the F7/F24-style fixtures).
  - Open (see section 0): the assigner gives goal-summary cards level 1 as a local, unaccepted choice. Level 0 is exercised only by the table tests. The assigner is code only; the model-assigned level is not built.

## 4. Tests (all synthetic, no provider calls)
- At e57313c (pushed): tsc 0, arch 354/0, e2e 37, migrate 43, adapter pass, remote pass, env 7, selftest 3. Official `npm run test:arch` (review guard + arch + migrate) passes on a clean checkout of a7c9cff.
- `cycles`: arch 363/0 (9 cycle pins), plus tsc 0, e2e 37, migrate 43, adapter, remote, env 7, selftest 3 at the earlier combined tree.
- `r2`: arch 377/0, tsc 0. NOT run on r2: e2e, migrate, adapter, remote, env, selftest, and no new pixels were captured after the policy changes (earlier synthetic pixels existed for the arch and main-app approval UI).
- Mutations proven: G42 per-run budget (2 pins fail), cycles counter (1 pin fails) and ceiling (3 fail), R2 unknown-level-to-0 (2 pins fail), R2 unchanged-card dedupe off (many fail). A mutation that made the G42 key shared made the run hang (timeout, not a clean fail).

## 5. Known defects and caveats
- G51 above is open. Auto insights run extra model calls per goal change. Confirm/undo state is in memory only. Cross-provider handover in the middle of a run is unproven live (no paid test).
- README arch assertion counts must match the real totals when branches are combined (354 at e57313c).
- review.md and the Bill/Telkomsel TURN protocol: write only when line 1 is `TURN: Telkomsel`; handover entry max 8 lines and 150 chars per line, ending `NEXT: Bill`; run `npm run check:review` AFTER the final edit and before pushing; one squashed commit per push; fetch and verify TURN before push; no force-push.
- Stale review.md "Next" line (owner-answers-then-single-batch) and cold review-findings-detail.md G45/G46 status (verified at 658b70d and a09f065) still need a hygiene touch in the next real push.

## 6. Suggested order (a recommendation for the next worker, not an instruction to resume work under the current pause)
1. Rebase `cycles` on origin, run all suites, push (Bill QC). 2. Rebase `r2` on that, run all suites plus a pixel check of both approval screens, push. 3. G51 as its own small batch with a regression pin and a bounded mutation. Merge to main stays the owner's decision.
