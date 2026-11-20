// Active connections routes. Customer side: list, connect, change, pause, new key, disconnect, own apps,
// and a demo sync. Assistant side: POST /api/connect/:id with "Authorization: Bearer <key>" sends its
// profile of the customer, which waits for review. Inflow only: there is no way to read the cabinet.
import type { Express, Request, Response } from 'express';
import { db } from './db.js';
import {
  listApps, listConnections, connect, updateConnection, rotateKey, disconnect,
  addCustomApp, removeCustomApp, sendWithKey, trySync, knowsSummary,
  listInbox, dropInbox, PROFILE_PROMPT, knowsMarkdown,
} from './connections.js';

const fail = (res: Response, e: any) => res.status(e?.status || 500).json({ error: String(e?.message || e) });

export function registerConnectionsRoutes(app: Express) {
  const who = (req: Request, res: Response): string | undefined => {
    const userId = String(req.query.userId || req.body?.userId || '');
    if (!userId || !db.getUser(userId)) { res.status(404).json({ error: 'Unknown customer' }); return undefined; }
    return userId;
  };
  const view = (userId: string, extra: Record<string, unknown> = {}) => ({
    apps: listApps(userId),
    // Key hashes never leave the server.
    connections: listConnections(userId).map(({ keyHash, ...c }) => ({ ...c, hasKey: !!keyHash })),
    ...extra,
  });

  app.get('/api/connections', (req, res) => {
    const userId = who(req, res); if (!userId) return;
    res.json(view(userId));
  });
  app.get('/api/connections/prompt', (_req, res) => res.json({ prompt: PROFILE_PROMPT }));
  app.get('/api/profile/inbox', (req, res) => {
    const userId = who(req, res); if (!userId) return;
    res.json({ items: listInbox(userId) });
  });
  app.delete('/api/profile/inbox/:id', (req, res) => {
    const userId = who(req, res); if (!userId) return;
    try { res.json(dropInbox(userId, req.params.id)); } catch (e) { fail(res, e); }
  });
  app.get('/api/knows.md', (req, res) => {
    const userId = who(req, res); if (!userId) return;
    res.type('text/markdown; charset=utf-8').send(knowsMarkdown(userId));
  });
  app.get('/api/connections/knows', (req, res) => {
    const userId = who(req, res); if (!userId) return;
    res.json(knowsSummary(userId));
  });
  app.post('/api/connections', (req, res) => {
    const userId = who(req, res); if (!userId) return;
    try { const r = connect(userId, req.body || {}); res.status(201).json(view(userId, { newKey: r.key ? { connectionId: r.connection.id, key: r.key } : undefined })); } catch (e) { fail(res, e); }
  });
  app.patch('/api/connections/:id', (req, res) => {
    const userId = who(req, res); if (!userId) return;
    try { updateConnection(userId, req.params.id, req.body || {}); res.json(view(userId)); } catch (e) { fail(res, e); }
  });
  app.post('/api/connections/:id/key', (req, res) => {
    const userId = who(req, res); if (!userId) return;
    try { const r = rotateKey(userId, req.params.id); res.json(view(userId, { newKey: { connectionId: r.connection.id, key: r.key } })); } catch (e) { fail(res, e); }
  });
  app.post('/api/connections/:id/sync', async (req, res) => {
    const userId = who(req, res); if (!userId) return;
    try { const r = await trySync(userId, req.params.id); res.json(view(userId, { synced: r })); } catch (e) { fail(res, e); }
  });
  app.delete('/api/connections/:id', (req, res) => {
    const userId = who(req, res); if (!userId) return;
    try { disconnect(userId, req.params.id); res.json(view(userId)); } catch (e) { fail(res, e); }
  });
  app.post('/api/connections/apps', (req, res) => {
    const userId = who(req, res); if (!userId) return;
    try { addCustomApp(userId, req.body || {}); res.status(201).json(view(userId)); } catch (e) { fail(res, e); }
  });
  app.delete('/api/connections/apps/:appId', (req, res) => {
    const userId = who(req, res); if (!userId) return;
    try { removeCustomApp(userId, req.params.appId); res.json(view(userId)); } catch (e) { fail(res, e); }
  });

  const bearer = (req: Request) => { const a = String(req.headers.authorization || ''); return a.startsWith('Bearer ') ? a.slice(7).trim() : ''; };

  // The connected app sends info back. It waits for the customer; it never goes straight into the cabinet.
  app.post('/api/connect/:id', async (req, res) => {
    try {
      const r = await sendWithKey(req.params.id, bearer(req), req.body?.items ?? req.body?.text, req.body?.profile);
      res.status(202).json({ received: r.heard, waitingForCustomer: r.waiting, note: 'Nothing is used until the customer approves it.' });
    } catch (e) { fail(res, e); }
  });
}
