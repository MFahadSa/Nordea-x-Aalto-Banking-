-- Abel x Nordea concept: new (fictional) Nordea account data for a demo customer.
-- Run this ONCE in Supabase → SQL Editor → New query → paste → Run.
-- Then add a row (Table Editor → nordea_feed → Insert row, or the example insert at the bottom):
-- the app applies it within about 20 seconds, or straight away with
-- More → Nordea account data → Check Supabase now. It writes back applied_at and result.

create table if not exists public.nordea_feed (
  id          bigint generated always as identity primary key,
  user_id     text        not null default 'lauri',   -- the demo customer
  data        jsonb       not null,                    -- { "balances": {...}, "transactions": [...] }
  note        text,                                    -- optional, e.g. 'October update'
  created_at  timestamptz not null default now(),
  applied_at  timestamptz,                             -- filled in by the app
  result      text                                     -- what the app did, e.g. 'Applied: Updated 104 transactions…'
);

-- Locked like abel_records: only the app's server (secret key) can read or write.
alter table public.nordea_feed enable row level security;
grant select, insert, update, delete on public.nordea_feed to service_role;
grant usage, select on sequence public.nordea_feed_id_seq to service_role;

-- A small example you can run to see it work (balances only, plus one new payment):
-- insert into public.nordea_feed (user_id, note, data) values ('lauri', 'small test',
--   '{"balances": {"current": 2180.40, "savings": 15900}}');
