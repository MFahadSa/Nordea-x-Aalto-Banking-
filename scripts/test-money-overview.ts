/**
 * Offline proof for the general money question ("How am I doing with my money this month?").
 * Before: the relevance filter in TurnFinancialEvidence matched no keyword, so the model got an EMPTY handle list,
 * could not quote any figure, and the turn ended at the 6-step limit ("I couldn't verify my answer").
 * Scripted provider, real routes, no paid AI.
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'money-overview-')); process.env.PORT = '3942'; process.env.NODE_ENV = 'production';
for (const k of ['SUPABASE_URL', 'GEMINI_API_KEY', 'LLM_API_KEY', 'LLM_PROVIDER', 'GROQ_API_KEY', 'USER_DB_URL', 'CM_DB_URL', 'NORDEA_DB_URL']) delete process.env[k];
let failed = 0;
const check = (name: string, ok: unknown, detail?: unknown) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : ` ${JSON.stringify(detail).slice(0, 400)}`}`); };
let steps = 0; let lastHandles: any[] = [];
const { setProvider } = await import('../src/server/llm.js');
setProvider({ name: 'scripted', isConfigured: () => true, step: async (a: any) => {
  steps++;
  const text = String(a.turns?.filter((t: any) => t.role === 'user').pop()?.text || '');
  const hs = JSON.parse((a.system.match(/FINANCIAL FACT HANDLES[^\n]*?: (\[.*\])/)||[])[1] || '[]'); lastHandles = hs;
  const called = /"name":"getSpending"/.test(JSON.stringify(a.turns));
  if (!called) return { calls: [{ id: 's', name: 'getSpending', args: {} }] };
  const cur = hs.find((h: any) => h.field === 'current_month_spending');
  if (!cur) return { calls: [{ id: 'f', name: 'finishReply', args: { text: 'Here is how you are doing.', suggestions: [], usedEntryIds: [], topic: 'spending', couldHelp: true, financialAnswer: [{ fact: 'nothing-to-pick' }] } }] };
  return { calls: [{ id: 'f', name: 'finishReply', args: { text: 'Here is how this month looks so far.', suggestions: [], usedEntryIds: [], topic: 'spending', couldHelp: true, financialAnswer: [{ fact: cur.id }] } }] };
} } as any);
await import('../server.js');
const base = 'http://127.0.0.1:3942';
for (let i = 0; i < 100; i++) { try { await fetch(base + '/api/about?userId=lauri'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
const ask = async (text: string) => { steps = 0; lastHandles = []; const r: any = await (await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'lauri', helperId: 'abel', text }) })).json(); const m = r.messages.find((x: any) => x.sender === 'agent'); return { m, handles: lastHandles.length, steps }; };

for (const q of ['How am I doing with my money this month?', 'How are my finances?', 'what is my money situation']) {
  const r = await ask(q);
  check(`overview "${q}": handles supplied`, r.handles > 0, r.handles);
  check(`overview "${q}": finishes (no fallback, no step limit)`, !/couldn.t verify/i.test(r.m.text) && !r.m.errorInfo, { text: r.m.text, err: r.m.errorInfo, steps: r.steps });
  check(`overview "${q}": figure comes from the bank data`, /2[\s\u00a0\u202f]?159/.test(r.m.text), r.m.text);
}
// Adversarial: unrelated chat does not get bank handles just because of the new pattern.
for (const q of ['I like hiking this month', 'tell me a joke about my cat', 'how are you today', 'my finances are none of your business', 'how am i doing on my Japan goal']) {
  const r = await ask(q);
  check(`unrelated "${q}": no bank handles`, r.handles === 0 || !lastHandles.some((h: any) => /balance|spending/.test(h.field)), { handles: r.handles });
}
// Regex-level adversarial negatives: none of these may match the overview pattern (they must not release bank handles).
const { MONEY_OVERVIEW } = await import('../src/server/advice/turnFinancialEvidence.js');
for (const q of ['how am i doing on my Japan goal', 'how am i doing at the gym', 'how am i going to afford a car', 'please transfer my money to savings', 'I lost my money in a scam, what do I do', 'my finances are none of your business', 'how are finances in Finland', "what's the financial status of Nordea", 'miten menee', 'how am I doing today', 'I like hiking this month'])
  check(`negative pattern "${q}": does not match`, !MONEY_OVERVIEW.test(q));
for (const q of ['How am I doing with my money this month?', 'how am i doing with money', 'How is my money doing?', "how's my money", 'How are my finances?', 'what is my money situation', 'give me an overview of my finances', 'How am I doing on my finances this month?'])
  check(`positive pattern "${q}": matches`, MONEY_OVERVIEW.test(q));
// Existing keyword path unchanged.
{ const r = await ask('How much have I spent this month?'); check('spend question still works', /2[\s\u00a0\u202f]?159/.test(r.m.text), r.m.text); }
console.log(failed ? `FAILED ${failed}` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
