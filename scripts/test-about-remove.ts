/** About you follows the cabinet: a removed line leaves the paragraph and isn't filled back in from Nordea's data. Real routes. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'about-remove-'));
process.env.PORT = '3917';
process.env.NODE_ENV = 'production';
process.env.LLM_PROVIDER = 'mock';
for (const k of ['SUPABASE_URL', 'GEMINI_API_KEY', 'LLM_API_KEY', 'GROQ_API_KEY', 'USER_DB_URL', 'CM_DB_URL', 'NORDEA_DB_URL']) delete process.env[k];

let failed = 0;
const check = (name: string, ok: unknown, detail?: unknown) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : ` ${JSON.stringify(detail).slice(0, 300)}`}`); };

await import('../server.js');
const base = 'http://127.0.0.1:3917';
for (let i = 0; i < 100; i++) { try { await fetch(base + '/api/about?userId=lauri'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
const post = async (u: string, body: unknown) => (await fetch(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json() as Promise<any>;
const get = async () => (await fetch(base + '/api/about?userId=lauri')).json() as Promise<any>;
const salary = /salary of/;
const { db } = await import('../src/server/db.js');

await post('/api/about/reset', { userId: 'lauri' });
let v = await get();
check('Nordea’s unconfirmed data is not in the paragraph', !salary.test(v.paragraph), v.paragraph);
check('…but is offered to check', v.bank.some((b: any) => b.key === 'work') && !!v.fields.work.suggestion);

v = await post('/api/about', { userId: 'lauri', answers: {}, confirm: ['work'] });
check('a confirmed line is in the paragraph', salary.test(v.paragraph), v.paragraph);

v = await post('/api/about/remove', { userId: 'lauri', key: 'work' });
check('removed: not in the paragraph', !salary.test(v.paragraph), v.paragraph);
check('removed: not suggested again from Nordea’s data', !v.fields.work.suggestion && !v.bank.some((b: any) => b.key === 'work'));
check('removed: marked as removed', v.fields.work.removed === true);

// Nora archiving the entry from chat leaves an archived About entry: that alone counts as removed.
db.updateUser('lauri', { aboutOff: [] } as never);
v = await get();
check('an archived About entry alone also counts as removed', v.fields.work.removed === true && !v.fields.work.suggestion);

v = await post('/api/about', { userId: 'lauri', answers: { work: { values: [], text: 'Product designer', asIs: true } } });
check('added back: shown again', /Product designer/.test(v.paragraph) && !v.fields.work.removed, v.paragraph);

v = await post('/api/about/remove', { userId: 'lauri', key: 'all' });
check('clear all: nothing from Nordea’s data is offered', v.bank.length === 0, v.bank);
check('clear all: the work answer is gone', !/Product designer/.test(v.paragraph), v.paragraph);
check('clear all: goals stay', /Saving for/.test(v.paragraph), v.paragraph);

await post('/api/about/reset', { userId: 'lauri' });
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
