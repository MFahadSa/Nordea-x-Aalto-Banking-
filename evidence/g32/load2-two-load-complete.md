# load2-two-load-complete.md - hosted load2demo two-load test, full pass (2026-11-02)

Owner go: Slack 12:03 EET ("You can do the load2demo testing"), route per Telkomsel #c4 +
Bill 11:31 acceptance + Coordinator hash bar. Prior aborted run evidence: load2-first-load-aborted.md.

## Timeline (Europe/Helsinki)
- 12:03:36 fresh baseline (identical to 11:47 baseline - no writer activity between runs), load2demo absent.
- 12:03:47 LOAD 1: pushed load2demo 3 user / 10 cm / 218 nordea rows (229 seed records, see reconciliation in load2-first-load-aborted.md).
- 12:04:58 verify: original-row full hashes + max(updated_at) identical to baseline in all 3 tables.
- 12:05:08 LOAD 2 (the check): same 3/10/218 pushed; load2demo counts UNCHANGED (3/10/218) - no duplication;
  second load replaced only its own rows (identical content, updated_at refreshed by design).
  Original rows byte-identical incl metadata.
- 12:06:22 scoped cleanup --clear --only-user load2demo: all load2demo rows removed.
  (First cleanup attempt ran without role URLs in a fresh shell - loader refused safely, retried immediately; clear is idempotent.)
- Final verify: BYTE-IDENTICAL to the fresh baseline.

## Numbers
| table | baseline count | after load 2 (orig) | load2demo rows L1 | L2 | after cleanup |
|---|---|---|---|---|---|
| agent_user_records | 8 | 8 (hash ef2e8bd...) | 3 | 3 | 8, hash ef2e8bd... |
| agent_cm_records | 36 | 36 (hash 5ff5e6c...) | 10 | 10 | 36, hash 5ff5e6c... |
| agent_nordea_records | 241 | 241 (hash 854ec8e...) | 218 | 218 | 241, hash 854ec8e... |
max(updated_at) of original rows stayed 08:15:1xZ UTC at every checkpoint.
Hash method: md5 of whole-row text (all columns incl updated_at), aggregated over sorted per-row hashes.

## Scope
abel_records absent hosted throughout (no plumbing loaded). G37 untouched (owner hold stands).
Local hydrate mirror and remapped seed wiped after the run. Result: hosted literal second load = idempotent,
zero effect on other customers, scoped cleanup restores byte-identical state.
