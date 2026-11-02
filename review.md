TURN: Bill

# review.md: quality control for `instinct-prototype-v3`

From `instinct-prototype-v2` @ `4433b05`. Cold: `review-v2.md`, `review-archive.md` (messages), `review-spec.md` (criteria).

## Protocol v3 (Joe): full rules + roles + settled owner decisions in `review-protocol.md` (cold; grep a rule number)

- Loop **Telkomsel → Bill → Telkomsel**; act only when line 1 names you; `NEXT:` = who acts. Joe + Coordinator have no turn.
- On your turn read only the review.md diff. CMP ≤ 8 lines, ≤ 150 chars; evidence = hash or path:line; baseline = `green @hash`.
- One commit per hand-over (message + evidence). Wake only on a line-1 change or ASK@you. Guard: `npm run check:review`.
- Owner gates: scope, spend, live, security, merge. Coordinator relay = owner's word with ts + verbatim quote; merge = his word to Bill.

## 🧠 Context memory
*Joe, updated 2026-11-03 01:09 (Helsinki). Settled owner decisions: `review-protocol.md` (end).*

- **Goal:** one system: 3 agents + their DBs are the only home for customer data; Abel, arch.html (rw), dev-monitor (ro). Done = V1–V8.
- **Now (Telkomsel 01:04, temp successor):** R2 model-level built (bundle, unpushed), arch 395. Bill QC next. Cards: +1 model call each. Owner Qs (cap + 4 R2) still open.
- **Next:** Bill QC R2 bundle → owner: cap decision + R2 Qs (verify the built rubric matches his words) → merge (owner).

## The criteria
V1–V9: `review-spec.md`. V1 one data layer · V2 screens via agents · V3 CM hub · V4 LLM agents · V5 arch rw · V6 monitor ro · V7 one machine · V8 v2 intact.

## Findings

Severity: **H** blocks the goal, **M** needed for it, **L** polish. Full open-row text + R2 owner quotes: `review-findings-detail.md`.

| Id | Sev | V | Finding | Evidence | Status |
|:-:|:-:|:-:|---|---|:-:|
| R2 | M | V4 | Approval gateway for USER context cards (levels 0–2, 3 modes, "Waiting for you"); level now assigned by the User AI model, code floor only raises; 4 policies main-delegated. | HANDOFF-BLUEPRINT.md §3 | fixed, QC |

Verified: G1–G51, R1, R3–R9. Hashes + notes: `review-verified.md` (grep an id).

## Messages

*89 earlier v3 messages are at the end of [`review-archive.md`](review-archive.md).*

### [Bill] 2026-11-03 00:37
```
G51 verified @3df2f35: probe - NO_CALLS member not re-asked (A:text once, then B only); bad answeredBy stops at the members x steps ceiling.
FACT: baseline green @3df2f35 (arch 356). New docs have no secrets or private locators.
OWNER-Q: default 20 steps per model with LLM_MAX_CALLS unset (uncapped) is unchanged - keep, or set a default cap?
STATE: HOLD - Telkomsel paused; cycles + R2 unpushed. Merge = owner.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 01:04
```
R2 model level (temp successor, one batch): User AI model assigns level+reason+evidence; code validates, floor only raises; no level = UNKNOWN L2.
Typed goal restated = L0 per RUBRIC (decided from rubric). Cards leveled after the round; CM re-gates. UI shows UNKNOWN + why.
FACT: tsc 0, arch 395/0, e2e 37, migrate 43, adapter+remote pass, env 7, selftest 3. Mutations 5/5 caught. Pixels: evidence/r2/.
Changed pins (reasons in blueprint §3): F7, F24 setups, F-B 4 calls, G4 top-up fixture L1, e2e V7 pre-review.
OPEN: main-app sync goal writes wait UNKNOWN until next pass; +1 model call per new card; cycles paused (bundle, not pushed).
STATE: successor stops; handback to Telkomsel after Bill QC. Owner cap question + 4 R2 Qs still open. Merge = owner.
NEXT: Bill
```
