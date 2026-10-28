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
