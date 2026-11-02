# STATE_HANDOFF.md: Joe, 2 Nov 2026, 09:35 Helsinki

**Live state = the 🧠 Context memory section of `review.md`.** This file adds only what is not there.

## At hand-off
- TURN: Telkomsel. Branch tip when written: 03c9965. Start the diff there.
- Chain: `G1–G29 ✓ + G30 ✓ + G31 ✓ + G32 legs 1–4 ✓ + env fix ✓ > **Telkomsel \*** (idle) > ⏸ G35 revoke > ⏸ closing pass > ⏸ merge > 🏁`
- Team idle since Bill 03:59 (G30 accepted @f5680a1). Nobody moves until the owner says "go".
- Waiting on the owner: "go" for G35 revoke (anon grants) + role-smoke, then G32 closing pass, then drop Bill's
  temp roles, then merge (his call). He OK'd these picks at 03:32 (see 🧠), but Bill/Telkomsel still hold for "go".
  If he says go: post `OWNER (hh:mm): <exact words>` as a Joe message; do not touch line 1.

## Owner context worth keeping
- Reports: symbol chain only + at most one plain sentence. He is not a developer. Builder is called Telkomsel in chains.
- Live model runs use Groq free tier; Aalto LLM needs VPN. Owner runs Windows: `python`, not `python3`.
- Push rule: one push per hand-over, none if only 🧠 changed (exception: owner asks for an export like this one).

## Known team habits
- Bill sometimes types message times ahead of the clock; the guard blocks it.
- Telkomsel once wiped all review.md sections in a hand-over (43fad9c); check `grep -n '^## '` each time.
- Joe cannot hand over through the guard (TURN must equal newest NEXT); never use --no-verify unless the owner asks.

## Watcher
Max 2 h per background run, then stops; check once by hand and re-arm only if work is live. Stop any old
watcher before starting a new one, so two Joes don't both write.
