# Bank records: how the Nordea-side data is structured

This branch restructures how the app stores the (fictional) Nordea account data, along the lines
discussed for the demo: explicit accounts and balance history, stable transaction identity, original
data kept next to the app's enrichment, and Nordea's observations linked to their evidence.

It does **not** change the Supabase tables (`abel_records`, `nordea_feed` are unchanged — the feed's
`data` column is JSON and simply accepts more optional fields now), and it does not claim to model
Nordea's real internal systems. The public Nordea Open Banking "Accounts Information" API was the
reference for which fields a real account statement carries.

## What changed

### 1. Transactions keep banking detail, and unknown stays unknown

`Transaction` gains optional fields: `bankId`, `valueDate`, `status` ('booked' | 'pending'),
`currency`, `counterparty`, `reference`, `paymentMethod`, `originalCategory`, `categorySource`,
`batchId`. They are only set when the feed or file actually carries them — the app never invents a
reference, counterparty or date. Old data and the CSV format (date/amount/description only) keep
working exactly as before.

### 2. Explicit account records

Each account is now its own record (`BankAccount`: stable key, plus `type` / `iban` / `currency` only
when known). Existing records are derived from the customer data on load - the iban comes from the
existing accounts, currency and type stay unset until a feed supplies them (optional `accounts` array
in the feed). The app's `User.accounts` stays the live view the UI reads; transactions, balance
snapshots and imports refer to accounts by their stable key.

### 3. Stable transaction identity, snapshot vs incremental imports

Before, every import assigned ids by position (`nd-lauri-0`, `nd-lauri-1`, …) and replaced the whole
list, so re-importing the same statement produced new identities and any merge would duplicate rows.

Now an import sets `"mode": "snapshot"` (default, same replace behaviour as before) or
`"mode": "incremental"` (merge). Each transaction gets a stable id: the bank's own `bankId` when
supplied, otherwise a fingerprint of date + amount + description + account + currency (repeated
identical rows get `-2`, `-3`, …). In incremental mode rows whose id is already stored are skipped,
so re-applying the same feed row is a no-op - with one exception: a row re-sent under the same
`bankId` with changed content (e.g. a pending transaction booking) is treated as a correction and
updated in place, keeping its id. Every import is recorded as an `ImportBatch` (source, mode, counts
of received/added/skipped/updated/rejected), and each transaction points back to its batch via
`batchId`.

### 4. Dated balance snapshots

Balances still update the customer's current accounts as before, but each applied balance is also
kept as a `BalanceSnapshot` (account key, balance, date, source, batch). Balance history now
survives later imports instead of being overwritten.

### 4. Original data vs the app's enrichment

A category supplied by the feed is used verbatim and marked `categorySource: 'bank'` (meaning
"feed-supplied" — this is fictional demo data, not Nordea's real categorization). When the app has
to guess from the description, the guess is marked `categorySource: 'app'` and the feed's original
value is kept in `originalCategory`. Example: a feed category of `TRAVEL` ends up normalized to
`transport` with `originalCategory: 'TRAVEL'`, and nothing presents the guess as the bank's own.

### 5. Observations carry their evidence

Every "Nordea noticed" entry now records `evidence`: the transaction ids it was computed from, the
analysis window (`periodFrom`/`periodTo`), when it was computed, and an `inputsHash` fingerprint.
`refreshObservations` runs on every import, so an observation whose inputs changed is recomputed
(and goes back to the customer for review, as before); one the data no longer shows is archived.
Entries created before this change simply pick up their evidence the next time data is applied.

## Compatibility and migration

- No Supabase migration needed: `abel_records` is schemaless JSON rows and `nordea_feed.data` is
  JSON. The new record kinds (`balanceSnapshots`, `importBatches`) appear as new rows the first
  time the app saves after deploy. `migrate()` initializes both lists for old saved databases.
- Existing API responses only gain fields (`/api/nordea-data` adds `batches` and
  `balanceSnapshots`); nothing was removed.
- Ids of *previously imported* (positional) transactions are not rewritten; they get stable ids
  the next time data is applied. Nothing in the app referenced the old positional ids.
- Deliberate caveats: two truly identical rows (same date, amount, description, account, currency
  and no bank id) are indistinguishable without a bank reference, so the `-2`/`-3` ordinal treats
  their order within a file as meaningful; and a genuinely new transaction that is byte-identical to
  an imported one (same cafe, same price, same day) is skipped in incremental mode. Feeding `bankId`
  removes both ambiguities. Corrections without a bank id are not possible: a changed row looks like
  a new row plus a missing old one (snapshot mode handles this case correctly by replacing).

## Tests

`npm test` runs `scripts/test-bank-records.ts`: pure checks against a temporary data directory
(the demo database is not touched). `npm run lint` (tsc) still passes.
