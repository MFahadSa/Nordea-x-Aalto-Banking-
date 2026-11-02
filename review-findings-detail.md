# review-findings-detail.md: full text of open finding rows (cold; grep an id)

Moved from review.md by Joe 2026-11-02 21:18 (OWNER 21:18). Hot rows keep a one-line summary.

| Id | Sev | V | Finding | Evidence | Status |
|:-:|:-:|:-:|---|---|:-:|
| G45 | M | V4 | G44 residual: impersonal English about the customer's own item still lands General and an invented figure ships as model: 'What was the total of the last electricity invoice?' -> 'The last electricity invoice was 84.20.' (no I/my, no listed word). A keyword list will keep leaking. Fix (pick one): any figure in a General reply when the question names a bill-like item -> guard; or mark General replies in the text as general, not from the customer's data. | `src/server/arch/orchestrator.ts` classifyQuestion/customerFigureClaim; Bill probe | open |
| G42 | M | V4 | G39 residual: a NO_CALLS handover mid-run gives the new member only the steps LEFT in that run, and the retry then finds no fresh member. API retest: gpt-oss steps 5-7, NO_CALLS at step 4 -> qwen gets 1 step, no finish -> scripted. Fix: restart the step budget (fresh turns) when the answering member changes, keep LLM_MAX_CALLS as the cap; add a pin. | `src/server/arch/llm.ts:59-79`; `evidence/e2e/logs/retest-g39-api-server.log` calls 5-8 | open |

| G46 | M | V7 | Owner main merge 9969f07 restored v2 README parts (removed files, old store, offers); V7 needs v3 match. | `9969f07`, README | open |

**R1–R9 source:** owner msgs 1793646171.523219 (list) / 1793646229.568279 (implement), via main. Status: requirement only, NOT built.

## R2 owner quotes (verbatim, project record)

Owner message ts 1793654508.504259:

```
No need, just put the newly produced user context card in the waiting list. Some context card already have been approved so it will not appear there. Lets give every user context card approval ID. The approval ID contains airlock level:
• No-risk certified (level 0)
• Review everything pass certified (level 1)
• High-risk pass certified (level 2)
The permission will have 3 modes:
• No permission means all airlock level can pass
• Review everything means level 1 and 2 certified can't pass
• High risk mode means only level 2 certified can't pass
Those user-context who can't, will be waiting in "waiting for you" for user approval. The approval can be done in arch.html or main-app
```

Owner message ts 1793654878.729759:

```
The app gateway should now only apply to user, no connection to Bank. The user AI will determine the risk level.
```

| R2 | M | V4 | Approval gateway, USER context cards only (no bank link): the User AI assigns a level, the approval ID holds it, blocked cards wait in "Waiting for you" (arch.html or main-app). Level rubric, no-level case, edit/reapproval, mode-change release still open. | R-src | open |

| G51 | M | V4 | G42 follow-up: (a) a member that answered NO_CALLS is asked again on every later step (probe: A:text paid before each B step); (b) default steps 4 -> 20 per model with LLM_MAX_CALLS unset = uncapped, up to 20 x members paid calls x 120 s per agent run (spend/latency: owner gate); (c) the loop has no hard bound if names ever mismatch (your own 'hang' mutation). Fix: skip a NO_CALLS member for the rest of the run; keep 4 or set a default cap unless the owner quotes otherwise; add an iteration ceiling. | `src/server/arch/llm.ts:29,60-90`; Bill probe | open |
