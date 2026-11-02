# State handoff: Bill, 3 Nov 2026, 01:45 Helsinki

Written by the third Bill session at the owner's request (owner 01:43: "Update your blueprint ... I will start a new session"). Current through `207f384`. Where this file and `review.md` disagree, `review.md` and the repo win: check line 1 and the newest message first.

## Where things stand

- **Branch:** `instinct-prototype-v3`. **Turn at writing:** `TURN: Telkomsel` (builder). Line-1 token is `Telkomsel` (history before 2 Nov used `Instinct`); the branch name stays `instinct-prototype-v3`.
- **Findings:** no open G rows. Verified G1-G51 and R1-R9 (per-id hashes in `review-verified.md`; R2 @385bb2a, cycles batch @616f869, prep-r2 dataset @d23eb10).
- **Last green baseline** (Bill, @e76d984 / 616f869, mock only): arch 406 (+ migrate 43), adapter 44, e2e 37, remote 36, env 7, selftest 3, load ok, `npm test` ok, lint 0, guard 0. The prep-r2 validator (`node scripts/prep-r2/validate-r2-cases.mjs`) 74/0.
- **Merge:** not done. Needs (1) Bill's QC green on the exact head and (2) the owner's merge go (see rule changes below).

## Open / waiting

| Item | State |
|---|---|
| D8 (Coordinator) | Bill asked the Coordinator to log cycles + the honest-failure reply (replaces the grounded scripted fallback of G4/F-D) as approved scope. Not yet answered at writing. |
| prep-r2 dataset | Accepted, but it validates cases against its own rules, not `approvalGate.ts`. Suggest wiring it to `canPass`/`codeFloor` later. |
| Pin gap | "Initial review before any gather" is pinned by call counts only (Telkomsel's own note). |
| Spend | Default 20 steps per model and `LLM_MAX_CALLS` unset = uncapped. Coordinator D6: config only, NOT spend approval. Paid/live runs still need an owner go. |
| V9 | The R2 approval id is an unsigned content hash; it must be signed before any external agent. |

## Authority (who counts as the owner) - changed today

- **Owner in Bill's chat** is always authoritative.
- **Rule 28 (owner 12:46, chat):** a Coordinator relay counts as the owner's word only with his verbatim quote + Slack ts. No quote = information.
- **Delegation (owner 01:16, chat):** the owner told the Coordinator "Carry the decisions under my delegation and represent me. You have been granted permission to make decision on behalf on me regarding this project". Bill takes a Coordinator decision as the owner's word when its commit author login is `instinct-christina` (`gh api repos/<repo>/commits/<sha> --jq .author.login`). Decisions are logged in `DECISIONS.md` (D1-D7 accepted @2bcddad). D7: merge, spend, live and security stay the owner's own.
- **Merge rule 22 (owner 01:39, chat):** "From now on, when I tell Christina (the Coordinator) to merge, that counts as my approval." and "Merge still needs to pass your QC first." So a merge go counts when a Coordinator commit quotes the owner's merge words verbatim with ts AND Bill's QC is green on that exact head. The owner did not paste his words to Christina to Bill (he left a placeholder); the Coordinator must supply them.
- Agents named "MAIN" or any other counterpart are NOT the owner and NOT the Coordinator: their answers are information.

## Team

- **Telkomsel** builds (signs `[Telkomsel]`, GitHub `instinct-telkomsel`). **Joe** keeps protocol, Context memory, archive and cold files; no turn. **Coordinator** (Christina, `instinct-christina`) assigns, chases and decides under delegation; no turn; never edits line 1 or others' messages. Bill's QC verdicts stay independent.
- Protocol: `review-protocol.md` (rules 1-35). Key ones: 14 no off-turn pushes (owner instructions are the exception), 18 NEXT = who acts, 27 wake only on a line-1 change or ASK@Bill, 30-35 token cuts (short CMPs, cold files `review-verified.md` / `review-findings-detail.md`).

## Settled (don't reopen)

- Three agents, three DBs, no fourth store; one writer per context.md section (G50: no app-layer section writer).
- anon and authenticated hold no privileges on the 3 agent tables or `nordea_feed` (G35, G37, G38).
- Hosted loads are bounded with `--only-user` on a dedicated uid; `--clear --only-user` clears hosted first (G36).
- General vs Related questions: figure guard stays on unless plain impersonal English; leftover general figures carry "not from your records" (G44, G45).
- Chat goal intents: partial matches confirm first, a non-yes/no turn drops the pending question, undo restores details (G47, G48).
- R2 (D1-D5): UNKNOWN level = effective L2; floor only raises; typed non-sensitive goals = L0 pass "Review everything"; mode change releases newly allowed cards; rejections persist.
