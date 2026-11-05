# G32 closing live pass (Bill, 2026-11-02 ~10:10-10:22 Helsinki)

Scope approved by the owner in chat (10:01): demo-only, mock LLM, test-record-only writes/deletes,
original data unchanged, from-zero README local with hosted read-only. Project zyuzexnawvelyyzmydog.
No secrets in this file.

## Part A: feed ingestion / mark-applied - VERIFIED, baseline restored
- Dedicated smoke identity g32smoke (no baseline customer touched): 1 kv/profile row in
  agent_user_records (as agent_user) + 1 nordea_feed row id=1 (incremental, 1 tx, bankId
  g32smoke-tx-1) inserted via the dashboard operator path (agent_nordea holds SELECT/UPDATE only
  on nordea_feed - permission denied on INSERT, as designed).
- App run hosted with LLM_PROVIDER=mock: the feed watcher applied row 1 automatically;
  applied_at set, result "Applied: Updated 1 new transaction." POST /api/nordea-data/check confirmed.
- Applied writes landed tagged g32smoke only: nordea tx + import batch, 4 cm context/round rows.
- Cleanup: all g32smoke rows deleted (nordea 2, user 1, cm 4), feed row deleted via dashboard
  (agent_nordea has no DELETE on nordea_feed - as designed).
- Restore PROVEN: sha256 of full ordered dumps of all 3 tables identical before/after; feed empty.
- Note: node-pg needed uselibpqcompat=true in local .env (leg-3 known fix; psql strips it). Not committed.

## Part B: hosted load - OUT OF SCOPE, additions cleaned up, original baseline restored
- `python3 scripts/load_data.py seed/demo` (hosted) exceeded the approved demo/test-only scope:
  its whole-customer push added 8 deterministic seed rows to existing customer stores
  (msg-seed-1/-alex-1/-eeva-1, topic-seed-1, log-seed-1, app_rewards x3). The wrapper was killed
  by a 120s tool limit; it cannot prove completion, so state was verified directly.
- Isolation established before any delete: full ordered pre/post dumps differ ONLY in those 8
  rows; all 8 stamped 2026-11-02 08:14-08:15 UTC (this run's window); no other writer active.
- Cleanup: deleted exactly those 8 rows by full (user_id, table_name, id) keys (4 user, 1 cm,
  3 nordea). Post-cleanup: counts back to 8/36/241 and sha256 of full ordered data dumps
  byte-identical to the pre-load baseline. Caveat: the push had bumped updated_at on the replaced
  customers' surviving rows (metadata only; data content verified unchanged).
- The "second hosted load must merge" check is thereby NOT completed - it needs a bounded,
  owner-approved route (the push replaces whole customers and exceeds sandbox time limits).

## Part C: from-zero README local run - VERIFIED (hosted untouched)
- Fresh clone of 8c499eb, no .env, npm install --legacy-peer-deps (0 vulnerabilities),
  `LLM_PROVIDER=mock python3 scripts/load_data.py seed/demo --target file`: 255 local records.
- Server (mock): /, /arch.html, /dev-monitor.html all 200; POST /api/selftest 13/13 pass.
- Fully local (file target); no hosted reads or writes.

## Anon privilege tightening (owner-approved follow-up, same session)
- 10:01 SELECT revoke re-verified; 10:17 owner re-confirmed after consequence explanation:
  REVOKE ALL PRIVILEGES ON the 3 agent tables FROM anon (dashboard, postgres). relacl now lists
  no anon entry on any of the 3 tables; authenticated/service_role/agent roles unchanged.
- Probes: SET ROLE anon INSERT -> 42501 permission denied. Agent roles' own logins re-verified:
  tables readable, nordea_feed readable. #2 temp memberships (grantor postgres) already removed;
  only the pre-existing supabase_admin-granted memberships remain (not mine, not touched).
