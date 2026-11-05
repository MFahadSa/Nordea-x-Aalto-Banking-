#!/bin/bash
# Poll origin/instinct-prototype-v3 every ${INTERVAL:-600} s; exit on TURN: Bill or a new ASK@Bill in review.md.
# Pass the FULL 40-char hash as <last-hash> (a short hash never equals ls-remote output, so it wakes at once).
cd "${REPO:-/root/repo}" || exit 2
last="$1"
while true; do
  h=$(git ls-remote origin instinct-prototype-v3 | cut -c1-40)
  if [ -n "$h" ] && [ "$h" != "$last" ]; then
    git fetch -q origin instinct-prototype-v3
    line=$(git show "$h:review.md" | head -1)
    echo "$(date -Is) new $h author=$(git log -1 --format=%an "$h") line1=$line"
    if [ "$line" = "TURN: Bill" ]; then echo "TURN_BILL $h"; exit 0; fi
    if git diff "$last" "$h" -- review.md | grep '^+' | grep -q 'ASK@Bill'; then echo "ASK_BILL $h"; exit 0; fi
    last="$h"
  fi
  sleep ${INTERVAL:-600}
done
