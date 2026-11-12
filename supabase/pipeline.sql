-- pipeline.sql (v20): run ONCE in the Supabase SQL editor (Project -> SQL Editor -> New query ->
-- paste -> Run). Safe to run again. Needs no passwords and no new AI Studio secrets: the app uses
-- the SUPABASE_URL + SUPABASE_SECRET_KEY it already has.
--
-- 1. The three agent tables (the same ones supabase/three-agents.sql makes). The app keeps the
--    User DB, Context Memory and Nordea DB here, so a restart (AI Studio) loses nothing.
-- 2. pipeline_records: what arrived through the input pipeline (runs, the items the filter kept,
--    and Nordea cases with what the customer shared for each). Raw input and dropped signals are
--    never written anywhere.
--
-- Only the server's secret key reaches these tables (row-level security on, no public policies).

create table if not exists agent_user_records (
  user_id text not null, table_name text not null, id text not null,
  data jsonb not null, updated_at timestamptz not null default now(),
  primary key (user_id, table_name, id)
);
create table if not exists agent_cm_records (
  user_id text not null, table_name text not null, id text not null,
  data jsonb not null, updated_at timestamptz not null default now(),
  primary key (user_id, table_name, id)
);
create table if not exists agent_nordea_records (
  user_id text not null, table_name text not null, id text not null,
  data jsonb not null, updated_at timestamptz not null default now(),
  primary key (user_id, table_name, id)
);

create table if not exists pipeline_records (
  id text primary key,
  user_id text not null,
  kind text not null check (kind in ('run', 'candidate', 'case')),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists pipeline_records_user on pipeline_records (user_id, kind);

alter table agent_user_records enable row level security;
alter table agent_cm_records enable row level security;
alter table agent_nordea_records enable row level security;
alter table pipeline_records enable row level security;
-- No policies for anon/authenticated: the browser can never read these tables. The server's
-- secret key bypasses row-level security by design.
