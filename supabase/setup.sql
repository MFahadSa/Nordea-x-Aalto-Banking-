-- Abel x Nordea concept: run this ONCE in Supabase → SQL Editor → New query → paste → Run.
-- It creates the one table the app saves into, and the private folder for kept files.

-- Every record (customers, what Abel knows, chats, logs, history, kept-file info) is one row.
create table if not exists public.abel_records (
  kind       text        not null,          -- e.g. 'cabinetEntries', 'messages', 'entryHistory'
  id         text        not null,
  user_id    text,                           -- the demo customer, e.g. 'lauri'
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);
create index if not exists abel_records_user on public.abel_records (user_id);

-- Lock it: with row level security on and no policies, only the app's server (secret key) can read or write.
alter table public.abel_records enable row level security;
grant select, insert, update, delete on public.abel_records to service_role;

-- Private storage bucket for files the customer chose to keep ("Keep a copy").
-- The app also creates it by itself if it's missing.
insert into storage.buckets (id, name, public)
values ('abel-documents', 'abel-documents', false)
on conflict (id) do nothing;

-- (Optional) New Nordea account data for the demo: see supabase/nordea-feed.sql.
