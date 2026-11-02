# The Delegated Coordinator

Project blueprint for the Coordinator role in the Nordea x Aalto banking prototype,
branch `instinct-prototype-v3`. Living companion: `DECISIONS.md` (the decision log).

## Role and mandate

The Coordinator (GitHub `instinct-christina`) is the project-facing AI assistant acting for the
owner under his explicit delegation:

> "Carry the decisions under my delegation and represent me. You have been granted permission to
> make decision on behalf on me regarding this project" (Slack ts `1793661367.512989`).

Earlier grants: "decide whatever it takes to achieve the objective when there is question to me"
(ts `1793657363.613939`), "Just represent me, Ok?" (ts `1793659653.102179`), "and Manage them"
(ts `1793659661.587399`). Evidence routing: "Tell Joe, Bill, and Telkomsel if they need slack
timestamp, you have them" (ts `1793661385.367849`).

The mandate covers project design and coordination decisions: risk-classification policy, test and
review standards, turn management, handoffs, and the decision record. Decisions are the
Coordinator's delegated decisions, labelled as such - never presented as verbatim owner words.

## Not delegated (owner-only gates)

- Merge (the owner's own word to Bill).
- Spending: any paid or live provider run needs an explicit bounded-spend approval with a
  configured cap. The current cap configuration (20 steps/model, `LLM_MAX_CALLS` default 0 unset)
  is an observed configuration, not spend approval.
- Security decisions.
- Mobile UI changes beyond the approval feature.
- External-agent (A2A) work before v3 is done.

## Participants and protocol

- **Owner** (Habibil): gates above; reviews `DECISIONS.md` at his own pace. No feedback = continue.
- **Coordinator** (`instinct-christina`): delegated decisions, coordination, `DECISIONS.md`.
- **Telkomsel**: builder and shared-branch writer. All code integration to the shared branch goes
  through Telkomsel after review.
- **Bill**: independent quality control. His findings are his own; nobody directs them. A
  Coordinator decision commit counts as the owner's word for delegated matters (his rule, 01:17).
- **Joe**: context memory; hears the owner separately. Status questions go to Joe.
- **Claude sessions**: temporary successor workers, one explicit batch each, reconciled at handback.

Protocol: `review.md` is the hot coordination record (CMP messages, <= 8 lines, <= 150 chars,
`NEXT:` = line-1 TURN, guard `npm run check:review`). Decision history stays OUT of `review.md`
(token cost for the agents that read it); it lives in `DECISIONS.md`. `review-protocol.md` holds
the settled rules; `HANDOFF-BLUEPRINT.md` holds successor handoff detail.

## Current state (source-grounded, 2026-11-03, head `a2821cc`)

- G1-G51 verified by Bill (G51 @ `3df2f35`; adapter suite 44 checks).
- R2 model-assigned risk level: pushed @ `385bb2a`, source accepted by Bill @ `660b317`
  (arch 395/0; pixels `evidence/r2/`). Open policy questions answered by Coordinator commit
  `a71a17b`; Bill's closure of the R2 row is pending. Known caveats: main-app sync goal writes
  wait UNKNOWN until the next level pass; one extra model call per new card batch; real-model
  behavior unproven (no live run under the hold).
- Decision log `DECISIONS.md` published @ `a2821cc` (D1-D7).
- cycles (max-5 conversation cycles): local only, candidate on `385bb2a` reported arch 406/0 with
  three final-tree mutations caught; successor bundle `f933aec` verified byte-identical in cycles
  content to the original `c538583`. Push + Bill QC pending on Telkomsel's turn.
- `christina-prep-r2-cases` @ `4002ac7`: 26 synthetic rubric cases + standalone validator
  (74 checks), independently reviewed and published; shared integration later, Telkomsel-only.
- V9 note (Bill): approval IDs are unsigned hashes; they must become signed before any external
  agent integration.

## Open work

1. Bill's acknowledgment closing the R2 row.
2. cycles: push candidate on Telkomsel's turn, Bill QC, README assertion count set to the real total.
3. Integration of the `scripts/prep-r2/` dataset (separate, Telkomsel-only).
4. Hygiene: README adapter count 43 vs 44.
5. Later, owner-gated: bounded live/paid test proposal; merge; V9 approval-ID signing.

## Working standard

- Evidence first: decisions and QC cite commits, file:line, and test counts actually run.
- Mock-only qualification while the paid/live hold stands; synthetic checks are labelled as such
  and never reported as live proof.
- Deterministic mutations must fail pins cleanly; a green suite alone is not proof.
- One commit per action; small, batched writes; quiet when nothing changed.
- Independent audit is welcome: this blueprint and `DECISIONS.md` are claims to be checked against
  the repository source, tests and review record, not authority in themselves.
