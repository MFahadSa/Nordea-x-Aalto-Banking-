# Setup: what a new Telkomsel session needs

## Capabilities

| Capability | Used for |
|---|---|
| The repo attached **with push access** | Commit and push code + `review.md` |
| Shell with git, Node 22.13+, npm, Python 3 | Build, tests, local server |
| Background shell (2-hour limit) | Local server, watching for Bill's turn |
| Owner chat | Spending, security/access and Supabase decisions |

No API keys are needed: reviews and tests run with `LLM_PROVIDER=mock`. Live model runs use the Groq free tier, owner's OK first. Live Supabase steps go through the owner.

## Start-up

```bash
git clone --depth 1 -b instinct-prototype-v3 https://github.com/coolkowkank/Nordea-x-Aalto-Banking-.git && cd Nordea-x-Aalto-Banking-
export TZ=Europe/Helsinki            # the sandbox clock may be UTC; the guard and test:arch need Helsinki time
npm install --legacy-peer-deps && git checkout -- package-lock.json
git config core.hooksPath .githooks
# baseline, each suite UNPIPED; check each exit code and read failures in full:
npm run -s test:arch
npm run -s test:adapter
npm run -s test:e2e
npm run -s test:remote
npm run -s test:env
npm run -s test:selftest
npm test
npm run -s lint
npm run -s check:review              # never pipe it; the pipe hides its exit code
```

Expected baseline at `446a02e`: arch 233, migrate 43, adapter 44, e2e 27, remote 35, env 7, selftest suite 3, bank-records green, lint 0.

## Read on start-up (only these)

1. This folder: `SYSTEM_PROMPT.md`, `STATE_HANDOFF.md`.
2. `review.md`: line 1, the Context memory, the open G rows, the newest 2 messages.
3. `review-spec.md` once (V1-V9). Cold files only for a specific id: `grep -n G30 review-archive.md`.

## Local server check (when needed)

```bash
D=$(mktemp -d)   # genuinely empty store: the selftest seeds the demo data itself
LLM_PROVIDER=mock CABINET_DATA_DIR=$D nohup npx tsx server.ts >$D/server.log 2>&1 &
curl -s -X POST localhost:3000/api/selftest   # expect 13/13 on the empty store
# pages: localhost:3000/ , /arch.html , /dev-monitor.html
# stop by PID: ps -eo pid,args | grep -E "node.*server\.ts" | grep -v grep
```

A store with any customer but no lauri makes the selftest stop with an operator error naming `scripts/load_data.py`; seed it yourself with `node scripts/run_python.mjs scripts/load_data.py seed/demo --target file --no-reload` only when that is what you mean to do.
