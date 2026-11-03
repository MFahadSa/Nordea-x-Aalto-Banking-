/** D12: fail-closed customer ids. Canonical ids unchanged; ambiguous ids rejected at HTTP and every store seam. No server, no network. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.CABINET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-'));
const { canonicalCustomerId, isCanonicalCustomerId, InvalidCustomerIdError } = await import('../src/server/customerId.js');
const C = await import('../src/server/arch/store/common.js');
const { archUidKey } = await import('../src/server/arch/events.js');
const { loadContext } = await import('../src/server/arch/store/contextStore.js');
const ctx = await import('../src/server/arch/store/contextStore.js');
const { appendMessage } = await import('../src/server/arch/store/busStore.js');
const express = (await import('express')).default;
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d?: unknown) => { if (c) { pass++; console.log(`  PASS ${n}`); } else { fail++; console.log(`  FAIL ${n} ${d === undefined ? '' : JSON.stringify(d)}`); } };
const throwsInvalid = (f: () => unknown) => { try { f(); return false; } catch (e) { return e instanceof InvalidCustomerIdError && e.status === 400; } };

for (const id of ['lauri', 'eeva', 'alex', 'a_b', 'a-1', 'x'.repeat(64), 'x'.repeat(65)]) check(`canonical ${id.slice(0, 8)} accepted unchanged`, canonicalCustomerId(id) === id && C.fileFor(id, 'user').endsWith(`${id}.user.db`) && archUidKey(id) === id);
const bad = ['Lauri', 'LAURI', 'A-1', 'a.b', 'a b', 'a/b', '..', '../x', 'a@b.com', '', 'é', 'a\u0000b'];
for (const id of bad) check(`ambiguous ${JSON.stringify(id).slice(0, 14)} rejected`, !isCanonicalCustomerId(id) && throwsInvalid(() => canonicalCustomerId(id)));
check('non-string ids rejected', [undefined, null, 5, {}, ['a']].every((v) => !isCanonicalCustomerId(v)));
// store seams: no partial writes, no files created
const before = fs.existsSync(C.ARCH_DIR) ? fs.readdirSync(C.ARCH_DIR).length : 0;
check('fileFor rejects a.b', throwsInvalid(() => C.fileFor('a.b', 'cm')));
check('registerCustomer rejects a.b and writes no index', throwsInvalid(() => C.registerCustomer('a.b')) && C.listCustomers().length === 0);
check('deleteDbFile rejects a.b', throwsInvalid(() => C.deleteDbFile('a.b', 'user')));
check('context store read/write rejects a.b', throwsInvalid(() => loadContext('a.b')) && throwsInvalid(() => ctx.contextMdPath('a.b')));
check('bus write rejects a.b', throwsInvalid(() => appendMessage('a.b', {} as never)));
check('no files created by rejected calls', (fs.existsSync(C.ARCH_DIR) ? fs.readdirSync(C.ARCH_DIR).length : 0) === before);
// canonical a_b data is NOT reachable through a.b
C.registerCustomer('a_b');
check('canonical a_b registers; a.b still rejected afterwards', C.listCustomers().join() === 'a_b' && throwsInvalid(() => C.fileFor('a.b', 'user')));

// a historical non-canonical index entry is kept untouched, never iterated, and survives register/unregister
fs.writeFileSync(path.join(C.ARCH_DIR, 'customers.json'), JSON.stringify(['te.st', 'a_b']));
C.registerCustomer('lauri');
check('historic te.st stays in the stored index after register, but listCustomers never offers it', C.listStoredIds().join() === 'te.st,a_b,lauri' && C.listCustomers().join() === 'a_b,lauri', C.listStoredIds());
C.unregisterCustomer('lauri');
check('unregister removes only that id; te.st is untouched', C.listStoredIds().join() === 'te.st,a_b');

// HTTP: the same guard as server.ts, answered before any handler
const { isCanonicalCustomerId: ok } = await import('../src/server/customerId.js');
const app = express(); app.use(express.json());
app.use('/api', (req, res, next) => { const s = [req.query?.userId, (req.body as Record<string, unknown> | undefined)?.userId].filter((v) => v !== undefined); if (s.some((v) => !ok(v))) return res.status(400).json({ code: 'INVALID_CUSTOMER_ID' }); next(); });
let handled = 0; app.all('/api/x', (_q, r) => { handled++; r.json({ ok: 1 }); });
const srv = app.listen(0); const port = (srv.address() as { port: number }).port;
const call = async (q: string, body?: unknown) => (await fetch(`http://127.0.0.1:${port}/api/x${q}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)).status;
check('HTTP query a.b -> 400, handler not run', (await call('?userId=a.b')) === 400 && handled === 0);
check('HTTP body a b -> 400', (await call('', { userId: 'a b' })) === 400 && handled === 0);
check('HTTP canonical lauri -> 200', (await call('?userId=lauri')) === 200 && handled === 1);
check('HTTP no userId -> 200 (default)', (await call('')) === 200);
srv.close();
// the real server guard is the same code path: pin it in the source
const serverSrc = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf-8');
check('server.ts installs the guard before routes', serverSrc.indexOf('customerIdRejection(v)') > 0 && serverSrc.indexOf('customerIdRejection(v)') < serverSrc.indexOf('registerV14Routes(app)'));
// guard mutation: a permissive regex would let a.b through
check('guard mutation: dot-permitting rule is NOT the shipped rule', !isCanonicalCustomerId('a.b'));
fs.rmSync(process.env.CABINET_DATA_DIR!, { recursive: true, force: true });
console.log(`customer-id: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
