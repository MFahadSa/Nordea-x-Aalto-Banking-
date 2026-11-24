/** Targeted ASP/PS check, 24 Nov 2026: conversation-state regressions through the real /api/chat route with a
 *  scripted provider. Scripted model output: proves the app's contracts, not live model quality. */
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-conv-')); process.env.PORT = '3822'; process.env.NODE_ENV = 'production';
for (const k of ['SUPABASE_URL', 'GEMINI_API_KEY', 'LLM_API_KEY', 'GROQ_API_KEY', 'USER_DB_URL', 'AGENT_DB_URL', 'SHARED_DB_URL']) delete process.env[k];
const { db } = await import('../src/server/db.js'); const finance = await import('../src/server/finance.js'); const { setProvider } = await import('../src/server/llm.js');
let script: any[] = []; let calls = 0;
setProvider({ name: 'audit-scripted', isConfigured: () => true, step: async (a: any) => { calls++; const x = script.shift(); return typeof x === 'function' ? x(a) : x ?? fin('[script empty]'); } } as any);
await import('../server.ts'); await new Promise((r) => setTimeout(r, 500));
const base = 'http://127.0.0.1:3822';
const J = async (url: string, b?: any) => { const r = await fetch(base + url, { method: b ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json() as any }; };
function fin(text: string, extra: any = {}) { return { calls: [{ name: 'finishReply', args: { text, suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true, ...extra } }] }; }
const tool = (name: string, args: any) => ({ calls: [{ name, args }] });
const conv = async () => (await J('/api/conversations', { userId: 'lauri', helperId: 'abel' })).body.conversation.id;
const say = async (c: string, text: string) => (await J('/api/chat', { userId: 'lauri', conversationId: c, text })).body.messages.at(-1);
let n = 0; const failed: string[] = []; const pass = (m: string) => { n++; console.log('PASS ', m); };
let c = ''; let r: any; let t1: any;
const section = async (name: string, fn: () => Promise<void>) => { script = []; try { await fn(); } catch (e: any) { failed.push(name); console.log('FAIL ', name, '—', String(e.message).replace(/\n+/g, ' ').slice(0, 400)); } };

const {reviewedProductSentences}=await import('../src/server/advice/reviewedAnswer.js');
await section('ASP checked product explanation',async()=>{
 c=await conv(); const text=reviewedProductSentences('Explain ASP','2026-10-23').join(' ');
 script=[fin(text),fin(text)];r=await say(c,'Explain ASP interest and bonus conditions.');
 assert.equal(r.text.replace(/(?<=\d),(?=\d{3})/g,' '),text.replace(/(?<=\d),(?=\d{3})/g,' '));assert.ok(!r.errorInfo);assert.notEqual(r.answeredBy,'bank_code');pass('complete reviewed ASP explanation passes real chat route');
});
await section('PS checked product explanation',async()=>{
 c=await conv();const text=reviewedProductSentences('Explain PS','2026-10-23').join(' ');
 script=[fin(text),fin(text)];r=await say(c,'Explain PS contribution deductions and withdrawal rules.');
 assert.equal(r.text.replace(/(?<=\d),(?=\d{3})/g,' '),text.replace(/(?<=\d),(?=\d{3})/g,' '));assert.ok(!r.errorInfo);assert.notEqual(r.answeredBy,'bank_code');pass('complete reviewed PS explanation passes real chat route');
});
await section('mixed personal claim refused',async()=>{
 c=await conv();const text=reviewedProductSentences('Explain ASP','2026-10-23').join(' ')+' Your balance is 123456 euros.';
 script=[fin(text),fin(text)];r=await say(c,'Explain ASP.');assert.doesNotMatch(r.text,/123456/);pass('a valid product quote cannot unlock unsupported personal balances');
});
await section('invalid product facts refused',async()=>{
 for(const [request,text] of [
  ['Explain ASP rates.','ASP pays 4 % interest and a 1 % bonus.'],
  ['Explain PS deductions.','Your PS balance is deductible up to 5000 euros in 2026.'],
  ['Explain PS withdrawals.','You can make tax-free withdrawals in 2027.'],
  ['Explain ASP.','Your salary is 2107 EUR a month.']
 ]){c=await conv();script=[fin(text),fin(text),fin(text)];r=await say(c,request);assert.notEqual(r.text,text);pass('rejects invalid product/personal assertion: '+text);}
});
console.log(`RESULT product-prose route: ${n} checks passed, ${failed.length} sections failed${failed.length ? ' (' + failed.join(', ') + ')' : ''} (scripted provider; real /api/chat and /api/actions)`);
process.exit(failed.length ? 1 : 0);
