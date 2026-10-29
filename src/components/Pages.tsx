import React, { useState } from 'react';
import { AppState, Reward, pingAi, fetchAiStatus, AiStatus, runSelfTest, CheckResult, DocInfo, documentUrl, fetchHistory, fetchDbStatus, DbStatus } from '../services/api.js';
import { CabinetEntry, EntryEvent } from '../types.js';
import { Icon } from '../ui/icons.js';
import { nfi, eur, monthLong, monthShort, n0, dayMonth } from '../ui/format.js';
import { DetailHead, NRow, Band, Toggle } from './Nordea.js';
import { HistoryCard } from './HomePage.js';

// ---------------- What Abel knows ----------------
const DRAWERS: { name: string; has: (e: CabinetEntry) => boolean; icon: string }[] = [
  { name: 'Other goals', has: (e) => e.type === 'goal', icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>' },
  { name: 'Life', has: (e) => e.type === 'life_event', icon: '<path d="M3 11l9-7 9 7v9H3z"/>' },
  { name: 'Money', has: (e) => e.type === 'observation' || e.type === 'fact', icon: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>' },
  { name: 'Preferences', has: (e) => e.type === 'preference', icon: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>' },
  { name: 'Not shared', has: (e) => e.type === 'blind_spot', icon: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><path d="M4 4l16 16"/>' },
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
  onDeleteDoc: (id: string) => void;
}

// ---------------- History of one entry ----------------
const WHO: Record<EntryEvent['by'], string> = { you: 'You', abel: 'Abel', nordea: 'Nordea' };
const DID: Record<EntryEvent['action'], string> = {
  added: 'added it', changed: 'changed it', removed: 'removed it', brought_back: 'brought it back', confirmed: 'confirmed it',
  marked_wrong: 'said it’s wrong', deleted: 'deleted it', undone: 'undid a change',
};
const FIELD: Record<string, string> = { title: 'Name', detail: 'Details', status: 'Status', private: 'Private', target: 'Target', readableBy: 'Who can use it', reviewed: 'Checked by you' };
const STATUS: Record<string, string> = { active: 'In use', stale: 'Looks out of date', archived: 'Removed', disputed: 'Marked wrong' };
const fullDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
function val(field: string, v: any): string {
  if (v == null || v === '') return '–';
  if (field === 'target') return `${eur(v.amount)} by ${monthShort(String(v.date).slice(0, 7))}`;
  if (field === 'status') return STATUS[v] || String(v);
  if (field === 'readableBy') return Object.entries(v).filter(([, on]) => on).map(([k]) => (k === 'abel' ? 'Abel' : k === 'offers' ? 'Offers' : k)).join(', ') || 'No one';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

/** Every change to one thing, newest first: who did it, where, and what changed. Loaded when opened. */
export const HistoryList: React.FC<{ userId: string; entryId: string }> = ({ userId, entryId }) => {
  const [list, setList] = useState<EntryEvent[] | null>(null);
  const [err, setErr] = useState('');
  React.useEffect(() => {
    fetchHistory(userId, entryId).then(setList).catch((e) => setErr(e?.message || 'Couldn’t load the history'));
  }, [userId, entryId]);
  if (err) return <p className="hist-l err">{err}</p>;
  if (!list) return <p className="hist-l">Loading history…</p>;
  if (!list.length) return <p className="hist-l">No changes yet.</p>;
  return (
    <ol className="hist-l" aria-label="History">
      {list.map((h) => (
        <li key={h.id}>
          <span className="h-top"><b>{WHO[h.by]} {DID[h.action]}</b><span>{fullDate(h.at)}</span></span>
          {h.how && <span className="h-how">{h.how}</span>}
          {(h.changes || []).filter((c) => c.field !== 'reviewed').map((c, i) => (
            <span className="h-ch" key={i}>{FIELD[c.field] || c.field}: <s>{val(c.field, c.from)}</s> → {val(c.field, c.to)}</span>
          ))}
        </li>
      ))}
    </ol>
  );
};

function seenLine(e: CabinetEntry): string {
  // Only say something when it isn't the obvious "Abel uses it".
  if (e.type === 'blind_spot' || e.status === 'archived') return '';
  if (e.source === 'nordea' && !e.reviewed) return 'Not used until you confirm it';
  if (e.status === 'disputed') return 'Not used: you said it’s wrong';
  if (e.readableBy?.abel === false) return 'Not used: you turned it off';
  if (e.readableBy?.offers && !e.private) return 'Offers can use it';
  return '';
}

const ItemRow: React.FC<{ e: CabinetEntry; open: boolean; onMenu: () => void; whyOpen: boolean; onWhy: () => void } & Pick<KnowsProps, 'onUpdate' | 'onArchive'>> = ({ e, open, onMenu, whyOpen, onWhy, onUpdate, onArchive }) => {
  const [hist, setHist] = useState(false);
  const c = e.type === 'blind_spot' ? 'grey' : e.source === 'nordea' ? 'bank' : 'you';
  const meta =
    e.status === 'archived' ? 'Removed · kept in history' : e.status === 'stale' ? 'Looks out of date' : e.private ? 'Private · never used for offers' : e.source === 'document' ? 'From a document you imported' : '';
  return (
    <div className="row">
      <div className="row-main">
        <span className={`dotc ${c}`} />
        <div className="row-txt">
          <h4>{e.title}</h4>
          {e.detail && <p className={open ? '' : 'clamp1'}>{e.detail}</p>}
          {(meta || seenLine(e)) && <span className={`meta${seenLine(e).startsWith('Not used') ? ' warn' : ''}`}>{[meta, seenLine(e)].filter(Boolean).join(' · ')}</span>}
        </div>
        <button className="more" onClick={onMenu} aria-expanded={open} aria-label={`Options for ${e.title}`}>{open ? '×' : '⋯'}</button>
      </div>
      {whyOpen && e.why && <p className="why">{e.why}</p>}
      {open && (
        <div className="row-opts">
          {e.status === 'archived' ? (
            <>
              <button className="btn small" onClick={() => onUpdate(e, { status: 'active' })}>Bring back</button>
              <button className="btn small quiet" aria-expanded={hist} onClick={() => setHist(!hist)}>{hist ? 'Hide history' : 'History'}</button>
            </>
          ) : e.status === 'disputed' ? (
            <button className="btn small" onClick={() => onUpdate(e, { status: 'active' })}>It’s right after all</button>
          ) : (
            <>
              {e.source === 'nordea' && e.type !== 'blind_spot' && <button className="btn small" onClick={() => onUpdate(e, { status: 'disputed' })}>That’s wrong</button>}
              {e.why && <button className="btn small quiet" onClick={onWhy}>How do we know?</button>}
              <button className="btn small quiet" aria-expanded={hist} onClick={() => setHist(!hist)}>{hist ? 'Hide history' : 'History'}</button>
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
          {hist && <HistoryList userId={e.userId} entryId={e.id} />}
        </div>
      )}
    </div>
  );
};

/** Files the customer chose to keep. Shown in What Abel knows, with delete. */
const DocsSection: React.FC<{ userId: string; docs: DocInfo[]; onDelete: (id: string) => void }> = ({ userId, docs, onDelete }) => (
  <>
    <div className="sec-title" id="your-docs"><h2>Your documents</h2><span className="kicker">{docs.length ? `${docs.length} kept` : 'none kept'}</span></div>
    {docs.length ? (
      <div className="list">
        {[...docs].reverse().map((d) => (
          <div className="row" key={d.id}>
            <div className="row-main">
              <span className="doc-ic" aria-hidden="true"><Icon name={d.kind === 'image' ? 'image' : 'file'} /></span>
              <div className="row-txt">
                <h4>{d.name}</h4>
                <p>{d.entries.length ? `Saved from it: ${d.entries.join(', ')}` : 'Nothing saved from it'}</p>
                <span className="meta">Added {dayMonth(d.createdAt.slice(0, 10))} · deletes itself on {dayMonth(d.expiresAt.slice(0, 10))}</span>
              </div>
            </div>
            <div className="row-opts">
              <a className="btn small" href={documentUrl(userId, d.id)} target="_blank" rel="noopener">Open</a>
              <button className="btn small quiet" onClick={() => onDelete(d.id)}><Icon name="trash" size={16} /> Delete</button>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="card"><p>Files you add to a chat aren’t kept. Switch on “Keep a copy” when adding one, and it’s stored here for 30 days. You can delete it any time.</p></div>
    )}
  </>
);

export const KnowsPage: React.FC<KnowsProps> = (p) => {
  const { state } = p;
  const [menu, setMenu] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [goalOpen, setGoalOpen] = useState<string | null>(null);
  const [goalHist, setGoalHist] = useState<string | null>(null);
  const active = state.entries.filter((e) => e.status !== 'archived');
  const tracked = new Set(state.goals.map((g) => g.goalId));
  const listed = active.filter((e) => !tracked.has(e.id));
  const hasBlind = active.some((e) => e.type === 'blind_spot');
  const removed = state.entries.filter((e) => e.status === 'archived');
  const known = active.filter((e) => e.type !== 'blind_spot').length;
  return (
    <>
      <DetailHead
        title="What Abel knows"
        big={String(known)}
        sub="things Abel uses to help you. You decide what’s in it."
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
                    <span className="n-sub">{n0(g.saved)} of {eur(g.target)} · {monthShort(g.targetDate.slice(0, 7))}</span>
                    <span className="gbar"><i style={{ width: `${g.percentSaved}%` }} /></span>
                  </span>
                  <span className="n-r"><span className={`npill ${g.onTrack ? 'up' : 'down'}`}>{g.onTrack ? 'On track' : `${eur(g.shortBy)} short`}</span></span>
                  <span className="nchev" aria-hidden="true"><Icon name="chev" /></span>
                </button>
                {goalOpen === g.goalId && (
                  <div className="goal-more">
                    <div className="gm-stats">
                      <div><b>{eur(g.monthlyGoingIn)}</b><span>saved a month</span></div>
                      <div><b>{g.monthsLeft}</b><span>months left</span></div>
                      <div className={g.onTrack ? 'ok' : 'gap'}><b>{g.onTrack ? '✓' : `+${eur(g.extraPerMonthNeeded)}`}</b><span>{g.onTrack ? 'on track' : 'a month to be on time'}</span></div>
                    </div>
                    <p className="gm-note">At this pace you’ll have about {eur(g.projectedByTargetDate)} by {monthLong(g.targetDate.slice(0, 7))}.</p>
                    <div className="gm-act">
                      <button className="btn small primary" onClick={() => p.onAskAbout(`Am I on track for “${g.title}”?`)}>Ask Abel about this</button>
                      <button className="btn small" onClick={() => p.onAskAbout('Plan my next payday')}>Plan my payday</button>
                      <button className="btn small quiet" aria-expanded={goalHist === g.goalId} onClick={() => setGoalHist(goalHist === g.goalId ? null : g.goalId)}>{goalHist === g.goalId ? 'Hide history' : 'History'}</button>
                    </div>
                    {goalHist === g.goalId && <HistoryList userId={state.user.id} entryId={g.goalId} />}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="nempty">
            <span className="ne-art" aria-hidden="true"><Icon name="cal" /></span>
            <b>Your goals will appear here</b>
            <p>Tell Abel what you’re saving for, and he’ll track it with you.</p>
            <button className="nq" onClick={p.onAddGoal}><span className="nq-c"><Icon name="plus" /></span><span className="nq-l">Create</span></button>
          </div>
        )}
        <div className="embed">
          <div className="body">
            <div className="sec-title"><h2>Everything else</h2></div>
            <div className="legend"><span className="from you">You told us</span><span className="from bank">Nordea noticed</span>{hasBlind && <span className="from grey">Not shared</span>}</div>
            {listed.length === 0 && <div className="card"><p>Nothing else yet. Tell Abel about plans or changes in your life.</p></div>}
            {DRAWERS.map((dw) => {
              const items = listed.filter(dw.has);
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
            <DocsSection userId={state.user.id} docs={state.documents || []} onDelete={p.onDeleteDoc} />
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
export const PrivacyPage: React.FC<{ state: AppState; onBack: () => void; onToggleOffers: () => void; onRevoke: (id: string) => void; onDocuments: () => void; onDeleteChats: () => void }> = ({ state, onBack, onToggleOffers, onRevoke, onDocuments, onDeleteChats }) => {
  const docs = state.documents || [];
  const today = new Date().toISOString().slice(0, 10);
  const active = state.shares.filter((s) => !s.revoked && s.until >= today);
  const fee = state.earnings.reduce((a, x) => a + x.fee, 0);
  const back = state.earnings.reduce((a, x) => a + x.back, 0);
  const off = !!state.user.offersOff;
  return (
    <>
      <DetailHead title="Who sees it" big={String(state.accessCount)} sub="times something read what Abel knows. Every read is logged." onBack={onBack} />
      <div className="nbody">
        <Band left="Who can read" />
        <div className="ncard flat">
          <NRow name="Abel, your assistant" sub={`Can use ${state.readable.abel} things`} />
          <NRow name="Nordea offers" sub={off ? 'Nothing: partner offers are off' : `Can use ${state.readable.offers} things you allowed`} />
          {active.length ? (
            active.map((s) => (
              <NRow key={s.id} name="A Nordea adviser" sub={`Sees ${s.items.length} things until ${dayMonth(s.until)}`} right={<button className="btn small" onClick={() => onRevoke(s.id)}>Stop sharing</button>} />
            ))
          ) : (
            <NRow name="A Nordea adviser" sub="Nothing, unless you share for a meeting" />
          )}
        </div>
        <Band left="Your data" />
        <div className="ncard flat">
          <NRow name="Your documents" sub={docs.length ? `${docs.length} kept · delete any time` : 'None kept. Files are read once, unless you keep a copy'} onClick={onDocuments} />
          <NRow name="Your chats" sub={state.conversations.length ? `${state.conversations.length} ${state.conversations.length === 1 ? 'chat' : 'chats'} saved` : 'No chats saved'} right={state.conversations.length ? <button className="btn small" onClick={onDeleteChats}>Delete</button> : undefined} />
        </div>
        <Band left="Partner offers" />
        <div className="ncard flat">
          <NRow name="Offers in chat" sub={off ? 'Off' : 'Only when you ask about something a partner covers'} right={<Toggle on={!off} onChange={onToggleOffers} label="Partner offers in chat" />} />
        </div>
        <Band left="What Nordea earned from you" right={`${nfi(fee)} €`} />
        <div className="ncard flat">
          {state.earnings.length ? (
            <>
              {[...state.earnings].reverse().map((x) => (
                <NRow key={x.id} name={x.partnerName} sub={`${x.what} · ${dayMonth(x.createdAt.slice(0, 10))}`} amount={nfi(x.fee)} note={<span className="up">{nfi(x.back)} back to you</span>} />
              ))}
              <NRow name="Given back to you" sub="Into your savings account" amount={nfi(back)} />
            </>
          ) : (
            <p className="hist-empty" style={{ padding: 16 }}>Nothing yet. If you buy through a partner, Nordea’s fee and your share show here.</p>
          )}
        </div>
        <Band left="Latest reads" />
        <div className="ncard flat">
          {state.recentReads.length ? (
            state.recentReads.slice(0, 5).map((a) => <NRow key={a.id} name={a.agentName} sub={`${a.purpose} · read ${a.itemsReadCount}, held back ${a.blockedCount}`} />)
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
        sub={pp.towardsGoal ? `Abel suggests saving this much more for “${pp.towardsGoal}” each payday` : 'Abel suggests saving this much more each payday'}
        onBack={onBack}
        actions={[
          { icon: 'spark', label: 'Plan with Abel', onClick: () => onPlan() },
          { icon: 'sliders', label: 'My limits', onClick: () => onPlan('I want to change how much stays in my current account') },
          { icon: 'shield', label: 'How it works', onClick: () => onPlan('How does the payday autopilot work?') },
        ]}
      />
      <div className="nbody">
        <Band left="Next payday" right={pp.nextPayday ? dayMonth(pp.nextPayday) : undefined} />
        <div className="ncard flat">
          <NRow name="Salary" amount={nfi(pp.income)} />
          <NRow name="Bills and spending" sub="Average of the last 3 months" amount={`−${nfi(pp.spendingAveragePerMonth)}`} />
          <NRow name="Already saving" amount={`−${nfi(pp.alreadySavingPerMonth)}`} />
          <NRow name="Left over" amount={nfi(pp.leftOver)} />
          {pp.towardsGoal && <NRow name="Abel suggests" sub={`To “${pp.towardsGoal}”`} amount={`+${nfi(pp.suggestedExtraMove)}`} />}
        </div>
        <Band left="Your rules" />
        <div className="ncard flat">
          <NRow name="Always keep" sub="Stays in your current account as a buffer" amount={nfi(pp.keepInCurrentAccount)} />
          <NRow name="What Abel may do" sub="Suggest only. Nothing moves until you confirm" />
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
        sub={`points to spend · ${level} level`}
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
          <NRow name={waiting ? 'Check what Nordea noticed' : 'Everything is checked'} sub={waiting ? `${waiting} waiting · +10 points each` : 'Nothing waiting for you'} right={waiting ? <button className="btn small" onClick={onEarn}>Do it</button> : <span className="npill up">✓</span>} />
          <NRow name={state.user.extraMonthly ? 'Saving plan set up' : 'Set up a saving plan'} sub={state.user.extraMonthly ? `You save ${eur(state.user.extraMonthly)} more a month` : 'Plan your payday with Abel · +50 points'} right={state.user.extraMonthly ? <span className="npill up">✓</span> : undefined} />
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
export const ContactPage: React.FC<{ state: AppState; onHelper: (id: string) => void; onOpenConversation: (id: string) => void; onDeleteChat?: (id: string) => void; onDeleteAllChats?: () => void }> = ({ state, onHelper, onOpenConversation, onDeleteChat, onDeleteAllChats }) => {
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
        <HistoryCard state={state} all={all} onToggle={() => setAll(!all)} onOpen={onOpenConversation} onDelete={onDeleteChat} onDeleteAll={onDeleteAllChats} />
      </div>
    </>
  );
};

// ---------------- AI connection check ----------------
const speed = (s: { lastTurn?: { ms: number; calls: number } | null; thinking?: string }) =>
  (s.lastTurn ? ` · last chat answer ${(s.lastTurn.ms / 1000).toFixed(1)} s (${s.lastTurn.calls} ${s.lastTurn.calls === 1 ? 'call' : 'calls'})` : '') + (s.thinking && s.thinking !== 'not tried yet' ? ` · thinking ${s.thinking}` : '');
/** Shows whether Abel's AI works here, and the real reason if not. Never shows the key. */
/** Where the demo's data is saved (Supabase or only this server). */
const DbCheck: React.FC = () => {
  const [s, setS] = useState<DbStatus | null>(null);
  const load = () => fetchDbStatus().then(setS).catch(() => setS(null));
  React.useEffect(() => { load(); }, []);
  const text = !s ? 'Checking…' : s.mode === 'supabase' ? (s.ok ? `Saved in Supabase${s.rows ? ` · ${s.rows} records` : ''}${s.waiting ? ` · ${s.waiting} waiting` : ''}` : s.message) : s.message;
  return <NRow name="Saved data" sub={<span className={s && s.mode === 'supabase' && s.ok ? 'up' : s && !s.ok ? 'ai-bad' : ''}>{text}</span>} right={<button className="btn small" onClick={load}>Check</button>} />;
};

/** Short, readable reason for the team (the full text is in the chat's technical details). */
function friendly(msg?: string | null): string {
  const m = String(msg || '');
  const wait = m.match(/try again in ((?:\d+h)?(?:\d+m(?!s))?(?:[\d.]+(?:ms|s))?)/i)?.[1];
  if (/per ?day|TPD|RPD|daily|free_tier|exceeded your current quota/i.test(m)) return `Daily free limit reached${wait ? ` (resets in ${wait.replace(/\.\d+s$/, 's')})` : ''}`;
  if (/per minute|TPM|RPM|\b429\b/i.test(m)) return 'Per-minute limit, back in a few seconds';
  if (/\b401\b|invalid api key|unauthori/i.test(m)) return 'The key is wrong or was deleted';
  if (/timeout|did not answer within/i.test(m)) return 'Didn’t answer in time';
  if (/fetch failed|ENOTFOUND|ECONN|Can’t reach/i.test(m)) return 'Can’t reach the service';
  return m.slice(0, 120);
}

const AiCheck: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const [members, setMembers] = useState<NonNullable<AiStatus['members']>>([]);
  React.useEffect(() => {
    fetchAiStatus()
      .then((s) => (setMembers(s.members || []), s))
      .then((s) => setRes(!s.keyPresent ? { ok: false, text: s.provider !== 'gemini' ? `No ${s.provider} key: add LLM_API_KEY (AI Studio: Settings → Secrets)` : 'No Gemini key reaches the server' } : s.lastError && (!s.lastOk || s.lastError.at > s.lastOk.at) ? { ok: false, text: friendly(s.lastError.message) } : s.lastOk ? { ok: true, text: `Working · ${s.lastOk.model}${speed(s)}` } : null))
      .catch(() => {});
  }, []);
  const test = async () => {
    setBusy(true);
    try {
      const r = await pingAi();
      setRes(r.ok ? { ok: true, text: `Working · ${r.model} · test answered in ${((r.ms || 0) / 1000).toFixed(1)} s${speed(r.status)}` } : { ok: false, text: friendly(r.error) || 'Unknown error' });
      setMembers(r.status?.members || []);
    } catch (e: any) {
      setRes({ ok: false, text: e?.message || 'The check itself failed' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <NRow
        name="AI connection"
        sub={busy ? 'Testing…' : res ? <span className={res.ok ? 'up' : 'ai-bad'}>{res.text}</span> : 'Test whether Abel’s AI answers'}
        right={<button className="btn small" onClick={test} disabled={busy}>Test</button>}
      />
      {members.length > 1 && (
        <div className="ai-each">
          <span className="ai-each-h">In order: the first one that's free answers. If all are resting, Abel answers common questions from the bank's own numbers.</span>
          {members.map((m) => (
            <div key={m.name} className="ai-each-r">
              <b>{m.name}{m.vision ? ' · reads photos' : ''}</b>
              <span className={!m.configured ? 'ai-bad' : m.restingFor ? 'ai-bad' : 'up'}>
                {!m.configured ? 'No key' : m.restingFor ? `Resting ${m.restingFor > 120 ? `${Math.round(m.restingFor / 60)} min` : `${m.restingFor} s`} · ${friendly(m.lastFail?.message)}` : m.lastOk ? 'Ready · answered recently' : 'Ready'}
              </span>
              {!m.restingFor && m.lastFail && (!m.lastOk || m.lastFail.at > m.lastOk) && <span className="ai-each-err">Last problem: {friendly(m.lastFail.message)}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

/** For the team: ask Abel ~12 real questions and grade the answers (uses ~15–20 AI requests). */
const SelfTest: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ results: CheckResult[]; passed: number; total: number } | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const run = async () => {
    setBusy(true); setErr(''); setOut(null);
    try { setOut(await runSelfTest()); } catch (e: any) { setErr(e?.message || 'The check failed'); } finally { setBusy(false); }
  };
  return (
    <>
      <NRow
        name="Check Abel’s answers"
        sub={busy ? 'Asking 12 questions… this takes 2–3 minutes' : err ? <span className="ai-bad">{err}</span> : out ? <span className={out.passed === out.total ? 'up' : 'ai-bad'}>{out.passed} of {out.total} passed</span> : 'Real questions to the real AI, on a copy of Lauri. Uses about 15–20 AI requests'}
        right={<button className="btn small" onClick={run} disabled={busy}>Run</button>}
      />
      {out && (
        <div className="ai-each">
          {out.results.map((r, i) => (
            <button key={i} className="ai-each-r st-r" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <b className={r.ok ? 'up' : 'ai-bad'}>{r.ok ? '✓' : '✗'} {r.name}</b>
              <span>{r.why} · {r.answeredBy} · {(r.ms / 1000).toFixed(1)} s</span>
              {open === i && <span className="st-more"><b>Asked:</b> {r.asked}<br /><b>Abel:</b> {r.reply || '–'}{r.cards.length ? <><br /><b>Cards:</b> {r.cards.join(', ')}</> : null}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
};

/** For the team: show the small technical line under Abel's messages when something failed. Off for customers. */
const DebugToggle: React.FC = () => {
  const read = () => { try { return localStorage.getItem('abel-debug') === '1'; } catch { return false; } };
  const [on, setOn] = useState(read);
  const flip = () => {
    const v = !on;
    setOn(v);
    try { localStorage.setItem('abel-debug', v ? '1' : '0'); } catch { /* storage may be blocked */ }
    window.dispatchEvent(new Event('abel-debug'));
  };
  return <NRow name="Show technical details" sub="For your team: why an answer failed, under the message" right={<Toggle on={on} onChange={flip} label="Show technical details" />} />;
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
        <AiCheck />
        <SelfTest />
        <DbCheck />
        <DebugToggle />
        <NRow name="Switch demo customer" sub={`Now: ${state.user.name}`} onClick={onUsers} />
        <NRow name="Reset demo data" sub="Start again" onClick={onReset} />
      </div>
    </div>
  </>
);

/** Delete a kept file. If things were saved from it, the customer chooses whether they go too. */
export const DeleteDocSheet: React.FC<{ doc: DocInfo; onDelete: (alsoEntries: boolean) => void; onCancel: () => void }> = ({ doc, onDelete, onCancel }) => {
  const n = doc.entries.length;
  return (
    <div className="cf-bg" onClick={onCancel}>
      <div className="cf-sheet" role="dialog" aria-label="Delete this document?" onClick={(e) => e.stopPropagation()}>
        <span className="kicker">Your documents</span>
        <h3>Delete “{doc.name}”?</h3>
        {n ? (
          <div className="summary">
            <div className="sum-row"><span>Abel saved {n} {n === 1 ? 'thing' : 'things'} from it:</span></div>
            {doc.entries.map((t, i) => <div className="sum-row" key={i}><span>• {t}</span></div>)}
          </div>
        ) : (
          <p className="cf-p">Nothing was saved from it. The file is deleted for good.</p>
        )}
        <div className="btns stack">
          {n ? (
            <>
              <button className="btn primary block" onClick={() => onDelete(true)}>Delete the file and {n === 1 ? 'that thing' : `those ${n} things`}</button>
              <button className="btn block" onClick={() => onDelete(false)}>Delete only the file</button>
            </>
          ) : (
            <button className="btn primary block" onClick={() => onDelete(false)}>Delete</button>
          )}
          <button className="btn quiet block" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export const ConfirmSheet: React.FC<{ kicker: string; title: string; body: string; yes: string; onYes: () => void; onNo: () => void }> = ({ kicker, title, body, yes, onYes, onNo }) => (
  <div className="cf-bg" onClick={onNo}>
    <div className="cf-sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
      <span className="kicker">{kicker}</span>
      <h3>{title}</h3>
      <p className="cf-p">{body}</p>
      <div className="btns stack">
        <button className="btn primary block" onClick={onYes}>{yes}</button>
        <button className="btn quiet block" onClick={onNo}>Cancel</button>
      </div>
    </div>
  </div>
);
