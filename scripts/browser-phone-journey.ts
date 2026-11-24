/** Phone-size browser journey (390×844) against the real built app and real /api routes, with a SCRIPTED model.
 *  It shows what the customer sees and that state follows taps only. It is not evidence of live model quality.
 *  Usage: npm run build && npx tsx scripts/browser-phone-journey.ts [screenshot-dir]
 *  Fictional demo customer (Lauri). No credentials, no network beyond 127.0.0.1. */
import { createRequire } from 'node:module'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import assert from 'node:assert/strict';
process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-journey-')); process.env.PORT = '3831'; process.env.NODE_ENV = 'production';
for (const k of ['SUPABASE_URL', 'GEMINI_API_KEY', 'LLM_API_KEY', 'GROQ_API_KEY', 'USER_DB_URL', 'AGENT_DB_URL', 'SHARED_DB_URL']) delete process.env[k];
const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'phone-shots-')); fs.mkdirSync(OUT, { recursive: true });
const { db } = await import('../src/server/db.js'); const finance = await import('../src/server/finance.js'); const { setProvider } = await import('../src/server/llm.js');
const fin = (text: string, suggestions: string[] = []) => ({ calls: [{ name: 'finishReply', args: { text, suggestions, usedEntryIds: [], topic: 'other', couldHelp: true } }] });
// Scripted model replies keyed by what the customer typed. Replies are what a plausible model might write; the app decides.
const plan: Record<string, any[]> = {
  hey: [fin('Hi Lauri! Would you like a quick look at your budget?', ['Yes, show my budget', 'Not now'])],
  yes: [fin('Your average tracked spending is 2107 EUR per month. Housing is your biggest cost at 1150 EUR, then groceries at 410 EUR.')],
  'what is my salary?': [fin('Your salary is 2107 EUR a month.'), fin('Your salary is 2107 EUR a month.')],
  'move 40 euros to my savings': [{ calls: [{ name: 'offerTransfer', args: { amountPerMonth: 40, once: true } }] }, fin('Here is the one-time transfer for you to check.')],
  'ok do it': [fin('Great, done! The money is on its way.'), fin('All done!')],
};
let current: any[] = [];
setProvider({ name: 'phone-journey-scripted', isConfigured: () => true, step: async ({ turns }: any) => {
  if (turns.at(-1)?.role === 'user') current = [...(plan[String(turns.at(-1).text).trim().toLowerCase()] || [fin('Okay.')])];
  return current.shift() ?? fin('Okay.');
} } as any);
await import('../server.ts'); await new Promise((r) => setTimeout(r, 600));
const { chromium } = createRequire(import.meta.url)('playwright'); // pre-installed in the audit container; not a project dependency
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errors: string[] = []; page.on('pageerror', (e: unknown) => errors.push(String(e)));
let shot = 0; const snap = async (name: string) => page.screenshot({ path: path.join(OUT, `${String(++shot).padStart(2, '0')}-${name}.png`) });
const lastBot = async () => (await page.locator('.mrow.bot .bub:not(.typing)').filter({ hasNotText: /^Answer not verified/ }).last().innerText()).trim();
const send = async (t: string) => {
  const before = await page.locator('.mrow.bot').count();
  await page.getByPlaceholder('Message…').fill(t); await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForFunction((n: number) => document.querySelectorAll('.mrow.bot').length > n && !document.querySelector('[aria-label="Nora is typing"]'), before, { timeout: 20000 });
  await page.waitForTimeout(300);
};
const result: Record<string, unknown> = {};
await page.goto('http://127.0.0.1:3831/'); await page.waitForTimeout(1200); await snap('home');
await page.getByText('Ask Nora anything…').click(); await page.waitForTimeout(500);
await send('hey'); result.greeting = await lastBot(); await snap('greeting');
await send('yes'); result.budget = await lastBot(); await snap('budget-verified-prose');
assert.match(String(result.budget), /2107 EUR per month/);
await send('what is my salary?'); result.roleSwap = await lastBot(); await snap('role-swap-refused');
assert.doesNotMatch(String(result.roleSwap), /2107/);
const balance = () => JSON.stringify(finance.accounts('lauri'));
const b0 = balance();
await send('move 40 euros to my savings'); await snap('transfer-card');
assert.equal(await page.getByRole('button', { name: 'Yes, move it now' }).count(), 1);
await send('ok do it'); result.typedYes = await lastBot(); await snap('typed-yes-honest');
assert.equal(balance(), b0, 'typing must not move money'); assert.doesNotMatch(String(result.typedYes), /\bdone\b/i);
await page.getByRole('button', { name: 'Yes, move it now' }).click(); await page.waitForTimeout(1200); result.afterTap = await lastBot(); await snap('after-tap');
const b1 = balance(); assert.notEqual(b1, b0, 'the tap moves the money once');
await page.reload(); await page.waitForTimeout(1500); await snap('after-reload');
result.confirmButtonsAfterReload = await page.getByRole('button', { name: 'Yes, move it now' }).count();
assert.equal(balance(), b1, 'reload must not repeat the transfer');
result.pageWidth = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, widest: [...document.querySelectorAll('body *')].map((e) => [e.className, Math.round(e.getBoundingClientRect().right)] as [string, number]).filter(([, r]) => r > window.innerWidth).slice(0, 5) }));
result.pageErrors = errors;
console.log(JSON.stringify(result, null, 1));
console.log(`RESULT phone journey passed; ${shot} screenshots in ${OUT} (scripted model, real app and routes)`);
await browser.close(); process.exit(0);
