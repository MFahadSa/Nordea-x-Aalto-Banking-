import { RefundHomeCard } from './Refund.js';
import React, { useState } from 'react';
import { AppState } from '../services/api.js';
import { CabinetEntry } from '../types.js';
import { Icon, Bell } from '../ui/icons.js';
import { nfi, eur, ago } from '../ui/format.js';
import { HELPERS, HELPER_ORDER } from '../ui/helpers.js';
import { BAND_BG, NRow, Band, NChev } from './Nordea.js';

interface Props {
  state: AppState;
  onFrame: (what: string) => void;
  onOpenHelper: (helperId: string) => void;
  onOpenConversation: (id: string) => void;
  onDeleteChat?: (id: string) => void;
  onDeleteAllChats?: () => void;
  onOpenPage: (page: string) => void;
  onOpenMore: () => void;
  onConfirm: (e: CabinetEntry) => void;
  onWrong: (e: CabinetEntry) => void;
  onArchive: (e: CabinetEntry) => void;
  onKeep: (e: CabinetEntry) => void;
  /** Get more from Nora (setup checklist) and Offers for you. */
  getMore?: React.ReactNode;
  offers?: React.ReactNode;
}

/** Things Nordea noticed that wait for the customer, and old goals that look out of date. */
export function feedItems(entries: CabinetEntry[]) {
  return entries.filter((e) => (e.source === 'nordea' && !e.reviewed && e.status === 'active') || e.status === 'stale');
}

export const HomeHeader: React.FC<{ state: AppState; feedCount: number; onFrame: (w: string) => void; onAsk: () => void; onMore: () => void; onBell: () => void; onHelper?: (k: string) => void }> = ({ state, feedCount, onFrame, onAsk, onMore, onBell, onHelper }) => (
  <header className="nhead" style={{ backgroundImage: BAND_BG }}>
    <div className="nhead-top">
      <span className="nh-right" style={{ marginLeft: 'auto' }}>
        <button className="nh-bell nh-ic" onClick={onBell} aria-label={`Notifications${feedCount ? ': ' + feedCount : ''}`}>
          <span className="bell">
            <Bell />
            {feedCount > 0 && <i>{feedCount}</i>}
          </span>
        </button>
        {/* v31: like the Nordea app, the person icon opens More (profile, settings, presenter tools).
            Switching the demo customer stays in More → Presenter tools. */}
        <button className="nh-ic" onClick={onMore} aria-label="More: your details and settings">
          <Icon name="person" />
        </button>
      </span>
    </div>
    {/* v30: laid out like the bank's own overview: the welcome on the left, quick actions in a card below. */}
    <h1 className="nwelcome left">Welcome, {state.user.name}!</h1>
    {/* What this concept adds: a bar that opens the chat with Nora. */}
    <button className="ask-bar" onClick={onAsk}>
      <Icon name="spark" />
      <span>Ask Nora anything…</span>
      <i className="live-dot" aria-hidden="true" />
    </button>
    {/* Nora can help with: small chips right under the bar. */}
    {onHelper && (
      <div className="ask-helps" role="group" aria-label="Nora can help with">
        <span className="ask-helps-l">Nora can help with</span>
        {HELPER_ORDER.filter((k) => k !== 'abel' && (state.user.viewMode !== 'calm' || k === 'person')).map((k) => (
          <button key={k} className="ask-help" onClick={() => onHelper(k)}><Icon name={HELPERS[k].icon} />{HELPERS[k].card}</button>
        ))}
      </div>
    )}
  </header>
);

/** v30: the bank's own quick actions, in a card as in the Nordea app. They are not part of this concept, and say so before a tap. */
export const QuickActions: React.FC<{ onFrame: (w: string) => void }> = ({ onFrame }) => (
  <section className="ncard qa-card" aria-labelledby="qa-h">
    <div className="qa-h">
      <h2 id="qa-h">Quick actions</h2>
      <button className="qa-all" onClick={() => onFrame('Quick actions')}>Show all</button>
    </div>
    <div className="qa-row">
      {[
        { icon: 'pay', label: 'Pay', what: 'Payments' },
        { icon: 'scan', label: 'Scan invoice', what: 'Scanning invoices' },
        { icon: 'transfer', label: 'Transfer', what: 'Transfers' },
        { icon: 'search', label: 'Search', what: 'Search' },
      ].map((a) => (
        <button key={a.label} className="qa" onClick={() => onFrame(a.what)}>
          <span className="qa-c" aria-hidden="true"><Icon name={a.icon} /></span>
          <span className="qa-l">{a.label}</span>
        </button>
      ))}
    </div>
  </section>
);

export const HomePage: React.FC<Props> = (p) => {
  const { state } = p;
  const [accOpen, setAccOpen] = useState(false);
  const feed = feedItems(state.entries);
  const acc = state.accounts;
  const available = acc.current.balance + acc.savings.balance + (acc.carFund?.balance || 0);
  const carGoal = state.entries.find((e) => e.goalType === 'car' && e.status !== 'archived');

  // The bell counts what waits for the customer (Nordea noticed, old goals) and opens Nora knows → Waiting for you.
  const waitingCount = feed.length;
  const goals = state.goals || [];
  const mainGoal = goals.find((g) => /flat|home|house|apartment/i.test(g.title)) || goals[0];
  const accounts = [
    { name: 'Current account', a: acc.current },
    { name: 'Savings account', a: acc.savings },
    ...(acc.carFund && carGoal ? [{ name: 'Car fund', a: acc.carFund }] : []),
  ];

  const saveCard = (
    <div className="ncard">
      <button className="nrow2 head" onClick={() => p.onOpenPage('invest')}>
        <span className="n-l">
          <span className="n-name b">Save and invest</span>
          <span className="n-sub">
            {mainGoal ? `${mainGoal.title}: ${mainGoal.saved===undefined?'target '+eur(mainGoal.target)+', saved so far not known':eur(mainGoal.saved)+' of '+eur(mainGoal.target)} · ${goals.length} ${goals.length === 1 ? 'goal' : 'goals'}` : 'Create or view a savings goal'}
          </span>
        </span>
        <NChev />
      </button>
    </div>
  );

  return (
    <>
      <HomeHeader state={state} feedCount={waitingCount} onFrame={p.onFrame} onAsk={() => p.onOpenHelper('abel')} onMore={p.onOpenMore} onBell={() => p.onOpenPage('knows')}
        onHelper={(k) => (k === 'autopilot' ? p.onOpenPage('autopilot') : p.onOpenHelper(k))} />
      <div className="nbody">
        {(state.notices || []).filter(n => n.kind !== 'decision').map((n) => (
          <button key={n.id} className="ncard notice" onClick={() => p.onOpenConversation(n.conversationId)}>
            <span className="nt-ic" aria-hidden="true"><Icon name={n.kind === 'question' ? 'chat' : 'check'} /></span>
            <span className="nt-t"><b>{n.kind === 'question' ? `${n.by} from Nordea asked you` : 'Nordea decided on your application'}</b><span>{n.text}</span></span>
            <span className="nt-go">{n.kind === 'question' ? 'Answer' : 'Open'}</span>
          </button>
        ))}
        {/* The existing Nordea app: shown so Nora sits in a familiar place. Tapping says so. */}
        <QuickActions onFrame={p.onFrame} />
        {(state.notices || []).filter(n => n.kind === 'decision').map((n) => (
          <button key={n.id} className="ncard notice" onClick={() => p.onOpenConversation(n.conversationId)}>
            <span className="nt-ic" aria-hidden="true"><Icon name={n.kind === 'question' ? 'chat' : 'check'} /></span>
            <span className="nt-t"><b>{n.kind === 'question' ? `${n.by} from Nordea asked you` : 'Nordea decided on your application'}</b><span>{n.text}</span></span>
            <span className="nt-go">{n.kind === 'question' ? 'Answer' : 'Open'}</span>
          </button>
        ))}
        <div className="ncard">
          <button className="nrow2 head" onClick={() => p.onFrame('Payments')}>
            <span className="n-l">
              <span className="n-name b">Payments and e-invoices</span>
              <span className="n-sub"><i className="reddot" />Unconfirmed (2)</span>
            </span>
            <NChev />
          </button>
        </div>
        <div className="ncard">
          {/* v30: as in the bank's overview: the first accounts with amounts, then "Showing 2 of 3". */}
          <button className="nrow2 head" onClick={() => p.onFrame('Accounts')}>
            <span className="n-l">
              <span className="n-name b">Accounts and cards</span>
              <span className="n-sub">Available {nfi(available)}</span>
            </span>
            <NChev />
          </button>
          <div className="acc-list">
            {(accOpen ? accounts : accounts.slice(0, 2)).map((x) => (
              <NRow key={x.name} name={x.name} sub={x.a.iban} amount={nfi(x.a.balance)} onClick={() => p.onFrame('Accounts')} />
            ))}
            {accOpen && <NRow name="Spent this month" sub="Current account" amount={nfi(state.spentThisMonth)} />}
            <button className="acc-more" onClick={() => setAccOpen(!accOpen)} aria-expanded={accOpen}>
              {accOpen ? 'Show less' : accounts.length > 2 ? `Showing 2 of ${accounts.length} accounts · Show all` : 'Show spending this month'}
            </button>
          </div>
        </div>
        {saveCard}
        <div className="ncard">
          <button className="nrow2 head" onClick={() => p.onFrame('Loans')}>
            <span className="n-l">
              <span className="n-name b">Loans</span>
              <span className="n-sub">No loans · See home, student and other loans</span>
            </span>
            <NChev />
          </button>
        </div>
        {p.offers}
        <RefundHomeCard userId={state.user.id} onOpen={() => p.onOpenPage('refund')} />
        {p.getMore}

        <p className="foot-note">You can see and remove what Nora uses in Nora knows.</p>
      </div>
    </>
  );
};

export const HistoryCard: React.FC<{ state: AppState; all: boolean; onToggle: () => void; onOpen: (id: string) => void; onDelete?: (id: string) => void; onDeleteAll?: () => void }> = ({ state, all, onToggle, onOpen, onDelete, onDeleteAll }) => {
  const list = state.conversations;
  const shown = all ? list : list.slice(0, 3);
  // No chats yet: no empty box (Nora's helpers and "Ask Nora" are right there).
  if (!list.length) return null;
  return (
    <div className="ncard">
      <div className="nhead-row"><h3>Recent chats</h3>{list.length > 1 && onDeleteAll && <button className="btn link small" onClick={onDeleteAll}>Delete all</button>}</div>
      {list.length ? (
        <>
          {shown.map((c) => {
            const h = HELPERS[c.helperId] || HELPERS.abel;
            return (
              <div key={c.id} className="hist-wrap">
                <button className="hist-row" onClick={() => onOpen(c.id)}>
                  <span className={`hist-ico ${h.cls}`} aria-hidden="true"><Icon name={h.icon} /></span>
                  <span className="hist-t">
                    <b>{c.title.slice(0, 60)}</b>
                    <span>{h.name}{c.snippet ? ' · ' + c.snippet.slice(0, 60) : ''}</span>
                  </span>
                  <span className="hist-when">{ago(c.updatedAt)}</span>
                  {!onDelete && <NChev />}
                </button>
                {onDelete && (
                  <button className="hist-del" onClick={() => onDelete(c.id)} aria-label={`Delete chat: ${c.title.slice(0, 40)}`} title="Delete this chat">
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </div>
            );
          })}
          {list.length > 3 && <button className="nshowall" onClick={onToggle}>{all ? 'Show less' : 'Show all'}</button>}
        </>
      ) : (
        <p className="hist-empty">Your chats with Nora will show up here.</p>
      )}
    </div>
  );
};
