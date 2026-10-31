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

[**Quick start**](#-quick-start) · [**Features**](#-what-it-does) · [**How it works**](#-how-it-works) · [**Final prototype**](#-final-prototype) · [**Branches**](#-branches) · [**Configuration**](#%EF%B8%8F-configuration) · [**Docs**](#-further-docs)

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

**You need:** [Node.js](https://nodejs.org) LTS. An AI key is optional for a first look.

```bash
# 1. Get the code
git clone https://github.com/coolkowkank/Nordea-x-Aalto-Banking-.git
cd Nordea-x-Aalto-Banking-

# 2. Install
npm install --legacy-peer-deps

# 3. Add your AI key (see Configuration below)
cp .env.example .env

# 4. Run
npm run dev
```

Then open **http://localhost:3000** and check the connection under **More → AI connection → Test**.

> [!TIP]
> **No AI key yet?** Start with the scripted stand-in instead of step 3:
> ```bash
> LLM_PROVIDER=mock npm run dev
> ```

| Script | What it does |
|---|---|
| `npm run dev` / `npm start` | Start the server and app on port 3000 |
| `npm run build` | Build the frontend with Vite |
| `npm run lint` | Type-check with TypeScript |
| `npm test` | Run the bank-records tests |

## ✨ What it does

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
| 💾 Storage | Supabase (Postgres + private file bucket), or a local JSON file |
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
├── public/                   Fonts, screenshots and design assets
└── docs/, docs-v14.md        Design and change notes
```
</details>

## 🧪 Final prototype

> [!NOTE]
> The **final prototype** lives on the [`Instict-prototype`](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/tree/Instict-prototype) branch (spelled that way on GitHub). It is **not merged into `main` yet**. Everything in this section describes that branch.

It combines the two feature branches (the structured bank data from `Bank_database`, and from `dev-context-monitor` an app that starts empty plus the developer monitor), and adds a working prototype of the target design: **three separate databases, one agent each, talking through explicit messages.** Open it at `/arch.html`.

### 🗺️ Graphical abstract

```mermaid
flowchart LR
    YOU(["🙋 Customer"])

    subgraph PA["🧑‍💻 Personal side"]
        direction TB
        PAG["💬 Personal agent<br/>Abel, or an external agent"]
        UDB[("👤 User DB<br/>profile · goals · personal facts")]
        PAG --- UDB
    end

    subgraph CM["🗄️ Shared context"]
        direction TB
        CMA["🧠 Context Memory agent<br/>the only writer"]
        CDB[("🗂️ Context Memory DB<br/>the cabinet")]
        CMA --- CDB
    end

    subgraph ND["🏦 Bank side"]
        direction TB
        NA["🏦 Nordea agent"]
        NDB[("💳 Nordea DB<br/>accounts · transactions")]
        NA --- NDB
    end

    BUS{{"✉️ Message bus<br/>explicit agent-to-agent messages"}}
    AIR{{"🛂 Sync airlock<br/>you approve external syncs"}}
    REV{{"✅ Merge review<br/>you accept or reject"}}
    MON["🔍 Developer monitor<br/>read-only · <code>DEV_MONITOR=1</code>"]

    YOU -->|"chat: no gate"| PAG
    PAG -->|"external agent syncs:<br/>WhatsApp, calendar, notes, email"| AIR -->|"approved items"| UDB
    NA -->|"goal-relevant insights"| REV --> CMA
    PAG <--> BUS
    CMA <--> BUS
    NA <--> BUS
    MON -. "row counts, agent state,<br/>bus tail" .-> BUS
```

<sub>**Read it left to right:** each agent owns one database, and agents talk only through the message bus. Nothing reaches the shared cabinet without merge review, and nothing synced from outside reaches the User DB without the airlock. The personal agent never reads the Nordea DB, so it can't state account figures.</sub>

### 🗃️ The three databases

Each customer gets three real SQLite files in `data/arch/`, plus one for the message bus (`<uid>.user.db`, `<uid>.cm.db`, `<uid>.nordea.db`, `<uid>.bus.db`).

| Database | Agent | What it holds | Rules |
|---|---|---|---|
| 👤 **User DB** | Personal agent (Abel in the app, or a connected external agent) | Profile, goals, personal facts | Never reads the Nordea DB, so it can't state account figures. Says plainly when it lacks context. |
| 🗂️ **Context Memory DB** | Context Memory agent | The cabinet: shared context between the customer and Nordea | Only this agent writes it. It advises; it never changes bank data. |
| 💳 **Nordea DB** | Nordea agent | Accounts and transactions | Proposes goal-relevant insights; the customer accepts or rejects each one. |

### 🎛️ What the customer controls

| | Control | What happens |
|:-:|---|---|
| 💬 | **Typing to Abel** | Goes straight into the User DB. No gate. |
| 🛂 | **Sync airlock** | Items from a connected external agent (WhatsApp, calendar, notes, email) wait for the customer's approval before they enter the User DB. |
| ✅ | **Merge review** | Nordea's proposals wait until the customer accepts or rejects them. This is the only way anything enters the cabinet. |
| 🔎 | **Explain and dispute** | Every cabinet entry shows who proposed it, why, and when it was approved, and can be disputed. |
| ⏸️ | **Park the cabinet** | Suspends it without deleting anything: no agent reads it and nothing is added until the customer resumes it. |
| 🔌 | **Separate off-switches** | Turning an agent off, disconnecting the personal agent, parking the cabinet and deleting a store are four different actions. |

#### 🛡️ Safety built into the code

- ♻️ **Staleness checks:** when the bank data behind a cabinet entry changes, the entry is marked stale and a refreshed proposal goes back through merge review. Resuming re-checks everything before the cabinet is used again, so outdated figures are never served as fresh.
- 🔢 **Numeric grounding:** numbers in the personal agent's replies must appear in the retrieved facts, or the reply is replaced by a plain answer with no figures.
- 🔒 **Fail-closed gateway:** an agent with no registered permissions gets nothing.

### 🚀 Run it

**Needs:** Node.js 22.13 or newer (the prototype uses Node's built-in `node:sqlite`) and Python 3.9+ to load data.

```bash
git checkout Instict-prototype
npm install            # if it fails: npm install --legacy-peer-deps
python3 scripts/load_data.py seed/demo --target file   # the app starts empty until you load data
npm run dev
```

| Open | What you see |
|---|---|
| **http://localhost:3000/arch.html** | The three-database architecture, with airlock, merge review and park controls |
| **http://localhost:3000** | The banking app with Abel |
| **http://localhost:3000/dev-monitor.html** | The read-only developer monitor. Add `DEV_MONITOR=1` to `.env.local` first; laptop only, as it shows private cards. |

| Check | What it does |
|---|---|
| `npm run test:arch` | 74 checks of the three-database architecture |
| `npm test` | The bank-data model, on a throwaway copy |
| `npm run check:feed` | Dry-runs the example Nordea feed CSV |
| `npm run lint` | TypeScript check |

<details>
<summary><b>⚠️ Not built yet</b>: what this prototype is not</summary>
<br>

- **Isolation:** the three databases are separate files, each opened only by its own agent's code, but in one process. Each agent's retrieval covers only its own store: cabinet content reaches the personal agent through explicit messages, never a shared index. Separate credentials per database (for example three Supabase projects) are still to come.
- **External agents:** there is no real external agent integration. The connect button switches mode, and `/api/arch/:uid/sync` is a stand-in endpoint. `scripts/personal-agent-client.ts` simulates an external agent.
- **Bank connection:** there is no live bank connection. The Nordea DB is copied from loaded data and refreshed on each import.
- **AI:** in the architecture prototype, retrieval is keyword-based and answers are templates over retrieved facts, not an LLM. Numeric grounding checks that numbers appear in the facts, not that they're attached to the right thing.

</details>

## 🌿 Branches

`main` is the stable app. Three branches build on it, ending with the final prototype:

| Branch | What it adds | Start here |
|---|---|---|
| **`main`** | The app with demo data built in, including the structured bank-data model (stable transaction ids, incremental imports, balance history, evidence for observations). | This README · [`docs/bank-records.md`](docs/bank-records.md) |
| [**`Bank_database`**](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/tree/Bank_database) | 🏦 Docs and tooling for that bank data: a Supabase setup guide, an example feed CSV, and `npm run check:feed`, a dry run that checks a feed CSV before you upload it. The app code is the same as `main`. | [`supabase/README.md`](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/blob/Bank_database/supabase/README.md) |
| [**`dev-context-monitor`**](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/tree/dev-context-monitor) | 🔍 **Context enrichment.** The app ships empty and data is loaded separately with `scripts/load_data.py` (needs Python 3.9+). Adds a read-only developer monitor at `/dev-monitor.html` that shows live what Abel can read, what is shared with Nordea, and every audited read. Turn it on with `DEV_MONITOR=1`, on a laptop only. | [`seed/README.md`](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/blob/dev-context-monitor/seed/README.md) |
| [**`Instict-prototype`**](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/tree/Instict-prototype) | 🧪 **The final prototype.** Combines both branches above and adds the three-database architecture. See [Final prototype](#-final-prototype). | [`README.md` on the branch](https://github.com/coolkowkank/Nordea-x-Aalto-Banking-/blob/Instict-prototype/README.md) |

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

> [!NOTE]
> **Updated 31 October 2026:** [LAPTOP.md](LAPTOP.md) now clones from this repository (`coolkowkank/Nordea-x-Aalto-Banking-`), works on Windows, Mac and Linux, and covers Groq (no VPN) as well as the Aalto LLM.

---

<div align="center">
<sub>Built as a <b>Nordea × Aalto University</b> research prototype. All data is fictional.</sub>
</div>
