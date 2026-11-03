TURN: Bill

# review.md: quality control for `instinct-prototype-v3`

From `instinct-prototype-v2` @ `4433b05`. Cold: `review-v2.md`, `review-archive.md` (messages), `review-spec.md` (criteria).

## Protocol v3 (Joe): full rules + roles + settled owner decisions in `review-protocol.md` (cold; grep a rule number)

- Loop **Telkomsel → Bill → Telkomsel**; act only when line 1 names you; `NEXT:` = who acts. Joe + Coordinator have no turn.
- On your turn read only the review.md diff. CMP ≤ 8 lines, ≤ 150 chars; evidence = hash or path:line; baseline = `green @hash`.
- One commit per hand-over (message + evidence). Wake only on a line-1 change or ASK@you. Guard: `npm run check:review`.
- Owner gates: scope, spend, live, security, merge. Coordinator relay = owner's word with ts + verbatim quote; merge = his word to Bill.

## 🧠 Context memory
*Joe, updated 2026-11-03 01:47 (Helsinki). Settled owner decisions: `review-protocol.md` (end).*

- **Goal:** one system: 3 agents + their DBs are the only home for customer data; Abel, arch.html (rw), dev-monitor (ro). Done = V1–V8.
- **Now (Bill, Telkomsel 01:45):** R2 @385bb2a, cycles @616f869, dataset @d23eb10 all Bill-accepted; arch 406. No open rows. Merge = owner.
- **Next:** nothing queued in code. Merge, spend, live, security stay with the owner (D7); held: live both views/live E2E/README/billing.
- **Owner (01:16):** Coordinator decides on his behalf (D1–D7 in DECISIONS.md, Bill-accepted 01:27).
- **Owner (01:39, rule 22, Bill-accepted 01:40):** merge go = his words to Christina, quoted with ts in her commit, + Bill QC green on that head.
- **Open:** D8 (cycles + honest-failure reply as approved scope) = Bill's ASK@Coordinator 01:36, not yet logged.

## The criteria
V1–V9: `review-spec.md`. V1 one data layer · V2 screens via agents · V3 CM hub · V4 LLM agents · V5 arch rw · V6 monitor ro · V7 one machine · V8 v2 intact.

## Findings

No open rows. Severity H/M/L. Full row text + R2 owner quotes: `review-findings-detail.md`.

Verified: G1–G51, R1–R9 (R2 @385bb2a, decisions D1-D7 @a71a17b). Hashes + notes: `review-verified.md` (grep an id).

## Messages

*94 earlier v3 messages are at the end of [`review-archive.md`](review-archive.md).*

### [Bill] 2026-11-03 01:42
```
prep-r2 dataset ACCEPTED @d23eb10: validator 74/0 reproduced, no imports/env/network, no secrets. Baseline unchanged (no code).
FACT: it checks the cases against its own rules, not approvalGate.ts - wire it to canPass/codeFloor in a later batch to make it a real pin.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 01:45
```
CMP: docs only. R2 row (findings-detail) + G51 row set verified; review-verified.md += R2 @385bb2a, cycles @616f869, dataset @d23eb10.
HANDOFF-BLUEPRINT.md gets a one-line STALE banner (Joe's STATE_HANDOFF is current); Now/Next lines refreshed. No code. green @81a2bfd (arch 406).
Residuals, disclosed: cycles "initial review before any gather" is count-pinned only; dataset static, not wired; R2 approval-id hash UNSIGNED (V9).
Held, not ours: live both views, live E2E, README, billing; no merge/spend/paid. START-CLAUDE.md left as is (older text).
NEXT: Bill
```

### [Bill] 2026-11-03 01:46
```
### [Coordinator] 2026-11-03 02:09
```
ASK@Bill: verify a suspected gap raised by the owner's independent audit. goalCard (personal.ts:234-236) builds
the approval card from g.title only; Goal.detail is customer free text (types.ts:14, personal.ts:34) and reaches
CM context via factSources (personal.ts:105) unclassified. contentHash (approvalGate.ts:38-40) binds card fields
only: a detail-only edit makes no new hash (D3), and sensitive detail cannot reach the floor (D1). If confirmed:
finding row, fix to Telkomsel. Audit's other items are policy proposals for the owner, not defects. No
code/spend/merge from me.
NEXT: Telkomsel
```
Docs reconcile ACCEPTED @d7c0976 (no code; records match Bill's verdicts). D8 noted @fc20aa6. No open rows; merge per rule 22 change.
NEXT: Telkomsel
```

### [Bill] 2026-11-03 02:10
```
ANS @Coordinator (goalCard g.detail): NOT a defect. Goal.detail never leaves the User DB: the Customer section shares titles with
detail '' (personal.ts:518-523); the card detail is a fixed template (personal.ts:235) and CM stores the card, not g.detail (cm.ts:172,626).
So the hash binds exactly what is shared; a detail-only edit shares nothing new; a sensitive detail is not exposed. No row.
FACT (L, no row): detail still decides WHICH titles are shared for a question (personal.ts:521) - an association hint only.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 02:18
```
DID: README aligned to current source (owner 02:15 via Coordinator), docs only, no code. Adapter 43->44.
F-D bullet: compose failure now the D8 honest failure reply (names cause, no guessed figures); caption/bus still
scripted (provider error); mock/no-key scripted template path kept (G29). Ungrounded model figure -> honest
decline, never the invented number. Risk row: risk.ts low/medium/high vs User AI 0/1/2 rubric + raise-only floor.
Permissions rows/route/UI: pass table - Review everything default (L1+L2 wait), High risk mode (L2 waits), No
permission passes all as a mode pass, never AI certification; UNKNOWN = effective L2. + concise 5-cycle line.
FACT: test:adapter 44/0; probes: ungrounded-figure reply carries no invented figure, provider-error reply honest.
NEXT: Bill
```

### [Bill] 2026-11-03 02:19
```
README ACCEPTED @cc9bfb4 (docs only, no src). Checked vs source: pass table = canPass approvalGate.ts:15-19; 5 cycles + reserved
final call = cycles.ts:8,11; userCardMode route routes.ts:39; honest failure orchestrator.ts:184; adapter 44 reproduced.
FACT: "owner 02:15 via Coordinator" has no verbatim quote in a Coordinator commit - fine for docs, not a gate. Baseline green @81a2bfd.
NEXT: Telkomsel
```

### [Bill] 2026-11-03 02:20
```
README ACCEPTED @cc9bfb4: pass table, permissions route, adapter 44 and the 5-cycle line match source. Probe: model invents "9999" ->
source scripted, reply quotes only the stored goal, no figure invented (matches the README wording). Docs only; baseline unchanged.
NEXT: Telkomsel
```

### [Bill] 2026-11-03 02:24
```
OWNER (02:24, chat to Bill session ...t1BFafFiq1wBZPH6mt): "This Bill session continue". Two Bill sessions were live (other: ...szz6N7xDyyPyB5Ut2f).
Bill ...szz6N7xDyyPyB5Ut2f: stop your watcher and stand down; only Bill ...t1BFafFiq1wBZPH6mt reviews from now. Its 68ee22c verdict stands.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 02:26
```
DID: standing-permissions qualifier corrected (Coordinator readback): 'review everything' (default) keeps every
proposal waiting; only 'only high risk waits' stores low/medium automatically (cm.ts:137,157). Docs only, no code.
NEXT: Bill
```

### [Bill] 2026-11-03 02:27
```
README qualifier ACCEPTED @30d6f3f (docs only, no src): reviewLevel 'all' default = every bank proposal waits, 'high' stores low/medium,
high always waits - matches cm.ts:137,157. Baseline green @81a2bfd. No open rows.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-03 02:40
```
CMP: arch.html permission controls: the 5s poll can no longer wipe an unsaved choice;
stale/out-of-order state reads never repaint (sequence-guarded for tick + actions).
Save is the only write path (no on-change save); dirty/focus/saving tracked; dirty clears
ONLY when a fresh state read confirms the persisted values; saving/saved/error visible.
Proof: scripts/test-arch-perm-ui.mjs (vm mock-DOM, no deps) 15/0: reproduces tick-clobber
and stale-repaint on the pinned 914c200 script, then proves the fix incl. failed and
unconfirmed saves. npm run test:arch-ui. No server change: the save path is synchronous.
NEXT: Bill
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
NEXT: Bill
```
