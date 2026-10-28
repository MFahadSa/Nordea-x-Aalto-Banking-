import React, { useState } from 'react';
import { User, CabinetEntry, Transaction } from '../types.js';
import { NordeaLogo } from './NordeaLogo.js';

interface Props {
  user: User;
  entries: CabinetEntry[];
  transactions: Transaction[];
  onOpenChat: () => void;
  onOpenAccessLog: () => void;
  onOpenAddGoal: () => void;
  onOpenPersonaModal: () => void;
  onUpdateEntry: (id: string, updates: Partial<CabinetEntry>) => Promise<string | undefined>;
  onDeleteEntry: (id: string) => Promise<string | undefined>;
}

export const HomeTab: React.FC<Props> = ({
  user,
  entries,
  transactions,
  onOpenChat,
  onOpenAccessLog,
  onOpenAddGoal,
  onOpenPersonaModal,
  onUpdateEntry,
  onDeleteEntry,
}) => {
  const isCalm = user.viewMode === 'calm';
  const [cabinetExpanded, setCabinetExpanded] = useState(false);
  const [showAllObservations, setShowAllObservations] = useState(false);
  const [expandedWhyId, setExpandedWhyId] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [disputedIds, setDisputedIds] = useState<string[]>([]);
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDetail, setEditDetail] = useState('');

  // Pacing calculations
  const savingsBalance = user.accounts.savings.balance;
  const activeGoals = entries.filter((e) => e.type === 'goal' && e.status === 'active' && e.target);
  const primaryGoal = activeGoals.find((g) => g.goalType === 'home') || activeGoals[0];

  let targetAmount = 30000;
  let gapAmount = 8600;
  let progressPct = 47;
  let goalTitle = 'Buy a home';

  if (primaryGoal && primaryGoal.target) {
    targetAmount = primaryGoal.target.amount;
    goalTitle = primaryGoal.title;
    const now = new Date();
    const targetDate = new Date(primaryGoal.target.date);
    const months = Math.max(1, (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth()));
    const projected = savingsBalance + months * user.accounts.savings.monthlyDeposit;
    gapAmount = Math.max(0, targetAmount - projected);
    progressPct = Math.min(100, Math.round((savingsBalance / targetAmount) * 100));
  }

  // Monthly spent calculation
  const spentThisMonth = Math.abs(
    transactions
      .filter((t) => t.date.startsWith('2026-10') && t.account === 'current' && t.amount < 0 && t.category !== 'savings_transfer')
      .reduce((acc, t) => acc + t.amount, 0)
  ) || 2131.42;

  // Unreviewed observations
  const unreviewedObservations = entries.filter(
    (e) => e.source === 'nordea' && e.type === 'observation' && !e.reviewed && !disputedIds.includes(e.id)
  );

  const handleConfirmObservation = async (e: CabinetEntry) => {
    await onUpdateEntry(e.id, {
      reviewed: true,
      confirmedAt: new Date().toISOString(),
      detail: `${e.detail} (Confirmed by you)`,
    });
  };

  const handleRejectObservation = async (e: CabinetEntry) => {
    setDisputedIds((prev) => [...prev, e.id]);
    await onUpdateEntry(e.id, {
      reviewed: true,
      status: 'disputed',
      why: 'Customer indicated this observation does not reflect their reality.',
    });
  };

  // Cabinet stats
  const youCount = entries.filter((e) => e.source === 'customer' && e.status === 'active').length;
  const nordeaCount = entries.filter((e) => e.source === 'nordea' && e.status === 'active' && e.reviewed).length;
  const blindCount = entries.filter((e) => e.type === 'blind_spot').length || 1;

  // Helper for currency formatting: 2 decimals, right-aligned, bold
  const fmt = (n: number) =>
    Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ paddingBottom: '32px' }} className={isCalm ? 'calm-view' : ''}>
      {/* Header Band */}
      <header className="one-head">
        <div className="nh-top">
          <span className="concept-tag">Concept · fictional data</span>
          <span className="nh-right">
            <button className="nh-bell" onClick={onOpenAccessLog} aria-label="Notifications: 3">
              Notifications
              <span className="bell">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
                  <path d="M10 20a2 2 0 0 0 4 0" />
                </svg>
                <i>3</i>
              </span>
            </button>
            <button
              className="avatar"
              onClick={onOpenPersonaModal}
              title={`Switch persona (Current: ${user.name})`}
            >
              {user.name.charAt(0)}
            </button>
          </span>
        </div>
        <NordeaLogo variant="white" className="nlogo" />
        <h1>Welcome, {user.name}!</h1>
      </header>

      {/* Main Body with overlapping first card */}
      <div className="body one">
        {/* Quick Actions (Round 56px outlined circles) */}
        <div className="card n-card money">
          <div className="n-head">
            <h3>Quick actions</h3>
          </div>
          <div className="qa-row">
            <button className="qa-btn" onClick={onOpenChat}>
              <span className="qi">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.2 4.2L19 7" />
                </svg>
              </span>
              On track?
            </button>

            <button className="qa-btn" onClick={onOpenChat}>
              <span className="qi qi-ai">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3.5l1.9 4.9 4.9 1.9-4.9 1.9L12 17.1l-1.9-4.9-4.9-1.9 4.9-1.9z" />
                </svg>
                <i className="live-dot" />
              </span>
              Abel
            </button>

            <button
              className="qa-btn"
              onClick={() => {
                setCabinetExpanded(true);
                const el = document.getElementById('sec-cabinet');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <span className="qi">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <path d="M4 12h16M10 8h4M10 16h4" />
                </svg>
              </span>
              My cabinet
            </button>
          </div>
        </div>

        {/* Calm View Special Person Reassurance Widget */}
        {isCalm && (
          <div className="card" style={{ background: 'var(--surface)', borderLeft: '4px solid var(--ok)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Talk to a person</h3>
                <p style={{ color: 'var(--ink-2)', fontSize: '15px', marginTop: '4px' }}>
                  Nordea advisers are always here to help you over the phone or at a branch.
                </p>
              </div>
              <button
                className="btn primary"
                onClick={onOpenChat}
                style={{ minHeight: '44px', padding: '10px 18px', fontSize: '15px' }}
              >
                Call
              </button>
            </div>
          </div>
        )}

        {/* Accounts and cards (White 4px-radius card with dividers, bold right amounts) */}
        <div className="card n-card n-acc">
          <div className="n-head">
            <div>
              <h3>Accounts and cards</h3>
              <p className="n-sub">Available in savings {fmt(savingsBalance)}</p>
            </div>
          </div>

          <div className="n-row">
            <span className="n-l">
              <span className="n-name">Savings account</span>
              <span className="n-sub">{user.accounts.savings.iban}</span>
            </span>
            <span className="n-r">
              <b>{fmt(savingsBalance)}</b>
            </span>
          </div>

          <div className="n-row">
            <span className="n-l">
              <span className="n-name">Spent this month</span>
              <span className="n-sub">October, current account</span>
            </span>
            <span className="n-r">
              <b>{fmt(spentThisMonth)}</b>
            </span>
          </div>
        </div>

        {/* From Abel: Observations waiting for your check */}
        <section className="one-sec">
          <div className="sec-title">
            <h2>From Abel</h2>
            <span className="kicker">
              {unreviewedObservations.length} for you
            </span>
          </div>

          {unreviewedObservations.length > 0 ? (
            <>
              {/* First observation card */}
              <div className="card" style={{ gap: '10px' }}>
                <span className="from bank">Nordea noticed</span>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>
                  {unreviewedObservations[0].title}
                </h3>
                <p style={{ color: 'var(--ink-2)', fontSize: '14.5px', margin: 0 }}>
                  {unreviewedObservations[0].detail}
                </p>

                <div className="btns" style={{ marginTop: '4px' }}>
                  <button
                    className="btn primary"
                    style={{ minWidth: '72px' }}
                    onClick={() => handleConfirmObservation(unreviewedObservations[0])}
                  >
                    Yes
                  </button>
                  <button
                    className="btn"
                    style={{ minWidth: '72px' }}
                    onClick={() => handleRejectObservation(unreviewedObservations[0])}
                  >
                    No
                  </button>
                </div>

                {expandedWhyId === unreviewedObservations[0].id && unreviewedObservations[0].why && (
                  <p className="why" style={{ margin: '4px 0 0' }}>
                    {unreviewedObservations[0].why}
                  </p>
                )}

                <button
                  className="btn link"
                  style={{ alignSelf: 'center', marginTop: '4px', fontSize: '14px', fontWeight: 600 }}
                  onClick={() =>
                    setExpandedWhyId(
                      expandedWhyId === unreviewedObservations[0].id ? null : unreviewedObservations[0].id
                    )
                  }
                >
                  {expandedWhyId === unreviewedObservations[0].id ? 'Hide explanation' : 'How do we know?'}
                </button>
              </div>

              {/* Show more link */}
              {unreviewedObservations.length > 1 && !showAllObservations && (
                <button
                  className="btn link"
                  style={{ alignSelf: 'center', fontWeight: 600, fontSize: '14.5px' }}
                  onClick={() => setShowAllObservations(true)}
                >
                  Show {unreviewedObservations.length - 1} more
                </button>
              )}

              {/* Remaining observations if expanded */}
              {showAllObservations &&
                unreviewedObservations.slice(1).map((obs) => (
                  <div key={obs.id} className="card" style={{ gap: '10px' }}>
                    <span className="from bank">Nordea noticed</span>
                    <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>{obs.title}</h3>
                    <p style={{ color: 'var(--ink-2)', fontSize: '14.5px', margin: 0 }}>{obs.detail}</p>
                    <div className="btns" style={{ marginTop: '4px' }}>
                      <button
                        className="btn primary"
                        style={{ minWidth: '72px' }}
                        onClick={() => handleConfirmObservation(obs)}
                      >
                        Yes
                      </button>
                      <button
                        className="btn"
                        style={{ minWidth: '72px' }}
                        onClick={() => handleRejectObservation(obs)}
                      >
                        No
                      </button>
                    </div>
                  </div>
                ))}
            </>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '16px' }}>
              <p style={{ color: 'var(--ink)', fontWeight: 600 }}>You’re all caught up.</p>
              <p style={{ color: 'var(--muted)', fontSize: '13.5px', marginTop: '2px' }}>
                Abel will quietly notice and ask if something changes.
              </p>
            </div>
          )}
        </section>

        {/* Your Context Cabinet Widget */}
        <section className="one-sec card" id="sec-cabinet" style={{ gap: '12px' }}>
          <div className="sec-title" style={{ padding: 0 }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700 }}>Your Context Cabinet</h2>
            <button className="btn link" onClick={onOpenAddGoal} style={{ fontWeight: 700, fontSize: '14.5px' }}>
              + Add goal
            </button>
          </div>

          {/* Goal Chip / Pacing */}
          <div className="goal-chip on">
            <span className="gname">{goalTitle}</span>
            <span className="gamt">
              €{Math.round(savingsBalance).toLocaleString()} <span>of €{targetAmount.toLocaleString()}</span>
            </span>
            <span className="gbar">
              <i style={{ width: `${progressPct}%` }} />
            </span>
            <span className={`gst ${gapAmount <= 0 ? 'good' : 'bad'}`}>
              {gapAmount <= 0 ? 'On track' : `€${gapAmount.toLocaleString()} short`}
            </span>
          </div>

          {/* Comparison CTA Box */}
          <button className="compare-row" onClick={onOpenChat}>
            <b>See what your cabinet changes</b>
            <span>Same question, without and with it ›</span>
          </button>

          {/* Legend dots */}
          <div className="legend small">
            <span className="from you">{youCount} you told</span>
            <span className="from bank">{nordeaCount} Nordea noticed</span>
            <span className="from grey">{blindCount} can’t see</span>
          </div>

          {/* Meter bar */}
          <div className="meter">
            <i style={{ width: `${Math.round(((youCount + nordeaCount) / 17) * 100)}%` }} />
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--ink-2)', margin: 0 }}>
            Abel knows {youCount + nordeaCount} of 17 useful things. Answer more any time.
          </p>

          {/* Accordion toggle: Open full cabinet */}
          <button
            className="btn block"
            onClick={() => setCabinetExpanded(!cabinetExpanded)}
            style={{ justifyContent: 'space-between', minHeight: '44px', fontWeight: 600 }}
          >
            <span>{cabinetExpanded ? 'Close cabinet' : 'Open full cabinet'}</span>
            <span aria-hidden="true">{cabinetExpanded ? '▲' : '▼'}</span>
          </button>

          {/* Expanded Drawer Sections (matching light-3-cabinet.png) */}
          {cabinetExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '8px' }}>
              <div className="card" style={{ gap: '10px', boxShadow: 'none', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Help Abel know you</h3>
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>
                    {youCount + nordeaCount} of 17
                  </span>
                </div>
                <div className="meter">
                  <i style={{ width: `${Math.round(((youCount + nordeaCount) / 17) * 100)}%` }} />
                </div>
                <p style={{ fontSize: '13.5px', color: 'var(--ink-2)', margin: 0 }}>
                  Answer what you like, when you like. We don’t pay for data.
                </p>

                {/* Question Area Rows */}
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { title: 'Home', count: '2 of 6' },
                    { title: 'Work', count: '0 of 1' },
                    { title: 'Money', count: '0 of 6' },
                    { title: 'How we talk to you', count: '0 of 3' },
                    { title: 'Protection', count: '0 of 1' },
                  ].map((cat) => (
                    <button
                      key={cat.title}
                      className="btn link"
                      onClick={() => setExpandedSection(expandedSection === cat.title ? null : cat.title)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        width: '100%',
                        color: 'var(--ink)',
                        fontSize: '15px',
                        padding: '6px 0',
                      }}
                    >
                      <span>{cat.title}</span>
                      <span style={{ color: 'var(--muted)', fontSize: '14px' }}>
                        {cat.count} {expandedSection === cat.title ? '▲' : '▼'}
                      </span>
                    </button>
                  ))}
                </div>

                <button
                  className="btn block"
                  onClick={onOpenChat}
                  style={{ minHeight: '44px', fontWeight: 600, fontSize: '14px', marginTop: '6px' }}
                >
                  Something else? Tell Abel in chat
                </button>
              </div>

              {/* Items in cabinet */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="sec-title" style={{ padding: '0 2px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Your cabinet entries</h3>
                  <span className="kicker">{entries.length} total</span>
                </div>

                <div className="list">
                  {entries.map((entry) => {
                    const isOpen = menuEntryId === entry.id;
                    const isEditing = editingId === entry.id;
                    const isArchived = entry.status === 'archived';

                    return (
                      <div key={entry.id} className="row">
                        <div className="row-main">
                          <span
                            className={`dotc ${
                              entry.type === 'blind_spot'
                                ? 'grey'
                                : entry.source === 'nordea'
                                ? 'bank'
                                : 'you'
                            }`}
                          />
                          <div className="row-txt">
                            <h4>{entry.title}</h4>
                            {entry.detail && <p>{entry.detail}</p>}
                            <span className="seen">
                              {entry.source === 'nordea' && !entry.reviewed
                                ? 'Waiting for your check'
                                : isArchived
                                ? 'Removed · kept in history'
                                : entry.status === 'disputed'
                                ? 'You said this is wrong'
                                : entry.readableBy?.abel && entry.readableBy?.offers
                                ? 'Used by Abel and Nordea offers'
                                : entry.readableBy?.abel
                                ? 'Used by Abel'
                                : 'Not used by anyone'}
                            </span>
                          </div>

                          <button
                            className="more"
                            onClick={() => {
                              if (isOpen) {
                                setMenuEntryId(null);
                                setEditingId(null);
                              } else {
                                setMenuEntryId(entry.id);
                                setEditingId(null);
                              }
                            }}
                            aria-expanded={isOpen}
                            aria-label={`Options for ${entry.title}`}
                          >
                            {isOpen ? '✕' : '⋯'}
                          </button>
                        </div>

                        {/* Inline Actions Menu */}
                        {isOpen && (
                          <div
                            style={{
                              marginTop: '8px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                              borderTop: '1px solid var(--line)',
                              paddingTop: '10px',
                            }}
                          >
                            {isEditing ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <input
                                  type="text"
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  placeholder="Title"
                                  style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--line)',
                                    background: 'var(--bg)',
                                    color: 'var(--ink)',
                                    fontSize: '14px',
                                  }}
                                />
                                <input
                                  type="text"
                                  value={editDetail}
                                  onChange={(e) => setEditDetail(e.target.value)}
                                  placeholder="Details"
                                  style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--line)',
                                    background: 'var(--bg)',
                                    color: 'var(--ink)',
                                    fontSize: '13px',
                                  }}
                                />
                                <div className="btns">
                                  <button
                                    className="btn small primary"
                                    onClick={async () => {
                                      await onUpdateEntry(entry.id, {
                                        title: editTitle.trim() || entry.title,
                                        detail: editDetail.trim(),
                                      });
                                      setEditingId(null);
                                      setMenuEntryId(null);
                                    }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    className="btn small quiet"
                                    onClick={() => setEditingId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="btns">
                                  <button
                                    className="btn small"
                                    onClick={() => {
                                      setEditingId(entry.id);
                                      setEditTitle(entry.title);
                                      setEditDetail(entry.detail || '');
                                    }}
                                  >
                                    Edit
                                  </button>

                                  {entry.source === 'nordea' && entry.status !== 'disputed' && (
                                    <button
                                      className="btn small"
                                      onClick={async () => {
                                        await onUpdateEntry(entry.id, {
                                          status: 'disputed',
                                          reviewed: true,
                                        });
                                        setMenuEntryId(null);
                                      }}
                                    >
                                      Not right
                                    </button>
                                  )}

                                  <button
                                    className="btn small quiet"
                                    onClick={async () => {
                                      await onDeleteEntry(entry.id);
                                      setMenuEntryId(null);
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>

                                <div className="perm-row">
                                  <span>Who can use it:</span>
                                  <button
                                    className="toggle"
                                    onClick={() => {
                                      const nextAbel = !entry.readableBy?.abel;
                                      onUpdateEntry(entry.id, {
                                        readableBy: {
                                          ...entry.readableBy,
                                          abel: nextAbel,
                                        },
                                      });
                                    }}
                                    aria-pressed={!!entry.readableBy?.abel}
                                  >
                                    <span className="knob" />
                                    Abel
                                  </button>

                                  <button
                                    className="toggle"
                                    onClick={() => {
                                      const nextOffers = !entry.readableBy?.offers;
                                      onUpdateEntry(entry.id, {
                                        readableBy: {
                                          ...entry.readableBy,
                                          offers: nextOffers,
                                        },
                                      });
                                    }}
                                    aria-pressed={!!entry.readableBy?.offers}
                                  >
                                    <span className="knob" />
                                    Offers
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Talk to Abel Promo Card */}
        <button className="card ai-promo" onClick={onOpenChat}>
          <span className="bot-av lg" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.5l1.9 4.9 4.9 1.9-4.9 1.9L12 17.1l-1.9-4.9-4.9-1.9 4.9-1.9z" />
            </svg>
          </span>
          <span className="ai-promo-t">
            <b>Talk to Abel</b>
            <span>Ask anything, tell it what changed, or get connected to a specialist.</span>
          </span>
          <span aria-hidden="true" className="chev">›</span>
        </button>

        {/* Fictional disclaimer footer */}
        <p className="foot-note">
          Student prototype. All data is made up; offers and rewards are examples, not real Nordea products.
        </p>
      </div>

      {/* Floating Chat Button (Bottom Right) */}
      <button className="chat-fab" onClick={onOpenChat} aria-label="Open Abel chat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3.5l1.9 4.9 4.9 1.9-4.9 1.9L12 17.1l-1.9-4.9-4.9-1.9 4.9-1.9z" />
        </svg>
      </button>
    </div>
  );
};
