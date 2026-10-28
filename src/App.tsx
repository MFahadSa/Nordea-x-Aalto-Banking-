import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PhoneFrame } from './components/PhoneFrame.js';
import { PersonaPickerModal } from './components/PersonaPickerModal.js';
import { AddGoalModal } from './components/AddGoalModal.js';
import { HomePage } from './components/HomePage.js';
import { KnowsPage, PrivacyPage, AutopilotPage, RewardsPage, ContactPage, MorePage } from './components/Pages.js';
import { Chat } from './components/Chat.js';
import { Icon } from './ui/icons.js';
import { CabinetEntry, ChatMessage, PersonaId, User } from './types.js';
import {
  AppState,
  fetchState,
  fetchUsers,
  updateCabinetEntry,
  deleteCabinetEntry,
  undoCabinetAction,
  updateUserViewMode,
  resetDatabase,
  sendChat,
  doAction,
  setOffersOff,
  revokeShare,
  importChat,
  confirmObservation,
  fetchConversationMessages,
} from './services/api.js';

type Page = 'home' | 'knows' | 'rewards' | 'contact' | 'more' | 'privacy' | 'autopilot';

function initialDark() {
  try {
    const saved = localStorage.getItem('abel-theme');
    if (saved) return saved === 'dark';
  } catch { /* storage may be blocked */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
}

export default function App() {
  const [personaId, setPersonaId] = useState<PersonaId>('lauri');
  const [state, setState] = useState<AppState | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [page, setPage] = useState<Page>('home');
  const [isDark, setIsDark] = useState(initialDark);
  const [toast, setToast] = useState<{ message: string; undoToken?: string } | null>(null);
  const [usersOpen, setUsersOpen] = useState(false);
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [helperId, setHelperId] = useState('abel');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [waiting, setWaiting] = useState(false);

  const refresh = useCallback(async (id: string = personaId) => {
    try {
      setState(await fetchState(id));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not load the app data');
    }
  }, [personaId]);

  useEffect(() => {
    refresh(personaId);
    fetchUsers().then(setUsers).catch(() => {});
  }, [personaId]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    try { localStorage.setItem('abel-theme', isDark ? 'dark' : 'light'); } catch { /* ignore */ }
  }, [isDark]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  const goPage = (p: Page) => {
    setPage(p);
    setChatOpen(false);
    screenRef.current?.scrollTo({ top: 0 });
  };

  // ---------- chat ----------
  const openHelper = (id: string) => {
    setHelperId(id);
    setConversationId(null);
    setMessages([]);
    setChatOpen(true);
  };
  const openConversation = async (id: string) => {
    const c = state?.conversations.find((x) => x.id === id);
    setHelperId(c?.helperId || 'abel');
    setConversationId(id);
    setMessages(await fetchConversationMessages(id));
    setChatOpen(true);
  };
  const appendFromServer = (convId: string, msgs: ChatMessage[], resolvedId?: string, resolvedText?: string) => {
    setConversationId(convId);
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const next = prev.map((m) => (m.id === resolvedId && resolvedText ? { ...m, resolved: resolvedText } : m));
      return [...next, ...msgs.filter((m) => !ids.has(m.id))];
    });
  };
  const send = async (text: string, opts?: { helperId: string; conversationId: string | null }) => {
    if (!state) return;
    const hId = opts ? opts.helperId : helperId;
    const cId = opts ? opts.conversationId : conversationId;
    const temp: ChatMessage = { id: 'tmp-' + Date.now(), userId: state.user.id, agentId: 'abel', channel: 'app', sender: 'user', text, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, temp]);
    setWaiting(true);
    try {
      const res = await sendChat(state.user.id, cId, hId, text);
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      appendFromServer(res.conversationId, res.messages);
      refresh();
    } catch (e: any) {
      setMessages((prev) => [...prev, { ...temp, id: 'err-' + Date.now(), sender: 'agent', text: 'Sorry, something went wrong on my side. Could you try again?' }]);
    } finally {
      setWaiting(false);
    }
  };
  /** Open a helper and send a first message straight away. */
  const startChat = (id: string, text?: string) => {
    openHelper(id);
    if (text) send(text, { helperId: id, conversationId: null });
  };
  const act = async (messageId: string, action: string, payload?: Record<string, unknown>) => {
    if (!state || !conversationId) return;
    setWaiting(true);
    try {
      const res = await doAction(state.user.id, messageId, action, payload);
      // Re-read the conversation so the tapped card shows its final state.
      const fresh = await fetchConversationMessages(conversationId);
      setMessages(fresh);
      refresh();
      void res;
    } catch (e: any) {
      setToast({ message: e?.message || 'That didn’t work' });
    } finally {
      setWaiting(false);
    }
  };
  const doImport = async (body: { sample?: boolean; text?: string; fileName?: string }) => {
    if (!state) return;
    if (!chatOpen) {
      setHelperId('abel');
      setMessages([]);
      setChatOpen(true);
    }
    setWaiting(true);
    try {
      const res = await importChat(state.user.id, chatOpen ? conversationId : null, chatOpen ? helperId : 'abel', body);
      appendFromServer(res.conversationId, res.messages);
    } finally {
      setWaiting(false);
    }
  };

  // ---------- cabinet ----------
  const undo = async (token: string) => {
    try {
      const r = await undoCabinetAction(token);
      setToast({ message: `↩︎ ${r.message}` });
      refresh();
    } catch {
      setToast({ message: 'That can’t be undone any more' });
    }
  };
  const update = async (e: CabinetEntry, updates: Partial<CabinetEntry>) => {
    const r = await updateCabinetEntry(e.id, updates);
    setToast({ message: r.message, undoToken: r.undoToken });
    refresh();
  };
  const archive = async (e: CabinetEntry) => {
    const r = await deleteCabinetEntry(e.id);
    setToast({ message: 'Removed. It’s kept in your history.', undoToken: r.undoToken });
    refresh();
  };
  const confirm = async (e: CabinetEntry) => {
    const r = await confirmObservation(state!.user.id, e.id);
    setToast({ message: 'Thanks · +10 points' });
    await refresh();
    if (r.conversationId) {
      setHelperId('abel');
      setConversationId(r.conversationId);
      setMessages(await fetchConversationMessages(r.conversationId));
      setChatOpen(true);
    }
  };

  if (error && !state) {
    return <div className="caption" style={{ padding: 40 }}>Couldn’t load the app: {error}</div>;
  }
  if (!state) {
    return <div className="caption" style={{ padding: 40 }}>Loading…</div>;
  }

  const isCalm = state.user.viewMode === 'calm';
  const tab = (k: Page, icon: string, label: string) => {
    const on = page === k || (k === 'more' && page === 'privacy') || (k === 'home' && page === 'autopilot');
    return (
      <button key={k} role="tab" aria-selected={on} onClick={() => goPage(k)}>
        <Icon name={icon} />
        <span>{label}</span>
      </button>
    );
  };

  const frame = (what: string) => setToast({ message: `${what} is part of the Nordea app you already have. This concept only adds Abel.` });

  return (
    <div className={isCalm ? 'calm' : ''}>
      <p className="caption"><b>The Banking Context Cabinet</b> · a concept for the Aalto × Nordea brief{!state.aiConnected && ' · AI not connected here'}</p>
      <div className="stagewrap">
        <PhoneFrame
          screenRef={screenRef}
          statusBarTheme={chatOpen ? 'light' : 'brand'}
          bottom={
            <nav className="nav nav5" role="tablist">
              {tab('home', 'home', 'Home')}
              {tab('knows', 'cab', 'Abel knows')}
              {tab('rewards', 'star', 'Rewards')}
              {tab('contact', 'contact', 'Contact')}
              {tab('more', 'more', 'More')}
            </nav>
          }
          overlay={
            <>
              <Chat
                open={chatOpen}
                helperId={helperId}
                userName={state.user.name}
                messages={messages}
                waiting={waiting}
                entries={state.entries}
                shares={state.shares}
                onClose={() => setChatOpen(false)}
                onNew={() => openHelper(helperId)}
                onSend={send}
                onAction={act}
                onUndo={undo}
                onOpenPage={(p) => goPage(p as Page)}
                onOpenHelper={openHelper}
                onRevoke={async (id) => { const r = await revokeShare(id); setToast({ message: r.message }); refresh(); }}
                onImport={doImport}
                onEditEntry={() => goPage('knows')}
              />
              <PersonaPickerModal
                isOpen={usersOpen}
                onClose={() => setUsersOpen(false)}
                users={users}
                currentUserId={state.user.id}
                onSelectPersona={(p) => { setPersonaId(p); setUsersOpen(false); setChatOpen(false); setPage('home'); }}
                onResetDatabase={async () => { await resetDatabase(); setUsersOpen(false); setChatOpen(false); refresh(); setToast({ message: 'Demo data reset' }); }}
              />
              <AddGoalModal
                isOpen={addGoalOpen}
                onClose={() => setAddGoalOpen(false)}
                userId={state.user.id}
                onGoalAdded={(e, undoToken) => { setToast({ message: `📌 Added “${e.title}”`, undoToken }); refresh(); }}
              />
              {toast && (
                <div className="toast" role="status">
                  <span>{toast.message}</span>
                  {toast.undoToken && (
                    <button className="btn link" style={{ color: '#F0C25A', marginLeft: 8 }} onClick={() => { undo(toast.undoToken!); setToast(null); }}>
                      Undo
                    </button>
                  )}
                </div>
              )}
            </>
          }
        >
          {page === 'home' && (
            <HomePage
              state={state}
              onFrame={frame}
              onOpenHelper={openHelper}
              onOpenConversation={openConversation}
              onOpenPage={(p) => goPage(p as Page)}
              onOpenUsers={() => setUsersOpen(true)}
              onConfirm={confirm}
              onWrong={(e) => update(e, { status: 'disputed' })}
              onArchive={archive}
              onKeep={(e) => update(e, { status: 'active', confirmedAt: new Date().toISOString() })}
            />
          )}
          {page === 'knows' && (
            <KnowsPage
              state={state}
              onAddGoal={() => setAddGoalOpen(true)}
              onTellAbel={() => openHelper('abel')}
              onImport={() => doImport({ sample: true })}
              onPrivacy={() => goPage('privacy')}
              onAskAbout={(t) => startChat('abel', t)}
              onUpdate={update}
              onArchive={archive}
            />
          )}
          {page === 'privacy' && (
            <PrivacyPage
              state={state}
              onBack={() => goPage('knows')}
              onToggleOffers={async () => { await setOffersOff(state.user.id, !state.user.offersOff); setToast({ message: state.user.offersOff ? 'Partner offers are on' : 'Partner offers are off' }); refresh(); }}
              onRevoke={async (id) => { const r = await revokeShare(id); setToast({ message: r.message }); refresh(); }}
            />
          )}
          {page === 'autopilot' && (
            <AutopilotPage state={state} onBack={() => goPage('home')} onPlan={(t) => startChat('autopilot', t)} />
          )}
          {page === 'rewards' && <RewardsPage state={state} onAsk={() => openHelper('abel')} onUse={(t) => setToast({ message: `Booked (demo): ${t}` })} onKnows={() => goPage('home')} />}
          {page === 'contact' && <ContactPage state={state} onHelper={openHelper} onOpenConversation={openConversation} />}
          {page === 'more' && (
            <MorePage
              state={state}
              isDark={isDark}
              onPage={(p) => goPage(p as Page)}
              onUsers={() => setUsersOpen(true)}
              onCalm={async () => { await updateUserViewMode(state.user.id, isCalm ? 'full' : 'calm'); refresh(); }}
              onDark={() => setIsDark(!isDark)}
              onReset={async () => { await resetDatabase(); refresh(); setToast({ message: 'Demo data reset' }); }}
            />
          )}
        </PhoneFrame>
      </div>
      <p className="foot">Student prototype. All data is made up; partners, offers and rewards are fictional examples, not real Nordea products.</p>
    </div>
  );
}
