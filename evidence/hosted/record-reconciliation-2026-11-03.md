# Record reconciliation - 2026-11-03

Scope: factual roles, pickup state and holds, plus the separately reviewed v2
comment/pre-16 fake-psql assertion. No functional SQL change from 0b30a18, database
actions, protocol rewrite, turn change, exception, readiness certification or merge.

## Basis and observed branch

- Source owner channel: Slack DM D0CDS44F00K, formal takeover message
  `1793720929.858649` in thread `1793720924.312079`. It supersedes older role mappings,
  keeps existing handoff checks, preserves prior Bill verdicts and keeps merge held.
- Joe pickup head: `20bc11519ebef05bc5fa2b18c5c59e3146c16b45` changed only review.md (+10/-0).
  Before application, new `eb7b9c441ed3865ba21380c4b2c60c3fcb6ae12f` changes only
  review.md (+16/-1), adds Bill-QC pickup/probe claims and G69-G73, NOT accepted.
  Joe then added G74-G80 at `32f757173df0755d6a6d666dcefaadc9258b6263` (+7 review.md rows).
  These rows are preserved byte-for-byte; no owner claims inside them authorize this bundle.
  All messages and open rows are preserved; TURN and latest NEXT remain Telkomsel. Recheck the actual head before applying; preserve concurrent messages.
- Joe's original pickup remains unchanged. Context and protocol blocks are not edited.
  Older identity rules 20/23 and Coordinator no-turn rules conflict with the new assignment.
  This record does not resolve their mechanics or invent a Builder exception.

## Holds and provenance

- `0b30a18566f36b835c7e43e0134d3f8702cc6271`: proposed SET ROLE bootstrap fix. It was
  pushed while TURN remained Telkomsel. The Builder's coordinating side reports no established
  exception. The out-of-turn issue is preserved, not ratified by this record or a later test.
- Technical review and permission/protocol reconciliation are distinct gates. Proposed-fix
  acceptance, hosted rerun and merge remain HOLD; no readiness or hosted-pass claim.
- Coordinator execution report: fresh hosted init at `8cbe126` failed with permission denied
  to SET ROLE agent_user. The replacement disposable project was deleted, with cleanup
  verified by Coordinator; the existing project was untouched. Joe did not verify deletion.
- Independent technical review compares author evidence but has not independently reproduced
  its PostgreSQL server runs. The author-provided current PG18.6 transcript records
  is_superuser=f / CREATEROLE=t, pre-fix stdin141 failure and post-fix rc0 / 26 PASS;
  bootstrap rows unchanged, owner SET/INHERIT rows added. The harness emulates Supabase
  roles/defaults and disables SSL. The older PG16.2 run identity is not recorded. Do not
  summarize those newer runs as superuser-only, or as independently verified/hosted proof.
- Hosted fresh init, app-role pooler access, Nordea flush/restart and full backend/end-to-end
  TLS remain unproven. Client-to-pooler TLS observation is narrower than end-to-end proof.
- Joe pickup is recorded at `20bc115`. Bill-QC claims an independent current-session
  pickup and PG17.5 probes at `eb7b9c4`, with G69-G73 open and NOT accepted. Trusted-route
  confirmation of its owner quote/session is separate; this record does not authenticate it.
  G69/G71 recommendations need reconciliation with existing-option preservation and smoke
  dependencies; neither is implemented or closed here.

## Unchanged boundaries

No changes to the agreed role split, historical decisions, prior verdicts or functional SQL.
Technical review of this bundle covers only the membership comment and fake-psql
pre-16 assertion; no functional change or acceptance of 0b30a18 is implied.
All Bill-QC findings G69-G80 remain open.
Local checks: scripts/test-load-init.py ALL PASS, npm run check:review PASS, git diff --check PASS.
Author evidence is retained as author evidence in set-role-revision2-author-evidence-2026-11-03.md.
No protocol loop amendment, Builder-turn exception, history rewrite, revokes, rollback,
hosted execution or security/access action. The corrected Builder comment/pre-16 test draft is included without functional expansion;
it does not close any Bill-QC row or accept 0b30a18.
