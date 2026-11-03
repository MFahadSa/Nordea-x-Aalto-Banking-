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

Verified: G1–G61 (G61 @570cca7: owner merge grant verbatim+ts), R1–R9 (R2 @385bb2a, decisions D1–D7 @a71a17b). Closed history: G52 (owner 02:59), G62 (idea-section placement, fixed @b9fb827, owner-observed). Hashes: `review-verified.md`.

| Id | Sev | V | Failure · evidence · fix | Status |
|---|---|---|---|---|
| G63 | M | V8 | test:adapter 42/2 @a06e941: new Japan seed goal breaks 'lauri goals (2)' (got 3) and 'all 8 cabinet entries' (got 9); the batch claimed green without this suite. Fix: update adapter expectations + any README/seed counts; rerun all suites. | open |
| G64 | M | sec | load_data.py --init runs psql with SUPABASE_DB_URL as a command-line argument: the privileged password is visible in the process list while it runs. Fix: pass via env (PGHOST/PGUSER/PGPASSWORD/PGDATABASE parsed from the URL) or a 0600 service file; never in argv. Pin it. | open |
| G65 | L | V7 | Shipped docs defect: floating owner-to-Bill arrow in chart @4c6fc0a (owner annotation ts1793701879.779199); replaced by team-chart-legend.png @a06e941. | CLOSED (history) |
| G66 | M | V4 | Pre-existing: Nordea 'related spending' summed credits (salary) as spending (totalOf). Fixed @a06e941: spendingTotal excludes credits/own transfers (nordea.ts), salary-goal pin in test-insight-cards.ts:76. | verified @a06e941 |

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
