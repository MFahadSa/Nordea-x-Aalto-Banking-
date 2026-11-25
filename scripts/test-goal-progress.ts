/** A goal not linked to an account: what the customer says they saved makes its progress known (chat, Add new info, Edit). Real routes. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-progress-'));
process.env.PORT = '3921';
process.env.NODE_ENV = 'production';
for (const k of ['SUPABASE_URL', 'GEMINI_API_KEY', 'LLM_API_KEY', 'LLM_PROVIDER', 'GROQ_API_KEY', 'USER_DB_URL', 'CM_DB_URL', 'NORDEA_DB_URL']) delete process.env[k];

let failed = 0;
const check = (name: string, ok: unknown, detail?: unknown) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : ` ${JSON.stringify(detail).slice(0, 400)}`}`); };

const { setProvider } = await import('../src/server/llm.js');
let system = '';
setProvider({ name: 'capture', isConfigured: () => true, step: async (a: any) => {
  if (a.tools.some((t: any) => t.name === 'finishReply')) system = a.system;
  return { calls: [{ id: 'f', name: 'finishReply', args: { text: 'Noted.', suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true } }] };
} } as any);
await import('../server.js');
const base = 'http://127.0.0.1:3921';
for (let i = 0; i < 100; i++) { try { await fetch(base + '/api/about?userId=lauri'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
const req = async (u: string, body?: unknown, method = 'POST') => (await fetch(base + u, body ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : method === 'GET' ? {} : { method })).json() as Promise<any>;
const { db } = await import('../src/server/db.js');
const fin = await import('../src/server/finance.js');

const japan = () => db.getCabinetEntries('lauri').find((e: any) => e.type === 'goal' && /japan/i.test(e.title))!;
const status = () => fin.goalStatus('lauri', japan());
check('the Japan goal starts with unknown progress', status().saved === undefined && status().onTrack === undefined, status());

// 1. Chat: progress said in chat is proposed on a card; nothing is recorded until the customer taps.
const r = await req('/api/chat', { userId: 'lauri', helperId: 'abel', text: "I've saved 800 € for the Japan trip, and I put 150 € a month in" });
check('chat: nothing recorded before the tap', status().saved === undefined && status().source === 'unlinked', status());
const agent = r.messages.find((m: any) => m.sender === 'agent');
const card = (agent?.cards || []).find((c: any) => c.type === 'goal_progress');
check('chat: a Save progress card proposes 800 and 150', card?.data?.saved === 800 && card?.data?.monthly === 150 && card?.data?.goalId === japan().id, agent?.cards);
check('chat: Nora is told it is a proposal, not a record', /Nothing is recorded until they tap/.test(system), system.slice(-400));
const no = await req('/api/actions', { userId: 'lauri', messageId: agent?.id, action: 'progress_no' });
check('chat: declining records nothing', status().saved === undefined && (no.messages || []).some((m: any) => /nothing was recorded/i.test(m.text)), no);
const r2 = await req('/api/chat', { userId: 'lauri', helperId: 'abel', text: "I've saved 800 € for the Japan trip, and I put 150 € a month in" });
const agent2 = r2.messages.find((m: any) => m.sender === 'agent');
const yes = await req('/api/actions', { userId: 'lauri', messageId: agent2?.id, action: 'progress_save' });
check('chat: the tap records saved and monthly', status().saved === 800 && status().monthlyGoingIn === 150, status());
check('chat: progress and forecast now known', status().percentSaved !== undefined && status().onTrack !== undefined, status());
const done = (yes.messages || []).find((m: any) => m.sender === 'agent');
check('chat: a note with Undo under the reply', (done?.notes || []).some((n: any) => /Progress recorded/.test(n.text) && n.undoToken), done?.notes);
check('chat: marked as what the customer told us', status().source === 'customer-stated');

// A question is not a statement: no card, nothing changes.
const q = await req('/api/chat', { userId: 'lauri', helperId: 'abel', text: 'Have I saved 900 € for Japan?' });
const qAgent = q.messages.find((m: any) => m.sender === 'agent');
check('a question does not change it or offer a card', status().saved === 800 && !(qAgent?.cards || []).some((c: any) => c.type === 'goal_progress'));

// Adversarial attribution: rent, salary and bills in the same message are never goal progress.
const mix = await req('/api/chat', { userId: 'lauri', helperId: 'abel', text: "I've saved 900 € for the Japan trip and my rent is 1150 a month" });
const mixCard = (mix.messages.find((m: any) => m.sender === 'agent')?.cards || []).find((c: any) => c.type === 'goal_progress');
check('rent is never the monthly saving', mixCard?.data?.saved === 900 && mixCard?.data?.monthly === undefined, mixCard?.data);
await req('/api/actions', { userId: 'lauri', messageId: mix.messages.find((m: any) => m.sender === 'agent')?.id, action: 'progress_no' });
const sal = await req('/api/chat', { userId: 'lauri', helperId: 'abel', text: "I save 200 € a month for Japan and my salary is 3 900 a month" });
const salCard = (sal.messages.find((m: any) => m.sender === 'agent')?.cards || []).find((c: any) => c.type === 'goal_progress');
check('salary is never the monthly saving', salCard?.data?.monthly === 200 && salCard?.data?.saved === undefined, salCard?.data);
await req('/api/actions', { userId: 'lauri', messageId: sal.messages.find((m: any) => m.sender === 'agent')?.id, action: 'progress_no' });

// 2. Add new info
const u = await req('/api/info/understand', { userId: 'lauri', text: "I've saved 1 000 € for Japan so far" });
check('add new info: understood as progress on the Japan goal', u.ok && u.progress?.saved === 1000 && u.progress?.monthly === 150 && /japan/i.test(u.progress.title), u);
// A savings target is a goal, never a "saves X every month" habit.
const car = await req('/api/info/understand', { userId: 'lauri', text: "I'm saving 5 000 € for a car by August 2027" });
check('add new info: a car target is a goal, not a monthly habit', car.ok && car.draft?.type === 'goal' && car.draft?.target?.amount === 5000, car);
const rome = await req('/api/info/understand', { userId: 'lauri', text: 'I am saving 200 a month for Rome' });
check('add new info: monthly towards a goal asks for the date, with a clean title', !rome.ok && rome.reason === 'goal_details' && /rome/i.test(rome.title) && !/Savinga/i.test(rome.title), rome);
const habit = await req('/api/info/understand', { userId: 'lauri', text: 'I save 400 € every month' });
check('add new info: a plain monthly habit still updates About you', habit.ok && habit.about?.key === 'money', habit);

// 3. Edit (what the app sends)
await req(`/api/cabinet/${japan().id}`, { progress: { saved: 1200, at: new Date().toISOString() } }, 'PATCH');
check('edit: saved updated', status().saved === 1200);
await req(`/api/cabinet/${japan().id}`, { progress: null }, 'PATCH');
check('edit: cleared goes back to unknown, not 0', status().saved === undefined && status().onTrack === undefined, status());

// The linked main goal keeps the account's numbers.
const flat = db.getCabinetEntries('lauri').find((e: any) => e.type === 'goal' && /flat/i.test(e.title))!;
const before = fin.goalStatus('lauri', flat).saved;
await req('/api/chat', { userId: 'lauri', helperId: 'abel', text: "I've saved 5 € for the flat" });
check('a goal linked to an account keeps the account balance', fin.goalStatus('lauri', flat).saved === before);

// Points for Add new info: paid once per item, only for a fresh save of their own, at most 5 a day.
const pts = () => db.getUser('lauri')!.points || 0;
const add = async (title: string) => (await req('/api/cabinet', { userId: 'lauri', type: 'fact', title, detail: title, source: 'customer' })).entry.id as string;
const p0 = pts();
const first = await add('Moving to Espoo in March');
check('a new item earns 20', (await req('/api/info/reward', { userId: 'lauri', kind: 'new', id: first })).points === 20 && pts() === p0 + 20);
check('the same item is paid once', (await req('/api/info/reward', { userId: 'lauri', kind: 'new', id: first })).points === 0);
await req(`/api/cabinet/${japan().id}`, { progress: { saved: 900, at: new Date().toISOString() } }, 'PATCH');
check('a goal progress update earns 10', (await req('/api/info/reward', { userId: 'lauri', kind: 'progress', id: japan().id })).points === 10);
check('someone else’s or an unknown item earns nothing', (await req('/api/info/reward', { userId: 'lauri', kind: 'new', id: 'nope' })).points === 0);
for (let i = 0; i < 6; i++) await req('/api/info/reward', { userId: 'lauri', kind: 'new', id: await add(`Note ${i}`) });
const earned = ((db.getUser('lauri') as any).infoRewards || []).filter((r: any) => r.at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
check('at most 5 a day', earned === 5, earned);
const e = await req('/api/info/earn?userId=lauri', undefined, 'GET');
check('Earn more says none left today', e.infoLeftToday === 0 && e.points.new === 20, e);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
