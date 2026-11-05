# Live three-agent end-to-end run (hosted Supabase + real model)

Date: 2026-11-02, ~11:17-11:21 UTC. Runner: Coordinator (instinct-christina), owner-approved live test.

## Environment
- App server (`npx tsx server.ts`) on localhost, backed by the HOSTED Supabase stores via
  `USER_DB_URL` / `CM_DB_URL` / `NORDEA_DB_URL` (pooler, per-role logins; each agent store
  reported `backend: postgres, connected: true` in the monitor).
- Real model: `LLM_PROVIDER=openai`, Groq base URL, `LLM_MODEL=openai/gpt-oss-120b` (plan calls);
  the reply compose chain used `Groq qwen/qwen3.8-27b` for the answer shown below.
- Test customer: dedicated uid `e2elive`, seeded via `scripts/load_data.py seed/e2elive
  --only-user e2elive --no-reload` (253 hosted rows: user/goals, 228 transactions, CM entries,
  logs). Test path was the HTTP API (`/api/arch/...`), not the demo UI.

## What ran (all against the hosted stores)
1. Session `session-mvz60elt-01a7` opened; first session question ran a build round with real
   model plan calls (monitor `planStatus: {cm: model, nordea: model}`).
2. Chat answer composed by the model from `context.md` + User DB:
   `"You have spent 20616 EUR related to your Save for a car goal, across 72 transactions."`
   - `source: "model"`, `used: ["user-db","context-md"]`; figures match the Nordea agent's
     aggregate proposal in the round (72 tx / 20616 EUR, transactionIdsHash 32ff3867).
     Raw chat JSON: `chat-model-answer.json`.
3. Goal added through the API (`goal-mvz60fac-1nsk` "Save for a bike"); a user-change round
   rebuilt `context.md` including the new goal and refreshed Nordea aggregates the same minute.
4. `POST /api/arch/e2elive/nordea/contribute` ran a contribution round: personal agent proposed
   2 goals, Nordea agent proposed goal-matched aggregates (e.g. 27 tx / 29160 EUR for
   "Buy a flat with my partner", hash f90977e0) from its own DB only.
5. Review accept through `POST /api/arch/e2elive/review/:messageId/accept` turned two pending
   proposals into CM entries (`entry-mvz62zk9-1adf`, `entry-mvz62zku-5yfm`); CM entries went
   5 -> 7, review queue 7 -> 5 pending. Full queues/rounds in `monitor-final.json`.

## Cleanup and data safety
- `scripts/load_data.py --clear --only-user e2elive` removed every hosted row for the test uid.
- Post-cleanup hosted state matches the pre-test baseline exactly (full-row hashes):
  - agent_user_records: 8 rows, md5 ef2e8bd05768f2fe1d0e57f143e9fa51
  - agent_cm_records: 36 rows, md5 5ff5e6cde58276b8f1ac5348f539f644
  - agent_nordea_records: 241 rows, md5 854ec8e68e45b701e8653362649f1300
  (hash = md5 over sorted per-row md5 of whole-row text; baselines recorded in evidence/g38/.)

## Honest caveats
- The FIRST question of a brand-new session was answered `source: "scripted"`
  ("shared context is unavailable this session"): the session's build round finalised after the
  first reply was composed. The follow-up in the same session answered with `source: "model"`.
- The API-added goal appeared in that run's context.md and proposals, but was not present in the
  goals list after a server restart - likely a flush-back gap when the process is killed; not
  investigated further.
- Coverage is the API path on localhost; the demo UI (`arch.html`) was not driven, and no
  deployed URL exists for this branch.
