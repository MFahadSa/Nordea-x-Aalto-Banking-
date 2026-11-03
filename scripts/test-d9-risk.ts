/**
 * D9 tests: the Nordea AI decides bank-side proposal risk (model + raising-only code floor).
 *  - claim validation + content/risk receipt (stale/invalid = UNCERTIFIED HIGH, never silent low)
 *  - NO_MODEL (no provider / mock / pre-D9) = the existing deterministic code rules
 *  - floor only raises: offers / shareBeyond / sensitive / code-derived inferred (F20) => HIGH
 *  - gate integration: certified low/medium auto-store under 'high' review; UNCERTIFIED waits
 *  - the leveling pass marks proposals model/error via the test seam (no real provider)
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'd9-risk-test-'));
process.env.CABINET_DATA_DIR = DIR;
delete process.env.LLM_PROVIDER; // NO_MODEL unless the seam is installed

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail)}`); }
}

const RISK = await import('../src/server/arch/risk.js');
const { appendMessage, loadBus } = await import('../src/server/arch/store/busStore.js');
const { saveCmDb, loadCmDb } = await import('../src/server/arch/store/cmStore.js');
const CM = await import('../src/server/arch/agents/cm.js');
const NORDEA = await import('../src/server/arch/agents/nordea.js');
import type { AgentMessage } from '../src/server/arch/types.js';

let seq = 0;
function proposal(over: { summary?: string; payload?: Record<string, unknown>; from?: 'nordea' | 'personal' | 'cm' } = {}): AgentMessage {
  return {
    id: `m-${++seq}`, at: new Date().toISOString(), from: over.from ?? 'nordea', to: 'cm',
    type: 'propose', summary: over.summary ?? 'Activity related to goal "Save for a car"', status: 'pending',
    payload: {
      detail: '3 transactions totalling 210 EUR of related spending relate to this goal (matched on category and description keywords).',
      goalIds: ['goal-1'], transactionIds: ['t1', 't2', 't3'], transactionIdsHash: 'ab12cd34', total: 210,
      ...(over.payload ?? {}),
    },
  };
}
const contentOf = (m: AgentMessage) => {
  const p = (m.payload ?? {}) as { detail?: string; goalIds?: string[]; transactionIdsHash?: string; total?: number };
  return { title: m.summary, detail: p.detail ?? '', observed: RISK.deriveObserved(m), transactionIdsHash: p.transactionIdsHash, total: p.total, goalIds: p.goalIds ?? [] };
};
const validClaim = (m: AgentMessage, risk: 'low' | 'medium' | 'high') => ({
  risk, reason: 'an observed aggregate over evidenced transactions', evidence: ['totalling 210 EUR'],
  receipt: RISK.nordeaRiskReceipt({ ...contentOf(m), risk }),
});

// --- receipt + validation
{
  const m = proposal();
  const c = contentOf(m);
  check('receipt binds content and risk', RISK.nordeaRiskReceipt({ ...c, risk: 'low' }) !== RISK.nordeaRiskReceipt({ ...c, risk: 'medium' })
    && RISK.nordeaRiskReceipt({ ...c, risk: 'low' }) !== RISK.nordeaRiskReceipt({ ...c, detail: c.detail + ' edited', risk: 'low' })
    && RISK.nordeaRiskReceipt({ ...c, risk: 'low' }) === RISK.nordeaRiskReceipt({ ...c, risk: 'low' }));
  check('valid claim accepted (phrase evidence)', RISK.validateNordeaRiskClaim({ risk: 'medium', reason: 'an observed aggregate', evidence: ['totalling 210 EUR'] }, c)?.risk === 'medium');
  check('valid claim accepted (goal + txh evidence)', !!RISK.validateNordeaRiskClaim({ risk: 'low', reason: 'restates its own evidence', evidence: ['goal:goal-1', 'txh:ab12cd34'] }, c));
  check('bad risk value rejected', RISK.validateNordeaRiskClaim({ risk: 'critical', reason: 'an observed aggregate', evidence: ['totalling 210 EUR'] }, c) === null);
  check('short reason rejected', RISK.validateNordeaRiskClaim({ risk: 'low', reason: 'ok', evidence: ['totalling 210 EUR'] }, c) === null);
  check('unverifiable evidence rejected', RISK.validateNordeaRiskClaim({ risk: 'low', reason: 'restates its own evidence', evidence: ['something never said anywhere'] }, c) === null);
  check('goal id not behind this proposal rejected', RISK.validateNordeaRiskClaim({ risk: 'low', reason: 'restates its own evidence', evidence: ['goal:other-goal'] }, c) === null);
}

// --- effective risk: NO_MODEL vs attempted model, floor, staleness
{
  const m = proposal();
  check('NO_MODEL unmarked = deterministic code rules (observed aggregate = medium)', (() => { const r = RISK.effectiveProposalRisk(m, { modelExpected: false }); return r.risk === 'medium' && !r.uncertified; })(), JSON.stringify(RISK.effectiveProposalRisk(m, { modelExpected: false })));
  check('model-expected but not yet leveled = UNCERTIFIED HIGH (waits, no silent code risk)', (() => { const r = RISK.effectiveProposalRisk(m, { modelExpected: true }); return r.risk === 'high' && r.uncertified; })());
  check('explicit scripted marker stays deterministic even when a model is expected', (() => { const r = RISK.effectiveProposalRisk(proposal({ payload: { riskModel: 'scripted' } }), { modelExpected: true }); return r.risk === 'medium' && !r.uncertified; })());
  check('attempted-model failure = UNCERTIFIED HIGH with the reason', (() => { const r = RISK.effectiveProposalRisk(proposal({ payload: { riskModel: 'error', riskError: 'provider timeout' } }), { modelExpected: true }); return r.risk === 'high' && r.uncertified && /provider timeout/.test(r.reason); })(), JSON.stringify(RISK.effectiveProposalRisk(proposal({ payload: { riskModel: 'error', riskError: 'provider timeout' } }), { modelExpected: true })));
  const low = proposal(); const claim = validClaim(low, 'low');
  check('valid model claim LOW passes as low', (() => { const r = RISK.effectiveProposalRisk(proposal({ summary: low.summary, payload: { ...(low.payload as object), riskModel: 'model', riskClaim: claim } }), { modelExpected: true }); return r.risk === 'low' && !r.uncertified; })());
  const stale = proposal(); const staleClaim = { ...validClaim(stale, 'low'), receipt: RISK.nordeaRiskReceipt({ ...contentOf(stale), detail: 'older wording', risk: 'low' }) };
  check('stale receipt (edited content) = UNCERTIFIED HIGH', (() => { const r = RISK.effectiveProposalRisk(proposal({ summary: stale.summary, payload: { ...(stale.payload as object), riskModel: 'model', riskClaim: staleClaim } }), { modelExpected: true }); return r.risk === 'high' && r.uncertified && /no longer matches/.test(r.reason); })());
  const invalid = proposal(); const badClaim = { risk: 'low', reason: 'restates its own evidence', evidence: ['zzz'], receipt: RISK.nordeaRiskReceipt({ ...contentOf(invalid), risk: 'low' }) };
  check('invalid claim (bad evidence) = UNCERTIFIED HIGH', (() => { const r = RISK.effectiveProposalRisk(proposal({ summary: invalid.summary, payload: { ...(invalid.payload as object), riskModel: 'model', riskClaim: badClaim } }), { modelExpected: true }); return r.risk === 'high' && r.uncertified; })());
  const share = proposal({ payload: { shareBeyond: true } }); const shareClaim = validClaim(share, 'low');
  check('floor RAISES only: shareBeyond + model low = HIGH', (() => { const r = RISK.effectiveProposalRisk(proposal({ payload: { shareBeyond: true, riskModel: 'model', riskClaim: shareClaim } }), { modelExpected: true }); return r.risk === 'high' && !r.uncertified && /code floor/.test(r.reason); })());
  const sensitive = proposal({ payload: { detail: 'gambling spend totalling 210 EUR' } }); const sensClaim = validClaim(sensitive, 'low');
  check('floor RAISES only: sensitive topic + model low = HIGH', (() => { const r = RISK.effectiveProposalRisk(proposal({ payload: { detail: 'gambling spend totalling 210 EUR', riskModel: 'model', riskClaim: sensClaim } }), { modelExpected: true }); return r.risk === 'high' && !r.uncertified; })());
  const inferred = proposal({ payload: { transactionIds: [], transactionIdsHash: undefined, total: undefined } }); const infClaim = validClaim(inferred, 'low');
  check('floor RAISES only: code-derived inferred + model low = HIGH (F20 stays code-derived)', (() => { const r = RISK.effectiveProposalRisk(proposal({ summary: inferred.summary, payload: { ...(inferred.payload as object), riskModel: 'model', riskClaim: infClaim } }), { modelExpected: true }); return r.risk === 'high' && !r.uncertified; })(), JSON.stringify(RISK.effectiveProposalRisk(proposal({ summary: inferred.summary, payload: { ...(inferred.payload as object), riskModel: 'model', riskClaim: infClaim } }), { modelExpected: true })));
  const high = proposal(); const highClaim = validClaim(high, 'high');
  check('highest wins: model HIGH with no floor = HIGH', (() => { const r = RISK.effectiveProposalRisk(proposal({ summary: high.summary, payload: { ...(high.payload as object), riskModel: 'model', riskClaim: highClaim } }), { modelExpected: true }); return r.risk === 'high' && !r.uncertified; })());
}

// --- gate integration (reviewLevel 'high'): certified stores, uncertified waits, NO_MODEL deterministic stores
const UID = 'd9user';
saveCmDb({ userId: UID, entries: [], permissions: { reviewLevel: 'high' } });
function pendingProposal(over: Parameters<typeof proposal>[0] = {}) {
  return appendMessage(UID, { from: 'nordea', to: 'cm', type: 'propose', status: 'pending', summary: over.summary ?? `D9 proposal ${++seq}`, payload: { detail: '3 transactions totalling 210 EUR of related spending relate to this goal.', goalIds: ['goal-1'], transactionIds: ['t1', 't2', 't3'], transactionIdsHash: 'ab12cd34', total: 210, ...(over.payload ?? {}) } });
}
{
  const m = pendingProposal();
  CM.autoStoreRoundProposals(UID); // NO_MODEL here (no provider, no seam)
  check('gate NO_MODEL: deterministic medium auto-stores under high review (existing behavior)', loadCmDb(UID).entries.some((e) => e.title === m.summary && e.risk === 'medium' && e.autoAccepted), JSON.stringify(loadCmDb(UID).entries.map((e) => [e.title, e.risk])));
}
{
  RISK.setNordeaRiskRunnerForTests(async (_uid, items) => ({ status: 'model', claims: Object.fromEntries(items.map((i) => [i.messageId, { risk: 'medium', reason: 'an observed aggregate over evidenced transactions', evidence: ['totalling 210 EUR'] }])) }));
  const m = pendingProposal();
  const r = await NORDEA.levelPendingProposals(UID);
  const marked = loadBus(UID).messages.find((x) => x.id === m.id);
  check('leveling marks the proposal model + validated claim + receipt', r.leveled === 1 && (marked?.payload as { riskModel?: string })?.riskModel === 'model'
    && typeof (marked?.payload as { riskClaim?: { receipt?: string } })?.riskClaim?.receipt === 'string', JSON.stringify([r, (marked?.payload as { riskModel?: string })?.riskModel]));
  CM.autoStoreRoundProposals(UID);
  check('gate with model: certified medium auto-stores under high review', loadCmDb(UID).entries.some((e) => e.title === m.summary && e.risk === 'medium'), JSON.stringify(loadCmDb(UID).entries.map((e) => [e.title, e.risk])));
}
{
  RISK.setNordeaRiskRunnerForTests(async () => ({ status: 'error', claims: null, error: 'provider timeout' }));
  const m = pendingProposal();
  await NORDEA.levelPendingProposals(UID);
  const marked = loadBus(UID).messages.find((x) => x.id === m.id);
  CM.autoStoreRoundProposals(UID);
  check('gate with model failure: UNCERTIFIED proposal waits (never silent low/auto-store)', !loadCmDb(UID).entries.some((e) => e.title === m.summary)
    && (marked?.payload as { riskModel?: string })?.riskModel === 'error' && marked?.status === 'pending', JSON.stringify((marked?.payload as { riskModel?: string })?.riskModel));
}
{
  RISK.setNordeaRiskRunnerForTests(async (_uid, items) => ({ status: 'model', claims: Object.fromEntries(items.map((i) => [i.messageId, { risk: 'low', reason: 'restates evidence', evidence: ['not in the content at all'] }])) }));
  const m = pendingProposal();
  await NORDEA.levelPendingProposals(UID);
  CM.autoStoreRoundProposals(UID);
  check('gate with invalid model claim: UNCERTIFIED waits', !loadCmDb(UID).entries.some((e) => e.title === m.summary));
}
{
  RISK.setNordeaRiskRunnerForTests(null);
  const m = pendingProposal();
  const r = await NORDEA.levelPendingProposals(UID);
  check('NO_MODEL leveling is a truthful no-op (scripted, nothing marked)', r.status === 'scripted' && ((loadBus(UID).messages.find((x) => x.id === m.id)?.payload as { riskModel?: string })?.riskModel) === undefined, JSON.stringify(r));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
