# Supabase: first-time setup

Do this once per Supabase project. Without Supabase the app still runs, but it keeps its data in
`data/cabinet-db.json` on the server, which resets when the hosting restarts the app.

You need a Supabase project (free tier is fine) and about five minutes.

## 1. Create the app's table: `setup.sql`

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Left sidebar → **SQL Editor** → **New query**.
3. Open [`setup.sql`](setup.sql) in this folder, copy **all** of it, paste it into the editor.
4. Click **Run** (or Ctrl + Enter). It should end with *Success. No rows returned*.

This creates:

| What | Purpose |
|---|---|
| table `abel_records` | Everything the app saves: customers, what Abel knows, chats, logs, history. One row per record (`kind`, `id`, `user_id`, `data` as JSON). |
| storage bucket `abel-documents` (private) | Files the customer chose to keep ("Keep a copy"). |

Row level security is switched on with no policies, so only the app's server (with the secret key)
can read or write. Nobody can reach the data with the public key.

## 2. (Optional) Create the account-data inbox: `nordea-feed.sql`

Only needed if you want to drop new (fictional) Nordea account data into Supabase for the app to pick up.

1. **SQL Editor** → **New query**.
2. Paste all of [`nordea-feed.sql`](nordea-feed.sql) → **Run**.

This creates the table `nordea_feed`. Each row you add there is new account data for one customer.
While the app runs it checks the table every 20 seconds, applies new rows, and writes back
`applied_at` and `result` (e.g. `Applied: 7 new transactions…`).

A ready-made example row is in [`nordea-feed-example.csv`](nordea-feed-example.csv): Table Editor →
`nordea_feed` → **Insert** → **Import data from CSV**. Check it first with `npm run check:feed`.
What the `data` JSON may contain is described in the comments of `nordea-feed.sql` and in
[`docs/bank-records.md`](../docs/bank-records.md).

## 3. Connect the app

The app needs two values from your project:

| Setting | Where to find it |
|---|---|
| `SUPABASE_URL` | **Project Settings → Data API → Project URL**, looks like `https://abcdefgh.supabase.co` |
| `SUPABASE_SECRET_KEY` | **Project Settings → API Keys → Secret keys**, starts with `sb_secret_` (an older `service_role` key also works) |

- **AI Studio:** Settings → **Secrets** → add both.
- **Laptop:** put both lines in `.env.local` in the project folder:
  ```
  SUPABASE_URL=https://abcdefgh.supabase.co
  SUPABASE_SECRET_KEY=sb_secret_...
  ```

The secret key gives full access to the project. Keep it in Secrets or `.env.local` only, never in
code, a commit or a chat. (`.env.local` is ignored by git.)

## 4. Check it works

1. Start the app (`npm run dev` on a laptop). The server log says `Database: Supabase (N records)`.
2. In the app: **More → Saved data → Check**. It should say *Saved in Supabase · N records*.
3. In Supabase: **Table Editor → abel_records** now has rows.

On the very first start the table is empty, so the app copies the data it already has (the
fictional demo customers) into Supabase. From then on Supabase is the source of truth: changes in
the app are saved there, and a restart reads them back.

## If something goes wrong

| You see | Fix |
|---|---|
| `The table "abel_records" is missing. Run supabase/setup.sql…` | Step 1 wasn't run, or ran in a different project than the URL points to. |
| `The table "nordea_feed" is missing…` | Run step 2, or ignore it if you don't use the feed. |
| `Invalid API key` / `401` | Wrong key: use the **secret** key, not the publishable/anon one. |
| More → Saved data says *Saved on this server only* | `SUPABASE_URL` or `SUPABASE_SECRET_KEY` isn't set (restart the app after adding them). |
| A feed row says `Not applied: Unknown customer` | `user_id` must be an existing customer, e.g. `lauri`. |

Running the SQL files again is safe: they only create what's missing (`if not exists`,
`on conflict do nothing`).
