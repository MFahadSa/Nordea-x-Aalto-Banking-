# Nora whole-product audit and video handoff (24 Nov 2026)

Branch `fix/nora-whole-product-audit`, from `main` at `f4284ad` (which contains PR #69).
This is an evidence record and a recording guide. It does not claim the product is production ready.

**What the evidence is.** Every result below comes from local runs with a *scripted* model: fixed replies fed
through the real `/api/chat` and `/api/actions` routes and the built app. That shows what the app's code allows
and refuses. It does **not** show how a live model behaves. No real model was called in this pass. No
credentials were available here, and the owner had not confirmed spending of the remaining paid allowance
(USD 1.501987).

All customers, partners and amounts are fictional demo data. Simulated parts (partner replies, refund replies,
moves between demo accounts) stay labelled as simulations in the app.

## 1. Capability inventory and risk map

| Area | What the customer can do | Who decides | Main risk | Covered in this pass |
| --- | --- | --- | --- | --- |
| Chat with Nora | Ask in plain English and get model-written answers | Model writes; code checks figures, roles and claims | Invented or role-swapped personal figures; a false "done" | Yes (D1, D2, D4, D6–D8) |
| Personal figures | Budget, spending, income, payday plan, goal progress | Code supplies role-bound facts; the model may quote them | A real number given the wrong meaning | Yes (D2, D6) |
| Transfers (demo) | One-time or monthly move to savings or the car fund | Only a tap on the card moves money | A typed "yes" treated as consent; double moves | Yes (D1, D7, D9; 409 on repeat tap; reload) |
| Goals | Propose, update or remove goals | Only a tap on the goal card saves | Saving without consent; duplicates | Goal card checked; refused-save wording fixed (D3) |
| Facts about the customer | Nora may suggest remembering something | Customer must agree; "don't save" is respected | Saving what the customer refused | Yes (D3) |
| Partner offers (fictional) | Browse homes, movers, energy, insurance, planner | Code decides when a card fits; offers can be switched off | Repeated cards after "no" | Observed OK; not changed |
| Adviser handoff | Share chosen facts with a simulated adviser | Customer picks the scope | Over-sharing | Existing suites only |
| Refund helper | Draft and track a refund with a simulated merchant | Customer opts in per step | Wrong amount; duplicate arrival | Existing refund suite only |
| Customer switching | Demo picker: Lauri, Eeva, Alex | Every customer route must name the customer | A request with no id treated as Lauri | Yes (D5) |

## 2. Root causes found and fixed

| # | What the customer saw (scripted reproduction) | Root cause | Fix |
| --- | --- | --- | --- |
| D1 | With a transfer card waiting, typing "yes" got "Great, done!" and nothing had moved | Nothing checked that a reply claiming completion matched a real change | Completion claims are refused unless a real change or a tapped confirmation exists. The honest reply points to the card |
| D2 | Correct figures in Nora's own words were thrown away ("I could not verify the requested calculation") | In bounded mode any digit in prose was refused, even an exact and correctly described fact | A figure in prose passes only when its value, unit and stated meaning match one fact Nora was actually shown. Role swaps, invented values, percentages and unchecked months are still refused |
| D3 | "Don't save this … move 50 to savings" gave goal-name wording beside a transfer card | The refused-save text was written for goals but used for every refused save | Goal text only for goal writes; after a refused save, "noted" or "saved" is refused |
| D4 | "Done! It is set up" could reach the customer with no card at all | Same as D1 | Same check, with "Nothing has been done yet" |
| D5 | A request with no customer id quietly acted as Lauri | 22 route handlers defaulted the id to `lauri` | Customer routes return 400 `MISSING_CUSTOMER_ID`. The app always sends the id |
| D6 | Greeting → "yes" → budget failed in the phone journey even with correct figures | Which bank facts count as relevant was decided from the word "yes" alone | A bare "yes" is read with Nora's own question that it answers. With no such question, nothing extra becomes relevant |
| D7 | "A transfer of 40 € to the car fund" was refused, and the failure text did not mention the card | The amount on the card the app had just prepared was not a checkable fact | The card amount counts as a fact for that turn. If the words still fail, the reply describes the card from the card itself |
| D8 | "Which month do you want to start, January or March?" was refused | Month names in a question were checked as if they were claims | Months offered in a question are not checked as claims. Figures in questions still are |
| D9 | The honest reply said "tap Confirm", but the card buttons say "Yes, move it now" or "Save goal" | Text written without checking the card labels | "Use the button on the card above" |
| D10 | The env test failed; a module could read settings before `.env` was loaded | `server.ts` imported goal code before `loadEnv` | `loadEnv` is imported first |

## 3. Recording guide

**Start state.** A fresh or reset copy. The app loads the fictional demo customers by itself, and
"Reset demo data" starts again. Choose **Lauri** in the customer picker. Record with a real model only after
the checks in section 5 pass.

| Story | Say | Expect | Consent boundary | Final state |
| --- | --- | --- | --- | --- |
| Greeting → budget | "hey", then "yes" | A greeting that offers a budget look, then a budget answer whose figures match Lauri's demo data | None (read only) | Nothing changed |
| Wrong meaning refused | "what is my salary?" (if the model gets it wrong) | Either the right figure stated with its meaning, or "I could not check the figures in my answer…" | None | Nothing changed |
| One-time transfer | "move 40 euros to my savings" | A card with "Yes, move it now" and "Cancel" | Typing "ok do it" moves nothing; Nora says to use the button | After the tap, money moves once. A second tap or a reload does not repeat it |
| Goal | "I want an emergency fund of 5000 euros by June 2027" | A goal card with "Save goal" and "Do not save" | Saved only after the tap | Goal shown on the goals page |
| Don't save | "Don't save this, I'm getting divorced. Move 50 to my savings please." | A transfer card; nothing about the divorce is stored | The fact is not saved | No new saved entry |

**Phone check.** `scripts/browser-phone-journey.ts` runs the first, second and third stories at 390×844 with
touch emulation against the built app (scripted model). Screenshot strip: `docs/images/audit-2026-11-24-phone-journey.png`.

## 4. Limits that remain

- Live model quality has not been tested in this pass.
- Some short replies ("no idea", "not now", "no, the other one") still go to the model instead of code-owned handling.
- The prose check is sentence-based. "Housing is the biggest part at 1 150 €" is refused because the sentence does not say it is spending. The model is then asked to rewrite.
- Arithmetic in prose (for example 150 × 12) is accepted only from figures already verified in the same reply. Other calculations need the existing calculation path.
- The transfer card's destination reads "Savings, for 'Buy a flat with my partner'". This is how the demo links savings to the main goal; it can look as if the money goes to a goal rather than an account.
- After a reload the app opens on the home screen, not the chat.

## 5. Post-publication checks before recording

1. Confirm the published revision is this branch's merge commit. The hosted backend does not report it.
2. With the owner's approval of the remaining allowance, run a bounded real-model pass of the stories above.
3. On a phone, check the transfer card buttons and the honest "use the button" reply.
4. Check that a request with no customer id gets 400 on the hosted backend.

## 6. Real-model run on the published app (24 Nov 2026, after PR #70)

The owner published PR #70, confirmed the deploy, and approved the run. Nine chat turns ran through the
published app at phone size (375×812) as Lauri, one attempt each, with no retries. No confirm button was
tapped, so no demo money or goals were changed. Lauri's balances, goals and saved entries were read before
and after the run and were identical. The hosted backend rejected a request with no customer id (400
`MISSING_CUSTOMER_ID`), which confirms the new code is live.

| Turn | Result | Verdict |
| --- | --- | --- |
| "hey" | "Hey Lauri! How can I help you with your money today?" | OK. The live model did not offer a budget look, so the "hey → yes" story cannot be scripted for the video |
| "how is my budget looking?" | Correct figures (3 900 income, 2 107 spending, 425 saving, 1 370 remainder), but as stiff code rows with no prose, and one row twice | Correct but not video-ready. **Duplicate row fixed (R1)** |
| "what is my salary?" | "Your current salary is 3900 EUR per month." plus the same figure as a code row | Correct; repetitive |
| "move 40 euros to my savings" | Transfer card shown, but the text above it said "Nothing has been done yet. Tell me what you would like to do…" | **Wrong text beside a ready card; my PR #70 fallback did not consider a card made in the same reply. Fixed (R2)** |
| "ok do it" | The model asked for the amount again and leaked internal output: "…We need to ask clarification.{ "clarification": …" | **Leaked JSON fixed (R3).** Losing track of the waiting card remains (R4, open) |
| "Don't save this, I'm getting divorced. Move 50…" | "a one‑off transfer of 50 € … is ready. Just confirm below" with card; nothing saved | OK (D3 and D7 work live) |
| "yes" | Honest ("Tap the card below to confirm"), no false "done", but a **second card for the same 50 €** | **Could move money twice if both were tapped. Fixed (R5)** |
| "I want an emergency fund of 5000 euros by June 2027" | Goal card with Save goal / Do not save; code-written text with an "Answer not verified" label | Safe; the label looks odd on video (open) |

Unanswered cards from this run remain in Lauri's published chats: two 50 € cards, one 40 € card and one goal
proposal (the goal proposal expires after 30 minutes). Reset the demo data, or cancel them, before recording.

## 7. Natural-conversation stress pass (24 Nov 2026)

**Live probe.** 12 real-model turns ran on the published app as Lauri, written the way people actually type:
typos, slang, half sentences, corrections, Finnish. Nothing was tapped. What broke:

| Customer wrote | What happened | Root cause | Status |
| --- | --- | --- | --- |
| "ugh i dont get it, money just kinda disappears every month lol" | "I could not verify which plan that calculation refers to." | A code question for calculation follow-ups fired on any "it" plus "month" | Fixed: only for real calculation follow-ups |
| "the elecricity one… doubled" / "electric sauna… better deal?" / "panicking about the move" | No partner card; generic tips with an invented "Quick actions" list | Offers were decided only by keywords in the current message | Fixed: Nora may offer a partner when the customer's need is clear, quoting their exact words (code checks the quote, offer settings, refusals, one per chat) |
| "actually make it 60" | Figure check failed | An amount the customer just said was not a checkable fact | Fixed: it may be repeated as what they asked for (not as a balance) |
| "ok go" with a card waiting | Asked for the amount again | The model was not told a card was waiting | Fixed: waiting cards are in Nora's context; a typed go-ahead cannot open a new amount question |
| "wanna start saving for a car, maybe 8k by next summer?" | "Please check the goal name…" with no card | Generic refusal text replaced the model's question | Fixed: the model asks; claims of saving are still blocked |
| "am i doing ok w the flat thing" / "how is my budget" | Seven stiff "For 'X', field is N EUR" rows | Form-like renderer | Fixed: plain sentences in one paragraph; rows already said in prose are dropped |
| Goal proposal or card description | "Answer not verified" label | Accurate code-written outcomes carried an error detail | Fixed: labelled "Checked by the app" |
| "paljonko mulla on säästöissä?" | Figure check failed | The prose check reads English meaning words only | Open (English is this pass's delivery language) |
| "btw my mom is sick, dont write that down… how much did i spend on food" | Step limit, then a generic failure | Not reproduced with the scripted model | Open; re-check live |

**Free stress run.** `scripts/stress-natural-language.ts` runs 47 messy-language cases through the real routes,
part of `npm run test:audit`. On `main` 28 of 47 pass; on this branch 47 of 47. It also lists phrasings the old
keyword path misses ("gap"), which the need-based partner path now covers.

## 8. Showcase story: from confusion to a useful offer

The goal of this story: Lauri arrives confused, Nora finds the cause with short, natural questions, quietly
keeps what matters, and only then shows one fitting fictional partner, with its fee in plain view.

1. **Lauri:** "hey so my bills feel kinda crazy lately and idk where its all going"
   **Expected:** one short question back (which bill, since when). No tips list.
2. **Lauri:** "the electricity one, it basically doubled since we moved in"
   **Expected:** one sharp follow-up (anything new that uses a lot of power, contract type).
3. **Lauri:** "we have an electric sauna lol and the contract is whatever the old owner had. could i get a better deal?"
   **Expected:** a short explanation tied to the sauna and the old contract, plus the Lumivalo Energy card
   (fictional), showing "Nordea gets 25 € if you switch, and gives half of it back to you."
4. **Optional:** open "Nora knows" to show what was kept from the chat.

Consent boundary: browsing the partner is free, and nothing is switched or bought in the app. The live model
words each reply differently, so rehearse once and keep the take where Nora asks before she offers.
