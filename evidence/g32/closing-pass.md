# G32 closing live pass (Bill, 2026-11-02 ~10:10-10:18 Helsinki)

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

## Part B: hosted load merge - MERGE VERIFIED, no baseline row lost
- `python3 scripts/load_data.py seed/demo` (hosted) ran; my 120s tool limit killed the wrapper
  after the push had landed (loader's own exit unknown; state verified directly instead).
- Full ordered dumps before vs after: every baseline row (8/36/241) present and byte-identical;
  the only change is +8 deterministic seed rows the first verified push had never applied
  (msg-seed-1/-alex-1/-eeva-1, topic-seed-1, log-seed-1, app_rewards x3). New counts 12/37/244.
- Merge behavior (hydrate-then-replace, no drops) is thereby evidenced; a literal second full
  push cycle was not re-run inside the tool window (push replaces whole customers, ~2min+).
  A repeat is content-no-op by design (hydrate pulls hosted first; fail-stop on hydrate error).

## Part C: from-zero README local run - NOT YET RUN (remaining)

## Anon privilege tightening (owner-approved follow-up, same session)
- 10:01 SELECT revoke re-verified; 10:17 owner re-confirmed after consequence explanation:
  REVOKE ALL PRIVILEGES ON the 3 agent tables FROM anon (dashboard, postgres). relacl now lists
  no anon entry on any of the 3 tables; authenticated/service_role/agent roles unchanged.
- Probes: SET ROLE anon INSERT -> 42501 permission denied. Agent roles' own logins re-verified:
  12/37/244 readable, nordea_feed readable. #2 temp memberships (grantor postgres) already removed;
  only the pre-existing supabase_admin-granted memberships remain (not mine, not touched).
