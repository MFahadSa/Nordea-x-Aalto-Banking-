/**
 * G16 live evidence run (local evidence driver, committed): one session with the REAL provider
 * (Gemini, free tier) instead of the mock. Mirrors Bill's G16 ask:
 *   Abel goal -> V3 round A (user change) -> bank import -> decay round B;
 *   each agent prompt must hold only its own DB data; code still owns numbers/risk;
 *   logged via the same state DEV_MONITOR serves (archState) + bus message ids.
 * Every model step's system+turns is recorded to $CABINET_DATA_DIR/prompts.jsonl for the
 * per-agent data-isolation check. LLM_MAX_CALLS hard-stops paid calls (llm.ts G16 cap).
 */
import fs from 'fs';
import path from 'path';

const DIR = process.env.CABINET_DATA_DIR!;
fs.mkdirSync(DIR, { recursive: true });
const LOG = path.join(DIR, 'prompts.jsonl');

const A = await import('../src/server/arch/orchestrator.js');
const S = await import('../src/server/arch/store/index.js');
const R = await import('../src/server/arch/rounds.js');
const LL = await import('../src/server/llm.js');
const { openAiProvidersFromEnv } = await import('../src/server/llmOpenAI.js');
const { makeChain } = await import('../src/server/llmChain.js');
// Same wiring as server.ts: LLM_PROVIDER=openai runs the OpenAI-compatible chain (Groq);
// otherwise the real Gemini provider. Groq-only here: Gemini is NOT appended as a fallback.
const base = process.env.LLM_PROVIDER === 'openai' ? makeChain(openAiProvidersFromEnv()) : LL.gemini;
type StepArgs = Parameters<typeof base.step>[0];

const UID = 'g16test';
const STAGE = process.argv[2] || 'a';
let calls = 0;

// Recording wrapper: delegates to the REAL gemini provider, logs every step's content.
const recording = {
  ...base,
  step: async (args: StepArgs) => {
    calls += 1;
    fs.appendFileSync(LOG, JSON.stringify({ n: calls, at: new Date().toISOString(), system: args.system, tools: args.tools.map((t) => t.name), turns: args.turns }) + '\n');
    try {
      const res = await base.step(args);
      fs.appendFileSync(LOG, JSON.stringify({ n: calls, ok: true, calls: res.calls, text: (res.text || '').slice(0, 400) }) + '\n');
      return res;
    } catch (err) {
      fs.appendFileSync(LOG, JSON.stringify({ n: calls, ok: false, error: String(err).slice(0, 300) }) + '\n');
      throw err;
    }
  },
};
LL.setProvider(recording as typeof base);

const line = (s: string) => console.log(s);
line(`provider: ${LL.getProvider().name} (real, recorded)`);

// Fictional bank data (Nordea DB only) with distinctive markers for the isolation check.
// Writes go through the Nordea agent (bus put-* controls), never the store directly.
const ACCTS = [{ id: 'a1', userId: UID, key: 'current', type: 'current account' }];
const TX_BASE = [
  { id: 't1', userId: UID, date: '2026-10-01', category: 'transport', amount: -52.1, account: 'current', description: 'Fuel for the car', counterparty: 'NestE' },
  { id: 't2', userId: UID, date: '2026-10-05', category: 'transport', amount: -31.4, account: 'current', description: 'Car wash', counterparty: 'WashCo' },
  { id: 't3', userId: UID, date: '2026-10-07', category: 'groceries', amount: -64.2, account: 'current', description: 'Weekly groceries', counterparty: 'K-Market' },
  { id: 't4', userId: UID, date: '2026-10-09', category: 'salary', amount: 3900, account: 'current', description: 'Salary', counterparty: 'Employer Oy' },
];
const importViaNordeaAgent = (txs: typeof TX_BASE) => {
  for (const a of ACCTS) A.appWrites.putBankAccount(UID, a);
  A.appWrites.putTransactions(UID, txs, 'replace');
};
importViaNordeaAgent(TX_BASE);

if (STAGE === 'a') {
// 1) Abel goal (user change) -> round A
A.addGoalDirect(UID, 'Save for a car', '12 000 EUR');
line('goal added: ' + JSON.stringify(S.loadUserDb(UID).goals.map((g) => g.title)));
const roundA = await A.contribute(UID);
const storedA = R.loadRound(UID, roundA.round.id)!;
line(`ROUND A trigger=${storedA.trigger} llm=${JSON.stringify(storedA.llm?.status)}`);
line(`ROUND A proposals=${JSON.stringify(roundA.proposals.map((p) => ({ total: p.total, matched: p.matched })))}`);

}
if (STAGE === 'b') {
// 2) Bank import -> decay round B
importViaNordeaAgent([...TX_BASE,
  { id: 't5', userId: UID, date: '2026-10-12', category: 'transport', amount: -45.0, account: 'current', description: 'Tyre change', counterparty: 'TyreShop' },
]);
const imp = A.applyBankImportToArch(UID);
line(`IMPORT updated=${imp.updated} staleFlags=${JSON.stringify(imp.staleFlags)}`);

// 3) Abel chat question (session round + model reply)
const chat1 = await A.chat(UID, 'how much did I spend on my car?', 'g16-sess-1');
line(`CHAT source=${chat1.source} provider=${chat1.provider} plan=${JSON.stringify(chat1.plan)}`);
line(`CHAT reply: ${chat1.reply.slice(0, 200)}`);

// 4) Monitor view (exactly what /api/dev/monitor serves) + bus ids
const mon = A.archState(UID);
const bus = S.loadBus(UID);
line(`BUS messages=${bus.messages.length} ids: ${bus.messages.map((m) => m.id).slice(-8).join(', ')}`);
fs.writeFileSync(path.join(DIR, 'monitor.json'), JSON.stringify(mon, null, 2));
line(`llmCallCount=${LL.llmCallCount()} (cap ${process.env.LLM_MAX_CALLS})`);
line(`evidence dir: ${DIR}`);
}
