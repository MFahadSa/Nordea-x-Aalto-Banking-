# Live bounded runs - owner authority and sanitized run evidence (2026-11-03)

Committed by the Coordinator in answer to Bill's ASK@Coordinator #live (review.md, Bill 2026-11-03 11:36).
This file is deliberately composed evidence: owner words verbatim with Slack timestamps, plus sanitized
run facts (counts, round ids, cap). No transcripts, no tool output dumps, no secrets. The temporary Groq
env file was deleted after the runs; no key material exists in this repository.

## 1. Owner authority for the live runs (verbatim, Slack channel C0CDY4N9LD8, thread 1793691047.328029)

- ts1793697352.227379, owner: "Just go with it, and ask me if quota limit reached"
  (after the assistant asked whether this overrode the earlier free-only restriction, ts1793697358.598009)
- ts1793697372.309799, owner: "No need to verify billing in this free-tier"
  (billing verification waived by the owner; the free-tier characterization is user-stated, not
  independently verified, and no dollar/spend claim is made anywhere from it)
- ts1793698331.463079, owner: "continue with you recommendation"
  (after the assistant reported a real Groq 429 and asked "Should I retry the remaining live check after
  Groq's rate-limit reset, or leave it paused?" ts1793698192.874239, clarified "Do you mean go ahead with
  one bounded retry to finish the check? I'll stop again if Groq reports another limit."
  ts1793698307.942889, and stated the bound: "I'll make one retry with at most 10 more model calls, then
  check both views. I'll stop immediately if Groq reports another limit. No paid upgrade or provider
  change." ts1793698338.220179)

Earlier owner-gate structure (thread 1793651499.818709): the owner's pipeline marker listed
"live AI-view check (your go, verbatim quote)" and "merge (your word to Bill)" (owner ts1793655130.086189);
paid testing and merge stayed held until explicit owner approval (assistant ts1793659657.954879,
ts1793661086.094589). The 20-call run bound and the +10 retry bound were assistant-proposed safety caps,
not owner-set numbers; the owner's stop condition was the Groq quota signal, which fired in run 2 (below)
and was honored before the retry.

## 2. Sanitized run evidence (production code c7f6b59; docs-only commits since)

Call counting: the server's pre-flight counter (src/server/llm.ts) logs "[llm] paid call N/cap" BEFORE each
provider HTTP request and refuses past the cap. "Admitted attempts" below are these counter admissions:
they INCLUDE failed provider calls, and are NOT successful-completion counts, token counts, credits,
verified charges, or an independent wire capture. Seed/driver ran on the mock provider (0 real calls); no
other live run existed (sole-runner confirmed).

| Run | Cap | Admitted attempts | Per model | Outcome |
|---|---|---|---|---|
| 1 | 20 | 20/20 | gpt-oss-120b 18, qwen3.8-27b 2, gpt-oss-20b 0 | Chat round plan cm+nordea MODEL; reply "128.5 EUR" arithmetically correct vs seeded records; CM+Nordea model-finished in both views; cap then refused further calls (honest scripted decline) |
| 2 | 8 | 8/8 | gpt-oss-120b 6, qwen 2 | Organic goal add -> contribution round round-mw0hg1xa-modc stored 09:25:47Z, plan CM model / Nordea cap-error; ended by a real Groq 429 |
| 3 | 10 | 8/10 | gpt-oss-120b 7, qwen 1 | Organic goal add -> contribution round round-mw0hozqn-qw2i stored 09:32:44Z, plan cm+nordea MODEL; ALL THREE agents (Personal/CM/Nordea) model-finished SIMULTANEOUSLY, API-verified and pixel-verified in BOTH views (arch + dev monitor); round produced a real cabinet entry |

Aggregate: 36 admitted attempts against the approved 38 ceiling (20 + 8 + 10).

The run-2 429 (verbatim, org id truncated): "Rate limit reached for model `qwen/qwen3.8-27b` in
organization `org_01m5navq...` service tier `on_demand` on output tokens per minute (OTPM): Limit 1000,
Used 578, Requested 625. Please try again in 12.18s." The chain honored the 12s retry-after; the local cap
then refused all further attempts; ZERO post-429 admitted attempts were logged (local-counter evidence).

Honest-failure history kept: one 400 output_parse_failed (model produced unparseable output), two
NO_CALLS events (model answered without any tool call), each followed by chain failover; a test-driver
POST to /api/rounds/contribute returned 404 because that route does not exist - a driver error, NOT a
product defect (real contribution triggers are goal add and bank import, source-verified).

## 3. Verification method

Independent Coordinator execution and QC. Both-views verification = rendered-pixel inspection of
public/arch.html and public/dev-monitor.html plus API JSON (/api/arch/:uid/state, /api/dev/monitor) for
the synthetic test customer. Pixel evidence was inspected by the Coordinator and by the Coordinator's
orchestrating main agent; screenshots and JSON artifacts are retained outside the repo. Billing remains
UNVERIFIED (user-stated free tier); nothing here is evidence of zero or any specific charge.
