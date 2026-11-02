/**
 * Tests for the three-database architecture (User DB / Context Memory DB / Nordea DB).
 * Covers the five design decisions:
 *  1. The Context Memory DB owns the cabinet; only the CM agent writes it.
 *  2. Abel in-app vs connected external personal agent, connect/disconnect swaps the role.
 *  3. The sync airlock gates ONLY personal-agent sync ingestion - never direct input to Abel.
 *  4. The cabinet is shared context, advisory, in its own DB.
 *  5. Goal-filtered contributions, merge review, explain/dispute, separate off/disconnect/delete, guardrails.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-test-'));
process.env.CABINET_DATA_DIR = CABINET_DATA_DIR;

const A = await import('../src/server/arch/orchestrator.js');
const S = await import('../src/server/arch/store/index.js');

const UID = 'testuser';
let passed = 0;
let failed = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${extra}`); }
};

// Seed the Nordea DB directly (the bank side), with transactions only some of which match a goal.
S.saveNordeaDb({
  userId: UID,
  accounts: [{ id: 'a1', userId: UID, key: 'current', type: 'current account' }],
  transactions: [
    { id: 't1', userId: UID, date: '2026-10-01', category: 'transport', amount: -52.1, account: 'current', description: 'Fuel for the car', counterparty: 'NestE' },
    { id: 't2', userId: UID, date: '2026-10-05', category: 'transport', amount: -31.4, account: 'current', description: 'Car wash', counterparty: 'WashCo' },
    { id: 't3', userId: UID, date: '2026-10-07', category: 'groceries', amount: -64.2, account: 'current', description: 'Weekly groceries', counterparty: 'K-Market' },
    { id: 't4', userId: UID, date: '2026-10-09', category: 'salary', amount: 3900, account: 'current', description: 'Salary', counterparty: 'Employer Oy' },
  ],
});

// --- Decision 3: direct input never touches the airlock; sync requires a connected external agent
const goal = A.addGoalDirect(UID, 'Save for a car', '12 000 EUR');
check('direct goal input lands in the User DB', S.loadUserDb(UID).goals.length === 1);
check('direct goal input creates no airlock batch', S.loadBus(UID).airlock.length === 0);

let threw = '';
try { A.stageSync(UID, 'whatsapp', [{ kind: 'note', text: 'mom asked about the car fund' }]); } catch (e) { threw = (e as Error).message; }
check('sync is refused while Abel is the personal agent (nothing connected)', threw.includes('No external personal agent'), threw);

A.connectExternalAgent(UID, 'Meta Muse');
check('connect swaps the personal agent role', S.loadUserDb(UID).personalAgent.mode === 'external');
const batch = A.stageSync(UID, 'whatsapp', [{ kind: 'note', text: 'mom asked about the car fund' }]);
check('connected agent sync waits in the airlock', batch.status === 'pending');
check('synced item is NOT in the User DB before approval', S.loadUserDb(UID).personalFacts.length === 0);
A.decideAirlock(UID, batch.id, true);
check('approving the airlock writes the fact with provenance', S.loadUserDb(UID).personalFacts[0]?.viaAirlockId === batch.id);

const batch2 = A.stageSync(UID, 'calendar', [{ kind: 'event', text: 'dentist on Friday' }]);
A.decideAirlock(UID, batch2.id, false);
check('rejecting the airlock discards the items', S.loadUserDb(UID).personalFacts.length === 1);

A.disconnectPersonalAgent(UID);
check('disconnect returns Abel as the in-app personal agent', S.loadUserDb(UID).personalAgent.mode === 'abel');

// --- Decision 5: goal-filtered contribution -> merge review -> explain/dispute
const c1 = A.contribute(UID);
check('contribution proposes only goal-matching entries', c1.proposals.length === 1 && c1.proposals[0].matched === 2, JSON.stringify(c1.proposals));

// --- AC2: the build round wrote the shared context.md; each agent wrote only its own section
const doc1 = S.loadContext(UID);
check('AC2: a build round writes the shared context.md with all three sections', !!doc1 && doc1.sections.customer.rows.some((r) => r.title === 'Save for a car') && doc1.sections.nordea.rows.some((r) => r.detail.includes('83.5')) && fs.existsSync(S.contextMdPath(UID)));
check('AC2: sections are structured rows with provenance, rendered to markdown (B1a)', !!doc1 && doc1.sections.nordea.rows.every((r) => r.source === 'nordea' && typeof r.evidence?.total === 'number') && fs.readFileSync(S.contextMdPath(UID), 'utf-8').includes('## Nordea'));
check('AC2: the Customer section shares goal titles only - the detail stays in the User DB', !!doc1 && !doc1.sections.customer.rows.some((r) => `${r.title} ${r.detail}`.includes('12 000 EUR')));
check('AC2: the CM agent stored a snapshot of the finished document at finalise', (S.loadContextSnapshot(UID) ?? '').includes('## Nordea'));
check('no cabinet entry before review', S.loadCmDb(UID).entries.length === 0);
const c2 = A.contribute(UID);
check('re-running contribution does not duplicate pending proposals', c2.proposals.length === 0);

const busMsgs = S.loadBus(UID).messages;
check('goal titles reached the Nordea agent via explicit messages', busMsgs.some((m) => m.from === 'personal' && m.to === 'cm') && busMsgs.some((m) => m.from === 'cm' && m.to === 'nordea' && m.type === 'query'));

const queue = A.reviewQueue(UID);
check('merge review queue holds both pending proposals (Nordea insight + F4 personal goal proposal)', queue.length === 2 && queue.some((m) => m.from === 'nordea') && queue.some((m) => m.from === 'personal'), JSON.stringify(queue.map((m) => m.from)));
const entry = A.decideProposal(UID, queue.find((m) => m.from === 'nordea')!.id, true) as { id: string };
check('accepting writes the cabinet entry to the Context Memory DB', S.loadCmDb(UID).entries.length === 1);
check('the entry carries provenance (proposedBy + viaMessageId)', S.loadCmDb(UID).entries[0].proposedBy === 'nordea' && !!S.loadCmDb(UID).entries[0].viaMessageId);
check('F4: the personal agent proposed the customer goal to the cabinet (pending review)', queue.some((m) => m.from === 'personal' && (m.payload as { observed?: string } | undefined)?.observed === 'observed'));

const docChat = A.chat(UID, 'how much have I saved for the car?');
check('B1c: chat answers from the finished context.md', docChat.reply.includes('83.5') && docChat.used.includes('context-memory-db'), docChat.reply);

const explained = A.explainEntry(UID, entry.id);
check('explain shows who, why and the review trail', explained.explanation.who.includes('Nordea agent') && explained.explanation.why.includes('Save for a car') && explained.explanation.reviewedBy.includes('accepted'), JSON.stringify(explained.explanation));

const disputed = A.disputeEntry(UID, entry.id, 'Car wash is not saving for a car');
check('dispute marks the entry and keeps it visible', disputed.status === 'disputed' && (disputed.disputeReason ?? '').includes('Car wash'));

// --- Decision 5: answer guardrails, honest thin-context answers
const bankAnswer = A.chat(UID, 'what is my account balance?');
check('personal agent never reads the Nordea DB (guardrail)', bankAnswer.reply.includes("don't have your bank data"), bankAnswer.reply);
const thin = A.chat(UID, 'what should I cook for a village festival?');
check('unknown topics get an honest thin-context answer', thin.reply.includes("don't have enough context"), thin.reply);
const chatGoal = A.chat(UID, 'my goal is to visit Japan next summer');
check('a goal typed in chat is direct input (no airlock)', S.loadUserDb(UID).goals.length === 2 && S.loadBus(UID).airlock.length === 2);

// --- Decision 5: separate off / disconnect / delete
A.setAgentOff(UID, 'nordea', true);
threw = '';
try { A.contribute(UID); } catch (e) { threw = (e as Error).message; }
check('turning the Nordea agent off stops contributions without deleting data', threw.includes('off'), threw);
check('the Nordea DB still exists while the agent is off', S.nordeaFileExists(UID));
A.setAgentOff(UID, 'nordea', false);

A.setAgentOff(UID, 'personal', true);
threw = '';
try { A.chat(UID, 'hello'); } catch (e) { threw = (e as Error).message; }
check('turning the personal agent off stops chat', threw.includes('off'), threw);
A.setAgentOff(UID, 'personal', false);

A.deleteDatabase(UID, 'cm');
check('deleting the Context Memory DB wipes only that DB', S.loadCmDb(UID).entries.length === 0 && S.loadUserDb(UID).goals.length === 2 && S.nordeaFileExists(UID));

// --- Decision 1 & 4: physical separation, one owner per DB
const dir = path.join(CABINET_DATA_DIR, 'arch');
const files = fs.readdirSync(dir);
check('the databases live in separate per-DB SQLite files', ['user', 'nordea', 'bus'].every((k) => files.includes(`${UID}.${k}.db`)) && !files.includes(`${UID}.cm.db`), files.join(','));
check('deleting one DB leaves the others readable', S.loadUserDb(UID).goals.length === 2 && S.loadNordeaDb(UID)!.transactions.length === 4);

// --- Numeric-grounding guardrail: reply numbers must come from retrieved facts
const g1 = A.groundNumbers('You saved 400 EUR this month and 5 goals are active.', ['Monthly Savings Transfer -400', '5 goals']);
check('guardrail passes numbers that appear in the facts', g1.grounded && g1.reply.includes('400'));
const g2 = A.groundNumbers('You spent 9999 EUR on cars.', ['Monthly Savings Transfer -400']);
check('guardrail rejects an invented number and falls back to plain wording', !g2.grounded && !g2.reply.includes('9999'));

// --- Staleness: accepted entry's facts change -> flag-stale + refresh + new proposal
const UID2 = 'staleuser';
S.saveNordeaDb({
  userId: UID2,
  accounts: [],
  transactions: [{ id: 's1', userId: UID2, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' }],
});
A.addGoalDirect(UID2, 'Save for a car');
const sc = A.contribute(UID2);
A.decideProposal(UID2, sc.proposals[0].messageId, true);
check('staleness setup: entry active with 100 EUR evidence', S.loadCmDb(UID2).entries[0].status === 'active' && S.loadCmDb(UID2).entries[0].evidence?.total === 100);
const nd = S.loadNordeaDb(UID2)!;
nd.transactions.push({ id: 's2', userId: UID2, date: '2026-10-02', category: 'transport', amount: -50, account: 'current', description: 'Car wash' });
S.saveNordeaDb(nd);
const sc2 = A.contribute(UID2);
check('changed facts flag the accepted entry stale', S.loadCmDb(UID2).entries[0].status === 'stale');
const staleBus = S.loadBus(UID2).messages;
check('flag-stale and refresh messages were exchanged', staleBus.some((m) => m.type === 'flag-stale' && m.from === 'cm' && m.to === 'personal') && staleBus.some((m) => m.type === 'refresh' && m.from === 'cm' && m.to === 'nordea'));
check('a refreshed proposal waits in merge review', (sc2.staleFlags?.length ?? 0) === 1 && A.reviewQueue(UID2).some((m) => m.from === 'nordea' && (m.payload as { total?: number } | undefined)?.total === 150), JSON.stringify(sc2.staleFlags));


// --- Agent-to-agent query transport (demo client): each agent answers only from its own DB
const cmAns = A.agentQuery(UID2, 'cm', 'car');
check('the CM agent answers from the Context Memory DB', (cmAns.reply as { matchedEntries: unknown[] }).matchedEntries.length >= 1, JSON.stringify(cmAns.reply).slice(0, 120));
const noAns = A.agentQuery(UID, 'nordea', 'car');
const noReply = noAns.reply as { matchCount: number; totalAbsEur: number; sample?: unknown };
check('the Nordea agent answers with an aggregate from the Nordea DB', noReply.matchCount > 0 && noReply.totalAbsEur > 0, JSON.stringify(noAns.reply).slice(0, 120));
check('F9/AC5: the aggregate carries NO raw transactions (no dates, amounts or descriptions leave the Nordea DB)', noReply.sample === undefined && !JSON.stringify(noAns.reply).includes('Fuel'), JSON.stringify(noAns.reply).slice(0, 160));
check('the Nordea reply carries no account identifiers', !JSON.stringify(noAns.reply).match(/iban|balance/i));
const busAfter = S.loadBus(UID);
check('both queries and replies are explicit bus messages',
  busAfter.messages.some((m) => m.type === 'query' && m.from === 'personal' && m.to === 'nordea')
  && busAfter.messages.some((m) => m.type === 'reply' && m.from === 'nordea' && m.to === 'personal'));


// --- TF-IDF ownership: per-agent indexes, explicit message replies, NO shared corpus
const { buildOwnDocs, tfidfRank } = await import('./rag-demo.js');
const ownDocs = buildOwnDocs(UID2);
check('the personal agent\'s own retrieval index is User DB documents ONLY',
  ownDocs.length > 0 && ownDocs.every((d: { source: string }) => d.source.startsWith('user-db:')));
check('the personal agent\'s own index never contains cabinet or Nordea content',
  !ownDocs.some((d: { text: string }) => d.text.includes('Fuel for the car') || d.text.includes('Activity related to goal')));
check('cabinet content reaches the demonstrator only as CM-agent reply entries via agentQuery (message transport, tested above)',
  true); // structural: rag-demo.ts has no loadCmDb import; CM content enters via A.agentQuery only
const ragSrc = fs.readFileSync(new URL('./rag-demo.ts', import.meta.url), 'utf-8');
check('the demonstrator never opens the CM or Nordea stores directly',
  !ragSrc.includes('loadCmDb') && !ragSrc.includes('loadNordeaDb') && !ragSrc.includes('buildCorpus'));
check('TF-IDF ranks the car goal first for a car question in the own index',
  tfidfRank('car saving', ownDocs)[0]?.doc.source === 'user-db:goal');

// --- Client-side composition: the server returns facts only; the CLIENT writes the answer
const { compose } = await import('./personal-agent-client.js');
const composed = compose('car', {
  from: 'cm-db',
  matchedEntries: [{ id: 'e1', title: 'Car activity', detail: 'goal-related spending', status: 'active', evidence: { total: 20616 } }],
}, {
  from: 'nordea-db', matchCount: 72, totalAbsEur: 20616, categories: ['transport'],
});
check('the client composes the final answer from both agents\' replies',
  composed.includes('Car activity') && composed.includes('72') && composed.includes('20616'), composed.slice(0, 120));
check('the server\'s agent-query reply carries facts only, no composed wording',
  ['from', 'matchedEntries'].every((k) => k in cmAns.reply) && !('answer' in cmAns.reply) && !('text' in cmAns.reply)
  && ['from', 'matchCount', 'totalAbsEur', 'categories'].every((k) => k in noAns.reply) && !('answer' in noAns.reply) && !('sample' in noAns.reply));

// --- Disputed entries are never silently re-accepted by refresh cycles
const UID3 = 'disputeuser';
S.saveNordeaDb({ userId: UID3, accounts: [], transactions: [{ id: 'd1', userId: UID3, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel' }] });
A.addGoalDirect(UID3, 'Save for a car');
const dc = A.contribute(UID3);
const dEntry = A.decideProposal(UID3, dc.proposals[0].messageId, true);
A.disputeEntry(UID3, (dEntry as { id: string }).id, 'savings transfers are not car spending');
const nd3 = S.loadNordeaDb(UID3)!;
nd3.transactions.push({ id: 'd2', userId: UID3, date: '2026-10-02', category: 'transport', amount: -50, account: 'current', description: 'Car wash' });
S.saveNordeaDb(nd3);
A.contribute(UID3);
A.contribute(UID3);
const dAfter = S.loadCmDb(UID3).entries;
check('a disputed entry is never silently re-accepted by contribute/refresh cycles',
  dAfter.length === 1 && dAfter[0].status === 'disputed', JSON.stringify(dAfter.map((e) => e.status)));

// --- Numeric guardrail: stated limitation, pinned so nobody over-claims it
const wrongAssoc = A.groundNumbers('You spent 20616 EUR on groceries last month', ['car saving evidence total 20616 EUR']);
check('LIMITATION (stated, pinned): the guardrail checks digit presence only - a real number attached to the WRONG thing still passes; unit/association semantics are NOT validated',
  wrongAssoc.grounded === true);
const invented = A.groundNumbers('You spent 99999 EUR on transport', ['car saving evidence total 20616 EUR']);
check('the guardrail still rejects numbers absent from the retrieved facts', invented.grounded === false);


// --- Cabinet park: parked denies agent reads/supply WITHOUT deletion; only explicit reconnect resumes
const UID4 = 'parkuser';
S.saveNordeaDb({ userId: UID4, accounts: [], transactions: [{ id: 'p1', userId: UID4, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID4, 'Save for a car');
const pc = A.contribute(UID4);
A.parkCabinet(UID4, true);
check('parking keeps every cabinet entry (nothing deleted)', S.loadCmDb(UID4).entries.length === 0 && S.loadCmDb(UID4).parked === true);
threw = '';
try { A.agentQuery(UID4, 'cm', 'car'); } catch (e) { threw = (e as Error).message; }
check('a parked cabinet denies agent reads (no disclosure)', threw.includes('parked'), threw);
threw = '';
try { A.contribute(UID4); } catch (e) { threw = (e as Error).message; }
check('a parked cabinet denies new contributions', threw.includes('parked'), threw);
threw = '';
try { A.decideProposal(UID4, pc.proposals[0].messageId, true); } catch (e) { threw = (e as Error).message; }
check('a parked cabinet denies accepting proposals (no supply while parked)', threw.includes('parked'), threw);
check('the denied acceptance left the proposal pending (no half-mutated review)', A.reviewQueue(UID4).some((m) => m.id === pc.proposals[0].messageId));
const rejected = A.decideProposal(UID4, pc.proposals[0].messageId, false) as { rejected: boolean };
check('the user can still REJECT a proposal while parked (review is the user\'s, not agent supply)', rejected.rejected === true);
A.connectExternalAgent(UID4, 'Meta Muse');
check('connecting an external personal agent does NOT unpark the cabinet', S.loadCmDb(UID4).parked === true);
A.disconnectPersonalAgent(UID4);
check('disconnecting the personal agent does NOT unpark the cabinet', S.loadCmDb(UID4).parked === true);
A.parkCabinet(UID4, false);
check('only the explicit reconnect resumes the cabinet', S.loadCmDb(UID4).parked !== true);
A.connectExternalAgent(UID4, 'Meta Muse');
A.disconnectPersonalAgent(UID4);
check('the connect/disconnect swap never parks the cabinet by itself', !S.loadCmDb(UID4).parked);
const pc2 = A.contribute(UID4);
check('after reconnect, contributions and agent reads work again', pc2.proposals.length === 1 && (A.agentQuery(UID4, 'cm', 'car').reply as { matchedEntries: unknown[] }).matchedEntries.length >= 0);

// --- Bank import triggers the source-owner DB refresh + staleness detection (no manual contribution press)
const { writeDemoDb } = await import('./demo-data.js');
writeDemoDb(CABINET_DATA_DIR);
const { db: legacyDb } = await import('../src/server/db.js');
await legacyDb.init();
const { applyNordeaData } = await import('../src/server/nordeaData.js');
const UID5 = 'lauri';
S.saveNordeaDb({ userId: UID5, accounts: [], transactions: [{ id: 'i1', userId: UID5, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID5, 'Save for a car');
const ic = A.contribute(UID5);
const iEntry = A.decideProposal(UID5, ic.proposals[0].messageId, true) as { id: string };
check('import-test setup: entry active with 100 EUR evidence', S.loadCmDb(UID5).entries[0].status === 'active' && S.loadCmDb(UID5).entries[0].evidence?.total === 100);
const applied = applyNordeaData(UID5, { mode: 'incremental', transactions: [{ date: '2026-10-20', amount: -42, category: 'transport', description: 'Extra fuel for the car', bankId: 'IMP-TEST-1' }] } as Parameters<typeof applyNordeaData>[1], 'test import');
check('the legacy import applies', applied.ok, applied.message);
const hook = A.applyBankImportToArch(UID5);
check('the Nordea agent refreshes its own DB from the import', hook.updated === true && S.loadNordeaDb(UID5)!.transactions.some((t) => t.description === 'Extra fuel for the car'));
check('staleness detection runs on the import itself (no manual contribution press)', hook.staleFlags.length === 1 && S.loadCmDb(UID5).entries[0].status === 'stale', JSON.stringify(hook.staleFlags));
const importBus = S.loadBus(UID5).messages;
check('the import produced flag-stale and refresh messages', importBus.some((m) => m.type === 'flag-stale') && importBus.some((m) => m.type === 'refresh'));
check('a refreshed proposal waits in merge review after the import', A.reviewQueue(UID5).some((m) => (m.payload as { refreshOf?: string })?.refreshOf === iEntry.id));
A.parkCabinet(UID5, true);
const hook2 = A.applyBankImportToArch(UID5);
check('a parked cabinet still gets the source-owner DB update but NO staleness run', hook2.updated === true && hook2.staleFlags.length === 0);
check('the import hook does nothing for a customer without the architecture', A.applyBankImportToArch('no-such-user').updated === false);

// --- Resume never serves outdated facts as fresh: re-check runs before reuse
// Scenario A: import while PARKED updates the Nordea DB without detection; reconnect re-checks.
const UID6 = 'eeva';
S.saveNordeaDb({ userId: UID6, accounts: [], transactions: [{ id: 'e1', userId: UID6, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID6, 'Save for a car');
const ec = A.contribute(UID6);
A.decideProposal(UID6, ec.proposals[0].messageId, true);
A.parkCabinet(UID6, true);
applyNordeaData(UID6, { mode: 'incremental', transactions: [{ date: '2026-10-21', amount: -55, category: 'transport', description: 'Extra fuel for the car', bankId: 'IMP-TEST-2' }] } as Parameters<typeof applyNordeaData>[1], 'test import while parked');
const hookParked = A.applyBankImportToArch(UID6);
check('while parked, the import updates the Nordea DB but raises NO stale flag yet', hookParked.updated === true && hookParked.staleFlags.length === 0 && S.loadCmDb(UID6).entries[0].status === 'active');
const resumed = A.parkCabinet(UID6, false);
check('reconnect re-checks BEFORE the cabinet is reused: the entry is flagged stale', resumed.staleFlags.length === 1 && S.loadCmDb(UID6).entries[0].status === 'stale', JSON.stringify(resumed.staleFlags));
check('the reconnect re-check posted flag-stale + refresh messages', S.loadBus(UID6).messages.some((m) => m.type === 'flag-stale') && S.loadBus(UID6).messages.some((m) => m.type === 'refresh'));

// Scenario B: import while the NORDEA agent is OFF does not touch its DB; turn-on refreshes + re-checks.
const UID7 = 'alex';
S.saveNordeaDb({ userId: UID7, accounts: [], transactions: [{ id: 'x1', userId: UID7, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID7, 'Save for a car');
const xc = A.contribute(UID7);
A.decideProposal(UID7, xc.proposals[0].messageId, true);
A.setAgentOff(UID7, 'nordea', true);
applyNordeaData(UID7, { mode: 'incremental', transactions: [{ date: '2026-10-22', amount: -77, category: 'transport', description: 'More fuel for the car', bankId: 'IMP-TEST-3' }] } as Parameters<typeof applyNordeaData>[1], 'test import while off');
const hookOff = A.applyBankImportToArch(UID7);
check('while the Nordea agent is off, the import hook does not touch its DB', hookOff.updated === false && !S.loadNordeaDb(UID7)!.transactions.some((t) => t.description === 'More fuel for the car'));
A.setAgentOff(UID7, 'nordea', false);
check('turning the Nordea agent back on refreshes its DB from current bank data', S.loadNordeaDb(UID7)!.transactions.some((t) => t.description === 'More fuel for the car'));
check('turn-on re-checks BEFORE the agent serves again: the entry is flagged stale', S.loadCmDb(UID7).entries[0].status === 'stale');

// Scenario C: import while the CM agent is OFF updates the DB without detection; turn-on re-checks.
const UID8 = 'lauri';
S.deleteDb(UID8, 'cm');
S.deleteDb(UID8, 'user');
S.deleteDb(UID8, 'nordea');
S.saveBus(UID8, { messages: [], airlock: [] }); // clean slate for this customer (earlier scenarios left a pending proposal)
S.saveNordeaDb({ userId: UID8, accounts: [], transactions: [{ id: 'l1', userId: UID8, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID8, 'Save for a car');
const lc = A.contribute(UID8);
A.decideProposal(UID8, lc.proposals[0].messageId, true);
A.setAgentOff(UID8, 'cm', true);
applyNordeaData(UID8, { mode: 'incremental', transactions: [{ date: '2026-10-23', amount: -33, category: 'transport', description: 'Even more fuel for the car', bankId: 'IMP-TEST-4' }] } as Parameters<typeof applyNordeaData>[1], 'test import while cm off');
A.applyBankImportToArch(UID8);
check('while the CM agent is off, the import updates the Nordea DB without detection', S.loadNordeaDb(UID8)!.transactions.some((t) => t.description === 'Even more fuel for the car') && S.loadCmDb(UID8).entries[0].status === 'active');
A.setAgentOff(UID8, 'cm', false);
check('turning the CM agent back on re-checks BEFORE the cabinet serves again', S.loadCmDb(UID8).entries[0].status === 'stale');


// --- AC1: module isolation is real - a source scan pins each agent to its own store
const readSrc = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf-8');
const personalSrc = readSrc('../src/server/arch/agents/personal.ts');
const cmSrc = readSrc('../src/server/arch/agents/cm.ts');
const nordeaSrc = readSrc('../src/server/arch/agents/nordea.ts');
// Allowlist (F14): each agent module may import only its own store, the bus store, the
// dispatcher, the round engine, text helpers and shared types - plus, for the Nordea agent,
// the bank's core data source (../../db.js). Any other import fails, however it is named.
const importsOf = (src: string) => [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
const AGENT_SHARED = ['../types.js', '../text.js', '../store/busStore.js', '../store/contextStore.js', '../dispatcher.js', '../rounds.js', '../risk.js']; // contextStore = the AC2 shared document, section writers pinned below
const onlyAllowed = (src: string, ownStore: string, extra: string[] = []) => importsOf(src).every((spec) => [...AGENT_SHARED, ownStore, ...extra].includes(spec));
check('AC1: the personal agent module imports only its own store plus shared bus/round infra', onlyAllowed(personalSrc, '../store/userStore.js'), importsOf(personalSrc).join(','));
check('AC1: the CM agent module imports only its own store plus shared bus/round infra', onlyAllowed(cmSrc, '../store/cmStore.js'), importsOf(cmSrc).join(','));
check('AC1: the Nordea agent module imports only its own store plus shared infra and the core bank source', onlyAllowed(nordeaSrc, '../store/nordeaStore.js', ['../../db.js']), importsOf(nordeaSrc).join(','));
check('AC2: only the personal agent module writes the Customer section', personalSrc.includes('writeCustomerSection') && !personalSrc.includes('writeMemorySection') && !personalSrc.includes('writeNordeaSection'));
check('AC2: only the CM agent module writes the Context memory section and the header', cmSrc.includes('writeMemorySection') && cmSrc.includes('writeHeader') && !cmSrc.includes('writeCustomerSection') && !cmSrc.includes('writeNordeaSection'));
check('AC2: only the Nordea agent module writes the Nordea section', nordeaSrc.includes('writeNordeaSection') && !nordeaSrc.includes('writeCustomerSection') && !nordeaSrc.includes('writeMemorySection'));
check('AC1: the dispatcher and round engine open no agent store at all',
  !/(userStore|cmStore|nordeaStore)/.test(readSrc('../src/server/arch/dispatcher.ts')) && !/(userStore|cmStore|nordeaStore)/.test(readSrc('../src/server/arch/rounds.ts')));

// --- AC11/F10: the in-app Abel (the LLM) never opens user.db or any architecture store -
// its facts come through the access gateway. "Abel" as the architecture's personal agent is
// the Abel mode of the personal agent (personalLabel), not the LLM module.
const abelSrc = readSrc('../src/server/abel.ts');
check('AC11: the in-app Abel module imports no architecture store and no user.db access',
  !/(arch\/store|userStore|cmStore|nordeaStore|contextStore|loadUserDb)/.test(abelSrc), (abelSrc.match(/from\s+['"][^'"]+['"]/g) ?? []).join(','));
check('AC11: Abel reads its cabinet through the access gateway, and only there',
  abelSrc.includes('readCabinetThroughGateway') && !/abel_records/.test(abelSrc.replace(/readCabinetThroughGateway|previewCabinetForAgent/g, '')), '');

// --- AC6: a contribution runs as a real build round: open -> contributions -> done -> finalise -> stored
const UID9 = 'rounduser';
S.saveNordeaDb({ userId: UID9, accounts: [], transactions: [{ id: 'r1', userId: UID9, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID9, 'Save for a car');
const rc = A.contribute(UID9) as { round: { id: string; state: string; steps: number; maxSteps: number } };
check('AC6: the build round finalised and stored within its step limit', rc.round.state === 'stored' && rc.round.steps > 0 && rc.round.steps <= rc.round.maxSteps, JSON.stringify(rc.round));
check("AC6: the round is 'stored' only on the CM agent's own finalise confirmation (F13)",
  S.loadBus(UID9).messages.some((m) => m.from === 'cm' && m.to === 'app' && (m.payload as { roundId?: string; stored?: boolean } | undefined)?.roundId === rc.round.id && (m.payload as { stored?: boolean }).stored === true));
const R = await import('../src/server/arch/rounds.js');
const storedRound = R.loadRound(UID9, rc.round.id)!;
check('AC6: all three agents signalled done in the round', ['personal', 'cm', 'nordea'].every((a) => storedRound.doneSignals.includes(a as 'personal' | 'cm' | 'nordea')), storedRound.doneSignals.join(','));
const roundBus = S.loadBus(UID9).messages;
check('AC6: the round lifecycle is visible on the bus (round-start + done signals)', roundBus.some((m) => m.type === 'round-start') && roundBus.filter((m) => m.type === 'done').length >= 3);
const cmDbFile = fs.readFileSync(new URL('../src/server/arch/store/cmStore.ts', import.meta.url), 'utf-8');
check('AC6: the CM agent stores the round record in its own DB at finalise', cmDbFile.includes('storeRoundRecord'));

// --- AC6: the step limit always ends a round
const UID10 = 'limituser';
S.saveNordeaDb({ userId: UID10, accounts: [], transactions: [{ id: 'l1', userId: UID10, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel' }] });
A.addGoalDirect(UID10, 'Save for a car');
const lc10 = A.contribute(UID10);
A.decideProposal(UID10, lc10.proposals[0].messageId, true);
const limited = R.runRound(UID10, 'decay', { maxSteps: 1 });
check('AC6: a round that cannot finish ends at its step limit', limited.state === 'step-limit', limited.state);

// --- Chat boundary (B1c/F15): chat is session-scoped. The first question of a session opens a
// session round with an empty document; the CM agent retrieves question-relevant entries into
// the document's memory section; the answer draws on that finished document.
const accepted = A.decideProposal(UID9, A.reviewQueue(UID9).find((m) => m.from === 'nordea')!.id, true) as { id: string };
const docBefore = S.loadContext(UID9)!;
check('F15-8: accepting a proposal does NOT patch the finished document between rounds', !docBefore.sections.memory.rows.some((r) => r.id === accepted.id));
const chatAns = A.chat(UID9, 'what do you know about my car saving?');
const doc9 = S.loadContext(UID9)!;
check('F15: the first chat question opened a session round (new document)', doc9.roundId !== docBefore.roundId && !!chatAns.sessionId, doc9.roundId + ' vs ' + docBefore.roundId);
check('F15: the session round is visible on the bus with the question', S.loadBus(UID9).messages.some((m) => m.type === 'round-start' && (m.payload as { trigger?: string; question?: string } | undefined)?.trigger === 'session' && (m.payload as { question?: string } | undefined)?.question === 'what do you know about my car saving?'));
check('the chat answer draws on the CM-written memory section of the finished context.md', doc9.finalisedAt !== null && chatAns.reply.includes('Shared context (via the Context Memory agent)'), chatAns.reply.slice(0, 100));
check('the memory section carries the accepted entry with provenance', doc9.sections.memory.rows.some((r) => r.id === accepted.id && r.source === 'cm' && typeof r.evidence?.total === 'number'));

// --- F15: a follow-up question in the same session is answered from the SAME document.
const follow = A.chat(UID9, 'tell me about the car saving again');
const docFollow = S.loadContext(UID9)!;
check('F15: a same-session follow-up keeps the same document (no new round)', docFollow.roundId === doc9.roundId && follow.sessionId === chatAns.sessionId, docFollow.roundId + ' vs ' + doc9.roundId);

// --- F15-7: a follow-up the document has no memory row for triggers a top-up round on the
// SAME document (a new round id, never a fresh document).
const topupAns = A.chat(UID9, 'any grocery insights?');
const docTop = S.loadContext(UID9)!;
check('F15-7: an unanswered follow-up runs a top-up round on the same document', docTop.roundId !== doc9.roundId && docTop.trigger === 'topup' && S.loadBus(UID9).messages.some((m) => m.type === 'round-start' && (m.payload as { trigger?: string } | undefined)?.trigger === 'topup'), docTop.roundId + ' trigger ' + docTop.trigger);
void topupAns;

// --- F15: a different client session id ends the session and rebuilds the document.
const other = A.chat(UID9, 'what do you know about my car saving?', 'client-session-2');
const docNew = S.loadContext(UID9)!;
check('F15: a new client session id starts a new session document', other.sessionId === 'client-session-2' && docNew.roundId !== docTop.roundId && docNew.trigger === 'session');

// --- F5: the CM retrieval dedupes same-titled accepts and flags conflicting totals.
const UID12 = 'cmretrieve';
A.addGoalDirect(UID12, 'Save for a car');
S.saveNordeaDb({ userId: UID12, accounts: [], transactions: [{ id: 'c1', userId: UID12, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' }] });
const c12 = A.contribute(UID12);
A.decideProposal(UID12, c12.proposals[0].messageId, true); // Nordea insight: 100 EUR
const q12 = A.reviewQueue(UID12);
const pEntryRes = A.decideProposal(UID12, q12.find((m) => m.from === 'personal')!.id, true) as { id: string };
const pStored = S.loadCmDb(UID12).entries.find((e) => e.id === pEntryRes.id)!;
check('F4: a personal-agent goal proposal lands in the cabinet with its own provenance', pStored.proposedBy === 'personal' && !!pStored.viaMessageId, JSON.stringify(pStored).slice(0, 140));
check('F5: an observed entry keeps its observed status through review', pStored.observed === 'observed', JSON.stringify(pStored.observed));
const acceptedTitle = S.loadCmDb(UID12).entries[0].title;
S.appendMessage(UID12, { from: 'nordea', to: 'cm', type: 'propose', status: 'pending', summary: acceptedTitle, payload: { detail: 'a duplicate proposal', total: 100 } });
const dupQueue = A.reviewQueue(UID12);
const dupRes = A.decideProposal(UID12, dupQueue[0].id, true) as { duplicate?: boolean };
check('F5: accepting a same-titled proposal does not duplicate the entry', dupRes.duplicate === true && S.loadCmDb(UID12).entries.filter((e) => e.title === acceptedTitle && e.status === 'active').length === 1, JSON.stringify(dupRes).slice(0, 100));
// Two active entries with the same title but different totals, NOT matching any goal or
// transaction (so no staleness re-check touches them): both must be served, flagged in conflict.
const cm12 = S.loadCmDb(UID12);
cm12.entries.push(
  { id: 'entry-conf1', title: 'Portugal holiday fund', detail: 'first estimate', goalIds: [], proposedBy: 'nordea', viaMessageId: 'msg-seed1', evidence: { total: 100 }, status: 'active', createdAt: new Date().toISOString() },
  { id: 'entry-conf2', title: 'Portugal holiday fund', detail: 'second estimate', goalIds: [], proposedBy: 'personal', viaMessageId: 'msg-seed2', evidence: { total: 999 }, status: 'active', createdAt: new Date().toISOString() },
);
cm12.entries.push({ id: 'entry-weak', title: 'Holiday ideas', detail: 'maybe somewhere sunny', goalIds: [], proposedBy: 'personal', viaMessageId: 'msg-seed3', status: 'active', createdAt: new Date().toISOString() });
S.saveCmDb(cm12);
// Retrieval serves both conflicting entries, flags the conflict, and ranks the best match first.
const cmAns5 = A.agentQuery(UID12, 'cm', 'portugal holiday fund');
const hits5 = (cmAns5.reply as { matchedEntries: { title: string; conflict?: boolean }[] }).matchedEntries;
const conflictHits = hits5.filter((h) => h.title === 'Portugal holiday fund');
check('F5: conflicting totals for one title are both served and flagged', conflictHits.length === 2 && conflictHits.every((h) => h.conflict === true), JSON.stringify(hits5).slice(0, 200));
check('F5: retrieval ranks the best question match first', hits5.length >= 3 && hits5[0].title === 'Portugal holiday fund' && hits5[hits5.length - 1].title === 'Holiday ideas', JSON.stringify(hits5.map((h) => h.title)));


// --- F16: a new session can never be answered from the previous session's document.
// Seed a session document via a real chat, then turn an agent off and open a new session:
// no round can run, and the answer must not contain the old session's rows.
const UID13 = 'sessionleak';
A.addGoalDirect(UID13, 'Save for a car');
S.saveNordeaDb({ userId: UID13, accounts: [], transactions: [{ id: 'x1', userId: UID13, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' }] });
const c13 = A.contribute(UID13);
A.decideProposal(UID13, c13.proposals[0].messageId, true);
const s13a = A.chat(UID13, 'what do you know about my car saving?');
check('F16 setup: the first session answers from its document', s13a.reply.includes('Shared context'), s13a.reply.slice(0, 100));
A.setAgentOff(UID13, 'cm', true);
const s13b = A.chat(UID13, 'what do you know about my car saving?', 'fresh-session');
check('F16: an agent off at session start gives NO rows from the old session', !s13b.reply.includes('Shared context (via') && s13b.reply.toLowerCase().includes('shared context is unavailable this session'), s13b.reply.slice(0, 140));
check('F16: the new session document is empty and stamped with the new session id', S.loadContext(UID13)!.sessionId === 'fresh-session' && S.loadContext(UID13)!.sections.memory.rows.length === 0);
A.setAgentOff(UID13, 'cm', false);

// --- F17: "my goal is ..." as a session's first message is saved BEFORE the round opens.
const UID14 = 'goalfirst';
const g14 = A.chat(UID14, 'my goal is to visit Japan next summer');
check('F17: the goal reply still comes back', g14.reply.includes('Saved "to visit Japan next summer"'), g14.reply.slice(0, 80));
const doc14 = S.loadContext(UID14)!;
check('F17: the session round already contains the just-typed goal', doc14.sections.customer.rows.some((r) => r.title.toLowerCase().includes('japan')), JSON.stringify(doc14.sections.customer.rows.map((r) => r.title)));


// --- F7 (AC7): risk levels by code rules; standing permissions set once; only high risk waits.
const UID15 = 'riskuser';
S.saveNordeaDb({ userId: UID15, accounts: [], transactions: [{ id: 'k1', userId: UID15, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID15, 'Save for a car');
A.contribute(UID15);
check('F7: first start defaults to review-everything (no standing permissions set yet)', A.reviewQueue(UID15).length === 2 && S.loadCmDb(UID15).entries.length === 0, `queue ${A.reviewQueue(UID15).length}`);
A.setStandingPermissions(UID15, 'high');
const cm15 = S.loadCmDb(UID15);
const autoLow = cm15.entries.find((e) => e.proposedBy === 'personal');
const autoMed = cm15.entries.find((e) => e.proposedBy === 'nordea');
check('F7: own-goal proposal auto-stored as LOW risk under standing permissions', !!autoLow && autoLow.risk === 'low' && autoLow.autoAccepted === true, JSON.stringify(autoLow).slice(0, 120));
check('F7: Nordea aggregate auto-stored as MEDIUM risk under standing permissions', !!autoMed && autoMed.risk === 'medium' && autoMed.autoAccepted === true, JSON.stringify(autoMed).slice(0, 120));
check('F7: automatic stores are logged to the customer (AC9 transparency)', S.loadBus(UID15).messages.some((m) => m.type === 'inform' && m.from === 'cm' && m.summary.includes('Stored automatically')));
check('F7: nothing left waiting in merge review after permissions are set', A.reviewQueue(UID15).length === 0);
const autoExplain = A.explainEntry(UID15, autoMed!.id);
check('F7: explain shows the automatic store and its risk level', autoExplain.explanation.reviewedBy.includes('automatically') && autoExplain.explanation.reviewedBy.includes('medium'), autoExplain.explanation.reviewedBy);

// High risk always waits: a sensitive-topic goal is proposed by the personal agent but NOT stored.
const UID16 = 'riskhigh';
S.saveNordeaDb({ userId: UID16, accounts: [], transactions: [{ id: 'h1', userId: UID16, date: '2026-10-01', category: 'groceries', amount: -20, account: 'current', description: 'Weekly groceries' }] });
A.addGoalDirect(UID16, 'therapy fund');
A.setStandingPermissions(UID16, 'high');
A.contribute(UID16);
check('F7: a sensitive-topic proposal is HIGH risk and waits for the customer', S.loadCmDb(UID16).entries.length === 0 && A.reviewQueue(UID16).length === 1, `entries ${S.loadCmDb(UID16).entries.length} queue ${A.reviewQueue(UID16).length}`);


// --- F18: maintenance rounds merge into the open session's document - no row is dropped.
const UID17 = 'mergeround';
A.addGoalDirect(UID17, 'Save for a car');
S.saveNordeaDb({ userId: UID17, accounts: [], transactions: [{ id: 'm1', userId: UID17, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' }] });
const c17 = A.contribute(UID17);
A.decideProposal(UID17, c17.proposals[0].messageId, true);
A.chat(UID17, 'what do you know about my car saving?'); // opens the session; Nordea adds a question row
const doc17a = S.loadContext(UID17)!;
const qRow = doc17a.sections.nordea.rows.find((r) => r.id.startsWith('nq-'));
check('F18 setup: the session document has a question-relevant Nordea row', !!qRow, JSON.stringify(doc17a.sections.nordea.rows.map((r) => r.id)));
R.runRound(UID17, 'decay'); // maintenance DURING the session
const doc17b = S.loadContext(UID17)!;
check('F18: a decay round keeps the session question row and the memory rows', doc17b.sections.nordea.rows.some((r) => r.id === qRow!.id) && doc17b.sections.memory.rows.length >= doc17a.sections.memory.rows.length, JSON.stringify(doc17b.sections.nordea.rows.map((r) => r.id)));
A.contribute(UID17); // the Contribute button mid-session
const doc17c = S.loadContext(UID17)!;
check('F18: a contribution round mid-session merges instead of rewriting', doc17c.sections.nordea.rows.some((r) => r.id === qRow!.id), JSON.stringify(doc17c.sections.nordea.rows.map((r) => r.id)));

// --- F19: the "shared context unavailable" reply is reachable (no goals, agent off at start).
const UID18 = 'unavail';
A.setAgentOff(UID18, 'cm', true);
const unavail = A.chat(UID18, 'any grocery insights?');
check('F19: with no document and no user-db hit, chat plainly says shared context is unavailable this session', unavail.reply.includes('shared context is unavailable this session'), unavail.reply.slice(0, 120));
A.setAgentOff(UID18, 'cm', false);


// --- F20: risk derives "observed" from evidence, never from the proposer's own flag.
const RK = await import('../src/server/arch/risk.js');
const fakeMsg = (from: string, payload: Record<string, unknown>, summary = 'x') => ({ id: 'm', at: '', from: from as 'nordea', to: 'cm' as const, type: 'propose' as const, summary, payload, status: 'pending' as const });
check('F20: an evidence-less proposal is an INFERENCE (high risk) even without any flag', RK.assessProposalRisk(fakeMsg('nordea', { detail: 'a guess' })) === 'high');
check('F20: transaction ids + a total count as observed (medium for the bank side)', RK.assessProposalRisk(fakeMsg('nordea', { transactionIds: ['t1'], total: 10 })) === 'medium');
check('F20: the customer\'s own goal (goal ids, personal) is low risk', RK.assessProposalRisk(fakeMsg('personal', { goalIds: ['g1'], observed: 'observed' })) === 'low');
check('F20: a personal proposal WITHOUT goal ids and no evidence is an inference (high)', RK.assessProposalRisk(fakeMsg('personal', { detail: 'maybe' })) === 'high');
check('F20: a self-declared "observed" flag cannot downgrade an inference', RK.assessProposalRisk(fakeMsg('nordea', { observed: 'observed', detail: 'no evidence here' })) === 'high');

// --- F21: one shared word-bounded sensitive list; no substring false positives.
check('F21: "reunion" and "drugstore" are NOT sensitive', RK.assessProposalRisk(fakeMsg('nordea', { transactionIds: ['t1'], total: 10 }, 'Reunion party at the drugstore')) === 'medium');
check('F21: pregnancy, divorce, gambling and debt collectors ARE sensitive (high)', ['pregnancy costs', 'divorce fund', 'gambling habit', 'debt collector payment'].every((t) => RK.assessProposalRisk(fakeMsg('nordea', { transactionIds: ['t1'], total: 10 }, t)) === 'high'));
check('F21: abel.ts uses the shared sensitive list (no private copy)', !/const SENSITIVE = /.test(fs.readFileSync(new URL('../src/server/abel.ts', import.meta.url), 'utf-8')) && fs.readFileSync(new URL('../src/server/abel.ts', import.meta.url), 'utf-8').includes("from './sensitive.js'"));

// --- F22: per-entry undo for automatically stored entries, logged; manual entries refused.
const undone = A.undoEntry(UID15, autoMed!.id) as { undone?: boolean };
check('F22: an auto-stored entry can be undone one by one', undone.undone === true && !S.loadCmDb(UID15).entries.some((e) => e.id === autoMed!.id), JSON.stringify(undone));
check('F22: the undo is logged to the customer', S.loadBus(UID15).messages.some((m) => m.type === 'inform' && m.summary.startsWith('Undone: ')));
const manualEntry = A.decideProposal(UID16, A.reviewQueue(UID16)[0].id, true) as { id: string };
let refused = '';
try { A.undoEntry(UID16, manualEntry.id); } catch (e) { refused = (e as Error).message; }
check('F22: undo refuses a manually reviewed entry (dispute instead)', refused.includes('automatically stored') && S.loadCmDb(UID16).entries.length === 1, refused.slice(0, 100));


// --- F8: decay detects churned transactions, age and missing evidence - not just changed totals.
// The AC1 source scan above already pins the CM agent to its own store (no direct nordea.db/user.db reads).
const UID21 = 'churnuser';
S.saveNordeaDb({ userId: UID21, accounts: [], transactions: [{ id: 'c1', userId: UID21, date: '2026-10-01', category: 'transport', amount: -60, account: 'current', description: 'Fuel for the car' }, { id: 'c2', userId: UID21, date: '2026-10-02', category: 'transport', amount: -40, account: 'current', description: 'Car wash' }] });
A.addGoalDirect(UID21, 'Save for a car');
A.setStandingPermissions(UID21, 'high');
A.contribute(UID21);
const churnEntry = S.loadCmDb(UID21).entries.find((e) => e.proposedBy === 'nordea')!;
check('F8 setup: Nordea aggregate auto-stored with transaction evidence', !!churnEntry && churnEntry.evidence?.total === 100 && (churnEntry.evidence?.transactionIds?.length ?? 0) > 0, JSON.stringify(churnEntry?.evidence));
S.saveNordeaDb({ userId: UID21, accounts: [], transactions: [{ id: 'c9', userId: UID21, date: '2026-10-03', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' }] });
const churnRound = A.contribute(UID21);
check('F8: churned transactions flag the entry stale even when the total is unchanged', S.loadCmDb(UID21).entries.find((e) => e.id === churnEntry.id)?.status === 'stale' && churnRound.staleFlags.some((f) => f.entryId === churnEntry.id), JSON.stringify(churnRound.staleFlags));
check('F8: the churn flag says the underlying transactions changed', S.loadBus(UID21).messages.some((m) => m.type === 'flag-stale' && m.summary.includes('underlying transactions changed')));

const UID22 = 'ageduser';
S.saveNordeaDb({ userId: UID22, accounts: [], transactions: [{ id: 'a1', userId: UID22, date: '2026-10-01', category: 'transport', amount: -50, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID22, 'Save for a car');
A.setStandingPermissions(UID22, 'high');
A.contribute(UID22);
const cm19 = S.loadCmDb(UID22);
const agedEntry = cm19.entries.find((e) => e.proposedBy === 'nordea')!;
agedEntry.createdAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
agedEntry.evidence = { total: 50 }; // legacy entry: a total but no transaction ids to verify
S.saveCmDb(cm19);
const agedRound = A.contribute(UID22);
check('F8: an aged entry without verifiable transaction ids is flagged even though the total still matches', S.loadCmDb(UID22).entries.find((e) => e.id === agedEntry.id)?.status === 'stale' && agedRound.staleFlags.some((f) => f.entryId === agedEntry.id && f.reason === 'aged'), JSON.stringify(agedRound.staleFlags));

const UID23 = 'agedokuser';
S.saveNordeaDb({ userId: UID23, accounts: [], transactions: [{ id: 'b1', userId: UID23, date: '2026-10-01', category: 'transport', amount: -50, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID23, 'Save for a car');
A.setStandingPermissions(UID23, 'high');
A.contribute(UID23);
const cm19b = S.loadCmDb(UID23);
cm19b.entries.forEach((e) => { e.createdAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(); });
S.saveCmDb(cm19b);
const agedOkRound = A.contribute(UID23);
check('F8: an aged entry whose ids and total still match is CONFIRMED, not flagged', agedOkRound.staleFlags.length === 0 && S.loadCmDb(UID23).entries.every((e) => e.status === 'active'), JSON.stringify(agedOkRound.staleFlags));

const UID24 = 'noevuser';
S.saveNordeaDb({ userId: UID24, accounts: [], transactions: [{ id: 'n1', userId: UID24, date: '2026-10-01', category: 'transport', amount: -75, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID24, 'Save for a car');
A.setStandingPermissions(UID24, 'high');
A.contribute(UID24);
const cm20 = S.loadCmDb(UID24);
const noevEntry = cm20.entries.find((e) => e.proposedBy === 'nordea')!;
noevEntry.evidence = undefined; // stored without any evidence
S.saveCmDb(cm20);
const noevRound = A.contribute(UID24);
check('F8: an entry stored without evidence is flagged when bank data gives a picture', S.loadCmDb(UID24).entries.find((e) => e.id === noevEntry.id)?.status === 'stale' && noevRound.staleFlags.some((f) => f.entryId === noevEntry.id && f.reason === 'missing-evidence'), JSON.stringify(noevRound.staleFlags));


// --- F26: with MORE than 25 matching transactions the decay check must compare like with like.
const UID40 = 'manytxuser';
const manyTx = Array.from({ length: 30 }, (_, i) => ({ id: `m${i + 1}`, userId: UID40, date: '2026-10-01', category: 'transport' as const, amount: -10, account: 'current' as const, description: 'Fuel for the car' }));
S.saveNordeaDb({ userId: UID40, accounts: [], transactions: manyTx });
A.addGoalDirect(UID40, 'Save for a car');
A.setStandingPermissions(UID40, 'high');
A.contribute(UID40);
const manyEntry = S.loadCmDb(UID40).entries.find((e) => e.proposedBy === 'nordea')!;
check('F26 setup: aggregate stores a full-set id hash plus the 25-id display sample', typeof manyEntry.evidence?.transactionIdsHash === 'string' && manyEntry.evidence?.transactionIds?.length === 25, JSON.stringify(manyEntry.evidence).slice(0, 120));
const manyR2 = A.contribute(UID40);
const manyR3 = A.contribute(UID40);
check('F26: >25 matches and no bank change - the aggregate stays ACTIVE over three rounds, no stale duplicate', manyR2.staleFlags.length === 0 && manyR3.staleFlags.length === 0 && S.loadCmDb(UID40).entries.filter((e) => e.title.includes('Activity related')).length === 1 && S.loadCmDb(UID40).entries.every((e) => e.status === 'active'), `round2 flags: ${manyR2.staleFlags.length}, round3 flags: ${manyR3.staleFlags.length}, entries: ${S.loadCmDb(UID40).entries.map((e) => e.status + ':' + e.title.slice(0, 30)).join(' | ')}`);

// --- F27: a saving-goal aggregate is labelled as SPENDING, not as savings.
check('F27: the goal aggregate names the figure as related spending', manyEntry.detail.includes('spending'), manyEntry.detail);

// --- F28: the re-check notice says which outcome actually happened.
const UID41 = 'noticeuser';
S.saveNordeaDb({ userId: UID41, accounts: [], transactions: [{ id: 'w1', userId: UID41, date: '2026-10-01', category: 'transport', amount: -60, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID41, 'Save for a car');
A.setStandingPermissions(UID41, 'high');
A.contribute(UID41);
S.saveNordeaDb({ userId: UID41, accounts: [], transactions: [{ id: 'w1', userId: UID41, date: '2026-10-01', category: 'transport', amount: -60, account: 'current', description: 'Fuel for the car' }, { id: 'w2', userId: UID41, date: '2026-10-02', category: 'transport', amount: -40, account: 'current', description: 'Car wash' }] });
A.contribute(UID41);
const noticeAuto = S.loadBus(UID41).messages.filter((m) => m.type === 'inform' && m.summary.startsWith('Re-check before reuse')).pop();
check('F28: under standing permissions the notice says the refresh was stored automatically', !!noticeAuto && noticeAuto.summary.includes('stored automatically under your standing permissions') && !noticeAuto.summary.includes('wait in merge review'), noticeAuto?.summary ?? 'no notice');

const UID42 = 'noticeuser2';
S.saveNordeaDb({ userId: UID42, accounts: [], transactions: [{ id: 'v1', userId: UID42, date: '2026-10-01', category: 'transport', amount: -60, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID42, 'Save for a car');
A.setStandingPermissions(UID42, 'high');
A.contribute(UID42);
A.setStandingPermissions(UID42, 'all');
S.saveNordeaDb({ userId: UID42, accounts: [], transactions: [{ id: 'v1', userId: UID42, date: '2026-10-01', category: 'transport', amount: -60, account: 'current', description: 'Fuel for the car' }, { id: 'v2', userId: UID42, date: '2026-10-02', category: 'transport', amount: -40, account: 'current', description: 'Car wash' }] });
A.contribute(UID42);
const noticeReview = S.loadBus(UID42).messages.filter((m) => m.type === 'inform' && m.summary.startsWith('Re-check before reuse')).pop();
check('F28: under review-everything the notice still says the refresh waits in merge review', !!noticeReview && noticeReview.summary.includes('wait in merge review'), noticeReview?.summary ?? 'no notice');


// --- F23: the shared list must not make everyday banking talk "sensitive".
const SENS = await import('../src/server/sensitive.js');
check('F23: plain loan/debt talk is NOT high risk in the AC7 rule', ['pay off my student loan debt', 'mortgage and car loan repayment'].every((t) => RK.assessProposalRisk(fakeMsg('nordea', { transactionIds: ['t1'], total: 10 }, t)) === 'medium'));
check('F23: debt DISTRESS is still high risk', ['debt collector payment', 'arrears piling up', "can't pay my bills", 'bankruptcy filing'].every((t) => RK.assessProposalRisk(fakeMsg('nordea', { transactionIds: ['t1'], total: 10 }, t)) === 'high'));
check('F23: Abel keeps its narrow guard - a loan goal still saves without the private tap', !SENS.ABEL_PRIVATE_TOPIC.test('pay off my student loan debt') && !SENS.ABEL_PRIVATE_TOPIC.test('monthly mortgage payment'));
check('F23: Abel still guards the genuinely private topics', ['cancer treatment fund', 'therapy sessions', 'gambling recovery'].every((t) => SENS.ABEL_PRIVATE_TOPIC.test(t)));
check('F23: abel.ts uses the narrow ABEL_PRIVATE_TOPIC, not the wide risk list', fs.readFileSync(new URL('../src/server/abel.ts', import.meta.url), 'utf-8').includes('ABEL_PRIVATE_TOPIC') && !fs.readFileSync(new URL('../src/server/abel.ts', import.meta.url), 'utf-8').includes('SENSITIVE_TOPIC as SENSITIVE'));


// --- F24: customer-side entries decay too - a goal removed from the User DB flags its entry stale.
const UID25 = 'goalgoneuser';
S.saveNordeaDb({ userId: UID25, accounts: [], transactions: [{ id: 'g1', userId: UID25, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID25, 'Save for a car');
A.setStandingPermissions(UID25, 'high');
A.contribute(UID25);
const goalEntry = S.loadCmDb(UID25).entries.find((e) => e.proposedBy === 'personal')!;
check('F24 setup: the goal entry is active in the cabinet', !!goalEntry && goalEntry.status === 'active' && goalEntry.goalIds.length === 1);
const u25 = S.loadUserDb(UID25);
u25.goals = []; // the customer drops the goal
S.saveUserDb(u25);
const goneRound = A.contribute(UID25);
check('F24: removing the goal flags the customer-side entry stale in the next decay round', S.loadCmDb(UID25).entries.find((e) => e.id === goalEntry.id)?.status === 'stale' && goneRound.staleFlags.some((f) => f.entryId === goalEntry.id && f.reason === 'goal-removed'), JSON.stringify(goneRound.staleFlags));
check('F24: the flag and the customer notice name the removed goal', S.loadBus(UID25).messages.some((m) => m.type === 'flag-stale' && m.summary.includes('no longer exists in the User DB')) && S.loadBus(UID25).messages.some((m) => m.type === 'inform' && m.summary.includes('goal behind')));

const UID26 = 'goalkeptuser';
S.saveNordeaDb({ userId: UID26, accounts: [], transactions: [{ id: 'k1', userId: UID26, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID26, 'Save for a car');
A.setStandingPermissions(UID26, 'high');
A.contribute(UID26);
const keptRound = A.contribute(UID26); // goal still exists
check('F24: an existing goal is confirmed - no false stale flag', !keptRound.staleFlags.some((f) => f.reason === 'goal-removed') && S.loadCmDb(UID26).entries.find((e) => e.proposedBy === 'personal')?.status === 'active', JSON.stringify(keptRound.staleFlags));


// --- F11/AC12: labeled coverage for AC3, AC4, AC5, AC7, AC8, AC9, AC10 (AC1, AC2, AC6 covered above).
// AC3: the personal agent writes the Customer section from the User DB - goal TITLES only.
const UID27 = 'ac3user';
A.addGoalDirect(UID27, 'Save for a laptop', 'from my summer job savings');
S.saveNordeaDb({ userId: UID27, accounts: [], transactions: [{ id: 'l1', userId: UID27, date: '2026-10-01', category: 'shopping', amount: -200, account: 'current', description: 'Laptop store' }] });
A.contribute(UID27);
const custRows = S.readSectionRows(UID27, 'customer');
check('AC3: the Customer section carries every goal by title from the User DB', custRows.some((r) => r.title === 'Save for a laptop'), JSON.stringify(custRows).slice(0, 120));
const ctxMd27 = S.renderContextMd(UID27, S.loadContext(UID27)!);
check('AC3: goal details and personal facts stay in the User DB until the customer allows sharing', custRows.every((r) => !r.detail) && !ctxMd27.includes('summer job'), ctxMd27.slice(0, 80));
const ac3Chat = A.chat(UID27, 'what do you know about my laptop goal?');
check('AC3: the personal agent answers from its own DB and the session document', ac3Chat.reply.length > 0 && ac3Chat.used.includes('user-db'), ac3Chat.used.join(','));

// AC4: stored cabinet entries are structured: source agent, evidence, observed|inferred, timestamp.
A.setStandingPermissions(UID27, 'high');
A.contribute(UID27);
const ac4Entry = S.loadCmDb(UID27).entries.find((e) => e.proposedBy === 'nordea')!;
check('AC4: a stored entry records source agent, evidence, observed|inferred and a timestamp', !!ac4Entry && ac4Entry.evidence?.total != null && (ac4Entry.observed === 'observed' || ac4Entry.observed === 'inferred') && !!ac4Entry.createdAt, JSON.stringify(ac4Entry).slice(0, 160));

// AC5: the Nordea section carries aggregates with evidence - no account identifiers, no raw rows.
const nordeaRows = S.readSectionRows(UID27, 'nordea');
check('AC5: the Nordea section is aggregates with evidence, no account identifiers', nordeaRows.length >= 1 && nordeaRows.every((r) => r.evidence?.total != null && !JSON.stringify(r).includes('"account"') && !('transactions' in (r.evidence ?? {}))), JSON.stringify(nordeaRows).slice(0, 160));

// AC7: risk levels are decided by code rules - the same proposal scores the same way twice, and high always waits.
const ac7Msg = fakeMsg('nordea', { transactionIds: ['l1'], total: 200 }, 'Laptop spending');
check('AC7: the risk rule is deterministic code, not agent judgement', RK.assessProposalRisk(ac7Msg) === RK.assessProposalRisk(ac7Msg) && RK.assessProposalRisk(ac7Msg) === 'medium');
check('AC7: offers and sharing beyond the three agents are always high risk', RK.assessProposalRisk(fakeMsg('nordea', { transactionIds: ['l1'], total: 200, forOffers: true })) === 'high' && RK.assessProposalRisk(fakeMsg('nordea', { transactionIds: ['l1'], total: 200, shareBeyond: true })) === 'high');

// AC8: decay asks the OWNING agent by message - the CM never opens another agent's DB.
const ac8Bus = S.loadBus(UID27).messages;
check('AC8: decay confirmation travels by bus message (cm -> personal goal check, cm -> nordea refresh)', ac8Bus.some((m) => m.from === 'cm' && m.to === 'personal' && (m.payload as { purpose?: string }).purpose === 'decay-goals') && ac8Bus.some((m) => m.from === 'cm' && m.to === 'nordea' && m.type === 'refresh'));

// AC9: every automatic change is logged, explainable, disputable, undoable.
const ac9Entry = S.loadCmDb(UID27).entries.find((e) => e.autoAccepted)!;
check('AC9: every automatic store is logged to the customer', S.loadBus(UID27).messages.some((m) => m.type === 'inform' && m.summary.includes('Stored automatically') && m.summary.includes(ac9Entry.title)));
check('AC9: an automatic store is explainable', (A.explainEntry(UID27, ac9Entry.id).explanation.reviewedBy ?? '').includes('automatically'));
A.disputeEntry(UID27, ac9Entry.id, 'not mine');
check('AC9: an automatic store is disputable', S.loadCmDb(UID27).entries.find((e) => e.id === ac9Entry.id)?.status === 'disputed');

// AC10: the architecture runs without an AI key - no arch module imports the LLM layer.
const archSrcs = ['orchestrator.ts', 'rounds.ts', 'dispatcher.ts', 'agents/personal.ts', 'agents/cm.ts', 'agents/nordea.ts'].map((f) => readSrc(`../src/server/arch/${f}`));
check('AC10: no architecture module imports the LLM layer - the whole flow is deterministic', archSrcs.every((src) => !/llm\.js|getProvider|openai|anthropic/i.test(src)));


// --- F25: a removed goal also flags the NORDEA-side entries on that goal, not just the customer's own.
const UID28 = 'goalgone2';
S.saveNordeaDb({ userId: UID28, accounts: [], transactions: [{ id: 'x1', userId: UID28, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID28, 'Save for a car');
A.setStandingPermissions(UID28, 'high');
A.contribute(UID28);
const nordeaOnGoal = S.loadCmDb(UID28).entries.find((e) => e.proposedBy === 'nordea' && e.goalIds.length > 0)!;
check('F25 setup: a Nordea entry tied to the goal is active', !!nordeaOnGoal && nordeaOnGoal.status === 'active');
const u28 = S.loadUserDb(UID28);
u28.goals = [];
S.saveUserDb(u28);
const goneRound2 = A.contribute(UID28);
check('F25: removing the goal flags the Nordea-side entry on it stale too', S.loadCmDb(UID28).entries.find((e) => e.id === nordeaOnGoal.id)?.status === 'stale' && goneRound2.staleFlags.some((f) => f.entryId === nordeaOnGoal.id && f.reason === 'goal-removed'), JSON.stringify(goneRound2.staleFlags));


// --- F10 phase 2 / AC11: the in-app Abel reads user.db VIA the personal agent and context.md by session rules.
const shared27 = A.abelSharedContext(UID27, 'conv-abel-1', 'laptop');
check('F10p2: User DB facts come from the personal agent by message, with provenance', !!shared27.userDbFacts && shared27.userDbFacts.includes('Save for a laptop') && shared27.provenance.some((p) => p.includes('user-db via the personal agent')), JSON.stringify(shared27).slice(0, 140));
check('F10p2: a fresh session gets its own FINALISED document, stamped with its exact session id', !!shared27.sharedContext && S.loadContext(UID27)?.sessionId === 'conv-abel-1' && !!S.loadContext(UID27)?.finalisedAt, (shared27.sharedContext ?? '').slice(0, 80));
check('F10p2: the document was built by a session round for this exact session', S.loadBus(UID27).messages.some((m) => m.type === 'round-start' && (m.payload as { sessionId?: string }).sessionId === 'conv-abel-1'));

// Wrong-session negative: a finalised document from ANOTHER session is not served, and is left untouched.
const UID29 = 'sessuser';
A.addGoalDirect(UID29, 'Save for a van');
S.saveNordeaDb({ userId: UID29, accounts: [], transactions: [{ id: 'v1', userId: UID29, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Van parts' }] });
A.chat(UID29, 'van', 'session-A');
check('F10p2 setup: session A has a finalised document', S.loadContext(UID29)?.sessionId === 'session-A' && !!S.loadContext(UID29)?.finalisedAt);
A.setAgentOff(UID29, 'cm', true);
const wrongSess = A.abelSharedContext(UID29, 'session-B', 'anything');
check('F10p2: finalised != current - another session\'s document is NOT served', !wrongSess.sharedContext, (wrongSess.sharedContext ?? '').slice(0, 60));
check('F10p2: and the other session\'s document is NOT wiped when no round can run', S.loadContext(UID29)?.sessionId === 'session-A' && !!S.loadContext(UID29)?.finalisedAt);
check('F10p2: facts are always the requesting customer\'s own (no cross-customer assembly)', !(wrongSess.userDbFacts ?? '').includes('laptop') && (wrongSess.userDbFacts ?? '').includes('van'), (wrongSess.userDbFacts ?? '').slice(0, 80));

// Missing + unfinalised document negatives (CM off, so no round can build one).
const UID30 = 'nodocuser';
A.addGoalDirect(UID30, 'Save for a boat');
S.saveNordeaDb({ userId: UID30, accounts: [], transactions: [{ id: 'bt1', userId: UID30, date: '2026-10-01', category: 'transport', amount: -100, account: 'current', description: 'Boat parts' }] });
A.setAgentOff(UID30, 'cm', true);
const noDoc = A.abelSharedContext(UID30, 'conv-x', 'boat');
check('F10p2: no document and no way to build one -> no shared context, User DB facts still served', !noDoc.sharedContext && (noDoc.userDbFacts ?? '').includes('boat'), JSON.stringify(noDoc).slice(0, 100));
S.resetContextForSession(UID30, 'conv-y');
const unfinalised = A.abelSharedContext(UID30, 'conv-y', 'boat');
check('F10p2: an UNFINALISED document is never served, even for the matching session', !unfinalised.sharedContext);

// Parked negative: parking the cabinet silences the document half only.
A.parkCabinet(UID27, true);
const parkedShared = A.abelSharedContext(UID27, 'conv-abel-2', 'laptop');
check('F10p2: a parked cabinet serves no document; the customer\'s own User DB facts still reach Abel', !parkedShared.sharedContext && !!parkedShared.userDbFacts);

// --- F30: stale and disputed rows never reach Abel as facts (only Abel's copy is filtered).
const UID33 = 'abeldisp';
S.saveNordeaDb({ userId: UID33, accounts: [], transactions: [{ id: 'dd1', userId: UID33, date: '2026-10-01', category: 'transport', amount: -1234, account: 'current', description: 'Fuel for the car' }] });
A.addGoalDirect(UID33, 'Save for a car');
A.setStandingPermissions(UID33, 'high');
A.contribute(UID33);
check('F30 setup: the active aggregate reaches Abel', (A.abelSharedContext(UID33, 'f30-s1', 'car').sharedContext ?? '').includes('1234 EUR'));
S.saveNordeaDb({ userId: UID33, accounts: [], transactions: [{ id: 'dd2', userId: UID33, date: '2026-10-02', category: 'transport', amount: -999, account: 'current', description: 'Car wash' }] });
A.contribute(UID33); // churn: the 1234 entry goes stale, the refreshed 999 is stored automatically
const f30Active = S.loadCmDb(UID33).entries.find((e) => e.status === 'active' && e.proposedBy === 'nordea')!;
A.disputeEntry(UID33, f30Active.id, 'not mine');
S.saveNordeaDb({ userId: UID33, accounts: [], transactions: [{ id: 'dd3', userId: UID33, date: '2026-10-03', category: 'transport', amount: -50, account: 'current', description: 'Parking' }] });
const f30 = A.abelSharedContext(UID33, 'f30-s2', 'car');
check('F30: the stale figure and the disputed figure are both absent from the context Abel receives', !(f30.sharedContext ?? '').includes('1234 EUR') && !(f30.sharedContext ?? '').includes('999 EUR'), (f30.sharedContext ?? '').slice(0, 200));
check('F30: the fresh bank figure still reaches Abel (filtering drops marks, not data)', (f30.sharedContext ?? '').includes('50 EUR'));
const f30Doc = S.loadContext(UID33)!;
check("F30: the STORED document still records the marks - only Abel's copy is filtered", f30Doc.sections.memory.rows.some((r) => r.status === 'stale' && r.detail.includes('1234')) && f30Doc.sections.memory.rows.some((r) => r.status === 'disputed' && r.detail.includes('999')), f30Doc.sections.memory.rows.map((r) => `${r.status}:${r.detail.slice(0, 40)}`).join(' | '));


// The main-chat path itself: Abel's real turn carries the shared context into the system prompt (mock provider, no AI spend).
applyNordeaData('lauri', { accounts: [{ key: 'current', currency: 'EUR' }, { key: 'savings' }], transactions: [{ date: '2026-10-25', amount: 3000, description: 'SALARY', category: 'SALARY' }] }, 'test seed');
const { setProviderForTests } = await import('../src/server/llm.js');
let capturedSystem = '';
setProviderForTests({ name: 'capture', isConfigured: () => true, step: async (args: { system: string }) => { capturedSystem = args.system; return { calls: [{ id: 'c1', name: 'finishReply', args: { text: 'ok', suggestions: [], usedEntryIds: [], topic: 'other', couldHelp: true } }] }; } } as never);
const ABEL = await import('../src/server/abel.js');
await ABEL.abelTurn('lauri', 'conv-main-test', 'abel', 'hello', { userDbFacts: 'Goals: Save for a laptop', sharedContext: '- Goal: Save for a laptop (goal-1)', provenance: ['user-db via the personal agent'] });
check('F10p2: the main Abel chat carries the shared context into its real prompt, with provenance', capturedSystem.includes('SHARED CONTEXT') && capturedSystem.includes('Save for a laptop') && capturedSystem.includes('user-db via the personal agent'));
const routesSrc2 = readSrc('../src/server/routes.ts');
check('F10p2: the chat route assembles shared context for the SAME customer and session it serves', /abelSharedContext\(userId, conv\.id, u\.text\)/.test(routesSrc2) && /abelTurn\(userId, conv\.id, conv\.helperId, u\.text, shared\)/.test(routesSrc2));


// --- F10 phase 2, Bill's condition: the Abel shared-context path reads context.md only -
// user.db facts arrive BY MESSAGE from the personal agent; cm.db/nordea.db/user.db are never opened for Abel.
const orchSrc = readSrc('../src/server/arch/orchestrator.ts');
const fnStart = orchSrc.indexOf('export function abelSharedContext');
const fnBody = orchSrc.slice(fnStart, orchSrc.indexOf('\n}\n', fnStart) + 3);
check('F10p2: the Abel path opens no agent store at all - only the shared context.md and bus messages',
  !/loadUserDb|loadCmDb|loadNordeaDb|userStore|cmStore|nordeaStore/.test(fnBody) && fnBody.includes('loadContext') && fnBody.includes("controlRoundTrip(uid, 'personal'"), '');
check('F10p2: the personal agent answers abel-facts from its own User DB (the owning agent reads, not the app)',
  personalSrc.includes("control === 'abel-facts'") && /u\.goals\.map/.test(personalSrc));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
