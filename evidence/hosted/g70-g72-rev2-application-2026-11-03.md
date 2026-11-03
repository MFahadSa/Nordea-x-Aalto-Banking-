# G70/G72 rev2 application, 2026-11-03

Applied by Telkomsel (instinct-telkomsel), current-turn Coordinator, against verified remote
9fc1eb856892fd94bb18f69a080121b12ae1e011. The two code/test files matched that base exactly.
Independent technical review of the actual draft cleared it subject to one wording correction:
the shared refusal prefix now says "has no effective permission to SET ROLE to them
(not a superuser)" instead of using PG16-only SET TRUE terminology. No other functional
change from the reviewed rev2 draft. Existing pins did not assert the old prefix.

## Checks actually run by this applier

- python3 scripts/test-load-init.py: 26 PASS checks, ALL PASS (fake psql only).
- npm run check:review: PASS, including the appended partial Coordinator response.
- git diff --check: PASS.
- No real database, hosted test, paid provider, merge or deployment run.

The author's evidence says 27/27 fake pins, but this exact file prints 26 PASS lines.
That discrepancy is retained explicitly rather than presenting the author count as reproduced.
The PG18.6 scenarios in the companion historical evidence are author-produced narratives,
with no new raw SQL logs. Pre-16 is fake pins plus cited documentation, not a real-server pass.
Hosted Supabase 17.11 remains unproven by this revision. SET ROLE capability alone does not
prove INHERIT/USAGE or the later inheritance-based smoke union will succeed.

## Scope and review status

G69-B retained: no INHERIT clause added; omitted existing options preserved. G71 cleanup
deferred: no revoke or restore. No SQL smoke change, protocol rewrite, Bill finding edit,
G73 ratification, or security/database effect. G69-G80 remain open. Prior Bill verdicts stand.
The preflight revision is applied for Bill's re-review, not Bill acceptance or finding closure.
Hosted rerun and merge remain HOLD.

## Protocol boundary

The owner's authenticated takeover message (Slack D0CDS44F00K,
1793720929.858649) makes Telkomsel Coordinator, superseding historical role labels.
Existing review-protocol.md rules 21 and 24 still prohibit Coordinator line-1 changes and
require a Coordinator message to end NEXT: current TURN. Rule 18 instead requests NEXT: Bill
for work pending QC. This unresolved role/handoff conflict is not silently overridden.
A partial [Coordinator] response therefore retains TURN/NEXT Telkomsel and asks Bill for
review through review.md. Formal handoff remains pending protocol reconciliation; this
commit does not prove Bill was notified, woken or that QC scheduling is complete.
