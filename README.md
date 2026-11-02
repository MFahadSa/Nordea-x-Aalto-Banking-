<div align="center">

# 🗄️ The Banking Context Cabinet

**Chat with your bank. Decide exactly what it knows about you.**

*A Nordea × Aalto University mobile banking concept*

[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite 8](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Express](https://img.shields.io/badge/Express-API-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Supabase](https://img.shields.io/badge/Supabase-optional-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Gemini](https://img.shields.io/badge/Google_Gemini-AI-8E75B2?logo=googlegemini&logoColor=white)](https://ai.google.dev)

[**Quick start**](#-quick-start) · [**Features**](#-what-it-does) · [**How it works**](#-how-it-works) · [**Three-agent architecture**](#-three-agent-architecture) · [**Branches**](#-branches) · [**Configuration**](#%EF%B8%8F-configuration) · [**Docs**](#-further-docs)

<br>

<img width="1900" height="1000" alt="The Banking Context Cabinet: app screenshots" src="https://github.com/user-attachments/assets/29cb5da6-584e-4264-bf98-a026b911e060" />

</div>

> [!NOTE]
> This is a **research prototype**. All bank data, partners and customers in it are fictional.

## 💡 The idea in 30 seconds

Customers chat with **Abel**, an AI banking assistant. Everything Abel knows lives in a **Context Cabinet** the customer controls, and every read goes through a logged **access gateway**.

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>💬 Abel</h3>
      Answers questions about balances, spending, goals and payday plans. <b>Numbers come from code</b>, not from the model's imagination.
    </td>
    <td width="33%" valign="top">
      <h3>🗄️ Context Cabinet</h3>
      One place for everything Abel knows. Each item shows <b>where it came from</b> and its full history.
    </td>
    <td width="33%" valign="top">
      <h3>🔐 Access gateway</h3>
      Every read by any helper is <b>checked against the customer's permissions</b> and logged in <i>Who sees it</i>.
    </td>
  </tr>
</table>

Demo personas: **Lauri**, **Eeva** and **Alex**.

## 📱 Screenshots

<table>
  <tr>
    <td align="center"><img src="public/assets/aistudio/light-1-home_02ebb269.png" width="190" alt="Home screen"><br><sub><b>Home</b></sub></td>
    <td align="center"><img src="public/assets/aistudio/light-2-home-scrolled_c8e6bc40.png" width="190" alt="Home screen, scrolled"><br><sub><b>Home, scrolled</b></sub></td>
    <td align="center"><img src="public/assets/aistudio/light-3-cabinet_73249412.png" width="190" alt="Context Cabinet"><br><sub><b>Context Cabinet</b></sub></td>
    <td align="center"><img src="public/assets/aistudio/light-4-chat_01a3464a.png" width="190" alt="Chat with Abel"><br><sub><b>Chat with Abel</b></sub></td>
  </tr>
</table>

<details>
<summary>🌙 Dark mode</summary>
<br>
<table>
  <tr>
    <td align="center"><img src="public/assets/aistudio/dark-1-home_2e46f63c.png" width="190" alt="Home screen, dark mode"><br><sub><b>Home</b></sub></td>
    <td align="center"><img src="public/assets/aistudio/dark-4-chat_81049fc4.png" width="190" alt="Chat with Abel, dark mode"><br><sub><b>Chat with Abel</b></sub></td>
  </tr>
</table>
</details>

## 🚀 Quick start

**Prerequisites:** [Git](https://git-scm.com), [Node.js](https://nodejs.org) **22.13 or newer** (the stores use the built-in `node:sqlite`), and [Python](https://www.python.org) **3** (standard library only - no `pip install` needed). Nothing else. An AI key is optional for a first look.

```bash
# 1. Get the code
git clone https://github.com/coolkowkank/Nordea-x-Aalto-Banking-.git
cd Nordea-x-Aalto-Banking-

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
| **http://localhost:3000/arch.html** | The three-agent demo: pick a demo customer (`alex`, `eeva` or `lauri`) in the Customer picker, add a goal, chat |
| **http://localhost:3000/dev-monitor.html** | Read-only developer monitor - on by default; set `DEV_MONITOR=0` to turn it off (same per-OS form as `LLM_PROVIDER` above) |

**Real AI answers (the normal run).** Copy `.env.example` to `.env` and add one free key, then restart without `LLM_PROVIDER=mock`. (`.env.example` is worded for the hosted AI Studio deployment; locally the same variable names go in `.env`, which git ignores.)

- **Gemini**: create a free key at [aistudio.google.com](https://aistudio.google.com) and set `GEMINI_API_KEY=...`.
- **Groq** (free tier): create a key at [console.groq.com](https://console.groq.com) and set `LLM_PROVIDER="openai"`, `LLM_BASE_URL="https://api.groq.com/openai/v1"`, `LLM_API_KEY=...`, `LLM_MODEL="openai/gpt-oss-120b"`.

**Troubleshooting**

- `npm run dev` exits at once or complains about `node:sqlite`: your Node is older than 22.13 - install the current LTS from [nodejs.org](https://nodejs.org).
- Port 3000 already in use: stop the other app, or run on another port - `PORT=3001 npm run dev` (bash), `$env:PORT=3001; npm run dev` (PowerShell), `set PORT=3001 && npm run dev` (cmd).
- `python` is not recognized / command not found: use `python3`; if neither exists, install Python 3 from [python.org](https://www.python.org) (no packages needed). The npm test scripts try both names automatically (via `scripts/run_python.mjs`).

Open **http://localhost:3000/arch.html** for the three-agent demo UI. Its controls: pick a customer in the **Customer** picker; chat (answered from the session's document); **New session** starts a fresh session whose next question rebuilds `context.md`; **Add goal** plus each goal's **edit**/**delete** manage the User DB goals; **Upload bank file** imports a JSON/CSV statement through the airlock; **Check feed** applies new rows of the Supabase `nordea_feed` table (feed section below); the agent **off/on** switches pause one agent's reasoning; **Park** silences the whole cabinet; **Permissions** set the standing review level; **Contribute** runs a Nordea round; and the review and airlock queues take accept/reject decisions. The developer monitor at **http://localhost:3000/dev-monitor.html** is on by default - set `DEV_MONITOR=0` to turn it off. It shows private cards, so always set `DEV_MONITOR=0` on a hosted or shared deployment. **Live-AI view (both pages):** each agent line shows whether its last reasoning run finished on a model (and which chain member answered; a single provider such as Gemini shows its label and model), failed and fell back to scripted, was never attempted since the server started, is off, or has no provider; observations older than 30 minutes are marked stale. The three agents share ONE provider chain, shown once with each member's key/resting/last-ok/last-problem state. A key being set means configured, not working. The view is built from in-memory results (`ai` in `/api/arch/:uid/state` and `/api/dev/monitor`), is per customer, resets on restart, never calls a model on load or refresh, and error text is sanitized (keys and tokens removed, 160 chars). Without `LLM_PROVIDER=mock`, Abel uses Gemini (`GEMINI_API_KEY`) or an OpenAI-compatible provider, as on `main`.

### Settings worth knowing

| Variable | Effect |
|---|---|
| `LLM_PROVIDER=mock` | Scripted stand-in for the models - local tests and a first look without a key |
| `LLM_GEMINI_FIRST=true` | Try Gemini before the OpenAI-compatible models (default: they answer first, Gemini is the last fallback) |
| `LLM_MAX_CALLS` | Cap on real provider HTTP calls per process; past the cap the agents run scripted and say so |
| `LLM_AGENT_MAX_STEPS` | Tool-call steps an agent's model may take per run (default 4) |
| `LLM_STEP_TIMEOUT_MS` | Timeout per model call in milliseconds (default 120000; a timed-out request is cancelled) |
| `USER_DB_URL` · `CM_DB_URL` · `NORDEA_DB_URL` | The hosted agent stores (below); unset = local SQLite |
| `SUPABASE_URL` + `SUPABASE_SECRET_KEY` | Only the kept-documents bucket still uses these (below); unset = local files |

### Optional: hosted storage on Supabase

Local files are the default and need nothing. To host the data on [Supabase](https://supabase.com) instead:

1. Create a project and run three SQL files in the *SQL Editor*, in order: **supabase/three-agents.sql** (the three agent tables and one Postgres role per agent - give each role a letters-and-digits password: `alter role agent_user password '...';`, same for `agent_cm`, `agent_nordea`), then **supabase/nordea-feed.sql** (the new-data feed; run it again if you ran an older copy), then **supabase/role-smoke.sql** (prints one PASS/FAIL table - every line should say PASS).
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
| `npm run lint` | Type-check with TypeScript |
| `npm test` | Run the bank-records tests |
| `npm run test:arch` | Run the three-agent architecture checks |
| `npm run test:e2e` | End-to-end proof the app, `/arch.html` and the monitor are one machine (boots a real server on a scratch dataset) |

#### 🧠 Ask and understand

| | Feature | What the customer gets |
|:-:|---|---|
| 💬 | **Abel, the AI assistant** | Answers about balances, spending, goals and payday plans. Numbers come from code. |
| 🛡️ | **Safe actions** | Money never moves from chat. Abel can only propose a transfer; the customer confirms it. |

#### 🔐 Stay in control

| | Feature | What the customer gets |
|:-:|---|---|
| 🗄️ | **Context Cabinet** | Goals, life events, preferences, facts and Nordea's observations, each with source and history. |
| 🚦 | **Access gateway** | Reads by Abel, the partner-offer helper or a Nordea adviser are permission-checked and logged in *Who sees it*. |
| ⏳ | **One-time sharing** | Share with a Nordea adviser for a limited time, and revoke at any moment. |

#### 📥 Bring your data in

| | Feature | What the customer gets |
|:-:|---|---|
| 📎 | **Import** | WhatsApp chats, PDFs, photos, Excel and CSV. Abel suggests what to save; the customer ticks what to keep. |
| 📄 | **Your documents** | Files are read once and not kept, unless the customer chooses *Keep a copy* (auto-deleted after 30 days). |
| 🏦 | **Nordea account data** | Upload or feed fictional account data; Nordea spots salary changes, spending shifts and new regular payments for the customer to confirm. |

#### 🎁 Get value back

| | Feature | What the customer gets |
|:-:|---|---|
| 🤝 | **Partner offers** | Fictional partners (homes, movers, energy, insurance, planning) appear only when relevant and allowed. The fee is always shown, and part of it goes back to the customer. |
| ⭐ | **Data rewards** | Fictional points for sharing notes and for each time a helper actually uses them. |

## 🧭 How it works

```mermaid
flowchart TD
    UI["📱 React app<br/><code>src/components</code>"] -->|"/api/*"| API["⚙️ Express server<br/><code>server.ts</code>, <code>routes.ts</code>"]
    API --> ABEL["💬 Abel<br/><code>abel.ts</code>"]
    ABEL --> LLM["🤖 LLM chain <code>llm*.ts</code><br/>Groq · Aalto LLM · Gemini · mock"]
    ABEL -.->|"every model busy"| OFF["📴 Offline answers<br/><code>abelOffline.ts</code>"]
    ABEL --> GW["🚦 Access gateway<br/><code>accessGateway.ts</code>"]
    GW --- PERM["📋 Permissions per agent<br/><code>agents/*.json</code>"]
    GW --> CAB["🗄️ Context Cabinet + finance maths<br/><code>db.ts</code>, <code>finance.ts</code>"]
    CAB --> STORE[("💾 Supabase <code>store.ts</code><br/>or <code>data/cabinet-db.json</code>")]
```

### 🛡️ Guardrails built into the code

| # | Rule |
|:-:|---|
| 1 | Abel reads the cabinet **through the gateway** before every reply. |
| 2 | Every number in a reply must come from a tool or the cabinet; otherwise the reply is **sent back to be fixed**. |
| 3 | The cabinet changes only through a **proposal the customer can undo**, with provenance recorded. |
| 4 | Partner offers come **only from the registry**, never when turned off, and at most once per partner per chat. |
| 5 | *Based on N things* lists **only what the gateway actually returned** in that turn. |

## 🧰 Tech stack

| Layer | Tools |
|---|---|
| 🎨 Frontend | React 19, Vite 8, Tailwind CSS 4, Motion, Lucide icons |
| ⚙️ Backend | Node.js, Express, TypeScript (run with `tsx`) |
| 🤖 AI | Google Gemini (`@google/genai`), any OpenAI-compatible API (Groq, Aalto LLM gateway), scripted mock |
| 💾 Storage | Supabase (Postgres + private file bucket) or a local JSON file for the app; `node:sqlite` per-customer stores for the three-agent architecture |
| 📄 File reading | `unpdf` (PDF), `read-excel-file` (Excel) |
| ☁️ Hosting | Google AI Studio (Cloud Run) |

## ⚙️ Configuration

Put settings in `.env` on a laptop, or in **AI Studio → Settings → Secrets**.

> [!WARNING]
> Never commit keys. `.env` is ignored by git.

### Pick an AI provider

| Provider | Best for | Needs |
|---|---|---|
| **Gemini** | Default, and AI Studio | `GEMINI_API_KEY` |
| **Groq** | Free option, works in AI Studio | `LLM_PROVIDER=openai` + Groq key |
| **Aalto LLM** | Laptop on the Aalto VPN | `LLM_PROVIDER=openai` + Aalto key · [step-by-step guide](LAPTOP.md) |
| **Mock** | Local tests, no key | `LLM_PROVIDER=mock` |

<details>
<summary><b>Example <code>.env</code> for Groq</b></summary>

```env
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=your-groq-key
LLM_MODEL=openai/gpt-oss-120b
```
If that model hits its limit, Abel tries `qwen/qwen3.8-27b`, then `openai/gpt-oss-20b`, then Gemini (if `GEMINI_API_KEY` is set). Override the backups with `LLM_FALLBACK_MODELS`.
</details>

<details>
<summary><b>Example <code>.env</code> for the Aalto LLM</b></summary>

```env
LLM_PROVIDER=openai
LLM_BASE_URL=https://llm-gateway.k8s.aalto.fi/api/v1
LLM_API_KEY=your-aalto-key
LLM_MODEL=Qwen/Qwen3.8-27B-FP8
LLM_TIMEOUT_MS=90000
LLM_TURN_MS=150000
```
</details>

<details>
<summary><b>All environment variables</b></summary>
<br>

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Yes, for Gemini | Gemini API key (injected automatically in AI Studio) |
| `APP_URL` | AI Studio only | URL where the app is hosted |
| `GEMINI_MODEL` | No | Gemini model to use (default `gemini-3.8-flash`) |
| `LLM_PROVIDER` | No | `openai` for Groq or the Aalto LLM, `mock` for local tests only |
| `LLM_BASE_URL` | With `openai` | API address, e.g. `https://api.groq.com/openai/v1` |
| `LLM_API_KEY` | With `openai` | API key for that service |
| `LLM_MODEL` | With `openai` | First model to try |
| `LLM_FALLBACK_MODELS` | No | Comma-separated backup models |
| `LLM_VISION_MODELS` | No | Models that can read photos |
| `LLM_TIMEOUT_MS`, `LLM_TURN_MS` | No | Time limits for one call and a whole reply |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | No | Save data in Supabase instead of the local file (needed on AI Studio, where the file resets on restart) |

</details>

### 💾 Saving data in Supabase (optional)

Without Supabase, data is saved in `data/cabinet-db.json`. On a laptop that file persists between runs; on AI Studio it resets whenever the app restarts. To keep data on AI Studio:

1. Run `supabase/setup.sql` once in the Supabase SQL Editor.
2. For the account-data feed, also run `supabase/nordea-feed.sql`.
3. Add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` as secrets.

## ✅ Testing

- **`npm test`** runs the bank-records tests.
- **`npm run test:arch`** runs the 188 architecture assertions: the one-database rule (enforced by a source scan), per-session documents, rounds, risk rules, permissions, decay, undo, and the Abel integration with its negative cases.
- **`npm run check:feed`** dry-runs the example Nordea feed CSV.
- **In the app:** **More → Check Abel's answers** asks 12 real questions on a copy of Lauri and grades them automatically.

## 📁 Project structure

<details>
<summary>Show the file tree</summary>

```
├── server.ts                 Express entry point (port 3000)
├── src/
│   ├── App.tsx, main.tsx     React app
│   ├── components/           Home, Chat, Pages (cabinet, sharing, rewards, settings), modals
│   ├── server/
│   │   ├── abel.ts           Abel's prompt, tools and guardrails
│   │   ├── llm*.ts           Model providers and fallback chain
│   │   ├── abelOffline.ts    Code-based answers when no model is free
│   │   ├── accessGateway.ts  Permission checks and access log
│   │   ├── finance.ts        All numbers: balances, spending, goals, fees
│   │   ├── routes.ts         API routes
│   │   ├── db.ts, store.ts   In-memory data + Supabase sync
│   │   ├── documents.ts      Uploaded files (read once / keep 30 days)
│   │   ├── nordeaData.ts     Account data and Nordea observations
│   │   └── dataRewards.ts    Points for sharing and use
│   ├── services/api.ts       Frontend API client
│   └── types.ts              Shared types
├── agents/                   What each helper may read (abel, offers, adviser)
├── partners/                 Fictional partner definitions
├── data/cabinet-db.json      Local demo data
├── supabase/                 SQL setup scripts
├── scripts/                  Tests
├── public/                   Fonts, screenshots, design assets, and the arch.html / dev-monitor.html demo pages
└── docs/, docs-v14.md        Design and change notes
```
</details>

## 🧪 Three-agent architecture

> [!NOTE]
> This architecture was developed on the [`instinct-prototype-v2`](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/tree/instinct-prototype-v2) branch and is now merged into `main`. The earlier iteration of the design still lives on the [`Instict-prototype`](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/tree/Instict-prototype) branch.

Instead of one assistant reading one database, the work is split between **three agents**. Each agent opens **only its own database** - that rule is enforced by a source-scan test, not by convention. Agents never read each other's stores; they talk through **bus messages** and a shared working document, **`context.md`**, that is rebuilt for every customer session.

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
    APP --> ABEL["💬 Abel<br/><code>abel.ts</code> - gateway-only imports"]
```

### 🔄 How a session works

1. The customer's first question of a session opens a **build round**; `context.md` starts empty - nothing carries over from earlier sessions.
2. The **personal agent** writes the Customer section: the shareable part of the User DB (goals by title, never raw detail).
3. The **Context Memory agent** retrieves what is relevant from `cm.db` and writes the Context memory section.
4. The **Nordea agent** adds relevant aggregates from `nordea.db`.

With a provider configured (`GEMINI_API_KEY` or `LLM_PROVIDER=openai`), all three agents also **reason with an LLM**: the CM and Nordea models get tools for their own database only and propose the round's retrieval plan and match terms, and the personal agent's model reads its own User DB through tools and composes the chat reply from what it saw (any figure the model writes that is not in the selected facts or its tool results - compared as whole numbers - drops the reply back to the scripted template). Code validates every proposal and owns numbers, evidence, risk and every write. Each round record and chat answer states truthfully which path ran - `model`, `scripted`, or `scripted (model unavailable)` - and /arch.html shows it under each reply; the same status is auditable on the bus. Without a key the scripted behaviour runs unchanged (that is also what the tests use).
5. The Context Memory agent **finalises** the document and stamps it with the session id. Every later question in that session is answered from that document.
6. If an agent is off or the cabinet is parked, no round runs and no other session's document is served - the app says plainly that shared context is unavailable.
7. Accepted knowledge is stored in `cm.db`; decay maintenance re-checks it before reuse (below).

### ✨ Architecture features

#### 🗂️ The shared document

| | Feature | How it works |
|:-:|---|---|
| 📄 | **Per-session `context.md`** | Rebuilt for every customer session, rendered from structured rows - never parsed back. |
| ✍️ | **Section ownership, enforced** | One writer module per section; the same source-scan that pins each agent to its own database pins the sections. |
| 🔎 | **Session stamping** | A document is served only when its `sessionId` matches the current session; a stale document is never wiped and never leaked across sessions. |

#### 🚦 Risk and permissions

| | Feature | How it works |
|:-:|---|---|
| 📏 | **Risk decided by code rules** | High risk always waits for the customer: offers, sharing beyond the three agents, inferences, sensitive topics. Never the agent's judgement. |
| 🧾 | **Observed vs inferred, derived** | "Observed" comes from the evidence (transaction ids + a total, or the customer's own words) - never trusted from the proposer's own flag. |
| 🎚️ | **Standing permissions** | Set once via `POST /api/arch/:uid/permissions`. Until then every proposal waits in merge review; afterwards low and medium risk items are stored automatically - always logged, explainable and disputable. |

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

### 🛣️ Routes

Under `/api/arch/` (`src/server/arch/routes.ts`; `:uid` = the customer):

| Route | Purpose |
|---|---|
| `GET customers` | The customers with agent data (the demo UI's picker) |
| `GET :uid/state` | Cabinet, agents and document state for the demo UI |
| `POST :uid/session/new` | Start a fresh session; the next question rebuilds the document |
| `POST :uid/chat` | Session chat answered from the session's document |
| `POST :uid/goals` · `POST :uid/goals/:goalId` · `POST :uid/goals/:goalId/delete` | Add, edit and delete customer goals |
| `POST :uid/permissions` | Set standing permissions (`reviewLevel: 'all' \| 'high'`) |
| `POST :uid/agent-query` | Ask an agent a direct question |
| `POST :uid/airlock/:batchId/approve` · `POST :uid/airlock/:batchId/reject` | Approve or reject what enters the User DB |
| `POST :uid/nordea/contribute` | Run a contribution round (Nordea proposals) |
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
| Architecture tests | `npm run test:arch` | 306 assertions: the one-database rule (source scan), per-session documents, reactive rounds, risk rules, permissions, decay, undo, the Abel integration, the G4 LLM planning path (mock provider) and the negative cases |
| End-to-end | `npm run test:e2e` | 37 checks over a real booted server (incl. requestId dedup + late pickup): a goal shows in all views, a review decision changes what the chat answers from, a bank import updates app + arch + monitor, session and top-up rounds run, and no code reads the old store |
| Data-layer adapter | `npm run test:adapter` | 43 checks: the old app store as an adapter over the three agent databases, legacy migration, and plumbing separation |
| Hosted sync | `npm run test:remote` | 36 checks against an in-memory Postgres double: hydrate, flush, failures, and the one-role-per-agent grants |
| Live hosted three-agent run | manual, evidence in `evidence/e2e/` | A real server booted against the hosted Supabase stores with a real model: session round with model plans, a model-composed chat answer grounded in context.md, goal add, contribution round, review accepts into Context Memory - then scoped cleanup restored the hosted tables to their pre-test hashes |
| review.md guard | `npm run check:review` | Keeps every review.md message inside the collaboration format |
| Type check | `npm run lint` | `tsc --noEmit` across the app |
| Bank records | `npm test` | Feed loading and bank-record maths |
| Feed CSV | `npm run check:feed` | The Nordea feed CSV applies cleanly |

## ⚠️ Known limits

<details>
<summary>What this prototype does <b>not</b> do</summary>

- **Figures are labelled "of related spending"** - goal matching uses category and description keywords, so a saving goal's figure is the related spending, not a true savings-transfer balance.
- **Single process.** The round engine, bus and stores run in one Node process; `node:sqlite` files sit under the data dir. No distribution, no queues.
- **No live bank.** All account data is fictional, loaded with `scripts/load_data.py` (see `seed/README.md`).
- **Demo UI.** `public/arch.html` and `public/dev-monitor.html` are demonstration surfaces, not the polished app from `main`.
- **Hosted mode is hydrate-then-flush.** With the Supabase role URLs set, the hosted tables replace the local agent databases at startup and writes flush back; if Supabase is unreachable the app keeps working on the local files (the honest fallback copy) and logs the failure.
- **Flush-back survives a graceful stop, not a hard kill.** The hosted flush is debounced (250 ms) after a store write; SIGTERM/SIGINT drain the pending flushes (10 s cap) before exit, so a normal stop loses nothing. A hard kill inside the debounce window can still lose the last write (found in the live run, evidence/e2e/findings/live-run-findings.md F-C).
- **A model that never finishes hands over first, then falls back to scripted - loudly.** In a provider chain, a member that answers without any tool call is skipped inside the same step, and a member that burns its whole step budget without the finish call hands the run to a fresh member ONCE. Only when no member produces a finish call does the reply stay scripted - and the failure is named: the round plan and the reply caption read `scripted (provider error)` and the bus records the missing finish call (finding F-D). Give a slow reasoning model more room with `LLM_AGENT_MAX_STEPS` / `LLM_STEP_TIMEOUT_MS`.

</details>


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

`main` is the stable app. These branches build on it:

| Branch | What it adds | Start here |
|---|---|---|
| **`main`** | The app with Abel, the access gateway and the structured bank-data model (stable transaction ids, incremental imports, balance history, evidence for observations), plus the three-agent architecture above. The app starts empty; data is loaded separately with `scripts/load_data.py`. | This README · [`docs/bank-records.md`](docs/bank-records.md) |
| [**`Bank_database`**](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/tree/Bank_database) | 🏦 Docs and tooling for that bank data: a Supabase setup guide, an example feed CSV, and `npm run check:feed`, a dry run that checks a feed CSV before you upload it. The app code is the same as `main`. | [`supabase/README.md`](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/blob/Bank_database/supabase/README.md) |
| [**`dev-context-monitor`**](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/tree/dev-context-monitor) | 🔍 **Context enrichment.** The app ships empty and data is loaded separately with `scripts/load_data.py` (needs Python 3.9+). Adds a read-only developer monitor at `/dev-monitor.html` that shows live what Abel can read, what is shared with Nordea, and every audited read. Turn it on with `DEV_MONITOR=1`, on a laptop only. | [`seed/README.md`](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/blob/dev-context-monitor/seed/README.md) |
| [**`Instict-prototype`**](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/tree/Instict-prototype) | 🧪 The first three-database prototype. Combines the two branches above; superseded by the v2 architecture now on `main`. | [`README.md` on the branch](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/blob/Instict-prototype/README.md) |
| [**`instinct-prototype-v2`**](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/tree/instinct-prototype-v2) | 🗄️ **Three-agent context memory architecture**: per-session shared document, decay maintenance, standing permissions, explain/dispute/undo. **Merged into `main`.** | See [Three-agent architecture](#-three-agent-architecture) |

> [!IMPORTANT]
> `dev-context-monitor` rewrites `src/server/db.ts` and does not include the structured bank-data changes that `main` has, so merging it into `main` needs that file reconciled. `Instict-prototype` has already done that reconciliation.

## 📚 Further docs

| Doc | Read it to learn |
|---|---|
| [docs-v14.md](docs-v14.md) | How Abel, the gateway, storage, documents and data rewards work |
| [docs/bank-records.md](docs/bank-records.md) | Structure of the Nordea account data |
| [LAPTOP.md](LAPTOP.md) | Running with the Aalto LLM on a laptop |

## ✍️ About this README

Written by AI agents working together on the branch `ai-agent-communications`, with facts about the final prototype checked by **Instinct**, who built it. Their conversation is in [`AGENT_CHAT.md`](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/blob/ai-agent-communications/AGENT_CHAT.md) and [`AGENT_CHAT_2.md`](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/blob/ai-agent-communications/AGENT_CHAT_2.md) on that branch.

| Agent | Role | Signature |
|---|---|---|
| **Jeff** (Claude) | Content and accuracy | ✍️ *Jeff was here: first draft, every claim checked against the code.* |
| **Bill** | Design and readability | ✍️ *Bill was here: layout, badges, gallery, diagrams and tables, so it reads in one minute and runs in five.* |
| **Instinct** | Architecture and fact-checking | ✍️ *Instinct was here: checked the prototype claims against the code and verified the airlock correction.* |
| **Joe** | Context memory | ✍️ *Joe was here: kept the shared memory, so four agents could pick up any turn without rereading the whole thread.* |

> [!NOTE]
> **Updated 31 October 2026:** [LAPTOP.md](LAPTOP.md) now clones from this repository (`coolkowkank/Nordea-x-Aalto-Banking-`), works on Windows, Mac and Linux, and covers Groq (no VPN) as well as the Aalto LLM.

---

<div align="center">
<sub>Built as a <b>Nordea × Aalto University</b> research prototype. All data is fictional.</sub>
</div>
