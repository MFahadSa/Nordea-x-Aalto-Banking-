# ASP and PS validation candidate, review before merging

## Outcome

This is a targeted engineering candidate, not a verified solution for all natural conversations. Do not merge on fixture scores alone. The final real model diagnostic failed to publish an answer. No merge or deployment was done.

## Changes

- Supply the actual production ASP source with deposit breaks, nonconsecutive monthly deposits, interest on savings held, and separate bonus accrual/payment conditions. Numeric terms are unchanged. Bonus accrues in the opening year and following five calendar years, and is paid in arrears under the stated home purchase and loan conditions.
- Bind product facts and followup source identity to exact catalogue revisions and source freshness. Mixed product and personal questions retain the product source; personal/action topic changes clear inherited product identity.
- Check natural model prose against supported ASP/PS quantity roles and a bounded set of product conditions. Only validated product quantities are removed from personal-figure checking. Personal amounts, account ownership, eligibility and operations keep their separate checks.
- Reject unsupported claims that an account operation was completed. Add one shared malformed-response regeneration, not a canned product answer.
- Keep the existing personal financial, consent and confirmation checks. No model/provider switch, new account operation, merge or deployment.

## Official sources

https://www.nordea.fi/en/personal/our-services/savings-investments/savings-accounts/asp-account.html

https://www.nordea.fi/en/personal/our-services/savings-investments/savings-accounts/tax-change-to-ps-accounts.html

The statement that a deposit pause delays reaching the required count, rather than suspending interest on the existing balance, is derived guidance from the permitted breaks/nonconsecutive deposits and interest-on-savings rules. It is not a verbatim bank statement or a guarantee of personal eligibility.

## Actual model evidence, important

The final capped diagnostic used the production chat route and actual serialized source input. It ran the exact mixed ASP opening question with a 400-euro monthly saving. All required source clauses were present.

1. The first generated response was malformed tool syntax. It was not published.
2. The retry produced a natural product explanation. It was blocked by an age quantity-role false rejection of the words 'years or older'. It also described early closure too broadly rather than closure for another use.
3. The two-HTTP turn cap stopped further generation. The customer-visible result was a failure nonanswer, caused by the diagnostic cap rather than evidence of a service outage. The linked pause turn was not run after the failed opening.

The age-role error, blanket age-only opening claim, and early-closure condition were then fixed with free regressions. That later change has no new live generation evidence. At about 19:52 PKT on November 24, the earlier v26 linked-pause run actually published an unsafe claim that stopping deposits means missing regular 1% interest during those months. This was not merely a blocked draft. Earlier PS drafts also invented qualification paths and were blocked. The final v29 run at about 20:06 PKT had no unsafe publication, but that does not erase the earlier published failure. Do not erase those failures or substitute scripted output for generation evidence.

Budget ledger: 52 HTTP attempts total in this workstream, conservative reserved upper bound $0.2800599 of $0.30. Reported usage is incomplete because several provider errors yielded salvageable raw drafts without usage. No more paid calls are planned.

## Tests and limits

Tests cover pure checks, actual raw/structured chat-route wiring, actual production system-input source continuity, freshness/revision boundaries, mixed personal quantities, unsupported operation claims, and existing application regressions. Reviewer-owned fixture originals are preserved separately from corrections. The route tests use a scripted provider with network credentials removed. They do not demonstrate that a real model will generate correct answers.

Independent unseen draft tests repeatedly exposed wrong-claim publication before their specific categories were patched, including pause-related interest loss, invented deposit resets and completed-operation claims. Those failures remain part of the evidence; passing the same seen cases after fixes does not prove coverage of new wording.

Remaining exact reviewer cases on v33, verified through both raw and structured routes:

- Wrongly accepted: bonus paid after the twentieth deposit even if no home loan is ever taken; a loan described as optional; no bonus loss when closing for another use.
- Wrongly rejected: correct wording that the 1% interest is not paid monthly and is added annually on 31 December.
- These cases are saved as `review/fixtures/nora-known-limits-reviewer.json`. They are known failures, not passing acceptance tests. The result is 12/20 expected route outcomes for that set, so this candidate is not ready to merge as a completed product-answer fix.

The validator is bounded English lexical validation, not a complete semantic proof. There can still be unhandled paraphrases, false rejections, missing-answer risks, and product facts omitted by a generated answer. The original user wanted natural working conversations; that goal is not yet demonstrated by the final live result.

## Focus for independent review

- Review the full production diff and exact ASP source binding, not only fixture pass counts.
- Check quantity-local masking for personal amount leakage, including conjunctions.
- Check source continuity expiry/revision changes and mixed personal/action routing.
- Check operation and negation scope, including pause statements versus claims of completed operations.
- Inspect raw final diagnostic drafts, retry feedback and published fallback separately.
- Decide whether to keep this as a draft PR until a later separately budgeted live acceptance run passes.
