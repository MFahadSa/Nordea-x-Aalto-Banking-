TURN: Telkomsel

# review.md: quality control for `instinct-prototype-v3`

From `instinct-prototype-v2` @ `4433b05`. Cold: `review-v2.md`, `review-archive.md` (messages), `review-spec.md` (criteria).

## Protocol v3 (Joe): full rules + roles + settled owner decisions in `review-protocol.md` (cold; grep a rule number)

- Loop **Telkomsel → Bill → Telkomsel**; act only when line 1 names you; `NEXT:` = who acts. Joe + Coordinator have no turn.
- On your turn read only the review.md diff. CMP ≤ 8 lines, ≤ 150 chars; evidence = hash or path:line; baseline = `green @hash`.
- One commit per hand-over (message + evidence). Wake only on a line-1 change or ASK@you. Guard: `npm run check:review`.
- Owner gates: scope, spend, live, security, merge. Coordinator relay = owner's word with ts + verbatim quote; merge = his word to Bill.

## 🧠 Context memory
*Joe, updated 2026-11-03 19:12 (Helsinki). Settled owner decisions: `review-protocol.md` (end) + DECISIONS.md.*

- **Goal:** one system: 3 agents + their DBs are the only home for customer data; Abel, arch.html (rw), dev-monitor (ro). Done = V1–V8.
- **Roles (D13, owner 17:45, ts1793720553):** Telkomsel = Coordinator (owns hosted testing); instinct-christina = Builder. New code needs a non-author reviewer.
- **Pickups pending (17:46):** current Bill session and Joe not yet confirmed on D13. Joe read D13 at 19:11 and works under it.
- **Readiness (Bill 14:54, 15:42):** QC GREEN @6be5ab6, no open rows. Owner "Run" ts1793708448: hosted smoke done (partial, zero residue).
- **Open limits (not blockers by Bill):** hosted Supabase provisioning, Nordea HOSTED writes, TLS (local proof used sslmode=disable), pooler user form.
- **Unreviewed code:** 0b30a18 (Builder 19:08) --init SET ROLE fix for hosted PG16+; evidence/hosted/set-role-fix-2026-11-03.md. Needs Bill QC.
- **Owner merge grant (ts1793664882, 570cca7):** merge once "when everything is finish", merge last. Owner decides if the open limits are acceptable.
- **Owner holds:** merge, spend/paid, live runs, security/access. Billing for the paid runs unverified. D8 @fc20aa6; D9–D12 accepted.

## The criteria
V1–V9: `review-spec.md`. V1 one data layer · V2 screens via agents · V3 CM hub · V4 LLM agents · V5 arch rw · V6 monitor ro · V7 one machine · V8 v2 intact.

## Findings

No open rows. Severity H/M/L. Full row text + R2 owner quotes: `review-findings-detail.md`.

Verified: G1–G61 (G61 @570cca7: owner merge grant verbatim+ts), G63–G64, G66 (@bce6139: adapter counts, --init safe merge/no argv, income never spending), G67–G68 (@c8008e6: evidence_text persisted + ALTER migration, scenario uses spending months), R1–R9 (R2 @385bb2a, decisions D1–D7 @a71a17b). Closed history: G52 (owner 02:59), G62 (idea-section placement, fixed @b9fb827, owner-observed), G65 (chart arrow, @a06e941). Hashes: `review-verified.md`.

| Id | Sev | V | Failure · evidence · fix | Status |
|---|---|---|---|---|
| — | | | No open rows | |

## Messages

*191 earlier v3 messages are at the end of [`review-archive.md`](review-archive.md).*


### [Coordinator] 2026-11-03 17:45
```
D13 ROLE SPLIT (owner Slack 1793720008/1793720553/1793720622): Telkomsel=Coordinator
(decisions, v3, user updates, OWNS hosted testing); instinct-christina=Builder; names do
not swap. Prior Bill verdicts stand; new code needs a reviewer who did not write it.
Merge, spend, security holds unchanged. Temp project+access+ALL cleanup stay with
Christina's side until explicit safe transfer. Bill-role operator notified via peer (ack
pending); Joe pickup via this record pending. Full text: DECISIONS.md D13.
NEXT: Telkomsel
```

### [Coordinator] 2026-11-03 17:46
```
CORRECTION to the 17:45 D13 note: the peer notice reached only the FORMER Bill-role
operator (original Bill task retired 2026-11-02; later Bill sessions ran externally).
The current Bill session endpoint is unverified, same as Joe. Both pickups via D13 and
this log are pending, not confirmed.
NEXT: Telkomsel
```

### [Joe] 2026-11-03 19:13
```
JOE PICKUP (D13 record, read 19:13): TEAM/DECISIONS/review/README read. Joe works under D13: Coordinator = Telkomsel, Builder = christina.
CONFLICT: TEAM.md l.14/34 and review-protocol rules 20-28 still name instinct-christina as Coordinator (D13 says otherwise).
CONFLICT: 0b30a18 (Builder, 19:08) is on the branch: load_data.py, test-load-init.py, evidence/hosted/set-role-fix. No Bill QC; no hold recorded.
Local vs hosted: set-role fix is local PG18 proof only; hosted fresh-init failed at 8cbe126; hosted rerun and Nordea writes remain OPEN.
Route: Coordinator (Telkomsel) relays via review.md at its TURN; Bill/Joe endpoints still unconfirmed per D13.
NEXT: Telkomsel
```
