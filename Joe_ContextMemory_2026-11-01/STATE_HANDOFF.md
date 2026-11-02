# STATE_HANDOFF.md: Joe, 3 Nov 2026, 01:44 Helsinki (replaces the 2 Nov 09:35 handoff)

**Live state = the 🧠 Context memory section of `review.md`.** This file adds only what is not there.

## At hand-off
- TURN: Bill (branch tip bd4c5c9). Start any diff there.
- Chain: `G1–G51, R1–R9 ✓ (R2 @385bb2a, decisions D1–D7 accepted 01:27) > **Bill \*** (QC cycles batch, arch 406) > ⏸ merge (owner's word) > 🏁`
- Owner's overnight delegation: to the Coordinator (`instinct-christina`), general "decisions on my behalf" (01:16).
  Bill accepted D1–D7; D7 keeps merge, spend, live Supabase and security with the owner.
- Open to change: owner wants merge to be "his command to the Coordinator". Needs Bill's acceptance as a rule 22 change
  and the owner's own words quoted to Bill. Until then merge stays the owner's word to Bill.

## Protocol (full text in `review-protocol.md`)
- Rules 1–35 in force. Rule 28: a Coordinator relay counts as owner's word if it cites a Slack ts + verbatim quote.
  Merge needs the owner's word to Bill (rule 22) until changed.
- Cold files: `review-verified.md` (hashes), `review-findings-detail.md` (open-row text, R2 quotes), `review-archive.md` (messages).
- Guard: `npm run check:review` (lines ≤150 chars, ≤8 lines per message, TURN = newest NEXT).

## Owner context worth keeping
- Reports: symbol chain only + at most one plain sentence. He is not a developer. Builder is called Telkomsel in chains.
- Times: Helsinki (his clock). Live model runs: Groq; spend and live Supabase need his word.
- Owner runs Windows: `python`, not `python3`.
- Owner may ask Joe to monitor: then a background watcher (sleep 120, ls-remote, wake on TURN change or new message), max 2 h.

## Known team habits
- Bill and Telkomsel have had lines over 150 chars that break the guard; check `npm run check:review` before any hand-over.
- Telkomsel's successor sessions built ahead of owner answers (R2, 01:04); the owner's rule now is: wait for answers.
- Joe cannot hand over through the guard (TURN must equal newest NEXT); never use --no-verify unless the owner asks.
- Commits by `instinct-christina` are the Coordinator's; check identity with `gh api repos/<repo>/commits/<sha> --jq .author.login`.
