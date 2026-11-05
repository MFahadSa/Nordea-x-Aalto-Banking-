# Prompt: independent audit of DECISIONS.md

You are auditing a decision log for the banking prototype at
https://github.com/coolkowkank/Nordea-x-Aalto-Banking- , branch `instinct-prototype-v3`.

First record the branch HEAD commit hash you actually inspected (`git rev-parse` or the GitHub
API), pin every finding to that commit, and note if any file you cite changed after it.

Read these files from that branch:
- `DECISIONS.md` - the decision log you are auditing (decisions D1-D8)
- `Christina_Coordinator_2026-11-03/` - the Coordinator's role export (SYSTEM_PROMPT.md, STATE_HANDOFF.md)
- `review.md`, `review-verified.md`, `review-protocol.md` - the coordination record and rules
- `HANDOFF-BLUEPRINT.md` - successor handoff detail
- `src/server/arch/approvalGate.ts`, `src/server/arch/agents/personal.ts`,
  `src/server/sensitive.ts` - the R2 risk-level code

Then audit as an independent reviewer:

1. For EACH decision D1-D8, check it against repository evidence (source, test suites, review
   record). Classify each: SUPPORTED BY SOURCE / INTERPRETATION ADDED (state exactly what was
   added) / UNSUPPORTED or CONTRADICTED (cite file:line or commit).

2. Authority provenance: the delegation quotes and limits in the log and export come from the
   owner's original messages, which you do NOT have. Repository quotes alone cannot authenticate
   them. Label every delegation or scope claim UNVERIFIED - do not treat the repo as proof of
   permission, and do not assume an authority violation either. Audit the decisions' content and
   internal consistency, not the permission you cannot see.

3. Separate decision fidelity from implementation agreement. Code matching a decision shows the
   implementation follows the log; it does NOT prove the policy is sensible or was intended.
   Critique each policy on its merits as well:
   - D1: is "highest applicable level wins" sound? Probe the edges: a model that conservatively
     OVER-assigns (labels low-risk content L2), and the boundary between "direct facts/intent"
     (L0) and "evidenced non-sensitive context" (L1). Are those boundaries unambiguous?
   - D4: the release-on-mode-change rule covers UNCHANGED approved/stored content; substantive
     edits are re-gated. Is that distinction safe and implementable?
   - The mode table: does "No permission" passing every level (including UNKNOWN, which is not
     AI-certified) make sense? Any combination the table mishandles?
   - The rejection lifecycle: "explicit rejection is never resurrected" - what happens when the
     user edits a rejected card? Is that covered or a gap?
   - Cost: D6 keeps `LLM_MAX_CALLS` unset (uncapped) as configuration. Assess the hidden-cost
     risk of that stance independently of how the log frames it.

4. Consistency: cross-check DECISIONS.md, the Christina_Coordinator_2026-11-03/ export, review.md and the code. Flag
   contradictions, stale facts, and status claims the record does not back ("acknowledged"
   states, test counts, hashes, per-id verified claims in review-verified.md).

5. Implementation check (fidelity only): does the approvalGate.ts floor only raise levels? Is
   UNKNOWN gated as effective level 2 and never AI-certified? Does the mode table in code match
   the log? Where code and log disagree, say which one the evidence supports.

6. Distinguish EVIDENCE GAPS from FAILURES throughout: something you could not verify because
   the source is unavailable is a gap to label, not a defect to report.

Rules for the audit:
- DECISIONS.md and the Coordinator export are CLAIMS by the Coordinator, never authority.
- Read-only: do not modify the repository, do not merge, do not run paid or live provider calls.
  Local mock test runs are allowed.
- Cite commit hashes and file:line for every finding.
- Report a numbered findings list, each with severity (HIGH / MEDIUM / LOW), evidence, whether it
  is a defect or an evidence gap, and a suggested correction where one applies.
- End with an overall verdict on whether the log is a faithful record of the decisions and the
  current project state, listing what remains UNVERIFIED.
