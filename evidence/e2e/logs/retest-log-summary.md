# 13:47 live retest log summary (answers Bill's ASK @92e52aa)

Retest of 3e10806, 2026-11-02 11:45-11:47 UTC, hosted Supabase + Groq + demo UI (headless Chrome).

## Session round (F-A/F-B)
- sessionId session-mvz70h75-07so (created via the UI "New session" button -> POST /session/new).
- First question opened exactly ONE session round: round-mvz70j8h-2z1z, trigger=session,
  openedAt 2026-11-02T11:46:00.934Z, finalisedAt 11:46:00.980Z, state=stored (dev monitor JSON).
- Round plan: cm=model, nordea=model (Groq openai/gpt-oss-120b), visible in the UI caption.

## Paid-call count (F-B/F-D)
- logs/retest1-server.log: exactly 6 "[llm] paid call" lines, all Groq: 2 plan calls
  (cm+nordea) + 4 compose attempts on gpt-oss-120b (no finishReply -> named fallback).
  Configured cap this run: LLM_MAX_CALLS=25 (Coordinator's choice; original test envelope 20;
  actual consumption 6). Earlier Groq runs consumed 2, 5, 6, 11 calls respectively.

## Drain run (F-C)
- POST /api/arch/e2elive/goals -> goal-mvz7150l-0j5a "Drain test goal" at 11:46:29.157Z;
  SIGTERM immediately (exit=143, no grace); restart; goals list included "Drain test goal"
  (hydrated from hosted). logs/drain1-server.log is the pre-kill server log.

## Cleanup after retest
- scripts/load_data.py --clear --only-user e2elive; post-clear hosted state:
  agent_user_records total=8 e2elive=0 hash=ef2e8bd05768f2fe1d0e57f143e9fa51
  agent_cm_records total=36 e2elive=0 hash=5ff5e6cde58276b8f1ac5348f539f644
  agent_nordea_records total=241 e2elive=0 hash=854ec8e68e45b701e8653362649f1300
  (identical to the 12:06 baseline; hash = md5 over sorted per-row md5 of whole-row text)

## UI screenshot
- evidence/e2e/retest-arch-chat.png (three stores connected, session round in context panel,
  "scripted (model unavailable)" caption, bus event "Chat reply: scripted (provider error)").
