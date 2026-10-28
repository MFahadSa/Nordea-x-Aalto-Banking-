import React, { useState } from 'react';
import { AppState, Reward } from '../services/api.js';
import { CabinetEntry } from '../types.js';
import { Icon } from '../ui/icons.js';
import { nfi, eur, monthLong, dayMonth } from '../ui/format.js';
import { DetailHead, NRow, Band, Toggle } from './Nordea.js';
import { HistoryCard } from './HomePage.js';

// ---------------- What Abel knows ----------------
const DRAWERS: { name: string; has: (e: CabinetEntry) => boolean; icon: string }[] = [
  { name: 'Goals and plans', has: (e) => e.type === 'goal', icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>' },
  { name: 'Life and household', has: (e) => e.type === 'life_event', icon: '<path d="M3 11l9-7 9 7v9H3z"/>' },
  { name: 'Money and work', has: (e) => e.type === 'observation' || e.type === 'fact', icon: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>' },
  { name: 'Preferences', has: (e) => e.type === 'preference', icon: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>' },
  { name: 'What it can’t see', has: (e) => e.type === 'blind_spot', icon: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><path d="M4 4l16 16"/>' },
];

interface KnowsProps {
  state: AppState;
  onAddGoal: () => void;
  onTellAbel: () => void;
  onImport: () => void;
  onPrivacy: () => void;
  onAskAbout: (text: string) => void;
  onUpdate: (e: CabinetEntry, updates: Partial<CabinetEntry>) => void;
  onArchive: (e: CabinetEntry) => void;
}

function seenLine(e: CabinetEntry) {
  // Only say something when it isn't the obvious "Abel uses it".
  if (e.type === 'blind_spot' || e.status === 'archived') return null;
  if (e.source === 'nordea' && !e.reviewed) return <span className="seen off">Waiting for your OK</span>;
  if (e.status === 'disputed') return <span className="seen off">Not used</span>;
  if (e.readableBy?.abel === false) return <span className="seen off">Not used</span>;
  if (e.readableBy?.offers && !e.private) return <span className="seen">Offers can use it</span>;
  return null;
}

const ItemRow: React.FC<{ e: CabinetEntry; open: boolean; onMenu: () => void; whyOpen: boolean; onWhy: () => void } & Pick<KnowsProps, 'onUpdate' | 'onArchive'>> = ({ e, open, onMenu, whyOpen, onWhy, onUpdate, onArchive }) => {
  const c = e.type === 'blind_spot' ? 'grey' : e.source === 'nordea' ? 'bank' : 'you';
  const meta =
    e.status === 'archived' ? 'Removed' : e.status === 'disputed' ? 'You said it’s wrong' : e.status === 'stale' ? 'Out of date' : e.private ? 'Private' : e.source === 'document' ? 'From a document' : '';
  return (
    <div className="row">
      <div className="row-main">
        <span className={`dotc ${c}`} />
        <div className="row-txt">
          <h4>{e.title}</h4>
          {e.detail && <p className={open ? '' : 'clamp1'}>{e.detail}</p>}
          {meta && <span className="meta">{meta}</span>}
          {seenLine(e)}
        </div>
        <button className="more" onClick={onMenu} aria-expanded={open} aria-label={`Options for ${e.title}`}>{open ? '×' : '⋯'}</button>
      </div>
      {whyOpen && e.why && <p className="why">{e.why}</p>}
      {open && (
        <div className="row-opts">
          {e.status === 'archived' ? (
            <button className="btn small" onClick={() => onUpdate(e, { status: 'active' })}>Bring back</button>
          ) : e.status === 'disputed' ? (
            <button className="btn small" onClick={() => onUpdate(e, { status: 'active' })}>It’s right after all</button>
          ) : (
            <>
              {e.source === 'nordea' && e.type !== 'blind_spot' && <button className="btn small" onClick={() => onUpdate(e, { status: 'disputed' })}>That’s wrong</button>}
              {e.why && <button className="btn small quiet" onClick={onWhy}>How do we know?</button>}
              {e.type !== 'blind_spot' && <button className="btn small quiet" onClick={() => onArchive(e)}>Remove</button>}
              {e.type !== 'blind_spot' && (
                <div className="perm-row" style={{ width: '100%' }}>
                  <span>Who can use it:</span>
                  <button className="toggle" aria-pressed={e.readableBy?.abel !== false} onClick={() => onUpdate(e, { readableBy: { ...e.readableBy, abel: e.readableBy?.abel === false } })}>
                    <span className="knob" />Abel
                  </button>
                  {!e.private && (
                    <button className="toggle" aria-pressed={!!e.readableBy?.offers} onClick={() => onUpdate(e, { readableBy: { ...e.readableBy, offers: !e.readableBy?.offers } })}>
                      <span className="knob" />Offers
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const KnowsPage: React.FC<KnowsProps> = (p) => {
  const { state } = p;
  const [menu, setMenu] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [goalOpen, setGoalOpen] = useState<string | null>(null);
  const active = state.entries.filter((e) => e.status !== 'archived');
  const removed = state.entries.filter((e) => e.status === 'archived');
  const known = active.filter((e) => e.type !== 'blind_spot').length;
  return (
    <>
      <DetailHead
        title="What Abel knows"
        big={String(known)}
        sub="things Abel knows · you decide"
        actions={[
          { icon: 'plus', label: 'Add a goal', onClick: p.onAddGoal },
          { icon: 'spark', label: 'Tell Abel', onClick: p.onTellAbel },
          { icon: 'file', label: 'Import a chat', onClick: p.onImport },
          { icon: 'shield', label: 'Who sees it', onClick: p.onPrivacy },
        ]}
      />
      <div className="nbody">
        <Band left="Goals" right={state.goals.length} />
        {state.goals.length ? (
          <div className="ncard flat">
            {state.goals.map((g) => (
              <React.Fragment key={g.goalId}>
                <button className="nrow2 goal" onClick={() => setGoalOpen(goalOpen === g.goalId ? null : g.goalId)}>
                  <span className="n-l">
                    <span className="n-name">{g.title}</span>
                    <span className="n-sub">{nfi(g.saved)} of {nfi(g.target)} · by {monthLong(g.targetDate.slice(0, 7))}</span>
                    <span className="gbar"><i style={{ width: `${g.percentSaved}%` }} /></span>
                  </span>
                  <span className="n-r"><span className={`npill ${g.onTrack ? 'up' : 'down'}`}>{g.onTrack ? 'On track' : `${eur(g.shortBy)} short`}</span></span>
                  <span className="nchev" aria-hidden="true"><Icon name="chev" /></span>
                </button>
                {goalOpen === g.goalId && (
                  <div className="goal-more">
                    <p>{nfi(g.monthlyGoingIn)} a month · {g.monthsLeft} months left{g.onTrack ? '' : ` · ${eur(g.extraPerMonthNeeded)} more a month closes the gap`}</p>
                    <button className="btn small" onClick={() => p.onAskAbout(`Am I on track for “${g.title}”?`)}>Ask Abel about this</button>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="nempty">
            <span className="ne-art" aria-hidden="true"><Icon name="cal" /></span>
            <b>Your goals will appear here</b>
            <p>Tell Abel what you’re saving for.</p>
            <button className="nq" onClick={p.onAddGoal}><span className="nq-c"><Icon name="plus" /></span><span className="nq-l">Create</span></button>
          </div>
        )}
        <div className="embed">
          <div className="body">
            <div className="sec-title"><h2>Everything Abel knows</h2></div>
            <div className="legend"><span className="from you">You told us</span><span className="from bank">Nordea noticed</span><span className="from grey">Can’t see</span></div>
            {active.length === 0 && <div className="card"><p>Nothing yet. Tell Abel what you’re planning.</p></div>}
            {DRAWERS.map((dw) => {
              const items = active.filter(dw.has);
              if (!items.length) return null;
              return (
                <div className="drawer" key={dw.name}>
                  <div className="drawer-h">
                    <span className="dico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: dw.icon }} /></span>
                    <h3>{dw.name}</h3>
                    <span className="kicker">{items.length}</span>
                  </div>
                  <div className="list">
                    {items.map((e) => (
                      <ItemRow key={e.id} e={e} open={menu === e.id} onMenu={() => setMenu(menu === e.id ? null : e.id)} whyOpen={why === e.id} onWhy={() => setWhy(why === e.id ? null : e.id)} onUpdate={p.onUpdate} onArchive={p.onArchive} />
                    ))}
                  </div>
                </div>
              );
            })}
            {removed.length > 0 && (
              <>
                <div className="sec-title"><h2>Removed</h2><span className="kicker">kept in history</span></div>
                <div className="list">
                  {removed.map((e) => (
                    <ItemRow key={e.id} e={e} open={menu === e.id} onMenu={() => setMenu(menu === e.id ? null : e.id)} whyOpen={false} onWhy={() => {}} onUpdate={p.onUpdate} onArchive={p.onArchive} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// ---------------- Who sees it ----------------
export const PrivacyPage: React.FC<{ state: AppState; onBack: () => void; onToggleOffers: () => void; onRevoke: (id: string) => void }> = ({ state, onBack, onToggleOffers, onRevoke }) => {
  const today = new Date().toISOString().slice(0, 10);
  const active = state.shares.filter((s) => !s.revoked && s.until >= today);
  const fee = state.earnings.reduce((a, x) => a + x.fee, 0);
  const back = state.earnings.reduce((a, x) => a + x.back, 0);
  const off = !!state.user.offersOff;
  return (
    <>
      <DetailHead title="Who sees it" big={String(state.accessCount)} sub="times something read what Abel knows" onBack={onBack} />
      <div className="nbody">
        <Band left="Who can read" />
        <div className="ncard flat">
          <NRow name="Abel, your assistant" sub={`${state.readable.abel} things`} />
          <NRow name="Nordea offers" sub={off ? 'Nothing · partner offers are off' : state.readable.offers ? `${state.readable.offers} things you allowed` : 'Nothing'} />
          {active.length ? (
            active.map((s) => (
              <NRow key={s.id} name="A Nordea adviser" sub={`${s.items.length} things · shared once, until ${dayMonth(s.until)}`} right={<button className="btn small" onClick={() => onRevoke(s.id)}>Stop sharing</button>} />
            ))
          ) : (
            <NRow name="A Nordea adviser" sub={state.shares.length ? 'Nothing now' : 'Only if you share, once'} />
          )}
        </div>
        <Band left="Partner offers" />
        <div className="ncard flat">
          <NRow name="Offers in chat" sub={off ? 'Off' : 'Only when you ask'} right={<Toggle on={!off} onChange={onToggleOffers} label="Partner offers in chat" />} />
        </div>
        <Band left="What Nordea earned from you" right={`${nfi(fee)} €`} />
        <div className="ncard flat">
          {state.earnings.length ? (
            <>
              {[...state.earnings].reverse().map((x) => (
                <NRow key={x.id} name={x.partnerName} sub={`${x.what} · ${dayMonth(x.createdAt.slice(0, 10))}`} amount={nfi(x.fee)} note={<span className="up">{nfi(x.back)} back to you</span>} />
              ))}
              <NRow name="Given back to you" sub="Into your savings" amount={nfi(back)} />
            </>
          ) : (
            <p className="hist-empty" style={{ padding: 16 }}>Nothing yet.</p>
          )}
        </div>
        <Band left="Latest reads" />
        <div className="ncard flat">
          {state.recentReads.length ? (
            state.recentReads.map((a) => <NRow key={a.id} name={a.agentName} sub={`${a.purpose} · ${a.itemsReadCount} read, ${a.blockedCount} held back`} />)
          ) : (
            <p className="hist-empty" style={{ padding: 16 }}>Nothing has read it yet.</p>
          )}
        </div>
      </div>
    </>
  );
};

// ---------------- Payday autopilot ----------------
export const AutopilotPage: React.FC<{ state: AppState; onBack: () => void; onPlan: (text?: string) => void }> = ({ state, onBack, onPlan }) => {
  const pp = state.payPlan;
  return (
    <>
      <DetailHead
        title="Payday autopilot"
        big={nfi(pp.suggestedExtraMove)}
        sub={pp.towardsGoal ? `suggested to “${pp.towardsGoal}” each payday` : 'suggested each payday'}
        onBack={onBack}
        actions={[
          { icon: 'spark', label: 'Plan with Abel', onClick: () => onPlan() },
          { icon: 'sliders', label: 'My limits', onClick: () => onPlan('I want to change how much stays in my current account') },
          { icon: 'shield', label: 'How it works', onClick: () => onPlan('How does the payday autopilot work?') },
        ]}
      />
      <div className="nbody">
        <Band left={pp.nextPayday ? `Next payday · ${dayMonth(pp.nextPayday)}` : 'Next payday'} />
        <div className="ncard flat">
          <NRow name="Salary coming in" sub="Your account" amount={nfi(pp.income)} />
          <NRow name="Bills and everyday spending" sub="Average of the last 3 months" amount={`−${nfi(pp.spendingAveragePerMonth)}`} />
          <NRow name="Already going to savings" sub="Every month" amount={`−${nfi(pp.alreadySavingPerMonth)}`} />
          <NRow name="Left over" sub="Before Abel’s suggestion" amount={nfi(pp.leftOver)} />
        </div>
        <Band left="Your rules" />
        <div className="ncard flat">
          <NRow name="Keep in current account" sub={`At least ${eur(pp.keepInCurrentAccount)} (default)`} />
          <NRow name="What Abel may do" sub="Suggest only" />
        </div>
        <div style={{ padding: 16 }}>
          <button className="btn primary block" onClick={() => onPlan('Plan my next payday')}>Review the plan with Abel</button>
        </div>
      </div>
    </>
  );
};

// ---------------- Rewards ----------------
export const levelOf = (lifetime: number) => (lifetime >= 300 ? 'Gold' : lifetime >= 150 ? 'Silver' : 'Starter');
export const RewardsPage: React.FC<{ state: AppState; rewards: Reward[]; onAsk: () => void; onUse: (r: Reward) => void; onEarn: () => void }> = ({ state, rewards, onAsk, onUse, onEarn }) => {
  const pts = state.user.points || 0;
  const level = levelOf(pts + (state.user.pointsSpent || 0));
  const waiting = state.entries.filter((e) => (e.source === 'nordea' && !e.reviewed && e.status === 'active') || e.status === 'stale').length;
  const used = state.user.redeemed || [];
  return (
    <>
      <DetailHead
        title="Rewards"
        big={String(pts)}
        sub={`points · ${level}`}
        actions={[
          { icon: 'check', label: 'Earn points', onClick: onEarn },
          { icon: 'gift', label: 'Use points', onClick: () => document.getElementById('use-points')?.scrollIntoView({ behavior: 'smooth' }) },
          { icon: 'spark', label: 'Ask Abel', onClick: onAsk },
        ]}
      />
      <div className="nbody">
        <Band left="Use your points" right={`${pts} to spend`} />
        <div className="ncard flat" id="use-points">
          {rewards.map((r) => {
            const can = pts >= r.pts;
            return (
              <NRow
                key={r.id}
                name={r.short}
                sub={can ? `${r.pts} points` : `${r.pts} points · ${r.pts - pts} to go`}
                right={<button className={`btn small ${can ? 'primary' : ''}`} disabled={!can} onClick={() => onUse(r)}>{can ? 'Use' : 'Locked'}</button>}
              />
            );
          })}
        </div>
        <Band left="Earn more" />
        <div className="ncard flat">
          <NRow name={waiting ? `Check ${waiting} things` : 'All checked'} sub={waiting ? '+10 points each' : 'Nothing waiting'} right={waiting ? <button className="btn small" onClick={onEarn}>Do it</button> : <span className="npill up">✓</span>} />
          <NRow name={state.user.extraMonthly ? 'Saving plan set up' : 'Set up a saving plan'} sub={state.user.extraMonthly ? `${eur(state.user.extraMonthly)} more a month` : '+50 points'} right={state.user.extraMonthly ? <span className="npill up">✓</span> : undefined} />
        </div>
        {used.length > 0 && (
          <>
            <Band left="Used" />
            <div className="ncard flat">
              {[...used].reverse().map((u, i) => <NRow key={i} name={u.title} sub={`${u.pts} points · ${dayMonth(u.at.slice(0, 10))}`} />)}
            </div>
          </>
        )}
        <p className="foot-note">Example rewards. Your level never drops when you spend.</p>
      </div>
    </>
  );
};

/** The confirm pop-up, same layout as the original prototype. */
export const RedeemSheet: React.FC<{ state: AppState; reward: Reward; onYes: () => void; onNo: () => void }> = ({ state, reward, onYes, onNo }) => {
  const pts = state.user.points || 0;
  const level = levelOf(pts + (state.user.pointsSpent || 0));
  return (
    <div className="cf-bg" onClick={onNo}>
      <div className="cf-sheet" role="dialog" aria-label="Use your points?" onClick={(e) => e.stopPropagation()}>
        <span className="kicker">Please confirm</span>
        <h3>Use your points?</h3>
        <div className="summary">
          <div className="sum-row"><b>Reward</b><span>{reward.title}</span></div>
          <div className="sum-row"><b>Costs</b><span>{reward.pts} of your {pts} points</span></div>
          <div className="sum-row"><b>Left after</b><span>{pts - reward.pts} points</span></div>
        </div>
        <span className="earns no">Your level stays {level}.</span>
        <div className="btns stack">
          <button className="btn primary block" onClick={onYes}>Yes, use {reward.pts} points</button>
          <button className="btn quiet block" onClick={onNo}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

// ---------------- Contact ----------------
export const ContactPage: React.FC<{ state: AppState; onHelper: (id: string) => void; onOpenConversation: (id: string) => void }> = ({ state, onHelper, onOpenConversation }) => {
  const [all, setAll] = useState(false);
  return (
    <>
      <DetailHead title="Contact" sub="How can we help you today?" />
      <div className="nbody">
        <div className="ncard first">
          <NRow name={<><Icon name="spark" /> Chat with Abel</>} sub="Replies instantly" onClick={() => onHelper('abel')} />
          <NRow name={<><Icon name="person" /> Talk to a person</>} sub="A Nordea adviser" onClick={() => onHelper('person')} />
          <NRow name={<><Icon name="cal" /> Book an online meeting</>} sub="Pick a time" onClick={() => onHelper('person')} />
        </div>
        <HistoryCard state={state} all={all} onToggle={() => setAll(!all)} onOpen={onOpenConversation} />
      </div>
    </>
  );
};

// ---------------- More ----------------
export const MorePage: React.FC<{ state: AppState; isDark: boolean; onPage: (p: string) => void; onUsers: () => void; onCalm: () => void; onDark: () => void; onReset: () => void }> = ({ state, isDark, onPage, onUsers, onCalm, onDark, onReset }) => (
  <>
    <DetailHead title="More" />
    <div className="nbody">
      <Band left="You" />
      <div className="ncard flat">
        <NRow name="What Abel knows" sub="Goals, plans, preferences" onClick={() => onPage('knows')} />
        <NRow name="Who sees it" sub="Access, sharing, offers" onClick={() => onPage('privacy')} />
        <NRow name="Rewards" sub="Points and levels" onClick={() => onPage('rewards')} />
      </div>
      <Band left="Settings" />
      <div className="ncard flat">
        <NRow name="Calm view" sub="Bigger text, fewer things" right={<Toggle on={state.user.viewMode === 'calm'} onChange={onCalm} label="Calm view" />} />
        <NRow name="Dark mode" sub="Light is the default" right={<Toggle on={isDark} onChange={onDark} label="Dark mode" />} />
      </div>
      <Band left="Demo" />
      <div className="ncard flat">
        <NRow name="Switch demo customer" sub={`Now: ${state.user.name}`} onClick={onUsers} />
        <NRow name="Reset demo data" sub="Start again" onClick={onReset} />
      </div>
    </div>
  </>
);
