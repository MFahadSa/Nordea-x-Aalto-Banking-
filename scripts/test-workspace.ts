/**
 * v21: the Nordea workspace side of the pipeline - cases open only from the customer's share,
 * read only what was shared (logged), numbers come from bank code, decisions need a reason and,
 * above the limit, a second and different person; stopping the share withdraws the case.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-'));
process.env.CABINET_DATA_DIR = DIR;
delete process.env.SUPABASE_URL;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 400)}`); }
}
const status = (f: () => unknown) => { try { f(); return 'ok'; } catch (e: any) { return String(e.status || e.message); } };

const { setProvider } = await import('../src/server/llm.js');
const { mockProvider } = await import('../src/server/llmMock.js');
setProvider({ ...mockProvider, async step() { throw new Error('offline'); } }); // summary falls back to bank code
const { db } = await import('../src/server/db.js');
await db.init();
const { previewCabinetForAgent } = await import('../src/server/accessGateway.js');
const C = await import('../src/server/pipeline/cases.js');
const E = await import('../src/server/pipeline/engine.js');

// A private item from the pipeline, and a saved one
const g = await E.ingest('lauri', 'glasses', { signals: [{ text: 'Viewing a 2-room flat in Kalasatama' }, { text: 'Mia: my doctor appointment is on Friday' }] });
for (const c of g.candidates) E.decide(c.id, c.filter === 'private' ? 'private' : 'save', 'lauri');

// The customer's share ("Connect me") for a home loan
const conv = undefined;
const prev = previewCabinetForAgent('lauri', 'adviser');
const forCase = C.relevantForLoan(prev.allowed);
check('loan relevance: the flat goal and the viewing in; the car goal and holiday out', forCase.some((e) => /Kalasatama/.test(e.title)) && forCase.some((e) => e.goalType === 'home') && !forCase.some((e) => /car|Japan/i.test(e.title)), forCase.map((e) => e.title));
check('private items are never in what the adviser may read', !prev.allowed.some((e) => /doctor/i.test(e.title)));
const share = db.addShare({ id: 'share-t1', userId: 'lauri', agentId: 'adviser', items: forCase.map((e) => e.title), createdAt: new Date().toISOString(), until: '2026-11-19', revoked: false });
const k = C.openCaseFromHandoff('lauri', conv as any, forCase, share.until, 'Can I get a mortgage pre-approval for a flat?', share.id);
check('a home-loan case opens with exactly the shared items', k.kind === 'home_loan_preapproval' && k.sharedIds.length === forCase.length);

const before = db.getAccessLog('lauri').length;
const d = C.caseDetail(k.id, 'kalle');
check('staff read only the shared items', d.items.length === forCase.length && d.items.every((e) => k.sharedIds.includes(e.id)));
check('every read is logged with the staff member and purpose', db.getAccessLog('lauri').length === before + 1 && /Kalle Virtanen/.test(db.getAccessLog('lauri')[0].purpose));
check('affordability from bank code: income 3 900, payment limit 30 %', d.affordability.income === 3900 && d.affordability.maxPayment === 1170 && d.affordability.maxLoan > 0, d.affordability);
check('missing: the flat price and the partner’s income', d.missing.some((m) => m.key === 'price') && d.missing.some((m) => m.key === 'partner'), d.missing);

const s = await C.draftSummary(k.id, 'kalle');
check('summary without AI: written by bank code, says so', s.by === 'code' && /3 900/.test(s.text) && !!s.note, s);
setProvider({ ...mockProvider, async step() { return { calls: [{ id: 's', name: 'draftSummary', args: { text: 'Lauri earns 3 900 € [3]. A 4.5 % rate would cost 1 900 € a month.' } }] }; } });
const s2 = await C.draftSummary(k.id, 'kalle');
check('summary: an invented rate and payment are caught; bank code writes it instead', s2.by === 'code' && !/4\.5|1 900/.test(s2.text), s2);
setProvider({ ...mockProvider, async step() { return { calls: [{ id: 's', name: 'draftSummary', args: { text: 'Lauri earns 3 900 € a month [3] and saves 400 € a month; the deposit is 8 200 € short of the 30 000 € goal [1]. Ask for the flat price.' } }] }; } });
const s3 = await C.draftSummary(k.id, 'kalle');
check('summary: a grounded AI draft is kept, with citations', s3.by === 'ai' && /\[1\]/.test(s3.text), s3);

check('asking needs a question', status(() => C.askCustomer(k.id, 'kalle', '  ')) === '400');
const k2 = C.askCustomer(k.id, 'kalle', 'What price range are you looking at?');
check('a question puts the case on “waiting for customer”', k2.status === 'waiting_customer');
check('another customer cannot answer', status(() => C.answerRequest('eeva', k.id, k2.requests[0].id, 'x')) === '404');
const k3 = C.answerRequest('lauri', k.id, k2.requests[0].id, 'Around 380 000 € for two rooms');
check('the answer is stored and its price becomes the case price', !!k3.requests[0].answer?.startsWith('Around') && k3.amount === 380000 && k3.status === 'open', k3);
check('answering twice is refused', status(() => C.answerRequest('lauri', k.id, k2.requests[0].id, 'again')) === '409');

check('a decision needs a reason', status(() => C.decideCase(k.id, 'kalle', 'pre_approved', ' ', 200000)) === '400');
check('a pre-approval needs an amount', status(() => C.decideCase(k.id, 'kalle', 'pre_approved', 'ok')) === '400');
const r1 = C.decideCase(k.id, 'kalle', 'pre_approved', 'Within the demo rules.', 300000);
check('above 250 000 €: waits for a second approver', r1.needsSecond && r1.case.status === 'waiting_second');
check('the second approver must be someone else', status(() => C.decideCase(k.id, 'kalle', 'pre_approved', 'again', 300000)) === '409');
check('…and approve the same amount', status(() => C.decideCase(k.id, 'sanna', 'pre_approved', 'ok', 320000)) === '409');
const r2 = C.decideCase(k.id, 'sanna', 'pre_approved', 'Confirmed.', 300000);
check('Sanna confirms: decided, both names kept', r2.case.status === 'decided' && r2.case.decisions.map((x) => x.by).join() === 'Kalle Virtanen,Sanna Mäkelä');
check('a decided case cannot be decided again', status(() => C.decideCase(k.id, 'kalle', 'declined', 'x')) === '409');

// A second case, then the customer stops that share
const share2 = db.addShare({ id: 'share-t2', userId: 'lauri', agentId: 'adviser', items: [], createdAt: new Date().toISOString(), until: '2026-11-19', revoked: false });
const kb = C.openCaseFromHandoff('lauri', undefined as any, forCase, share2.until, 'Talk to a person about a loan', share2.id);
C.withdrawCasesForShare('lauri', 'share-t2');
const after = C.caseDetail(kb.id, 'kalle');
check('stopping a share withdraws its case; nothing is readable', after.case.status === 'withdrawn' && after.items.length === 0);
check('…and only that case (the decided one stays decided)', C.caseDetail(k.id, 'kalle').case.status === 'decided');

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\nRESULT ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
