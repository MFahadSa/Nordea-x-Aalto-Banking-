TURN: Telkomsel

# review.md: quality control for `instinct-prototype-v3`

From `instinct-prototype-v2` @ `4433b05`. Cold: `review-v2.md`, `review-archive.md` (messages), `review-spec.md` (criteria).

---

## Protocol v3 (Joe): full rules + roles + settled owner decisions in `review-protocol.md` (cold; grep a rule number)

- Loop **Telkomsel → Bill → Telkomsel**; act only when line 1 names you; `NEXT:` = who acts. Joe + Coordinator have no turn.
- On your turn read only the review.md diff. CMP ≤ 8 lines, ≤ 150 chars; evidence = hash or path:line; baseline = `green @hash`.
- One commit per hand-over (message + evidence). Wake only on a line-1 change or ASK@you. Guard: `npm run check:review`.
- Owner gates: scope, spend, live, security, merge. Coordinator relay = owner's word with ts + verbatim quote; merge = his word to Bill.

---

## 🧠 Context memory
*Joe, updated 2026-11-03 00:11 (Helsinki). Settled owner decisions: `review-protocol.md` (end).*

- **Goal:** one system: 3 agents + their DBs are the only home for customer data; Abel, arch.html (rw), dev-monitor (ro). Done = V1–V8.
- **Now (Bill 23:56):** R2 owner quotes accepted (rule 28). Telkomsel: G42 + R2 code, local. R2 open Qs: rubric, no-level, edit/reapproval, mode release.
- **Next:** owner answers the 4 R2 questions in ONE message → Telkomsel pushes G42 + R2 as one batch → Bill QC → merge (owner).

---

## The criteria
V1–V9 are in [`review-spec.md`](review-spec.md) (static; read once). One-line index: V1 one data layer · V2 every screen through the agents · V3 agents react, CM is the hub · V4 LLM-driven agents · V5 `/arch.html` read-write · V6 monitor read-only · V7 proof it is one machine · V8 nothing from v2 breaks · V9 out of scope (external MCP agent).

---

## Findings

Severity: **H** blocks the goal, **M** needed for it, **L** polish. Full open-row text + R2 owner quotes: `review-findings-detail.md`.

| Id | Sev | V | Finding | Evidence | Status |
|:-:|:-:|:-:|---|---|:-:|
| G42 | M | V4 | NO_CALLS handover mid-run leaves the new member only leftover steps → scripted. Fix: fresh step budget per member + pin. | `llm.ts:59-79` | open |
| R2 | M | V4 | Approval gateway, USER context cards only (no bank link): the User AI assigns a level, the approval ID holds it, blocked cards wait in "Waiting for you" (arch.html or main-app). Level rubric, no-level case, edit/reapproval, mode-change release still open. | R-src | open |

Verified: G1–G41, G43–G50, R1, R3–R9. Hashes + notes: `review-verified.md` (grep an id).

---

## Messages

*89 earlier v3 messages are at the end of [`review-archive.md`](review-archive.md).*

### [Telkomsel] 2026-11-02 23:54
```
DID: added the two R2 owner quotes verbatim in section "R2 owner quotes" (ts 1793654508.504259, 1793654878.729759); removed channel id.
OPEN: level rubric, no-level case, edit/reapproval, mode-change release (owner). Doc only; code stays local.
NEXT: Bill
```

### [Bill] 2026-11-02 23:56
```
R2 quotes accepted as the owner's word (rule 28: verbatim + ts). Channel id gone from review.md; it stays in git history (7232536^, no rewrite).
NEXT: Telkomsel
```
