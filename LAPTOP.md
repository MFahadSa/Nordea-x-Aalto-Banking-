# Run Abel on your laptop with the Aalto LLM

The Aalto LLM gateway only works inside the Aalto network, so the app runs on a laptop that's connected to the **Aalto VPN**.
AI Studio keeps using Gemini. Nothing here changes it.

## One-time setup (Windows)
1. Install **Node.js LTS** from nodejs.org. Keep the default options.
2. Install **GitHub Desktop** from desktop.github.com and sign in with GitHub.
3. In GitHub Desktop: **File → Clone repository** → `MFahadSa/Nordea-x-Aalto-Banking-` → Clone.
4. Open the cloned folder. In File Explorer, click the address bar, type `cmd` and press Enter. A black window opens.
5. In that window, run: `npm install --legacy-peer-deps`
6. In the same folder, create a file called **`.env`** (with the dot, no `.txt`). Notepad works: choose "Save as type: All files".
   Put this in it, using your own key:
   ```
   LLM_PROVIDER=openai
   LLM_BASE_URL=https://llm-gateway.k8s.aalto.fi/api/v1
   LLM_API_KEY=paste-your-Aalto-key-here
   LLM_MODEL=Qwen/Qwen3.8-27B-FP8
   LLM_TIMEOUT_MS=90000
   LLM_TURN_MS=150000
   ```
   `.env` is ignored by git, so the key never goes to GitHub. Never paste the key into a chat or into code.
   Leave the Supabase lines out. The laptop then saves its data in `data/cabinet-db.json` on the laptop, and it
   won't change the data the AI Studio app uses.

## Every time
1. Connect the **Aalto VPN**.
2. In the black window, in the project folder: `npm run dev`
3. Open **http://localhost:3000** in your browser.
4. Check **More → AI connection → Test**. It should say "Working · Qwen/Qwen3.8-27B-FP8".
5. To stop the app, press Ctrl + C in the black window.

To get the latest code: GitHub Desktop → **Fetch origin** → **Pull**. Then run `npm install --legacy-peer-deps` again.

## If something goes wrong
- "Can't reach … Is the Aalto VPN on?": connect the VPN and test again.
- "401" or "bad key": check `LLM_API_KEY` in `.env`, then restart with Ctrl + C and `npm run dev`.
- Very slow first answer: some models start only when asked, which can take minutes. Try again, or use a model the gateway marks as always on.
- Photos: they only work if the chosen model can read images. PDFs and text files always work, because the app takes the text out first.
