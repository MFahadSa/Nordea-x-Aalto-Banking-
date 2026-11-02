# Starter prompt for the next Claude session (copy everything below the line)

---

You are continuing project work as GitHub identity `instinct-telkomsel` ("Telkomsel") on repo `coolkowkank/Nordea-x-Aalto-Banking-`, branch `instinct-prototype-v3`. Read `HANDOFF-BLUEPRINT.md`, then `review.md` (read the diff only) before you touch anything. Fixtures are synthetic and NOT live.

## Pushed state
- G42 verified at e57313c. G51 (skip a NO_CALLS member for the rest of a run, validate `answeredBy`, ceiling = members x 20) is pushed in the commit after 5257739 and awaits Bill's QC. Find its hash with `git log --oneline -5`.
- Not pushed, not QC'd: branch `cycles` (c538583, arch 365/0) and branch `r2` (bce3665, arch 377/0). They were delivered as attachments, not committed: `unpushed.bundle` (a git bundle; `git bundle verify` first, it needs e57313c), `patches-cycles/` and `patches-r2/`. Import with `git fetch unpushed.bundle cycles:cycles r2:r2` or `git am`.
- The two branches both edit `orchestrator.ts`, `agents/personal.ts` and `scripts/test-arch.ts`, so expect merge conflicts.

## Remaining work, in order
1. cycles: rebase on origin, run every suite (arch, e2e, migrate, adapter, remote, env, selftest). The trajectory pins prove 5 completed User AI > CM > Nordea > User AI boundaries and no sixth. The "initial review before any gather" path is covered by counts only. Add a trajectory pin for it if you can build a fixture that reaches it.
2. R2: build a model-assigned User AI risk level (rubric, reason, evidence). A missing or invalid level = UNKNOWN = effective level 2, never an AI certification. Decide the goal-summary card level from the rubric. Do not keep old tests green by fixing levels. Run all suites, capture synthetic pixels of the arch.html and main-app approval screens.
3. After a stable base: one scoped push per item.

## Decisions to respect
- The R2 table (owner words) is in `review-findings-detail.md`. USER context cards only, no bank link.
- The four R2 policies and G51 are choices delegated to the counterpart's coordinator, NOT owner words: highest applicable level wins, unknown = effective level 2, version/content hash with approval ID, mode changes release newly allowed cards.
- Cycle = User AI > CM > Nordea > User AI, max 5. 20 fresh steps per model. A configured-model failure gives an explicit failure, never a canned answer.

## Holds
- Keep the 120s per-call timeout. Do not raise or disable `LLM_MAX_CALLS`; default 0 means uncapped. Never claim a monetary ceiling. This is observed config, not spend approval.
- No real or paid provider calls, hosted writes, spend, deployments, deletions, force-pushes, security/access changes, or merge (merge = owner). No external-agent (A2A) work until after v3. No mobile layout changes except the approval feature in the main app.
- Never put credentials, private chat locators or message IDs in the repo.

## Protocol
- Write `review.md` only when line 1 is `TURN: Telkomsel`. Fetch and confirm a fast-forward right before pushing.
- Handover entry `### [Telkomsel] YYYY-MM-DD HH:MM` (not ahead of the clock): a fenced block, at most 8 lines of at most 150 chars, ending `NEXT: Bill`. Line 1 becomes `TURN: Bill`.
- Run `npm run -s check:review` after the final edit and before pushing. One squashed commit per push, message ends `TURN: Bill`. No force-push, no history rewrite.
- Do not start until the previous session is paused. Check `git log origin/instinct-prototype-v3` first to avoid colliding.
