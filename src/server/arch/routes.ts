import type { Express, Request, Response } from 'express';
import {
  agentQuery, archState, archCustomers, newSession, chat, addGoalDirect,
  decideAirlock, autoInsights, levelUserCards, levelNordeaProposals, reviewQueue, decideProposal, setStandingPermissions, undoEntry,
  explainEntry, disputeEntry, setAgentOff, deleteDatabase, parkCabinet, listEntries, ArchError,
  appWrites,
} from './orchestrator.js';
import { hostedClearOutcome } from './store/common.js';
import { setStoreWriteHook } from './store/common.js';
import { noteArchChange, subscribeArch, archUidFromFile } from './events.js';

// Realtime: EVERY store write (local or hosted, any agent DB or the bus) becomes one
// coalesced per-customer change event for the SSE stream - coverage at the write layer,
// not per call site.
setStoreWriteHook((file, kind) => { const uid = archUidFromFile(file, kind); if (uid) noteArchChange(uid); });
import type { AgentId } from './types.js';
import { runOnce, requestState } from '../chatRequests.js';

/**
 * The three-database architecture: User DB (personal agent), Context Memory DB
 * (CM agent, the shared cabinet), Nordea DB (Nordea agent). Every route names
 * which agent acts; agents only touch their own DB and talk via messages.
 */
export function registerArchRoutes(app: Express) {
  const h = (fn: (req: Request, res: Response) => unknown | Promise<unknown>) => async (req: Request, res: Response) => {
    try { await fn(req, res); } catch (err) {
      if (err instanceof ArchError) { res.status(err.status).json({ error: err.message }); return; }
      console.error('arch route failed:', err);
      res.status(500).json({ error: 'Something went wrong in the three-agent architecture.' });
    }
  };
  const uid = (req: Request) => String(req.params.uid || '');

  app.get('/api/arch/customers', h((_req, res) => res.json(archCustomers())));

  app.get('/api/arch/:uid/state', h((req, res) => res.json(archState(uid(req)))));

  // Realtime (owner: "realtime arch"): one SSE stream per customer. Events carry only a
  // sequence number (no data): the client re-reads /state, so reconnects simply resync.
  // ?after=<seq> or the Last-Event-ID header replays the bounded buffer of missed events.
  // Isolation: a connection only ever receives its own uid's events; keepalive every 25s.
  app.get('/api/arch/:uid/events', h((req, res) => {
    const user = uid(req);
    const after = Math.max(0, Number(req.query.after) || Number(req.headers['last-event-id']) || 0);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    const { unsubscribe } = subscribeArch(user, after, (ev) => res.write(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`));
    const keepalive = setInterval(() => { try { res.write(': ka\n\n'); } catch { /* closed */ } }, 25000);
    req.on('close', () => { clearInterval(keepalive); unsubscribe(); });
  }));

  // V5: start a fresh customer session (new empty context.md stamped with its session id).
  app.post('/api/arch/:uid/session/new', h((req, res) => { const r = newSession(uid(req)); noteArchChange(uid(req)); res.json(r); }));

  app.post('/api/arch/:uid/entries/:entryId/undo', h((req, res) => res.json(undoEntry(uid(req), String(req.params.entryId)))));

  app.post('/api/arch/:uid/permissions', h((req, res) => {
    const reviewLevel = req.body?.reviewLevel === undefined ? undefined : req.body.reviewLevel === 'high' ? 'high' as const : 'all' as const;
    const modes = ['No permission', 'Review everything', 'High risk mode'];
    const userCardMode = typeof req.body?.userCardMode === 'string' && modes.includes(req.body.userCardMode) ? req.body.userCardMode : undefined;
    res.json(setStandingPermissions(uid(req), reviewLevel, userCardMode));
  }));

  app.post('/api/arch/:uid/chat', h(async (req, res) => {
    const text = String(req.body?.text ?? '').trim();
    if (!text) { res.status(400).json({ error: 'Say something first.' }); return; }
    const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId.trim() ? req.body.sessionId.trim() : undefined;
    const requestId = typeof req.body?.requestId === 'string' && req.body.requestId.trim() ? req.body.requestId.trim().slice(0, 80) : undefined;
    const user = uid(req);
    const out = await runOnce(`arch:${user}`, requestId, async () => ({ status: 200, body: await chat(user, text, sessionId) }), text);
    res.status(out.status).json(out.body);
  }));
  // Late pickup for a chat turn by its requestId (pending / done + result / unknown). Never reruns a turn.
  app.get('/api/arch/:uid/chat/result', h((req, res) => {
    const requestId = String(req.query.requestId || '');
    if (!requestId) { res.status(400).json({ error: 'requestId is required' }); return; }
    const st = requestState(`arch:${uid(req)}`, requestId);
    res.json(st.status === 'done' ? { status: 'done', result: st.result.body } : st);
  }));

  // Agent-to-agent query transport: the personal agent (in-app or the separate demo client
  // process) asks the CM or Nordea agent; the answering agent reads only its own DB.
  app.post('/api/arch/:uid/agent-query', h((req, res) => {
    const to = String(req.body?.to ?? '');
    const question = String(req.body?.question ?? '').trim();
    if (to !== 'cm' && to !== 'nordea') { res.status(400).json({ error: "to must be 'cm' or 'nordea'." }); return; }
    if (!question) { res.status(400).json({ error: 'A question is required.' }); return; }
    res.json(agentQuery(uid(req), to, question));
  }));

  // Direct manual goal input - never through the sync airlock.
  app.post('/api/arch/:uid/goals', h(async (req, res) => {
    const title = String(req.body?.title ?? '').trim();
    if (!title) { res.status(400).json({ error: 'A goal needs a title.' }); return; }
    const goal = addGoalDirect(uid(req), title, String(req.body?.detail ?? ''));
    await levelUserCards(uid(req)); // R2: the User AI levels the new goal's card before the mode gate applies
    await autoInsights(uid(req));
    res.json(goal);
  }));
  app.post('/api/arch/:uid/goals/:goalId', h(async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : undefined;
    const detail = typeof req.body?.detail === 'string' ? req.body.detail : undefined;
    if (!title && detail === undefined) { res.status(400).json({ error: 'Nothing to update.' }); return; }
    appWrites.updateGoal(uid(req), String(req.params.goalId), { title, detail });
    await levelUserCards(uid(req)); // R2: a changed card is a new version - level it
    await autoInsights(uid(req));
    res.json({ ok: true });
  }));
  app.post('/api/arch/:uid/goals/:goalId/delete', h(async (req, res) => {
    appWrites.removeGoal(uid(req), String(req.params.goalId));
    await autoInsights(uid(req));
    res.json({ ok: true });
  }));

  // G7/V5: the simulated external-agent mode and its stand-in sync endpoint are gone.
  // The airlock stays, empty until a real external agent exists (V9: bank-hosted MCP).
  app.post('/api/arch/:uid/airlock/:batchId/approve', h(async (req, res) => { const r = decideAirlock(uid(req), String(req.params.batchId), true); await levelUserCards(uid(req)); res.json(r); }));
  app.post('/api/arch/:uid/airlock/:batchId/reject', h((req, res) => res.json(decideAirlock(uid(req), String(req.params.batchId), false))));

  // Goal-filtered bank contributions + merge review.
  app.get('/api/arch/:uid/review', h((req, res) => res.json({ proposals: reviewQueue(uid(req)) })));
  app.post('/api/arch/:uid/review/:messageId/accept', h((req, res) => res.json(decideProposal(uid(req), String(req.params.messageId), true))));
  app.post('/api/arch/:uid/review/:messageId/reject', h((req, res) => res.json(decideProposal(uid(req), String(req.params.messageId), false))));

  // Explain / dispute.
  app.get('/api/arch/:uid/entries', h((req, res) => res.json(listEntries(uid(req)))));
  app.get('/api/arch/:uid/entries/:entryId/explain', h((req, res) => res.json(explainEntry(uid(req), String(req.params.entryId)))));
  app.post('/api/arch/:uid/entries/:entryId/dispute', h((req, res) => {
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) { res.status(400).json({ error: 'Say why you dispute it.' }); return; }
    res.json(disputeEntry(uid(req), String(req.params.entryId), reason));
  }));

  // Cabinet park: suspended (no agent reads, no new contributions, no acceptances) but never
  // deleted, and resumed ONLY by this explicit reconnect - never by the connect/disconnect swap.
  app.post('/api/arch/:uid/cabinet/park', h((req, res) => res.json(parkCabinet(uid(req), true))));
  app.post('/api/arch/:uid/cabinet/resume', h(async (req, res) => { const r = parkCabinet(uid(req), false); await levelNordeaProposals(uid(req)); res.json(r); })); // D9: level the decay round's proposals

  // Separate controls: turn an agent off, disconnect the personal agent, delete one database.
  app.post('/api/arch/:uid/agents/:agent/off', h((req, res) => res.json({ agentsOff: setAgentOff(uid(req), req.params.agent as AgentId, true) })));
  app.post('/api/arch/:uid/agents/:agent/on', h((req, res) => res.json({ agentsOff: setAgentOff(uid(req), req.params.agent as AgentId, false) })));
  app.delete('/api/arch/:uid/db/:which', h(async (req, res) => {
    const which = String(req.params.which);
    if (!['user', 'cm', 'nordea'].includes(which)) { res.status(400).json({ error: 'Which database: user, cm or nordea.' }); return; }
    deleteDatabase(uid(req), which as 'user' | 'cm' | 'nordea');
    noteArchChange(uid(req));
    // G25: never claim success while the hosted half failed - surface partial state + safe retry.
    const hosted = await hostedClearOutcome(uid(req), which as 'user' | 'cm' | 'nordea');
    if (typeof hosted === 'object') {
      res.status(502).json({ deleted: which, local: 'deleted', hosted: 'clear-failed', error: hosted.failed,
        retry: 'issue this DELETE again (or: npx tsx scripts/load_remote.ts clear <uid>)' });
      return;
    }
    res.json({ deleted: which, hosted }); // hosted: 'cleared' | 'local-only'
  }));
}
