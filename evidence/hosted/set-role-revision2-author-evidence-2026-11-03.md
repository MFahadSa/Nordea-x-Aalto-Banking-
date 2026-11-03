# Historical author evidence (captured before this bundle)

The text below is the Builder's statement at draft creation, preserved unchanged.
Its "DRAFT", "NOT committed" and "working-tree only" labels describe that earlier
author state, not the state of the repository containing this copy. Author validation
claims are attributed, not independently reproduced or hosted proof. This bundle
includes only the reviewed comment/test changes, with no functional SQL change from
0b30a18 and no Bill-QC finding closure.

---

# --init SET ROLE fix - corrected narrow revision DRAFT v2 (NOT committed), 2026-11-03 - project test evidence

Base: commit 0b30a18566f36b835c7e43e0134d3f8702cc6271 on instinct-prototype-v3. Working-tree only;
nothing committed or pushed. This v2 SUPERSEDES the earlier draft: per the Coordinator's scope correction,
explicit INHERIT FALSE is DROPPED (it would have flipped a pre-existing same-grantor membership's INHERIT
option in the existing-project state, violating preserve-existing-options), and the accompanying
role-smoke.sql change is REMOVED (no longer needed once INHERIT keeps its default).

## Draft contents (exactly the corrected scope)

1. scripts/load_data.py: comment corrected to describe accurately what the PG>=16
   `grant agent_<x> to current_user with set true;` does: either adds a PERSISTENT, cluster-level membership
   row (grantor = owner; SET TRUE; INHERIT unspecified = member role's default), or, when a same-grantor
   membership already exists, raises only SET to TRUE while all other options are retained (PG16 GRANT
   semantics). Survives session and setup run until explicitly revoked. Created via the owner's existing
   ADMIN OPTION (documented mechanism). No functional change vs the reviewed 0b30a18 clause.
2. scripts/test-load-init.py: new pre-16 fake-psql branch (server_version_num 150006) asserting plain
   `grant agent_<x> to current_user;` with NO WITH options; PG16+ assertion unchanged (`with set true`).

No other changes. P1/P2 proposals NOT included (await separate assignment). No INHERIT hardening included
(any future added-row-only INHERIT FALSE would separately require the smoke session_user-grant companion,
since the smoke's final union reads other roles' temp tables through inheritance - recorded fact from the
dropped v1 draft: `psql:<stdin>:195: ERROR: permission denied for table smoke_user`).

## Harness

Throwaway local PostgreSQL server 18.6 (same post-16 grant mechanism as hosted 17.11), psql 14.24 client,
owner = non-superuser LOGIN + CREATEROLE (emulates hosted Supabase `postgres`), Supabase default roles
`anon`/`service_role` pre-created, `anon` granted to owner with defaults, PGSSLMODE downgraded
require->disable for localhost (declared deviation). Throwaway local passwords only; no hosted or existing
project connected; no live resources.

## Recorded validation outputs (corrected draft)

Fresh empty database:
```
python3 scripts/load_data.py --init  ->  exit 0, "Setup applied ... Smoke output: ... (26 rows)"
pg_auth_members: bootstrap auto-grant rows unchanged (ADMIN=t, INHERIT=f, SET=f, grantor=bootstrap);
one added row per agent role: grantor=owner, ADMIN=f, INHERIT=t (member default), SET=t
```

Scenario B regression (owner-created roles + pre-existing plain owner grant = the existing-project state):
```
pg_auth_members diff before/after --init: IDENTICAL (no row added, no option changed)
exit 0; standalone role-smoke.sql rerun: 26 PASS, 0 FAIL
```

Pin tests: scripts/test-load-init.py ALL PASS, including the new pre-16 branch and the unchanged
no-rotation / no-password-in-output pins.

## Residual (unchanged)

Hosted rerun must observe `set role anon` against Supabase's managed grants; PG<16 branch covered by
fake-psql pin only; hosted 17.11 specifically (local 18.6); Nordea hosted flush, per-role pooler URLs,
end-to-end backend TLS remain open. Merge held.
