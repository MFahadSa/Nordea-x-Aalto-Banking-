// HTTP for the input pipeline. Customer side: send an input, see what waits, decide per item.
// The Nordea workspace reads cases and the funnel through workspace routes (stage 2).
import type { Express, Request, Response } from 'express';
import { ingest, decide, waitingFor, funnel } from './engine.js';
import * as S from './store.js';
import type { PipeSource } from './store.js';
import { today, caseDetail, draftSummary, askCustomer, decideCase, STAFF } from './cases.js';
import { droppedFor } from './store.js';
import { db } from '../db.js';

const SOURCES: PipeSource[] = ['glasses', 'whatsapp', 'document', 'csv', 'abel', 'cloud'];

const h = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) { res.status(e?.status || 500).json({ error: e?.message || String(e) }); }
};

export function registerPipelineRoutes(app: Express) {
  // One input arrives. { userId, source, signals?: [{text, kind}], text?, file?: {mimeType, data, name}, label? }
  app.post('/api/ingest', h(async (req, res) => {
    const b = req.body || {};
    const source = String(b.source) as PipeSource;
    if (!SOURCES.includes(source)) return res.status(400).json({ error: `source must be one of ${SOURCES.join(', ')}` });
    const r = await ingest(String(b.userId || ''), source, { signals: b.signals, text: b.text, file: b.file, label: b.label || b.file?.name });
    res.status(201).json(r);
  }));

  // What waits for the customer ("Waiting for you" in the app).
  app.get('/api/pipeline/:uid/waiting', h((req, res) => res.json({ items: waitingFor(String(req.params.uid)) })));

  // Save · Keep private · Drop, per item.
  app.post('/api/pipeline/:uid/items/:id', h((req, res) => {
    const action = String(req.body?.action);
    if (!['save', 'private', 'drop'].includes(action)) return res.status(400).json({ error: 'action must be save, private or drop' });
    res.json({ item: decide(String(req.params.id), action as 'save' | 'private' | 'drop', String(req.params.uid)) });
  }));

  // The funnel and the runs (customer's own view of where their inputs went).
  app.get('/api/pipeline/:uid', h((req, res) => {
    const uid = String(req.params.uid);
    res.json({ funnel: funnel(uid), runs: S.runs(uid).slice().reverse(), items: S.candidates(uid).slice().reverse() });
  }));
}

// ---------------- v21: the Nordea employee workspace (desktop) ----------------
// Concept demo: the staff member is picked in the page (no login). Every read of customer data
// goes through the access gateway and lands in the customer's "Who sees it" log.

const sidOf = (req: Request) => (STAFF.some((s) => s.id === req.query.staff || s.id === req.body?.staff) ? String(req.query.staff || req.body?.staff) : 'kalle');

export function registerWorkspaceRoutes(app: Express) {
  app.get('/api/workspace/today', h((_req, res) => res.json(today())));
  app.get('/api/workspace/cases/:id', h((req, res) => res.json(caseDetail(String(req.params.id), sidOf(req)))));
  app.post('/api/workspace/cases/:id/summary', h(async (req, res) => res.json(await draftSummary(String(req.params.id), sidOf(req)))));
  app.post('/api/workspace/cases/:id/ask', h((req, res) => res.json(askCustomer(String(req.params.id), sidOf(req), String(req.body?.ask || '')))));
  app.post('/api/workspace/cases/:id/decide', h((req, res) => {
    const b = req.body || {};
    if (!['pre_approved', 'declined'].includes(b.outcome)) return res.status(400).json({ error: 'outcome must be pre_approved or declined' });
    res.json(decideCase(String(req.params.id), sidOf(req), b.outcome, String(b.reason || ''), b.amount ? Number(b.amount) : undefined));
  }));
  // The customer's own "Who sees it" log, as staff see it for a case (reads only, no content).
  app.get('/api/workspace/audit/:uid', h((req, res) => res.json({ reads: db.getAccessLog(String(req.params.uid)).slice(0, 40) })));
  // PRESENTER VIEW for the demo audience: the pipeline with what was dropped. Real staff would see
  // counts only - the page says so. Dropped text comes from this server's memory, never from storage.
  app.get('/api/workspace/pipeline/:uid', h((req, res) => {
    const uid = String(req.params.uid);
    const runs = S.runs(uid).slice().reverse();
    res.json({ funnel: funnel(uid), runs: runs.map((r) => ({ ...r, droppedSignals: droppedFor(r.id) })), items: S.candidates(uid).slice().reverse() });
  }));
}
