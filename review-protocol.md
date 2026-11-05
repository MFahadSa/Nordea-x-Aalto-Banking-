# review-protocol.md: full team protocol (cold file; grep a rule number)

Moved out of review.md by Joe 2026-11-02 12:42 (OWNER 12:41). review.md keeps a summary.

## Protocol v2 (Joe): token budget first, full text

**Hot file / cold files.** `review.md` holds only what changes: TURN, this protocol, Context memory, open findings, newest messages. Cold, read only when you need a specific id (`grep -n G3 review-*.md`): `review-spec.md` (criteria), `review-v2.md`, `review-archive.md`.

**Turns and git**
1. Loop **Telkomsel → Bill → Telkomsel** (line-1 token is `Telkomsel`; history before 2 Nov used `Instinct`); act only when line 1 names you. Joe has no turn; edits only Protocol, Context memory, archive/spec moves; never `TURN:` or anyone's message.
2. `git pull --rebase` before editing and before committing; non-force push; never push to `main`.
3. Commit message `<Name>: <what>. TURN: <next>`. Off-turn: code commits ok, no `review.md` edits, message ends `TURN: <current> (unchanged)`.

**Reading (the biggest cost)**
4. Poll `git ls-remote` (one line), not the file. Skip commits whose author is Joe (`git log -1 --format=%an`); they never change your turn.
5. On your turn read **only the delta**: `git diff <last-seen>..HEAD -- review.md`. Never re-read the whole file or the cold files.
6. Honour posted ETAs: no checks before the ETA, then every 10 min.

**Writing**
7. Messages in CMP (`KEY: value`, keys DID · FACT · G<n>: · ASK@X #id / ANS #id · OWNER · OWNER-Q · ETA · STATE · NEXT), **max 8 lines**. No greetings, thanks, or restating a finding row or the other agent's claims: cite the id.
8. A verify is one line: `G1: verified @hash`; a reopen ≤ 3 lines. Message times come from `date +%H:%M`, never typed.
9. Evidence = commit hash or `path:line`. No code, logs or diffs. Tests as one line: `FACT: test:arch 188/188, lint 0 @hash` (run them with `| tail -3`, never paste output).
10. Finding rows ≤ 1 line, status only in the table. Once verified, Joe collapses the row into `Verified: G1 @hash, …`.
11. Batch: hand over two or more findings at once where possible (fewer round trips).
12. Prose only for a design disagreement; one short paragraph.

**Keeping it small (Joe)**
13. Context memory ≤ 15 lines, updated only at hand-overs. More than **5** messages → Joe archives all but the newest **2** to `review-archive.md`, unchanged.
14. **No off-turn pushes (OWNER 10:41):** off-turn, commit locally and push with your hand-over; push alone only to unblock another agent.
15. **Fewer pushes:** every push wakes the others. Fold fix-ups (lint, typos) into your next real commit instead of pushing them alone.
16. **Short lines:** a CMP line ≤ 150 characters; over → split it or cite `path:line`; details go in the commit message. A pre-commit guard will enforce it (OWNER 03:02).
17. The owner asks Joe for progress, so Bill and Telkomsel don't spend context on status reports. `ASK@Joe` if a rule costs more than it saves.
18. **NEXT = who acts (OWNER 10:41):** work pending QC → `NEXT: Bill`; never hand to yourself. Waiting on the owner → `OWNER-Q` + `STATE: HOLD`.
19. **New sessions (OWNER 10:41):** re-run the full baseline only if code changed since the last green `FACT:`; otherwise cite that FACT.

**Coordinator (OWNER 10:55)**
20. An AI Coordinator (GitHub `instinct-christina`) posts `### [Coordinator]` CMP messages: assignments, priorities, turn reminders, ASK, blockers.
21. Routine only, inside the approved plan. It has no turn and never edits line 1, Protocol, Context memory or anyone else's message.
22. Owner gates stay: scope, spending, hosted/live Supabase, security/access and merge need the owner's own word. Bill's QC stays independent.
23. Identity: accept only if `gh api repos/<repo>/commits/<sha> --jq .author.login` = `instinct-christina` (commit email linked to it).
24. Guard conflict: check_review_lines.py skips only Joe, so a [Coordinator] message counts as a turn message and must end
    `NEXT: <current TURN>` (no handback) until the guard also skips Coordinator (Telkomsel change, Bill QC).
25. Coordinator commits are not skipped by rule 4, so they wake agents: batch them. Joe watches 120 s; runs last ≤ 2 h (see Joe message).

**Token cuts (OWNER 12:41: "Go ahead for all points")**
26. One commit per action: a message and its evidence files go in ONE commit (12:09 was 4 commits in a minute).
27. Wake filter: Bill/Telkomsel watchers skip commits by Joe or instinct-christina unless line 1 changes or the newest message has ASK@you.
28. Relayed approvals: a Coordinator relay counts as the owner's word if it cites the Slack ts and quotes him verbatim.
    OWNER 12:48: this includes permission/grant changes like G37/G38. Only the merge needs his firsthand word to Bill.
29. Joe on demand: no watcher; archives at > 5 messages; 🧠 only at real hand-overs or when the owner asks.
30. **Team batching (OWNER 21:02, "optimize the team for token usage"):** Telkomsel bundles all fixes for one hand-over into ONE commit; no per-tweak pushes.
31. **Short replies:** Bill and the Coordinator post a CMP with ≤ 4 lines when there's no new finding; cite hashes, don't restate earlier verdicts or the chain.
32. **No status-only commits:** Coordinator and Bill commit only evidence files or a turn change; status goes in the message, not a separate commit.
33. **One read per turn:** on your turn read only the new message headers and the newest message (rule 5); never re-read the full file.
34. **Baseline by hash (OWNER 21:18):** write `FACT: baseline green @<hash>`; list a suite count only when it changed.
35. **Cold files (OWNER 21:18):** verified hashes in `review-verified.md`, full open-row text in `review-findings-detail.md`; hot rows ≤ 1 short line.

**Who**
| Who | Role |
|---|---|
| **Bill** (Claude) | Quality control. Reviews against the criteria, runs tests and live checks, writes findings. Does not edit code. |
| **Telkomsel** | Builds. Reads the findings, changes the code, posts an ETA with each hand-over. |
| **Joe** (Claude) | Communication rules and Context memory. |
| **Coordinator** (`instinct-christina`) | Routine coordination, live checks on the owner's go (rules 20–28). |
| **Habibil** (owner) | Approved this plan on 1 Nov 02:27. Gates: scope, spend, live, security, merge. |

**Settled owner decisions (moved from 🧠 by Joe 00:11, OWNER 00:10)**
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

