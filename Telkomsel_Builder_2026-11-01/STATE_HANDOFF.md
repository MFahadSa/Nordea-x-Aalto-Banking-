# State handoff: Telkomsel, 2 Nov 2026, 09:52 Helsinki

Written by Telkomsel at the owner's request (relayed 09:37), current through `ee4eb1d`. Where this file and `review.md` disagree, `review.md` and the repo win; check line 1 and the newest 2 messages first.

## Where things stand

- **Branch:** `instinct-prototype-v3`. Last commit at the time of writing: `ee4eb1d` (Bill returned the turn for a documentation-only correction of this blueprint). **Turn:** Instinct (line 1). The builder signs `[Telkomsel]`; the `TURN:`/`NEXT:` token and the branch name stay `Instinct`.
- **Last full baseline** (re-run by Telkomsel at `446a02e`, `LLM_PROVIDER=mock`, each suite unpiped): arch 233, migrate 43, adapter 44, e2e 27, remote 35, env 7, selftest suite 3, bank-records green, lint 0. The 13-check selftest passes 13/13 through the server route on a genuinely empty store.
- **Verified** (the table's `Verified:` line): G1-G29, G33, G34, G30 including the residual `abel.ts`/`abelOffline.ts` removal (`f5680a1`), G31, G32 legs 1-2, leg 3, and leg 4 narrowed to setup + read checks (ingestion/mark-applied NOT exercised).

## Approval state (whose control is whose)

- **Habibil's standing approval** (his Slack DM D0CDS44F00K, thread 1793567890.810359: list 1793583549.616609, auto-approval reply 1793583644.766189, consolidated list 1793583775.112419, acceptance 1793583810.878089) covers this builder for merges, deploys, force-pushes/history rewrites, deletions, cross-repo/account work and broader commitments/messages/shares within that source-backed standing scope, with clear targets and checked consequences. **None of merge/deploy is currently assigned.** Still reserved for his explicit OK: spending money/credits, security/access changes.
- **Bill's side's holds** are its own owner's controls on the hosted project it runs, not limits on the approval above: the **G35** anon-grant revoke, **Bill's temp role memberships** (`agent_user`/`agent_cm`/`agent_nordea` -> `postgres`, granted 03:18 by Bill's second session and disclosed), and Bill's "merge is the owner's call" stance. A repo note claims a 03:32 owner OK for the G35 revoke and role cleanup - a relay claim, not a chat confirmation.
- A new session of this role must have the owner or the authorized coordination channel confirm that the recorded coverage applies to it, and arrange its own access, before relying on it. This file grants nothing by itself.

## Open

| Item | What remains |
|---|---|
| **G32 leg 5 + closing (M)** | `role-smoke.sql` ran on the hosted project (evidence `evidence/g32/legs-4-5-hosted.md`): 22 PASS / 3 FAIL - anon holds default SELECT grants, RLS still returns 0 rows. Still needed: second hosted load (must merge), from-zero README run, closing live pass. Not approval-gated beyond spending/security-access; it needs live hosted access arranged (Groq/Supabase). |
| **G35 (M)** | anon holds default SELECT grants on the 3 agent tables (Supabase defaults; RLS still returns 0 rows). Revoke/accept decision held by Bill's side's owner (see above). |
| **Bill's temp role memberships** | Keep/revoke held by Bill's side's owner. Do not widen or roll back roles/grants without that side's word. |
| **bank_offers design** | Advice delivered: a Nordea-owned table in the existing Nordea store, not a fourth physical DB, unless a distinct trust boundary appears. No storage work approved. |
| **Merge** | Covered by Habibil's standing approval for this builder (above). Nothing currently assigned. |

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
