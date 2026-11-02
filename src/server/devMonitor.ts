// Read-only developer monitoring surface ("doctor's scope" for the Context Cabinet).
// It only READS state, through the same access-gateway rules the app itself uses
// (preview mode: no access-log writes, no reward changes). It never changes data.
import type { Express, Request, Response } from 'express';
import { db } from './db.js';
import { previewCabinetForAgent, hasActiveShare } from './accessGateway.js';
import { getAllAgents } from './agentRegistry.js';
import { aiStatus } from './llm.js';
import { feedStatus } from './nordeaFeed.js';
import { CabinetEntry } from '../types.js';
import { loadUserDb, loadCmDb, loadNordeaDb, loadBus, nordeaFileExists } from './arch/store/index.js';

function serialize(e: CabinetEntry) {
  return {
    id: e.id,
    type: e.type,
    title: e.title,
    detail: e.detail,
    source: e.source,
    status: e.status,
    private: e.private,
    reviewed: e.reviewed,
    readableBy: e.readableBy,
    updatedAt: e.updatedAt,
  };
}

// Server start time: lets the page tell activity observed in the current run
// apart from history that was loaded with the dataset.
const startedAt = new Date().toISOString();

function lastRead(userId: string, agentId: string) {
  const log = db.getAccessLog(userId).find((l) => l.agentId === agentId);
  return log
    ? { at: log.timestamp, itemsReadCount: log.itemsReadCount, blockedCount: log.blockedCount, sinceStart: log.timestamp >= startedAt }
    : null;
}

// The monitor shows every card, private ones included, so it is off unless DEV_MONITOR=1 is set
// (in .env / .env.local on a laptop). Never set it on the hosted app. Read per request: .env loads after imports.
const enabled = () => process.env.DEV_MONITOR === '1';

export function registerDevMonitor(app: Express) {
  // Registered before the static files, so the page itself is hidden too when the monitor is off.
  app.get(['/dev-monitor.html', '/api/dev/monitor'], (_req: Request, res: Response, next) => {
    if (enabled()) return next();
    res.status(404).json({ error: 'The developer monitor is off. Set DEV_MONITOR=1 to turn it on.', code: 'MONITOR_OFF' });
  });

  app.get('/api/dev/monitor', (req: Request, res: Response) => {
    if (!db.hasData()) return res.status(404).json({ error: 'No data loaded yet', code: 'NO_DATA' });
    const asked = req.query.userId as string | undefined;
    // Without ?userId, show lauri if loaded, else the first customer there is (like the app does).
    const userId = asked || (db.getUser('lauri') ? 'lauri' : Object.keys(db.getState().users)[0]);
    const user = db.getUser(userId);
    // Every loaded customer, for the page's customer picker.
    const customers = Object.values(db.getState().users).map((u) => ({ id: u.id, name: u.name }));
    if (!user) return res.status(404).json({ error: `No customer “${userId}”`, code: 'NO_USER', customers });

    const all = db.getCabinetEntries(userId).filter((e) => e.status !== 'archived');

    // What each configured agent may read right now (no logging, no side effects).
    const abel = previewCabinetForAgent(userId, 'abel');
    const adviser = previewCabinetForAgent(userId, 'adviser');
    const abelOk = new Set(abel.allowed.map((e) => e.id));
    const adviserOk = new Set(adviser.allowed.map((e) => e.id));

    // The adviser may only actually read while a one-time share is active.
    const shareActive = hasActiveShare(userId, 'adviser');

    // Cards that pass the gateway rules for BOTH sides (potential sharing).
    const bothOk = all.filter((e) => abelOk.has(e.id) && adviserOk.has(e.id));
    // Collaborative list: what the Nordea side can actually read NOW. Without an
    // active one-time share that is nothing at all - the boundary is not relaxed.
    const collaborative = shareActive ? bothOk.map((e) => serialize(e)) : [];
    const collaborativeIds = new Set(collaborative.map((e) => e.id));

    res.json({
      generatedAt: new Date().toISOString(),
      userId,
      userName: user.name,
      customers,
      storage: db.status(),
      feed: feedStatus(),
      // Configured agent manifests (static roles), not proof of running agents.
      agents: getAllAgents(),
      // The AI behind Abel: provider, the model answering now, the fallback order and which models are resting.
      // Only Abel calls a language model; the adviser and partner offers are rules and code.
      ai: aiStatus(),
      usesLlm: { abel: true, adviser: false, offers: false },
      share: { agentId: 'adviser', active: shareActive },
      panels: {
        // User role's context cards (customer/document sourced), annotated with
        // whether the user agent (Abel) may read each one.
        user: {
          managingAgent: 'abel',
          entries: all
            .filter((e) => e.source !== 'nordea')
            .map((e) => ({ ...serialize(e), agentCanRead: abelOk.has(e.id), shared: collaborativeIds.has(e.id) })),
        },
        collaborative: { shareActive, entries: collaborative, potentialCount: bothOk.length },
        // Nordea role's context cards (bank-produced observations). reviewed=false
        // means the customer has not confirmed the observation yet.
        nordea: {
          managingAgent: 'adviser',
          entries: all
            .filter((e) => e.source === 'nordea')
            .map((e) => ({ ...serialize(e), pendingConfirmation: !e.reviewed, shared: collaborativeIds.has(e.id) })),
        },
      },
      // Real event streams the app already records: every add/change/removal with
      // who did it (you / abel / nordea) and every audited gateway read.
      events: db.getState().entryHistory.filter((h) => h.userId === userId).slice(-40).reverse(),
      accessLog: db.getAccessLog(userId).slice(0, 20),
      // Observed activity per agent, from the audited access log only (never from
      // configured manifests or timers). null when nothing has been observed.
      activity: {
        abel: lastRead(userId, 'abel'),
        adviser: lastRead(userId, 'adviser'),
        offers: lastRead(userId, 'offers'),
      },
      // seed/demo holds the fictional customers lauri, eeva and alex (seed/README.md),
      // so the page can label that data as fictional rather than real bank data.
      demoPersona: ['lauri', 'eeva', 'alex'].includes(userId),
      // Live state of the three-database architecture for the same customer, read from the
      // arch SQLite stores themselves. Real state only: database row counts, agent on/off,
      // the actual bus message tail. null when this customer has no arch data yet.
      arch: (() => {
        try {
          const u = loadUserDb(userId);
          const cm = loadCmDb(userId);
          const nordea = nordeaFileExists(userId) ? loadNordeaDb(userId) : null;
          const bus = loadBus(userId);
          if (!u.goals.length && !cm.entries.length && !nordea && !bus.messages.length) return null;
          return {
            stores: {
              userDb: { file: `${userId}.user.db`, goals: u.goals.length, personalFacts: u.personalFacts.length },
              contextMemoryDb: { file: `${userId}.cm.db`, entries: cm.entries.length, active: cm.entries.filter((e) => e.status === 'active').length, stale: cm.entries.filter((e) => e.status === 'stale').length, disputed: cm.entries.filter((e) => e.status === 'disputed').length },
              nordeaDb: nordea ? { file: `${userId}.nordea.db`, accounts: nordea.accounts.length, transactions: nordea.transactions.length } : null,
              busDb: { file: `${userId}.bus.db`, messages: bus.messages.length, airlockPending: bus.airlock.filter((a) => a.status === 'pending').length },
            },
            agentsOff: u.agentsOff,
            personalAgent: u.personalAgent,
            recentMessages: bus.messages.slice(-15).reverse().map((m) => ({ at: m.at, from: m.from, to: m.to, type: m.type, summary: m.summary, status: m.status })),
          };
        } catch {
          return null;
        }
      })(),
      startedAt,
    });
  });
}
