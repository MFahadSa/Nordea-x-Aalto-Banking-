# Review brief: partial ASP source-continuity correction

## Status and scope

This is a narrow partial correction. It does not solve reliable natural ASP/PS conversations and is not a recommendation to merge or deploy without review.

Baseline: `33fdb24f19db255864ce1f7fb7080689408c1533`.

## Defect

The ASP background was chosen from the current question alone. After a failed ASP reply, a linked question such as "And if we split up and I buy alone, is the bonus still there?" could receive no ASP product background. A real-model baseline probe then published a wrong "Automatic Savings Plan" definition and an invented joint-home bonus condition.

## Change

- `aspSourceIdentity.ts` resolves a current ASP source id/revision from an explicit product question or linked follow-up.
- `routes.ts` records that source identity on the user's message before generation, independent of reply success.
- `abel.ts` supplies the existing ASP background for a matching linked follow-up. The actual user question is not changed.
- `types.ts` adds the optional source-identity field.
- `test-asp-source-identity.ts` exercises the actual chat route using a scripted provider and temporary demo data, with no paid model calls.

The marker is not answer verification, personal eligibility or authority to act. A topic switch or stale source ends continuity. Current personal context, available tools and all existing answer checks remain unchanged.

No rules, product figures, provider settings, response-format recovery, numeric checks or factual-review bypasses are changed. Failed verifier experiments are not included.

## Checks already passed

The patch was separately applied and reviewed against the baseline. Both test runs passed:

- 5 targeted source-identity route checks.
- 26 conversation checks.
- 47 natural-language stress cases.
- 113 rule checks.
- TypeScript validation.

Commands:

```bash
npx tsx scripts/test-asp-source-identity.ts
npx tsc --noEmit
npm run test:audit
npm run test:rules
```

## Real-model evidence and limits

The real follow-up probe used a deliberately failed initial ASP route as controlled setup, then a real generated follow-up. This was not a fully natural two-turn conversation.

The patched follow-up received the correct Finnish ASP background, but its drafts still added a wrong condition about stopping deposits and were blocked by existing checks. No usable answer was published. The explicit salary topic-switch probe also degraded because the model returned malformed response text. A baseline salary probe published the salary. These single samples do not establish a regression or a reliability rate.

The correction fixes missing-source routing, not the wider factual or publication problems. PS is unchanged. Other outstanding issues include invented condition attribution, correct product figures blocked by personal-figure checks, and model response-format failures.

## Requested final review

1. Confirm the diff contains only this source-continuity correction and test.
2. Check source revision/expiry, conversation boundaries, explicit topic switches and actions.
3. Confirm the marker cannot approve prose, establish eligibility, remove tools or bypass a guard.
4. Probe linked follow-ups after both a successful and failed ASP reply, plus personal and action topic switches.
5. Report any failure without treating the passing scripted suite as proof of natural answer quality.

## Rollback

Revert this isolated commit if needed. No data migration is required: the optional source-identity field is ignored by the baseline. Merging and deployment remain separate decisions.
