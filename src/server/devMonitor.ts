import { hydrateSkipped, listStoredIds } from './arch/store/common.js';
import { isCanonicalCustomerId } from './customerId.js';
// Read-only developer monitoring surface: the three agent stores, their connection
// lines, the session context.md, the message bus and the access log (V6/G8).
// It only READS state. It never changes data, and it is on by default (DEV_MONITOR=0 turns it off).
import type { Express, Request, Response } from 'express';
import { db } from './db.js';
import { feedStatus } from './nordeaFeed.js';
import { archState } from './arch/orchestrator.js';

// G22: on by default. The monitor shows everything, private cards included, so set
// DEV_MONITOR=0 on any hosted or shared deployment. Read per request: .env loads after imports.
// On a hosted copy (Google Cloud Run, which AI Studio uses, sets K_SERVICE) it is OFF unless
// DEV_MONITOR=1 is set on purpose; on a laptop it stays on unless DEV_MONITOR=0.
const enabled = () => process.env.DEV_MONITOR === '1' || (process.env.DEV_MONITOR !== '0' && !process.env.K_SERVICE);

export function registerDevMonitor(app: Express) {
  // Registered before the static files, so the page itself is hidden too when the monitor is off.
  app.get(['/dev-monitor.html', '/api/dev/monitor'], (_req: Request, res: Response, next) => {
    if (enabled()) return next();
    res.status(404).json({ error: 'The developer monitor is off (DEV_MONITOR=0, or a hosted copy without DEV_MONITOR=1).', code: 'MONITOR_OFF' });
  });

  app.get('/api/dev/monitor', (req: Request, res: Response) => {
    if (!db.hasData()) return res.status(404).json({ error: 'No data loaded yet', code: 'NO_DATA' });
    const asked = req.query.userId as string | undefined;
    // Without ?userId, show lauri if loaded, else the first customer there is (like the app does).
    const userId = asked || (db.getUser('lauri') ? 'lauri' : Object.keys(db.getState().users)[0]);
    // Every loaded customer, for the page's customer picker.
    const customers = Object.values(db.getState().users).map((u) => ({ id: u.id, name: u.name }));
    if (!db.getUser(userId)) return res.status(404).json({ error: `No customer "${userId}"`, code: 'NO_USER', customers });

    res.json({
      generatedAt: new Date().toISOString(),
      userId,
      customers,
      storage: db.status(),
      // D12: hosted/historical ids that are not canonical are skipped, listed here, and left unchanged hosted and local.
      unsupportedIds: { rejectedLocal: listStoredIds().filter((u) => !isCanonicalCustomerId(u)), hydrateSkipped: hydrateSkipped() },
      feed: feedStatus(),
      // The three-database architecture, live: per-store connection lines, agent on/off,
      // session context.md, queues and the message bus tail. Read-only composition.
      arch: archState(userId),
      // Every audited gateway read (newest first), the one cross-agent access record.
      accessLog: db.getAccessLog(userId).slice(0, 50),
    });
  });
}
