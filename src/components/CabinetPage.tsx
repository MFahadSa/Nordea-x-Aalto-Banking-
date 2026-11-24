// What Nora knows: five sections, nothing else.
//   1. About you          - the paragraph and the open questions (src/components/AboutYou.tsx)
//   2. Waiting for you    - everything that needs a yes or no; it leaves this list once answered
//   3. From you           - goals and notes the customer added
//   4. From Nordea        - what Nordea noticed and the customer confirmed
//   5. Your documents     - kept files, and an open refund case
// Every item has the same buttons: Edit · Remove · How do we know? (Nordea only).
// Removed or marked-wrong items leave the page at once (Undo in the toast; kept in history).
import React, { useEffect, useState } from 'react';
import {
  AppState, ApprovalCard, fetchApprovalCards, decideApprovalCard, PipeItem, fetchPipelineWaiting, decidePipelineItem, SOURCE_NAME, documentUrl, type DocInfo,
} from '../services/api.js';
import type { CabinetEntry } from '../types.js';
import type { AboutView } from '../aboutParts.js';
import { Icon } from '../ui/icons.js';
import { eur, monthShort, monthLong, dayMonth } from '../ui/format.js';
import { Band, RoundActions, BAND_BG } from './Nordea.js';
import { AboutCard } from './AboutYou.js';
import { RefundKnows } from './Refund.js';

export interface CabinetProps {
  state: AppState;
  about: AboutView | null;
  onAboutSaved: (v: AboutView) => void;
  onSeeNora: () => void;
  onRewards: () => void;
  onAddGoal: () => void;
  onTellNora: () => void;
  onImport: () => void;
  onPrivacy: () => void;
  onAskAbout: (text: string) => void;
  onUpdate: (e: CabinetEntry, updates: Partial<CabinetEntry>) => void;
  onArchive: (e: CabinetEntry) => void;
  onConfirm: (e: CabinetEntry) => void;
  onKeep: (e: CabinetEntry) => void;
  onDeleteDoc: (id: string) => void;
  onChanged?: () => void;
  onToast: (message: string) => void;
  adviceBusy?: boolean;
  onAdviceChange?: (ruleId: string, what: 'allow' | 'forget') => void;
  onOpenRefundCase?: () => void;
}

const fromNordea = (e: CabinetEntry) => e.source === 'nordea';
/** Shown at all: not removed, not marked wrong, not a blind spot, not an About you note (shown up top). */
const shown = (e: CabinetEntry) => e.status !== 'archived' && e.status !== 'disputed' && e.type !== 'blind_spot' && !e.aboutPart;

/** Edit in place: the name and details (and for a goal, the amount and date). */
const EditForm: React.FC<{ e: CabinetEntry; onSave: (u: Partial<CabinetEntry>) => void; onCancel: () => void }> = ({ e, onSave, onCancel }) => {
  const [title, setTitle] = useState(e.title);
  const [detail, setDetail] = useState(e.detail || '');
  const [amount, setAmount] = useState(e.target ? String(e.target.amount) : '');
  const [date, setDate] = useState(e.target?.date?.slice(0, 7) || '');
  const goal = e.type === 'goal';
  const ok = title.trim().length > 0 && (!goal || !amount || Number(amount) > 0);
  return (
    <form className="cb-edit" onSubmit={(ev) => {
      ev.preventDefault();
      if (!ok) return;
      const u: Partial<CabinetEntry> = { title: title.trim(), detail: detail.trim() };
      if (goal && amount && date) u.target = { amount: Number(amount), date: `${date}-01` };
      onSave(u);
    }}>
      <label className="pf-l" htmlFor={`ed-t-${e.id}`}>Name</label>
      <input id={`ed-t-${e.id}`} className="ab-text one" value={title} onChange={(x) => setTitle(x.target.value)} autoFocus />
      {goal ? (
        <div className="cb-edit-row">
          <span><label className="pf-l" htmlFor={`ed-a-${e.id}`}>Amount (€)</label><input id={`ed-a-${e.id}`} className="ab-text one" inputMode="numeric" value={amount} onChange={(x) => setAmount(x.target.value.replace(/[^\d]/g, ''))} /></span>
          <span><label className="pf-l" htmlFor={`ed-d-${e.id}`}>By</label><input id={`ed-d-${e.id}`} className="ab-text one" type="month" value={date} onChange={(x) => setDate(x.target.value)} /></span>
        </div>
      ) : (
        <>
          <label className="pf-l" htmlFor={`ed-d-${e.id}`}>Details</label>
          <textarea id={`ed-d-${e.id}`} className="ab-text" rows={2} value={detail} onChange={(x) => setDetail(x.target.value)} />
        </>
      )}
      <div className="cb-btns">
        <button type="submit" className="btn small primary" disabled={!ok}>Save</button>
        <button type="button" className="btn small quiet" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
};

/** The three buttons every item has, always in the same order. */
const Actions: React.FC<{ e: CabinetEntry; editing: boolean; why: boolean; onEdit: () => void; onRemove: () => void; onWhy?: () => void }> = ({ e, why, onEdit, onRemove, onWhy }) => {
  // Hidden until asked for, so each item stays one or two lines.
  const [open, setOpen] = useState(false);
  if (!open) return (
    <button className="cb-more" aria-expanded={false} aria-label={`${onWhy && e.why ? 'Edit, remove or see why' : 'Edit or remove'}: ${e.title}`} title="More" onClick={() => setOpen(true)}>
      <Icon name="dots" size={22} strokeWidth={2.4} />
    </button>
  );
  return (
    <div className="cb-btns">
      <button className="btn small" onClick={onEdit}><Icon name="sliders" size={15} />Edit</button>
      <button className="btn small" onClick={onRemove}><Icon name="trash" size={15} />Remove</button>
      {onWhy && e.why && <button className="btn small" aria-expanded={why} onClick={onWhy}><Icon name="info" size={15} />How do we know?</button>}
      <button className="btn small quiet" aria-expanded onClick={() => setOpen(false)}>Close</button>
    </div>
  );
};

export const CabinetPage: React.FC<CabinetProps> = (p) => {
  const { state } = p;
  const [editing, setEditing] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // "Not right" on something Nordea noticed: then Edit (correct it) or Remove.
  const [wrong, setWrong] = useState<string | null>(null);
  // From you, From Nordea and Your documents fold away to save space.
  const [sec, setSec] = useState<Record<string, boolean>>({});
  const isOpen = (k: string) => sec[k] !== false;
  const toggleSec = (k: string) => setSec((x) => ({ ...x, [k]: !isOpen(k) }));
  const fold = (k: string, n: number) => (
    <button className="btn link band-act cb-fold" aria-expanded={isOpen(k)} onClick={() => toggleSec(k)}>{isOpen(k) ? 'Hide' : n ? `Show ${n}` : 'Show'}<Icon name="chev" size={15} /></button>
  );

  // Waiting for you: inputs from glasses / chats / documents, and approval requests, come from the server.
  const [pipe, setPipe] = useState<PipeItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalCard[]>([]);
  const loadWaiting = () => { fetchPipelineWaiting(state.user.id).then(setPipe); fetchApprovalCards(state.user.id).then(setApprovals); };
  useEffect(() => { loadWaiting(); }, [state.user.id, state.entries.length]);
  useEffect(() => { const t = window.setInterval(() => { if (!document.hidden) fetchPipelineWaiting(state.user.id).then(setPipe); }, 4000); return () => window.clearInterval(t); }, [state.user.id]);
  const decidePipe = async (c: PipeItem, a: 'save' | 'private' | 'drop') => {
    await decidePipelineItem(state.user.id, c.id, a); loadWaiting(); p.onChanged?.();
    p.onToast(a === 'drop' ? 'Dropped. Nora won’t use it.' : a === 'private' ? 'Saved privately. Only Nora uses it.' : 'Saved. You’ll find it under From you.');
  };
  const decideApproval = async (c: ApprovalCard, ok: boolean) => {
    await decideApprovalCard(state.user.id, c.id, ok); loadWaiting(); p.onChanged?.();
    p.onToast(ok ? 'Approved. Nora can use it now.' : 'Rejected. Nora won’t use it.');
  };

  const items = state.entries.filter(shown);
  const tracked = new Set(state.goals.map((g) => g.goalId));
  // 2. Waiting: Nordea's guesses not yet confirmed, and goals that look out of date.
  const guesses = items.filter((e) => fromNordea(e) && !e.reviewed);
  const stale = items.filter((e) => e.type === 'goal' && e.status === 'stale');
  const waitingCount = guesses.length + stale.length + pipe.length + approvals.length;
  // 3. From you / 4. From Nordea (confirmed).
  const mine = items.filter((e) => !fromNordea(e) && e.status === 'active' && !tracked.has(e.id));
  const nordea = items.filter((e) => fromNordea(e) && e.reviewed && e.status === 'active');
  const goals = state.goals.filter((g) => items.some((e) => e.id === g.goalId && e.status === 'active'));
  const docs = state.documents || [];

  const edit = (e: CabinetEntry) => { setEditing(editing === e.id ? null : e.id); setWhy(null); };
  const remove = (e: CabinetEntry) => { setEditing(null); p.onArchive(e); };
  const saveEdit = (e: CabinetEntry, u: Partial<CabinetEntry>) => { setEditing(null); p.onUpdate(e, u); };

  const itemRow = (e: CabinetEntry, nordeaSide: boolean) => (
    <div className="cb-item" key={e.id}>
      <span className="cb-t"><span className="n-name">{e.title}{e.private && <Icon name="shield" size={14} />}</span>{e.detail && <span className="n-sub">{e.detail}</span>}</span>
      {editing === e.id ? <EditForm e={e} onSave={(u) => saveEdit(e, u)} onCancel={() => setEditing(null)} /> : (
        <Actions e={e} editing={false} why={why === e.id} onEdit={() => edit(e)} onRemove={() => remove(e)} onWhy={nordeaSide ? () => setWhy(why === e.id ? null : e.id) : undefined} />
      )}
      {why === e.id && e.why && <p className="cb-why">{e.why}</p>}
    </div>
  );

  return (
    <>
      <header className="nhead detail kn-head" style={{ backgroundImage: BAND_BG }}>
        <div className="dh-top">
          <span className="dh-back" />
          <b>What Nora knows</b>
          <button className="dh-side" onClick={p.onPrivacy}><Icon name="shield" />Who sees it</button>
        </div>
        <RoundActions actions={[
          { icon: 'plus', label: 'Add a goal', onClick: p.onAddGoal },
          { icon: 'spark', label: 'Tell Nora', onClick: p.onTellNora },
          { icon: 'file', label: 'Import a chat', onClick: p.onImport },
        ]} />
      </header>
      <div className="nbody">
        {/* 1. About you */}
        <AboutCard userId={state.user.id} view={p.about} onSeeNora={p.onSeeNora} onSaved={p.onAboutSaved} onRewards={p.onRewards} />

        {/* 2. Waiting for you */}
        <Band left="Waiting for you" right={waitingCount ? <span className="cb-count">{waitingCount}</span> : undefined} />
        <div className="ncard cb-sec">
          {!waitingCount && <p className="cb-empty"><Icon name="check" size={16} strokeWidth={2.6} />Nothing waiting. You’re all set.</p>}
          {guesses.map((e) => (
            <div className="cb-item" key={e.id}>
              <span className="cb-src bank"><Icon name="bank" size={13} />Nordea noticed</span>
              <span className="cb-t"><span className="n-name">{e.title}</span>{e.detail && <span className="n-sub">{e.detail.replace(/\s*Is this right\?$/, '')}</span>}</span>
              {editing === e.id ? (
                <EditForm e={e} onSave={(u) => { setEditing(null); setWrong(null); p.onUpdate(e, { ...u, reviewed: true }); }} onCancel={() => setEditing(null)} />
              ) : wrong === e.id ? (
                <div className="cb-btns">
                  <span className="cb-ask">What would you like to do?</span>
                  <button className="btn small primary" onClick={() => setEditing(e.id)}><Icon name="sliders" size={15} />Edit</button>
                  <button className="btn small" onClick={() => { setWrong(null); p.onUpdate(e, { status: 'disputed' }); }}><Icon name="trash" size={15} />Remove</button>
                  <button className="btn small quiet" onClick={() => setWrong(null)}>Cancel</button>
                </div>
              ) : (
                <div className="cb-btns">
                  <button className="btn small primary" onClick={() => p.onConfirm(e)}><Icon name="check" size={15} strokeWidth={2.6} />Yes, that’s right</button>
                  <button className="btn small" onClick={() => setWrong(e.id)}>Not right</button>
                  {e.why && <button className="btn small quiet" aria-expanded={why === e.id} onClick={() => setWhy(why === e.id ? null : e.id)}><Icon name="info" size={15} />How do we know?</button>}
                </div>
              )}
              {why === e.id && e.why && <p className="cb-why">{e.why}</p>}
            </div>
          ))}
          {stale.map((e) => (
            <div className="cb-item" key={e.id}>
              <span className="cb-src you"><Icon name="person" size={13} />Your goal</span>
              <span className="cb-t"><span className="n-name">Still saving for “{e.title}”?</span><span className="n-sub">No money has been added for a long time.</span></span>
              <div className="cb-btns">
                <button className="btn small primary" onClick={() => p.onKeep(e)}>Yes, keep it</button>
                <button className="btn small" onClick={() => p.onArchive(e)}><Icon name="trash" size={15} />Remove</button>
              </div>
            </div>
          ))}
          {pipe.map((c) => (
            <div className="cb-item" key={c.id}>
              <span className="cb-src you"><Icon name="person" size={13} />From your {SOURCE_NAME[c.source].toLowerCase()}</span>
              <span className="cb-t"><span className="n-name">{c.title}</span>{c.detail && c.detail !== c.title && <span className="n-sub">{c.detail}</span>}</span>
              <div className="cb-btns">
                <button className="btn small primary" onClick={() => decidePipe(c, c.filter === 'private' ? 'private' : 'save')}>{c.filter === 'private' ? 'Save privately' : 'Save'}</button>
                <button className="btn small" onClick={() => decidePipe(c, 'drop')}><Icon name="trash" size={15} />Remove</button>
              </div>
            </div>
          ))}
          {approvals.map((c) => (
            <div className="cb-item" key={c.id}>
              <span className="cb-src you"><Icon name="person" size={13} />Your goal</span>
              <span className="cb-t"><span className="n-name">{c.summary.replace(/^Customer goal: /, 'Goal: ')}</span>
                <span className="n-sub">Can Nora use this goal in her advice and offers? If not, it stays only in your goals.</span></span>
              <div className="cb-btns">
                <button className="btn small primary" onClick={() => decideApproval(c, true)}><Icon name="check" size={15} strokeWidth={2.6} />Yes, use it</button>
                <button className="btn small" onClick={() => decideApproval(c, false)}>Keep it private</button>
              </div>
            </div>
          ))}
        </div>

        {/* 3. From you */}
        <Band left="From you" right={fold('mine', goals.length + mine.length)} />
        {isOpen('mine') && <div className="ncard cb-sec">
          {!goals.length && !mine.length && <p className="cb-empty">Nothing yet. Add a goal, or tell Nora about your plans.</p>}
          {goals.map((g) => {
            const e = items.find((x) => x.id === g.goalId)!;
            return (
              <div className="cb-item" key={g.goalId}>
                <button className="cb-goal" aria-expanded={open === g.goalId} onClick={() => setOpen(open === g.goalId ? null : g.goalId)}>
                  <span className="cb-t">
                    <span className="n-name">{g.title}</span>
                    <span className="n-sub">{g.saved === undefined ? `Saved balance not linked · target ${eur(g.target)}` : `${eur(g.saved)} of ${eur(g.target)}`} · by {monthShort(g.targetDate.slice(0, 7))}</span>
                    <span className="gbar">{g.percentSaved !== undefined && <i style={{ width: `${Math.min(100, g.percentSaved)}%` }} />}</span>
                  </span>
                  <span className={`npill ${g.onTrack === undefined ? 'grey' : g.onTrack ? 'up' : 'down'}`}>{g.onTrack === undefined ? 'Forecast unknown' : g.onTrack ? 'On track' : `${eur(g.shortBy)} short`}</span>
                </button>
                {open === g.goalId && (
                  <p className="cb-why">
                    {g.projectedByTargetDate === undefined ? 'Forecast unavailable. Link the saved balance and monthly contribution to assess progress.' : <>At {eur(g.monthlyGoingIn)} a month you’ll have about {eur(g.projectedByTargetDate)} by {monthLong(g.targetDate.slice(0, 7))}{g.onTrack ? '.' : `: ${eur(g.extraPerMonthNeeded)} more a month closes the gap.`} An estimate, not a guarantee.</>}{' '}
                    <button className="btn link" onClick={() => p.onAskAbout(`Am I on track for “${g.title}”?`)}>Ask Nora</button>
                  </p>
                )}
                {editing === e.id ? <EditForm e={e} onSave={(u) => saveEdit(e, u)} onCancel={() => setEditing(null)} /> : (
                  <Actions e={e} editing={false} why={false} onEdit={() => edit(e)} onRemove={() => remove(e)} />
                )}
              </div>
            );
          })}
          {mine.map((e) => itemRow(e, false))}
          <button className="cb-link" onClick={p.onAddGoal}><Icon name="plus" size={16} />Add a goal<Icon name="chev" size={16} /></button>
        </div>}

        {/* 4. From Nordea */}
        <Band left="From Nordea" right={fold('nordea', nordea.length)} />
        {isOpen('nordea') && <div className="ncard cb-sec">
          {!nordea.length && <p className="cb-empty">Nothing yet. When you confirm something Nordea noticed, it shows here.</p>}
          {nordea.map((e) => itemRow(e, true))}
        </div>}

        {/* 5. Your documents */}
        <Band left="Your documents" right={fold('docs', docs.length)} />
        {isOpen('docs') && <div className="ncard cb-sec" id="your-docs">
          {!docs.length && <p className="cb-empty">None kept. Switch on “Keep a copy” when you add a file to a chat.</p>}
          {[...docs].reverse().map((d: DocInfo) => (
            <div className="cb-item" key={d.id}>
              <span className="cb-t">
                <span className="n-name"><Icon name={d.kind === 'image' ? 'image' : 'file'} size={16} />{d.name}</span>
                <span className="n-sub">{d.entries.length ? `Saved from it: ${d.entries.join(', ')}` : 'Nothing saved from it'} · deletes itself on {dayMonth(d.expiresAt.slice(0, 10))}</span>
              </span>
              <div className="cb-btns">
                <a className="btn small" href={documentUrl(state.user.id, d.id)} target="_blank" rel="noopener">Open</a>
                <button className="btn small" onClick={() => p.onDeleteDoc(d.id)}><Icon name="trash" size={15} />Remove</button>
              </div>
            </div>
          ))}
        </div>}
        {isOpen('docs') && <RefundKnows userId={state.user.id} onOpen={p.onOpenRefundCase} bare />}
      </div>
    </>
  );
};
