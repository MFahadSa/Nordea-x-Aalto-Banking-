// Memory settings (More → Memory), modelled on Claude's memory settings and adapted to banking.
// Nora follows them in src/server/abel.ts:
//  - searchChats: Nora may look at the titles of the customer's earlier chats with her.
//  - fromChats:   Nora may suggest things to remember from a chat (they still need the customer's OK).
//  - sensitive:   always false. Private topics (health, religion, relationships…) are never saved as notes; not a setting.
//                 A private goal may be saved, but only after the customer taps its confirm card.
import type { Express, Request } from 'express';
import { db } from './db.js';

export interface MemorySettings { searchChats: boolean; fromChats: boolean; sensitive: boolean }
export const MEMORY_DEFAULTS: MemorySettings = { searchChats: true, fromChats: true, sensitive: false };

export function memoryOf(userId: string): MemorySettings {
  const u = db.getUser(userId) as unknown as { memory?: Partial<MemorySettings> } | undefined;
  return { ...MEMORY_DEFAULTS, ...(u?.memory || {}), sensitive: false };
}

const uidOf = (req: Request) => String((req.method === 'GET' ? req.query.userId : req.body?.userId) || 'lauri');

export function registerMemoryRoutes(app: Express) {
  app.get('/api/memory', (req, res) => {
    const userId = uidOf(req);
    if (!db.getUser(userId)) return res.status(404).json({ error: 'Unknown customer' });
    res.json(memoryOf(userId));
  });
  app.post('/api/memory', (req, res) => {
    const userId = uidOf(req);
    if (!db.getUser(userId)) return res.status(404).json({ error: 'Unknown customer' });
    const next = { ...memoryOf(userId) };
    for (const k of ['searchChats', 'fromChats'] as const) {
      if (typeof req.body?.[k] === 'boolean') next[k] = req.body[k];
    }
    db.updateUser(userId, { memory: next } as never);
    res.json(next);
  });
}
