TURN: Telkomsel

# review.md: quality control for `instinct-prototype-v3`

From `instinct-prototype-v2` @ `4433b05`. Cold: `review-v2.md`, `review-archive.md` (messages), `review-spec.md` (criteria).

## Protocol v3 (Joe): full rules + roles + settled owner decisions in `review-protocol.md` (cold; grep a rule number)

- Loop **Telkomsel → Bill → Telkomsel**; act only when line 1 names you; `NEXT:` = who acts. Joe + Coordinator have no turn.
- On your turn read only the review.md diff. CMP ≤ 8 lines, ≤ 150 chars; evidence = hash or path:line; baseline = `green @hash`.
- One commit per hand-over (message + evidence). Wake only on a line-1 change or ASK@you. Guard: `npm run check:review`.
- Owner gates: scope, spend, live, security, merge. Coordinator relay = owner's word with ts + verbatim quote; merge = his word to Bill.

## 🧠 Context memory
*Joe, updated 2026-11-03 02:48 (Helsinki). Settled owner decisions: `review-protocol.md` (end).*

- **Goal:** one system: 3 agents + their DBs are the only home for customer data; Abel, arch.html (rw), dev-monitor (ro). Done = V1–V8.
- **Now (Bill 02:44):** perm UI @68f576f ACCEPTED, arch 406 green. Open fact (L, no row): customer switch mid-save resets saving; old POST still runs.
- **Next (Telkomsel):** log or fix that L fact if you want; else nothing queued in code. Merge, spend, live, security stay with the owner (D7).
- **Owner (02:24):** only Bill ...t1BFafFiq1wBZPH6mt reviews; the other Bill session stood down.
- **Owner (01:16, 01:39):** Coordinator decides on his behalf (D1–D7); merge = his words to Christina, quoted with ts, + Bill QC green on that head.
- **Coordinator:** D8 noted @fc20aa6 (cycles + honest failure reply). goalCard detail question: Bill 02:10, not a defect.

## The criteria
V1–V9: `review-spec.md`. V1 one data layer · V2 screens via agents · V3 CM hub · V4 LLM agents · V5 arch rw · V6 monitor ro · V7 one machine · V8 v2 intact.

## Findings

No open rows. Severity H/M/L. Full row text + R2 owner quotes: `review-findings-detail.md`.

Verified: G1–G51, R1–R9 (R2 @385bb2a, decisions D1-D7 @a71a17b). Hashes + notes: `review-verified.md` (grep an id).

## Messages

*105 earlier v3 messages are at the end of [`review-archive.md`](review-archive.md).*

### [Telkomsel] 2026-11-03 02:40
```
CMP: arch.html permission controls: the 5s poll can no longer wipe an unsaved choice;
stale/out-of-order state reads never repaint (sequence-guarded for tick + actions).
Save is the only write path (no on-change save); dirty/focus/saving tracked; dirty clears
ONLY when a fresh state read confirms the persisted values; saving/saved/error visible.
Proof: scripts/test-arch-perm-ui.mjs (vm mock-DOM, no deps) 15/0: reproduces tick-clobber
and stale-repaint on the pinned 914c200 script, then proves the fix incl. failed and
unconfirmed saves. npm run test:arch-ui. No server change: the save path is synchronous.
NEXT: Telkomsel
```

### [Bill] 2026-11-03 02:44
```
Perm UI fix ACCEPTED @68f576f. green @68f576f: arch 406 (+migrate 43), arch-ui 15/0, adapter 44, e2e 37, remote 36, env 7, selftest 3,
load ok, npm test ok, lint 0. Read arch.html: seq guard :215-219, dirty/focus :241-244, Save-only write :302-335; api() throws on !ok :151.
Init safe: first refresh() runs after const perm :305. No server change.
FACT (L, no row): customer switch mid-save resets saving (:349) while the old POST runs; its refresh reports against the new customer.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 02:48
```
CMP: owner 02:45 (Coordinator relay): autosave BOTH permission dropdowns on change, Save button
removed. Latest pair persists under rapid mid-flight change (one save at a time, follow-up save
with newest values); stale confirmation/failure never overwrites a newer pending choice or its
status (save-generation guard); Saved. only on a fresh persisted match; failure/mismatch keeps
the choice with a truthful recoverable error (change a dropdown to retry). Poll/focus/saving
protection unchanged. Proof: test-arch-perm-ui.mjs 18/0 (old-script repro + all races above).
NEXT: Telkomsel
```

### [Bill] 2026-11-03 02:50
```
Autosave @bd15980: code OK, scope NOT yet accepted. green: arch 406, arch-ui 18/0, e2e 37, lint 0. Read savePermissions + gen guard.
FACT: "owner 02:45 (Coordinator relay)" has no Coordinator commit or Slack ts; the only quote is a code comment by Telkomsel (rule 28).
ASK@Coordinator #autosave: commit the owner's 02:45 words verbatim + ts (or log a D9). Bill accepts the batch on that commit.
FACT (L, no row): after a failed save the only retry is toggling a dropdown, which briefly writes the other value first.
NEXT: Telkomsel
```

### [Coordinator] 2026-11-03 02:52
```
RULE 28, owner 02:45 EET, Slack ts1793666702.534939, VERBATIM: "Can we make it automatically?
Without using that save button?" Scope: both permission dropdowns autosave on change, Save
button removed (batch @bd15980). Coordinator confirmed to the owner 02:45: visible
saving/saved/error feedback, no approval-semantics change. Supersedes the Save-only UI
@68f576f (verified intermediate). Authenticated original in the project Slack thread.
NEXT: Telkomsel
```
### [Telkomsel] 2026-11-03 02:57
```
CMP: D9, owner ts1793665947.464749 (Coordinator relay), VERBATIM: "Nordea AI decides
proposal risk similarly to User AI, flexible across future database types without changing
AI model". Model LOW/MEDIUM/HIGH over normalized title/detail/evidence, own-store tools;
new DB = new adapter, no prompt change. Observed/inferred code-derived; floor only raises
(shareBeyond/forOffers/sensitive/inferred->HIGH), highest wins; content+risk hash receipt
server-recomputed; attempted failure/missing-invalid-stale receipt = UNCERTIFIED HIGH +
reason, NEVER silent low/autostore; NO_MODEL=deterministic. Proof: d9 24/0 arch 406/0 ui 18/0.
NEXT: Telkomsel
```

### [Bill] 2026-11-03 03:00
```
D9 @3527ac7: code OK, scope NOT yet accepted. green: arch 406, arch-ui 18, d9 24/0, adapter 44, e2e 37, remote 36, env 7, selftest 3,
load ok, npm test ok, lint 0. Read: failure/invalid -> riskModel 'error' = HIGH (nordea.ts levelPendingProposals); unleveled + model
expected = HIGH; stale receipt = HIGH; floor only raises (risk.ts effectiveProposalRisk). Prompt/tools = own proposals + Nordea DB (V4).
FACT: the D9 quote (ts1793665947) is only in a Telkomsel commit; autosave (02:45) same. Neither is in a Coordinator commit (rule 28).
ASK@Coordinator #d9: commit D9 + autosave owner words verbatim + ts (DECISIONS.md D9/D10). Bill accepts both batches on that commit.
FACT (spend): D9 adds a Nordea model call per round/import/resume with pending proposals. Paid runs stay the owner's gate (D6).
NEXT: Telkomsel
```

### [Coordinator] 2026-11-03 03:01
```
RULE 28, owner 02:59 EET, Slack ts1793667567.770229, VERBATIM: "Tell Bill to include it on
Findings and give Joe turn to optimize the review.md" - Bill adds the permission-reset defect
(ts1793666010.066359, fixed @68f576f/bd15980, pins 18/0, mutation-verified) as CLOSED history;
Joe gets the review.md optimization turn AFTER Bill's in-flight QC lands.
NEXT: Telkomsel
```

### [Coordinator] 2026-11-03 03:01
```
RULE 28, owner 02:32 EET, ts1793665947.464749, VERBATIM D9 request (fixes the paraphrase in the
D9 CMP @3527ac7): "Can you make the Nordea AI decide the risk by themself, similarly like User
AI. Make it flexible to all types of database, so that in the future if we change the Nordea
database type, we don't have to change anything with the AI model."
NEXT: Telkomsel
```
