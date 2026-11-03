/**
 * D12 error boundary. A bad customer id that reaches a store seam throws InvalidCustomerIdError. Express 4 turns a
 * sync throw into the default HTML error page and ignores a rejected async handler (the process then dies on the
 * unhandled rejection). This wraps every route handler registered on the app so that error - and ONLY that error -
 * becomes the typed JSON 400. Any other error behaves exactly as before.
 */
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { InvalidCustomerIdError } from './customerId.js';

const send400 = (res: Response, e: InvalidCustomerIdError) => { if (!res.headersSent) res.status(400).json({ error: e.message, code: e.code }); };
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all'] as const;

export function failClosedRoutes(app: Express) {
  const wrap = (h: unknown) => {
    if (typeof h !== 'function' || h.length >= 4) return h; // not a handler, or an error middleware
    return function (this: unknown, req: Request, res: Response, next: NextFunction) {
      try {
        const out = (h as RequestHandler).call(this, req, res, next) as unknown;
        if (out && typeof (out as Promise<unknown>).then === 'function') {
          (out as Promise<unknown>).catch((e) => { if (e instanceof InvalidCustomerIdError) send400(res, e); else throw e; });
        }
        return out;
      } catch (e) { if (e instanceof InvalidCustomerIdError) return send400(res, e); throw e; }
    };
  };
  const target = app as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of METHODS) {
    const orig = target[m].bind(app);
    target[m] = (...args: unknown[]) => {
      if (m === 'get' && args.length === 1) return orig(...args); // app.get('setting')
      return orig(...args.map((a) => (Array.isArray(a) ? a.map(wrap) : wrap(a))));
    };
  }
}
