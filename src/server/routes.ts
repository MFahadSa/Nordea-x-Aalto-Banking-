// v14 routes: conversations with helpers, the real Abel, customer button actions, partner offers,
// one-time sharing, imports and the data the screens need. Money and fees are computed in code.
import type { Express, Request, Response } from 'express';
import { db } from './db.js';
import { previewCabinetForAgent } from './accessGateway.js';
import { getPartner, getAllPartners } from './partnerRegistry.js';
import * as fin from './finance.js';
import { abelTurn, proposeFromText, offerHeadline, SAMPLE_CHAT, ImportItem } from './abel.js';
import { getProvider } from './llm.js';
import { CabinetEntry, ChatMessage, Conversation, MessageCard } from '../types.js';

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

export function registerV14Routes(app: Express) {
  // Everything the screens need in one call.
  app.get('/api/state', (req, res) => {
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
      today: fin.DEMO_TODAY,
    });
  });

  app.get('/api/partners', (_req, res) => res.json({ partners: getAllPartners() }));

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
        const d = c.data!.draft;
        const e: CabinetEntry = {
          id: id('entry'), userId, type: d.type, title: d.title, detail: d.detail || '', source: 'customer', status: 'active', private: true,
          readableBy: { abel: true, offers: false }, provenance: { channel: 'app', messageId: msg.id }, target: d.target, goalType: d.goalType,
          reviewed: true, confirmedAt: now(), createdAt: now(), updatedAt: now(),
        };
        db.addCabinetEntry(e);
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
          db.updateMessage(msg.id, { resolved: 'Not now' });
          out.push(agentMsg(userId, conv, helper, 'Okay, nothing saved. I don’t keep the file.'));
          break;
        }
        const items: ImportItem[] = c.data!.items;
        const picked = (Array.isArray(payload.selected) ? payload.selected : []).map(Number).filter((i: number) => items[i]);
        if (!picked.length) return res.status(400).json({ error: 'Nothing selected' });
        const ids: string[] = [];
        for (const i of picked) {
          const x = items[i];
          const e: CabinetEntry = {
            id: id('entry'), userId, type: x.type, title: x.title, detail: `${x.sensitive ? 'Private' : x.detail} · From ${c.data!.source}`, source: 'document',
            status: 'active', private: !!x.sensitive, readableBy: { abel: true, offers: false }, provenance: { channel: 'app', documentId: c.data!.source, messageId: msg.id },
            target: x.target, goalType: x.target ? 'other' : undefined, reviewed: true, confirmedAt: now(), createdAt: now(), updatedAt: now(),
          };
          db.addCabinetEntry(e);
          ids.push(e.id);
        }
        const undoToken = id('undo');
        db.addUndoRecord({ undoToken, timestamp: now(), userId, action: 'create_many', description: `Imported ${ids.length} things`, previousEntry: null, entryIds: ids });
        db.updateMessage(msg.id, { resolved: `Save ${ids.length} ${ids.length === 1 ? 'thing' : 'things'}` });
        out.push(agentMsg(userId, conv, helper, `Saved ${ids.length} ✓ I’ll use ${ids.length === 1 ? 'it' : 'them'} from now on. Offers can’t read any of it unless you allow it.`, {
          notes: [{ text: `📌 Abel will remember ${ids.length === 1 ? 'this' : 'these'}`, undoToken }],
        }));
        break;
      }
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
    res.json({ messages: out, resolvedMessageId: msg.id });
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

  // Import a conversation or text file. Sample = the built-in fictional chat between Lauri and Mia.
  app.post('/api/import', async (req, res) => {
    const { userId = 'lauri', conversationId, helperId = 'abel', text, fileName, sample } = req.body || {};
    let conv = conversationId ? db.getConversation(conversationId) : undefined;
    if (!conv || conv.userId !== userId) conv = newConversation(userId, helperId);
    const r = await proposeFromText(userId, sample ? null : String(text || ''));
    const source = sample ? r.source : String(fileName || 'your file').slice(0, 80);
    const u = userMsg(userId, conv.id, conv.helperId, `📄 ${source}`);
    const body = sample ? SAMPLE_CHAT.map(([w, t]) => `${w}: ${t}`).join('\n') : undefined;
    const a = r.items.length
      ? agentMsg(userId, conv.id, conv.helperId, `I read ${sample ? `your chat with Mia (${r.lines} messages)` : `“${source}”`}. Here’s what I’d remember. Untick anything you’d rather I didn’t keep:`, {
          cards: [{ type: 'import', data: { items: r.items, source, transcript: body } }],
        })
      : agentMsg(userId, conv.id, conv.helperId, getProvider().isConfigured() ? `I read “${source}”, but didn’t find anything about your goals, plans or money worth remembering.` : 'I can read files once my AI connection is set up. In this copy of the app it isn’t, but the sample chat works.');
    res.status(201).json({ conversationId: conv.id, messages: [u, a] });
  });

  // When the customer confirms something Nordea noticed. For a salary change, Abel follows up in a new chat.
  app.post('/api/events/observation-confirmed', (req, res) => {
    const { userId = 'lauri', entryId } = req.body || {};
    const e = db.getCabinetEntry(entryId);
    if (!e || e.userId !== userId) return res.status(404).json({ error: 'Entry not found' });
    db.updateCabinetEntry(e.id, { reviewed: true, confirmedAt: now() });
    const u = db.getUser(userId)!;
    db.updateUser(userId, { points: (u.points || 0) + 10 });
    if (!/salary|pay/i.test(e.title)) return res.json({ entry: db.getCabinetEntry(e.id) });
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
