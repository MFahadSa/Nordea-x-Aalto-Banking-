import React from 'react';
import { AccessLogEntry } from '../types.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  logs: AccessLogEntry[];
}

export const AccessLogModal: React.FC<Props> = ({ isOpen, onClose, logs }) => {
  if (!isOpen) return null;

  return (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div
        className="sheet"
        role="dialog"
        aria-label="Access Gateway Log"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '82vh', overflowY: 'auto', gap: '12px' }}
      >
        <div className="sec-title" style={{ padding: 0 }}>
          <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)' }}>
            Access Gateway Log
          </h3>
          <button
            className="btn small quiet"
            onClick={onClose}
            aria-label="Close"
            style={{ minHeight: '32px', padding: '4px 8px' }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: '13.5px', color: 'var(--muted)', margin: 0 }}>
          Every time Abel or another agent reads your cabinet, permissions are checked and recorded here.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {logs.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '24px' }}>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '14px' }}>
                No agent reads recorded yet.
              </p>
            </div>
          ) : (
            logs.map((log) => {
              const formattedTime = new Date(log.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              return (
                <div
                  key={log.id}
                  className="card"
                  style={{
                    padding: '12px 14px',
                    gap: '8px',
                    border: '1px solid var(--line)',
                    boxShadow: 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <b style={{ color: 'var(--brand)', fontSize: '15px' }}>
                      {log.agentName}
                    </b>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {formattedTime}
                    </span>
                  </div>

                  <p style={{ fontSize: '13.5px', margin: 0, color: 'var(--ink)' }}>
                    <b>Purpose:</b> {log.purpose}
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      fontSize: '13px',
                      marginTop: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="from you" />
                      <b>Granted ({log.itemsReadCount}):</b>
                    </div>
                    <p style={{ margin: '0 0 4px 14px', color: 'var(--ink-2)' }}>
                      {log.allowedItems.length > 0
                        ? log.allowedItems.join(', ')
                        : 'None'}
                    </p>

                    {log.blockedCount > 0 && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="from bank" />
                          <b style={{ color: 'var(--warn)' }}>
                            Blocked ({log.blockedCount}):
                          </b>
                        </div>
                        <ul
                          style={{
                            margin: '0 0 0 14px',
                            padding: 0,
                            listStyle: 'none',
                            color: 'var(--muted)',
                          }}
                        >
                          {log.blockedReasons.map((b, idx) => (
                            <li key={idx}>
                              {b.title}: {b.reason}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <button
          className="btn block primary"
          onClick={onClose}
          style={{ minHeight: '42px', fontSize: '14px', marginTop: '6px' }}
        >
          Close
        </button>
      </div>
    </div>
  );
};
