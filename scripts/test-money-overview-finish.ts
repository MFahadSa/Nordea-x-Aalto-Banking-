/**
 * Offline proof: a general money question can finish with checked, labelled figures.
 *
 * Live (PR #79 handoff): "How am I doing with my money this month?" ended in the fallback. The refused sentence was
 * "After keeping 500 € in your current account, you could move an extra 300 € to savings." Both numbers are the
 * demo pay plan's own values (keepInCurrentAccount 500, suggestedExtraMove 300). They were refused because the pay
 * plan's figures were filtered out for this wording although the model had fetched the plan, and the 500 € buffer
 * was never registered as a fact. Whether the live model called getPayPlan was not captured; the exact match of
 * both values is the evidence.
 *
 * Scripted provider, real /api/chat route, no paid AI. Fictional demo customer (Lauri).
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'money-overview-finish-')); process.env.PORT = '3946'; process.env.NODE_ENV = 'production';
for (const k of ['SUPABASE_URL', 'GEMINI_API_KEY', 'LLM_API_KEY', 'LLM_PROVIDER', 'GROQ_API_KEY', 'USER_DB_URL', 'CM_DB_URL', 'NORDEA_DB_URL']) delete process.env[k];
let failed = 0;
const check = (name: string, ok: unknown, detail?: unknown) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : ` ${JSON.stringify(detail).slice(0, 400)}`}`); };
type Plan = (a: any, handles: any[], toolResults: any[]) => any;
let plan: Plan = () => null; let toolResults: any[] = [];
const fin = (text: string, financialAnswer?: any[]) => ({ calls: [{ id: 'f', name: 'finishReply', args: { text, suggestions: [], usedEntryIds: [], topic: 'spending', couldHelp: true, ...(financialAnswer ? { financialAnswer } : {}) } }] });
const { setProvider } = await import('../src/server/llm.js');
setProvider({ name: 'scripted', isConfigured: () => true, step: async (a: any) => {
  const last = a.turns.at(-1); if (last?.role === 'tool_results') toolResults.push(...last.results);
  const hs = JSON.parse((a.system.match(/FINANCIAL FACT HANDLES[^\n]*?: (\[.*\])/) || [])[1] || '[]');
  return plan(a, hs, toolResults) ?? fin('Okay.');
} } as any);
await import('../server.js');
const base = 'http://127.0.0.1:3946';
for (let i = 0; i < 100; i++) { try { await fetch(base + '/api/about?userId=lauri'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
const ask = async (text: string, p: Plan) => { plan = p; toolResults = []; const r: any = await (await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'lauri', helperId: 'abel', text }) })).json(); return r.messages.find((x: any) => x.sender === 'agent'); };
const called = (a: any, tool: string) => JSON.stringify(a.turns).includes(`"${tool}"`);
const Q = 'How am I doing with my money this month?';
const LIVE = 'After keeping 500 € in your current account, you could move an extra 300 € to savings.';
const nb = (t: string) => t.replace(/[  ]/g, ' ');

// 1. The live sentence, after the model fetched the pay plan: shown as written.
{ const m = await ask(Q, (a) => called(a, 'getPayPlan') ? fin(LIVE) : { calls: [{ id: 'p', name: 'getPayPlan', args: {} }] });
  check('live sentence after getPayPlan is shown as written', nb(m.text) === LIVE && !m.errorInfo, { text: m.text, err: m.errorInfo }); }
// …negative control: the same sentence without fetching the plan stays refused (the plan is not relevant to the wording).
{ const m = await ask(Q, () => fin(LIVE));
  check('same sentence WITHOUT fetching the plan is still refused', !/500/.test(m.text), { text: m.text }); }
// …negative controls after fetching: a real value given the wrong meaning, or an invented value, is refused.
for (const wrong of ['You have 500 € in your current account right now.', 'You could move an extra 500 € to savings.', 'After keeping 500 € in your current account, you could move an extra 350 € to savings.']) {
  const m = await ask(Q, (a) => called(a, 'getPayPlan') ? fin(wrong) : { calls: [{ id: 'p', name: 'getPayPlan', args: {} }] });
  check(`refused after getPayPlan: "${wrong}"`, !/500|350/.test(m.text), { text: m.text });
}
// 2. The fetched tool result carries fact handles the model can select with financialAnswer.
{ const m = await ask(Q, (a, _h, tr) => {
    if (!called(a, 'getPayPlan')) return { calls: [{ id: 'p', name: 'getPayPlan', args: {} }] };
    const hs = tr.find((r: any) => r.call?.name === 'getPayPlan')?.result?.factHandles || [];
    const id = (field: string) => hs.find((h: any) => h.field === field)?.id;
    return fin('Here is what your payday plan says.', [{ fact: id('buffer_kept_by_plan') }, { fact: id('suggested_extra_not_approved') }]);
  });
  check('pay-plan handles from the tool result render as labelled sentences', /keeps 500\s€ in your current account as a buffer/.test(nb(m.text)) && /300\s€ a month more into savings/.test(nb(m.text)) && !m.errorInfo, { text: m.text, err: m.errorInfo }); }
// 3. A labelled overview: this month's spending, the average beside it, and the balances.
{ const m = await ask(Q, (_a, hs) => {
    const pick = (field: string, entity?: RegExp) => ({ fact: hs.find((h: any) => h.field === field && (!entity || entity.test(h.entity)))?.id });
    return fin('Here is where you stand.', [pick('current_month_spending', /^All tracked spending$/), pick('average_spending', /^All tracked spending$/), pick('balance', /^current$/), pick('balance', /^savings$/)]);
  });
  const t = nb(m.text);
  check('overview: this month + average + balances render with their own labels', /So far this month you have spent 2159\s€/.test(t) && /On average you spend 2107\s€ a month/.test(t) && /current account has 1420\.5\s€|current has 1420\.5\s€/.test(t) && !m.errorInfo, { text: m.text, err: m.errorInfo }); }
// …negative control: the average alone still cannot answer a "this month" question.
{ const m = await ask(Q, (_a, hs) => fin('Here is this month.', [{ fact: hs.find((h: any) => h.field === 'average_spending' && h.entity === 'All tracked spending')?.id }]));
  check('average alone for "this month" is still refused', !/2107/.test(m.text), { text: m.text }); }
// …negative control: last month's figure alone cannot answer "this month".
{ const m = await ask(Q, (_a, hs) => fin('Here is this month.', [{ fact: hs.find((h: any) => h.field === 'last_full_month_spending' && /^All tracked spending/.test(h.entity))?.id }]));
  check('last full month alone for "this month" is still refused', !/2214/.test(m.text), { text: m.text }); }
// …and "how much did I spend last month" still needs last month's figure.
{ const m = await ask('How much did I spend last month?', (_a, hs) => fin('Here it is.', [{ fact: hs.find((h: any) => h.field === 'average_spending' && h.entity === 'All tracked spending')?.id }]));
  check('average alone for "last month" is still refused', !/2107/.test(m.text), { text: m.text }); }

console.log(failed ? `FAILED ${failed}` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
