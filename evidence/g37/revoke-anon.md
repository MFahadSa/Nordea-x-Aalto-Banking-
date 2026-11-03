# g37-revoke-anon.md - G37 narrow anon revoke on nordea_feed (2026-11-02 12:08 EET)

Owner approval: Slack 12:07 EET "Approve" to the exact proposal (remove anonymous role's extra
permissions on nordea_feed; verify first; leave agent roles unchanged). Relayed and executed by
Coordinator. Executor: SQL Editor as postgres (grantor of the grant).

## Change (single statement, in a transaction)
REVOKE ALL ON public.nordea_feed FROM anon;

## relacl before -> after
before: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,agent_nordea=rw/postgres}
after:  {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,agent_nordea=rw/postgres}
Only the anon entry was removed. authenticated/service_role/postgres grants and agent_nordea=rw untouched.

## Verification
- anon SELECT: f, anon TRUNCATE: f (has_table_privilege, live).
- Effective anon probe: PostgREST GET nordea_feed with the publishable key now returns HTTP 401
  42501 "permission denied for table nordea_feed" (before: 200 [] via RLS). Denial moved from
  row-filter level to privilege level.
- Data unchanged: nordea_feed still 0 rows; no other table touched; RLS state untouched.
- Agent functionality: agent_nordea keeps its original rw grant (SELECT/UPDATE - unchanged from before G37).

## Rollback (if ever needed)
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.nordea_feed TO anon;
(exact restoration of the removed aclitem anon=arwdDxtm/postgres)

## Follow-up observation (out of scope, not changed)
authenticated holds the same full grant (authenticated=arwdDxtm/postgres). G37 covered anon only;
flagging for Bill/owner awareness, no action taken.
