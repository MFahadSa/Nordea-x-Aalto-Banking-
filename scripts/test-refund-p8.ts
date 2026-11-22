/** Refund Tracker, stage 8: the chat follow-up for a refund with no shop, against the real server (mock model, throwaway data). */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'refund-p8-'));
const PORT = 3800 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, CABINET_DATA_DIR: DIR, LLM_PROVIDER: 'mock', PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); } else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 400)}`); }
}
const stop = () => { try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* gone */ } };
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/refund/lauri')).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
const chat = async (text: string, conversationId?: string) => {
  const r = await fetch(BASE + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'lauri', text, conversationId }) });
  const j = (await r.json()) as any; const last = j.messages?.at(-1);
  return { cid: j.conversationId as string, text: String(last?.text ?? ''), card: last?.cards?.[0]?.type as string | undefined };
};
const state = async () => { const j = (await (await fetch(BASE + '/api/refund/lauri')).json()) as any; return j.cases as any[]; };
const ASK = /Which shop is the refund from/;
try {
  // the reported path
  let a = await chat('refund'); const c1 = a.cid;
  check('"refund" asks which shop', ASK.test(a.text) && !a.card, a);
  a = await chat('An online shop', c1);
  check('a generic reply asks for the shop name again, no card, no Tuulikki hint', !a.card && /What is the shop called/.test(a.text) && !/Tuulikki/i.test(a.text), a);
  a = await chat('Tuulikki', c1);
  check('EXACT REPORTED PATH: refund, "An online shop", then Tuulikki shows the consent card', a.card === 'refund_consent', a);
  check('nothing was read or opened before consent', (await state()).length === 0);
  a = await chat('yes', a.cid);
  check('a yes after the card opens nothing', (await state()).length === 0 && !a.card);
  // naming the shop carries the intent
  a = await chat('refund'); a = await chat('Tuulikki', a.cid);
  check('naming Tuulikki after the ask shows the consent card', a.card === 'refund_consent', a);
  check('the card alone opens no case', (await state()).length === 0);
  // a yes to the card question is not consent
  a = await chat('yes', a.cid);
  check('a conversational yes to the card is not consent', (await state()).length === 0 && !a.card);
  // topic change after the ask
  a = await chat('refund'); a = await chat('What is my balance?', a.cid);
  check('a topic change after the ask is not treated as a shop answer', !/cannot look into refunds/.test(a.text) && !a.card, a);
  a = await chat('refund'); a = await chat('no', a.cid);
  check('"no" after the ask opens nothing', !a.card && !/cannot look into refunds/.test(a.text), a);
  a = await chat('I do not want a refund');
  check('a negated refund message does not start the ask', !ASK.test(a.text), a);
  // persona reset: a fresh conversation does not inherit the ask
  a = await chat('Tuulikki');
  check('a bare shop name in a new conversation opens nothing', !a.card, a);
  a = await chat('refund'); const c6 = a.cid; a = await chat('Zalando', c6);
  check('another named shop is plainly unsupported, no card, no Tuulikki hint', !a.card && /cannot look into refunds from that shop/.test(a.text) && !/Tuulikki/i.test(a.text) && !/\?/.test(a.text), a);
  a = await chat('yes', c6);
  check('a yes after an unsupported shop opens nothing', !a.card, a);
  a = await chat('Tuulikki', c6);
  check('after a yes the ask is over: a bare Tuulikki opens nothing', !a.card, a);
  a = await chat('refund'); a = await chat('Zalando', a.cid); a = await chat('Tuulikki', a.cid);
  check('naming Tuulikki after an unsupported shop shows the card', a.card === 'refund_consent', a);
  a = await chat('refund'); a = await chat('Tuulikki is unrelated; what is my balance?', a.cid);
  check('a topic change that mentions Tuulikki opens nothing', !a.card, a);
  for (const t of ['cancel my refund request', 'stop helping with my refund', 'forget the refund']) {
    a = await chat(t); check(`"${t}" does not start the ask`, !ASK.test(a.text) && !a.card, a);
  }
  a = await chat('refund'); a = await chat('cancel that', a.cid); a = await chat('Tuulikki', a.cid);
  check('after a cancel mid-ask, a bare Tuulikki opens nothing', !a.card, a);
  a = await chat('Help me with my Tuulikki refund');
  check('the explicit Tuulikki refund message still shows the card', a.card === 'refund_consent', a);
  a = await chat('refund'); a = await chat('not Tuulikki', a.cid);
  check('"not Tuulikki" after the ask does not open the card', !a.card, a);
  a = await chat('refund'); a = await chat('no thanks, not that one', a.cid);
  check('declining after the ask opens nothing', !a.card, a);
  a = await chat("I don't want a Tuulikki refund");
  check('a negated Tuulikki refund message opens nothing', !a.card, a);
  a = await chat('forget the Tuulikki refund');
  check('cancel wording opens nothing', !a.card, a);
  const log = JSON.stringify((await state()));
  check('no case, no read, no evidence after all of this', log === '[]', log);
} finally { stop(); }
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
