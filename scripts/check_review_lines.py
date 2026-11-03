#!/usr/bin/env python3
"""OWNER (03:02, via review.md): pre-commit guard for review.md.
G23 (Bill): on top of the 150-char CMP line limit, also block:
  - line 1 (TURN: <name>) naming anyone but the newest message's NEXT name
  - a required section missing (Protocol, Context memory, Findings, Messages)
  - a CMP message body over 8 lines
  - a message header time ahead of the `date` clock
Checks fenced message blocks under '### [Name]' headers in review.md. Exit 1 on violation.
Install: git hooks are not cloned, so run `npm run check:review` (wired into test:arch) or
copy to .git/hooks/pre-commit locally."""
import re, sys
from datetime import datetime

path = sys.argv[1] if len(sys.argv) > 1 else 'review.md'
lines = open(path, encoding='utf-8').read().splitlines()
bad = []

# Required sections (Joe's hot-file layout).
REQUIRED = ['## Protocol', '## 🧠 Context memory', '## Findings', '## Messages']
for sec in REQUIRED:
    if not any(l.startswith(sec) for l in lines):
        bad.append(f'missing required section "{sec}"')

# Message blocks: ### [Name] YYYY-MM-DD HH:MM followed by a fenced CMP body.
msgs = []  # (header_line_no, name, when, body_line_count, body_start)
cur = None
in_fence = False
for i, line in enumerate(lines, 1):
    m = re.match(r'^### \[(\w+)\](?: (\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}))?', line)
    if m:
        when = None
        if m.group(2):
            when = datetime(int(m.group(2)[:4]), int(m.group(2)[5:7]), int(m.group(2)[8:10]),
                            int(m.group(3)), int(m.group(4)))
        cur = [i, m.group(1), when, 0, None]
        msgs.append(cur)
        in_fence = False
        continue
    if cur is not None:
        if line.startswith('```'):
            in_fence = not in_fence
            if in_fence and cur[4] is None:
                cur[4] = i
            continue
        if line.startswith('### '):
            cur = None
            in_fence = False
            continue
        if in_fence:
            cur[3] += 1
            if len(line) > 150:
                bad.append(f'{path}:{i}: CMP line {len(line)} chars (>150)')

now = datetime.now()
for line_no, name, when, body_lines, _ in msgs:
    if body_lines > 8:
        bad.append(f'{path}:{line_no}: [{name}] message body {body_lines} lines (>8)')
    if when and when > now:
        bad.append(f'{path}:{line_no}: [{name}] header time {when:%H:%M} is ahead of the clock ({now:%H:%M})')

# Line 1 must be the newest message's NEXT name. Joe has no turn (protocol 1), so his
# messages carry no NEXT - the check uses the newest Bill/Telkomsel message.
turn_msgs = [m for m in msgs if m[1] != 'Joe']
if turn_msgs:
    last_no, last_name = turn_msgs[-1][0], turn_msgs[-1][1]
    nxt = None
    for line in lines[last_no - 1:]:
        m = re.match(r'^NEXT:\s*(\w+)', line)
        if m:
            nxt = m.group(1)
        if line.startswith('### ') and line != lines[last_no - 1]:
            break
    turn = re.match(r'^TURN:\s*(\w+)', lines[0]) if lines else None
    if nxt is None:
        bad.append(f'{path}:{last_no}: newest message [{last_name}] has no NEXT line')
    elif not turn:
        bad.append(f'{path}:1: line 1 is not "TURN: <name>"')
    elif turn.group(1) != nxt:
        bad.append(f'{path}:1: TURN says {turn.group(1)} but the newest message\'s NEXT says {nxt}')

if bad:
    for b in bad:
        print(b)
    sys.exit(1)
print(f'{path}: CMP lines <=150 chars, messages <=8 lines, sections present, TURN matches NEXT, no future headers')
