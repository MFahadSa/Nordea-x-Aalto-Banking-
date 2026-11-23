/** Refund Tracker, stage 8: the chat follow-up for a refund with no shop, against the real server (mock model, throwaway data). */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'refund-p8-'));
const PORT = 45100 + Math.floor(Math.random() * 300);
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
  let a = await chat('Need help with refund'); const c1 = a.cid;
  check('natural refund request starts intake without an AI error', ASK.test(a.text), a);
  a = await chat('I forgot can check what was it based on transaction', c1);
  check('forgotten merchant looks for original purchase, not incoming refund', /original purchase/.test(a.text) && !/didn.t find any refund/.test(a.text), a);
  a = await chat('Recently. In electronic shop', c1);
  check('shop type keeps original-purchase context', /original purchase/.test(a.text), a);
  a = await chat('I used nordea for payment', c1);
  check('Nordea is payment method, not merchant search', /how you paid, not which shop/.test(a.text) && !/searched/.test(a.text), a);
  a = await chat('89.90', c1);
  check('amount lookup does not claim incoming refund or open case', /original purchase/.test(a.text) && !a.card && (await state()).length === 0, a);
  a = await chat('Tuulikki', c1);
  check('merchant identified after details offers existing consent', a.card === 'refund_consent', a);
  check('intake never opens a case without permission', (await state()).length === 0);
  for (const t of ['where is my refund?', 'my refund has not arrived', 'how can I get my money back?', 'can you help with my refund please?']) {
    a = await chat(t); check('natural missing-refund phrase: ' + t, ASK.test(a.text), a);
  }
  for (const t of ['What is my balance?', 'cancel that', 'no thanks', 'unrelated, what is my salary?']) {
    a = await chat('refund'); const cid = a.cid;
    a = await chat(t, cid); check('topic/cancel not handled as shop: ' + t, !a.card && !/cannot look into refunds/.test(a.text), a);
    a = await chat('Tuulikki', cid); check('topic/cancel releases intake: ' + t, !a.card, a);
  }
  for (const t of ['tell me a joke', 'what is the weather?', 'my card was stolen', 'I shared my password']) {
    a = await chat('refund'); a = await chat(t, a.cid);
    check('unrelated or safety request is not trapped: ' + t, !/original purchase|which shop|cannot look into refunds/.test(a.text), a);
  }
  a = await chat('refund'); a = await chat('in September 2026', a.cid);
  check('a year is not treated as a purchase amount', !/by that amount/.test(a.text), a);
  a = await chat('Tuulikki'); check('new conversation does not inherit intake', !a.card, a);
  a = await chat('refund'); a = await chat('I paid with my Nordea card', a.cid);
  check('card detail cannot become salary or balance answer', /how you paid/.test(a.text) && !/latest pay|Current account:/.test(a.text), a);
  a = await chat('refund'); a = await chat('an online shop', a.cid);
  check('generic shop asks for name', /What is the shop called/.test(a.text), a);
  a = await chat('refund'); a = await chat('Zalando', a.cid);
  check('unsupported merchant is honest', /cannot look into refunds/.test(a.text) && !a.card, a);
  // Actual published amount mismatch: no record detail before opt-in, discrepancy after.
  const first = await fetch(BASE + '/api/chat', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'lauri',text:'I returned headphones and need my refund'})}).then(r=>r.json()) as any;
  const mismatch = await fetch(BASE + '/api/chat', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'lauri',conversationId:first.conversationId,text:'It was Tuulikki Electronics, about 129 euros.'})}).then(r=>r.json()) as any;
  const offerMsg=mismatch.messages.at(-1);
  check('approximate amount is unverified before consent, no preset amount leaked', /not yet matched/.test(offerMsg.text) && !/89[,.]90/.test(offerMsg.text),offerMsg);
  const allowed=await fetch(BASE+'/api/actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'lauri',messageId:offerMsg.id,action:'refund_allow',payload:{items:offerMsg.cards[0].data.items.map((i:any)=>i.id)}})}).then(r=>r.json()) as any;
  check('allowed-record mismatch explicitly disclosed, not a claimed match', /89[,.]90/.test(allowed.messages[0].text) && /129/.test(allowed.messages[0].text) && /not a match/.test(allowed.messages[0].text),allowed);
  const mismatchCase=(await state()).find((c:any)=>!c.withdrawn);
  await fetch(BASE+`/api/refund/case/${mismatchCase.id}/withdraw`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  // with an open case, "where is my refund" is answered from the case only
  const offerJ = (await (await fetch(BASE + '/api/refund/lauri')).json()) as any;
  await fetch(BASE + '/api/refund/lauri/cases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consentItems: offerJ.offer.map((o: any) => o.id) }) });
  a = await chat('where is my refund');
  const statusCid = a.cid;
  check('with an open case, "where is my refund" is answered from the case', /89,90 €.*expected/.test(a.text) && /promised it by 12 Oct/.test(a.text) && /write to the shop/.test(a.text) && !a.card, a);
  a = await chat('where is my balance');
  check('a balance question is not taken as a refund question', !/expected/.test(a.text), a);
  const cs = (await state());
  await fetch(BASE + `/api/refund/case/${cs[0].id}/withdraw`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const after = JSON.stringify(await (await fetch(BASE + `/api/conversations/${statusCid}/messages`)).json());
  check('after withdrawal the refund status Nora wrote in chat is removed, the customer\'s own words stay', !/89,90|TE-48213|40,00/.test(after) && /where is my refund/.test(after), after.slice(0, 300));
  const log = JSON.stringify((await state()));
  check('no case remains open, nothing left readable after all of this', (await state()).every((c: any) => c.withdrawn), log);
} finally { stop(); }
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
