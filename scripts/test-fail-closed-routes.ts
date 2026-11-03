/** D12: the route error boundary. A bad customer id that reaches a store seam is a typed 400 from sync AND async handlers; any other error is untouched. */
import express from 'express';
import { failClosedRoutes } from '../src/server/failClosedRoutes.js';
import { InvalidCustomerIdError, canonicalCustomerId } from '../src/server/customerId.js';
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d?: unknown) => { if (c) { pass++; console.log(`  PASS ${n}`); } else { fail++; console.log(`  FAIL ${n} ${d === undefined ? '' : JSON.stringify(d)}`); } };
let crashed = false; process.on('unhandledRejection', () => { crashed = true; });
const app = express();
failClosedRoutes(app);
app.get('/sync', () => { canonicalCustomerId('a.b'); });
app.get('/async', async () => { await Promise.resolve(); canonicalCustomerId('a.b'); });
app.get('/fine', (_q, r) => { r.json({ ok: 1 }); });
app.get('/other-sync', () => { throw new Error('boom'); });
app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ other: err.message }); }); // error middleware is left alone
app.get('/after-error-mw', (_q, r) => r.json({ ok: 2 }));
check('app.get("setting") still works', typeof app.get('env') === 'string');
const srv = app.listen(0); const port = (srv.address() as { port: number }).port;
const call = async (p: string) => { const r = await fetch(`http://127.0.0.1:${port}${p}`); return { status: r.status, json: await r.json().catch(() => null) as any }; };
const a = await call('/sync'); check('sync InvalidCustomerIdError -> typed 400', a.status === 400 && a.json?.code === 'INVALID_CUSTOMER_ID', a);
const b = await call('/async'); check('async InvalidCustomerIdError -> typed 400 (no unhandled rejection)', b.status === 400 && b.json?.code === 'INVALID_CUSTOMER_ID' && !crashed, b);
check('normal route unchanged', (await call('/fine')).json?.ok === 1);
const c = await call('/other-sync'); check('other errors keep their old path (error middleware 500)', c.status === 500 && c.json?.other === 'boom', c);
check('routes registered after an error middleware still work', (await call('/after-error-mw')).json?.ok === 2);
check('the typed error is the one thrown by the rule', (() => { try { canonicalCustomerId('Lauri'); return false; } catch (e) { return e instanceof InvalidCustomerIdError; } })());
srv.close();
console.log(`fail-closed-routes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
