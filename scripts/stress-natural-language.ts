/** Natural-language stress run (scripted model, real /api/chat). Customers write with typos, slang, half context,
 *  corrections and mixed languages. The scripted model plays a plausible, competent model; what is measured is
 *  what the app's code then allows, refuses or shows. Prints one line per case and a summary; exit 1 if any
 *  case marked `must` fails. Fictional demo customer (Lauri). No credentials, no network beyond 127.0.0.1. */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stress-nl-')); process.env.PORT = '3851'; process.env.NODE_ENV = 'production';
for (const k of ['SUPABASE_URL', 'GEMINI_API_KEY', 'LLM_API_KEY', 'GROQ_API_KEY', 'USER_DB_URL', 'AGENT_DB_URL', 'SHARED_DB_URL']) delete process.env[k];
const { setProvider } = await import('../src/server/llm.js');
const { intentsOf } = await import('../src/server/advice/intent.js');
const { refusesStorage, declinesPartner } = await import('../src/server/advice/purpose.js');
const fin = (text: string, extra: any = {}) => ({ calls: [{ name: 'finishReply', args: { text, suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true, ...extra } }] });
const tool = (name: string, args: any) => ({ calls: [{ name, args }] });
let script: any[] = []; let lastSystem = '';
setProvider({ name: 'stress-scripted', isConfigured: () => true, step: async (a: any) => { lastSystem = a.system; const x = script.shift(); return typeof x === 'function' ? x(a) : x ?? fin('Okay.'); } } as any);
await import('../server.ts'); await new Promise((r) => setTimeout(r, 500));
const J = async (u: string, b: any) => { const r = await fetch('http://127.0.0.1:3851' + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return r.json() as any; };
const conv = async () => (await J('/api/conversations', { userId: 'lauri', helperId: 'abel' })).conversation.id;
const say = async (c: string, text: string, s: any[]) => { script = s; const r = await J('/api/chat', { userId: 'lauri', conversationId: c, text }); return r.messages.at(-1); };
const rows: string[] = []; let fails = 0; let total = 0;
const check = (group: string, input: string, ok: boolean, got: string, must = true) => { total++; if (!ok && must) fails++; rows.push(`${ok ? 'ok  ' : must ? 'FAIL' : 'gap '} ${group.padEnd(16)} ${JSON.stringify(input).slice(0, 70).padEnd(72)} ${got.slice(0, 110)}`); };

// 1. Partner need in the customer's own messy words: the model nominates, code checks the quote.
for (const [partner, text] of [
  ['energy', 'the elecricity one basically doubled since we moved in'], ['energy', 'our power bill is insane this winter'], ['energy', 'we have an electric sauna and the contract is whatever the old owner had'],
  ['movers', "we're moving out end of month and im kinda panicking about the move"], ['movers', 'need ppl to help carry our stuff to the new place next week'],
  ['insure', 'do we even need insurance for the new flat?? no clue'], ['homes', 'can u show me some flats around espoo'], ['planner', 'i think i need someone to make a proper money plan with me'],
] as const) {
  const c = await conv(); const m = await say(c, text, [tool('offerPartnerForNeed', { partnerId: partner, customerWords: text.slice(0, 40) }), fin('Here is one option that could help.')]);
  const shown = (m.cards || []).some((x: any) => x.type === 'offer' && x.data.partnerId === partner);
  check('partner by need', text, shown, shown ? `card ${partner}` : `no card: ${m.text}`);
  check('keyword path', text, intentsOf(text).some((i: any) => i.partner === partner), `keyword intents: ${intentsOf(text).map((i: any) => i.partner || i.rule).join(',') || 'none'}`, false);
}
// …refused when the quote was not said, when offers were declined, or twice in one chat.
{ const c = await conv(); const m = await say(c, 'ugh it basically doubled since we moved', [tool('offerPartnerForNeed', { partnerId: 'energy', customerWords: 'I want to switch electricity provider' }), fin('Okay.')]);
  check('partner guard', 'invented quote', !(m.cards || []).some((x: any) => x.type === 'offer'), (m.cards || []).map((x: any) => x.type).join() || 'no card'); }
{ const c = await conv(); await say(c, 'no offers please, just talk', [fin('Sure.')]); const m = await say(c, 'my electricity bill doubled though', [tool('offerPartnerForNeed', { partnerId: 'energy', customerWords: 'my electricity bill doubled' }), fin('Okay.')]);
  check('partner guard', 'after "no offers please"', !(m.cards || []).some((x: any) => x.type === 'offer'), (m.cards || []).map((x: any) => x.type).join() || 'no card'); }
{ const c = await conv(); await say(c, 'my electricity bill doubled', [tool('offerPartnerForNeed', { partnerId: 'energy', customerWords: 'my electricity bill doubled' }), fin('This might help.')]); const m = await say(c, 'yeah its the electricity bill', [tool('offerPartnerForNeed', { partnerId: 'energy', customerWords: 'its the electricity bill' }), fin('Okay.')]);
  check('partner guard', 'same partner twice in a chat', !(m.cards || []).some((x: any) => x.type === 'offer'), (m.cards || []).map((x: any) => x.type).join() || 'no card'); }

// 2. Transfers written the way people write them.
for (const [text, amt, want] of [
  ['can u put like 50 in savings', 50, true], ['50e to savings pls', 50, true], ['move €50 to savings', 50, true], ['chuck 50 euros into my savings', 50, true],
  ['move 50,00 to savings', 50, true], ['put fifty in savings', 50, false], ['1k to savings', 1000, false],
] as const) {
  const c = await conv(); const m = await say(c, text, [tool('offerTransfer', { amountPerMonth: amt, once: true }), fin('Here is the transfer for you to check.')]);
  const card = (m.cards || []).find((x: any) => x.type === 'confirm_plan');
  check('transfer words', text, want ? card?.data.amount === amt : !card, card ? `card ${card.data.amount} € ${card.data.once ? 'once' : 'monthly'}` : `no card: ${m.text}`, want);
}
// …a correction, then a short go-ahead.
{ const c = await conv(); await say(c, 'can u put like 50 in savings', [tool('offerTransfer', { amountPerMonth: 50, once: true }), fin('Here is the transfer for you to check.')]);
  const m1 = await say(c, 'actually make it 60', [fin('Should I prepare a one-time transfer of the 60 € you just mentioned instead?')]);
  check('correction', 'actually make it 60', /60 €/.test(m1.text), m1.text);
  const m2 = await say(c, 'ok go', [tool('offerTransfer', { amountPerMonth: 60, once: true }), fin('Here is the new transfer of 60 € to check.')]);
  check('correction', 'ok go (after 60 was offered)', (m2.cards || []).some((x: any) => x.type === 'confirm_plan' && x.data.amount === 60), (m2.cards || []).map((x: any) => x.type + ':' + x.data?.amount).join() || m2.text);
  const m3 = await say(c, 'ok do it', [fin('How much would you like to move?', { clarification: { kind: 'customer_detail', question: 'How much would you like to move?' } }), fin('Use the button on the card above to move it.')]);
  check('waiting card', 'ok do it (cards waiting)', !/How much would you like/.test(m3.text) && /WAITING FOR THE CUSTOMER'S TAP/.test(lastSystem), m3.text); }

// 3. Saying no to storage in many ways.
for (const text of ["dont write that down", "pls don't save this", "keep this between us", "don't remember that ok", "forget i said that", "this is off the record", "älä tallenna tätä"]) check('no-save words', text, refusesStorage(text), refusesStorage(text) ? 'refusal recognised' : 'not recognised', false);
// 4. Turning an offer down in many ways.
for (const text of ['nah not interested in electricity deals', 'no thanks to the energy thing', 'i dont want a new power company']) check('decline words', text, declinesPartner(text, 'energy'), declinesPartner(text, 'energy') ? 'decline recognised' : 'not recognised', false);

// …and a chat-level "no offers" in everyday words stops the code-decided card too.
for (const no of ['no offers please, just talk', 'stop with the energy offers', 'not interested in any deals tbh']) { const c = await conv(); await say(c, no, [fin('Sure.')]); const m = await say(c, 'my electricity bill doubled though', [fin('That is a big jump. What changed?')]); check('offers declined', no, !(m.cards || []).some((x: any) => x.type === 'offer'), (m.cards || []).map((x: any) => x.type).join() || 'no card'); }
// …and no "here is the transfer" without a card.
{ const c = await conv(); const m = await say(c, 'hmm maybe savings stuff idk', [fin('Here is the transfer for you to check.'), fin('Would you like to move some money to savings? Tell me the amount.')]); check('no-card claim', 'transfer claimed, none made', !/Here is the transfer/.test(m.text), m.text); }

// 5. Vague openers must reach the model's answer, not a code question about "which plan".
for (const text of ['ugh i dont get it, money just kinda disappears every month lol', 'idk where it all goes every month tbh', 'is it normal that it costs this much every month?']) {
  const c = await conv(); const m = await say(c, text, [fin('[unverifiable 1]'), fin('[unverifiable 2]')].map(() => fin('You spend 99999 € a month.')));
  check('vague opener', text, !/which plan/i.test(m.text), m.text);
}

// 6. Budget rows read like sentences.
{ const c = await conv(); const m = await say(c, 'how is my budget looking?', [({ system }: any) => { const h = JSON.parse(/FINANCIAL FACT HANDLES \(current, role-bound, source-bound\): (\[[^\n]*\])/.exec(system)![1]); const pick = (field: string, ent?: string) => ({ fact: h.find((f: any) => f.field === field && (!ent || f.entity === ent)).id }); return fin('Here is the short version.', { financialAnswer: [pick('current_income'), pick('average_spending', 'All tracked spending'), pick('saving_rate', 'Payday plan'), pick('left_over_after_spending_and_saving')] }); }]);
  check('budget rows', 'how is my budget looking?', !/For "/.test(m.text) && /current income is 3900 €/.test(m.text), m.text.replace(/\n/g, ' / ')); }

console.log(rows.join('\n'));
console.log(`RESULT natural-language stress: ${total - fails}/${total} (FAIL = must hold; gap = keyword coverage noted, not required)`);
process.exit(fails ? 1 : 0);
