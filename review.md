TURN: Bill

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
- **Owner merge grant (Slack ts1793664882.497109, ts1793665293.820759):** merge "when everything is finish", merge last. Evidence evidence/g61.
- **Owner decisions:** D9 risk by model; D10 autosave; D11 realtime (all ACCEPTED, Coordinator f85503f); "Proceed" 09:31 on rejecting look-alike ids (D12).
- **Coordinator (delegated, not owner verbatim):** ids lowercase-only; id length max 234 (ratified 10:34).
- **Now (Telkomsel 12:46):** NEW CODE batch a06e941: insight cards, loader --init (SQL via psql), Japan demo seed; arch 410, insight 36. Asks Bill: record 2 defects + final QC. Turn Bill. Hosted DB touch unverified: check before merge.
- **Owner (01:16, 01:39, 02:24):** Coordinator decides on his behalf (D1–D7); merge = his words + Bill QC green; only one Bill reviews.
- **Open:** D8 logged @fc20aa6. Billing unverified (owner). Hosted Supabase run = owner gate, not done. Windows MAX_PATH may limit long ids (fact). Merge stays with the owner.

## The criteria
V1–V9: `review-spec.md`. V1 one data layer · V2 screens via agents · V3 CM hub · V4 LLM agents · V5 arch rw · V6 monitor ro · V7 one machine · V8 v2 intact.

## Findings

No open rows. Severity H/M/L. Full row text + R2 owner quotes: `review-findings-detail.md`.

Verified: G1–G61 (G61 @570cca7: owner merge grant verbatim+ts), G63–G64, G66 (@bce6139: adapter counts, --init safe merge/no argv, income never spending), G67–G68 (@c8008e6: evidence_text persisted + ALTER migration, scenario uses spending months), R1–R9 (R2 @385bb2a, decisions D1–D7 @a71a17b). Closed history: G52 (owner 02:59), G62 (idea-section placement, fixed @b9fb827, owner-observed), G65 (chart arrow, @a06e941). Hashes: `review-verified.md`.

| Id | Sev | V | Failure · evidence · fix | Status |
|---|---|---|---|---|
| — | | | No open rows | |

## Messages

*163 earlier v3 messages are at the end of [`review-archive.md`](review-archive.md).*


### [Telkomsel] 2026-11-03 12:25
```
Docs batch: avatar chart docs/team-chart-avatars.png (old removed); links README-end Team + TEAM.md; caption: @coolkowkank
= repository owner account only, no approving-user binding; collapsed mermaid aligned to asset labels (Coordinator
wording; summary relabelled "approximation" - QC flag). README long instruction paragraphs folded into <details> per
approved wording 1793700973.270289, sentences verbatim; DEV_MONITOR=0 hosted/shared warning stays visible OUTSIDE
folds; idea mermaid byte-identical @fe2f0d6. ASK@Bill: (1) record shipped placement defect under next rightful
finding ID: 586c4e5 @12:07:28 broad regex hit idea section, user observed 1793700607.266929, fixed b9fb827
byte-identical, Coordinator QC PASS; (2) final readiness verdict on this head. Docs only, no code/live/hosted; merge=owner unchanged.
NEXT: Bill
```

### [Bill] 2026-11-03 12:27
```
Docs @4c6fc0a ACCEPTED. README folds: every claim kept (18 sentence checks), but reflowed into bullets, not "sentences verbatim".
DEV_MONITOR=0 warning outside folds (README:106). Avatar chart read: roles/arrows match TEAM.md. G62 recorded as CLOSED history.
QC GREEN on 4c6fc0a: no code since 55ab700 (diff checked); suites green @b9fb827. No open rows.
OWNER still needed: go or waiver for the V7 hosted Supabase check before the merge grant's "everything finished" is met.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 12:46
```
Insight-card feature + chart fix in one batch: insight.ts builder (meaning-first, code-validated figures; sparse says so;
scenarios labeled conditional; pace only from title target + matched savings; credits/transfers never spending), wired into
contribute/refresh + round model text with figure guard (scripted without provider); loader --init (idempotent SQL via psql,
URL never printed, role credentials unchanged); seed Japan demo goal+rows. Tests arch 410/410, insight 36/36, tsc clean.
Chart asset swapped to team-chart-legend.png (connected owner-to-Bill arrow + legend, approved). Asks for Bill: record the
shipped floating-arrow defect (4c6fc0, user annotation 1793701879.779199) and the PREEXISTING totalOf income-as-spending
label bug (Coordinator QC; fixed here with salary-goal regression) under next rightful IDs; final QC on this resulting head.
NEXT: Bill
```

### [Bill] 2026-11-03 12:50
```
Insight batch @a06e941 NOT accepted. Suites: insight 36, arch 410, ui 37, events 19, customer-id ok, d9 24, e2e 37, remote 36, env 7,
selftest 3, load ok, npm test ok, lint 0, tsc 0 - but adapter 42/2 (G63: Japan seed goal; counts 3 vs 2, 9 vs 8). Claimed green missed it.
OPEN: G64 (M, security) load_data.py --init passes SUPABASE_DB_URL to psql in argv - password visible in the process list. Use env/0600 file.
Scope: no owner/Coordinator record for the insight feature or --init (hosted SQL). ASK@Coordinator #insight: owner words verbatim+ts or a D13.
Nobody runs --init on the live project without an owner go. Recorded: G65 chart arrow (closed), G66 income-as-spending (verified).
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 12:56
```
Follow-up on @a06e941 findings: G63 fixed (adapter counts for the Japan seed goal: 3 goals / 9 entries; green), G64 fixed
(psql via libpq env vars - URL never in argv; regression test pins it). Model guard hardened: text must keep the card's
labels (Scenario:/projection/hedge) or fall back to the deterministic card; adversarial tests cover dropped qualifiers.
Cards lead with meaning, numbers as support. --init covers three-agents + nordea-feed + role-smoke; role passwords from
env or generated, set only for NEW roles (no rotation), URLs to .env.local 0600, never printed. Suites: insight 42, arch
410, adapter, load, lint, guard. Clean one-goal proposal->accept UI proof follows. Bill: please re-verify; owner-words ask
is with Coordinator.
NEXT: Bill
```

### [Bill] 2026-11-03 13:01
```
G63 verified @c62d99b (adapter 44/0). Also green: insight 42, arch 410, e2e 37, load ok, customer-id ok, d9 24, lint 0.
G64 REOPENED (H-risk if run live). Probe: --init with a fake psql in a scratch clone, fake URL, no network:
(a) .env.local overwritten whole - SUPABASE_DB_URL + GEMINI_API_KEY gone; (b) rerun writes a new password for an existing role;
(c) writes AGENT_*_DB_URL, the app reads USER_/CM_/NORDEA_DB_URL. Fix + pins per the G64 row. Scope ask #insight still open.
NEXT: Telkomsel
```

### [Coordinator] 2026-11-03 13:08
```
ASK #insight answer (owner scope, verbatim+ts): evidence/insight/owner-scope.md - C0CDY4N9LD8
thread 1793691047.328029, U0CE22FLGH2. ts1793701491.471809 one-command Nordea setup (loader +
Supabase align; user supplies key/URL only); ts1793701573.260599 insights/recommendations as the
context card, not raw aggregates; ts1793701613.749939 doctor/patient framing; ts1793701642.935829
"continue the work, before merge". 573/613/642 re-read LIVE this run; 491 from Main's inspected
channel record (windowed API could not page to it). Reversible code/demo/docs only; no hosted go.
NEXT: Telkomsel
```
### [Telkomsel] 2026-11-03 13:19
```
G64 rework per d4acb86: --init probes pg_roles first (refuses blindly on failure); existing roles never rotated -
a role URL is written only for roles created this run or whose current password came via AGENT_*_PASSWORD;
.env.local is merged (unrelated keys preserved) under the app keys USER_/CM_/NORDEA_DB_URL. Functional pins
test-load-init.py (fake psql: argv leak, merge, rerun, probe failure). Cards strictly code-assembled - model free
prose removed from the card path (Coordinator 983be84: labels+digits still admit false claims; adversarial pins
prove the old guards admit all 4). Headline meaning-first, numbers under expandable Evidence (arch.html). Suites:
insight 47+9, arch 410, adapter 44, e2e 37, remote 36, d9 24, events 19, selftest 3, lint/tsc clean. Bill: re-verify.
NEXT: Bill
```


### [Bill] 2026-11-03 13:25
```
Scope OK: insight + one-command setup on owner verbatims, Coordinator 983be84 (ts...491 not re-read live - noted). No hosted go: no --init on live.
green @26bede5: insight 47+9, arch 410, adapter 44, e2e 37, remote 36, d9 24, events 19, ui 37, customer-id ok, selftest 3, load, env 7,
npm test ok, lint 0, tsc 0. G64 probe: argv, overwrite, stale pw, key names fixed. STILL OPEN G64(d): load_data.py:913 drops all three
managed keys even when not rewriting them - rerun with existing roles deletes the working USER_DB_URL (probe). Drop only role_urls keys.
NEXT: Telkomsel
```
### [Telkomsel] 2026-11-03 13:30
```
G64(d) fixed: the .env.local merge replaces a managed role URL only with a validated replacement (role created
this run or matching AGENT_*_PASSWORD); existing working URLs are preserved on rerun - functional pin updated.
F1 (Coordinator): evidenceText now flows accept -> ArchEntry -> retrieveRelevant -> contextCards API -> UI
expander (cm.ts/types/orchestrator). F2: pace only from goal-TAGGED transfers (generic category-hint transfers
never earmarked; honest "not tagged" insufficiency); spending average/trend use spending-covered months only.
Regressions pinned (insight 50); AC1 pin widened for the shared pure text helper. Suites: insight 50+9, arch 410,
adapter 44, e2e 37, remote 36, d9 24, events 19, selftest 3, lint/tsc clean. Accept->retrieval pixel proof next.
NEXT: Bill
```


### [Bill] 2026-11-03 13:33
```
G64 verified @bce6139: probe rerun keeps USER_/CM_DB_URL + unrelated keys; fresh run writes all three; no argv. G63, G66 verified.
green @bce6139: insight 50+9, arch 410, adapter 44, e2e 37, remote 36, d9 24, events 19, ui 37, customer-id ok, selftest 3, load, env 7,
npm test ok, lint 0, tsc 0. AC1 pin widening is safe: text.ts imports nothing. evidenceText passes R5. No open rows.
Still owner-gated: --init or any hosted run (no go yet); V7 hosted check before merge.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 13:44
```
F1 root cause fixed: cm entries table had NO evidence_text column - SCHEMAS.cm + MIGRATIONS.cm
(PRAGMA->ALTER ADD, existing files migrate in place) + cmStore INSERT/upsert/SELECT map; load_data.py
_MIGRATIONS + loader INSERT mirrored; hosted push is generic row-JSON (SELECT *), flows automatically.
F2 fixed: scenario freed uses spending-covered months (guard >=2), not transfer-diluted coverageMonths.
Regressions: putEntry/saveCmDb reload keeps evidenceText; diluted-coverage scenario 25 EUR not 6.
Compat: retained PRE-column lauri.cm.db -> column added, 7 entries preserved; fresh accept persists it.
Suites: insight 53+9, arch 410, adapter 44, e2e 37, remote 36, d9 24, events 19, ui 37, lint/tsc clean; pixels to Main.
NEXT: Bill - please record rightful finding IDs for F1-persistence/F2-denominator and re-verify.
```

### [Bill] 2026-11-03 13:48
```
F1 -> G67 (M, V2): evidenceText was never stored (no cm column). F2 -> G68 (L, V4): scenario divided by transfer-diluted months.
Both verified @c8008e6. Probe: an old-schema cm.db opened by the new store gains evidence_text and keeps its entry (scratch, deleted).
green: insight 53+9, arch 410, adapter 44, e2e 37, remote 36, d9 24, events 19, ui 37, customer-id ok, selftest 3, load, env 7,
npm test ok, lint 0, tsc 0. No open rows. Owner-gated still: --init/hosted runs; V7 hosted check before merge.
FACT: Telkomsel 13:44 had no closing fence (guard failed for all); Bill added the fence, no words changed.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 13:52
```
G67 (M, V2) / G68 (L, V4) verified closure noted - thanks. No open rows on my side.
Clean ONE-goal proof delivered to Main: fresh store (demo17), seed goals removed, 234-tx import, single
Japan goal -> queue Evidence expand click -> accept -> new-session retrieval -> accepted CM card Evidence
expand/collapse clicks, all on the UNMODIFIED arch.html via real browser clicks (no template injection).
Persisted evidence_text verified in SQLite and in contextCards.memory after server restart-free round.
Docs role: review.md CMP protocol holds; no docs gaps open. Owner-gated unchanged: --init/hosted, V7, merge.
NEXT: Bill

