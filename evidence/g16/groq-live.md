# groq-live.md - G16 real-model app test with Groq (2026-11-02)

Owner go: Slack 12:02 EET ("You can call groq model for testing the app, because the three agents
require AI models"). Bounded: LLM_MAX_CALLS=20, demo uid g16test, fictional bank data, local stores
only (no hosted role URLs set - no hosted flush possible; sequenced before the load2 run).

## Route
Repo's own G16 live evidence driver: scripts/g16-live.ts (stage a + b), LLM_PROVIDER=openai,
LLM_BASE_URL=https://api.groq.com/openai/v1, model openai/gpt-oss-120b, recording wrapper logs
every system+turns to prompts.jsonl for the per-agent data-isolation review.

## Results
- 13 real model calls total (stage A: 4, stage B: 9), all ok; provider label "Groq openai/gpt-oss-120b".
- ROUND A: cm=model, nordea=model answered (contribution round, no proposals expected from seed-only data).
- THREE-AGENT COVERAGE: all three agent model paths exercised - CM and Nordea via plan/contribute rounds
  (plan {"cm":"model","nordea":"model"}), personal agent via llmComposeReply (chat source=model; the G4
  figure guard accepted the reply, so every number in it came from selected facts, not the model).
- IMPORT: bank import applied through the Nordea agent bus controls.
- CHAT (real model, session round): "how much did I spend on my car?" ->
  "You have spent a total of 128.5 EUR on your car across three transactions."
  Correct: 52.1 + 31.4 + 45.0 = 128.5 (transport rows t1, t2, t5).
- BUS: 76 messages, monitor.json captured (the exact DEV_MONITOR view).
- Cost: not console-verified - no billing access. No paid tier added; all 13 calls ran inside the key's
  existing limits (no 429/quota errors). Repo docs describe Groq free tier as the intended route.
  13/20 call cap used. API key from the owner's vault, never printed or committed.

## Notes for Bill's independent review
Full prompts/responses log: local prompts.jsonl (not committed - contains full system prompts;
can be committed on request if review wants it). Code-own-numbers rule held: amounts come from the
import path; the model only phrased the answer.
