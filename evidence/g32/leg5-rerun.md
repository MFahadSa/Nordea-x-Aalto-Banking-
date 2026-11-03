# leg5-rerun.md - role-smoke 25-check rerun (2026-11-02, Coordinator)

Rerun of `supabase/role-smoke.sql` checks against hosted project zyuzexnawvelyyzmydog.
Executor: Coordinator (instinct-christina), owner-approved isolated testing (smoke rows only).

## Why not the original script in the SQL Editor

The SQL Editor session is postgres and postgres IS a member of agent_cm/agent_nordea/
agent_user/anon/authenticated (verified live in pg_auth_members, admin_option=true),
yet `SET ROLE <any agent role>` fails: ERROR 42501 "permission denied to set role".
This is a Supabase platform restriction on SET ROLE, not a missing grant, so no grant
was added (owner decision avoided - no privilege widening needed).

Equivalent execution, honestly scoped:
- Sections agent_user / agent_cm / agent_nordea: run via DIRECT LOGIN as each role
  (psql, pooler, same checks verbatim from role-smoke.sql). Real login path, equal or
  stronger isolation evidence than SET ROLE.
- anon section: run via PostgREST with the project publishable key
  (sb_publishable_..., the real public client path). Read-only GETs, matching the
  script's read-only anon checks. abel_records absent counts as deny per the script.

## agent_user section (direct login)
```
=== role-smoke leg 5: agent_user section (direct login equivalent of role-smoke.sql) ===
CREATE FUNCTION
              check_name               | expected | result 
---------------------------------------+----------+--------
 agent_user reads abel_records         | deny     | PASS
 agent_user reads agent_cm_records     | deny     | PASS
 agent_user reads agent_nordea_records | deny     | PASS
 agent_user reads agent_user_records   | allow    | PASS
 agent_user reads nordea_feed          | deny     | PASS
 agent_user updates nordea_feed        | deny     | PASS
 agent_user writes agent_user_records  | allow    | PASS
(7 rows)

DELETE 1
=== post-cleanup check (user): smoke rows remaining ===
0
```

## agent_cm section (direct login)
```
=== role-smoke leg 5: agent_cm section (direct login equivalent of role-smoke.sql) ===
CREATE FUNCTION
             check_name              | expected | result 
-------------------------------------+----------+--------
 agent_cm reads abel_records         | deny     | PASS
 agent_cm reads agent_cm_records     | allow    | PASS
 agent_cm reads agent_nordea_records | deny     | PASS
 agent_cm reads agent_user_records   | deny     | PASS
 agent_cm reads nordea_feed          | deny     | PASS
 agent_cm updates nordea_feed        | deny     | PASS
 agent_cm writes agent_cm_records    | allow    | PASS
(7 rows)

DELETE 1
=== post-cleanup check (cm): smoke rows remaining ===
0
```

## agent_nordea section (direct login)
```
=== role-smoke leg 5: agent_nordea section (direct login equivalent of role-smoke.sql) ===
CREATE FUNCTION
                check_name                | expected | result 
------------------------------------------+----------+--------
 agent_nordea reads abel_records          | deny     | PASS
 agent_nordea reads agent_cm_records      | deny     | PASS
 agent_nordea reads agent_nordea_records  | allow    | PASS
 agent_nordea reads agent_user_records    | deny     | PASS
 agent_nordea reads nordea_feed           | allow    | PASS
 agent_nordea updates nordea_feed         | allow    | PASS
 agent_nordea writes agent_nordea_records | allow    | PASS
(7 rows)

DELETE 1
=== post-cleanup check (nordea): smoke rows remaining ===
0
```

## anon section (PostgREST, publishable key, read-only)
```
anon GET agent_user_records    -> HTTP 401 {"code":"42501","message":"permission denied for table agent_user_records"}   PASS (deny)
anon GET agent_cm_records      -> HTTP 401 {"code":"42501","message":"permission denied for table agent_cm_records"}     PASS (deny)
anon GET agent_nordea_records  -> HTTP 401 {"code":"42501","message":"permission denied for table agent_nordea_records"} PASS (deny)
anon GET abel_records          -> HTTP 404 {"code":"PGRST205","message":"table not found"}                              PASS (deny, table absent)
anon GET nordea_feed (extra)   -> HTTP 200 [] (privilege granted per G37, RLS filters all rows: zero rows visible)
```

## Result: 25/25 PASS
21/21 direct-role checks PASS + 4/4 anon checks PASS. Plus the extra nordea_feed anon
probe: zero rows visible (RLS) despite the latent excessive table privilege (G37).

## Cleanup
- Each role deleted its own smoke row (DELETE 1 x3); post-checks show 0 smoke rows
  in agent_user_records / agent_cm_records / agent_nordea_records (nordea_feed probe
  was read-only; preflight showed 0 smoke rows everywhere before the run).
- No schema changes. pg_temp.smoke() functions died with their sessions.
- The two failed SQL Editor attempts failed at the first SET ROLE, before any write.
