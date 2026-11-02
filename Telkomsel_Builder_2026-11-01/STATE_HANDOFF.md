# State handoff: Telkomsel, 2 Nov 2026, 09:48 Helsinki

Written by Telkomsel at the owner's request (relayed 09:37), current through `446a02e`. Where this file and `review.md` disagree, `review.md` and the repo win; check line 1 and the newest 2 messages first.

## Where things stand

- **Branch:** `instinct-prototype-v3`. Last commit at the time of writing: `446a02e` (Bill refreshed his own blueprint). **Turn:** Instinct (line 1 says `TURN: Instinct`). The builder signs `[Telkomsel]`; the `TURN:`/`NEXT:` token and the branch name stay `Instinct`.
- **Last full baseline** (re-run by Telkomsel at `446a02e`, `LLM_PROVIDER=mock`, each suite unpiped): arch 233, migrate 43, adapter 44, e2e 27, remote 35, env 7, selftest suite 3, bank-records green, lint 0. The 13-check selftest passes 13/13 through the server route on a genuinely empty store.
- **Verified** (the table's `Verified:` line): G1-G29, G33, G34, G30 including the residual `abel.ts`/`abelOffline.ts` removal (`f5680a1`), G31, G32 legs 1-2, leg 3, and leg 4 narrowed to setup + read checks (ingestion/mark-applied NOT exercised).

## Open

| Item | What remains |
|---|---|
| **G32 leg 5 + closing (M)** | `role-smoke.sql` ran on the hosted project (evidence `evidence/g32/legs-4-5-hosted.md`): 22 PASS / 3 FAIL - anon holds default SELECT grants, RLS still returns 0 rows. Still needed: second hosted load (must merge), from-zero README run, closing live pass - all owner-approved live steps. |
| **G35 (M)** | anon holds default SELECT grants on the 3 agent tables (Supabase defaults; RLS still returns 0 rows). A repo note claims the owner OK'd a revoke at 03:32 - that is a relay claim, not an owner confirmation in chat. Hold for the owner's word. |
| **Bill's temp role memberships** | The second Bill granted `agent_user`/`agent_cm`/`agent_nordea` to `postgres` on the live project (03:18) to pass `SET ROLE` - beyond its mandate; disclosed. Keep/revoke is the owner's decision. Do not widen or roll back roles/grants without it. |
| **bank_offers design** | Advice delivered: a Nordea-owned table in the existing Nordea store, not a fourth physical DB, unless a distinct trust boundary appears. No storage work approved. |
| **Merge** | The owner's call. Nothing assigned. |

## Settled (do not re-ask)

- Three agents, three DBs, no fourth store (V1). Writes go through the owning agent.
- Abel answers only from the finalised session `context` (bank data only via the Nordea agent).
- `abel.ts`/`abelOffline.ts` are removed; chat runs on the 3-agent path (`affbd82`, verified `f5680a1`). The import helper lives in `src/server/importPropose.ts`.
- cabinet-db.json migrates into the 3 agent DBs only, auto-delete after all-3 verify, NO backup (owner 16:52).
- `load_data.py` writes plumbing straight into the agent DBs; a fresh load never creates `cabinet-db.json` (G33).
- The selftest seeds only a genuinely EMPTY store; a partial store stops with an operator error naming `scripts/load_data.py` (`f5680a1`).
- The shopping and referral offers are retired from the app surface; statement and document imports stay. Earnings/rewards history stays migrated. Legacy `readableBy.offers`/`offersOff` flags remain as residue.
- Hosted mode: one Postgres role per agent through the session pooler, project `zyuzexnawvelyyzmydog`, `aws-0-eu-north-1`. psql rejects `uselibpqcompat` (node-pg only). A load merges: hydrate, write, push.
- Live checks on the hosted project use the demo uid only and `LLM_PROVIDER=mock`; real-model runs use the Groq free tier with `LLM_MAX_CALLS` set.
- The monitor is on by default; `DEV_MONITOR=0` turns it off. V9 (external MCP agent) is out of scope.
- Env load-order fixed (`294625c`): `loadEnv` runs before the store modules import; `.env.local` overrides the real environment.

## Known habits

- Bill and Telkomsel once typed message times ahead of the clock; the guard blocks it. The sandbox clock may be UTC: `export TZ=Europe/Helsinki` first and take header times from `date +%H:%M`.
- Telkomsel once wiped all review.md sections in a hand-over (43fad9c); run `grep -n '^## ' review.md` after every edit.
- Bill reproduces green claims from a clean state and probes the neighbouring path. Test the empty state AND the partial state; an automatic seed that upserts can silently overwrite edited records.
