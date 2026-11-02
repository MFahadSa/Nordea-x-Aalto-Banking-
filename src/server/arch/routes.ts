import type { Express, Request, Response } from 'express';
import {
  agentQuery, archState, chat, addGoalDirect, connectExternalAgent, disconnectPersonalAgent,
  stageSync, decideAirlock, contribute, reviewQueue, decideProposal, setStandingPermissions, undoEntry,
  explainEntry, disputeEntry, setAgentOff, deleteDatabase, parkCabinet, listEntries, ArchError,
} from './orchestrator.js';
import type { AgentId } from './types.js';

/**
 * The three-database architecture: User DB (personal agent), Context Memory DB
 * (CM agent, the shared cabinet), Nordea DB (Nordea agent). Every route names
 * which agent acts; agents only touch their own DB and talk via messages.
 */
export function registerArchRoutes(app: Express) {
  const h = (fn: (req: Request, res: Response) => void) => (req: Request, res: Response) => {
    try { fn(req, res); } catch (err) {
      if (err instanceof ArchError) { res.status(err.status).json({ error: err.message }); return; }
      console.error('arch route failed:', err);
      res.status(500).json({ error: 'Something went wrong in the three-agent architecture.' });
    }
  };
  const uid = (req: Request) => String(req.params.uid || '');

  app.get('/api/arch/:uid/state', h((req, res) => res.json(archState(uid(req)))));

  app.post('/api/arch/:uid/entries/:entryId/undo', h((req, res) => res.json(undoEntry(uid(req), String(req.params.entryId)))));

  app.post('/api/arch/:uid/permissions', h((req, res) => {
    const reviewLevel = req.body?.reviewLevel === 'high' ? 'high' as const : 'all' as const;
    res.json(setStandingPermissions(uid(req), reviewLevel));
  }));

  app.post('/api/arch/:uid/chat', h((req, res) => {
    const text = String(req.body?.text ?? '').trim();
    if (!text) { res.status(400).json({ error: 'Say something first.' }); return; }
    const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId.trim() ? req.body.sessionId.trim() : undefined;
    res.json(chat(uid(req), text, sessionId));
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
  app.post('/api/arch/:uid/goals', h((req, res) => {
    const title = String(req.body?.title ?? '').trim();
    if (!title) { res.status(400).json({ error: 'A goal needs a title.' }); return; }
    res.json(addGoalDirect(uid(req), title, String(req.body?.detail ?? '')));
  }));

  app.post('/api/arch/:uid/personal-agent/connect', h((req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) { res.status(400).json({ error: 'Name the external agent (e.g. Meta Muse).' }); return; }
    res.json(connectExternalAgent(uid(req), name));
  }));
  app.post('/api/arch/:uid/personal-agent/disconnect', h((req, res) => res.json(disconnectPersonalAgent(uid(req)))));

  // Sync airlock: only for a CONNECTED external personal agent's ingestion.
  app.post('/api/arch/:uid/sync', h((req, res) => {
    const source = String(req.body?.source ?? '').trim().toLowerCase();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!source) { res.status(400).json({ error: 'Name the sync source (whatsapp, calendar, notes, email).' }); return; }
    res.json(stageSync(uid(req), source, items.map((i: { kind?: string; text?: string }) => ({ kind: String(i?.kind ?? 'note'), text: String(i?.text ?? '') })).filter((i: { text: string }) => i.text)));
  }));
  app.post('/api/arch/:uid/airlock/:batchId/approve', h((req, res) => res.json(decideAirlock(uid(req), String(req.params.batchId), true))));
  app.post('/api/arch/:uid/airlock/:batchId/reject', h((req, res) => res.json(decideAirlock(uid(req), String(req.params.batchId), false))));

  // Goal-filtered bank contributions + merge review.
  app.post('/api/arch/:uid/nordea/contribute', h((req, res) => res.json(contribute(uid(req)))));
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
  app.post('/api/arch/:uid/cabinet/resume', h((req, res) => res.json(parkCabinet(uid(req), false))));

  // Separate controls: turn an agent off, disconnect the personal agent, delete one database.
  app.post('/api/arch/:uid/agents/:agent/off', h((req, res) => res.json({ agentsOff: setAgentOff(uid(req), req.params.agent as AgentId, true) })));
  app.post('/api/arch/:uid/agents/:agent/on', h((req, res) => res.json({ agentsOff: setAgentOff(uid(req), req.params.agent as AgentId, false) })));
  app.delete('/api/arch/:uid/db/:which', h((req, res) => {
    const which = String(req.params.which);
    if (!['user', 'cm', 'nordea'].includes(which)) { res.status(400).json({ error: 'Which database: user, cm or nordea.' }); return; }
    deleteDatabase(uid(req), which as 'user' | 'cm' | 'nordea');
    res.json({ deleted: which });
  }));
}
