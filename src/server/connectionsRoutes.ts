// Active connections routes: list apps and connections, connect / change / pause / disconnect,
// and add or remove the customer's own apps. Concept demo: nothing is sent to the outside app.
import type { Express, Request, Response } from 'express';
import { db } from './db.js';
import {
  SCOPES, listApps, listConnections, connect, updateConnection, disconnect,
  addCustomApp, removeCustomApp, previewForConnection,
} from './connections.js';

const fail = (res: Response, e: any) => res.status(e?.status || 500).json({ error: String(e?.message || e) });

export function registerConnectionsRoutes(app: Express) {
  const who = (req: Request, res: Response): string | undefined => {
    const userId = String(req.query.userId || req.body?.userId || '');
    if (!userId || !db.getUser(userId)) { res.status(404).json({ error: 'Unknown customer' }); return undefined; }
    return userId;
  };
  const view = (userId: string) => ({
    scopes: SCOPES,
    apps: listApps(userId),
    connections: listConnections(userId).map((c) => {
      const sees = previewForConnection(userId, c);
      return { ...c, sees: sees.length, seesTitles: sees.slice(0, 30).map((e) => e.title) };
    }),
  });

  app.get('/api/connections', (req, res) => {
    const userId = who(req, res); if (!userId) return;
    res.json(view(userId));
  });
  app.post('/api/connections', (req, res) => {
    const userId = who(req, res); if (!userId) return;
    try { connect(userId, req.body || {}); res.status(201).json(view(userId)); } catch (e) { fail(res, e); }
  });
  app.patch('/api/connections/:id', (req, res) => {
    const userId = who(req, res); if (!userId) return;
    try { updateConnection(userId, req.params.id, req.body || {}); res.json(view(userId)); } catch (e) { fail(res, e); }
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
}
