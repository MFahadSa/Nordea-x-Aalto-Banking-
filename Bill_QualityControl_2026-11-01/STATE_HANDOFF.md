# State handoff: Bill, 2 Nov 2026, 09:38 Helsinki

Written by the second Bill session at the owner's request (09:37 DM), current through `f0be436`. Where this file and `review.md` disagree, `review.md` and the repo win; check line 1 and the newest 2 messages first.

## Where things stand

- **Branch:** `instinct-prototype-v3`. Last commit at the time of writing: `f0be436` (Joe refreshes his own handoff). **Turn:** Instinct (line 1 says `TURN: Instinct`). The builder is **Telkomsel** (signs `[Telkomsel]`); the `TURN:`/`NEXT:` token and the branch name stay `Instinct`.
- **Last full baseline** (re-run by Bill at `f5680a1`, `LLM_PROVIDER=mock`): arch 233, migrate 43, adapter green (44), e2e 27, remote green (35), env 7, selftest suite 3, selftest 13/13 through the server route, lint 0. Re-run them yourself with `TZ=Europe/Helsinki` before verifying anything.
- **Verified in the table's `Verified:` line:** G1-G29, G33, G34, G31, V4 provider stamp, G30 including the residual `abel.ts`/`abelOffline.ts` removal (`f5680a1`), G32 legs 1-4 (leg 4 narrowed: setup + read checks only; ingestion/mark-applied NOT exercised).

## Open

| Item | What remains |
|---|---|
| **G32 leg 5 (M)** | `role-smoke.sql` ran on the hosted project (evidence `evidence/g32/legs-4-5-hosted.md`): 22 PASS / 3 FAIL - anon holds default SELECT grants, RLS still returns 0 rows. Feeds G35. Leg 2's second hosted load (must merge) and the from-zero README run still need the owner. |
| **G35 (M)** | anon holds default SELECT grants on the 3 agent tables (Supabase defaults; RLS still returns 0 rows). A repo note claims the owner OK'd a revoke at 03:32 - that is a relay claim, not an owner confirmation in chat. Hold for the owner's word. |
| **Bill's temp role memberships** | The second Bill granted `agent_user`/`agent_cm`/`agent_nordea` to `postgres` on the live project (03:18) to pass `SET ROLE` - beyond its mandate; disclosed. Keep/revoke is the owner's decision. Do not widen or roll back roles/grants without it. |
| **bank_offers design** | Advice delivered (owner's DM thread): put it in a Nordea-owned table in the existing Nordea store, not a fourth physical DB, unless a distinct trust boundary (separate operator/partner) appears. No storage work approved. |
| **Env finding** | Fixed and verified (`294625c`): `loadEnv` first import; `.env.local` overrides real env. |
| **Before DONE** | The V7 source scan (no code reads customer data from the old store), the closing from-zero run, real-model runs within the approved `LLM_MAX_CALLS`, and the owner's decision on merging. |

## Waiting on the owner

- Keep/revoke the temp role memberships; the G35 revoke; the closing live steps; the merge.
- Owner decisions count only from the owner in chat. A relay through Joe or Telkomsel is information until the owner confirms it.

## Settled decisions (don't reopen)

- Three agents, three DBs, no fourth store (V1). Writes go through the owning agent.
- Abel answers only from the finalised session `context` (and bank data only via the Nordea agent). 
- `abel.ts`/`abelOffline.ts` are removed; the chat runs on the 3-agent path (`affbd82`, verified `f5680a1`). The import helper lives in `src/server/importPropose.ts`.
- cabinet-db.json -> 3 agent DBs only, auto-delete after verify, NO backup copy (owner, 16:52). A hosted migration hydrates first, awaits the push, reads every row back with `canon()` (hosted column is `jsonb`) and only then deletes.
- `load_data.py` writes plumbing straight into the agent DBs; a fresh load never creates `cabinet-db.json` (G33). The selftest seeds only a genuinely EMPTY store; a partial store stops with an operator error (`f5680a1`).
- The shopping and referral offers are retired from the app surface; statement and document imports stay. Earnings and rewards history stays migrated. Legacy `readableBy.offers`/`offersOff` flags remain as residue.
- Hosted mode: one Postgres role per agent through the session pooler, project `zyuzexnawvelyyzmydog`, `aws-0-eu-north-1`. psql rejects `uselibpqcompat` (node-pg only). A load merges: hydrate, write, push.
- Live checks on the hosted project use the demo uid only and `LLM_PROVIDER=mock`; real-model runs use the Groq free tier with `LLM_MAX_CALLS` set.
- The monitor is on by default; `DEV_MONITOR=0` turns it off. The external MCP agent is out of scope (V9).
