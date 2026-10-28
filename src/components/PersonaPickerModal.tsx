import React from 'react';
import { User, PersonaId } from '../types.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  currentUserId: string;
  onSelectPersona: (personaId: PersonaId) => void;
  onResetDatabase: () => void;
}

export const PersonaPickerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  users,
  currentUserId,
  onSelectPersona,
  onResetDatabase,
}) => {
  if (!isOpen) return null;

  return (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div
        className="sheet"
        role="dialog"
        aria-label="Choose a demo customer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sec-title" style={{ padding: 0 }}>
          <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)' }}>
            Choose a demo customer
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
          For presenting. Each one starts fresh with fictional data.
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '52vh',
            overflowY: 'auto',
          }}
        >
          {users.map((user) => {
            const isSelected = user.id === currentUserId;
            return (
              <button
                key={user.id}
                onClick={() => {
                  onSelectPersona(user.persona);
                  onClose();
                }}
                className={`user-row ${isSelected ? 'on' : ''}`}
                style={{ width: '100%' }}
              >
                <span className={`avatar a-${user.persona}`}>
                  {user.name.charAt(0)}
                </span>
                <span className="t">
                  <b>{user.name}, {user.age}</b>
                  <span>{user.roleDescription}</span>
                </span>
                {isSelected && (
                  <span
                    className="kicker"
                    style={{ color: 'var(--brand-soft)', fontWeight: 700 }}
                  >
                    Current
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          className="btn link"
          onClick={() => {
            if (window.confirm('Reset all synthetic personas & transactions to default?')) {
              onResetDatabase();
              onClose();
            }
          }}
          style={{
            color: 'var(--warn)',
            alignSelf: 'center',
            marginTop: '6px',
            fontSize: '13.5px',
          }}
        >
          Reset all synthetic personas to default
        </button>
      </div>
    </div>
  );
};
