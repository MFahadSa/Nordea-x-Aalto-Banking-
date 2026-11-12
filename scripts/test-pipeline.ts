/**
 * v20: the input pipeline (signals -> usefulness/privacy filter -> customer decides -> cabinet).
 * Temporary data folder, bundled demo customers, the mock model (its judgeSignals answer stands in
 * for a real model's), and the rule check with the model switched off.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-'));
process.env.CABINET_DATA_DIR = DIR;
delete process.env.SUPABASE_URL;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 400)}`); }
}

const { setProvider } = await import('../src/server/llm.js');
const { mockProvider } = await import('../src/server/llmMock.js');
setProvider(mockProvider);
const { db } = await import('../src/server/db.js');
await db.init();
const E = await import('../src/server/pipeline/engine.js');
const S = await import('../src/server/pipeline/store.js');

// --- glasses: five signals, the AI filter decides, code enforces privacy
const g = await E.ingest('lauri', 'glasses', { label: 'Walk in Kalasatama', signals: [
  { kind: 'seen', text: 'Viewing a 2-room flat in Kalasatama' },
  { kind: 'seen', text: 'Cafe menu, cappuccino 4.50' },
  { kind: 'heard', text: 'Mia: my doctor appointment is on Friday' },
  { kind: 'seen', text: 'Bus stop sign, line 55' },
  { kind: 'heard', text: 'Lauri: my payslip says salary 3 900 now' },
] });
check('glasses: 5 heard, judged by the AI filter', g.run.heard === 5 && g.run.aiJudged === true, g.run);
check('glasses: café and bus stop dropped', g.run.dropped === 2, g.run);
check('glasses: the doctor appointment is private', g.candidates.some((c) => c.filter === 'private' && /doctor/i.test(c.title)), g.candidates);
check('glasses: the flat viewing is kept with its reason', g.candidates.some((c) => /Kalasatama/.test(c.title) && c.filter === 'kept' && /flat/.test(c.reason)), g.candidates);
const stored = fs.readFileSync(path.join(DIR, 'pipeline.json'), 'utf-8');
check('dropped signals are never written (only counted)', !/cappuccino|line 55/i.test(stored));
check('the presenter memory has them (this server only)', S.droppedFor(g.run.id).length === 2);

// --- the model invents a number: the filter keeps the customer's words instead
const { setProvider: set2 } = await import('../src/server/llm.js');
set2({ ...mockProvider, async step() { return { calls: [{ id: 'x', name: 'judgeSignals', args: { items: [{ n: 1, decision: 'keep', reason: 'touches the flat goal', type: 'fact', title: 'Flat costs 410 000 €', detail: 'Price 410 000 €' }] } }] }; } });
const inv = await E.ingest('lauri', 'glasses', { signals: [{ text: 'Viewing a nice flat near the metro' }] });
check('no invented numbers: a figure not in the signal is replaced by the signal', !/410/.test(inv.candidates[0]?.title + inv.candidates[0]?.detail), inv.candidates);

// --- the model says keep for a health topic: the code floor makes it private
set2({ ...mockProvider, async step() { return { calls: [{ id: 'y', name: 'judgeSignals', args: { items: [{ n: 1, decision: 'keep', reason: 'useful', type: 'fact', title: 'Surgery costs', detail: 'Knee surgery next month' }] } }] }; } });
const sens = await E.ingest('lauri', 'whatsapp', { text: 'Mia: knee surgery next month, costs to sort' });
check('code floor: a sensitive topic is private whatever the model said', sens.candidates[0]?.filter === 'private', sens.candidates);

// --- no model at all: the rule check decides, and says so
set2({ ...mockProvider, async step() { throw new Error('offline'); } });
const off = await E.ingest('lauri', 'cloud', { signals: [{ text: 'Calendar: flat viewing Saturday' }, { text: 'Calendar: dentist' }, { text: 'Note: buy milk' }] });
check('without AI: rule check, marked as such', off.run.aiJudged === false && off.candidates.every((c) => /rule/.test(c.reason)), off);
check('without AI: health still private, milk dropped', off.candidates.some((c) => c.filter === 'private') && off.run.dropped >= 1, off.run);
set2(mockProvider);

// --- the customer decides
const flat = g.candidates.find((c) => /Kalasatama/.test(c.title))!;
const doc = g.candidates.find((c) => c.filter === 'private')!;
const saved = E.decide(flat.id, 'save', 'lauri');
const e1 = db.getCabinetEntry(saved.entryId!);
check('save: in the cabinet, source glasses, readable by Abel and (for a shared case) the adviser', !!e1 && e1.provenance.channel === 'glasses' && e1.readableBy.abel && e1.readableBy.adviser === true && e1.reviewed === true, e1);
const priv = E.decide(doc.id, 'private', 'lauri');
const e2 = db.getCabinetEntry(priv.entryId!);
check('keep private: saved, never for the adviser or offers', !!e2 && e2.private && e2.readableBy.adviser === false && e2.readableBy.offers === false, e2);
let twice = '';
try { E.decide(doc.id, 'save', 'lauri'); } catch (err: any) { twice = String(err.status); }
check('a decision cannot be made twice', twice === '409');
let other = '';
try { E.decide(g.candidates.find((c) => /payslip/i.test(c.title))!.id, 'save', 'eeva'); } catch (err: any) { other = String(err.status); }
check('another customer cannot decide it', other === '404');
const pay = g.candidates.find((c) => /payslip/i.test(c.title))!;
const dropped = E.decide(pay.id, 'drop', 'lauri');
check('drop: nothing saved, detail cleared', dropped.customer === 'dropped' && !dropped.entryId && dropped.detail === '');

// --- already known: merged, not asked again
const again = await E.ingest('lauri', 'glasses', { signals: [{ text: 'Viewing a 2-room flat in Kalasatama' }] });
check('already in the cabinet: merged, not asked again', again.run.merged === 1 && again.candidates.length === 0, again.run);

// --- funnel
const f = E.funnel('lauri');
check('funnel: heard > useful > saved', f.heard > f.useful && f.useful > f.saved && f.saved === 2, f);

// --- reset clears it
S.clearPipeline();
check('reset: the pipeline is empty', E.funnel('lauri').heard === 0 && !/Kalasatama/.test(fs.readFileSync(path.join(DIR, 'pipeline.json'), 'utf-8')));

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\nRESULT ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
