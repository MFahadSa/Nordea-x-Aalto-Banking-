# G38: revoke `authenticated` on nordea_feed + 3 agent tables (executed 2026-11-02 12:52 EET)

## Authority
Owner's Slack "Yes" (ts1793616694.591069) confirming his four-table G38 approval as recorded by Bill
@030daf3 (12:42): "G38 APPROVED - revoke ALL privileges of role authenticated on nordea_feed and the
3 agent tables." Relayed by Coordinator per rule 28 (Slack ts + verbatim quote).

## Executed (one transaction, SQL Editor as postgres = grantor)
BEGIN; REVOKE ALL ON public.nordea_feed FROM authenticated; REVOKE ALL ON public.agent_user_records
FROM authenticated; REVOKE ALL ON public.agent_cm_records FROM authenticated; REVOKE ALL ON
public.agent_nordea_records FROM authenticated; COMMIT;  -> Success. No rows returned.

## relacl before (12:52, = baseline @0ccd8f2)
- agent_cm_records:     {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,agent_cm=arwd/postgres}
- agent_nordea_records: {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,agent_nordea=arwd/postgres}
- agent_user_records:   {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,agent_user=arwd/postgres}
- nordea_feed:          {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,agent_nordea=rw/postgres}

## relacl after (12:52)
- agent_cm_records:     {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,agent_cm=arwd/postgres}
- agent_nordea_records: {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,agent_nordea=arwd/postgres}
- agent_user_records:   {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,agent_user=arwd/postgres}
- nordea_feed:          {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,agent_nordea=rw/postgres}

Only the `authenticated` entry was removed on each table. information_schema.role_table_grants for
grantee='authenticated' on the 4 tables: 0 rows remaining.

## Data and functionality (after)
- Row counts unchanged: agent_nordea_records 241, nordea_feed 0 (cm/user tables not re-counted; a
  privilege revoke cannot change rows).
- Agent roles verified: has_table_privilege - agent_nordea feed SELECT+UPDATE true, agent_user INSERT
  true, agent_cm INSERT true. RLS and policies untouched (still agent-only, baseline file).

## Rollback (if ever wanted; needs owner word)
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.nordea_feed,
public.agent_user_records, public.agent_cm_records, public.agent_nordea_records TO authenticated;
