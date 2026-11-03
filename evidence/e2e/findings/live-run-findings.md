# Findings from the live three-agent run (2026-11-02)

Source-grounded by the Coordinator's live runs against hosted Supabase + Groq (evidence/e2e/)
and instrumented local reproductions (mock-free, same seed data, uid e2edbg/dbg1 local-only).
For builder (Telkomsel) diagnosis+fix and Bill's independent review. Relayed via main 13:31.

## F-A: UI "new session" flow skips the session round (first question answered scripted)
Repro: click "New session" in arch.html (calls POST /api/arch/:uid/session/new, public/arch.html:222),
then ask any question. session/new SAVES the session, so chat() resolves it as existing
(isNew=false, orchestrator.ts resolveSession): no session round runs, no context.md is stamped
for the session, and the top-up path requires an already-finalised document, so a customer with
no earlier round gets "shared context is unavailable this session" (finishChat !docAvailable
branch, agents/personal.ts). This contradicts F15/F16 ("the first question of a session opens a
session round") and the button's own label. A chat sent with NO pre-created session works
correctly (verified: fresh uid, source=model, grounded figures). Seen live: first hosted answer
scripted "unavailable"; follow-up in the same session answered by model after a later round
finalised a document.

## F-B: session round runs twice for a new session
orchestrator.ts chat(): the isNew block runs runRound('session') (L86-90) and a second,
near-identical block runs it again (L96-100). Each round also triggers its own planRoundLlm,
so a new session pays for two identical model plan rounds. Monitor/round records confirm two
round ids per new session. Looks like a leftover from adding plan-status tracking.

## F-C: hosted write-back is not crash-safe
store/common.ts: a write marks the handle dirty; the hosted flush is a 250 ms-debounced
setTimeout scheduled when the handle CLOSES, fire-and-forget via flushChains (no await on
shutdown; no SIGTERM/SIGINT handler anywhere in src/server). A process exit inside the window
(or mid-push) silently loses the last write(s). Repro: add a goal via the API, kill the server
within ~1 s, restart - the goal is gone from the hosted-backed store. With a 4 s grace before
SIGTERM the same goal survives the restart (verified twice, "Flush test goal"). So the write
path is correct; only crash/kill durability is missing (no drain on shutdown).

## F-D: personal-agent compose is flaky with the configured chain
llmComposeReply (agents/personal.ts) via runAgentReasoning: openai/gpt-oss-120b (a reasoning
model) frequently returns no finishReply tool call within the step budget -> result null ->
status scripted with NO error logged; the scripted template stands. The chain's
qwen/qwen3.8-27b answered correctly in 2 of 3 observed compose attempts. So whether the
customer gets a model-composed answer currently depends on which chain member picks up, and a
silent fallback is the common case. Observed in hosted and local runs (server logs: repeated
"paid call ... gpt-oss-120b" sequences without a compose result).

## F-E (cosmetic): scripted fallback template can duplicate a context row
When the compose falls back, the grounded scripted reply printed the same Nordea context row
twice (see evidence/e2e/arch-chat.png chat pane: "72 transactions totalling 20616 EUR" x2).
finishChat parts assembly (agents/personal.ts) - likely the same row pushed via two paths.

## Verified good (keep)
- Three-agent separation holds live: each store Postgres per-role, connected; agents exchange
  bus messages only; context.md one-writer-per-section (UI + monitor screenshots).
- Model-planned rounds (plan status cm/nordea model) and a model-composed, figure-guarded
  answer matching the Nordea aggregate exactly (chat-model-answer.json).
- Review accept writes CM entries through the hosted store; rounds/messages auditable.
- Scoped cleanup restores hosted tables to pre-test baseline exactly (counts + full-row md5,
  verified twice).
