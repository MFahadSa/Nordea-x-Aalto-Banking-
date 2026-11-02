# Loading data

The app comes with **no data**. Until something is loaded it shows "No data yet". Data is loaded
separately with `scripts/load_data.py` (Python 3.9+, no packages needed except `openpyxl` for `.xlsx`).

## Once
1. In Supabase → SQL Editor, run `supabase/setup.sql`.
2. Put `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env.local` (the loader reads it, like the app).

## Load the demo customers
```
python scripts/load_data.py seed/demo
```
`seed/demo/` holds the fictional customers Lauri, Eeva and Alex. Each file's name says what it is
(`users.json`, `transactions.csv`, `cabinetEntries.json`, ...). If the app is running, it picks up
the data straight away; otherwise it reads it when it starts.

## Load your own data
| You have | Command |
|---|---|
| A CSV of transactions for one customer | `python scripts/load_data.py my.csv --kind transactions --user-id lauri` |
| A CSV with a `userId` column | `python scripts/load_data.py transactions.csv` |
| An Excel file, one sheet per kind (`users`, `transactions`, …) | `python scripts/load_data.py data.xlsx` |
| A backup of the whole app (`data/cabinet-db.json`) | `python scripts/load_data.py backup.json` |
| JSON Lines | `python scripts/load_data.py messages.jsonl --kind messages` |

Useful options:
- `--dry-run` reads and checks the files, changes nothing.
- `--replace` deletes the existing records of the kinds being loaded first (only that customer's with `--user-id`).
- `--clear` deletes **all** data first. `python scripts/load_data.py --clear` on its own empties the app.
- `--target file` writes `data/cabinet-db.json` instead, for running without Supabase.

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
