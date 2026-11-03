<div align="center">

# 🗄️ The Banking Context Cabinet

**Three agents, three databases, one shared document - and the customer decides what gets stored.**

*A Nordea × Aalto University mobile banking concept - `instinct-prototype-v3` branch*

[![Node 22.13+](https://img.shields.io/badge/Node-22.13%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![SQLite](https://img.shields.io/badge/SQLite-node%3Asqlite-003B57?logo=sqlite&logoColor=white)](https://nodejs.org/api/sqlite.html)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite 8](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Express](https://img.shields.io/badge/Express-API-000000?logo=express&logoColor=white)](https://expressjs.com)

[**Quick start**](#-quick-start) · [**The idea**](#-the-idea-in-30-seconds) · [**How a session works**](#-how-a-session-works) · [**Features**](#-features) · [**Routes**](#-routes) · [**Checks**](#-checks) · [**Known limits**](#-known-limits)

</div>

> [!NOTE]
> This branch is a **research prototype** exploring a three-agent architecture. It is not merged into `main`. All bank data, partners and customers are fictional.

## 💡 The idea in 30 seconds

Instead of one assistant reading one database, this branch splits the work between **three agents**. Each agent opens **only its own database** - that rule is enforced by a source-scan test, not by convention. Agents never read each other's stores; they talk through **bus messages** and a shared working document, **`context.md`**, that is rebuilt for every customer session.

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>🙋 Personal agent</h3>
      Works for the customer. Opens <b>only the User DB</b>. Answers chat from the finished <code>context.md</code>, shares goals by title, and keeps raw detail on the customer's side.
    </td>
    <td width="33%" valign="top">
      <h3>🗄️ Context Memory agent</h3>
      Owns the cabinet. Opens <b>only the Context Memory DB</b>. Finalises each session's document, stores accepted items, and runs decay maintenance - by <i>asking</i> the other agents, never by opening their databases.
    </td>
    <td width="33%" valign="top">
      <h3>🏦 Nordea agent</h3>
      Works for Nordea. Opens <b>only the Nordea DB</b>. Answers with aggregates and proposes goal-relevant insights; raw transactions never leave its store.
    </td>
  </tr>
</table>

**Abel**, the in-app assistant, joins the same pattern: its User DB facts come from the personal agent *by message*, and it reads only the current session's finalised `context.md`. Every figure in an Abel reply must come from code or that context - otherwise the reply is sent back to be fixed.

```mermaid
flowchart TD
    CHAT["💬 Customer chat"] --> APP["⚙️ App layer<br/><code>orchestrator.ts</code>"]
    APP -->|"'abel-facts' message"| PA["🙋 Personal agent<br/>opens only <code>user.db</code>"]
    APP -->|"this session's finalised document"| CTX[("📄 context.md<br/>rebuilt per session")]
    PA <-->|"bus messages"| BUS["🚌 Shared bus"]
    CM["🗄️ Context Memory agent<br/>opens only <code>cm.db</code>"] <-->|"bus messages"| BUS
    NOR["🏦 Nordea agent<br/>opens only <code>nordea.db</code>"] <-->|"bus messages"| BUS
    PA -->|"Customer section"| CTX
    CM -->|"Context memory section + finalise stamp"| CTX
    NOR -->|"Nordea section"| CTX
    APP --> ABEL["💬 Abel chat<br/><code>orchestrator.ts</code> - answers from context.md"]
```

## 🚀 Quick start

**Prerequisites:** [Git](https://git-scm.com), [Node.js](https://nodejs.org) **22.13 or newer** (the stores use the built-in `node:sqlite`), and [Python](https://www.python.org) **3** (standard library only - no `pip install` needed). Nothing else. An AI key is optional for a first look.

```bash
# 1. Get the code and switch to this branch
git clone https://github.com/coolkowkank/Nordea-x-Aalto-Banking-.git
cd Nordea-x-Aalto-Banking-
git checkout instinct-prototype-v3

# 2. Install
npm install --legacy-peer-deps

# 3. Load the fictional bank data (see seed/README.md)
python scripts/load_data.py seed/demo --target file   # local files; drop --target file for the hosted Supabase stores
# "python" not found? The command is "python3" on most Mac/Linux machines - both work.

# 4. Start it with the scripted stand-in (no key needed for a first look)
LLM_PROVIDER=mock npm run dev        # bash (Mac/Linux)
# PowerShell:   $env:LLM_PROVIDER="mock"; npm run dev
# Windows cmd:  set LLM_PROVIDER=mock && npm run dev
```

`LLM_PROVIDER=mock` is a no-key stand-in the tests use - fine for clicking around, but every answer is scripted. The normal run uses a real model: set a Gemini or Groq key (below) and start with plain `npm run dev`.

**Where to go once it is listening on port 3000:**

| Page | What it is |
|---|---|
| **http://localhost:3000/** | The main Abel app (the banking UI from `main`) |
| **http://localhost:3000/arch.html** | The three-agent demo: pick a demo customer (`alex`, `eeva` or `lauri`) in the Customer picker and chat - goals are added, changed or removed by telling the personal agent in the chat |
| **http://localhost:3000/dev-monitor.html** | Read-only developer monitor - on by default; set `DEV_MONITOR=0` to turn it off (same per-OS form as `LLM_PROVIDER` above) |

**Real AI answers (the normal run).** Copy `.env.example` to `.env` and add one free key, then restart without `LLM_PROVIDER=mock`. (`.env.example` is worded for the hosted AI Studio deployment; locally the same variable names go in `.env`, which git ignores.)

- **Gemini**: create a free key at [aistudio.google.com](https://aistudio.google.com) and set `GEMINI_API_KEY=...`.
- **Groq** (free tier): create a key at [console.groq.com](https://console.groq.com) and set `LLM_PROVIDER="openai"`, `LLM_BASE_URL="https://api.groq.com/openai/v1"`, `LLM_API_KEY=...`, `LLM_MODEL="openai/gpt-oss-120b"`.

**Troubleshooting**

- `npm run dev` exits at once or complains about `node:sqlite`: your Node is older than 22.13 - install the current LTS from [nodejs.org](https://nodejs.org).
- Port 3000 already in use: stop the other app, or run on another port - `PORT=3001 npm run dev` (bash), `$env:PORT=3001; npm run dev` (PowerShell), `set PORT=3001 && npm run dev` (cmd).
- `python` is not recognized / command not found: use `python3`; if neither exists, install Python 3 from [python.org](https://www.python.org) (no packages needed). The npm test scripts try both names automatically (via `scripts/run_python.mjs`).

Open **http://localhost:3000/arch.html** for the three-agent demo UI.

The developer monitor at **http://localhost:3000/dev-monitor.html** is on by default - set `DEV_MONITOR=0` to turn it off. It shows private cards, so always set `DEV_MONITOR=0` on a hosted or shared deployment.

<details><summary>Demo UI controls (arch.html)</summary>

- **Customer picker**: pick a demo customer; chat answers from that session's document.
- **New session**: starts a fresh session; its next question rebuilds `context.md`.
- **Goals**: add, change or remove goals by telling the personal agent in the chat
  ("add goal ...", "change goal X to Y", "remove goal X"); the goal cards below the chat box
  keep each goal's **edit**/**delete**.
- **Context Memory and Nordea windows**: show the processed cards the agents put on
  `context.md` (each combining several stored records, never raw rows or the whole cabinet).
- **Upload bank file**: imports a JSON/CSV statement through the airlock.
- **Check feed**: applies new rows of the Supabase `nordea_feed` table (feed section below).
- **Agent off/on switches**: pause one agent's reasoning. **Park** silences the whole cabinet.
- **Permissions**: the standing review level for bank-side proposals and the User-card approval
  mode. Default 'Review everything': only level 0 passes and levels 1-2 wait in
  **waiting for you**; 'High risk mode' also passes level 1; 'No permission' passes every level
  as a logged mode pass - never an AI certification - and a card the AI could not level counts
  as level 2.
- Goal-relevant Nordea insights run by themselves after a goal is added or changed; the review
  and airlock queues take accept/reject decisions.

</details>

<details><summary>Live-AI view (both pages)</summary>

- Each agent line shows whether its last reasoning run finished on a model (and which chain
  member answered; a single provider such as Gemini shows its label and model), failed and fell
  back to scripted, was never attempted since the server started, is off, or has no provider.
  Observations older than 30 minutes are marked stale.
- The three agents share ONE provider chain, shown once with each member's
  key/resting/last-ok/last-problem state. A key being set means configured, not working.
- The view is built from in-memory results (`ai` in `/api/arch/:uid/state` and
  `/api/dev/monitor`), is per customer, resets on restart, never calls a model on load or
  refresh, and error text is sanitized (keys and tokens removed, 160 chars).

</details>

Without `LLM_PROVIDER=mock`, Abel uses Gemini (`GEMINI_API_KEY`) or an OpenAI-compatible
provider, as on `main`.

### Settings worth knowing

| Variable | Effect |
|---|---|
| `LLM_PROVIDER=mock` | Scripted stand-in for the models - local tests and a first look without a key |
| `LLM_GEMINI_FIRST=true` | Try Gemini before the OpenAI-compatible models (default: they answer first, Gemini is the last fallback) |
| `LLM_MAX_CALLS` | Cap on real provider HTTP calls per process (default 0 = UNCAPPED, no cap). With a cap set, past it a configured model gives an explicit failure reply and says so; the cycle loop keeps a best-effort reserve (review 1 + final 1; another cycle needs 2 plan runs + review + final) and cannot guarantee a finish |
| `LLM_AGENT_MAX_STEPS` | Tool-call steps each answering model may take per run, fresh per model with the conversation kept (default 20); the 120s per-call timeout is unchanged |
| `LLM_STEP_TIMEOUT_MS` | Timeout per model call in milliseconds (default 120000; a timed-out request is cancelled) |
| `USER_DB_URL` · `CM_DB_URL` · `NORDEA_DB_URL` | The hosted agent stores (below); unset = local SQLite |
| `SUPABASE_URL` + `SUPABASE_SECRET_KEY` | Only the kept-documents bucket still uses these (below); unset = local files |

### Optional: hosted storage on Supabase

Local files are the default and need nothing. To host the data on [Supabase](https://supabase.com) instead:

1. Create a project and apply the schema - either paste the SQL files in the *SQL Editor* in order (**supabase/three-agents.sql**, then **supabase/nordea-feed.sql**, then **supabase/role-smoke.sql**, giving each agent role a letters-and-digits password: `alter role agent_user password '...';`), or run the one-command bootstrap `python3 scripts/load_data.py --init`: it applies all three via psql with `SUPABASE_DB_URL` from the environment or `.env.local` (idempotent; the URL travels via libpq env vars, never argv), creates the agent roles with passwords only when they do not exist yet (existing role credentials are never rotated; passwords come from `AGENT_USER_PASSWORD` / `AGENT_CM_PASSWORD` / `AGENT_NORDEA_PASSWORD` or are generated, never printed), writes the three role URLs to `.env.local` (0600), and ends with the role-smoke PASS/FAIL check.
2. Everything the app stores lives in the three agent databases - there is no plumbing file or
   fourth store. If you have an old `data/cabinet-db.json`, run `npm run migrate:legacy` once: it
   moves every record into the right agent database, verifies the move field-by-field, and only
   then deletes the file. (`git pull` downloads code; it never migrates your data by itself.)
   `supabase/setup.sql` (the old `abel_records` plumbing table) is retired - the app no longer
   reads or writes it. Kept documents still use `SUPABASE_URL` + `SUPABASE_SECRET_KEY` when set.
3. Put the connection strings in `.env` (see `.env.example`). Use the session pooler host from Supabase -> *Connect*; the direct `db.<project>` host is unreachable on networks without IPv6:
   ```
   USER_DB_URL="postgresql://agent_user.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
   CM_DB_URL="postgresql://agent_cm.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
   NORDEA_DB_URL="postgresql://agent_nordea.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
   # Optional - only for the hosted plumbing table from step 2:
   SUPABASE_URL="https://<project-ref>.supabase.co"
   SUPABASE_SECRET_KEY="sb_secret_..."
   ```
   Each store only ever uses its own role's URL - no service key reaches an agent path (enforced by `supabase/three-agents.sql` grants and pinned by tests).
4. Load the data without `--target file`: `python scripts/load_data.py seed/demo` first hydrates the local agent databases from the hosted tables, then loads, then pushes everything back (through `scripts/load_remote.ts`, each store with its own role) - a load merges, it never drops hosted rows.

At startup the app replaces its local agent databases with the hosted rows (hydrate) and flushes later writes back; if Supabase is unreachable it keeps working on the local files and logs the failure.

### Optional: the Nordea data feed

New (fictional) Nordea account data can be dropped into Supabase for the running app to apply:

1. Run **supabase/nordea-feed.sql** once in the SQL Editor, AFTER three-agents.sql (it grants the
   `agent_nordea` role); if you ran an older copy of this file, run the current one again. It creates
   `nordea_feed` and grants the Nordea agent's own role read + mark-applied rights: in hosted mode
   (`NORDEA_DB_URL` set) the feed works WITHOUT the service key; otherwise it falls back to
   `SUPABASE_URL` + `SUPABASE_SECRET_KEY`.
2. Add rows in *Table Editor* -> `nordea_feed`, or import the ready-made
   **supabase/nordea-feed-example.csv** (validate it first with `npm run check:feed`).
3. The app checks the table every 20 seconds while it runs, or immediately with **Check feed** on
   `/arch.html`; it writes back `applied_at` and `result` on each row. The `data` JSON shape is
   documented in `nordea-feed.sql` and `docs/bank-records.md`.

| Script | What it does |
|---|---|
| `npm run dev` / `npm start` | Start the server and app on port 3000 |
| `npm run build` | Build the frontend with Vite |
| `npm run lint` | Type-check with TypeScript (`tsc --noEmit`) |
| `npm test` | Run the bank-records tests |
| `npm run check:feed` | Validate the Nordea feed CSV applies cleanly |
| `npm run test:arch` | Run the three-agent architecture checks |
| `npm run test:e2e` | End-to-end proof the app, `/arch.html` and the monitor are one machine (boots a real server on a scratch dataset) |

## 🔄 How a session works

1. The customer's first question of a session opens a **build round**; `context.md` starts empty - nothing carries over from earlier sessions.
2. The **personal agent** writes the Customer section: the shareable part of the User DB (goals by title, never raw detail).
3. The **Context Memory agent** retrieves what is relevant from `cm.db` and writes the Context memory section.
4. The **Nordea agent** adds relevant aggregates from `nordea.db`.

With a provider configured (`GEMINI_API_KEY` or `LLM_PROVIDER=openai`), all three agents also **reason with an LLM**:

<details><summary>How the reasoning path works</summary>

- The CM and Nordea models get tools for their own database only and propose the round's
  retrieval plan and match terms, and the personal agent's model reads its own User DB through
  tools and composes the chat reply from what it saw.
- A figure the model writes that is not in the selected facts or its tool results - compared as
  whole numbers - drops the model's reply; the customer gets an honest answer that declines to
  quote unverified figures, never the invented number.
- Code validates every proposal and owns numbers, evidence, risk and every write.
- Each round record and chat answer states truthfully which path ran - `model`, `scripted`, or
  `scripted (model unavailable)` - and /arch.html shows it under each reply; the same status is
  auditable on the bus.
- On a related question the User AI can also send the cabinet back for another retrieval
  cycle - User AI > CM > Nordea > User AI, at most 5 cycles per turn - and stops as soon as its
  review says the facts are enough; when `LLM_MAX_CALLS` caps paid calls the final answer call
  stays reserved, best effort.
- Without a key the scripted behaviour runs unchanged (that is also what the tests use).

</details>

5. The Context Memory agent **finalises** the document and stamps it with the session id. Every later question in that session is answered from that document.
6. If an agent is off or the cabinet is parked, no round runs and no other session's document is served - the app says plainly that shared context is unavailable.
7. Accepted knowledge is stored in `cm.db`; decay maintenance re-checks it before reuse (below).

## ✨ Features

#### 🗂️ The shared document

| | Feature | How it works |
|:-:|---|---|
| 📄 | **Per-session `context.md`** | Rebuilt for every customer session, rendered from structured rows - never parsed back. |
| ✍️ | **Section ownership, enforced** | One writer module per section; the same source-scan that pins each agent to its own database pins the sections. |
| 🔎 | **Session stamping** | A document is served only when its `sessionId` matches the current session; a stale document is never wiped and never leaked across sessions. |

#### 🚦 Risk and permissions

| | Feature | How it works |
|:-:|---|---|
| 📏 | **Risk rules in code, card levels from the User AI** | Proposals are classed low/medium/high by code rules (`risk.ts`): sharing beyond the three agents, inferences, sensitive topics. A User card's level 0/1/2 is assigned by the User AI's model under the customer's rubric (highest applicable level wins); a code floor can only raise it, never set or lower it - a sensitive topic or an unsupported inference is level 2 whatever the model says. |
| 🧾 | **Observed vs inferred, derived** | "Observed" comes from the evidence (transaction ids + a total, or the customer's own words) - never trusted from the proposer's own flag. |
| 🎚️ | **Standing permissions** | Set once via `POST /api/arch/:uid/permissions`. User cards follow the pass table: 'Review everything' (the default) passes only level 0; 'High risk mode' also passes level 1; 'No permission' passes every level as a logged mode pass, never an AI certification - a card the AI could not level counts as level 2. What cannot pass waits in 'waiting for you'. Bank-side proposals keep the review level: 'review everything' (the default) keeps every proposal waiting in merge review; 'only high risk waits' stores low and medium risk items automatically - always logged, explainable and disputable. |

#### ⏳ Decay maintenance

| | Feature | How it works |
|:-:|---|---|
| 🔁 | **Re-check before reuse** | The CM agent detects possible decay from stored evidence and asks the owning agent to confirm - it never opens another agent's database. |
| 🧮 | **Five decay signals** | A changed total; churned transactions (a hash of the full id set is compared like with like, so large accounts don't false-flag); age past 30 days without verifiable evidence; evidence that was never stored; and a goal the customer removed, which flags its entries too. |
| 🚩 | **Plain-language flags** | The customer is told which entries went stale, why, and whether refreshed figures were stored automatically or wait in merge review. |

#### 🧑‍⚖️ Customer control

| | Feature | How it works |
|:-:|---|---|
| 💬 | **Explain** | Every cabinet item answers "why do you know this?" with its source and the message that proposed it. |
| ✋ | **Dispute** | The customer can mark an item wrong; from then on it is filtered out of the context Abel receives, so its figures fail Abel's grounding check. The stored document keeps the `[disputed]` mark and the history. |
| ↩️ | **Undo** | Automatically stored items can be undone per entry; manually reviewed items are disputed instead, so provenance survives. |
| ⏸️ | **Park and agent switches** | Parking the cabinet or switching an agent off silences that part of the pipeline without deleting anything. An off switch gates the agent's **reasoning** only - control writes from the app still land in its database. |

#### 💬 Abel, inside the architecture

| | Feature | How it works |
|:-:|---|---|
| 📨 | **Facts by message** | Abel's User DB facts come from the personal agent answering an `abel-facts` message - the app layer opens no agent store on this path (pinned by a source-scan test). |
| 📄 | **Session document only** | Abel receives the current session's finalised `context.md`; a missing or other-session document is rebuilt when possible and otherwise not served. |
| 🔢 | **Grounded numbers** | Figures from the shared context join the same grounding guard as tool results: a number Abel can't source sends the reply back to be fixed. |

## 🛣️ Routes

Under `/api/arch/` (`src/server/arch/routes.ts`; `:uid` = the customer):

**Customer ids are fail-closed (D12).** A canonical id is one or more of lowercase `a-z`, digits, `_` or `-`, and at most 234 characters - the storage limit: every file the store derives from an id is `<id><suffix>`, the longest suffix is 21 characters and one path component is at most 255 bytes. Anything else (`a.b`, `a b`, `a/b`, email-like ids, `Lauri`) gets a typed `400 INVALID_CUSTOMER_ID` (or `CUSTOMER_ID_TOO_LONG` past 234); the check fails closed before storage effects - no file is opened or written - and the id is never rewritten, truncated or lowercased into a look-alike id. The data loader validates every id in its input first, so one bad id writes nothing. Hosted rows under a non-canonical id are skipped on hydrate (counted and shown in the state response), never written, deleted or renamed. There is no migration of old ids.

| Route | Purpose |
|---|---|
| `GET customers` | The customers with agent data (the demo UI's picker) |
| `GET :uid/state` | Cabinet, agents and document state for the demo UI |
| `POST :uid/session/new` | Start a fresh session; the next question rebuilds the document |
| `POST :uid/chat` | Session chat answered from the session's document |
| `POST :uid/goals` · `POST :uid/goals/:goalId` · `POST :uid/goals/:goalId/delete` | Add, edit and delete customer goals |
| `POST :uid/permissions` | Set standing permissions (`reviewLevel: 'all' \| 'high'`, `userCardMode: 'No permission' \| 'Review everything' \| 'High risk mode'`) |
| `POST :uid/agent-query` | Ask an agent a direct question |
| `POST :uid/airlock/:batchId/approve` · `POST :uid/airlock/:batchId/reject` | Approve or reject what enters the User DB |
| `GET :uid/review` · `POST :uid/review/:messageId/accept` · `POST :uid/review/:messageId/reject` | The merge-review queue |
| `GET :uid/entries` · `GET :uid/entries/:entryId/explain` · `POST :uid/entries/:entryId/dispute` · `POST :uid/entries/:entryId/undo` | Cabinet entries: list, explain, dispute, undo |
| `POST :uid/cabinet/park` · `POST :uid/cabinet/resume` | Park or resume the whole cabinet |
| `POST :uid/agents/:agent/off` · `POST :uid/agents/:agent/on` | Switch one agent off or on |
| `DELETE :uid/db/:which` | Delete a database (customer-driven) |

App-level routes the demo surfaces use (`src/server/routes.ts`, `src/server/devMonitor.ts`):

| Route | Purpose |
|---|---|
| `GET /api/dev/monitor` | The developer monitor's read-only view (on by default; `DEV_MONITOR=0` turns it off) |
| `GET` · `POST /api/nordea-data` · `POST /api/nordea-data/check` | The Nordea feed: inspect, apply, and check for new rows (the **Check feed** button) |
| `POST /api/import` | Import a bank file through the airlock (the **Upload bank file** button) |

## ✅ Checks

| Check | Command | Covers |
|---|---|---|
| Architecture tests | `npm run test:arch` | 410 assertions: the one-database rule (source scan), per-session documents, reactive rounds, risk rules, permissions, decay, undo, the Abel integration, the G4 LLM planning path (mock provider) and the negative cases |
| End-to-end | `npm run test:e2e` | 37 checks over a real booted server (incl. requestId dedup + late pickup): a goal shows in all views, a review decision changes what the chat answers from, a bank import updates app + arch + monitor, session and top-up rounds run, and no code reads the old store |
| Data-layer adapter | `npm run test:adapter` | 44 checks: the old app store as an adapter over the three agent databases, legacy migration, and plumbing separation |
| Hosted sync | `npm run test:remote` | 36 checks against an in-memory Postgres double: hydrate, flush, failures, and the one-role-per-agent grants |
| Live hosted three-agent run | manual, evidence in `evidence/e2e/` | A real server booted against the hosted Supabase stores with a real model: session round with model plans, a model-composed chat answer grounded in context.md, goal add, contribution round, review accepts into Context Memory - then scoped cleanup restored the hosted tables to their pre-test hashes |
| Insight cards | `npm run test:insight` | Goal card figures tied out from the matched rows, honest sparse/scenario/projection wording, the model figure guard, and the `--init` setup SQL |
| review.md guard | `npm run check:review` | Keeps every review.md message inside the collaboration format |
| Type check | `npm run lint` | `tsc --noEmit` across the app |
| Bank records | `npm test` | Feed loading and bank-record maths |
| Feed CSV | `npm run check:feed` | The Nordea feed CSV applies cleanly |
| Customer ids (D12) | `npm run test:customer-id` | The canonical-id rule at every seam: loader input validation, hosted hydrate skipping (pool double), real-server HTTP 400s, arch.html customer switching, the 234-character storage preflight, fuzz, and the fail-closed route wrapper |

## ⚠️ Known limits

<details>
<summary>What this prototype does <b>not</b> do</summary>

- **Figures are labelled "of related spending"** - goal matching uses category and description keywords, so a saving goal's figure is the related spending, not a true savings-transfer balance.
- **Single process.** The round engine, bus and stores run in one Node process; `node:sqlite` files sit under the data dir. No distribution, no queues.
- **No live bank.** All account data is fictional, loaded with `scripts/load_data.py` (see `seed/README.md`).
- **Customer ids are canonical-only (D12).** Ids with dots, spaces, slashes, uppercase letters or email shapes are rejected by design - including any historical or hosted ones, which were not inventoried and are not migrated. Email-like ids stay unsupported until a separate storage-encoding change. The 234-character cap is measured on this system's 255-byte file-name limit; other operating systems' file-name or full-path length limits are unverified and not covered.
- **Demo UI.** `public/arch.html` and `public/dev-monitor.html` are demonstration surfaces, not the polished app from `main`.
- **Hosted mode is hydrate-then-flush.** With the Supabase role URLs set, the hosted tables replace the local agent databases at startup and writes flush back; if Supabase is unreachable the app keeps working on the local files (the honest fallback copy) and logs the failure.
- **Flush-back survives a graceful stop, not a hard kill.** The hosted flush is debounced (250 ms) after a store write; SIGTERM/SIGINT drain the pending flushes (10 s cap) before exit, so a normal stop loses nothing. A hard kill inside the debounce window can still lose the last write (found in the live run, evidence/e2e/findings/live-run-findings.md F-C).
- **A model that never finishes hands over first, then fails honestly - loudly.** In a provider chain, a member that answers without any tool call is skipped inside the same step, and a member that burns its whole step budget without the finish call hands the run to a fresh member ONCE. Only when no member produces a finish call does the round plan stay scripted - and the chat compose no longer serves a scripted task answer: the customer gets an honest failure reply that names the cause and states no figures were guessed from their stored records (D8). The failure is still named for audit: the reply caption and the bus read `scripted (provider error)` and the bus records the missing finish call (finding F-D). With no provider configured at all (`LLM_PROVIDER=mock` or no key) the scripted template still answers, unchanged (G29). Give a slow reasoning model more room with `LLM_AGENT_MAX_STEPS` / `LLM_STEP_TIMEOUT_MS`.

</details>

<details>
<summary>📁 Project structure (this branch adds <code>src/server/arch</code>)</summary>

```
src/server/arch/
  agents/       personal.ts · cm.ts · nordea.ts (each opens only its own store)
  store/        userStore · cmStore · nordeaStore · contextStore · busStore (node:sqlite)
                remote.ts - the hosted Supabase sync (one role URL per store)
  orchestrator.ts  rounds, sessions, decay maintenance, Abel shared context
  rounds.ts        round engine        dispatcher.ts   bus delivery
  llm.ts           the agents' model runs (tools, step limits, timeouts)
  types.ts         the shared architecture types
  risk.ts          code-rule risk levels
  text.ts          keyword and category matching
  routes.ts        /api/arch/:uid/* HTTP surface
supabase/
  setup.sql        RETIRED (G30): the old abel_records plumbing table - unused, kept for reference
  three-agents.sql the three hosted agent tables + one Postgres role per agent
public/
  arch.html        three-agent demo UI
  dev-monitor.html developer monitor
scripts/
  test-arch.ts     the architecture assertions (count in the Checks table)
  load_data.py     fictional bank data loader (see seed/README.md)
  load_remote.ts   pushes the local agent databases to the hosted tables (load_data.py calls it)
  run_python.mjs   runs Python as "python" or "python3", whichever the machine has
```

Abel's chat on this branch lives in the three-agent code (`src/server/arch/orchestrator.ts` and the personal agent) and answers from the session's `context.md`; the access gateway (`src/server/accessGateway.ts`) is shared with `main`.

</details>

## Team

Five roles ran this project. The chart shows who decided, who built, who checked, and who kept the record; the signatures below are each role's confirmed acknowledgment.

![Project team chart: project owner, Coordinator, Telkomsel, Bill (final QC / readiness gate), Joe](docs/team-chart-legend.png)

*Chart labels: names are project roles. @coolkowkank is shown as the repository owner account only - no binding to the approving user's identity is implied. Bill and Joe have no verified GitHub account.*

<details><summary>Mermaid approximation of the canonical image above (GitHub cannot render mermaid here)</summary>

```mermaid
flowchart TD
    Owner["Project owner (repository owner)<br/>@coolkowkank"]
    Coord["Coordinator (GitHub: instinct-christina)<br/>Relays the owner's words (timestamp + verbatim),<br/>verifies pushes independently, takes delegated routine decisions.<br/>Holds no TURN"]
    Tel["Telkomsel (GitHub: instinct-telkomsel)<br/>Sole executing writer of code and docs,<br/>acting only on its TURN: one commit per batch,<br/>guard PASS first"]
    Bill["Bill — independent QC<br/>Verdicts on every batch: findings, acceptance,<br/>docs review, final readiness before merge"]
    Joe["Joe — records and archive<br/>Keeps review.md small, archives hand-overs,<br/>answers progress. No TURN; never moves work"]

    Owner -->|direction + gates| Coord
    Coord -->|assignments + relays| Tel
    Coord -->|asks + relays| Bill
    Tel -->|hand-over| Bill
    Bill -->|verdicts| Tel
    Tel -->|hand-overs| Joe
    Bill -->|verdicts| Joe
    Owner -.->|"final QC / readiness gate"| Bill
```

</details>

### Signatures

- **Project owner (approving user)** — decided scope, spend, hosted/live, security and the merge gate; every owner word reached the team as a timestamped verbatim relay. Sign-off: original conditional once-only, merge-last grant recorded (refs 1793664882.497109, 1793665293.820759); not a new signature.
- **Coordinator** (GitHub: instinct-christina) — assignments and timestamped verbatim relays, independent verification of every builder push, delegated routine decisions (D1–D7, ratified id rules). Sign-off: confirmed by the Coordinator, 3 Nov 2026.
- **Telkomsel** (GitHub: instinct-telkomsel) — sole executing writer of code and docs; acts only on its TURN, one commit per batch, guard PASS before push. Sign-off: confirmed by committing this section on its TURN.
- **Bill** — independent QC; verdicts on every batch, from-zero README run green (mock/local) @5d80921. Sign-off: role content confirmed in review.md 11:54 @e355df7; the final readiness verdict on the resulting head remains Bill's to give.
- **Joe** — records and archive; keeps review.md hot, archives hand-overs, never moves work. Sign-off: role content confirmed in review.md 11:57 @5438715 (first readback 11:47 @04132d7).
