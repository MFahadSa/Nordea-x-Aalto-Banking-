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
