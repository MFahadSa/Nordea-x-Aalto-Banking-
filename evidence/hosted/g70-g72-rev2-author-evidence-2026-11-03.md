# Historical Builder evidence, G70/G72 rev2

The following is the Builder's evidence statement at local draft creation, preserved unchanged.
Its LOCAL DRAFT, not committed, not pushed and 9fc1eb8 head labels describe that earlier state,
not the repository containing this copy. Local PG18.6 claims are author-produced narratives,
not independently reproduced server proof; no new raw SQL logs were supplied.
The author's 27/27 fake-pin count is not reproduced: the applier counted 26 PASS checks.
See g70-g72-rev2-application-2026-11-03.md for current application state and limits.

---

# G70/G72 corrected draft rev2 - evidence (LOCAL DRAFT, not committed, not pushed), 2026-11-03

Scope (Coordinator decision 19:23:40 + independent-diff verdict 19:33): corrected G70 preflight +
G72 pins as a local draft for independent review. G69 = B (default INHERIT; existing options
preserved). G71 cleanup DEFERRED (owner-grantor row snapshot = preservation PROOF ONLY; no revoke,
no restore, no cleanup code). G73 unratified; Bill rows G69-G80 stay OPEN. No hosted/live DB, no
merge, no push. Base: 9fc1eb8 (remote head). Files touched: scripts/load_data.py,
scripts/test-load-init.py ONLY. Diff: setrole-g70-g72-draft-NOT-committed.diff (uncommitted).
rev2 folds in the verdict's two small fixes plus the 19:33:38 correction (pre-16 refusal = loader
policy); no design change.

## rev2 changes over rev1

A. The preflight snapshot now prints the owner-grantor-row EXISTS bool explicitly:
   `og_row_exists=true(admin=false,inherit=true,set=false)` vs `og_row_exists=false` - an absent
   row is no longer indistinguishable from an all-false row. Pinned (fake) and shown live (real:
   scenario C prints the true-form, superuser run prints og_row_exists=false).
B. Refusal advice is version-specific: PG>=16 advises ADMIN OPTION or membership WITH SET TRUE;
   PG<16 advises ADMIN OPTION or plain membership and explicitly notes the server cannot parse
   WITH SET TRUE (pinned both directions).
C. Pre-16 refusal restated as conservative LOADER POLICY, not server incapability (Coordinator
   correction): comment and pre-16 refusal message now state that pre-16 a CREATEROLE role may
   grant/revoke membership in any non-superuser role WITHOUT ADMIN OPTION, and that this loader
   deliberately does not rely on those powers (grants only roles it created this run or holds
   direct ADMIN OPTION on, uniform across versions). Pinned. NO rolcreaterole capability expansion.
D. Documented nonblocking limit (comment at the skip decision): a role skipped on effective SET
   may still lack INHERIT/USAGE (SET TRUE with INHERIT FALSE), so role-smoke.sql's
   inheritance-based union can then fail LOUDLY after the schema step; the preflight predicts
   SET ROLE readiness only, not full smoke readiness. No functional change requested or made.

## PG15 sources actually read (excerpts)

- https://www.postgresql.org/docs/15/catalog-pg-auth-members.html - the PG15 pg_auth_members
  column list is exactly: roleid oid, member oid, grantor oid, admin_option bool ("True if member
  can grant membership in roleid to others"). No set_option / inherit_option columns exist pre-16;
  the pre-16 preflight therefore never references them.
- https://www.postgresql.org/docs/15/functions-info.html - pg_has_role: "Allowable privilege types
  are MEMBER and USAGE. MEMBER denotes direct or indirect membership in the role (that is, the
  right to do SET ROLE)". No SET privilege type exists pre-16; MEMBER (direct OR indirect) is the
  SET ROLE capability, which is what the pre-16 branch probes.
- https://www.postgresql.org/docs/15/sql-grant.html - GRANT on Roles: "If WITH ADMIN OPTION is
  specified, the member can in turn grant membership in the role to others... Database superusers
  can grant or revoke membership in any role to anyone. Roles having CREATEROLE privilege can
  grant or revoke membership in any role that is not a superuser." The last sentence is the basis
  for restating the pre-16 refusal as loader policy.
- (PG16+ side, from rev1: docs/16 functions-info - "SET denotes whether it is possible to change
  to the role using the SET ROLE command".)

## Behavior summary (unchanged from rev1)

VERSION FIRST (first query; unknown version refuses before anything else). One read-only all-role
preflight before ANY write or CREATE. PG>=16: effective SET via pg_has_role(current_user,
role_oid, 'SET') - covers direct, indirect, and superuser; oid form used because the name form
raises ERROR: role does not exist for a missing role (caught by real-server testing). PG<16:
MEMBER + admin_option only. Admin-capable = direct ADMIN OPTION any grantor OR superuser;
unsupported indirect ADMIN -> conservative refusal with accurate message. Skip on effective SET;
create+grant missing roles; grant missing SET only when admin-capable. PG>=16 grant:
`grant <role> to current_user with set true;` (no INHERIT/ADMIN clause; omitted options retained
on existing rows); PG<16: plain grant. No REVOKE anywhere.

## Fake-psql pins - 27/27 ALL PASS

G64 pins retained. G70/G72 pins: VERSION FIRST ordering; single read-only preflight before write
stream; missingSET+ADMIN -> exactly one `with set true`, no INHERIT/ADMIN clause; missing role ->
create+grant; no REVOKE; snapshot line with explicit og_row_exists bool (true-form and
absent-form); effective-SET skip; superuser skip; noADMIN zero-write refusal incl. WITH SET TRUE
advice (PG>=16); version-probe failure zero queries/writes; preflight failure refusal; PG<16
member skip / plain grants / no WITH options; PG<16 probe references no set_option/'SET'; PG<16
universal refusal zero-write; PG<16 advice wording (plain membership, never WITH SET TRUE advice,
explicit conservative-loader-policy statement).

## Real-server evidence (DISPOSABLE local PG 18.6, port 55443; separate from fake pins)

- C missingSET+ADMIN (og row forced set=f, run as owner): snapshot printed
  `og_row_exists=true(admin=false,inherit=true,set=false)`; rc=0; smoke 26 rows PASS;
  pg_auth_members diff = ONLY that row's set f->t (admin/inherit retained, all other rows
  byte-identical). Re-verified on rev2 code.
- E indirect SET skip: direct og row revoked, SET via mid_chain (SET TRUE chain, pg_has_role = t);
  loader skipped, no new row; smoke green.
- F noADMIN refusal: rc=1, names the role, accurate message, zero writes; state restored after.
- D missing role: role dropped; created + `grant agent_nordea to current_user with set true;`;
  catalog shows bootstrap row (grantor=postgres, t/f/f) + owner-grantor row (grantor=owner,
  f/t/t); NORDEA_DB_URL written 0600, value not printed; smoke 26 rows PASS.
- A all-skip: pg_auth_members BYTE-IDENTICAL before/after; smoke 26 rows PASS.
- B superuser: superuser=true for all roles, `og_row_exists=false` printed; no grants/creates;
  smoke green. Re-verified on rev2 code.

Disposable-cluster adaptations (NOT in the deliverable): run copy used PGSSLMODE=disable
(deliverable keeps require); `grant create on schema public to owner` (PG15+ local default);
helper role mid_chain on the disposable cluster only. Throwaway passwords only.

## Limits

- No pre-16 server exists here: PG<16 branch pinned at fake level + the PG15 doc excerpts above;
  no real pre-16 proof claimed.
- No hosted Supabase execution (out of scope); hosted verification remains the Coordinator's.
- Indirect ADMIN chains deliberately unsupported -> conservative refusal (>=16: capability;
  pre-16: loader policy).
- Nonblocking limit (D above): preflight predicts SET ROLE readiness, not full smoke readiness.
- 0b30a18 remains out-of-turn/unratified (G73); draft uncommitted on 9fc1eb8; refresh head before
  any eventual Coordinator application.
