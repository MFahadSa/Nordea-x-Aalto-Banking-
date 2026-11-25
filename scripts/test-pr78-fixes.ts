/**
 * Adversarial tests for the PR78 consolidation: wrong-money attribution, confirm-before-save,
 * goal progress answers, privacy choices and memory settings. Real routes, scripted model, no paid AI.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pr78-fixes-'));
process.env.PORT = '3922';
process.env.NODE_ENV = 'production';
for (const k of ['SUPABASE_URL', 'GEMINI_API_KEY', 'LLM_API_KEY', 'LLM_PROVIDER', 'GROQ_API_KEY', 'USER_DB_URL', 'CM_DB_URL', 'NORDEA_DB_URL']) delete process.env[k];

let failed = 0;
const check = (name: string, ok: unknown, detail?: unknown) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : ` ${JSON.stringify(detail).slice(0, 400)}`}`); };

let system = '';
const { setProvider } = await import('../src/server/llm.js');
setProvider({ name: 'scripted', isConfigured: () => true, step: async (a: any) => {
  if (a.tools.some((t: any) => t.name === 'finishReply')) system = a.system;
  const text = String(a.turns?.filter((t: any) => t.role === 'user').pop()?.text || '');
  // A private note, once per message: propose it sensitive, then finish.
  if (/knee surgery/.test(text) && !/saved":true/.test(JSON.stringify(a.turns))) {
    return { calls: [{ id: 'p1', name: 'proposeCabinetChange', args: { action: 'add', type: 'fact', title: 'Friend’s knee surgery', detail: 'My friend is going through knee surgery and it worries me.', sensitive: true } }] };
  }
  if (/save this note please/.test(text) && !/saved":true/.test(JSON.stringify(a.turns))) {
    return { calls: [{ id: 'p2', name: 'proposeCabinetChange', args: { action: 'add', type: 'fact', title: 'Ordinary note', detail: 'An ordinary fact the customer asked to save.', sensitive: false } }] };
  }
  return { calls: [{ id: 'f', name: 'finishReply', args: { text: 'Noted.', suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true } }] };
} } as any);
await import('../server.js');
const base = 'http://127.0.0.1:3922';
for (let i = 0; i < 100; i++) { try { await fetch(base + '/api/about?userId=lauri'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
const req = async (u: string, body?: unknown, method = 'POST') => (await fetch(base + u, body ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : method === 'GET' ? {} : { method })).json() as Promise<any>;
const { db } = await import('../src/server/db.js');
const fin = await import('../src/server/finance.js');

const chat = async (text: string) => req('/api/chat', { userId: 'lauri', helperId: 'abel', text });
const agentOf = (r: any) => r.messages.find((m: any) => m.sender === 'agent');
const japan = () => db.getCabinetEntries('lauri').find((e: any) => e.type === 'goal' && /japan/i.test(e.title))!;
const status = () => fin.goalStatus('lauri', japan());

// --- A. A private note from chat still gets the Save privately card; nothing is saved without the tap.
const priv = await chat('my friend is going through knee surgery and it worries me');
const privAgent = agentOf(priv);
check('private note: the Save privately card is offered', (privAgent?.cards || []).some((c: any) => c.type === 'confirm_save'), privAgent?.cards);
check('private note: nothing saved before the tap', !db.getCabinetEntries('lauri').some((e: any) => /knee surgery/i.test(e.title) && e.status !== 'archived'));
const savedPriv = await req('/api/actions', { userId: 'lauri', messageId: privAgent?.id, action: 'save_private' });
check('private note: the tap saves it privately', db.getCabinetEntries('lauri').some((e: any) => /knee surgery/i.test(e.title) && e.private === true), savedPriv);

// --- Memory settings: past chats are OFF by default; the switch really gates the prompt.
const mem0 = await req('/api/memory?userId=lauri', undefined, 'GET');
check('memory: past chats off by default, saving from chats on', mem0.searchChats === false && mem0.fromChats === true, mem0);
await chat('how much is on my current account?');
check('memory: no earlier-chat titles in the prompt while off', !/EARLIER CHATS/.test(system));
await req('/api/memory', { userId: 'lauri', searchChats: true });
await chat('and what about my savings account?');
check('memory: after the switch, earlier-chat titles reach the prompt', /EARLIER CHATS/.test(system), system.slice(-500));
await req('/api/memory', { userId: 'lauri', searchChats: false });

// --- Memory settings: "Remember things from chats" off really blocks saving (removal still works).
await req('/api/memory', { userId: 'lauri', fromChats: false });
const blocked = await chat('save this note please');
check('memory: fromChats off blocks a save', !db.getCabinetEntries('lauri').some((e: any) => e.title === 'Ordinary note'), agentOf(blocked)?.cards);
await req('/api/memory', { userId: 'lauri', fromChats: true });

// --- B. Wrong money: rent and salary in the same message are never goal progress.
const mix = await chat("I've saved 800 € for the Japan trip and my rent is 1150 a month");
const mixCard = (agentOf(mix)?.cards || []).find((c: any) => c.type === 'goal_progress');
check('rent: only the goal amount is proposed', mixCard?.data?.saved === 800 && mixCard?.data?.monthly === undefined, mixCard?.data);
check('rent: nothing recorded without a tap', status().saved === undefined, status());
const sal = await chat("I save 200 € a month for Japan and my salary is 3 900 a month");
const salCard = (agentOf(sal)?.cards || []).find((c: any) => c.type === 'goal_progress');
check('salary: only the goal monthly is proposed', salCard?.data?.monthly === 200 && salCard?.data?.saved === undefined, salCard?.data);
const over = await chat("I've saved 5 000 € for the Japan trip");
check('more than the target is not "saved so far": no card', !(agentOf(over)?.cards || []).some((c: any) => c.type === 'goal_progress'), agentOf(over)?.cards);

// --- Save, then Undo.
const save = await req('/api/actions', { userId: 'lauri', messageId: agentOf(mix)?.id, action: 'progress_save' });
check('tap: progress recorded', status().saved === 800 && status().source === 'customer-stated', status());
const undoToken = (save.messages || []).flatMap((m: any) => m.notes || []).find((n: any) => n.undoToken)?.undoToken;
const undo = await req('/api/cabinet/undo', { userId: 'lauri', undoToken });
check('undo: the recorded progress is taken back', status().saved === undefined, undo);
const again = await chat("I've saved 800 € for the Japan trip, and I put 150 € a month in");
await req('/api/actions', { userId: 'lauri', messageId: agentOf(again)?.id, action: 'progress_save' });
check('save again after undo works', status().saved === 800, status());

// --- C. Nora's goal-progress answer uses the customer's own numbers, like the card does.
const ans = await chat('Am I on track for the Japan trip?');
const ansText = String(agentOf(ans)?.text || '');
check('goal question: answered with the stated numbers', /800/.test(ansText) && /figures you told me/.test(ansText), ansText);
check('goal question: no more "no linked saved balance"', !/no linked saved balance/i.test(ansText), ansText);

// --- A declined card leaves the goal untouched; a stale card cannot save twice.
const dec = await chat("I've saved 950 € for the Japan trip");
const decAgent = agentOf(dec);
await req('/api/actions', { userId: 'lauri', messageId: decAgent?.id, action: 'progress_no' });
check('declined card: numbers stay as they were', status().saved === 800, status());
const twice = await req('/api/actions', { userId: 'lauri', messageId: decAgent?.id, action: 'progress_save' });
check('an answered card cannot be answered again', !!twice.error, twice);

// --- F. About you reset rejects an unknown customer.
const reset = await fetch(base + '/api/about/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'nobody' }) });
check('about reset: unknown customer is 404', reset.status === 404, reset.status);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
