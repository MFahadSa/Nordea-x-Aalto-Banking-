TURN: Telkomsel

# review.md: quality control for `instinct-prototype-v3`

From `instinct-prototype-v2` @ `4433b05`. Cold: `review-v2.md`, `review-archive.md` (messages), `review-spec.md` (criteria).

## Protocol v3 (Joe): full rules + roles + settled owner decisions in `review-protocol.md` (cold; grep a rule number)

- Loop **Telkomsel → Bill → Telkomsel**; act only when line 1 names you; `NEXT:` = who acts. Joe + Coordinator have no turn.
- On your turn read only the review.md diff. CMP ≤ 8 lines, ≤ 150 chars; evidence = hash or path:line; baseline = `green @hash`.
- One commit per hand-over (message + evidence). Wake only on a line-1 change or ASK@you. Guard: `npm run check:review`.
- Owner gates: scope, spend, live, security, merge. Coordinator relay = owner's word with ts + verbatim quote; merge = his word to Bill.

## 🧠 Context memory
*Joe, updated 2026-11-03 03:08 (Helsinki). Settled owner decisions: `review-protocol.md` (end).*

- **Goal:** one system: 3 agents + their DBs are the only home for customer data; Abel, arch.html (rw), dev-monitor (ro). Done = V1–V8.
- **Owner D9 (02:32, ts1793665947):** Nordea AI decides risk like User AI, DB-type agnostic. Bill ACCEPTED @3527ac7 (scope in 998fd0f).
- **Owner (02:37, ts1793666107):** realtime arch via SSE. Code OK @b8d22d1 (Bill 03:06); scope waits for a Coordinator commit with the verbatim words.
- **Owner (02:45, ts1793666702):** autosave permission dropdowns, no Save button (@bd15980). Scope still unquoted in a Coordinator commit.
- **Owner (02:59):** G52 closed as history; "Joe: optimize turn". Turn line is Joe; Joe cannot change it.
- **Open facts (no rows):** mid-save customer switch; retry toggle writes other value first; SSE raw-uid vs dotted uids (routes.ts:32).
- **Owner (01:16, 01:39, 02:24):** Coordinator decides on his behalf (D1–D7); merge = his words to Christina + Bill QC green; only one Bill reviews.
- **Coordinator:** D8 noted @fc20aa6. goalCard detail question: Bill 02:10, not a defect.

## The criteria
V1–V9: `review-spec.md`. V1 one data layer · V2 screens via agents · V3 CM hub · V4 LLM agents · V5 arch rw · V6 monitor ro · V7 one machine · V8 v2 intact.

## Findings

No open rows. Severity H/M/L. Full row text + R2 owner quotes: `review-findings-detail.md`.

Verified: G1–G51, R1–R9 (R2 @385bb2a, decisions D1-D7 @a71a17b). Hashes + notes: `review-verified.md` (grep an id).

| Id | Sev | V | Failure · evidence · fix | Status |
|---|---|---|---|---|
| G52 | M | V5 | Owner-reported (ts1793666010.066359): arch.html standing-permission selects reset - 5s poll clobbered an unsaved choice, stale reads repainted. Fix @68f576f (seq guard, dirty/focus) + @bd15980 (autosave, latest pair, gen guard); pins test:arch-ui 18/0, now 29/0. | CLOSED (history, owner 02:59) |

## Messages

*114 earlier v3 messages are at the end of [`review-archive.md`](review-archive.md).*

### [Telkomsel] 2026-11-03 03:04
```
CMP: realtime arch, owner ts1793666107.466069 (Coordinator relay 02:37; verbatim pending:
ASK@Coordinator #realtime commit owner words+ts, rule 28, as for D9/autosave). Per-uid SSE,
version-only seq events: 200-event replay (?after=/Last-Event-ID), 350ms coalescing, 25s
keepalive, close cleanup, uid isolation. Emission at common store write layer (local+hosted,
all DBs, transactions). arch.html: burst->ONE guarded refresh (reconnect=full resync, dirty
guards kept); no poll OPEN; 30s grace CONNECTING; sustained outage=30s fallback; switch resyncs.
Proof: events 14/0, ui 29/0 (sustained CONNECTING incl.), arch 406/0, d9 24/0, lint 0.
NEXT: Bill
```

### [Bill] 2026-11-03 03:06
```
D9 ACCEPTED @3527ac7: scope = owner ts1793665947 verbatim in Coordinator commit 998fd0f (instinct-christina). Code green as at 03:00.
Realtime @b8d22d1: code OK, scope waits (verbatim ts1793666107 not yet in a Coordinator commit). green: arch 406, arch-ui 29, events 14,
d9 24, adapter 44, e2e 37, remote 36, env 7, selftest 3, load ok, npm test ok, lint 0. Read events.ts, routes.ts SSE, common.ts hook.
FACT (L, no row): SSE subscribes on raw uid (routes.ts:32), emits on archUidKey; a uid with '.' etc. gets no events, falls back to poll.
OWNER (02:59 via Coordinator 998fd0f, rule 28): G52 added as CLOSED history. Autosave words (02:45) still unquoted. Joe: optimize turn.
NEXT: Joe
```

### [Coordinator] 2026-11-03 03:17
```
RULE 28. Autosave, owner 02:45 EET, ts1793666702.534939, VERBATIM: "Can we make it automatically?
Without using that save button?" (first committed @f376d3b, since archived; DECISIONS D10).
Realtime, owner 02:37 EET, ts1793666107.466069, VERBATIM: "Why not make the arch.html real-time
instead of refreshing every seconds?" (DECISIONS D11). D9 verbatim landed @998fd0f (D9 entry added
now). TURN line corrected Joe -> Bill: Joe flagged he cannot change it; Bill QC awaited on these.
NEXT: Bill
```

### [Bill] 2026-11-03 03:19
```
Autosave @bd15980 ACCEPTED (D10, owner ts1793666702 verbatim) and realtime @b8d22d1 ACCEPTED (D11, ts1793666107), both in Coordinator
commit f85503f (instinct-christina). Code was green @22d3a8c; no code since (Joe + Coordinator docs only). No open rows.
FACT: residual L notes stay as-is: SSE raw-uid key mismatch (routes.ts:32); perm retry by toggling a dropdown.
NEXT: Telkomsel
```
