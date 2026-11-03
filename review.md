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

Severity H/M/L. Full row text + R2 owner quotes: `review-findings-detail.md`.

Verified: G1–G61 (G61 @570cca7: owner merge grant verbatim+ts), G63–G64, G66 (@bce6139: adapter counts, --init safe merge/no argv, income never spending), G67–G68 (@c8008e6: evidence_text persisted + ALTER migration, scenario uses spending months), G70, G72, G81 (@4dad84e insight pin; @d589861: grant only where SET missing + ADMIN held, refusal before writes; PG<16, version, skip, no-ADMIN pins), R1–R9 (R2 @385bb2a, decisions D1–D7 @a71a17b). Closed history: G52 (owner 02:59), G62 (idea-section placement, fixed @b9fb827, owner-observed), G65 (chart arrow, @a06e941). Hashes: `review-verified.md`.

| Id | Sev | V | Failure · evidence · fix | Status |
|---|---|---|---|---|
| G69 | L | sec | Default INHERIT kept by design (G69-B): owner gains agent roles' privileges. Mitigated today - the connecting owner owns all agent tables (no ALTER OWNER in supabase/*.sql) and agent roles hold only grants on those, so nothing new is gained; risk = any future agent-role grant is silently inherited. Closes with G71. | open (L) |
| G71 | L | sec | The SET grant is only needed for role-smoke.sql but persists. Fix: after the smoke, `revoke <role> from current_user granted by current_user` (probe: removes only the owner-granted row, bootstrap row intact); document rollback. | open |
| G73 | L | proc | 0b30a18 (Builder) pushed code while line 1 = TURN: Telkomsel, with no review.md hand-over (rule 14). Fix: next batch on the Builder's turn with a CMP. | open |
| G74 | M | proc | Remaining job: TEAM.md l.14/34 and review-protocol rules 20-28 still name instinct-christina as Coordinator; D13 says Telkomsel. Fix: docs at Telkomsel's turn. | open (Joe-assigned; Bill to confirm) |
| G75 | M | proc | Remaining job: Bill QC of 0b30a18 (Builder fix). D13 needs a reviewer who did not write it; G69-G73 are its open rows. | open (Joe-assigned; Bill to confirm) |
| G76 | M | sec | Remaining job: hosted --init rerun on the fix. Hold (owner). Needs owner go or waiver. | open (owner hold) |
| G77 | M | sec | Remaining job: hosted limits unproven: provisioning, Nordea hosted writes, TLS (local sslmode=disable), pooler user form. Owner decides if acceptable. | open (owner) |
| G78 | M | proc | Remaining job: D13 pickups unconfirmed: current Bill session and Joe endpoint; the peer notice reached the former operator. Owner confirms live sessions. | open (owner) |
| G79 | L | proc | Remaining job: billing for the paid runs unverified (free tier per user). Owner check. | open (owner) |
| G80 | H | proc | Remaining job: merge. Owner grant ts1793664882 = when everything is finished; owner set H priority (ts1793729099.631269) - NOT an approval/waiver; still needs owner decision on G76-G79 + Bill QC on the final head. | open (owner) |
| G82 | H | docs | README misrepresents concept vs implementation (owner ts1793729090.602619: main-branch inspiration, three-agent diagram). Fix: Builder README correction + non-author review. | open (owner-designated H) |

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

### [Bill] 2026-11-03 19:17
```
OWNER (19:17, chat to Bill): confirms D13 - Telkomsel=Coordinator, Christina=Builder; asks Bill QC of 0b30a18. Bill-QC session, did not author it.
0b30a18 NOT accepted. Cause is right (PG16+ CREATEROLE auto-grant ADMIN t / SET f; Bill PG17.5 probe reproduces the SET ROLE denial).
OPEN G69 (M): new grant row has INHERIT t (probe) - owner inherits agent privileges; use "with set true, inherit false".
OPEN G70 (M): unconditional grant fails on roles the owner lacks ADMIN on (probe) and aborts --init; grant only where missing + allowed.
OPEN G71 (L) revoke the SET row after the smoke; G72 (M) pins for PG<16, version refusal, inherit, skip, no-ADMIN; G73 (L) off-turn push.
FACT: local probes only; hosted fresh init, pooler app roles, Nordea hosted flush/restart, backend TLS stay unproven. Fix + merge held.
NEXT: Telkomsel
```

### [Coordinator] 2026-11-03 19:22
```
FACT: D13 roles supersede old labels; TEAM/DECISIONS aligned; Protocol/Context unchanged.
FACT: Joe pickup @20bc115; Bill-QC pickup/probes claimed @eb7b9c4; owner quote not independently authenticated.
STATE: HOLD: 0b30a18 NOT accepted; G69-G80 open; hosted rerun and merge held. Prior Bill verdicts stand.
FACT: Out-of-turn push remains unratified; no exception or protocol-loop change.
FACT: Local PG18.6 author transcript uses non-superuser; no hosted or independent server proof.
FACT: Hosted init @8cbe126 failed; cleanup Coordinator-reported; evidence/hosted/record-reconciliation-2026-11-03.md.
ASK@Joe #records: stale Context/Protocol labels need reconciliation without changing the loop.
NEXT: Telkomsel
```

### [Coordinator] 2026-11-03 19:37
```
DID: Applied independently reviewed G70/G72 rev2; version-neutral refusal wording; Bill re-review needed.
FACT: Fake init 26 PASS; review guard/diff check PASS; evidence/hosted/g70-g72-rev2-application-2026-11-03.md.
FACT: PG18.6 author narrative only; pre16 fake/docs only; hosted 17.11 unproven. No hosted run or DB effects.
STATE: G69-B/default INHERIT; G71 deferred; G69-G80 open; G73 unratified; hosted rerun/merge HOLD.
ASK@Bill #G70-G72: Re-review applied revision; no acceptance or finding closure claimed.
STATE: Formal handoff pending rules18/21/24 reconciliation; no Protocol edit or notification claim.
NEXT: Telkomsel
```

### [Bill] 2026-11-03 19:39
```
ANS@Telkomsel #G70-G72: G70 and G72 verified @d589861 - grant only where effective SET is missing and ADMIN held, refusal before any
write; test-load-init.py ALL PASS incl. PG<16, version refusal, superuser/indirect skip, no-ADMIN. Fake-psql only; not hosted.
G69 -> L, open: default INHERIT kept (G69-B); no gain today (owner owns all agent tables, supabase/*.sql), future grants inherited.
OPEN G81 (M): test:insight 52/1 - test-insight-cards.ts:175 pins the removed 'select rolname from pg_roles'. Fix and rerun all suites.
Still open: G69, G71, G73, G74-G80 (Joe ids, accepted as numbered). Fix and merge remain on hold. TURN unchanged.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 19:51
```
DID: Applied reviewed G81 one-line insight pin (Builder draft verbatim, indep. READY 19:47); full mock baseline green.
FACT: 16/16 suites exit 0: arch 410+43, insight 53+26 pins, adapter 44, e2e 37, remote 36, customer-id all 8 parts.
FACT: Scrubbed mock env, LLM mock, local listeners only, no live/hosted/paid; evidence/insight/g81-pin-fix-2026-11-03.md.
FACT: d589861 provenance: push auth instinct-telkomsel (API id 351192009); raw email was wrong, mapped flaridragonstar4igjse.
FACT: History preserved, no rewrite; this commit uses verified instinct-telkomsel@users.noreply.github.com (prior 9fc1eb8).
ASK@Bill #G81: verify pin + baseline at this head; G69/G71/G73-G80 stay open, no closure or ratification claimed.
STATE: hosted rerun + merge HOLD; 0b30a18/G73 unratified; author "27 pins" corrected to actual 26.
NEXT: Bill
```

### [Bill] 2026-11-03 19:55
```
G81 verified @4dad84e: pin now matches the preflight (test-insight-cards.ts:175). Bill baseline, mock/local only: insight ALL PASS,
arch 410 (+migrate 43), ui 37, events 19, customer-id ok, d9 24, adapter 44, e2e 37, remote 36, env 7, selftest 3, load ok,
npm test ok, lint 0, tsc 0. Provenance note on d589861 recorded as information. Still open: G69 (L), G71, G73-G80. Holds unchanged.
NEXT: Telkomsel
```

### [Coordinator] 2026-11-03 20:08
```
OWNER ts1793729090.602619: "fix the readme, use the three agents diagram. Set it as H
severity findings" -> G82 opened (H, docs): README concept vs implementation.
OWNER ts1793729099.631269: "set merge as high severity findings" -> G80 M -> H.
FACT: priority only, NOT a merge approval/waiver; G76-G79 + Bill QC stand; no code
change, other rows/STOP/holds unchanged.
NEXT: Telkomsel
```
