# Fresh hosted --init failure: cause and fix - 2026-11-03 (evidence)

## Symptom (hosted, temp project, 2026-11-03)

`python3 scripts/load_data.py --init` on a fresh hosted Supabase project (PostgreSQL 17.11,
psql 14.24, session pooler, code 8cbe126 unmodified) exited 1:
`psql:<stdin>:141: ERROR: permission denied to set role "agent_user"` - the first `set role`
of supabase/role-smoke.sql (line 141 includes the generated role-create prefix). Tables and
roles were created; `pg_has_role(postgres, role, 'MEMBER')` was true; postgres had CREATEROLE,
not superuser.

## Cause (PostgreSQL 16+ documented behavior)

Since PG 16, when a non-superuser with CREATEROLE (hosted Supabase `postgres`) creates a role,
the role is granted back to the creator as if by `GRANT created TO creator WITH ADMIN TRUE,
SET FALSE, INHERIT FALSE` (postgresql.org docs, 21.2 Role Attributes). The membership exists
(hence MEMBER true) but SET ROLE is denied (SET FALSE). Local proofs ran as a real superuser,
which bypasses the check, so the gap never showed locally. `pg_has_role(..., 'MEMBER')` does
not test the SET option.

## Local reproduction (real server, this worktree)

Embedded PostgreSQL 18.6 (zonky binary, same post-16 grant mechanism as hosted 17.11),
emulated Supabase defaults (`anon`, `service_role` pre-created; `anon` granted to owner with
defaults; owner = non-superuser LOGIN CREATEROLE). SSL downgraded via psql shim, as in
fresh-init-2026-11-03.md; existing hosted project untouched; no credentials in this file.

- Pre-fix (8cbe126): identical failure, `psql:<stdin>:141: ERROR: permission denied to set
  role "agent_user"`. pg_auth_members showed ADMIN=t, INHERIT=f, SET=f, grantor=bootstrap
  superuser for all three agent roles - the documented auto-grant, directly observed.
- Post-fix, same database (roles pre-existing): rc=0, smoke 26/26 PASS, existing role
  credentials untouched.
- Post-fix, fresh database from empty: rc=0, standalone role-smoke.sql rerun 26 PASS / 0 FAIL.
  pg_auth_members afterwards: the bootstrap auto-grant rows unchanged, plus one new row per
  agent role with grantor=owner, SET=t - the documented mechanism (an ADMIN holder grants the
  role back to itself; the bootstrap grant cannot be altered, so this is a second grant row).
- scripts/test-load-init.py (fake-psql pins) extended and ALL PASS: every agent role is
  granted back to the owner WITH SET TRUE on PG16+, including roles that already existed;
  existing-role no-rotation behavior unchanged.

## Fix (scripts/load_data.py --init)

Read server_version_num; on PG >= 16 emit `grant agent_<x> to current_user with set true;`
for all three agent roles (unconditional, idempotent; covers roles created earlier without
the SET option). On PG < 16 emit a plain `grant` (no SET option exists there; membership alone
permits SET ROLE and WITH SET would not parse). Version-detection failure refuses to
provision. No change to agent-role table grants, RLS, passwords, or .env.local handling.

## Residual limits

- Not yet re-run against a fresh HOSTED Supabase project (owner/coordinator gate): the `with
  set true` branch is validated against local PG 18.6, not hosted 17.11; `set role anon` on a
  fresh hosted project depends on Supabase-managed grants (observed here only emulated).
- PG < 16 branch not exercised locally (no PG14/15 server available); plain GRANT syntax is
  pre-16-compatible by construction.
- Nordea hosted flush, pooler per-role app operation, end-to-end backend TLS: still unproven,
  unchanged by this fix. Merge remains held.
