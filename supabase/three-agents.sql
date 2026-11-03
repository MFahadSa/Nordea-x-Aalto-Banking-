-- three-agents.sql (G6): hosted storage for the three-database architecture.
-- Run once in the Supabase SQL editor as the project owner.
--
-- What it makes: one table per agent database (user / context memory / nordea), and one
-- Postgres role per agent with rights on its own table ONLY. The app connects each store
-- module with its own role's connection string (USER_DB_URL / CM_DB_URL / NORDEA_DB_URL);
-- no service key ever reaches an agent path. Without the env vars the app stays on local
-- SQLite (data/arch/*.db) - that remains the default.
--
-- Row shape: one row per SQLite row of the corresponding local database:
--   (user_id, table_name, id) -> data jsonb (the row's columns as JSON).
-- The app hydrates its local SQLite from these tables at startup and flushes changes back.

create table if not exists agent_user_records (
  user_id    text        not null,
  table_name text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, table_name, id)
);
create table if not exists agent_cm_records (
  user_id    text        not null,
  table_name text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, table_name, id)
);
create table if not exists agent_nordea_records (
  user_id    text        not null,
  table_name text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, table_name, id)
);

-- One role per agent. Set passwords with:  alter role agent_user password '...';
do $$
begin
  if not exists (select from pg_roles where rolname = 'agent_user') then create role agent_user login; end if;
  if not exists (select from pg_roles where rolname = 'agent_cm') then create role agent_cm login; end if;
  if not exists (select from pg_roles where rolname = 'agent_nordea') then create role agent_nordea login; end if;
end $$;

grant select, insert, update, delete on agent_user_records to agent_user;
grant select, insert, update, delete on agent_cm_records to agent_cm;
grant select, insert, update, delete on agent_nordea_records to agent_nordea;
-- No cross-grants: an agent role cannot touch another agent's table, by construction.

-- Defence in depth: row-level security keyed to the role name, so even a stolen connection
-- string only ever sees its own table's rows.
alter table agent_user_records enable row level security;
alter table agent_cm_records enable row level security;
alter table agent_nordea_records enable row level security;

drop policy if exists agent_user_own on agent_user_records;
create policy agent_user_own on agent_user_records for all to agent_user using (true) with check (true);
drop policy if exists agent_cm_own on agent_cm_records;
create policy agent_cm_own on agent_cm_records for all to agent_cm using (true) with check (true);
drop policy if exists agent_nordea_own on agent_nordea_records;
create policy agent_nordea_own on agent_nordea_records for all to agent_nordea using (true) with check (true);

-- Connection strings for the app's environment afterwards:
--   USER_DB_URL=postgresql://agent_user:<password>@db.<project>.supabase.co:5432/postgres
--   CM_DB_URL=postgresql://agent_cm:<password>@db.<project>.supabase.co:5432/postgres
--   NORDEA_DB_URL=postgresql://agent_nordea:<password>@db.<project>.supabase.co:5432/postgres
