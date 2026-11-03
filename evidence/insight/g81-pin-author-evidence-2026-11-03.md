> ATTRIBUTION WRAPPER (added by Telkomsel at application, 2026-11-03 ~19:51 EET): the text below
> this wrapper is the Builder side's LOCAL DRAFT evidence, quoted verbatim in its corrected form
> (26 pins; only test:insight run by the author). It is kept for provenance; the authoritative
> applied full-baseline evidence is evidence/insight/g81-pin-fix-2026-11-03.md. Its internal
> "Coordinator assignment" wording is the author's own framing, not an authority record.

# G81 stale insight pin - LOCAL DRAFT evidence (not committed, not pushed), 2026-11-03

Scope (Coordinator assignment 19:44 via Telkomsel): G81 M - test-insight-cards.ts:175 expected the
removed 'select rolname from pg_roles' probe text after the reviewed G70/G72 revision replaced that
probe with the read-only pg_auth_members preflight. Update the pin preserving intent; do not delete
coverage. Base: 8af24dc (remote head, refreshed this run). File touched:
scripts/test-insight-cards.ts ONLY (one check line). Diff:
g81-insight-pin-draft-NOT-committed.diff (uncommitted).

## Judgment: behavior vs SQL text

The pin is SQL-text-coupled (suite style: neighboring pins assert source strings such as
'kept.append(line)'). Its INTENT: --init must detect existing roles via a catalog probe BEFORE
provisioning so a rerun never rotates credentials. The reviewed G70/G72 preflight performs exactly
that detection inside the all-role preflight (`left join pg_roles pr on pr.rolname = v.rolname` with
`(pr.oid is not null)` as role_exists, consumed by `existing = {r for r in roles_all if
pre[r]["exists"]}` which gates the never-rotate logic). The referenced SQL text changed
intentionally and was independently verified at d589861, so the correct update is to point the pin
at the new probe text while keeping the same behavioral claim - no coverage deleted, no behavior
changed. The check name now says "via a read-only pg_roles preflight" and is tagged G81.

## Baseline and result (full mock suite as the repo defines it: npm run test:insight =
tsx scripts/test-insight-cards.ts && node scripts/run_python.mjs scripts/test-load-init.py)

- Baseline (stash applied, pin reverted): 52 passed, 1 failed - matches Bill's G81 reading.
- After the one-line pin update: `53 passed, 0 failed` for test-insight-cards.ts AND `ALL PASS`
  (26 pins) for test-load-init.py; suite exit code 0. No paid calls; no network beyond npm ci from
  the existing package-lock.json (local dev dependencies).
- COUNT NOTE (supersedes the earlier 27 claim): test-load-init.py contains exactly 26 pins in both
  the delivered draft and the applied d589861 (pin-name lists extracted and diffed: identical). The
  earlier "27" was a grep artifact that also counted the "ALL PASS" summary line.
- SCOPE NOTE: only `npm run test:insight` (test-insight-cards.ts + test-load-init.py) was run. The
  remaining project test sets (test, test:arch, test:adapter, test:env, test:selftest, test:load,
  test:arch-ui, test:d9, test:arch-events, test:customer-id, check:feed, check:review, lint) were
  NOT run here; the Coordinator's applier owns that full project baseline.

## Limits

No push, no row closure, no hosted/merge; all other findings G69-G80 remain OPEN and untouched;
G73/0b30a18 unratified. No G70/G72 functional work was needed or done. The suite run is local
mock/fake only; no live or hosted database was contacted.
