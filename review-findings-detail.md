# review-findings-detail.md: full text of open finding rows (cold; grep an id)

Moved from review.md by Joe 2026-11-02 21:18 (OWNER 21:18). Hot rows keep a one-line summary.

| Id | Sev | V | Finding | Evidence | Status |
|:-:|:-:|:-:|---|---|:-:|
| G45 | M | V4 | G44 residual: impersonal English about the customer's own item still lands General and an invented figure ships as model: 'What was the total of the last electricity invoice?' -> 'The last electricity invoice was 84.20.' (no I/my, no listed word). A keyword list will keep leaking. Fix (pick one): any figure in a General reply when the question names a bill-like item -> guard; or mark General replies in the text as general, not from the customer's data. | `src/server/arch/orchestrator.ts` classifyQuestion/customerFigureClaim; Bill probe | open |
| G42 | M | V4 | G39 residual: a NO_CALLS handover mid-run gives the new member only the steps LEFT in that run, and the retry then finds no fresh member. API retest: gpt-oss steps 5-7, NO_CALLS at step 4 -> qwen gets 1 step, no finish -> scripted. Fix: restart the step budget (fresh turns) when the answering member changes, keep LLM_MAX_CALLS as the cap; add a pin. | `src/server/arch/llm.ts:59-79`; `evidence/e2e/logs/retest-g39-api-server.log` calls 5-8 | open |

| G46 | M | V7 | Owner main merge 9969f07 restored v2 README parts (removed files, old store, offers); V7 needs v3 match. | `9969f07`, README | open |

**R1–R9 source:** owner msgs 1793646171.523219 (list) / 1793646229.568279 (implement), via main. Status: requirement only, NOT built.
