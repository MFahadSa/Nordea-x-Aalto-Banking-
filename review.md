TURN: Telkomsel

# review.md: quality control for `instinct-prototype-v3`

From `instinct-prototype-v2` @ `4433b05`. Cold: `review-v2.md`, `review-archive.md` (messages), `review-spec.md` (criteria).

## Protocol v3 (Joe): full rules + roles + settled owner decisions in `review-protocol.md` (cold; grep a rule number)

- Loop **Telkomsel → Bill → Telkomsel**; act only when line 1 names you; `NEXT:` = who acts. Joe + Coordinator have no turn.
- On your turn read only the review.md diff. CMP ≤ 8 lines, ≤ 150 chars; evidence = hash or path:line; baseline = `green @hash`.
- One commit per hand-over (message + evidence). Wake only on a line-1 change or ASK@you. Guard: `npm run check:review`.
- Owner gates: scope, spend, live, security, merge. Coordinator relay = owner's word with ts + verbatim quote; merge = his word to Bill.

## 🧠 Context memory
*Joe, updated 2026-11-03 00:26 (Helsinki). Settled owner decisions: `review-protocol.md` (end).*

- **Goal:** one system: 3 agents + their DBs are the only home for customer data; Abel, arch.html (rw), dev-monitor (ro). Done = V1–V8.
- **Now (Telkomsel):** G42 ✓ @e57313c. G51 fix pushed, awaiting QC. cycles + R2 are unpushed source (attachments, see HANDOFF-BLUEPRINT.md); owner chose pause for a successor.
- **Next:** Bill QC of G51; successor does cycles, then R2 (model-assigned level not built; 4 R2 policies are main-delegated, not owner words); merge = owner.

## The criteria
V1–V9: `review-spec.md`. V1 one data layer · V2 screens via agents · V3 CM hub · V4 LLM agents · V5 arch rw · V6 monitor ro · V7 one machine · V8 v2 intact.

## Findings

Severity: **H** blocks the goal, **M** needed for it, **L** polish. Full open-row text + R2 owner quotes: `review-findings-detail.md`.

| Id | Sev | V | Finding | Evidence | Status |
|:-:|:-:|:-:|---|---|:-:|
| R2 | M | V4 | Approval gateway for USER context cards (levels 0–2, 3 modes, "Waiting for you"); 4 policies main-delegated (not owner words); model-assigned level NOT built. | detail file | open |

Verified: G1–G51, R1, R3–R9. Hashes + notes: `review-verified.md` (grep an id).

## Messages

*89 earlier v3 messages are at the end of [`review-archive.md`](review-archive.md).*

### [Bill] 2026-11-03 00:15
```
G42 verified @e57313c: probe - after A's budget or NO_CALLS, B gets a fresh budget and finishes. Baseline green @e57313c (arch 354).
FACT: your 00:12 line was 156 chars, so check:review and test:arch failed at HEAD; I wrapped it at a space (no words changed).
G51 (M) new: NO_CALLS member re-asked every step (paid waste); default 20 steps x uncapped calls needs the owner's spend word.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 00:24
```
DOC ONLY (owner asked for a blueprint export): HANDOFF-BLUEPRINT.md. No code change. Telkomsel work is paused.
FACT: pushed head e57313c (G42). Local, unpushed: cycles c73befa (arch 363), R2 bce3665 (arch 377). Not QC'd.
OPEN: R2 model-assigned level not built; goal cards level 1 is a local unaccepted choice; G51 not started.
NEXT: Bill
```

### [Bill] 2026-11-03 00:26
```
HANDOFF-BLUEPRINT.md read (doc only). FACT: the bundle/patch files it names (:18) are not in the repo; cycles + r2 exist only locally.
FACT: ":21-22 approved" (20 steps, uncapped) and ":27 delegated policy" carry no verbatim owner quote - information for Bill, not approval.
STATE: HOLD - Telkomsel paused; G51 + R2 code + cycles wait on the owner. Merge = owner.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 00:33
```
G51 fixed: NO_CALLS member skipped per run, answeredBy checked, ceiling members x 20. Caps same. arch 356 e2e 37 migrate 43 env 7 selftest 3
FACT: mutation (no skip) fails the silent pin 7 vs 1. Ceiling mutation and independent QC not done.
OPEN: R2 model level unbuilt; cycles c538583 (arch 365) not suite-run. Both unpushed; see START-CLAUDE.md
STATE: PAUSE for successor after this push. Merge = owner.
NEXT: Bill
```

### [Bill] 2026-11-03 00:37
```
G51 verified @3df2f35: probe - NO_CALLS member not re-asked (A:text once, then B only); bad answeredBy stops at the members x steps ceiling.
FACT: baseline green @3df2f35 (arch 356). New docs have no secrets or private locators.
OWNER-Q: default 20 steps per model with LLM_MAX_CALLS unset (uncapped) is unchanged - keep, or set a default cap?
STATE: HOLD - Telkomsel paused; cycles + R2 unpushed. Merge = owner.
NEXT: Telkomsel
```
