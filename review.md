TURN: Telkomsel
TURN: Bill
# review.md: quality control for `instinct-prototype-v3`

From `instinct-prototype-v2` @ `4433b05`. Cold: `review-v2.md`, `review-archive.md` (messages), `review-spec.md` (criteria).

## Protocol v3 (Joe): full rules + roles + settled owner decisions in `review-protocol.md` (cold; grep a rule number)

- Loop **Telkomsel → Bill → Telkomsel**; act only when line 1 names you; `NEXT:` = who acts. Joe + Coordinator have no turn.
- On your turn read only the review.md diff. CMP ≤ 8 lines, ≤ 150 chars; evidence = hash or path:line; baseline = `green @hash`.
- One commit per hand-over (message + evidence). Wake only on a line-1 change or ASK@you. Guard: `npm run check:review`.
- Owner gates: scope, spend, live, security, merge. Coordinator relay = owner's word with ts + verbatim quote; merge = his word to Bill.

## 🧠 Context memory
*Joe, updated 2026-11-03 10:05 (Helsinki). Settled owner decisions: `review-protocol.md` (end).*

- **Goal:** one system: 3 agents + their DBs are the only home for customer data; Abel, arch.html (rw), dev-monitor (ro). Done = V1–V8.
- **Owner D9 (02:32, ts1793665947):** Nordea AI decides risk like User AI, DB-type agnostic. Bill ACCEPTED @3527ac7 (scope in 998fd0f).
- **Owner (02:37, ts1793666107):** realtime arch via SSE. ACCEPTED @b8d22d1 (Bill 03:19), scope in Coordinator commit f85503f (D11).
- **Owner (02:45, ts1793666702):** autosave permission dropdowns, no Save button (@bd15980). ACCEPTED @bd15980 (Bill 03:19, D10, scope in f85503f).
- **Owner (02:59):** G52 closed as history; "Joe: optimize turn". Turn line is Joe; Joe cannot change it.
- **Now (Coordinator 03:35):** turn Telkomsel. Closeout @250dc1e ACCEPTED, G53–G55 verified; D11 docs @2010bca confirmed. No open rows.
- **Owner 09:31 (ts1793691081, Coordinator 5a37147): "Proceed"** - reject non-canonical raw ids (e.g. "a.b") with HTTP 400 + store guard. Scope = this fix only; no live/paid/hosted/auth/merge. Telkomsel built D12 @5016b75 (HTTP 400 + store guards, local green); Bill to QC and assign the finding id.
- **Owner (01:16, 01:39, 02:24):** Coordinator decides on his behalf (D1–D7); merge = his words to Christina + Bill QC green; only one Bill reviews.
- **Coordinator:** D8 noted @fc20aa6. goalCard detail question: Bill 02:10, not a defect.

## The criteria
V1–V9: `review-spec.md`. V1 one data layer · V2 screens via agents · V3 CM hub · V4 LLM agents · V5 arch rw · V6 monitor ro · V7 one machine · V8 v2 intact.

## Findings

No open rows. Severity H/M/L. Full row text + R2 owner quotes: `review-findings-detail.md`.

Verified: G1–G51, G53–G55 (L, @250dc1e: G53 save bound to start customer, G54 SSE uid key, G55 retry w/o intermediate write), R1–R9 (R2 @385bb2a, decisions D1-D7 @a71a17b). Hashes + notes: `review-verified.md` (grep an id).

| Id | Sev | V | Failure · evidence · fix | Status |
|---|---|---|---|---|
| G52 | M | V5 | Owner-reported (ts1793666010.066359): arch.html standing-permission selects reset - 5s poll clobbered an unsaved choice, stale reads repainted. Fix @68f576f (seq guard, dirty/focus) + @bd15980 (autosave, latest pair, gen guard); pins test:arch-ui 18/0, now 29/0. | CLOSED (history, owner 02:59) |
| G56 | M | V1 | D12 gap: scripts/load_data.py:395 still rewrites a non-canonical uid (a.b -> a_b) and has no id check, so the loader writes 'a.b' rows into a_b's DB. Fix: reject with the D12 rule (same regex) before any write; pin a.b load = error, nothing written. | open |
| G57 | L | V1 | /api/users/:userId (server.ts:88,96) is outside the query/body middleware; a.b fails closed (400) but via Express default handler: HTML page with stack trace and server path. Fix: check the path param in the middleware or route; JSON 400 like arch. | open |
| G58 | M | V1 | D12 allows A-Z: 'Lauri' and 'lauri' are two ids but one file on Windows/macOS (case-insensitive FS; owner runs Windows). Same alias class. Fix (scope: Coordinator/owner): lowercase-only ids, or reject an id that case-folds to an existing one; pin it. | open, decision |

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

### [Coordinator] 2026-11-03 03:23
```
FACT CHECK (independent QC, local mock, not live proof): SSE raw-vs-sanitized uid gap CONFIRMED
functional: subscribe raw 'te.st' + real write to te.st -> OPEN stream, zero events; control
'testsimple' got seq 1. tick() never falls back while OPEN (readyState 1 returns early; keepalives
are comments): a dotted-uid view freezes after first load. Latent today (5 simple customers);
real for any email-like userId (registerCustomer stores raw id, common.ts:336). Matches the
builder's local archUidKey fix - independent reproduction for Bill's finding rows.
NEXT: Telkomsel
```
### [Telkomsel] 2026-11-03 03:24
```
CMP: closeout safety batch, 3 confirmed defects (Bill FACTs 02:44/02:50/03:06 "L, no row";
Coordinator repro fadf778). 1) Save bound to its starting customer: a mid-save switch
abandons it - no cross-customer write/paint, new customer's own save never clobbered. 2) SSE
subscribes on archUidKey: event identity = store file identity; dotted uids no longer freeze
silent-OPEN; no leak beyond the store boundary. 3) "Retry now." re-saves the CURRENT pair;
toggling no longer persists an unwanted intermediate value (adopted by counterpart main).
Proof: ui 37/0, events 18/0 (dotted-uid/collision pins), arch 406/0, d9 24/0, lint 0.
NEXT: Bill
```

### [Bill] 2026-11-03 03:27
```
Closeout batch ACCEPTED @250dc1e -> G53-G55 verified (L). green: arch 406, arch-ui 37, events 18, d9 24, adapter 44, e2e 37, remote 36,
env 7, selftest 3, load ok, npm test ok, lint 0. Read: saveUid guard + permSaveGen++ on switch (arch.html), Retry re-saves current pair,
SSE subscribes on archUidKey (routes.ts). Coordinator repro fadf778 noted. No open rows.
NEXT: Telkomsel
```
### [Telkomsel] 2026-11-03 03:31
```
CMP: final docs alignment (docs-only, no code). DECISIONS D11 gains the closeout entry
(G53-G55 @250dc1e) + the required identity disclosure: customer identity = sanitized store
filename (fileFor); aliasing raw uids ("a.b"/"a_b") already share one DB file, so SSE
isolation never exceeds the store's own boundary - stated as-is, no blanket claim.
registerCustomer keeps raw ids; 5 existing simple ids, no observed collision. Normalizing or
rejecting aliases at registration = behavior change, left as an owner scope decision.
D9/D10/D11 verbatims were already committed @f85503f; nothing else changed.
NEXT: Bill
```

### [Bill] 2026-11-03 03:32
```
Docs alignment ACCEPTED @2010bca (no code; baseline green @250dc1e). Identity disclosure checked vs common.ts fileFor + events archUidKey.
FACT: DECISIONS.md is the Coordinator's log; this D11 entry was written by Telkomsel - Coordinator to confirm or adjust it.
OWNER (security gate): ids that sanitize alike ("a.b"/"a_b") share one DB - pre-existing, no collision today. Reject at registration?
NEXT: Telkomsel
```

### [Coordinator] 2026-11-03 03:35
```
CONFIRMED: the D11 closeout entry (Telkomsel @2010bca) stands as the Coordinator record - I
read it back against my independent QC: save-bound race proof (write lands on the start
customer only), archUidKey subscribe (routes.ts:43), Retry re-saves the displayed pair once
(live network + server state), G53-G55 Bill-verified. Identity disclosure lines checked vs
common.ts:20 (fileFor) and common.ts:344 (registerCustomer raw). No adjustment needed.
NEXT: Telkomsel
```

### [Coordinator] 2026-11-03 09:31
```
RULE 28, owner 09:31 EET, Slack ts1793691081.764219, VERBATIM: "Proceed" - in reply to the
fail-closed question (ts1793669558.446589): reject non-canonical raw customer ids (e.g. 'a.b')
with HTTP 400 at the route/dev-monitor seams + a store-level guard (fileFor/openDb), no
migration, no data movement, no coalescence; the 5 existing canonical ids unchanged; email-like
ids error until a separate encoding change. Scope = this reject-id fix only: no live/paid, no
hosted changes, no auth redesign, no merge. Bill: finding row for the raw-alias identity defect.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 10:02
```
D12 fail-closed customer ids implemented, not yet pushed-verified: shared rule customerId.ts, HTTP 400 + store guards.
No migration/move/delete/hosted change; canonical ids unchanged; a.b now 400. Docs: DECISIONS.md D12.
Green local: tsc, test, test:customer-id, arch, arch-events, migrate, adapter, env, e2e, d9.
Bill: please assign the finding ID and QC. Coordinator: mock API/UI error proof.
NEXT: Bill
```

### [Bill] 2026-11-03 10:06
```
D12 @5016b75: core rule OK (customerId.ts, routes uid(), fileFor, contextStore, hydrate skip). green: customer-id 30, arch 406, ui 37,
events 19, d9 24, adapter 44, e2e 37, remote 36, env 7, selftest 3, load ok, npm test ok, lint 0. Live mock: arch a.b -> JSON 400.
OPEN: G56 (M) load_data.py:395 still rewrites a.b -> a_b, no check. G57 (L) /api/users/a.b -> 400 HTML stack page (server.ts:88).
OPEN: G58 (M) Lauri/lauri = one file on case-insensitive FS (owner's Windows). ASK@Coordinator #g58: lowercase-only or case-fold reject?
NEXT: Telkomsel
```
