# Live retest of b54d093 (G39/G40/G41 fixes) - 2026-11-02 ~18:00 EET

Hosted Supabase stores, real Groq chain (`openai/gpt-oss-120b` -> `qwen/qwen3.8-27b`), `LLM_MAX_CALLS=20`, test customer `e2elive` (253 records reseeded, then cleared and baseline-verified).

## G39 (M): chain handover on missing finish call - VERIFIED live
- API run (`logs/retest-g39-api-server.log`): 7 paid calls gpt-oss-120b, then
  `AI chain: Groq openai/gpt-oss-120b failed (other); trying the next one.` and 1 paid call
  qwen/qwen3.8-27b. Handover fires exactly as the fix describes. That run's compose still
  ended `source: scripted` (qwen's single remaining step did not finish; cm/nordea plans were `model`).
- UI run (`logs/retest-g39-ui-server.log`, same 7+1 call pattern): compose SUCCEEDED -
  chat caption `reply: model [Groq qwen/qwen3.8-27b] - round plan: cm model, nordea model`.
  Screenshot: `retest-g39-arch-chat.png` (three stores connected, model reply grounded in
  context.md figures, session panel shows the round).
- Net: the handover mechanism works end-to-end; compose success now depends on qwen finishing
  within the steps left after gpt-oss exhausts its budget (nondeterministic across the 2 runs).
- Paid calls: 8 per run, 16 total, cap 20 per process (request counts, not dollar cost).

## G40 (M): session doc wiped when an agent is OFF - VERIFIED fixed
Scripted run (no provider): session q1 built context doc (customer 1 row, nordea 2 rows,
sessionId stamped). `POST /api/arch/e2elive/agents/nordea/off`, then q2 in the SAME session:
doc rows preserved (customer 1, nordea 2, same sessionId). Agent turned back on after.

## G41 (L): duplicate aggregate row - VERIFIED fixed
Scripted car-goal reply prints each aggregate once: `20616` count 1, `1416` count 1 in the
reply text (previously the generic row repeated the goal row's figures).

## Regression pins + baseline
- `npm run test:arch`: **249 passed, 0 failed** (matches Telkomsel's claim; README Checks
  table corrected 243 -> 249 in this commit).
- test-migrate: 43 passed, 0 failed.

## Cleanup (hosted baselines restored)
- `load_data.py --clear --only-user e2elive`; local `data/arch/e2elive.*` removed.
- Full-table hash check (md5 over ordered per-row md5):
  - agent_user_records: total 8, hash ef2e8bd05768f2fe1d0e57f143e9fa51 - MATCH baseline
  - agent_cm_records: total 36, hash 5ff5e6cde58276b8f1ac5348f539f644 - MATCH baseline
  - agent_nordea_records: total 241, hash 854ec8e68e45b701e8653362649f1300 - MATCH baseline
  - `user_id='e2elive'` rows left in each table: 0 / 0 / 0
