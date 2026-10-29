# v14 port: what changed

The v14 prototype (Nordea look, helpers, partner offers, one-time sharing, import) is now in the real app,
and Abel is a real language model (Gemini) with tools. Code owns the facts and the actions; the model writes the words.

## Where things live
- `src/server/abel.ts`: Abel's system prompt, tools and guardrails, plus import extraction.
- `src/server/llm.ts`: the only file that talks to a model. Swap provider here. Model name: `GEMINI_MODEL`.
- `src/server/finance.ts`: every number (balances, spending, goals, payday plan, partner fees).
- `src/server/routes.ts`: chat, card buttons, offers, sharing, import, `/api/state`.
- `src/server/accessGateway.ts`: every read is checked and logged; the adviser only reads during an active share.
- `partners/*.json`: fictional partners (one file each). `agents/*.json`: abel, offers, adviser.
- `src/components/`: Home, Pages (Abel knows, Who sees it, Autopilot, Rewards, Contact, More), Chat.

## Guardrails in code
1. The cabinet is read through the gateway before every reply.
2. Numbers in a reply must come from a tool or the cabinet; otherwise the reply is sent back once to be fixed.
3. The cabinet changes only via `proposeCabinetChange` (undo token, provenance). Sensitive topics need the customer's tap.
4. Money never moves from chat: `offerTransfer` shows a confirm card; the customer confirms.
5. Partner offers: registry only, never when turned off, one per partner per chat, tailored only with
   entries allowed for offers. The fee is computed in code and always shown; part of it goes back to the customer.
6. "Based on N things" lists only entries the gateway returned that turn.

## Test locally without a Gemini key
`LLM_PROVIDER=mock npm run dev` uses a scripted stand-in (`src/server/llmMock.ts`). Never set it in AI Studio.
In AI Studio the key is injected automatically, so the real Abel answers there.

## Saved data (Supabase)
- `src/server/store.ts`: talks to Supabase. Every record is a row in `abel_records` (kind, id, user_id, data). Kept files go to the private bucket `abel-documents`.
- `src/server/db.ts`: still keeps everything in memory for speed. After each change it sends only the changed records to Supabase. Requests that change data answer only after that save. If Supabase is down, it retries every 5 s and shows it in More → Saved data.
- Without `SUPABASE_URL` / `SUPABASE_SECRET_KEY` it uses `data/cabinet-db.json` like before (resets on restart).
- First start with an empty table: today's data is copied into Supabase. After that, Supabase is the source of truth.
- Setup: run `supabase/setup.sql` once, then add the two secrets in AI Studio.
- Limit: built for one running copy of the app (fine for the demo). Two copies at once could overwrite each other's changes.

## Your documents (option C)
- `src/server/documents.ts`. Off by default: a file is read once and not kept, not even a preview.
- "Keep a copy" in the Add to chat sheet stores it for 30 days (`KEEP_DAYS`), then it deletes itself. The things saved from it stay.
- Delete from the chat bubble or Abel knows → Your documents. If things were saved from the file, the customer chooses: delete them too (for good, with their history) or only the file.
- Who sees it → Your data: documents count, and "Delete my chats".

## Duplicate check and history
- `src/server/similar.ts`, done in code before saving. Same thing again → not saved. Same thing with a new amount or date → a card: Update it / Keep both / Leave it. Imports mark look-alikes and can update the existing item.
- Every add, change, removal, confirmation and undo is a row in `entryHistory`: who (you / Abel / Nordea), where, and before → after. Shown under "History" on each item and goal.

## Answers that always arrive (chain + bank-code answers)
- `src/server/llmChain.ts`: with `LLM_PROVIDER=openai`, Abel asks the models in order: `LLM_MODEL` → the other free Groq models → Gemini. A model that hits a limit rests for exactly as long as the limit says, and the next one answers at once. Photos and scanned PDFs go only to models that read images (Gemini).
- `src/server/abelOffline.ts`: if every model is resting, the bank's code answers the common questions with real numbers: goals, spending, pay, balance, "can I afford", flat search (homes card), talk to a person. No "busy" message.
- Customers never see technical details. Your team turns them on in More → Show technical details. More → AI connection shows each model and why it rests.
- Fewer tokens per answer: the balance, salary, goal and payday tools aren't offered to the model (FACTS already have the numbers), a chat sends at most 10 earlier messages, and a step that did an action and wrote its text needs no second call.
- Files: Excel (.xlsx) and CSV are read as tables. PDFs are read from their text (any model); scans and photos need Gemini.
- More → Check Abel's answers: 12 real questions on a copy of Lauri, graded automatically (about 15–20 AI requests).
