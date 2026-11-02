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
    Permission/grant changes and merge still need his firsthand word to Bill.
29. Joe on demand: no watcher; archives at > 5 messages; 🧠 only at real hand-overs or when the owner asks.
