# Supabase: hosted storage for the three agent databases (v3)

The app keeps all customer data in local SQLite files by default (`data/arch/*.db`) and needs
nothing here. To host that data on [Supabase](https://supabase.com) instead, do step 1-3 once per
project (free tier is fine, about ten minutes). Steps 4 and 5 are optional extras.

## 1. Create the three agent tables and roles: `three-agents.sql`

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Left sidebar → **SQL Editor** → **New query**.
3. Open [`three-agents.sql`](three-agents.sql) in this folder, copy **all** of it, paste it into
   the editor, click **Run** (or Ctrl + Enter). It should end with *Success*.

This creates one table per agent database (`agent_user_records`, `agent_cm_records`,
`agent_nordea_records`) and one Postgres role per agent (`agent_user`, `agent_cm`,
`agent_nordea`) with rights on its own table only - no service key ever reaches an agent path.

Still in the SQL Editor, give each role a letters-and-digits password (other characters can break
the connection string):

```sql
alter role agent_user password '...';
alter role agent_cm password '...';
alter role agent_nordea password '...';
```

## 2. Connect the app: one pooler URL per role

Use the **session pooler** host from Supabase → **Connect**; the direct `db.<project>` host is
unreachable on networks without IPv6. Put the three connection strings in `.env`
(see `.env.example`):

```
USER_DB_URL="postgresql://agent_user.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
CM_DB_URL="postgresql://agent_cm.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
NORDEA_DB_URL="postgresql://agent_nordea.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

Smoke-check each role before starting the app (each prints one number - `0` on a fresh project is
fine; a permission or connection error means step 1 didn't run in this project, or the URL is wrong):

```bash
# bash / macOS / Linux:
psql "$USER_DB_URL" -c 'select count(*) from agent_user_records;'
psql "$CM_DB_URL" -c 'select count(*) from agent_cm_records;'
psql "$NORDEA_DB_URL" -c 'select count(*) from agent_nordea_records;'
```
```powershell
# Windows PowerShell:
psql $env:USER_DB_URL -c 'select count(*) from agent_user_records;'
```

For the full isolation proof run [`role-smoke.sql`](role-smoke.sql) once in the SQL Editor: it
sets each agent role (and the public anon role), tries to read and write every table, and ends
with a PASS/FAIL table - every line should say PASS.

## 3. Load the data

```
python scripts/load_data.py seed/demo
```

The loader first hydrates the local agent databases from the hosted tables, then loads, then
pushes everything back - a load **merges**, it never drops hosted rows. A missing local database
file never replaces hosted rows either: the push refuses and tells you to hydrate first.
`--clear` (or `scripts/load_remote.ts clear <uid>`) is the explicit wipe.

At startup the app replaces its local agent databases with the hosted rows (hydrate) and flushes
later writes back; if Supabase is unreachable it keeps working on the local files and logs the
failure. Deleting a customer's database in the app clears that customer's hosted rows too.

## 4. RETIRED: app plumbing (`setup.sql`)

As of G30 the app stores everything in the three agent databases - no plumbing table, no fourth
store. `setup.sql` / `abel_records` is unused and kept for reference only; do not run it. A
leftover local `data/cabinet-db.json` moves into the agent databases with `npm run migrate:legacy`
(verified, then deleted). Kept documents still use the private `abel-documents` bucket via
`SUPABASE_URL` + `SUPABASE_SECRET_KEY` (below).

1. **SQL Editor** → **New query** → paste all of [`setup.sql`](setup.sql) → **Run**.
2. Add two values to `.env` (AI Studio: Settings → Secrets):
   - `SUPABASE_URL` - **Project Settings → Data API → Project URL** (`https://<ref>.supabase.co`)
   - `SUPABASE_SECRET_KEY` - **Project Settings → API Keys → Secret keys** (`sb_secret_...`)

The secret key gives full access to the project: keep it in Secrets or `.env` only, never in
code, a commit or a chat.

## 5. (Optional) New-data feed: `nordea-feed.sql`

Only needed if you want to drop new (fictional) Nordea account data into Supabase for the app to
pick up. Needs step 4's `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (the feed is read with the secret
key today).

1. **SQL Editor** → **New query** → paste all of [`nordea-feed.sql`](nordea-feed.sql) → **Run**.
   Run it AFTER [`three-agents.sql`](three-agents.sql) (it grants the `agent_nordea` role), and run
   it again if you ran an older copy of this file.
2. Add rows in **Table Editor → nordea_feed → Insert row**, or import
   [`nordea-feed-example.csv`](nordea-feed-example.csv) (**Insert** → **Import data from CSV**).
   Check the CSV first with `npm run check:feed`.

While the app runs it checks the table every 20 seconds (or immediately via **Check feed** on
`/arch.html`), applies new rows, and writes back `applied_at` and `result`. What the `data` JSON
may contain is documented in the comments of `nordea-feed.sql` and in
[`docs/bank-records.md`](../docs/bank-records.md).

## If something goes wrong

| You see | Fix |
|---|---|
| `permission denied for table agent_...` | Step 1 wasn't run, or ran in a different project than the URL points to. |
| `The table "abel_records" is missing. Run supabase/setup.sql…` | Old app version: update. Current versions never use `abel_records`. |
| `The table "nordea_feed" is missing…` | Run step 5, or ignore it if you don't use the feed. |
| `Invalid API key` / `401` | Wrong key in step 4: use the **secret** key, not the publishable/anon one. |
| Connection timeout to `db.<project>.supabase.co` | Use the session pooler host from step 2 (the direct host is IPv6-only). |
| A feed row says `Not applied: Unknown customer` | `user_id` must be an existing customer, e.g. `lauri`. |

Running the SQL files again is safe: they only create what's missing (`if not exists`,
`on conflict do nothing`).
