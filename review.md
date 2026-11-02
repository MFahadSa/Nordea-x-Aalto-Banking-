TURN: Telkomsel


# review.md: quality control for `instinct-prototype-v3`

This branch starts from `instinct-prototype-v2` @ `4433b05`. The v2 review is kept in `review-v2.md` (all 30 findings verified), with older history in `review-archive.md`.


---

## Protocol v3 (Joe): summary. Full rules: `review-protocol.md` (cold; `grep -n '^2[0-9]\.' review-protocol.md`)

- Loop **Telkomsel → Bill → Telkomsel**; act only when line 1 names you; `NEXT:` names who acts. Joe + Coordinator have no turn.
- On your turn read only `git diff <last-seen>..HEAD -- review.md`. CMP ≤ 8 lines, ≤ 150 chars; evidence = hash or path:line.
- Push only with a hand-over; one commit per action (message + evidence together). Guard: `npm run check:review`.
- Watchers wake only on a line-1 change or an ASK@you; skip Joe and instinct-christina commits otherwise (rule 27).
- Owner gates: scope, spend, live Supabase, security, merge. Coordinator relay = owner's word if ts + verbatim quote,
  incl. permission changes like G37/G38 (OWNER 12:48); only merge needs his firsthand word to Bill (rule 28). Bill QC independent.
- Coordinator messages end `NEXT: <current TURN>` (guard, rule 24). Joe works on demand (rule 29).
- Team batching, short CMPs, one read per turn (rules 30–33, OWNER 21:02).
- Baseline as `green @hash`; verified hashes + full open rows live in cold files (rules 34–35). Roles: review-protocol.md.

---

## 🧠 Context memory
*Joe, updated 2026-11-02 23:58 (Helsinki).*

- **Goal:** one system: 3 agents + their DBs are the only home for customer data; Abel, arch.html (rw), dev-monitor (ro). Done = V1–V8.
- **Owner:** hosted = 3 tables in one Supabase project, one policy per agent; external MCP agent after v3 (V9 out).
- **Owner:** all 3 agents LLM-driven (V4); on conflict Telkomsel follows Bill; Groq free tier for live runs.
- **Owner (16:22):** Abel answers ONLY from finalised context.md; Bill's 4 conditions (16:26) are the QC gate.
- **Owner (16:35–17:44):** cabinet-db.json → 3 agent DBs only, auto-delete after verify, NO backup; offers retire, imports stay.
- **Owner:** standing OK for assigned repo work (01:04); spending and live Supabase legs 3–5 still need his word.
- **Naming (owner 02:03):** builder = **Telkomsel**; TURN/NEXT token `Telkomsel`; branch stays `instinct-prototype-v3`.
- **Owner (10:41, 12:41):** token cuts, rules 14/18/19 + 26–29; protocol moved to review-protocol.md.
- **Owner (12:48):** rule 28 relays (Slack ts + verbatim) also cover permission changes (G37/G38); merge stays firsthand to Bill.
- **Owner (10:55):** Coordinator `instinct-christina` = routine coordination; owner gates + Bill QC unchanged.
- **Owner (12:36, to Bill):** approved Coordinator's G37 anon revoke, load2demo hosted test, Groq run. Merge still his call.
- **Now (Bill 23:56):** R2 owner quotes accepted (rule 28). Telkomsel: G42 + R2 code, local. R2 open Qs: rubric, no-level, edit/reapproval, mode release.
- **Next:** owner answers the 4 R2 questions in ONE message → Telkomsel pushes G42 + R2 as one batch → Bill QC → merge (owner).

---

## The criteria
V1–V9 are in [`review-spec.md`](review-spec.md) (static; read once). One-line index: V1 one data layer · V2 every screen through the agents · V3 agents react, CM is the hub · V4 LLM-driven agents · V5 `/arch.html` read-write · V6 monitor read-only · V7 proof it is one machine · V8 nothing from v2 breaks · V9 out of scope (external MCP agent).

---

## Findings

Baseline review of `instinct-prototype-v2` @ `4433b05` against V1–V8. Severity: **H** blocks the goal, **M** needed for it, **L** polish.

| Id | Sev | V | Finding | Evidence | Status |
|:-:|:-:|:-:|---|---|:-:|
| G42 | M | V4 | NO_CALLS handover mid-run leaves the new member only leftover steps → scripted. Fix: fresh step budget per member + pin. | `llm.ts:59-79` | open |
| R2 | M | V4 | Approval gateway, USER context cards only (no bank link): the User AI assigns a level, the approval ID holds it, blocked cards wait in "Waiting for you" (arch.html or main-app). Level rubric, no-level case, edit/reapproval, mode-change release still open. | R-src | open |

R-src = owner msgs ...171.523219 (list) / ...229.568279 (implement), via main; requirement only, NOT built. Full open rows: `review-findings-detail.md`.

Verified: G1–G41, G43, G44, G45 @658b70d, R1 R3 R4 R5 R7 R8 R9 @452c67f (source + pins; pixels synthetic), G46 G47 R6 @a09f065, G48 G49 @0443d05, G50 @583f665. Hashes + notes: `review-verified.md` (grep an id).


---

## R2 owner quotes (verbatim, project record)

Owner message ts 1793654508.504259:

```
No need, just put the newly produced user context card in the waiting list. Some context card already have been approved so it will not
appear there. Lets give every user context card approval ID. The approval ID contains airlock level: • No-risk certified (level 0) • Review
everything pass certified (level 1) • High-risk pass certified (level 2). The permission will have 3 modes: • No permission means all
airlock level can pass • Review everything means level 1 and 2 certified can't pass • High risk mode means only level 2 certified can't
pass. Those user-context who can't, will be waiting in "waiting for you" for user approval. The approval can be done in arch.html or main-
app
```

Owner message ts 1793654878.729759:

```
The app gateway should now only apply to user, no connection to Bank. The user AI will determine the risk level.
```

## Messages

*89 earlier v3 messages are at the end of [`review-archive.md`](review-archive.md).*

### [Telkomsel] 2026-11-02 23:54
```
DID: added the two R2 owner quotes verbatim in section "R2 owner quotes" (ts 1793654508.504259, 1793654878.729759); removed channel id.
OPEN: level rubric, no-level case, edit/reapproval, mode-change release (owner). Doc only; code stays local.
NEXT: Bill
```

### [Bill] 2026-11-02 23:56
```
R2 quotes accepted as the owner's word (rule 28: verbatim + ts). Channel id gone from review.md; it stays in git history (7232536^, no rewrite).
NEXT: Telkomsel
```
