# Run the app on your laptop

This guide runs the app on your own computer, using the **Aalto LLM** (free, needs the Aalto VPN) or **Groq** (free, no VPN).
The hosted app in AI Studio is not affected: it keeps using Gemini and its own data.

## What you need
- **Node.js LTS** from [nodejs.org](https://nodejs.org). Keep the default options. (The `Instict-prototype` branch needs version 22.13 or newer.)
- **An AI key**, one of:
  - an **Aalto LLM key**, plus the **Aalto VPN** connected while you use the app, or
  - a free **Groq key** from [console.groq.com](https://console.groq.com) (no VPN needed).
- Optional: **GitHub Desktop** from [desktop.github.com](https://desktop.github.com), if you prefer not to use the command line for git.

## One-time setup

### 1. Get the code
- **GitHub Desktop:** File → Clone repository → URL → `https://github.com/coolkowkank/Nordea-x-Aalto-Banking-` → Clone.
- **Command line:**
  ```bash
  git clone https://github.com/coolkowkank/Nordea-x-Aalto-Banking-.git
  ```

### 2. Open a terminal in the project folder
- **Windows:** open the folder in File Explorer, click the address bar, type `cmd` and press Enter.
- **Mac:** right-click the folder in Finder → *New Terminal at Folder*.
- **Linux:** open a terminal and `cd` into the folder.

### 3. Install
```bash
npm install
```
If that fails with a dependency error, run `npm install --legacy-peer-deps` instead.

### 4. Add your key in a `.env` file
Create a file called **`.env`** in the project folder (with the dot, and no `.txt` at the end; in Notepad choose *Save as type: All files*). Put **one** of these in it, with your own key:

**Aalto LLM** (needs the VPN):
```env
LLM_PROVIDER=openai
LLM_BASE_URL=https://llm-gateway.k8s.aalto.fi/api/v1
LLM_API_KEY=paste-your-Aalto-key-here
LLM_MODEL=Qwen/Qwen3.8-27B-FP8
LLM_TIMEOUT_MS=90000
LLM_TURN_MS=150000
```

**Groq** (no VPN):
```env
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=paste-your-Groq-key-here
LLM_MODEL=openai/gpt-oss-120b
```

> **Keep the key secret.** `.env` is ignored by git, so it never goes to GitHub. Never paste the key into a chat or into code.

Leave the Supabase lines out. Your laptop then saves its data in `data/cabinet-db.json`, which is kept between runs and never touches the data the AI Studio app uses.

## Every time you use it
1. If you use the Aalto LLM, connect the **Aalto VPN**.
2. In the terminal, in the project folder, run `npm run dev`.
3. Open **http://localhost:3000** in your browser.
4. Check **More → AI connection → Test**. It should say "Working" and the model name, e.g. "Working · Qwen/Qwen3.8-27B-FP8".
5. To stop the app, press **Ctrl + C** in the terminal.

**Getting the latest code:** GitHub Desktop → *Fetch origin* → *Pull* (or `git pull` in the terminal). Then run `npm install` again in case the dependencies changed.

## If something goes wrong
| You see | What to do |
|---|---|
| "Can't reach … Is the Aalto VPN on?" | Connect the VPN and press *Test* again. |
| "401" or "bad key" | Check `LLM_API_KEY` in `.env`, then restart the app: Ctrl + C, then `npm run dev`. |
| A very slow first answer | Some Aalto models only start when first asked, which can take minutes. Try again, or pick a model the gateway marks as always on. |
| Photos aren't understood | Only models that can read images handle photos. PDFs and text files always work, because the app extracts their text first. |
| The app ignores your `.env` changes | The app reads `.env` only when it starts. Stop it with Ctrl + C and run `npm run dev` again. |
