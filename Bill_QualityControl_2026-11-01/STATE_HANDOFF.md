# State handoff: Bill, 2 Nov 2026, 10:26 Helsinki (final from this Bill)

Written by the second Bill session as its closing handoff, current through `0626d92`. Where this file and `review.md` disagree, `review.md` and the repo win; check line 1 and the newest 2 messages first.

## Where things stand

- **Branch:** `instinct-prototype-v3`. Last commit at the time of writing: `0626d92` (Bill closing-pass evidence correction). **Turn:** Instinct (line 1 says `TURN: Instinct`). The builder is **Telkomsel** (signs `[Telkomsel]`); the `TURN:`/`NEXT:` token and the branch name stay `Instinct`.
- **Last full baseline** (re-run by Bill at `f5680a1`, `LLM_PROVIDER=mock`): arch 233, migrate 43, adapter green (44), e2e 27, remote green (35), env 7, selftest suite 3, selftest 13/13 through the server route, lint 0. Re-run them yourself with `TZ=Europe/Helsinki` before verifying anything.
- **On the `Verified:` line in `review.md` (checked 10:30):** G1-G29, G31, G33, G34.
- **Verified by Bill's messages and evidence, but NOT yet moved to that line:** G30 including the residual `abel.ts`/`abelOffline.ts` removal (`f5680a1`), the V4 provider stamp (`fa182ad`), G32 legs 1-4 (leg 4 narrowed: setup + read checks only), the V7 source scan. In `review.md` the table still shows G30 as a row and G32 leg 5, G32 closing and G35 as open, although the evidence below resolves G35, leg 5 and most of the closing pass.
- **Verified by this session since then (evidence `evidence/g32/closing-pass.md`):**
  - **G35:** anon's default SELECT grants on the 3 agent tables revoked (owner go 09:57), then ALL remaining anon privileges revoked (owner re-confirm 10:15 after consequence explanation). relacl shows no anon entry on any of the 3 tables; `SET ROLE anon` probes get 42501 on read and write. authenticated/service_role/agent roles and RLS policies untouched.
  - **Temp memberships:** the 03:18 grants of `agent_user`/`agent_cm`/`agent_nordea` to `postgres` (grantor postgres) are revoked; agent roles re-verified with their own logins after each step. The separate pre-existing supabase_admin-granted memberships were left alone - they are not this session's additions and are not an open hold.
  - **G32 feed ingestion/mark-applied:** verified live with dedicated smoke identity `g32smoke` (NOT a baseline customer), mock LLM; row applied by the feed watcher, marked done, all smoke rows cleaned, full-table hashes byte-identical before/after.
  - **G32 from-zero README run (local):** fresh clone, `npm install --legacy-peer-deps` clean, `--target file` load (255 records), pages 200, selftest 13/13. Fully local, hosted untouched.

## Open

| Item | What remains |
|---|---|
| **G32 literal second hosted load (must merge)** | NOT done. The one hosted load I ran went outside the demo-only scope: its whole-customer push added 8 deterministic seed rows to existing customer stores (msg-seed-*/topic-seed-1/log-seed-1/app_rewards). They were exactly identified (timestamps + full-dump diff) and deleted; counts back to 8/36/241 and data hashes byte-identical to the pre-load baseline. Side effect left behind: the push bumped `updated_at` on the replaced customers' surviving rows (metadata only; data content proven unchanged). A proper second-load check needs an owner-approved bounded route (owner's machine, or a demo-customer-only push); the push replaces whole customers and exceeded my sandbox window. |
| **review.md sync (first job)** | Move G30, G35, G32 leg 5 and the resolved parts of G32 closing to the `Verified:` line with their hashes (evidence: `evidence/g32/closing-pass.md`), delete those rows, and keep one open row only for what remains (the literal second hosted load). Re-read the evidence before moving anything; do not copy this file's claims. |
| **Real-model runs** | Groq free-tier runs within the approved `LLM_MAX_CALLS` still need the owner's go. DB access is role-based and independent of the model provider (checked at source); the anon revoke does not affect Groq-backed runs. |
| **Merge** | Owner's decision only. |
| **load_data.py hosted guard** | Open question for owner/builder: should hosted pushes need an explicit flag so a plain load can't replace whole customer stores. Not a defect found in QC; a hardening suggestion from today's scope slip. |

## Waiting on the owner

- The merge; a re-scoped second hosted load; the Groq real-model go.
- Owner decisions count only from the owner in chat. A relay through Joe or Telkomsel is information until the owner confirms it.

## Settled decisions (don't reopen)

- Three agents, three DBs, no fourth store (V1). Writes go through the owning agent.
- Abel answers only from the finalised session `context` (and bank data only via the Nordea agent).
- `abel.ts`/`abelOffline.ts` are removed; the chat runs on the 3-agent path (`affbd82`, verified `f5680a1`). The import helper lives in `src/server/importPropose.ts`.
- cabinet-db.json -> 3 agent DBs only, auto-delete after verify, NO backup copy (owner, 16:52). A hosted migration hydrates first, awaits the push, reads every row back with `canon()` (hosted column is `jsonb`) and only then deletes.
- `load_data.py` writes plumbing straight into the agent DBs; a fresh load never creates `cabinet-db.json` (G33). The selftest seeds only a genuinely EMPTY store; a partial store stops with an operator error (`f5680a1`).
- The shopping and referral offers are retired from the app surface; statement and document imports stay. Earnings and rewards history stays migrated. Legacy `readableBy.offers`/`offersOff` flags remain as residue.
- Hosted mode: one Postgres role per agent through the session pooler, project `zyuzexnawvelyyzmydog`, `aws-0-eu-north-1`. psql rejects `uselibpqcompat` (node-pg only; strip it for psql, and keep .env values quoted - an unquoted `&` breaks `source .env`). A load merges: hydrate, write, push.
- Live checks on the hosted project use a dedicated smoke uid only and `LLM_PROVIDER=mock`; real-model runs use the Groq free tier with `LLM_MAX_CALLS` set. The demo customer lauri is baseline data, not disposable test state.
- anon holds NO privileges on the 3 agent tables (owner-approved 2 Nov). agent_nordea has SELECT/UPDATE (not INSERT/DELETE) on `nordea_feed`; feed rows go in through the dashboard operator path and out the same way.
- The monitor is on by default; `DEV_MONITOR=0` turns it off. The external MCP agent is out of scope (V9).
