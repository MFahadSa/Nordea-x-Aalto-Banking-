# Fresh-project one-command setup proof - 2026-11-03 (evidence)

Owner decision (verbatim): **"Follow your recommendation"** - ts1793713104.149319, project Slack
channel C0CDY4N9LD8, thread 1793691047.328029, sender habibil_ghifary. The recommendation it
accepted (verbatim, ts1793713077.202159): test the new-user setup before merging - prove a fresh
empty database works through the one-command loader, keep the merge on hold, and do not change
the existing database. The existing Supabase project was NOT touched by this run.

## What was proven

A brand-new, empty Postgres project goes from zero to a working hosted app through the
documented one-command path alone:

1. `python3 scripts/load_data.py --init` with only `SUPABASE_DB_URL` in the environment:
   applied `supabase/three-agents.sql` + `supabase/nordea-feed.sql` + `supabase/role-smoke.sql`
   via psql (libpq env, URL never in argv), created the three agent roles with generated,
   never-printed passwords, wrote `USER_/CM_/NORDEA_DB_URL` to `.env.local` (0600), and ended
   with the role smoke check: **26/26 PASS** (re-run standalone afterwards: 26 PASS, 0 FAIL).
2. App boot with no extra environment (dotenv reads `.env.local`, `LLM_PROVIDER=mock`; no
   model calls): hydrated 0/0/0 from the empty hosted tables.
3. Live writes for fictional customer `fresh-demo-01` (goal `goal-mw0qj8ci-00m9`):
   debounced flush landed 3 rows in agent_user_records.
4. Nordea feed path end to end: one `nordea_feed` insert was applied by the running app
   ("Applied: Updated 1 transaction"), and the resulting Nordea store write flushed to
   agent_nordea_records (`transactions/nd-fresh-demo-01-h-wafl1w`,
   `import_batches/batch-fresh-demo-01-mw0qjmar-jykf`). This is the first live proof of the Nordea flush CODE PATH, against a
   real Postgres server - local, NOT against the hosted Supabase project.
5. Graceful SIGTERM drained pending flushes; after a full local data wipe and reboot the app
   re-hydrated (user 4 / cm 7 / nordea 2 rows) and served the goal with all three stores on
   backend `postgres`, connected.

## Environment and declared deviations

- Target: a REAL PostgreSQL 16.2 server (initdb, scram-sha-256 password auth over TCP,
  RLS/grants/policies identical to Supabase), run locally. Supabase's predefined `anon` and
  `service_role` roles were pre-created as nologin roles to emulate a fresh Supabase project's
  defaults - the setup SQL assumes they exist, as they do on Supabase.
- Transport SSL NOT exercised: neither available psql build has SSL support, and `--init`
  hardcodes `PGSSLMODE=require`. A PATH-level psql shim downgraded sslmode to `disable` for
  this localhost run only. The loader and SQL ran unmodified; the SSL transport itself is
  standard Supabase behavior and remains unverified in this harness.
- The existing hosted project (schema, data, roles) was not connected to, read, or modified.
- All test rows live only in the throwaway local server, which was stopped and removed.
- Mock AI only; zero model calls; zero cost.

## Residual limits after this run

This run proves the Postgres PATH locally. The two HOSTED limits remain OPEN:
- Nordea HOSTED flush: the flush code path is proven against a real local Postgres here; it
  has NOT been exercised against the hosted Supabase project.
- Fresh HOSTED Supabase provisioning: `--init` provisioning logic is proven against a real
  local Postgres with the deviations above (emulated Supabase default roles; SSL transport
  downgraded). It has NOT run against a real fresh Supabase project (actual dashboard
  provisioning, pooler, enforced SSL). Closing it would require creating and deleting a
  temporary hosted project, which was not in scope of this approval.
