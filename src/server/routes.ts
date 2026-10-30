// v14 routes: conversations with helpers, the real Abel, customer button actions, partner offers,
// one-time sharing, imports and the data the screens need. Money and fees are computed in code.
import type { Express, Request, Response } from 'express';
import { db } from './db.js';
import { previewCabinetForAgent, readCabinetThroughGateway } from './accessGateway.js';
import { summary as dataRewardsSummary } from './dataRewards.js';
import { applyNordeaData, readNordeaFile, NordeaData } from './nordeaData.js';
import { checkFeed, feedStatus } from './nordeaFeed.js';
import { getPartner, getAllPartners } from './partnerRegistry.js';
import * as fin from './finance.js';
import { abelTurn, proposeFromContent, offerHeadline, SAMPLE_CHAT, ImportItem } from './abel.js';
import { getProvider, aiStatus, aiPing } from './llm.js';
import { CabinetEntry, ChatMessage, Conversation, MessageCard, StoredDocument } from '../types.js';
import { keepDocument, readDocument, deleteDocument, sweepExpired, KEEP_DAYS } from './documents.js';
import { XLSX_MIME, csvText } from './fileText.js';
import { runSelfTest } from './selftest.js';

const fmt = (n: number, d = 0) =>
  Number(n).toLocaleString('fi-FI', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/−/g, '−') + ' €';
const id = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();
const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

function agentMsg(userId: string, conversationId: string, helperId: string, text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  const m: ChatMessage = { id: id('msg-agent'), userId, agentId: 'abel', channel: 'app', sender: 'agent', conversationId, helperId, text, createdAt: now(), ...extra };
  db.addMessage(m);
  db.touchConversation(conversationId);
  return m;
}
function userMsg(userId: string, conversationId: string, helperId: string, text: string): ChatMessage {
  const m: ChatMessage = { id: id('msg-user'), userId, agentId: 'abel', channel: 'app', sender: 'user', conversationId, helperId, text, createdAt: now() };
  db.addMessage(m);
  return m;
}
function newConversation(userId: string, helperId: string): Conversation {
  return db.addConversation({ id: id('conv'), userId, helperId, createdAt: now(), updatedAt: now(), offered: [] });
}

export const REWARDS = [
  { id: 'coach', title: 'A free 30-minute session with a Nordea money coach', short: 'Money coach session', pts: 100, done: 'Booked. A money coach will contact you.' },
  { id: 'charity', title: 'Nordea gives 5 € to a charity you choose', short: '5 € to charity', pts: 100, done: 'Thank you. You’ll pick the charity by email (example).' },
  { id: 'nofee', title: 'One month with no account fee', short: 'No account fee for a month', pts: 150, done: 'Done. Next month has no account fee.' },
  { id: 'boost', title: 'Nordea adds 10 € to your goal savings', short: '10 € to your goal', pts: 300, done: 'Done. 10 € added to your savings.' },
];
export const levelOf = (lifetime: number) => (lifetime >= 300 ? 'Gold' : lifetime >= 150 ? 'Silver' : 'Starter');

/** What the app shows about a kept file (never the bytes). */
function docInfo(d: StoredDocument) {
  const titles = d.entryIds.map((i) => db.getCabinetEntry(i)?.title).filter(Boolean) as string[];
  return { id: d.id, name: d.name, kind: d.kind, size: d.size, createdAt: d.createdAt, expiresAt: d.expiresAt, conversationId: d.conversationId, entries: titles };
}

/** Make a cabinet entry from a draft the customer approved on a card. */
function entryFromDraft(userId: string, d: any, extra: Partial<CabinetEntry> = {}): CabinetEntry {
  return {
    id: id('entry'), userId, type: d.type, title: d.title, detail: d.detail || '', source: 'customer', status: 'active', private: false,
    readableBy: { abel: true, offers: false }, provenance: { channel: 'app' }, target: d.target, goalType: d.goalType,
    reviewed: true, confirmedAt: now(), createdAt: now(), updatedAt: now(), ...extra,
  };
}

export function registerV14Routes(app: Express) {
  // Everything the screens need in one call.
  app.get('/api/state', async (req, res) => {
    await sweepExpired().catch(() => 0);
    const userId = String(req.query.userId || 'lauri');
    const user = db.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const entries = db.getCabinetEntries(userId);
    const goals = fin.activeGoals(userId).map((g) => fin.goalStatus(userId, g));
    const spentThisMonth = Object.values(fin.monthSpend(userId, fin.CUR_MONTH)).reduce((a, b) => a + b, 0);
    const msgs = db.getMessages(userId);
    const conversations = db
      .getConversations(userId)
      .map((c) => {
        const ms = msgs.filter((m) => m.conversationId === c.id);
        const lastUser = [...ms].reverse().find((m) => m.sender === 'user');
        const last = ms[ms.length - 1];
        return { ...c, count: ms.length, title: lastUser?.text || last?.text || '', snippet: last?.text || '' };
      })
      .filter((c) => c.count > 0)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json({
      user,
      entries,
      accounts: fin.accounts(userId),
      goals,
      salary: fin.salaryInfo(userId),
      spentThisMonth: Math.round(spentThisMonth * 100) / 100,
      payPlan: fin.payPlan(userId),
      conversations,
      earnings: db.getEarnings(userId),
      shares: db.getShares(userId),
      accessCount: db.getAccessLog(userId).length,
      recentReads: db.getAccessLog(userId).slice(0, 8),
      readable: {
        abel: previewCabinetForAgent(userId, 'abel').allowed.length,
        offers: user.offersOff ? 0 : previewCabinetForAgent(userId, 'offers').allowed.length,
      },
      aiConnected: getProvider().isConfigured(),
      documents: db.getDocuments(userId).map(docInfo),
      today: fin.DEMO_TODAY,
    });
  });

  app.get('/api/partners', (_req, res) => res.json({ partners: getAllPartners() }));

  // AI connection check (More → AI connection). Shows whether a key is present, which model works,
  // and the last error. Never returns the key.
  app.get('/api/ai-status', (_req, res) => res.json(aiStatus()));
  app.post('/api/ai-ping', async (_req, res) => res.json({ ...(await aiPing()), status: aiStatus() }));

  app.post('/api/conversations', (req, res) => {
    const { userId = 'lauri', helperId = 'abel' } = req.body || {};
    res.status(201).json({ conversation: newConversation(userId, helperId) });
  });

  app.get('/api/conversations/:id/messages', (req, res) => {
    const c = db.getConversation(req.params.id);
    if (!c) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ messages: db.getMessages(c.userId).filter((m) => m.conversationId === c.id) });
  });

  // A customer message: stored, answered by the real Abel, both returned.
  app.post('/api/chat', async (req, res) => {
    const { userId = 'lauri', text, conversationId, helperId = 'abel' } = req.body || {};
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text is required' });
    let conv = conversationId ? db.getConversation(conversationId) : undefined;
    if (!conv || conv.userId !== userId) conv = newConversation(userId, helperId);
    const u = userMsg(userId, conv.id, conv.helperId, text.slice(0, 2000));
    const reply = await abelTurn(userId, conv.id, conv.helperId, u.text);
    db.addTopicLogEntry({ id: id('topic'), timestamp: now(), userId, topic: reply.topic, couldHelp: reply.couldHelp });
    const a = agentMsg(userId, conv.id, conv.helperId, reply.text, {
      suggestions: reply.suggestions,
      cards: reply.cards,
      notes: reply.notes,
      usedEntryIds: reply.usedEntryIds,
      supplied: reply.supplied,
      errorInfo: reply.errorDetail,
      answeredBy: reply.offline ? 'bank_code' : undefined,
    });
    res.status(201).json({ conversationId: conv.id, messages: [u, a], error: reply.error });
  });

  // Buttons on cards. The customer acts; code does the work (no model involved).
  app.post('/api/actions', (req: Request, res: Response) => {
    const { userId = 'lauri', messageId, action, payload = {} } = req.body || {};
    const msg = db.getMessages(userId).find((m) => m.id === messageId);
    if (!msg || !msg.conversationId) return res.status(404).json({ error: 'Message not found' });
    if (msg.resolved && !['offer_view'].includes(action)) return res.status(409).json({ error: 'Already answered' });
    const conv = msg.conversationId;
    const helper = msg.helperId || 'abel';
    const user = db.getUser(userId)!;
    const out: ChatMessage[] = [];
    const card = (t: MessageCard['type']) => msg.cards?.find((c) => c.type === t);

    switch (action) {
      case 'offer_show':
      case 'offer_no':
      case 'offer_off': {
        const c = card('offer');
        const p = c && getPartner(c.data!.partnerId);
        if (!p) return res.status(400).json({ error: 'No offer on this message' });
        if (action === 'offer_show') {
          db.updateMessage(msg.id, { resolved: p.cta });
          const h = offerHeadline(userId, p.id);
          const home = h.used.length ? db.getCabinetEntry(h.used[0]) : undefined;
          out.push(agentMsg(userId, conv, helper, home?.target ? `Here are three on Kotiväli that work with a ${fmt(home.target.amount)} deposit:` : `Here’s what ${p.name} has:`, {
            cards: [{ type: 'offer_list', data: { partnerId: p.id, name: p.name, initials: p.initials, color: p.color, items: p.items, view: p.view, buy: p.buy, verb: p.verb, feeText: p.feeText } }],
            usedEntryIds: h.used,
          }));
        } else if (action === 'offer_no') {
          db.updateMessage(msg.id, { resolved: 'No thanks' });
          out.push(agentMsg(userId, conv, helper, 'No problem 👍 I won’t bring it up again in this chat.'));
        } else {
          db.updateMessage(msg.id, { resolved: 'Turn off partner offers' });
          db.updateUser(userId, { offersOff: true });
          out.push(agentMsg(userId, conv, helper, 'Done, no more partner offers. You can turn them back on any time in Who sees it.'));
        }
        break;
      }
      case 'offer_view':
      case 'offer_buy': {
        const c = card('offer_list');
        const p = c && getPartner(c.data!.partnerId);
        const item = p && p.items[Number(payload.index)];
        if (!p || !item) return res.status(400).json({ error: 'No such item' });
        if (msg.resolved) return res.status(409).json({ error: 'Already bought' });
        if (action === 'offer_view') {
          out.push(userMsg(userId, conv, helper, `${p.view}: ${item.title}`));
          out.push(agentMsg(userId, conv, helper, `Sent to ${p.name} (demo) ✓ They only get your name and phone number. Nothing Abel knows about you is shared.`));
          break;
        }
        const fee = fin.partnerFee(p.fee, item.price);
        const back = Math.round(fee * p.shareBack);
        db.updateMessage(msg.id, { resolved: `bought:${payload.index}` });
        db.addEarning({ id: id('earn'), userId, partnerId: p.id, partnerName: p.name, what: `You ${p.verb} ${item.title}`, fee, back, createdAt: now() });
        db.updateUser(userId, { accounts: { ...user.accounts, savings: { ...user.accounts.savings, balance: Math.round((user.accounts.savings.balance + back) * 100) / 100 } } });
        out.push(userMsg(userId, conv, helper, `${p.id === 'homes' ? 'I bought' : p.buy.replace(' (demo)', '')}: ${item.title}`));
        const home = p.id === 'homes' ? db.getCabinetEntries(userId).find((e) => e.goalType === 'home' && e.status === 'active') : undefined;
        out.push(agentMsg(userId, conv, helper, `${p.id === 'homes' ? 'Congratulations on your new home! 🎉' : 'Done (demo) ✓'}\n\nNordea earned ${fmt(fee)} from ${p.name} for this. As promised, ${fmt(back)} of it goes back to your savings account.`, {
          suggestions: home ? [`Mark “${home.title}” as done`] : [],
          cards: [{ type: 'info', data: { link: 'privacy', label: 'See what Nordea earned' } }],
        }));
        break;
      }
      case 'plan_confirm':
      case 'plan_cancel': {
        const c = card('confirm_plan');
        if (!c) return res.status(400).json({ error: 'No plan on this message' });
        if (action === 'plan_cancel') {
          db.updateMessage(msg.id, { resolved: 'Cancel' });
          out.push(agentMsg(userId, conv, helper, 'Okay, nothing changes. Your saving stays as it is.'));
          break;
        }
        const amt = Number(c.data!.amount);
        db.updateMessage(msg.id, { resolved: 'Yes, set it up' });
        db.updateUser(userId, { extraMonthly: (user.extraMonthly || 0) + amt, points: (user.points || 0) + 50 });
        const goal = fin.primaryGoal(userId);
        out.push(agentMsg(userId, conv, helper, `Done ✓ ${fmt(amt)} will move to ${goal ? `“${goal.title}”` : 'your savings'} every month, starting ${new Date(c.data!.starts + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}. You can stop it any time in Payday autopilot.`, {
          usedEntryIds: goal ? [goal.id] : [],
        }));
        break;
      }
      case 'save_private':
      case 'save_no': {
        const c = card('confirm_save');
        if (!c) return res.status(400).json({ error: 'Nothing to save on this message' });
        if (action === 'save_no') {
          db.updateMessage(msg.id, { resolved: 'Don’t save it' });
          out.push(agentMsg(userId, conv, helper, 'Okay, I won’t keep it. 💙'));
          break;
        }
        const e = entryFromDraft(userId, c.data!.draft, { private: true, provenance: { channel: 'app', messageId: msg.id } });
        db.addCabinetEntry(e, { by: 'you', how: 'Saved privately in chat' });
        const undoToken = id('undo');
        db.addUndoRecord({ undoToken, timestamp: now(), userId, action: 'create', description: `Added "${e.title}" (private)`, previousEntry: null, entryId: e.id });
        db.updateMessage(msg.id, { resolved: 'Save privately' });
        out.push(agentMsg(userId, conv, helper, 'Saved privately 🔒 Only I can read it, never offers.', { notes: [{ text: `📌 Abel will remember this: ${e.title}`, undoToken, entryId: e.id }] }));
        break;
      }
      case 'handoff_connect':
      case 'handoff_no': {
        const c = card('handoff');
        if (!c) return res.status(400).json({ error: 'No hand-off on this message' });
        if (action === 'handoff_no') {
          db.updateMessage(msg.id, { resolved: 'Not now' });
          out.push(agentMsg(userId, conv, helper, 'No problem, nothing was shared. Just ask whenever you’re ready.'));
          break;
        }
        const prev = previewCabinetForAgent(userId, 'adviser');
        const today = now().slice(0, 10);
        const share = db.addShare({ id: id('share'), userId, agentId: 'adviser', items: prev.allowed.map((e) => e.title), createdAt: now(), until: fin.addDays(today, 7), revoked: false });
        // The adviser reads what was shared (a logged gateway read, which also earns the customer points).
        readCabinetThroughGateway(userId, 'adviser', 'Meeting prep: what you shared');
        db.updateMessage(msg.id, { resolved: 'Connect me' });
        out.push(agentMsg(userId, conv, helper, `Connected ✓ A Nordea adviser will contact you. They see ${share.items.length} things you approved, once, until ${fmtDay(share.until)}.`, {
          cards: [{ type: 'info', data: { shareId: share.id, label: 'Stop sharing now' } }],
        }));
        break;
      }
      case 'import_save':
      case 'import_no': {
        const c = card('import');
        if (!c) return res.status(400).json({ error: 'No import on this message' });
        if (action === 'import_no') {
          // Nothing was approved: the suggestions are dropped from the card, so they can't reach Abel later.
          db.updateMessage(msg.id, { resolved: 'Not now', cards: msg.cards!.map((x) => (x === c ? { ...x, data: { ...x.data, items: [], savedIds: [] } } : x)) });
          const kept = c.data!.documentId ? db.getDocument(c.data!.documentId) : undefined;
          out.push(agentMsg(userId, conv, helper, kept ? `Okay, nothing saved from it. Your copy stays in Your documents until ${fmtDay(kept.expiresAt.slice(0, 10))}, and you can delete it any time.` : 'Okay, nothing saved. I don’t keep the file.'));
          break;
        }
        const items: ImportItem[] = c.data!.items;
        const picked = (Array.isArray(payload.selected) ? payload.selected : []).map(Number).filter((i: number) => items[i]);
        if (!picked.length) return res.status(400).json({ error: 'Nothing selected' });
        const how = `From ${c.data!.source}`;
        const ids: string[] = [];
        let updated = 0;
        const undoNotes: NonNullable<ChatMessage['notes']> = [];
        const touched: string[] = [];
        for (const i of picked) {
          const x = items[i];
          const old = x.updates && x.duplicateOfId ? db.getCabinetEntry(x.duplicateOfId) : undefined;
          if (old && old.userId === userId && old.status !== 'archived') {
            touched.push(old.id);
            // Ticking a "Changes …" line updates the existing thing instead of adding a second copy.
            const prev = { ...old };
            db.updateCabinetEntry(old.id, { target: x.target || old.target, status: old.status === 'stale' ? 'active' : old.status, confirmedAt: now() }, { by: 'you', how });
            const undoToken = id('undo');
            db.addUndoRecord({ undoToken, timestamp: now(), userId, action: 'update', description: `Updated "${old.title}"`, previousEntry: prev, entryId: old.id });
            undoNotes.push({ text: `📌 Updated: ${old.title}`, undoToken, entryId: old.id });
            updated++;
            continue;
          }
          // Older cards put the note into detail; never save those notes as the detail.
          const detail = x.note || !/^(Looks private|Already in what Abel knows|Changes “)/.test(x.detail || '') ? x.detail || '' : '';
          const e: CabinetEntry = {
            id: id('entry'), userId, type: x.type, title: x.title, detail: `${detail}${detail ? ' · ' : ''}From ${c.data!.source}`, source: 'document',
            status: 'active', private: !!x.sensitive, readableBy: { abel: true, offers: false }, provenance: { channel: c.data!.channel === 'whatsapp' ? 'whatsapp' : 'app', documentId: c.data!.documentId || c.data!.source, messageId: msg.id },
            target: x.target, goalType: x.type === 'goal' ? x.goalType || 'other' : undefined, reviewed: true, confirmedAt: now(), createdAt: now(), updatedAt: now(),
          };
          db.addCabinetEntry(e, { by: 'you', how });
          ids.push(e.id);
        }
        // A kept file remembers what came from it, so deleting the file can offer to delete those too.
        const doc = c.data!.documentId ? db.getDocument(c.data!.documentId) : undefined;
        if (doc) db.updateDocument(doc.id, { entryIds: [...doc.entryIds, ...ids] });
        const notes = [...undoNotes];
        if (ids.length) {
          const undoToken = id('undo');
          db.addUndoRecord({ undoToken, timestamp: now(), userId, action: 'create_many', description: `Imported ${ids.length} things`, previousEntry: null, entryIds: ids });
          notes.unshift({ text: `📌 Abel will remember ${ids.length === 1 ? 'this' : 'these'}`, undoToken });
        }
        const total = ids.length + updated;
        // Only what was ticked stays on the card (unticked suggestions are dropped), and the card remembers
        // which entries came from it, so Abel's history can show their current state.
        db.updateMessage(msg.id, {
          resolved: `Save ${total} ${total === 1 ? 'thing' : 'things'}`,
          cards: msg.cards!.map((x) => (x === c ? { ...x, data: { ...x.data, items: picked.map((i: number) => items[i]), savedIds: [...ids, ...touched] } } : x)),
        });
        const parts = [ids.length ? `Saved ${ids.length}` : '', updated ? `updated ${updated}` : ''].filter(Boolean).join(' and ');
        out.push(agentMsg(userId, conv, helper, `${parts.charAt(0).toUpperCase() + parts.slice(1)} ✓ I’ll use ${total === 1 ? 'it' : 'them'} from now on. Offers can’t read any of it unless you allow it.`, { notes }));
        break;
      }
      case 'dup_update':
      case 'dup_both':
      case 'dup_keep': {
        const c = card('duplicate');
        if (!c) return res.status(400).json({ error: 'No choice on this message' });
        const { existing, draft, sensitive } = c.data!;
        if (action === 'dup_keep') {
          db.updateMessage(msg.id, { resolved: 'Leave it as it is' });
          out.push(agentMsg(userId, conv, helper, `Okay, I’ll keep “${existing.title}” as it is.`));
          break;
        }
        if (action === 'dup_both') {
          const e = entryFromDraft(userId, draft, { private: !!sensitive, provenance: { channel: 'app', messageId: msg.id } });
          db.addCabinetEntry(e, { by: 'you', how: 'In chat, kept both' });
          const undoToken = id('undo');
          db.addUndoRecord({ undoToken, timestamp: now(), userId, action: 'create', description: `Added "${e.title}"`, previousEntry: null, entryId: e.id });
          db.updateMessage(msg.id, { resolved: 'Keep both' });
          out.push(agentMsg(userId, conv, helper, `Saved “${e.title}” next to “${existing.title}”.${sensitive ? ' 🔒 Only I can read it.' : ''}`, { notes: [{ text: `📌 Abel will remember this: ${e.title}`, undoToken, entryId: e.id }] }));
          break;
        }
        const old = db.getCabinetEntry(existing.id);
        if (!old || old.userId !== userId) return res.status(404).json({ error: 'That entry no longer exists' });
        const prev = { ...old };
        const updates: Partial<CabinetEntry> = { title: draft.title || old.title, detail: draft.detail || old.detail, confirmedAt: now() };
        if (draft.target) updates.target = draft.target;
        if (old.status === 'stale') updates.status = 'active';
        db.updateCabinetEntry(old.id, updates, { by: 'you', how: 'In chat' });
        const undoToken = id('undo');
        db.addUndoRecord({ undoToken, timestamp: now(), userId, action: 'update', description: `Updated "${old.title}"`, previousEntry: prev, entryId: old.id });
        db.updateMessage(msg.id, { resolved: 'Update it' });
        out.push(agentMsg(userId, conv, helper, `Updated ✓ “${updates.title}”${draft.target ? ` is now ${fmt(draft.target.amount)} by ${fmtDay(draft.target.date)}` : ''}. The old version is in its history.`, {
          notes: [{ text: `📌 Updated: ${updates.title}`, undoToken, entryId: old.id }],
        }));
        break;
      }
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
    res.json({ messages: out, resolvedMessageId: msg.id });
  });

  // Rewards: example rewards, points are really spent, the level never drops.
  app.get('/api/rewards', (_req, res) => res.json({ rewards: REWARDS }));
  // ---- Nordea account data (fictional): upload a file, or add a row to Supabase → nordea_feed ----
  app.get('/api/nordea-data', (req, res) => {
    const userId = String(req.query.userId || 'lauri');
    const u = db.getUser(userId);
    if (!u) return res.status(404).json({ error: 'Unknown customer' });
    res.json({ info: u.nordeaData || null, transactions: db.getTransactions(userId).length, feed: feedStatus() });
  });
  app.post('/api/nordea-data', (req, res) => {
    const { userId = 'lauri', text, fileName = '', data } = req.body || {};
    if (!db.getUser(userId)) return res.status(404).json({ error: 'Unknown customer' });
    let parsed: NordeaData;
    try {
      parsed = data && typeof data === 'object' ? data : readNordeaFile(String(text || ''), String(fileName));
    } catch (err: any) {
      return res.status(400).json({ error: `Couldn’t read the file: ${String(err?.message || err).slice(0, 200)}. Use the JSON or CSV format of the example files.` });
    }
    const r = applyNordeaData(userId, parsed, fileName ? `Uploaded ${String(fileName).slice(0, 60)}` : 'Uploaded data');
    if (!r.ok) return res.status(400).json({ error: r.message });
    res.json({ result: r });
  });
  app.post('/api/nordea-data/check', async (req, res) => {
    const userId = String((req.body || {}).userId || 'lauri');
    const out = await checkFeed();
    res.json({ applied: out.applied.filter((a) => a.userId === userId || !userId), feed: out.status });
  });

  // Points from the customer's data: for what they share and for how often it's read.
  app.get('/api/data-rewards', (req, res) => {
    const userId = String(req.query.userId || 'lauri');
    if (!db.getUser(userId)) return res.status(404).json({ error: 'Unknown customer' });
    res.json(dataRewardsSummary(userId));
  });
  app.post('/api/rewards/redeem', (req, res) => {
    const { userId = 'lauri', rewardId } = req.body || {};
    const u = db.getUser(userId);
    const r = REWARDS.find((x) => x.id === rewardId);
    if (!u || !r) return res.status(404).json({ error: 'Reward not found' });
    if ((u.points || 0) < r.pts) return res.status(400).json({ error: `You need ${r.pts - (u.points || 0)} more points` });
    const updates: any = {
      points: (u.points || 0) - r.pts,
      pointsSpent: (u.pointsSpent || 0) + r.pts,
      redeemed: [...(u.redeemed || []), { rewardId: r.id, title: r.title, pts: r.pts, at: now() }],
    };
    if (r.id === 'boost') updates.accounts = { ...u.accounts, savings: { ...u.accounts.savings, balance: u.accounts.savings.balance + 10 } };
    const user = db.updateUser(userId, updates);
    res.json({ user, message: r.done });
  });

  app.post('/api/settings', (req, res) => {
    const { userId = 'lauri', offersOff } = req.body || {};
    const u = db.updateUser(userId, { offersOff: !!offersOff });
    res.json({ user: u });
  });

  app.post('/api/shares/:id/revoke', (req, res) => {
    const s = db.updateShare(req.params.id, { revoked: true, revokedAt: now() });
    if (!s) return res.status(404).json({ error: 'Share not found' });
    res.json({ share: s, message: 'Sharing stopped. The adviser can’t see it any more.' });
  });

  // Import a chat, a text file, a PDF or a photo. Sample = the built-in fictional chat between Lauri and Mia.
  app.post('/api/import', async (req, res) => {
    const { userId = 'lauri', conversationId, helperId = 'abel', text, fileName, sample, fileBase64, mimeType, thumb, keep } = req.body || {};
    let conv = conversationId ? db.getConversation(conversationId) : undefined;
    if (!conv || conv.userId !== userId) conv = newConversation(userId, helperId);
    const isImage = /^image\/(jpeg|png|webp|heic|heif)$/.test(String(mimeType || ''));
    const isPdf = mimeType === 'application/pdf';
    const isSheet = mimeType === XLSX_MIME || /\.csv$/i.test(String(fileName || ''));
    if (fileBase64 && !isImage && !isPdf && mimeType !== XLSX_MIME) return res.status(400).json({ error: 'I can read photos (JPG, PNG, WebP), PDFs, Excel (.xlsx), CSV and text files.' });
    if (fileBase64 && String(fileBase64).length > 11_000_000) return res.status(413).json({ error: 'That file is too big. Try one under 8 MB.' });

    const plain = /\.csv$/i.test(String(fileName || '')) ? csvText(String(text || '')).text : String(text || '');
    // A WhatsApp export ("30/10/2026, 14:05 - Mia: …" or "[30.10.26, 14.05.12] Mia: …"): its entries say so.
    const waLines = (plain.match(/^\[?\d{1,2}[./-]\d{1,2}[./-]\d{2,4},?\s+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\]?\s*(?:-\s*)?[^:\n]{1,40}:/gm) || []).length;
    const channel: 'whatsapp' | 'app' = !fileBase64 && waLines >= 2 ? 'whatsapp' : 'app';
    const r = await proposeFromContent(userId, fileBase64 ? { file: { mimeType, data: String(fileBase64) } } : { text: sample ? null : plain });
    const source = sample ? r.source : String(fileName || (isImage ? 'Photo' : 'your file')).slice(0, 80);
    const kind: 'image' | 'pdf' | 'text' | 'sheet' = isImage ? 'image' : isPdf ? 'pdf' : isSheet ? 'sheet' : 'text';
    // "Keep a copy" was ticked: store the file in Your documents (deleted after 30 days, or whenever the customer wants).
    // Otherwise nothing of the file is kept, not even a preview.
    let doc: StoredDocument | undefined;
    let keepError = '';
    if (keep && !sample && (fileBase64 || text)) {
      try {
        const body = fileBase64 ? Buffer.from(String(fileBase64), 'base64') : Buffer.from(String(text), 'utf-8');
        doc = await keepDocument({ userId, name: source, kind, mimeType: fileBase64 ? String(mimeType) : 'text/plain; charset=utf-8', body, conversationId: conv.id });
      } catch (err: any) {
        keepError = String(err?.message || err).slice(0, 200);
        console.error('Could not keep the file:', keepError);
      }
    }
    const u: ChatMessage = {
      id: id('msg-user'), userId, agentId: 'abel', channel: 'app', sender: 'user', conversationId: conv.id, helperId: conv.helperId,
      text: isImage ? '' : `📄 ${source}`, createdAt: now(),
      attachment: { name: source, kind, documentId: doc?.id, thumb: doc && isImage && typeof thumb === 'string' && thumb.length < 60000 ? thumb : undefined },
    };
    db.addMessage(u);
    if (doc) db.updateDocument(doc.id, { messageId: u.id });
    const keptLine = sample ? '' : doc ? `\n\nI kept a copy in Your documents until ${fmtDay(doc.expiresAt.slice(0, 10))}. You can delete it any time.` : keepError ? '\n\nI couldn’t keep a copy this time, so the file isn’t stored.' : '';
    const body = sample ? SAMPLE_CHAT.map(([w, t]) => `${w}: ${t}`).join('\n') : undefined;

    let a: ChatMessage;
    if (r.kind === 'no_vision') {
      a = agentMsg(userId, conv.id, conv.helperId, `I can’t read ${isImage ? 'photos' : 'scanned PDFs'} right now. If you have it as a PDF with text, an Excel or a text file, send that instead, or just tell me the important part (for example the amount).${keptLine}`, { errorInfo: 'No model that reads images is available (needs Gemini).', suggestions: ['Can I afford 1 000 €?', 'Am I on track?'] });
    } else if (r.kind === 'no_ai' && !sample) {
      a = agentMsg(userId, conv.id, conv.helperId, `I can’t read files in this copy of the app yet. Tell me the important part and I’ll help with that.${keptLine}`, { errorInfo: 'No AI key set (not_configured).' });
    } else if (r.kind === 'error') {
      a = agentMsg(userId, conv.id, conv.helperId, `I couldn’t read ${isImage ? 'that photo' : `“${source}”`} just now. Try again in a minute, or tell me the important part.${keptLine}`, { errorInfo: r.errorDetail });
    } else {
      const what = sample ? `I read your chat with Mia (${r.lines} messages).` : r.summary ? r.summary : `I read “${source}”.`;
      const suggestions: string[] = [];
      if (r.amount && ['price_tag', 'receipt', 'bill', 'other'].includes(r.kind || '')) suggestions.push(r.kind === 'bill' ? `Can I pay ${fmt(r.amount, r.amount % 1 ? 2 : 0)} this month?` : `Can I afford ${fmt(r.amount, r.amount % 1 ? 2 : 0)}?`);
      a = r.items.length
        ? agentMsg(userId, conv.id, conv.helperId, `${what}${keptLine}\n\nHere’s what I’d remember. Untick anything you’d rather I didn’t keep:`, {
            cards: [{ type: 'import', data: { items: r.items, source, transcript: body, documentId: doc?.id, channel } }],
          })
        : agentMsg(userId, conv.id, conv.helperId, doc ? `${what}\n\nI didn’t find anything about your goals or plans worth remembering.${keptLine}` : `${what}\n\nI didn’t find anything about your goals or plans worth remembering, so I won’t keep it.`, { suggestions });
    }
    res.status(201).json({ conversationId: conv.id, messages: [u, a] });
  });

  // ---- Your documents (kept copies) ----
  app.get('/api/documents', (req, res) => {
    const userId = String(req.query.userId || 'lauri');
    res.json({ documents: db.getDocuments(userId).map(docInfo), keepDays: KEEP_DAYS });
  });

  // Opens the kept file. Only for its owner; the bytes never go to anyone else.
  app.get('/api/documents/:id/file', async (req, res) => {
    const userId = String(req.query.userId || 'lauri');
    const d = db.getDocument(req.params.id);
    if (!d || d.userId !== userId) return res.status(404).json({ error: 'Document not found' });
    try {
      const buf = await readDocument(d);
      res.setHeader('Content-Type', d.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${d.name.replace(/[^a-zA-Z0-9._ -]/g, '_')}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(buf);
    } catch (err: any) {
      res.status(404).json({ error: 'The file is no longer there', detail: String(err?.message || err).slice(0, 200) });
    }
  });

  // Delete a kept file. alsoEntries=true also deletes what was saved from it, for good.
  app.delete('/api/documents/:id', async (req, res) => {
    const userId = String(req.query.userId || req.body?.userId || 'lauri');
    const alsoEntries = String(req.query.alsoEntries || req.body?.alsoEntries || '') === 'true';
    const d = db.getDocument(req.params.id);
    if (!d || d.userId !== userId) return res.status(404).json({ error: 'Document not found' });
    try {
      const r = await deleteDocument(d, alsoEntries);
      res.json({ deleted: d.id, removedEntries: r.removed, message: r.removed ? `Deleted “${d.name}” and ${r.removed} ${r.removed === 1 ? 'thing' : 'things'} saved from it` : `Deleted “${d.name}”` });
    } catch (err: any) {
      res.status(500).json({ error: 'Could not delete the file. Please try again.', detail: String(err?.message || err).slice(0, 200) });
    }
  });

  // The history of one thing in What Abel knows, newest first.
  app.get('/api/entries/:id/history', (req, res) => {
    const userId = String(req.query.userId || 'lauri');
    const e = db.getCabinetEntry(req.params.id);
    if (!e || e.userId !== userId) return res.status(404).json({ error: 'Entry not found' });
    res.json({ history: [...db.getEntryHistory(e.id)].reverse() });
  });

  // Delete one chat (Recent chats → bin icon).
  app.delete('/api/conversations/:id', (req, res) => {
    const userId = String(req.query.userId || 'lauri');
    if (!db.getConversation(req.params.id)) return res.status(404).json({ error: 'Chat not found' });
    const n = db.deleteConversation(userId, req.params.id);
    res.json({ deletedMessages: n, message: 'Chat deleted' });
  });

  // "Delete my chats". What Abel knows and kept documents stay (they have their own delete).
  app.post('/api/chats/delete', (req, res) => {
    const { userId = 'lauri' } = req.body || {};
    const n = db.deleteChats(userId);
    res.json({ deletedMessages: n, message: n ? 'Your chats are deleted' : 'There were no chats to delete' });
  });

  app.get('/api/db-status', (_req, res) => res.json(db.status()));

  // More → Check Abel's answers: real questions to the real AI on a copy of Lauri, graded automatically.
  let selftestRunning = false;
  app.post('/api/selftest', async (_req, res) => {
    if (selftestRunning) return res.status(409).json({ error: 'A check is already running' });
    selftestRunning = true;
    try {
      res.json(await runSelfTest());
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err).slice(0, 300) });
    } finally {
      selftestRunning = false;
    }
  });

  // When the customer confirms something Nordea noticed. For a salary change, Abel follows up in a new chat.
  app.post('/api/events/observation-confirmed', (req, res) => {
    const { userId = 'lauri', entryId } = req.body || {};
    const e = db.getCabinetEntry(entryId);
    if (!e || e.userId !== userId) return res.status(404).json({ error: 'Entry not found' });
    db.updateCabinetEntry(e.id, { reviewed: true, confirmedAt: now() }, { by: 'you', how: 'You confirmed it' });
    const u = db.getUser(userId)!;
    db.updateUser(userId, { points: (u.points || 0) + 10 });
    // Only a salary (or pension) change gets Abel's follow-up. ("New regular payment: …" is not one.)
    if (!(e.id.endsWith('-obs-salary') || /\b(salary|pension)\b/i.test(e.title))) return res.json({ entry: db.getCabinetEntry(e.id) });
    const sal = fin.salaryInfo(userId);
    const acc = fin.accounts(userId)!;
    const goal = fin.primaryGoal(userId);
    const conv = newConversation(userId, 'abel');
    const diff = sal.found ? sal.difference : 0;
    const savingLine = (u.extraMonthly || 0) > 0
      ? `Your pay went up by ${fmt(diff)} a month, and you now save ${fmt(acc.savings.monthlyDeposit)} a month.`
      : `Your pay went up by ${fmt(diff)} a month, but your saving stayed at ${fmt(acc.savings.monthlyDeposit)}.`;
    agentMsg(userId, conv.id, 'abel', `Thanks for confirming 🙌 ${savingLine}\n\n${goal ? `${(u.extraMonthly || 0) > 0 ? 'Want to check' : 'Want to update'} your “${goal.title}” plan${(u.extraMonthly || 0) > 0 ? ' still fits' : ' to match'}?` : 'Want to put some of it towards a goal?'}`, {
      suggestions: goal ? ['Yes, show me', 'Not now'] : ['Help me plan something', 'Not now'],
      usedEntryIds: [e.id, goal?.id].filter(Boolean) as string[],
    });
    res.json({ entry: db.getCabinetEntry(e.id), conversationId: conv.id });
  });
}
