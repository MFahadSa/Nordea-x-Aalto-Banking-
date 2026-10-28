import React, { useState, useEffect } from 'react';
import { PhoneFrame } from './components/PhoneFrame.js';
import { NordeaLogo } from './components/NordeaLogo.js';
import { HomeTab } from './components/HomeTab.js';
import { ChatModal } from './components/ChatModal.js';
import { PersonaPickerModal } from './components/PersonaPickerModal.js';
import { AccessLogModal } from './components/AccessLogModal.js';
import { AddGoalModal } from './components/AddGoalModal.js';
import {
  User,
  CabinetEntry,
  Transaction,
  ChatMessage,
  AccessLogEntry,
  PersonaId,
} from './types.js';
import {
  fetchUsers,
  fetchUser,
  updateUserViewMode,
  fetchCabinetEntries,
  createCabinetEntry,
  updateCabinetEntry,
  deleteCabinetEntry,
  undoCabinetAction,
  fetchTransactions,
  fetchMessages,
  sendMessage,
  fetchAccessLog,
  resetDatabase,
} from './services/api.js';
import {
  Moon,
  Sun,
} from 'lucide-react';

export default function App() {
  const [currentPersonaId, setCurrentPersonaId] = useState<PersonaId>('lauri');
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<CabinetEntry[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLogEntry[]>([]);

  // Modals
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
  const [isAccessLogOpen, setIsAccessLogOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false);

  // Theme
  const [isDark, setIsDark] = useState(false);

  // Toast with undo
  const [toast, setToast] = useState<{
    message: string;
    undoToken?: string;
  } | null>(null);

  // Auto-hide toast after ~4 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Initial load
  useEffect(() => {
    loadUsersAndCurrent();
  }, []);

  // When persona switches
  useEffect(() => {
    if (currentPersonaId) {
      loadPersonaData(currentPersonaId);
    }
  }, [currentPersonaId]);

  // Apply light or dark mode strictly via data-theme
  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, [isDark]);

  async function loadUsersAndCurrent() {
    try {
      const uList = await fetchUsers();
      setUsers(uList);
      if (uList.length > 0) {
        const found = uList.find((u) => u.persona === currentPersonaId) || uList[0];
        setCurrentUser(found);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }

  async function loadPersonaData(userId: string) {
    try {
      const [u, cab, tx, msg, logs] = await Promise.all([
        fetchUser(userId),
        fetchCabinetEntries(userId),
        fetchTransactions(userId),
        fetchMessages(userId),
        fetchAccessLog(userId),
      ]);
      setCurrentUser(u);
      setEntries(cab.entries);
      setTransactions(tx);
      setMessages(msg);
      setAccessLogs(logs);
    } catch (err) {
      console.error('Failed to load persona data:', err);
    }
  }

  const handleToggleViewMode = async () => {
    if (!currentUser) return;
    const nextMode = currentUser.viewMode === 'full' ? 'calm' : 'full';
    try {
      const updated = await updateUserViewMode(currentUser.id, nextMode);
      setCurrentUser(updated);
      setToast({
        message: `Switched to ${nextMode === 'calm' ? 'Calm View (simplified, larger text)' : 'Full View'}`,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!currentUser) return;
    try {
      const res = await sendMessage(currentUser.id, text);
      setMessages((prev) => [...prev, res.userMessage, res.agentMessage]);
      // Refresh access logs because gateway was invoked
      const logs = await fetchAccessLog(currentUser.id);
      setAccessLogs(logs);
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const handleUndo = async (undoToken: string) => {
    try {
      const res = await undoCabinetAction(undoToken);
      if (currentUser) {
        const cab = await fetchCabinetEntries(currentUser.id);
        setEntries(cab.entries);
      }
      setToast({ message: `↩️ ${res.message}` });
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateEntry = async (id: string, updates: Partial<CabinetEntry>) => {
    try {
      const res = await updateCabinetEntry(id, updates);
      if (currentUser) {
        const cab = await fetchCabinetEntries(currentUser.id);
        setEntries(cab.entries);
      }
      setToast({ message: res.message, undoToken: res.undoToken });
      return res.undoToken;
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    try {
      const res = await deleteCabinetEntry(id);
      if (currentUser) {
        const cab = await fetchCabinetEntries(currentUser.id);
        setEntries(cab.entries);
      }
      setToast({ message: res.message, undoToken: res.undoToken });
      return res.undoToken;
    } catch (err) {
      console.error(err);
    }
  };

  const handleGoalAdded = (entry: CabinetEntry, undoToken: string) => {
    setEntries((prev) => [...prev, entry]);
    setToast({
      message: `📌 Added "${entry.title}" to Context Cabinet`,
      undoToken,
    });
  };

  const handleResetDatabase = async () => {
    try {
      await resetDatabase();
      await loadUsersAndCurrent();
      await loadPersonaData(currentPersonaId);
      setToast({ message: 'Database reset to initial synthetic personas.' });
    } catch (err) {
      console.error(err);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#E7E9F2] text-[#0000A0] font-bold">
        Loading The Banking Context Cabinet...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-2 sm:p-5 relative select-none">
      {/* Top stage branding header */}
      <div className="w-full max-w-md sm:max-w-xl flex items-center justify-between mb-2 px-2">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <NordeaLogo variant={isDark ? 'white' : 'blue'} className="h-5 w-auto" />
          <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 600 }}>
            · The Banking Context Cabinet
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setIsDark(!isDark)}
            className="chip"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              fontSize: '12.5px',
              borderRadius: '999px',
              fontWeight: 600,
            }}
            aria-label="Toggle dark mode"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-[#0000A0]" />
                <span>Dark</span>
              </>
            )}
          </button>
          <button
            onClick={() => setIsPersonaModalOpen(true)}
            className="chip"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              fontSize: '12.5px',
              borderRadius: '999px',
              fontWeight: 600,
            }}
            aria-label="Switch persona"
          >
            <span
              className={`avatar a-${currentUser.persona}`}
              style={{ width: '18px', height: '18px', fontSize: '10px' }}
            >
              {currentUser.name.charAt(0)}
            </span>
            <span>{currentUser.name}</span>
          </button>
        </div>
      </div>

      {/* Main 390x844 Phone Mockup */}
      <PhoneFrame
        statusBarTheme={isChatOpen ? 'light' : 'brand'}
        overlay={
          <>
            {/* Global In-Phone Toast Notification (.toast from design-system.css) */}
            {toast && (
              <div className="toast" role="status">
                <span>{toast.message}</span>
                {toast.undoToken && (
                  <button
                    onClick={() => {
                      handleUndo(toast.undoToken!);
                      setToast(null);
                    }}
                    className="btn link"
                    style={{
                      color: '#F0C25A',
                      marginLeft: '8px',
                      fontWeight: 700,
                      textDecoration: 'underline',
                      display: 'inline',
                    }}
                  >
                    Undo
                  </button>
                )}
              </div>
            )}

            {/* Abel Chat Sheet inside phone */}
            <ChatModal
              isOpen={isChatOpen}
              onClose={() => setIsChatOpen(false)}
              user={currentUser}
              messages={messages}
              onSendMessage={handleSendMessage}
              onUndo={handleUndo}
              onOpenAccessLog={() => {
                setIsChatOpen(false);
                setIsAccessLogOpen(true);
              }}
            />

            {/* Persona Picker Modal inside phone */}
            <PersonaPickerModal
              isOpen={isPersonaModalOpen}
              onClose={() => setIsPersonaModalOpen(false)}
              users={users}
              currentUserId={currentUser.id}
              onSelectPersona={(pId) => setCurrentPersonaId(pId)}
              onResetDatabase={handleResetDatabase}
            />

            {/* Access Log Audit Modal inside phone */}
            <AccessLogModal
              isOpen={isAccessLogOpen}
              onClose={() => setIsAccessLogOpen(false)}
              logs={accessLogs}
            />

            {/* Add Goal Modal inside phone */}
            <AddGoalModal
              isOpen={isAddGoalOpen}
              onClose={() => setIsAddGoalOpen(false)}
              userId={currentUser.id}
              onGoalAdded={handleGoalAdded}
            />
          </>
        }
      >
        <HomeTab
          user={currentUser}
          entries={entries}
          transactions={transactions}
          onOpenChat={() => setIsChatOpen(true)}
          onOpenAccessLog={() => setIsAccessLogOpen(true)}
          onOpenAddGoal={() => setIsAddGoalOpen(true)}
          onOpenPersonaModal={() => setIsPersonaModalOpen(true)}
          onUpdateEntry={handleUpdateEntry}
          onDeleteEntry={handleDeleteEntry}
        />
      </PhoneFrame>
    </div>
  );
}
