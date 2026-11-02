TURN: Bill


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
*Joe, updated 2026-11-02 21:18 (Helsinki).*

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
- **Now (Bill 21:02):** G43 ✓ @4279c9a, G44 ✓ @796c109; open G42 (handover, M) and G45 (invoice reply, M), both with Telkomsel.
- **Next:** Telkomsel fixes G42 + G45 in one batch → Bill QC. Owner: live AI-view check (go), merge (own word to Bill); scope relays need verbatim quote (rule 28).

---

## The criteria
V1–V9 are in [`review-spec.md`](review-spec.md) (static; read once). One-line index: V1 one data layer · V2 every screen through the agents · V3 agents react, CM is the hub · V4 LLM-driven agents · V5 `/arch.html` read-write · V6 monitor read-only · V7 proof it is one machine · V8 nothing from v2 breaks · V9 out of scope (external MCP agent).

---

## Findings

Baseline review of `instinct-prototype-v2` @ `4433b05` against V1–V8. Severity: **H** blocks the goal, **M** needed for it, **L** polish.

| Id | Sev | V | Finding | Evidence | Status |
|:-:|:-:|:-:|---|---|:-:|
| G45 | M | V4 | Bill-like question without I/my lands General; invented figure ships as model. Fix options + repro: detail file. | `orchestrator.ts` classifyQuestion | open |
| G42 | M | V4 | NO_CALLS handover mid-run leaves the new member only leftover steps → scripted. Fix: fresh step budget per member + pin. | `llm.ts:59-79` | open |
| R1 | M | V4 | Context.md is the shared roundtable: User Agent, CM and Nordea agents all contribute to it. | R-src | open |
| R2 | M | V4 | Standing-permission gateway: User Agent introduces the context, then the existing CM/Nordea chain runs. Access semantics held: gap report first. | R-src | open |
| R3 | M | V4 | CM window shows the retrieved/processed contribution cards, not the whole cabinet. | R-src | open |
| R4 | M | V4 | Nordea window shows the retrieved/processed cards. | R-src | open |
| R5 | M | V4 | No raw records in either window; cards combine multiple raw records. | R-src | open |
| R6 | M | V4 | Natural-language intents: general, bank/financial, goal add/modify/remove, other. No invented arbitrary actions. | R-src | open |
| R7 | M | V4 | Remove the Add-goal field/button; goal requests go through chat. | R-src | open |
| R8 | M | V4 | Goal cards sit below the chat box and keep the existing goal details. | R-src | open |
| R9 | M | V4 | Goal-relevant insights run automatically as Nordea context cards; remove Manual Propose insight; no optional developer trigger. | R-src | open |

R-src = owner msgs ...171.523219 (list) / ...229.568279 (implement), via main; requirement only, NOT built. Full open rows: `review-findings-detail.md`.

Verified: G1–G41, G43, G44. Hashes + notes: `review-verified.md` (grep an id).


---

## Messages

*89 earlier v3 messages are at the end of [`review-archive.md`](review-archive.md).*

### [Telkomsel] 2026-11-02 20:57
```
SCOPE: main relayed Christina CMP 8:30: owner msgs 1793643737.149109 (120s), ...766.306079 (client time), ...4005.724089 (category). Unverified by me.
DID G44: Related unless plain impersonal English (Finnish/non-ASCII/I-my/short = Related); grocery words added; salary-type replies guarded.
DID: General fallback (AI off/guard drop/error) neutral. Caption: elapsed (client-measured) then category. Arch chat: requestId + /chat/result.
DID: reused requestId+other text -> 409; poll 60 min. Mutation-checked pins: classifier, neutral, dedup, 409, 120s defaults, cancel.
FACT: arch 296 tsc0 e2e 37 migrate 43 adapter 44 remote 36 env 7 selftest 3. Pixels synthetic. No provider call/spend/merge/panel/G42.
OPEN: round-plan pixel absent (plan exists only when a goal-matching first round runs); source pin only.
ASK@Bill: re-verify G44 incl. Finnish and groceries, arch dedup, 409.
NEXT: Bill
```

### [Bill] 2026-11-02 21:02
```
G44 verified @796c109: my probes (I-pay groceries, 2 Finnish) -> Related, scripted; Paris population stays General/model.
OK: arch dedup (3 concurrent, one body), 409 on reused id (arch + app), app/arch ids kept apart, arch /chat/result done.
FACT: baseline: arch 296, migrate 43, adapter 44, e2e 37, remote 36, env 7, selftest 3, load ok, npm test, lint 0.
G45 (M) new: "last electricity invoice" still General -> invented 84.20 ships as model. Keyword lists leak; see row fix.
FACT: scope relay (owner ts only, no verbatim quote) does not meet rule 28; QC done on the code, scope approval is the owner's.
OPEN: G42 (M), G45 (M) with Telkomsel. Merge = owner.
NEXT: Telkomsel
```

### [Telkomsel] 2026-11-02 21:10
```
DID G45: bill words + specific-item wording (last/total/amount...) lose the figure exemption; exempt General figures carry "not from your records".
DID: General now labels first-person/short/non-English questions General (campus, directions, Finnish capital); their figures stay guarded.
DID: arch caption shows plan provider. Pixels: round plan visible on mobile + arch (synthetic fixture, NOT live).
FACT: arch 306 tsc0 e2e 37 migrate 43 adapter 44 remote 36 env 7 selftest 3. Pins mutation-checked (exemption, note, specific-item).
NOT DONE: G42 step budget (excluded by owner relay, no covering evidence). No provider call/spend/merge.
ASK@Bill: re-verify G45 + General labels. R1-R9 (owner nine items) recorded in Findings, NOT built (relayed refs).
NEXT: Bill
```
