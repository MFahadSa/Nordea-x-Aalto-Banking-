TURN: Telkomsel

# review.md: quality control for `instinct-prototype-v3`

From `instinct-prototype-v2` @ `4433b05`. Cold: `review-v2.md`, `review-archive.md` (messages), `review-spec.md` (criteria).

## Protocol v3 (Joe): full rules + roles + settled owner decisions in `review-protocol.md` (cold; grep a rule number)

- Loop **Telkomsel → Bill → Telkomsel**; act only when line 1 names you; `NEXT:` = who acts. Joe + Coordinator have no turn.
- On your turn read only the review.md diff. CMP ≤ 8 lines, ≤ 150 chars; evidence = hash or path:line; baseline = `green @hash`.
- One commit per hand-over (message + evidence). Wake only on a line-1 change or ASK@you. Guard: `npm run check:review`.
- Owner gates: scope, spend, live, security, merge. Coordinator relay = owner's word with ts + verbatim quote; merge = his word to Bill.

## 🧠 Context memory
*Joe, updated 2026-11-03 11:20 (Helsinki). Settled owner decisions: `review-protocol.md` (end).*

- **Goal:** one system: 3 agents + their DBs are the only home for customer data; Abel, arch.html (rw), dev-monitor (ro). Done = V1–V8.
- **Owner decisions:** D9 risk by model; D10 autosave; D11 realtime (all ACCEPTED, Coordinator f85503f); "Proceed" 09:31 on rejecting look-alike ids (D12).
- **Owner 11:07 (ts1793696825):** "Tell Joe to optimize review.md" - done 11:20 (cold moves only, no decision/finding lost).
- **Coordinator (delegated, not owner verbatim):** ids lowercase-only; id length max 234 (ratified 10:34).
- **Now (Bill 11:15):** G60 VERIFIED @55ab700 (test-only, arch 409/0). No open rows. Turn Telkomsel.
- **Owner (01:16, 01:39, 02:24):** Coordinator decides on his behalf (D1–D7); merge = his words + Bill QC green; only one Bill reviews.
- **Open:** D8 pending with Coordinator. Windows MAX_PATH may limit long ids (fact). Merge stays with the owner.

## The criteria
V1–V9: `review-spec.md`. V1 one data layer · V2 screens via agents · V3 CM hub · V4 LLM agents · V5 arch rw · V6 monitor ro · V7 one machine · V8 v2 intact.

## Findings

No open rows. Severity H/M/L. Full row text + R2 owner quotes: `review-findings-detail.md`.

Verified: G1–G60 (hashes + notes: `review-verified.md`), R1–R9 (R2 @385bb2a, decisions D1–D7 @a71a17b). G52 closed (history, owner 02:59).

| Id | Sev | V | Failure · evidence · fix | Status |
|---|---|---|---|---|
| — | | | No open rows | |

## Messages

*141 earlier v3 messages are at the end of [`review-archive.md`](review-archive.md).*

### [Telkomsel] 2026-11-03 11:11
```
G60 hardened per Bill 11:07 + Coordinator decision: id omit is TOP-LEVEL only (cards.map(c => ({...c, id: undefined}))),
no recursive replacer. Content detection restored to original /\btx-|IBAN|FI\d{2}/i so lowercase content stays caught.
Controls caught: tx-9132, IBAN FI12 3456 7890, FI12345678901234, lowercase iban fi12 3456 7890, nested {id:"ref tx-9132"}.
Pin: forced card-fi12aaaa-bbbb and card-mw0ft0fa-7yfi50 not flagged. Mutations: recursive omit misses the nested leak,
case-sensitive misses lowercase content, pre-fix pipeline flags benign ids. Test-only, no production code.
FACT: test:arch 409/0 (+3 G60), migrate 43/0, lint 0.
NEXT: Bill
```

### [Bill] 2026-11-03 11:15
```
G60 verified @55ab700 (test-only). Top-level id omit only; /i detection kept; nested + lowercase controls. arch 409/0 on 2 runs, lint 0.
Cards carry only one random field (id); others are text, counts, ISO time (orchestrator.ts:487-492), so the flake source is closed.
FACT: commit author is "Instinct Agent", not instinct-telkomsel - information only. No open rows.
NEXT: Telkomsel
```
