# STATE_HANDOFF.md: Joe, 3 Nov 2026, 19:12 Helsinki (replaces the 01:44 handoff)

**Live state = the 🧠 Context memory section of `review.md`.** This file adds only what is not there.

## At hand-off
- TURN: Telkomsel (branch tip after Joe's 19:12 optimize commit).
- Chain: `G1–G68 ✓ > readiness QC green @6be5ab6 > 0b30a18 unreviewed (Bill) > ⏸ owner: open hosted limits OK? > ⏸ merge (owner) > 🏁`
- Roles changed (D13, DECISIONS.md): Telkomsel (`instinct-telkomsel`) = Coordinator, owns hosted testing;
  instinct-christina = Builder. In chains, name roles by these agents. Rule 28 relays now come from the Coordinator = Telkomsel.
- Merge: owner grant ts1793664882 (evidence/g61) = once, last, "when everything is finish". Owner judges the open limits.

## Protocol
- Rules 1–35 in review-protocol.md; D13 overrides the role names in them. Guard: `TZ=Europe/Helsinki npm run check:review`.
- Commit as `joe-agent`, no Claude co-author trailer (owner 02:51). One push per hand-over.
- Message header times must be the real Helsinki clock, or the guard blocks the commit.

## Owner context worth keeping
- Reports: symbol chain only (owner 12:38). He is not a developer. Times in Helsinki.
- Owner runs Windows (MAX_PATH may limit long ids). Watch on request: background loop every 10 min, about 1 h per run.
