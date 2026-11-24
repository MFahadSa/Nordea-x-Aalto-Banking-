/** "Because you are a student, …": Nora's recommendations give a true reason from About you. Scripted model, real routes. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'about-reasons-'));
process.env.PORT = '0';
process.env.NODE_ENV = 'production';
for (const k of ['SUPABASE_URL', 'GEMINI_API_KEY', 'LLM_API_KEY', 'GROQ_API_KEY', 'USER_DB_URL', 'AGENT_DB_URL', 'SHARED_DB_URL']) delete process.env[k];

let failed = 0;
const check = (name: string, ok: unknown, detail?: unknown) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : ` ${JSON.stringify(detail).slice(0, 400)}`}`); };

const { inferValues } = await import('../src/aboutParts.js');
const { recommendationRequest, unsupportedReason, withReason, reasonsFor } = await import('../src/server/aboutReasons.js');

// ---------- typed answers ----------
for (const [key, text, want] of [
  ['work', 'Studies at Aalto', 'Studying'], ['work', "I'm a student", 'Studying'], ['work', 'Studies, with a part-time job: about 900 € a month', 'Both'],
  ['work', 'UX designer, steady salary of 3 900 € a month', 'Working'], ['work', 'Retired teacher, pension of 1 850 € a month', 'Retired'], ['work', 'Unemployed', 'Between jobs'],
  ['work', 'No longer a student', ''], ['work', 'Graduated, was a student', ''], ['work', 'Wants to study', ''], ['work', 'Works, paying off a student loan', 'Working'],
  ['home', 'Rents, about 1 150 € a month', 'Rents'], ['home', 'Owns their home', 'Owns'], ['home', 'Lives with parents', 'With parents'], ['home', 'Rents out a flat', ''], ['home', "Doesn't own a home", ''],
] as const) check(`"${text}" means ${want || 'nothing certain'}`, (inferValues(key, text)[0] || '') === want, inferValues(key, text));

// ---------- when a reason belongs ----------
for (const q of ['What do you recommend for my savings?', 'Which account should I open?', 'How can I save more?', 'Tell me about the Gold package for my situation', 'What is the best way to start investing?', 'Should I get home insurance?'])
  check(`asks for a recommendation: ${q}`, recommendationRequest(q));
for (const q of ['What is my balance?', 'How much did I spend last month?', 'Hello Nora', 'Transfer 50 euros to my savings', 'What did you recommend about savings?', 'I got a scam call, should I pay the money?', 'Should I wear a coat?', 'What do you know about my savings?'])
  check(`does not: ${q}`, !recommendationRequest(q));

// ---------- wording ----------
const student = { key: 'work' as const, phrase: 'you are a student', from: 'you' as const };
for (const [a, b] of [
  ['A small buffer is a good start.', 'Because you are a student, a small buffer is a good start.'],
  ['Hi Alex! Start with a buffer.', 'Hi Alex! Because you are a student, start with a buffer.'],
  ['Yes, a buffer makes sense.', 'Yes. Because you are a student, a buffer makes sense.'],
  ['If you can, start with a buffer.', 'Because you are a student, if you can, start with a buffer.'],
  ['ASP could suit you.', 'Because you are a student, ASP could suit you.'],
  ['I would start with a buffer.', 'Because you are a student, I would start with a buffer.'],
  ['Because you rent your home, look at cover.', 'Because you rent your home, look at cover.'],
  ['I will answer your actual question.', 'I will answer your actual question.'],
  ['Your savings are in one account.', 'Your savings are in one account.'],
  ['What are you saving for?', 'What are you saving for?'],
  ['I can’t recommend a fund.', 'I can’t recommend a fund.'],
  ['Säästä vähän joka kuukausi.', 'Säästä vähän joka kuukausi.'],
]) check(`wording: ${a}`, withReason(a, student) === b, withReason(a, student));
check('no reason known: the words stay as they are', withReason('Start with a buffer.', undefined) === 'Start with a buffer.');
check('a false status is caught', unsupportedReason('Because you are a student, save a little.', [], 'What should I do?') === 'a student');
check('a true status passes', unsupportedReason('Because you are a student, save a little.', [student], '') === null);
check('what the customer just said passes', unsupportedReason('Because you are a student, save a little.', [], 'I am a student, what should I save?') === null);
check('a weak reason is not used for a general money question', reasonsFor('How much should I budget for the van?', [{ key: 'home', phrase: 'you rent your home', from: 'nordea' }]).length === 0);
check('the reason fits the question', reasonsFor('Which home loan should I take?', [student, { key: 'plans', phrase: 'you plan to buy a home', from: 'you' }])[0].phrase === 'you plan to buy a home');

// ---------- the real app ----------
const http = await import('node:http');
let server: Server | undefined;
const listen = http.Server.prototype.listen;
(http.Server.prototype as any).listen = function (...a: unknown[]) { server ??= this as Server; return (listen as any).apply(this, a); };
const { setProvider } = await import('../src/server/llm.js');
const fin = (text: string) => ({ calls: [{ id: 'f', name: 'finishReply', args: { text, suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true } }] });
let script: any[] = [];
let system = '';
let calls = 0;
setProvider({ name: 'scripted', isConfigured: () => true, step: async (a: any) => { if (a.tools.some((t: any) => t.name === 'finishReply')) { system = a.system; calls++; } return script.length > 1 ? script.shift() : script[0] ?? fin('Okay.'); } } as any);
await import('../server.js');
for (let i = 0; i < 50 && !server?.address(); i++) await new Promise((r) => setTimeout(r, 100));
const base = `http://127.0.0.1:${(server!.address() as { port: number }).port}`;
const j = async (u: string, body?: unknown, method = 'POST') => (await fetch(base + u, body ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})).json() as Promise<any>;
const ask = async (userId: string, text: string, ...replies: string[]) => { script = replies.map(fin); calls = 0; const r = await j('/api/chat', { userId, helperId: 'abel', text }); return r.messages.find((m: any) => m.sender === 'agent').text as string; };
const plain = 'A small safety buffer is a good first step.';
const q = 'What do you recommend for my savings?';

let t = await ask('alex', q, plain);
check('the box says Alex studies and works: the reply starts with it', t.startsWith('Because you are a student who also works, a small safety buffer'), t);
check('Nora was asked once to add the reason herself', calls === 2, calls);
t = await ask('alex', q, plain, 'Because you are a student who also works, start small with a buffer.');
check('Nora’s own wording is kept', t === 'Because you are a student who also works, start small with a buffer.', t);
t = await ask('alex', q, 'Because you are retired, keep it simple.', 'Because you are a student who also works, start small with a buffer.');
check('a false reason is sent back and corrected', t === 'Because you are a student who also works, start small with a buffer.', t);
t = await ask('eeva', q, plain);
check('another customer gets their own reason', t.startsWith('Because you are retired, '), t);
t = await ask('alex', 'Hello Nora', 'Hi Alex! How are you?');
check('small talk gets no reason', t === 'Hi Alex! How are you?', t);

let s = await j('/api/about', { userId: 'lauri', answers: { work: { values: [], text: 'Studies at Aalto', asIs: true }, risk: { values: ['Keep it safe'] } } });
check('a typed answer counts as Studying', s.fields.work.values[0] === 'Studying', s.fields.work);
t = await ask('lauri', q, plain);
check('the typed answer gives the reason', t.startsWith('Because you are a student, '), t);
check('Nora is told the risk answer and not to go against it', system.includes('you like to keep your savings safe') && system.includes('no shares or funds for someone who keeps savings safe'));
let offers = (await j('/api/offers?userId=lauri')).offers as any[];
check('the offer card says it too', offers.some((o) => o.reason === 'Because you are a student'), offers.map((o) => o.reason));
await j('/api/about', { userId: 'alex', answers: { interests: { values: ['Investing basics'] }, risk: { values: ['Keep it safe'] } } });
offers = (await j('/api/offers?userId=alex')).offers;
check('shares and funds are not offered to someone who keeps savings safe', !offers.some((o) => o.id === 'equity-savings' || o.id === 'funds'), offers.map((o) => o.id));

// ---------- "Ask Nora" on an offer ----------
const { offerQuestion } = await import('../src/aboutParts.js');
const tap = async (userId: string, title: string, ...replies: any[]) => {
  script = replies.map((x) => (typeof x === 'string' ? fin(x) : x)); calls = 0;
  return (await j('/api/chat', { userId, helperId: 'abel', text: offerQuestion(title) })).messages.find((m: any) => m.sender === 'agent');
};
const prepared = (m: any) => m.answeredBy === 'bank_code' && /could be worth a look/.test(m.text);
await j('/api/about', { userId: 'lauri', answers: { plans: { values: ['A home', 'Travel'] } }, confirm: ['home'] });
const HOME = 'Home insurance from If';
const offerOf = async (userId: string, title: string) => ((await j(`/api/offers?userId=${userId}`)).offers as any[]).find((o) => o.title === title);
const reason = (await offerOf('lauri', HOME)).reason as string;
const good = `${reason}, cover for your things could suit the move. Check what your landlord already covers before you decide.`;
let m = await tap('lauri', HOME, good);
check('the AI writes the answer', m.text.startsWith(good) && calls === 1 && m.answeredBy !== 'bank_code' && !m.errorInfo, m);
check('"Nora could see" counts only About you', m.supplied.notes === ((await j('/api/state?userId=lauri')).entries as any[]).filter((e) => e.aboutPart && !e.aboutPart.startsWith('fact:')).length, m.supplied);
check('the exact terms and what Nordea earns are under it', m.text.includes('25% discount') && m.text.includes('What Nordea earns: '), m.text);
check('the AI is given About you and the reason', system.includes('Plans: ') && system.includes(reason) && system.includes('THE OFFER'), system.slice(0, 900));
check('home insurance shows the partner card', m.cards.some((c: any) => c.type === 'offer' && c.data.partnerId === 'insure' && c.data.cta === 'See cover'), m.cards);
check('and says the card is not If', /not If/.test(m.text), m.text);
m = await tap('lauri', HOME, `${reason}, you could save 25% on cover for your things.`, good);
check('a figure in the AI words is sent back', m.text.startsWith(good) && calls === 2, m.text);
for (const [name, bad] of [
  ['figures', `${reason}, you could save 40% on cover for your things.`], ['"you qualify"', `${reason}, you qualify for this cover, so take it.`],
  ['a false status', 'Because you are retired, cover for your things could suit you.'], ['a done action', `${reason}, I have booked the cover for you.`], ['an empty reply', ''],
] as const) { m = await tap('lauri', HOME, bad); check(`${name} twice: the prepared text is shown, with its label`, prepared(m) && m.text.startsWith(`${reason}, `) && calls === 2, m.text); }
m = await tap('lauri', HOME, 'Cover for your things could suit the move. Check the terms before you decide.');
check('a missing reason is put in front', m.text.startsWith(`${reason}, cover for your things`) && calls === 1, m.text);
const ok = { name: 'scripted', isConfigured: () => true, step: async (a: any) => { if (a.tools.some((t: any) => t.name === 'finishReply')) { system = a.system; calls++; } return script.length > 1 ? script.shift() : script[0] ?? fin('Okay.'); } } as any;
setProvider({ name: 'down', isConfigured: () => true, step: async () => { throw new Error('503'); } } as any);
m = await tap('lauri', HOME, good); check('AI down: the prepared text and the card are shown', prepared(m) && m.cards.length === 1, m.text);
setProvider({ name: 'none', isConfigured: () => false, step: async () => { throw new Error('not called'); } } as any);
for (const o of (await j('/api/offers?userId=lauri')).offers as any[]) {
  m = await tap('lauri', o.title);
  check(`no AI key: ${o.id} gets the prepared text with its reason`, prepared(m) && m.text.startsWith(`${o.reason}, `) && m.text.includes('What Nordea earns: ') && !/\b(?:Never work out|use only this)\b/.test(m.text), m.text);
}
setProvider(ok);
const ASP = 'ASP account for your first home';
m = await tap('lauri', ASP, `${(await offerOf('lauri', ASP)).reason}, this kind of saving could fit your plan. Check the conditions first.`);
check('ASP shows its question or suggestion', m.cards.some((c: any) => (c.type === 'ask_fact' || c.type === 'opportunity') && c.data.ruleId === 'asp-account'), m.cards);
check('ASP conditions stay visible', m.cards.some((c: any) => c.type === 'opportunity') || /bonus interest is not paid on every deposit/.test(m.text), m.text);
m = await tap('lauri', 'Home loan with FlexiPayment', 'Here is what I know about loans in general.');
check('an offer the customer is not shown is not answered by this path', !system.includes('THE OFFER') && !prepared(m), m.text);
const { offerReplyProblem } = await import('../src/server/offerReply.js');
const aged: any = { reason: 'Because you’re 26', reasons: [], offer: {} };
check('the age inside the given reason is allowed', offerReplyProblem('Because you\'re 26, daily banking could cost you less. Check your details first.', aged, () => null) === null);
check('another figure is not', offerReplyProblem('Because you\'re 26, you could save 10 a month. Check your details first.', aged, () => null) !== null);
t = await ask('lauri', 'Tell me about home insurance', 'Home insurance covers your things.');
check('typed words still follow the topic checks: no card', t === 'Home insurance covers your things.', t);
await j('/api/settings', { userId: 'lauri', offersOff: true });
check('partner offers off: the If offer is not shown', !(await j('/api/offers?userId=lauri')).offers.some((o: any) => o.id === 'if-home'));
m = await tap('lauri', HOME, 'I can explain home insurance in general.');
check('partner offers off: no partner card', !m.cards.some((c: any) => c.type === 'offer'), m.cards);
await j('/api/settings', { userId: 'lauri', offersOff: false });

// The customer's own answer replaces the bank's line, and an unshared answer is not used at all.
s = await j('/api/state?userId=lauri');
const work = s.entries.find((e: any) => e.aboutPart === 'work');
await j(`/api/cabinet/${work.id}`, { readableBy: { abel: false, offers: false } }, 'PATCH');
t = await ask('lauri', q, plain);
check('an answer that is not shared gives no reason, nor does the bank’s line instead', !/student|working/.test(t) && !system.includes('you are a student') && !system.includes('you are working'), t);

const plans = s.entries.find((e: any) => e.aboutPart === 'plans');
await j(`/api/cabinet/${plans.id}`, { readableBy: { abel: false, offers: false } }, 'PATCH');
m = await tap('lauri', 'Gold package', 'Because you plan to travel, this package could suit you well.');
check('a plan that is not shared is not given to the AI', system.includes('THE OFFER') && !/Plans: |plan to travel/.test(system), system.slice(0, 900));
check('and not said in the chat', prepared(m) && !/because/i.test(m.text), m.text);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
