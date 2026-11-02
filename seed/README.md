# Loading data

The app comes with **no data**. Until something is loaded it shows "No data yet". Data is loaded
separately with `scripts/load_data.py` (Python 3.9+, no packages needed except `openpyxl` for `.xlsx`).

## Once
Nothing, for a local run - `--target file` writes the three agent databases under `data/arch/`
and needs no setup. Hosting the data on Supabase instead is optional: see the main README's
Supabase section (`supabase/three-agents.sql`, one role URL per agent), then drop `--target file`.

## Load the demo customers
```
python scripts/load_data.py seed/demo --target file
```
`seed/demo/` holds the fictional customers Lauri, Eeva and Alex. Each file's name says what it is
(`users.json`, `transactions.csv`, `cabinetEntries.json`, ...). If the app is running, it picks up
the data straight away; otherwise it reads it when it starts.

## Load your own data
| You have | Command |
|---|---|
| A CSV of transactions for one customer | `python scripts/load_data.py my.csv --kind transactions --user-id lauri --target file` |
| A CSV with a `userId` column | `python scripts/load_data.py transactions.csv --target file` |
| An Excel file, one sheet per kind (`users`, `transactions`, …) | `python scripts/load_data.py data.xlsx --target file` |
| A backup of the whole app (`data/cabinet-db.json`) | `python scripts/load_data.py backup.json --target file` |
| JSON Lines | `python scripts/load_data.py messages.jsonl --kind messages --target file` |

Useful options:
- `--dry-run` reads and checks the files, changes nothing.
- `--replace` deletes the existing records of the kinds being loaded first (only that customer's with `--user-id`).
- `--only-user lauri` (repeat it or comma-separate) loads only the named customers from a multi-customer
  folder - a hosted load or second-load merge check stays bounded to them instead of pushing every store.
- `--clear` deletes **all** data first. `python scripts/load_data.py --clear` on its own empties the app
  (with the hosted setup it also deletes every row of the hosted agent tables - that full wipe is
  guarded behind an explicit `--all` inside `scripts/load_remote.ts`).
- `--target file` keeps everything in the local agent databases (`data/arch/*.db`), for running without Supabase.

## What a file needs
- **users**: `id` and `name`. Everything else has a default. Nested fields as dotted headers, e.g.
  `accounts.current.balance`, `accounts.savings.balance`, `accounts.savings.monthlyDeposit`.
- **transactions**: `date` (YYYY-MM-DD), `amount` (negative = money out), `userId` (or `--user-id`).
  Optional: `id`, `category` (salary, housing, groceries, restaurants, transport, bills, subscriptions,
  shopping, pharmacy, savings_transfer, savings_transfer_in, pension, other), `account` (current/savings), `description`.
- **cabinetEntries** (what Abel knows): `title` and `userId`. Optional: `type` (goal, life_event, preference,
  fact, observation, blind_spot), `detail`, `status`, `target.amount`, `target.date`, …

Column names in snake_case (`user_id`, `created_at`) become the app's camelCase. Without an `id` column, each
record gets an id made from its content, so loading the same file twice doesn't duplicate anything.
Records are only shown for customers that exist as **users**, so load the users too.
