/**
 * F3 offline proof: when a deterministic Save-progress card owns the turn's outcome, the forced
 * "Nothing changed. The proposed information is already saved." reply for an alreadyKnown
 * proposeCabinetChange is suppressed (the card + verifier own the wording). Without a card,
 * the forced reply still fires. Scripted provider, real routes, no paid AI.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'f3-proof-'));
process.env.PORT = '3927';
process.env.NODE_ENV = 'production';
for (const k of ['SUPABASE_URL', 'GEMINI_API_KEY', 'LLM_API_KEY', 'LLM_PROVIDER', 'GROQ_API_KEY', 'USER_DB_URL', 'CM_DB_URL', 'NORDEA_DB_URL']) delete process.env[k];

let failed = 0;
const check = (name: string, ok: unknown, detail?: unknown) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : ` ${JSON.stringify(detail).slice(0, 400)}`}`); };

let dbRef: any = null;
const staleUpdate = () => {
  const goal = dbRef.getCabinetEntries('lauri').find((e: any) => e.type === 'goal' && /japan/i.test(e.title));
  return { calls: [{ id: 'u1', name: 'proposeCabinetChange', args: { action: 'update', type: 'goal', title: 'Japan trip', entryId: goal.id } }] };
};
let prose = 'I have put the new progress for your Japan trip on the card below. Tap the card if you want to keep those numbers.';
let textOnly = false;
const { setProvider } = await import('../src/server/llm.js');
setProvider({ name: 'scripted', isConfigured: () => true, step: async (a: any) => {
  const text = String(a.turns?.filter((t: any) => t.role === 'user').pop()?.text || '');
  const acted = /"name":"proposeCabinetChange"/.test(JSON.stringify(a.turns));
  // Turn 2: the model proposes a stale no-change update (alreadyKnown) while the user gave a NEW number.
  if (/actually I've saved 900/.test(text) && !acted) return staleUpdate();
  // Turn 3 control: stale no-change update with NO new number in the text (no progress card).
  if (/please update my Japan trip goal/.test(text) && !acted) return staleUpdate();
  // Mixed-outcome scenarios: a progress card AND another deterministic outcome on the same turn.
  if (/and I.m saving 5000 € for a car/.test(text) && !acted) return { calls: [{ id: 'm1', name: 'proposeCabinetChange', args: { action: 'add', type: 'goal', title: 'Car', targetAmount: 5000, targetDate: '2027-08' } }] };
  if (/and remember that I like hiking/.test(text) && !acted) return { calls: [{ id: 'm2', name: 'proposeCabinetChange', args: { action: 'add', type: 'fact', title: 'Likes hiking', detail: 'Likes hiking.', sensitive: false } }] };
  if (/and I want a new goal for a bike/.test(text) && !acted) return { calls: [{ id: 'm3', name: 'proposeCabinetChange', args: { action: 'add', type: 'goal', title: 'Bike' } }] };
  if (textOnly) return { calls: [], text: prose } as any;
  return { calls: [{ id: 'f', name: 'finishReply', args: { text: prose, suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true } }] };
} } as any);
await import('../server.js');
const base = 'http://127.0.0.1:3927';
for (let i = 0; i < 100; i++) { try { await fetch(base + '/api/about?userId=lauri'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
const req = async (u: string, body?: unknown, method = 'POST') => (await fetch(base + u, body ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : method === 'GET' ? {} : { method })).json() as Promise<any>;
({ db: dbRef } = await import('../src/server/db.js'));

const chat = async (text: string) => req('/api/chat', { userId: 'lauri', helperId: 'abel', text });
const agentOf = (r: any) => r.messages.find((m: any) => m.sender === 'agent');
const japan = () => dbRef.getCabinetEntries('lauri').find((e: any) => e.type === 'goal' && /japan/i.test(e.title))!;
const CONTRADICTION = 'Nothing changed. The proposed information is already saved.';

// --- Turn 1: record 800 saved on the Japan goal through the deterministic card.
const t1 = await chat("I've saved 800 € for the Japan trip");
const t1Agent = agentOf(t1);
const t1Card = (t1Agent?.cards || []).find((c: any) => c.type === 'goal_progress');
check('setup: 800 progress card shown', !!t1Card && t1Card.data?.saved === 800, t1Agent?.cards);
await req('/api/actions', { userId: 'lauri', messageId: t1Agent?.id, action: 'progress_save', cardType: 'goal_progress', card: t1Card });
check('setup: 800 recorded', japan().progress?.saved === 800, japan().progress);

// --- Turn 2: the exact live failure — model proposes an already-known update while the detector shows a 900 card.
const t2 = await chat("actually I've saved 900 € for the Japan trip");
const t2Agent = agentOf(t2);
const t2Card = (t2Agent?.cards || []).find((c: any) => c.type === 'goal_progress');
check('fix: fresh 900 progress card still shown', !!t2Card && t2Card.data?.saved === 900, t2Agent?.cards);
check('fix: reply no longer contradicts the card', !!t2Agent && !String(t2Agent.text).includes(CONTRADICTION), t2Agent?.text);
check('contract: fixed card-owned wording on the progress-card turn', !!t2Agent && String(t2Agent.text) === `${japan().title}: change saved amount to 900 €. Nothing about this progress is saved until you tap Save progress.`, t2Agent?.text);
check('fix: nothing written by the reply alone', japan().progress?.saved === 800, japan().progress);
// Tap records 900.
await req('/api/actions', { userId: 'lauri', messageId: t2Agent?.id, action: 'progress_save', cardType: 'goal_progress', card: t2Card });
check('fix: tapping the card records 900', japan().progress?.saved === 900, japan().progress);

// --- Control turn 3: alreadyKnown WITHOUT a progress card keeps the forced honest reply.
const t3 = await chat('please update my Japan trip goal');
const t3Agent = agentOf(t3);
check('control: no progress card without a new number', !(t3Agent?.cards || []).some((c: any) => c.type === 'goal_progress'), t3Agent?.cards);
check('control: forced already-saved reply still fires without a card', !!t3Agent && String(t3Agent.text).includes(CONTRADICTION), t3Agent?.text);


// --- Contract: whatever the model writes (contradicting, figure-bearing, sympathetic, or plain text with no tool call),
// a Save-progress card turn shows exactly the card's fixed wording. Residual model contradiction cannot reach the user.
const titleOf = japan().title;
let amount = 900;
for (const [label, p, plain] of [
  ['"Nothing changed" prose', 'Nothing changed on your Japan trip goal.', false],
  ['"no change, still 800" prose', 'No change, your Japan trip is still at 800 €.', false],
  ['"already saved" prose', 'That is already saved, nothing is different.', false],
  ['friendly extra remark', 'Great progress! Keep going, Japan will be wonderful.', false],
  ['plain text, no tool call', 'Nothing changed on your Japan trip goal.', true],
] as const) {
  amount += 50; prose = p; textOnly = plain;
  const tn = await chat(`actually I've saved ${amount} € for the Japan trip`);
  const a = agentOf(tn); const c = (a?.cards || []).find((x: any) => x.type === 'goal_progress');
  check(`contract [${label}]: card shown for ${amount}`, !!c && c.data?.saved === amount, a?.cards);
  check(`contract [${label}]: text is exactly the fixed card wording`, String(a?.text) === `${titleOf}: change saved amount to ${amount} €. Nothing about this progress is saved until you tap Save progress.`, a?.text);
  check(`contract [${label}]: nothing written before the tap`, japan().progress?.saved === amount - 50, japan().progress);
  await req('/api/actions', { userId: 'lauri', messageId: a?.id, action: 'progress_save', cardType: 'goal_progress', card: c });
  check(`contract [${label}]: tap records ${amount}`, japan().progress?.saved === amount, japan().progress);
}
textOnly = false; prose = 'Noted.';
// Scope: a turn WITHOUT a progress card keeps the model's own words (not canned).
const t4 = await chat('how is the weather today');
check('scope: ordinary turn keeps the AI-written reply', String(agentOf(t4)?.text) === 'Noted.' && !(agentOf(t4)?.cards || []).some((c: any) => c.type === 'goal_progress'), agentOf(t4)?.text);
// Tradeoff, stated and tested: progress number + question in one message => only the fixed wording is shown.
prose = 'You are doing great, and the weather is sunny.';
amount += 50;
const t5 = await chat(`I've saved ${amount} € for the Japan trip, and also what is the weather`);
const a5 = agentOf(t5);
check('tradeoff: mixed message shows only the fixed card wording (extra AI answer dropped)', !!(a5?.cards || []).find((c: any) => c.type === 'goal_progress') ? String(a5?.text).endsWith('Nothing about this progress is saved until you tap Save progress.') && !/weather/.test(String(a5?.text)) : true, a5?.text);

// --- Mixed outcomes: the progress card's sentence AND the other deterministic outcome are both shown; neither is dropped.
prose = 'Sounds good.'; textOnly = false;
amount += 50;
const m1 = agentOf(await chat(`I've saved ${amount} € for the Japan trip, and I'm saving 5000 € for a car by August 2027`));
console.log('PROBE m1', JSON.stringify({ text: m1?.text, cards: (m1?.cards || []).map((c: any) => c.type) }));
check('mixed A: the app\'s own two-goals question is kept beside the progress sentence (not dropped)', /change saved amount to/.test(String(m1?.text)) && /more than one saving goal/.test(String(m1?.text)) && (m1?.cards || []).some((c: any) => c.type === 'goal_progress'), m1?.text);
await req('/api/actions', { userId: 'lauri', messageId: m1?.id, action: 'progress_save', cardType: 'goal_progress', card: (m1?.cards || []).find((c: any) => c.type === 'goal_progress') });
amount += 50;
const m2 = agentOf(await chat(`I've saved ${amount} € for the Japan trip, and remember that I like hiking`));
console.log('PROBE m2', JSON.stringify({ text: m2?.text, cards: (m2?.cards || []).map((c: any) => c.type), notes: (m2?.notes || []).map((n: any) => n.text) }));
check('mixed B: a real save on the same turn is shown as a note, and the card text claims nothing about it', (m2?.notes || []).length > 0 && /Nothing about this progress is saved/.test(String(m2?.text)) && !/Nothing is saved\b/.test(String(m2?.text)), { text: m2?.text, notes: m2?.notes });
await req('/api/actions', { userId: 'lauri', messageId: m2?.id, action: 'progress_save', cardType: 'goal_progress', card: (m2?.cards || []).find((c: any) => c.type === 'goal_progress') });
amount += 50;
const m3 = agentOf(await chat(`I've saved ${amount} € for the Japan trip, and I want a new goal for a bike`));
console.log('PROBE m3', JSON.stringify({ text: m3?.text, cards: (m3?.cards || []).map((c: any) => c.type) }));
check('mixed C: refusal of the other goal is kept beside the progress sentence', /change saved amount to/.test(String(m3?.text)) && /(not saved|have not|What total amount)/i.test(String(m3?.text)), m3?.text);
await req('/api/actions', { userId: 'lauri', messageId: m3?.id, action: 'progress_save', cardType: 'goal_progress', card: (m3?.cards || []).find((c: any) => c.type === 'goal_progress') });
// Finnish: whatever the app can do with the progress card in Finnish, report it.
const fi = agentOf(await chat('Olen säästänyt 2000 € Japan trip tavoitteeseen'));
console.log('PROBE fi', JSON.stringify({ text: fi?.text, cards: (fi?.cards || []).map((c: any) => c.type) }));
check('finnish: no progress card is produced for Finnish text (baseline detector is English-only), so the AI text is unchanged', !(fi?.cards || []).some((c: any) => c.type === 'goal_progress'), fi?.cards);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
