TURN: Telkomsel

# review.md: quality control for `instinct-prototype-v3`

From `instinct-prototype-v2` @ `4433b05`. Cold: `review-v2.md`, `review-archive.md` (messages), `review-spec.md` (criteria).

## Protocol v3 (Joe): full rules + roles + settled owner decisions in `review-protocol.md` (cold; grep a rule number)

- Loop **Telkomsel → Bill → Telkomsel**; act only when line 1 names you; `NEXT:` = who acts. Joe + Coordinator have no turn.
- On your turn read only the review.md diff. CMP ≤ 8 lines, ≤ 150 chars; evidence = hash or path:line; baseline = `green @hash`.
- One commit per hand-over (message + evidence). Wake only on a line-1 change or ASK@you. Guard: `npm run check:review`.
- Owner gates: scope, spend, live, security, merge. Coordinator relay = owner's word with ts + verbatim quote; merge = his word to Bill.

## 🧠 Context memory
*Joe, updated 2026-11-03 11:47 (Helsinki). Settled owner decisions: `review-protocol.md` (end).*

- **Goal:** one system: 3 agents + their DBs are the only home for customer data; Abel, arch.html (rw), dev-monitor (ro). Done = V1–V8.
- **Owner decisions:** D9 risk by model; D10 autosave; D11 realtime (all ACCEPTED, Coordinator f85503f); "Proceed" 09:31 on rejecting look-alike ids (D12).
- **Owner 11:07 (ts1793696825):** "Tell Joe to optimize review.md" - done 11:20 (cold moves only, no decision/finding lost).
- **Coordinator (delegated, not owner verbatim):** ids lowercase-only; id length max 234 (ratified 10:34).
- **Now (Bill 11:46):** live go owner-quoted in 1cc4d44; from-zero README run green @5d80921 (mock, local). Hosted Supabase run NOT done (owner gate). Merge = owner. Turn Telkomsel.
- **Owner (01:16, 01:39, 02:24):** Coordinator decides on his behalf (D1–D7); merge = his words + Bill QC green; only one Bill reviews.
- **Open:** D8 logged @fc20aa6. Billing unverified (owner). Hosted Supabase run = owner gate, not done. Windows MAX_PATH may limit long ids (fact). Merge stays with the owner.

## The criteria
V1–V9: `review-spec.md`. V1 one data layer · V2 screens via agents · V3 CM hub · V4 LLM agents · V5 arch rw · V6 monitor ro · V7 one machine · V8 v2 intact.

## Findings

No open rows. Severity H/M/L. Full row text + R2 owner quotes: `review-findings-detail.md`.

Verified: G1–G60 (hashes + notes: `review-verified.md`), R1–R9 (R2 @385bb2a, decisions D1–D7 @a71a17b). G52 closed (history, owner 02:59).

| Id | Sev | V | Failure · evidence · fix | Status |
|---|---|---|---|---|
| — | | | No open rows | |

## Messages

### [Joe] 2026-11-03 11:47
```
JOE readback #role (Telkomsel ask 11:42): records/archive role = keep review.md hot (≤8 CMP lines per message, 🧠 ≤15 bullets),
archive when >5 messages (newest 2 kept), collapse verified rows to the Verified line, move cold text only (never decisions/findings),
one commit + one push per hand-over, guard with TZ=Europe/Helsinki. Owner word quoted with ts; no Joe turn.
Readback: agreed; role section rides the next consolidated batch at the rightful TURN (single writer).
```

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
### [Telkomsel] 2026-11-03 11:36
```
Docs batch, no code: README arch 409 + test:customer-id row + D12 canonical-234 fail-closed (no migration);
HANDOFF-BLUEPRINT staleness refresh + final live status (run3 all-3 model-finished API-verified, both views
inspected green; 36/38 admitted attempts incl failures; billing unverified, free-tier user-stated);
DECISIONS D12 header -> "QC verified" (Coordinator-approved exact text). Runtime equivalence
c7f6b59..7676af9: docs-only commits since the live runs, verified by diff. ASK: docs + final-readiness QC.
NEXT: Bill
```

### [Bill] 2026-11-03 11:36
```
Docs batch @0e3f6f2 ACCEPTED as docs (no code since 55ab700): README 409 + D12 rows match source and suites.
Final readiness NOT green. Live runs (36/38 paid attempts, Groq) are an owner gate: no Coordinator commit quotes the owner's live/spend
go (ts1793698331 appears only in Telkomsel's text), and nothing under evidence/. ASK@Coordinator #live: commit the owner words verbatim
+ ts and sanitized run evidence (counts, round ids, cap) under evidence/. Then Bill does the from-zero README run and final QC.
FACT: Joe's memory says "D8 pending" - D8 is logged @fc20aa6. D12 header "QC verified" by Telkomsel is fine (G56-G60 verified).
NEXT: Telkomsel
```
### [Coordinator] 2026-11-03 11:40
```
Bill ASK #live answered: evidence/e2e/live-owner-authority-and-bounded-runs.md - owner live/retry go
verbatim + ts (1793697352/1793697372/1793698331, earlier gate 1793655130), sanitized run facts:
3 runs, 36/38 admitted attempts incl failures (NOT charges), round ids, cap mechanics, run-2 429
(org truncated), zero post-429 calls. Billing unverified/user-stated. No code, no secrets.
NEXT: Telkomsel
```
### [Coordinator] 2026-11-03 11:41
```
Accuracy fix + blueprint: NO_CALLS count reconciled to retained logs (2 confirmed: run1 chat2, run3;
2 further failovers logged "other" only, detail not retained - evidence file amended). Coordinator role
blueprint appended to HANDOFF-BLUEPRINT.md (owner pre-merge ask ts1793698745.784809). No code.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 11:42
```
Pre-merge successor blueprint (owner ask ts1793698745.784809): Telkomsel builder role section
appended to HANDOFF-BLUEPRINT.md after the Coordinator section (preserved as-is). Docs only, no code.
ASK@Bill: exact from-zero README/final-QC plan - commands, provider mode, hosted/account/data
effects - BEFORE any execution; no new live authority granted here. Also your reusable QC role
section + readback. ASK@Joe: records/archive role section + readback. Single writer: role sections
ride later consolidated batches at rightful TURN. Role readbacks + Bill final-readiness verdict on
the resulting head remain the pre-merge gate; merge not authorized.
NEXT: Bill
```

### [Bill] 2026-11-03 11:46
```
#live OK: owner words verbatim + Slack ts in Coordinator commit 1cc4d44 (rule 28); evidence file read, no secrets. Billing unverified (owner).
From-zero README run DONE, mock, local only, fresh clone @5d80921, no .env, no hosted: install 0, load_data --target file 255 records,
npm run dev: /, arch.html, dev-monitor, /state 200; customers alex/eeva/lauri; POST /api/selftest 13/13. Server stopped, scratch only.
QC GREEN @5d80921 (code = 55ab700, suites green). Not done: hosted Supabase run (owner gate, unreachable here). Merge = owner (rule 22).
ANS@Telkomsel #role: Bill's reusable role = Bill_QualityControl_2026-11-01/ (SYSTEM_PROMPT, importing_bill_prompt). Readback: QC only.
NEXT: Telkomsel
```
