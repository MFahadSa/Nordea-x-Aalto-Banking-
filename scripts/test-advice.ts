/**
 * v26: the recommender in the chat. Layer 3 (thousands of generated customers against the rules
 * that must never break), layer 5 (a misbehaving AI), and the question loop that completes the
 * context, pressed through the real HTTP routes, including double clicks and bad answers.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'advice-'));
process.env.CABINET_DATA_DIR = DIR;
delete process.env.SUPABASE_URL;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 600)}`); }
}

const F = await import('../src/server/advice/facts.js');
const G = await import('../src/server/advice/guard.js');
const C = await import('../src/server/advice/cards.js');
const R = await import('../src/server/advice/rules.js');
const A = await import('../src/server/advice/actions.js');
const rules = R.loadRules().rules;
const byId = (id: string) => rules.filter((r) => r.id === id);

// ---------------- Guard: every edge, pure ----------------
const T = '2026-11-20';
const adult = { age: 31, offersOff: false, calm: false };
const aspFacts = F.factsFrom({ age: 31, hasAspAccount: false, everOwnedHalfOfHome: false, savingForHome: true });
const sel = (facts = aspFacts, st: any = undefined, who: any = adult, day = T) => G.selectCandidates(rules, facts, st, who, day);
check('eligible ASP is offered', sel().list.some((c) => c.rule.id === 'asp-account' && c.status === 'eligible'));
check('"never" blocks it for good (checked in 2030)', !sel(aspFacts, G.remember(undefined, 'asp-account', 'never', T), adult, '2030-01-01').list.some((c) => c.rule.id === 'asp-account'));
const nn = G.remember(undefined, 'asp-account', 'notNow', T);
check('"not now" waits 90 days, then it may come back', !sel(aspFacts, nn, adult, G.addDays(T, 89)).list.some((c) => c.rule.id === 'asp-account') && sel(aspFacts, nn, adult, G.addDays(T, 90)).list.some((c) => c.rule.id === 'asp-account'));
const shown = G.remember(undefined, 'asp-account', 'shown', T);
check('a shown suggestion is not repeated for 30 days', !sel(aspFacts, shown, adult, G.addDays(T, 29)).list.some((c) => c.rule.id === 'asp-account') && sel(aspFacts, shown, adult, G.addDays(T, 30)).list.some((c) => c.rule.id === 'asp-account'));
check('"good to know" is quiet for 180 days', !sel(aspFacts, G.remember(undefined, 'asp-account', 'seen', T), adult, G.addDays(T, 179)).list.some((c) => c.rule.id === 'asp-account'));
check('accepted is never offered again', !sel(aspFacts, G.remember(undefined, 'asp-account', 'accepted', T), adult, '2029-01-01').list.some((c) => c.rule.id === 'asp-account'));
const askFacts = F.factsFrom({ age: 31, hasAspAccount: false, savingForHome: true });
const ns = G.rememberNotSure(undefined, 'everOwnedHalfOfHome', T);
check('"not sure" is not asked again for 30 days, then may be', !sel(askFacts, ns, adult, G.addDays(T, 29)).list.some((c) => c.ask?.fact === 'everOwnedHalfOfHome') && sel(askFacts, ns, adult, G.addDays(T, 30)).list.some((c) => c.ask?.fact === 'everOwnedHalfOfHome'));
const eq = F.factsFrom({ age: 17, hasEquitySavingsAccount: false, interestedInInvesting: true });
check('a minor never sees a regulated topic', !sel(eq, undefined, { age: 17, offersOff: false, calm: false }).list.some((c) => c.rule.regulated));
check('unknown age: no regulated topic either', !sel(F.factsFrom({ age: 25, hasEquitySavingsAccount: false, interestedInInvesting: true }), undefined, { age: null, offersOff: false, calm: false }).list.some((c) => c.rule.regulated));
const off = sel(F.factsFrom({ age: 31, hasAspAccount: false, everOwnedHalfOfHome: false, savingForHome: true, helpsFamilyWithMoney: true }), undefined, { age: 31, offersOff: true, calm: false });
check('offers switched off: no product, but tax information still allowed', !off.list.some((c) => c.rule.kind === 'product') && off.list.some((c) => c.rule.id === 'gift-limit'), off.list.map((c) => c.rule.id));
const calmWho = { age: 72, offersOff: false, calm: true };
const gift = F.factsFrom({ helpsFamilyWithMoney: true });
const calmShown = G.remember(undefined, 'household-credit', 'shown', T);
check('calm view: nothing else within 7 days of a shown suggestion, back on day 7', sel(gift, calmShown, calmWho, G.addDays(T, 6)).list.length === 0 && sel(gift, calmShown, calmWho, G.addDays(T, 7)).list.length > 0);
check('every allowed item reaches Nora (here all six rules), up to the limit of eight', sel(F.factsFrom({ age: 25, hasAspAccount: false, hasPsAccount: true, hasEquitySavingsAccount: false }), undefined, adult, '2026-11-20').list.length === 6, sel(F.factsFrom({ age: 25, hasAspAccount: false, hasPsAccount: true, hasEquitySavingsAccount: false }), undefined, adult, '2026-11-20').list.map((c) => c.rule.id));
check('suggestions come before questions', (() => { const l = sel(F.factsFrom({ age: 31, hasAspAccount: false, everOwnedHalfOfHome: false, savingForHome: true })).list; const i = l.findIndex((c) => c.status === 'ask'); return i === -1 || l.slice(i).every((c) => c.status === 'ask'); })());

// ---------------- Layer 3: generated customers against the invariants ----------------
let seed = 20261120;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <X,>(xs: X[]) => xs[Math.floor(rnd() * xs.length)];
const N = Number(process.env.ADVICE_MATRIX_N || 3000);
let violations: string[] = [];
const states = ['shown', 'asked', 'seen', 'notNow', 'never', 'accepted'] as const;
for (let i = 0; i < N; i++) {
  const day = G.addDays('2025-12-01', Math.floor(rnd() * 1300));
  const ageVal = rnd() < 0.05 ? null : Math.floor(rnd() * 90) + 5;
  const facts = F.factsFrom({});
  for (const k of F.FACT_KEYS) {
    const roll = rnd();
    if (roll < 0.35) continue; // unknown
    const spec = F.FACTS[k];
    const v = spec.type === 'boolean' ? rnd() < 0.5 : spec.type === 'number' ? (k === 'age' ? ageVal : Math.floor(rnd() * 9000)) : spec.type === 'date' ? G.addDays('2010-01-01', Math.floor(rnd() * 6000)) : pick(['salary', 'pension', 'student_aid', 'none']);
    if (v === null) continue;
    facts[k] = roll < 0.42 ? { key: k, state: pick(['stale', 'conflict', 'hidden']), value: null, from: 'gen' } : { key: k, state: 'known', value: v as any, from: 'gen' };
  }
  const st: any = { rules: {}, skippedFacts: {} };
  for (const r of rules) if (rnd() < 0.15) st.rules[r.id] = { last: pick([...states]), at: G.addDays(day, -Math.floor(rnd() * 200)), until: rnd() < 0.5 ? G.addDays(day, Math.floor(rnd() * 200) - 100) : undefined };
  for (const k of F.FACT_KEYS) if (rnd() < 0.05) st.skippedFacts[k] = { at: day, until: G.addDays(day, Math.floor(rnd() * 60) - 30) };
  if (rnd() < 0.2) st.shownOn = [G.addDays(day, -Math.floor(rnd() * 10))];
  const who = { age: facts.age.state === 'known' ? (facts.age.value as number) : null, offersOff: rnd() < 0.2, calm: rnd() < 0.25 };
  const { list } = G.selectCandidates(rules, facts, st, who, day);
  const bad = (m: string) => violations.push(`#${i} ${day} ${m}`);
  if (list.length > G.LIMITS.maxCandidates) bad('more candidates than the limit');
  if (who.calm && (st.shownOn || []).some((d: string) => d <= day && d > G.addDays(day, -7)) && list.length) bad('calm limit broken');
  for (const c of list) {
    const mem = st.rules[c.rule.id];
    if (c.status !== 'eligible' && c.status !== 'ask') bad(`status ${c.status} shown`);
    if (!(c.rule.validFrom <= day && (c.rule.validTo === null || day < c.rule.validTo))) bad(`${c.rule.id} shown outside its dates`);
    if (mem?.last === 'never' || mem?.last === 'accepted') bad(`${c.rule.id} shown after ${mem.last}`);
    if (mem?.until && mem.until > day) bad(`${c.rule.id} shown during its waiting time`);
    if (c.rule.regulated && (who.age === null || who.age < 18)) bad(`${c.rule.id} regulated shown to age ${who.age}`);
    if (who.offersOff && c.rule.kind === 'product') bad(`${c.rule.id} product shown with offers off`);
    if (c.status === 'ask') {
      const f = c.ask!.fact;
      if (F.FACTS[f].origin !== 'customer') bad(`asked Nordea's own fact ${f}`);
      if (facts[f].state === 'hidden') bad(`asked a private fact ${f}`);
      if (facts[f].state === 'known') bad(`asked a known fact ${f}`);
      const sk = st.skippedFacts[f];
      if (sk && sk.until > day) bad(`asked ${f} during "not sure"`);
    }
    // Re-check independently: the rule really is satisfied by the known facts.
    if (c.status === 'eligible') {
      const card = C.opportunityCard(c, facts, who.calm);
      const msg = String(card.data!.message);
      const stripped = Object.values(c.values || {}).sort((p, q) => q.length - p.length).reduce((s, v) => s.split(v).join(''), msg);
      if (/\{\w+\}/.test(msg) || /\d/.test(stripped)) bad(`${c.rule.id} message has a number not from code`);
      if (!card.data!.source?.url?.startsWith('https://') || !card.data!.earns) bad(`${c.rule.id} card without source or earns`);
      for (const r of card.data!.reasons) if (!facts[F.FACT_KEYS.find((k) => r.text.startsWith(F.FACTS[k].label))!]) bad('reason not from a fact');
      if (c.used.some((k) => facts[k].state === 'hidden')) bad(`${c.rule.id} used a private fact`);
    }
  }
}
check(`layer 3: ${N} generated customers, zero invariant violations`, violations.length === 0, violations.slice(0, 5));

// ---------------- The question loop and buttons, through HTTP ----------------
const { setProvider } = await import('../src/server/llm.js');
const { mockProvider } = await import('../src/server/llmMock.js');
const { db } = await import('../src/server/db.js');
await db.init();
const { DEMO_TODAY } = await import('../src/server/finance.js');
const { registerV14Routes } = await import('../src/server/routes.js');
const app = express(); app.use(express.json()); registerV14Routes(app);
const server = app.listen(0);
const BASE = `http://127.0.0.1:${(server.address() as any).port}`;
const post = async (url: string, body: unknown) => { const r = await fetch(BASE + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) as any }; };

// Scripted AI: each step returns the next planned tool calls; a finishReply ends the turn.
let plan: any[][] = [];
let replyText = 'Here is something that may help you with that, have a look below.';
setProvider({ ...mockProvider, async step(args: any) {
  // Only Nora's turns follow the script; the app's background agents get the normal test AI.
  if (!args.tools.some((t: any) => t.name === 'showOpportunity')) return (mockProvider as any).step(args);
  const next = plan.shift();
  if (next) return { calls: next.map((c, i) => ({ id: `t${i}${Math.random()}`, name: c.name, args: c.args })) };
  return { calls: [{ id: 'fin', name: 'finishReply', args: { text: replyText, suggestions: [], usedEntryIds: [], topic: 'goals', couldHelp: true } }] };
} } as any);
const chat = async (userId: string, text: string, conversationId?: string) => post('/api/chat', { userId, text, ...(conversationId ? { conversationId } : {}) });
const cardsIn = (r: any) => (r.body.messages || []).flatMap((m: any) => (m.cards || []).map((c: any) => ({ ...c, messageId: m.id })));
const advCards = (r: any) => cardsIn(r).filter((c: any) => c.type === 'ask_fact' || c.type === 'opportunity');

// Lauri asks; the AI picks ASP: a question card (he never said whether he owned a home).
plan = [[{ name: 'getOpportunities', args: {} }], [{ name: 'showOpportunity', args: { ruleId: 'asp-account' } }]];
const t1 = await chat('lauri', 'We are saving for a flat with Mia');
const q1 = advCards(t1)[0];
check('AI picks ASP: code shows ONE question card', advCards(t1).length === 1 && q1?.type === 'ask_fact' && q1.data.fact === 'everOwnedHalfOfHome', advCards(t1));
const conv = t1.body.conversationId;
const logsBefore = db.getAccessLog('lauri').filter((l) => /Nora suggestions/.test(l.purpose)).length;
check('checking the rules was a logged read', logsBefore >= 1);

// Bad answers are refused and change nothing.
for (const v of ['maybe', true, '', '2026-01-01']) {
  const r = await post('/api/actions', { userId: 'lauri', messageId: q1.messageId, action: 'fact_answer', payload: { value: v } });
  check(`a bad answer (${JSON.stringify(v)}) is refused`, r.status === 400, r);
}
check('…and nothing was saved', !db.getCabinetEntries('lauri').some((e) => e.factKey === 'everOwnedHalfOfHome'));

// He answers "No" → saved → ASP re-checked → the suggestion card appears.
const a1 = await post('/api/actions', { userId: 'lauri', messageId: q1.messageId, action: 'fact_answer', payload: { value: 'no' } });
const s1 = advCards(a1)[0];
check('answer "No": saved, his answer shown, and the ASP suggestion follows', a1.status === 200 && db.getMessages('lauri').find((m) => m.id === q1.messageId)?.resolved === 'No' && !a1.body.messages.some((m: any) => m.sender === 'user') && s1?.type === 'opportunity' && s1.data.ruleId === 'asp-account', a1.body);
check('the answer is in What Nora knows, from him, for Nora only', db.getCabinetEntries('lauri').some((e) => e.factKey === 'everOwnedHalfOfHome' && e.factValue === false && e.source === 'customer' && e.readableBy.abel && !e.readableBy.offers));
check('the card explains itself: reasons with sources, official source, what Nordea earns', s1.data.reasons.length >= 3 && s1.data.reasons.every((r: any) => r.from) && /^https:\/\/www\.nordea\.fi/.test(s1.data.source.url) && /Nordea earns/.test(s1.data.earns), s1.data);
check('the 20th deposit month is computed from the demo date', /May 2028/.test(s1.data.message), s1.data.message);
const dbl = await post('/api/actions', { userId: 'lauri', messageId: q1.messageId, action: 'fact_answer', payload: { value: 'yes' } });
check('a double click on the answered question is refused (409) and changes nothing', dbl.status === 409 && db.getCabinetEntries('lauri').filter((e) => e.factKey === 'everOwnedHalfOfHome' && e.status !== 'archived').length === 1, dbl);

// The same card is not shown again while it is on screen.
plan = [[{ name: 'showOpportunity', args: { ruleId: 'asp-account' } }]];
const t2 = await chat('lauri', 'Tell me about saving for the flat', conv);
check('the same suggestion is not shown again while it waits above', advCards(t2).length === 0);

// Open the ASP account (demo) → Nordea now knows he has one → never offered again; a second tap is refused.
const acc = await post('/api/actions', { userId: 'lauri', messageId: s1.messageId, action: 'opp_accept' });
check('"Open an ASP account": done in code, a bank account appears', acc.status === 200 && /ASP account is open/.test(acc.body.messages[0]?.text) && db.getBankAccounts('lauri').some((b) => /asp/i.test(b.type || '')), acc.body);
check('…and ASP is never suggested again', !G.candidatesFor('lauri', DEMO_TODAY).list.some((c) => c.rule.id === 'asp-account'));
check('a second tap on the opened card is refused', (await post('/api/actions', { userId: 'lauri', messageId: s1.messageId, action: 'opp_accept' })).status === 409);

// "Not sure": saved as a pause, not an answer.
db.cloneUser('alex', 'sara'); db.updateUser('sara', { age: 19, name: 'Sara' } as any);
plan = [[{ name: 'showOpportunity', args: { ruleId: 'kela-loan-writeoff' } }]];
const k1 = await chat('sara', 'I just started at Aalto');
const kq2 = advCards(k1)[0];
// v28: "I just started at Aalto" already says she studies there: that is saved (with Undo), not asked again.
check('Sara: "I just started at Aalto" is not asked again; the date is asked at once', kq2?.type === 'ask_fact' && kq2.data.fact === 'firstStudyPlaceDate' && kq2.data.factType === 'date', advCards(k1));
check('…her words are saved as her answer, with Undo, and shown as a note', db.getCabinetEntries('sara').some((e) => e.factKey === 'isHigherEducationStudent' && e.factValue === true && e.status === 'active') && (k1.body.messages || []).some((m: any) => (m.notes || []).some((n: any) => /Studies at a university/i.test(n.text) && n.undoToken)));
check('a future study date is refused', (await post('/api/actions', { userId: 'sara', messageId: kq2.messageId, action: 'fact_answer', payload: { value: '2099-09-01' } })).status === 400);
check('a date before 1950 is refused', (await post('/api/actions', { userId: 'sara', messageId: kq2.messageId, action: 'fact_answer', payload: { value: '1900-01-01' } })).status === 400);
const k3 = await post('/api/actions', { userId: 'sara', messageId: kq2.messageId, action: 'fact_answer', payload: { value: '2026-08-15' } });
const kc = advCards(k3)[0];
check('the context is complete → the Kela suggestion appears', kc?.type === 'opportunity' && kc.data.ruleId === 'kela-loan-writeoff' && /40 %/.test(kc.data.message), advCards(k3));
check('her answer shows as a date in words', db.getMessages('sara').find((m) => m.id === kq2.messageId)?.resolved === '15 August 2026');

plan = [[{ name: 'showOpportunity', args: { ruleId: 'gift-limit' } }]];
const g1 = await chat('sara', 'I might need someone to help with cleaning');
const gq = advCards(g1)[0];
const g2 = await post('/api/actions', { userId: 'sara', messageId: gq.messageId, action: 'fact_answer', payload: { value: 'notSure' } });
check('"Not sure": nothing saved as an answer; a pause is recorded', gq?.data?.fact === 'paysForHouseholdWork' && g2.status === 200 && !db.getCabinetEntries('sara').some((e) => e.factKey === 'paysForHouseholdWork') && !!db.getUser('sara')?.advice?.skippedFacts?.paysForHouseholdWork, gq);
check('…and that question is not asked again for now', !G.candidatesFor('sara', DEMO_TODAY).list.some((c) => c.ask?.fact === 'paysForHouseholdWork'));

// Changing an answer: the old one is archived, never two at once (no conflict from our own card).
db.cloneUser('alex', 'juha'); db.updateUser('juha', { age: 45, name: 'Juha' } as any);
db.addCabinetEntry({ id: 'juha-goal', userId: 'juha', type: 'goal', goalType: 'home', title: 'Buy a home', detail: '', source: 'customer', status: 'active', private: false, readableBy: { abel: true, offers: true }, provenance: { channel: 'app' }, reviewed: true, createdAt: `${DEMO_TODAY}T08:00:00Z`, updatedAt: `${DEMO_TODAY}T08:00:00Z`, target: { amount: 20000, date: '2028-01-01' } } as any, { by: 'you' } as any);
plan = [[{ name: 'showOpportunity', args: { ruleId: 'asp-account' } }]];
const j1 = await chat('juha', 'We are saving to buy a home');
const jq = advCards(j1)[0];
const j2 = await post('/api/actions', { userId: 'juha', messageId: jq.messageId, action: 'fact_answer', payload: { value: 'yes' } });
check('Juha has owned a home: told kindly that ASP does not apply, no further question', j2.status === 200 && /doesn’t apply/.test(j2.body.messages.at(-1).text) && advCards(j2).length === 0, j2.body);

// Suggestion buttons: not now, never, good to know; out-of-date versions.
const onCard = (userId: string, ruleId: string, status: 'eligible' | 'ask') => {
  const facts = G.factsOf(userId, DEMO_TODAY);
  const c = { ...require_ev(ruleId, facts), rule: rules.find((r) => r.id === ruleId && r.validFrom <= DEMO_TODAY && (r.validTo === null || DEMO_TODAY < r.validTo))! };
  const card = status === 'eligible' ? C.opportunityCard(c as any, facts, false) : C.askCard(c as any, false);
  const m = { id: `msg-test-${Math.random().toString(36).slice(2)}`, userId, agentId: 'abel', channel: 'app', sender: 'agent', conversationId: conv, helperId: 'abel', text: 'x', createdAt: new Date().toISOString(), cards: [card] } as any;
  db.addMessage(m);
  return m.id;
};
const E = await import('../src/server/advice/evaluate.js');
function require_ev(ruleId: string, facts: any) { return E.evaluate(byId(ruleId), facts, DEMO_TODAY); }
db.cloneUser('eeva', 'pirkko'); db.updateUser('pirkko', { age: 58, name: 'Pirkko', viewMode: 'full' } as any);
db.upsertBankAccount('pirkko', 'ps', { type: 'PS account' });
const ps1 = onCard('pirkko', 'ps-account', 'eligible');
const n1 = await post('/api/actions', { userId: 'pirkko', messageId: ps1, action: 'opp_notnow' });
check('"Not now" closes it for three months', n1.status === 200 && db.getUser('pirkko')!.advice!.rules!['ps-account'].until === G.addDays(DEMO_TODAY, 90));
const ps2 = onCard('pirkko', 'ps-account', 'eligible');
await post('/api/actions', { userId: 'pirkko', messageId: ps2, action: 'opp_never' });
check('"Don’t suggest this again" is permanent', db.getUser('pirkko')!.advice!.rules!['ps-account'].last === 'never' && !G.candidatesFor('pirkko', DEMO_TODAY).list.some((c) => c.rule.id === 'ps-account'));
const ps3 = onCard('pirkko', 'ps-account', 'eligible');
check('"Open" on an information card is refused (nothing to open)', (await post('/api/actions', { userId: 'pirkko', messageId: ps3, action: 'opp_accept' })).status === 400);
const ps4 = onCard('pirkko', 'ps-account', 'eligible');
db.updateMessage(ps4, { cards: [{ ...(db.getMessages('pirkko').find((m) => m.id === ps4)!.cards![0]), data: { ...(db.getMessages('pirkko').find((m) => m.id === ps4)!.cards![0].data), version: '2020-01-01' } }] } as any);
const old = await post('/api/actions', { userId: 'pirkko', messageId: ps4, action: 'opp_ok' });
check('a card from an older rule version is closed as out of date, not acted on', old.status === 200 && /changed since/.test(old.body.messages[0]?.text), old.body);
const qwrong = onCard('pirkko', 'gift-limit', 'ask');
check('a suggestion button on a question card is refused', (await post('/api/actions', { userId: 'pirkko', messageId: qwrong, action: 'opp_never' })).status === 400);
check('an unknown action is refused', (await post('/api/actions', { userId: 'pirkko', messageId: qwrong, action: 'opp_explode' })).status === 400);

// ---------------- Layer 5: a misbehaving AI ----------------
db.cloneUser('alex', 'mia'); db.updateUser('mia', { age: 33, name: 'Mia' } as any);
const tries: [string, any[][], (r: any) => boolean][] = [
  ['a made-up rule id', [[{ name: 'showOpportunity', args: { ruleId: 'free-money' } }]], (r) => advCards(r).length === 0],
  ['a rule the customer does not qualify for (equity at 33)', [[{ name: 'showOpportunity', args: { ruleId: 'equity-account-under-30' } }]], (r) => advCards(r).length === 0],
  // v28: the AI cannot show cards at all any more (code decides from the words), so these show nothing.
  ['two cards in one step', [[{ name: 'showOpportunity', args: { ruleId: 'gift-limit' } }, { name: 'showOpportunity', args: { ruleId: 'household-credit' } }]], (r) => advCards(r).length === 0],
  ['a suggestion plus a partner offer', [[{ name: 'showOpportunity', args: { ruleId: 'household-credit' } }, { name: 'suggestPartnerOffer', args: { partnerId: 'homes' } }]], (r) => cardsIn(r).filter((c: any) => ['offer', 'opportunity', 'ask_fact'].includes(c.type)).length === 0],
];
for (const [name, p, ok] of tries) {
  db.updateUser('mia', { advice: {} } as any);
  plan = JSON.parse(JSON.stringify(p));
  const r = await chat('mia', 'We are thinking about our money');
  check(`bad AI: ${name} → guarded`, r.status === 201 && ok(r), cardsIn(r));
}
db.updateUser('mia', { advice: G.remember(undefined, 'gift-limit', 'never', DEMO_TODAY) } as any);
plan = [[{ name: 'showOpportunity', args: { ruleId: 'gift-limit' } }]];
check('bad AI: a rule the customer said "never" to → no card', advCards(await chat('mia', 'Helping family')).length === 0);
db.updateUser('mia', { advice: {}, offersOff: true } as any);
plan = [[{ name: 'showOpportunity', args: { ruleId: 'asp-account' } }]];
check('bad AI: a product with offers off → no card', advCards(await chat('mia', 'Saving for a home')).length === 0);
db.updateUser('eeva', { advice: G.remember(undefined, 'household-credit', 'shown', DEMO_TODAY) } as any);
plan = [[{ name: 'showOpportunity', args: { ruleId: 'gift-limit' } }]];
check('bad AI: calm view within the week → no card', advCards(await chat('eeva', 'My grandchildren')).length === 0);
db.cloneUser('alex', 'onni'); db.updateUser('onni', { age: 15, name: 'Onni' } as any);
plan = [[{ name: 'showOpportunity', args: { ruleId: 'equity-account-under-30' } }]];
check('bad AI: a minor and an investing card → no card', advCards(await chat('onni', 'Can I invest my summer job money?')).length === 0);
db.updateUser('mia', { advice: {}, offersOff: false } as any);
replyText = 'You qualify for a 9 000 € bonus!';
plan = [[{ name: 'showOpportunity', args: { ruleId: 'gift-limit' } }]];
const inv = await chat('mia', 'Helping family');
const txt = (inv.body.messages || []).map((m: any) => m.text).join(' ');
check('bad AI: an invented number in the text never reaches the customer', !/9\s?000/.test(txt), txt);
replyText = 'Here is something that may help you with that, have a look below.';

// ---------------- With no AI at all, the question loop still works ----------------
setProvider({ ...mockProvider, async step(args: any) { if (args.tools.some((t: any) => t.name === 'showOpportunity')) throw new Error('AI down'); return (mockProvider as any).step(args); } } as any);
db.cloneUser('alex', 'leena'); db.updateUser('leena', { age: 50, name: 'Leena' } as any);
const lq = onCard('leena', 'household-credit', 'ask');
const l1 = await post('/api/actions', { userId: 'leena', messageId: lq, action: 'fact_answer', payload: { value: 'yes' } });
check('AI down: answering still saves and shows the suggestion (code only)', l1.status === 200 && advCards(l1)[0]?.type === 'opportunity', l1.body);

// ---------------- Reset leaves nothing behind ----------------
check('every rule with an in-app offer has code that carries it out', rules.filter((r) => r.action === 'appOffer').every((r) => A.ACCEPT_IDS.includes(r.id)) && [...R.ACCEPTS].sort().join() === [...A.ACCEPT_IDS].sort().join());

server.close();
fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\nRESULT ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
