import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, User } from '../types.js';
import { Sparkles, X, RotateCcw, ArrowUp } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  messages: ChatMessage[];
  onSendMessage: (text: string) => Promise<void>;
  onUndo: (undoToken: string) => void;
  onOpenAccessLog: () => void;
}

export const ChatModal: React.FC<Props> = ({
  isOpen,
  onClose,
  user,
  messages,
  onSendMessage,
  onUndo,
  onOpenAccessLog,
}) => {
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);

  // Initial welcome message if conversation is empty
  const defaultMessages: ChatMessage[] = [
    {
      id: 'default-welcome',
      userId: user.id,
      agentId: 'abel',
      channel: 'app',
      sender: 'agent',
      text: "How are things? Ask me anything about your money, or just tell me what’s on your mind.",
      createdAt: new Date().toISOString(),
    },
  ];

  const effectiveMessages = messages.length > 0 ? messages : defaultMessages;

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [effectiveMessages, isOpen, isTyping]);

  if (!isOpen) return null;

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isTyping) return;

    setInputText('');
    setIsTyping(true);

    try {
      await onSendMessage(text);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  const handleNewChat = () => {
    handleSend('hey');
  };

  const defaultSuggestions = [
    'Money’s tight right now',
    'I don’t know where to start',
    'Something changed in my life',
    'I’d rather talk to a person',
  ];

  // Get suggestions from the last message with suggestions, or default if none
  const lastMsgWithSuggestions = [...effectiveMessages]
    .reverse()
    .find((m) => m.suggestions && m.suggestions.length > 0);
  const currentSuggestions = lastMsgWithSuggestions?.suggestions || defaultSuggestions;

  return (
    <section className="chat opening" role="dialog" aria-label="Chat with Abel">
      {/* Header */}
      <header className="chat-h">
        <span className="bot-av lg" aria-hidden="true">
          <Sparkles className="w-5 h-5 text-white" />
        </span>
        <div className="chat-t">
          <b>Abel</b>
          <span id="chat-status">
            <i className="live-dot inline" />
            {isTyping ? 'typing…' : 'Your Nordea assistant · online'}
          </span>
        </div>

        <button
          className="chat-ic"
          onClick={handleNewChat}
          aria-label="Start a new conversation"
          title="New conversation"
        >
          <RotateCcw className="w-5 h-5" />
        </button>

        <button
          className="chat-ic"
          onClick={onClose}
          aria-label="Close chat"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Messages Stream */}
      <div className="chat-body" ref={chatBodyRef}>
        <div className="chat-date">
          <span>Today</span>
        </div>

        {effectiveMessages.map((msg, idx) => {
          const isUser = msg.sender === 'user';
          const prevMsg = effectiveMessages[idx - 1];
          const nextMsg = effectiveMessages[idx + 1];

          const isGroupStart = !prevMsg || prevMsg.sender !== msg.sender;
          const isGroupEnd = !nextMsg || nextMsg.sender !== msg.sender;

          if (isUser) {
            return (
              <div
                key={msg.id || idx}
                className={`mrow me pop ${isGroupStart ? 'gstart' : ''}`}
              >
                <div className="bub">
                  <span className="pre">{msg.text}</span>
                </div>
              </div>
            );
          }

          // Bot message
          return (
            <div
              key={msg.id || idx}
              className={`mrow bot pop ${isGroupStart ? 'gstart' : ''}`}
            >
              {isGroupEnd ? (
                <span className="bot-av" aria-hidden="true">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </span>
              ) : (
                <span className="av-sp" aria-hidden="true" />
              )}

              <div className="mcol">
                {isGroupStart && <span className="mname">Abel</span>}
                <div className="bub">
                  <span className="pre">{msg.text}</span>

                  {/* Subtle access gateway read line (Rule 8) */}
                  {msg.cards &&
                    msg.cards
                      .filter((c) => c.type === 'access_check' || c.title?.includes('Used'))
                      .map((card, cIdx) => (
                        <button
                          key={cIdx}
                          onClick={onOpenAccessLog}
                          className="btn link text-left mt-2 block"
                          style={{
                            fontSize: '13px',
                            color: 'var(--brand)',
                            textDecoration: 'underline',
                            padding: 0,
                          }}
                        >
                          {card.title || '🔒 Used cabinet data · see which'}
                        </button>
                      ))}

                  {/* Noted in your cabinet · Undo */}
                  {msg.notes && msg.notes.length > 0 && (
                    <>
                      {msg.notes.map((note, nIdx) => (
                        <div key={nIdx} className="noted">
                          <span>📌 {note.text || 'Noted in your cabinet'}</span>
                          {note.undoToken && (
                            <>
                              <span>·</span>
                              <button
                                onClick={() => onUndo(note.undoToken!)}
                                className="btn link"
                              >
                                Undo
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Bot typing indicator */}
        {isTyping && (
          <div className="mrow bot pop gstart">
            <span className="bot-av" aria-hidden="true">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </span>
            <div className="mcol">
              <span className="mname">Abel</span>
              <div className="bub typing" aria-label="Assistant is typing">
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
        )}

        {/* Quick reply pills */}
        {!isTyping && currentSuggestions.length > 0 && (
          <div className="qr pop">
            {currentSuggestions.map((sugg, sIdx) => (
              <button
                key={sIdx}
                className="qr-b"
                onClick={() => handleSend(sugg)}
              >
                {sugg}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Field */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="chat-in"
      >
        <label className="sr" htmlFor="ai-q">
          Message Abel
        </label>
        <input
          id="ai-q"
          type="text"
          placeholder="Message Abel…"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          autoComplete="off"
        />
        <button
          className="chat-send"
          type="submit"
          disabled={!inputText.trim() || isTyping}
          aria-label="Send"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      </form>

      {/* Footer */}
      <p className="chat-foot">Concept · fictional data · nothing saved without your OK</p>
    </section>
  );
};
