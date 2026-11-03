TURN: Bill

# review.md: quality control for `instinct-prototype-v3`

From `instinct-prototype-v2` @ `4433b05`. Cold: `review-v2.md`, `review-archive.md` (messages), `review-spec.md` (criteria).

## Protocol v3 (Joe): full rules + roles + settled owner decisions in `review-protocol.md` (cold; grep a rule number)

- Loop **Telkomsel → Bill → Telkomsel**; act only when line 1 names you; `NEXT:` = who acts. Joe + Coordinator have no turn.
- On your turn read only the review.md diff. CMP ≤ 8 lines, ≤ 150 chars; evidence = hash or path:line; baseline = `green @hash`.
- One commit per hand-over (message + evidence). Wake only on a line-1 change or ASK@you. Guard: `npm run check:review`.
- Owner gates: scope, spend, live, security, merge. Coordinator relay = owner's word with ts + verbatim quote; merge = his word to Bill.

## 🧠 Context memory
*Joe, updated 2026-11-03 11:04 (Helsinki). Settled owner decisions: `review-protocol.md` (end).*

- **Goal:** one system: 3 agents + their DBs are the only home for customer data; Abel, arch.html (rw), dev-monitor (ro). Done = V1–V8.
- **Owner decisions:** D9 risk by model (ACCEPTED); D10 autosave; D11 realtime (both ACCEPTED, Coordinator f85503f); "Proceed" 09:31 on rejecting look-alike ids (D12).
- **Coordinator (delegated, not owner verbatim):** ids lowercase-only; id length max 234 (ratified 10:34, measured: .nordea.json.migrated rename).
- **Now (Telkomsel 11:02):** G60 fixed (test-only, case-sensitive regex, arch 408/0). Turn Bill to verify. G56–G59 verified.
- **Owner (01:16, 01:39, 02:24):** Coordinator decides on his behalf (D1–D7); merge = his words + Bill QC green; only one Bill reviews.
- **Open facts:** Windows MAX_PATH may still limit long ids (owner is on Windows). D8 pending with Coordinator. Merge stays with the owner.

## The criteria
V1–V9: `review-spec.md`. V1 one data layer · V2 screens via agents · V3 CM hub · V4 LLM agents · V5 arch rw · V6 monitor ro · V7 one machine · V8 v2 intact.

## Findings

No open rows. Severity H/M/L. Full row text + R2 owner quotes: `review-findings-detail.md`.

Verified: G1–G51, G53–G59 (G53–G55 L @250dc1e: save bound to start customer, SSE uid key, retry w/o intermediate write; G56–G58 D12 @2172ed2: loader guard, users JSON 400, lowercase-only; G59 @bd950a3: 234-char cap, typed 400), R1–R9 (R2 @385bb2a, decisions D1-D7 @a71a17b). Hashes + notes: `review-verified.md` (grep an id).

| Id | Sev | V | Failure · evidence · fix | Status |
|---|---|---|---|---|
| G52 | M | V5 | Owner-reported (ts1793666010.066359): arch.html standing-permission selects reset - 5s poll clobbered an unsaved choice, stale reads repainted. Fix @68f576f (seq guard, dirty/focus) + @bd15980 (autosave, latest pair, gen guard); pins test:arch-ui 18/0, now 29/0. | CLOSED (history, owner 02:59) |
| G60 | L | V8 | R5 flake is a test false positive, not a leak: scripts/test-arch.ts:1668 regex /\btx-\|IBAN\|FI\d{2}/i is case-insensitive, and newId (types.ts:111) makes base-36 ids; ~0.015% of ids match (sim 29/200000, e.g. card-mw0ft0fa-7yfi50). Fix: case-sensitive IBAN shape (e.g. /\bFI\d{2}\s?\d{4}/) or skip id fields; pin with a forced 'fi12' id. | open |

## Messages

*136 earlier v3 messages are at the end of [`review-archive.md`](review-archive.md).*

### [Coordinator] 2026-11-03 10:38
```
ASK@Bill #r5: disposition on the observed test:arch R5 flake - one failure on my first @bd950a3 run ("no card
carries a raw record": a generated card combining 2 transactions), then 406/0 on two reruns, not id-related.
Row, note, or no-action is your call; final readiness needs it resolved or explicitly qualified.
NEXT: Telkomsel
```


### [Bill] 2026-11-03 10:40
```
ANS@Coordinator #r5: root cause found -> G60 (L, V8, test-only). test-arch.ts:1668 matches /FI\d{2}/i case-insensitively; newId
(types.ts:111) base-36 ids hit it ~0.015% each (sim 29/200000, e.g. "card-mw0ft0fa-7yfi50"). No raw record leaks; the check is wrong.
OPEN: G60 fix = case-sensitive IBAN shape or skip id fields, plus a pin with a forced "fi12" id. Coordinator 234 confirm noted (f29404f).
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 11:02
```
G60: fixed, test-only. R5 scan now uses case-sensitive /\btx-|\bIBAN\b|\bFI\d{2}\s?\d{4}/ and strips generated id
fields before matching (test-arch.ts:1668-1674). Positive controls: tx-9132, "IBAN FI12 3456 7890", FI12345678901234
still caught. Pin: forced card-fi12aaaa-bbbb and Bill's card-mw0ft0fa-7yfi50 no longer flag (old /i regex flagged both).
FACT: test:arch 408/0 (+2 G60 checks), lint 0. Mutation checked: old regex fails the pin, new one passes; no production code.
NEXT: Bill
```
