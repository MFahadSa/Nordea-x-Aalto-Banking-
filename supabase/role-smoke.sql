-- role-smoke.sql (G27): proves each agent role can read and write ONLY its own table, and that
-- the public anon role can read none of them. Run ONCE in the SQL Editor as the project owner,
-- AFTER three-agents.sql. The last statement prints one PASS/FAIL table.
--
-- A missing optional table (abel_records, nordea_feed) counts as "deny" - a role cannot read
-- what does not exist. Safe to re-run: it writes one smoke row per agent table and deletes them.
-- Each role collects its own rows into its own temp table (a role cannot write another role's
-- temp table); the owner unions them at the end.

create or replace function pg_temp.smoke(p_check text, p_expected text, p_sql text)
returns table(check_name text, expected text, result text) language plpgsql as $$
begin
  execute p_sql;
  return query select p_check, p_expected,
    case when p_expected = 'allow' then 'PASS' else 'FAIL (was allowed!)' end;
exception when others then
  return query select p_check, p_expected,
    case when p_expected = 'deny' then 'PASS' else 'FAIL: ' || sqlerrm end;
end $$;

set role agent_user;
create temp table smoke_user as
  select * from pg_temp.smoke('agent_user reads agent_user_records',  'allow', 'select 1 from agent_user_records limit 1')
  union all select * from pg_temp.smoke('agent_user writes agent_user_records', 'allow', $$insert into agent_user_records (user_id, table_name, id, data) values ('smoke','smoke','smoke','{}'::jsonb)$$)
  union all select * from pg_temp.smoke('agent_user reads agent_cm_records',     'deny', 'select 1 from agent_cm_records limit 1')
  union all select * from pg_temp.smoke('agent_user reads agent_nordea_records', 'deny', 'select 1 from agent_nordea_records limit 1')
  union all select * from pg_temp.smoke('agent_user reads abel_records',         'deny', 'select 1 from abel_records limit 1')
  union all select * from pg_temp.smoke('agent_user reads nordea_feed',          'deny', 'select 1 from nordea_feed limit 1')
  union all select * from pg_temp.smoke('agent_user updates nordea_feed',        'deny', 'update nordea_feed set result = result where false');
reset role;

set role agent_cm;
create temp table smoke_cm as
  select * from pg_temp.smoke('agent_cm reads agent_cm_records',       'allow', 'select 1 from agent_cm_records limit 1')
  union all select * from pg_temp.smoke('agent_cm writes agent_cm_records', 'allow', $$insert into agent_cm_records (user_id, table_name, id, data) values ('smoke','smoke','smoke','{}'::jsonb)$$)
  union all select * from pg_temp.smoke('agent_cm reads agent_user_records',   'deny', 'select 1 from agent_user_records limit 1')
  union all select * from pg_temp.smoke('agent_cm reads agent_nordea_records', 'deny', 'select 1 from agent_nordea_records limit 1')
  union all select * from pg_temp.smoke('agent_cm reads abel_records',         'deny', 'select 1 from abel_records limit 1')
  union all select * from pg_temp.smoke('agent_cm reads nordea_feed',            'deny', 'select 1 from nordea_feed limit 1')
  union all select * from pg_temp.smoke('agent_cm updates nordea_feed',          'deny', 'update nordea_feed set result = result where false');
reset role;

set role agent_nordea;
create temp table smoke_nordea as
  select * from pg_temp.smoke('agent_nordea reads agent_nordea_records',  'allow', 'select 1 from agent_nordea_records limit 1')
  union all select * from pg_temp.smoke('agent_nordea writes agent_nordea_records', 'allow', $$insert into agent_nordea_records (user_id, table_name, id, data) values ('smoke','smoke','smoke','{}'::jsonb)$$)
  union all select * from pg_temp.smoke('agent_nordea reads agent_user_records', 'deny', 'select 1 from agent_user_records limit 1')
  union all select * from pg_temp.smoke('agent_nordea reads agent_cm_records',   'deny', 'select 1 from agent_cm_records limit 1')
  union all select * from pg_temp.smoke('agent_nordea reads abel_records',       'deny', 'select 1 from abel_records limit 1')
  union all select * from pg_temp.smoke('agent_nordea reads nordea_feed',        'allow', 'select 1 from nordea_feed limit 1')
  union all select * from pg_temp.smoke('agent_nordea updates nordea_feed',      'allow', 'update nordea_feed set result = result where false');
reset role;

set role anon;
create temp table smoke_anon as
  select * from pg_temp.smoke('anon reads agent_user_records',   'deny', 'select 1 from agent_user_records limit 1')
  union all select * from pg_temp.smoke('anon reads agent_cm_records',     'deny', 'select 1 from agent_cm_records limit 1')
  union all select * from pg_temp.smoke('anon reads agent_nordea_records', 'deny', 'select 1 from agent_nordea_records limit 1')
  union all select * from pg_temp.smoke('anon reads abel_records',         'deny', 'select 1 from abel_records limit 1')
  union all select * from pg_temp.smoke('anon reads nordea_feed',          'deny', 'select 1 from nordea_feed limit 1');
reset role;

-- clean up the smoke rows (back as the owner)
delete from agent_user_records   where user_id = 'smoke';
delete from agent_cm_records     where user_id = 'smoke';
delete from agent_nordea_records where user_id = 'smoke';

select * from smoke_user
union all select * from smoke_cm
union all select * from smoke_nordea
union all select * from smoke_anon
order by 1;
