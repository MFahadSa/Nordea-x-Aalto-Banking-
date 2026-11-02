TURN: Telkomsel

# review.md: quality control for `instinct-prototype-v3`

From `instinct-prototype-v2` @ `4433b05`. Cold: `review-v2.md`, `review-archive.md` (messages), `review-spec.md` (criteria).

## Protocol v3 (Joe): full rules + roles + settled owner decisions in `review-protocol.md` (cold; grep a rule number)

- Loop **Telkomsel → Bill → Telkomsel**; act only when line 1 names you; `NEXT:` = who acts. Joe + Coordinator have no turn.
- On your turn read only the review.md diff. CMP ≤ 8 lines, ≤ 150 chars; evidence = hash or path:line; baseline = `green @hash`.
- One commit per hand-over (message + evidence). Wake only on a line-1 change or ASK@you. Guard: `npm run check:review`.
- Owner gates: scope, spend, live, security, merge. Coordinator relay = owner's word with ts + verbatim quote; merge = his word to Bill.

## 🧠 Context memory
*Joe, updated 2026-11-03 01:47 (Helsinki). Settled owner decisions: `review-protocol.md` (end).*

- **Goal:** one system: 3 agents + their DBs are the only home for customer data; Abel, arch.html (rw), dev-monitor (ro). Done = V1–V8.
- **Now (Bill, Telkomsel 01:45):** R2 @385bb2a, cycles @616f869, dataset @d23eb10 all Bill-accepted; arch 406. No open rows. Merge = owner.
- **Next:** nothing queued in code. Merge, spend, live, security stay with the owner (D7); held: live both views/live E2E/README/billing.
- **Owner (01:16):** Coordinator decides on his behalf (D1–D7 in DECISIONS.md, Bill-accepted 01:27).
- **Owner (01:39, rule 22, Bill-accepted 01:40):** merge go = his words to Christina, quoted with ts in her commit, + Bill QC green on that head.
- **Open:** D8 (cycles + honest-failure reply as approved scope) = Bill's ASK@Coordinator 01:36, not yet logged.

## The criteria
V1–V9: `review-spec.md`. V1 one data layer · V2 screens via agents · V3 CM hub · V4 LLM agents · V5 arch rw · V6 monitor ro · V7 one machine · V8 v2 intact.

## Findings

No open rows. Severity H/M/L. Full row text + R2 owner quotes: `review-findings-detail.md`.

Verified: G1–G51, R1–R9 (R2 @385bb2a, decisions D1-D7 @a71a17b). Hashes + notes: `review-verified.md` (grep an id).

## Messages

*94 earlier v3 messages are at the end of [`review-archive.md`](review-archive.md).*

### [Bill] 2026-11-03 01:42
```
prep-r2 dataset ACCEPTED @d23eb10: validator 74/0 reproduced, no imports/env/network, no secrets. Baseline unchanged (no code).
FACT: it checks the cases against its own rules, not approvalGate.ts - wire it to canPass/codeFloor in a later batch to make it a real pin.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 01:45
```
CMP: docs only. R2 row (findings-detail) + G51 row set verified; review-verified.md += R2 @385bb2a, cycles @616f869, dataset @d23eb10.
HANDOFF-BLUEPRINT.md gets a one-line STALE banner (Joe's STATE_HANDOFF is current); Now/Next lines refreshed. No code. green @81a2bfd (arch 406).
Residuals, disclosed: cycles "initial review before any gather" is count-pinned only; dataset static, not wired; R2 approval-id hash UNSIGNED (V9).
Held, not ours: live both views, live E2E, README, billing; no merge/spend/paid. START-CLAUDE.md left as is (older text).
NEXT: Bill
```

### [Bill] 2026-11-03 01:46
```
Docs reconcile ACCEPTED @d7c0976 (no code; records match Bill's verdicts). D8 noted @fc20aa6. No open rows; merge per rule 22 change.
NEXT: Telkomsel
```
