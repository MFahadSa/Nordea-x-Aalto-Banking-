import React, { useState } from 'react';
import { CabinetEntry } from '../types.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onGoalAdded: (entry: CabinetEntry, undoToken: string) => void;
}

export const AddGoalModal: React.FC<Props> = ({ isOpen, onClose, userId, onGoalAdded }) => {
  const [goalType, setGoalType] = useState<'home' | 'car' | 'travel' | 'buffer' | 'other'>('home');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState(30000);
  const [months, setMonths] = useState(18);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const defaultTitles: Record<string, string> = {
    home: 'Buy a home',
    car: 'Save for a car',
    travel: 'A big trip',
    buffer: 'Safety buffer',
    other: 'Personal goal',
  };

  const effectiveTitle = title.trim() || defaultTitles[goalType];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + months);
      const dateStr = targetDate.toISOString().split('T')[0];

      const res = await fetch('/api/cabinet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          type: 'goal',
          title: effectiveTitle,
          detail: `€${amount.toLocaleString()} target by ${targetDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
          goalType,
          target: {
            amount,
            date: dateStr,
          },
          readableBy: { abel: true, offers: true },
          source: 'customer',
        }),
      });

      if (!res.ok) throw new Error('Failed to create goal');
      const data = await res.json();
      onGoalAdded(data.entry, data.undoToken);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div
        className="sheet"
        role="dialog"
        aria-label="Add goal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '82vh', overflowY: 'auto', gap: '14px' }}
      >
        <div className="sec-title" style={{ padding: 0 }}>
          <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)' }}>
            Add a goal
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <span className="kicker" style={{ display: 'block', marginBottom: '6px' }}>
              Goal category
            </span>
            <div className="chips">
              {(['home', 'car', 'travel', 'buffer', 'other'] as const).map((type) => (
                <button
                  type="button"
                  key={type}
                  onClick={() => {
                    setGoalType(type);
                    if (!title) setTitle(defaultTitles[type]);
                  }}
                  className={`chip ${goalType === type ? 'on' : ''}`}
                >
                  {defaultTitles[type]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="kicker" style={{ display: 'block', marginBottom: '6px' }}>
              Goal title
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitles[goalType]}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--ink)',
                fontSize: '15px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <span className="kicker" style={{ display: 'block', marginBottom: '6px' }}>
                Amount (€)
              </span>
              <input
                type="number"
                min="100"
                step="100"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: 'var(--bg)',
                  color: 'var(--ink)',
                  fontSize: '15px',
                  fontWeight: 600,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <span className="kicker" style={{ display: 'block', marginBottom: '6px' }}>
                When
              </span>
              <select
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: 'var(--bg)',
                  color: 'var(--ink)',
                  fontSize: '14px',
                  fontWeight: 600,
                  boxSizing: 'border-box',
                }}
              >
                <option value={6}>In 6 months</option>
                <option value={12}>In 1 year</option>
                <option value={18}>In 18 months</option>
                <option value={24}>In 2 years</option>
                <option value={36}>In 3 years</option>
              </select>
            </div>
          </div>

          <p style={{ fontSize: '12.5px', color: 'var(--muted)', margin: '4px 0' }}>
            📌 You can undo it straight away. Abel will track it with you.
          </p>

          <div className="btns" style={{ marginTop: '4px' }}>
            <button
              type="submit"
              disabled={loading}
              className="btn primary block"
              style={{ minHeight: '44px' }}
            >
              {loading ? 'Saving…' : 'Add goal'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn quiet block"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
