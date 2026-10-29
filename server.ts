// Reads a .env file when the app runs on a laptop. In AI Studio the secrets come from Settings → Secrets.
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './src/server/db.js';
import { readCabinetThroughGateway } from './src/server/accessGateway.js';
import { getAllAgents, getAgentManifest } from './src/server/agentRegistry.js';
import { CabinetEntry, UndoRecord } from './src/types.js';
import { registerV14Routes } from './src/server/routes.js';
import { setProvider } from './src/server/llm.js';
import { mockProvider } from './src/server/llmMock.js';
import { openAiProvidersFromEnv } from './src/server/llmOpenAI.js';
import { makeChain } from './src/server/llmChain.js';
import { gemini, geminiConfigured } from './src/server/llm.js';
import { deleteAllDocumentFiles } from './src/server/documents.js';

// Tests only: LLM_PROVIDER=mock swaps Gemini for a scripted stand-in. Never set this in AI Studio.
if (process.env.LLM_PROVIDER === 'mock') setProvider(mockProvider);
// LLM_PROVIDER=openai: an OpenAI-compatible API, e.g. Groq's free tier or the Aalto LLM gateway (VPN only).
// With LLM_PROVIDER=openai the app uses a chain: the configured model, the other free models on the same service,
// then Gemini (if a Gemini key exists). The first one that's available answers.
if (process.env.LLM_PROVIDER === 'openai') setProvider(makeChain([...openAiProvidersFromEnv(), ...(geminiConfigured() ? [gemini] : [])]));
console.log(`AI provider: ${process.env.LLM_PROVIDER === 'openai' ? `${process.env.LLM_BASE_URL || 'Aalto LLM'} (${process.env.LLM_MODEL || 'Qwen/Qwen3.8-27B-FP8'})` : process.env.LLM_PROVIDER === 'mock' ? 'scripted test stand-in' : 'Gemini'}`);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Photos and PDFs are sent as base64, so allow bigger bodies (the client shrinks photos first).
app.use(express.json({ limit: '12mb' }));

// Anything that changes data answers only after the change is saved in Supabase (when it's set up),
// so a restart of the hosting can't lose what the customer just did.
app.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const send = res.json.bind(res);
  res.json = ((body: any) => {
    db.flush().finally(() => send(body));
    return res;
  }) as any;
  next();
});

// API Routes

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 2. Users / Personas
app.get('/api/users', (req, res) => {
  const users = Object.values(db.getState().users);
  res.json({ users });
});

app.get('/api/users/:userId', (req, res) => {
  const user = db.getUser(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

app.patch('/api/users/:userId', (req, res) => {
  const user = db.updateUser(req.params.userId, req.body);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

app.post('/api/users/reset', async (req, res) => {
  await deleteAllDocumentFiles();
  const state = db.resetToSeed();
  res.json({ message: 'Database reset to initial fictional seeds', state });
});

// 3. Cabinet Entries & Access Gateway
app.get('/api/cabinet', (req, res) => {
  const userId = (req.query.userId as string) || 'lauri';
  const agentId = req.query.agentId as string | undefined;
  const purpose = req.query.purpose as string | undefined;

  if (agentId) {
    // Audit read through the Access Gateway
    const gatewayResult = readCabinetThroughGateway(userId, agentId, purpose);
    return res.json({
      entries: gatewayResult.allowed,
      blocked: gatewayResult.blocked,
      logEntry: gatewayResult.logEntry,
    });
  }

  // Direct customer viewing from the app
  const entries = db.getCabinetEntries(userId);
  res.json({ entries });
});

app.post('/api/cabinet', (req, res) => {
  const { userId, type, title, detail, source, target, private: isPrivate, goalType, readableBy } = req.body;

  if (!userId || !title) {
    return res.status(400).json({ error: 'userId and title are required' });
  }

  const id = `entry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  const newEntry: CabinetEntry = {
    id,
    userId,
    type: type || 'fact',
    title,
    detail: detail || '',
    source: source || 'customer',
    status: 'active',
    private: Boolean(isPrivate),
    readableBy: readableBy || { abel: true, offers: false },
    provenance: { channel: 'app' },
    target: target || undefined,
    goalType: goalType || undefined,
    reviewed: true,
    createdAt: now,
    updatedAt: now,
  };

  db.addCabinetEntry(newEntry, { by: 'you', how: 'In the app' });

  // Generate undo token
  const undoToken = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const undoRecord: UndoRecord = {
    undoToken,
    timestamp: now,
    userId,
    action: 'create',
    description: `Added "${newEntry.title}" to cabinet`,
    previousEntry: null,
    entryId: id,
  };
  db.addUndoRecord(undoRecord);

  res.status(201).json({
    entry: newEntry,
    undoToken,
    message: '📌 Noted in your cabinet',
  });
});

app.patch('/api/cabinet/:id', (req, res) => {
  const existing = db.getCabinetEntry(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Cabinet entry not found' });
  }

  const prevSnapshot = { ...existing };
  const updated = db.updateCabinetEntry(req.params.id, req.body, { by: 'you', how: 'In the app' });

  const undoToken = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const undoRecord: UndoRecord = {
    undoToken,
    timestamp: new Date().toISOString(),
    userId: existing.userId,
    action: 'update',
    description: `Updated "${existing.title}"`,
    previousEntry: prevSnapshot,
    entryId: existing.id,
  };
  db.addUndoRecord(undoRecord);

  res.json({
    entry: updated,
    undoToken,
    message: 'Updated in your cabinet',
  });
});

app.delete('/api/cabinet/:id', (req, res) => {
  const existing = db.getCabinetEntry(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Cabinet entry not found' });
  }

  const prevSnapshot = { ...existing };
  // Mark as archived (or delete) to preserve provenance
  const archived = db.updateCabinetEntry(req.params.id, { status: 'archived' }, { by: 'you', how: 'In the app' });

  const undoToken = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const undoRecord: UndoRecord = {
    undoToken,
    timestamp: new Date().toISOString(),
    userId: existing.userId,
    action: 'archive',
    description: `Removed "${existing.title}" from active cabinet`,
    previousEntry: prevSnapshot,
    entryId: existing.id,
  };
  db.addUndoRecord(undoRecord);

  res.json({
    entry: archived,
    undoToken,
    message: 'Removed from active cabinet (kept in history)',
  });
});

// 4. Undo API
app.post('/api/cabinet/undo', (req, res) => {
  const { undoToken } = req.body;
  if (!undoToken) {
    return res.status(400).json({ error: 'undoToken is required' });
  }

  const record = db.getUndoRecord(undoToken);
  if (!record) {
    return res.status(404).json({ error: 'Undo token expired or not found' });
  }

  if (record.action === 'create_many' && record.entryIds) {
    record.entryIds.forEach((id) => db.deleteCabinetEntry(id, { purge: true }));
  } else if (record.action === 'create' && record.entryId) {
    // Revert creation by deleting the entry
    db.deleteCabinetEntry(record.entryId, { purge: true });
  } else if ((record.action === 'update' || record.action === 'archive') && record.previousEntry) {
    // Restore previous snapshot
    db.updateCabinetEntry(record.previousEntry.id, record.previousEntry, { by: 'you', how: 'Undo', action: 'undone' });
  }

  db.removeUndoRecord(undoToken);

  res.json({
    success: true,
    message: `Undid action: ${record.description}`,
    revertedAction: record.action,
  });
});

// 5. Access Log
app.get('/api/access-log', (req, res) => {
  const userId = req.query.userId as string | undefined;
  const logs = db.getAccessLog(userId);
  res.json({ logs });
});

// 6. Agents Registry
app.get('/api/agents', (req, res) => {
  const agents = getAllAgents();
  res.json({ agents });
});

app.get('/api/agents/:agentId', (req, res) => {
  const agent = getAgentManifest(req.params.agentId);
  if (!agent) {
    return res.status(404).json({ error: 'Agent manifest not found' });
  }
  res.json({ agent });
});

// 7. Topic Log
app.get('/api/topics/log', (req, res) => {
  const userId = req.query.userId as string | undefined;
  const topics = db.getTopicLog(userId);
  res.json({ topics });
});

// 8. Transactions
app.get('/api/transactions', (req, res) => {
  const userId = (req.query.userId as string) || 'lauri';
  const transactions = db.getTransactions(userId);
  res.json({ transactions });
});

// 9. Chat, button actions and everything new in v14 live in routes.ts
registerV14Routes(app);

// Vite Middleware Mounting (Development) or Static File Serving (Production)
async function startServer() {
  // Connect to Supabase first (if its secrets are set), so the first request already sees saved data.
  await db.init();
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT} (Node: ${process.version})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
