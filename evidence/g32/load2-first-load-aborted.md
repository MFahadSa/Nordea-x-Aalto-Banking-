# load2-first-load-aborted.md - hosted load2demo run: 1st load done, owner hold, verified restore (2026-11-02)

Timeline (all Europe/Helsinki):
- 11:44 owner: app idle, away until 15:00 (Slack). Approved isolated dedicated-uid route proceeds.
- 11:47 preflight baseline taken (below); load2demo absent everywhere; abel_records absent hosted (42P01).
- 11:48:07 first attempt aborted by the loader's own G20 guard: hydrate failed (TLS), hosted untouched.
- 11:48:18 LOAD 1 completed (sslmode fix only): pushed load2demo -> 3 user / 10 cm / 218 nordea rows.
- 11:48:20 owner HOLD (Slack): hold the hosted load2demo run + G37 revoke until his go.
- 11:49:35 abort path executed: scoped cleanup --clear --only-user load2demo (G36-fixed route).
- 11:50:00 restore verification: all checks below identical to baseline. No 2nd load was ever run.

## 229 records vs 231 rows - reconciled (not a discrepancy)
Seed records (229: 5 cabinetEntries, 7 entryHistory, 216 transactions, 1 users) expand to
store rows at load time (load_data.py to_rows; push counts rowsOf over TABLE_IDS tables):
- user: 3 rows (kv=1, goals=2 - the demo user carries 2 embedded goals)
- cm: 10 rows (entries=3 - 5 cabinetEntry records upsert to 3 unique entry ids, history=7)
- nordea: 218 rows (kv=1, transactions=216, app_rewards=1)
Verified locally with --target file: 3+10+218 = 231 rows from the same 229 records.

## Baseline == post-cleanup (live per-role reads, byte-identical)
Hash method: md5 of the whole-row text serialization (all columns incl updated_at),
aggregated as md5 over the sorted per-row hashes - a multiset-identity proof, order-canonical.

| table | count | full-row hash | max(updated_at) UTC |
|---|---|---|---|
| agent_user_records | 8 | ef2e8bd05768f2fe1d0e57f143e9fa51 | 2026-11-02 08:15:11.543501 |
| agent_cm_records | 36 | 5ff5e6cde58276b8f1ac5348f539f644 | 2026-11-02 08:15:16.044637 |
| agent_nordea_records | 241 | 854ec8e68e45b701e8653362649f1300 | 2026-11-02 08:15:22.997797 |
| nordea_feed | 0 | (empty) | - |

Identical before load 1 and after cleanup; load2demo_rows = 0 in both snapshots.
No concurrent-writer signs (hashes match baseline exactly, no updated_at movement).

## Scope notes
- Plumbing kinds were excluded by the route; abel_records does not exist hosted, so no plumbing writes were possible.
- The operator-side hydrate mirror (all hosted rows) was local-only and was wiped after the run; never exported.
- Guard (scripts/check_review_lines.py) run against head 5d87dfd4: PASS (TURN matches NEXT, CMP limits ok).
- State: HELD. Resume only on the owner's explicit go; leg-5 verdict additionally needs the owner's own in-repo word to Bill.
