# Setup: what a new Bill session needs

## Capabilities

| Capability | Used for |
|---|---|
| The repo attached **with push access** | Pull, commit and push `review.md` |
| Shell with git, Node 22.13+, npm, Python 3 | Tests, lint, live server checks |
| Background shell commands (2-hour limit) | `poll.sh`, the 10-minute check |
| File read and edit | Reading code; editing `review.md` |

No API keys are needed: reviews run with `LLM_PROVIDER=mock`. Live Supabase and real-model checks go through committed evidence or the owner. Bill runs a live check himself only with the owner's explicit go in chat, on a dedicated smoke uid with the mock model, and commits the evidence under `evidence/`.

## Start-up

```bash
cd <repo> && git checkout instinct-prototype-v3 && git pull --rebase
export TZ=Europe/Helsinki            # the sandbox clock is UTC; the guard and test:arch need Helsinki time
npm install --legacy-peer-deps && git checkout -- package-lock.json
git config core.hooksPath .githooks
git config --local user.name Bill     # owner request: Bill's commits show author "Bill"
cp Bill_QualityControl_2026-11-01/poll.sh <scratchpad>/poll.sh
# run it as: REPO=<repo> INTERVAL=60 TZ=Europe/Helsinki bash <scratchpad>/poll.sh $(git -C <repo> rev-parse HEAD)   (background; FULL hash)
for t in test:arch test:adapter test:e2e test:remote test:env test:selftest test:load; do
  npm run -s $t > "/tmp/$t.log" 2>&1; echo "$t exit=$?"; grep -E "passed, [0-9]+ failed|all checks passed" "/tmp/$t.log"
done
npm test > /tmp/npmtest.log 2>&1; echo "npm test exit=$?"
npm run -s lint > /tmp/lint.log 2>&1; echo "lint exit=$?"
npm run -s check:review; echo "guard exit=$?"   # never piped
node scripts/prep-r2/validate-r2-cases.mjs   # R2 dataset, 74/0 at 207f384
# when a suite fails, read its full /tmp/<name>.log
```

## Read on start-up (only these)

1. `SYSTEM_PROMPT.md` and `STATE_HANDOFF.md` in this folder.
2. `review.md`: line 1, *Context memory*, the open `G` rows, and the newest 2 messages.
3. `review-spec.md` once (V1–V9).
4. Cold files only for a specific id: `grep -n G12 review-archive.md`.

## Live server check (when needed)

```bash
D=$(mktemp -d); CABINET_DATA_DIR=$D node scripts/run_python.mjs scripts/load_data.py seed/demo --target file --no-reload
LLM_PROVIDER=mock CABINET_DATA_DIR=$D nohup npx tsx server.ts >$D/server.log 2>&1 &
# curl localhost:3000/ , /arch.html , /dev-monitor.html , /api/arch/lauri/state
# stop by PID: ps -eo pid,args | grep -E "node.*server\.ts" | grep -v grep
```
