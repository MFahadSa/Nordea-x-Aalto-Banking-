# scripts/prep-r2 - R2 model-driven risk assigner: synthetic rubric dataset + validator

Prepared on local branch `christina-prep-r2-cases` (base: `e2f960c` on `instinct-prototype-v3`).
NEW files only. No runtime imports, no edits to existing files, no provider calls.

## What this is

- `r2-rubric-cases.json` - 26 synthetic cases for qualifying the future MODEL-driven User AI
  risk-level assigner (R2). Each case has title / detail / source / expected level / reason.
  Categories: sensitive direct input, evidenced non-sensitive context, direct non-sensitive
  facts, generic, goal summaries, unsupported inferences, external disclosure, malformed model
  assignments (UNKNOWN = effective L2), sensitivity guard floor, valid model assignments.
  Plus the exact 3-mode x 4-level pass table (No permission / Review everything (default) /
  High risk mode; UNKNOWN = effective L2, never AI certification).
- `validate-r2-cases.mjs` - standalone shape + coverage validator. Run:
  `node scripts/prep-r2/validate-r2-cases.mjs`  (exit 0 = all checks pass; accepts an
  optional path argument for mutation checks).

## Provenance and status

- Rubric semantics are the MAIN-DELEGATED R2 policy set recorded in HANDOFF-BLUEPRINT.md
  section 2 (highest applicable level wins: L2 sensitive / unsupported-inferred / intended
  external disclosure, L1 evidenced non-sensitive personal context, L0 direct non-sensitive
  facts/intent or generic; sensitivity guard floor; missing/invalid/stale level = UNKNOWN =
  effective L2; approval ID binds a content hash; explicit rejection persists).
- Sensitive-topic grounding: `src/server/sensitive.ts` `SENSITIVE_TOPIC`. The validator
  carries a standalone snapshot (marked in the file); the runtime source of truth is
  sensitive.ts.
- Expected levels are PROPOSED test expectations for qualification, not new owner decisions.
- Goal summaries are pinned per the delegated rubric (direct non-sensitive intent = L0,
  sensitive = L2). The unaccepted code choice "goal-summary = L1" (HANDOFF-BLUEPRINT.md
  section 0) is intentionally NOT adopted here.

## How the builder consumes this

Use the cases as pins when building the model-driven assigner: a correct implementation
assigns each case its expected level with reason and evidence provenance, maps invalid or
missing model output to UNKNOWN (effective L2, never AI certification), never lets a model
assignment undercut the code sensitivity floor, and applies the mode table exactly.
Integration happens only after the explicit one-batch handback; only Telkomsel pushes to the
shared branch.

## Verified at creation

- `node scripts/prep-r2/validate-r2-cases.mjs`: 74 passed, 0 failed (26 cases, 12 mode rows).
- Mutation sanity: flipped expected level, wrong effective level, and a broken mode row each
  make the validator exit 1.
- Repo suites (tsc / arch / migrate / adapter / e2e / remote / env / selftest) intentionally
  NOT re-run here: these are new standalone files under scripts/prep-r2/ with no runtime
  imports, so they cannot change existing suite results; suites belong to the integration
  pass after the handback.
