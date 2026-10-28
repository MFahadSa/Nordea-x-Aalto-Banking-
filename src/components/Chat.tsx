import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChatMessage, CabinetEntry, MessageCard, Share } from '../types.js';
import { Icon, BotAvatar, Chevron } from '../ui/icons.js';
import { eur, eurP, dayMonth } from '../ui/format.js';
import { HELPERS } from '../ui/helpers.js';

interface Props {
  open: boolean;
  helperId: string;
  userName: string;
  messages: ChatMessage[];
  waiting: boolean;
  entries: CabinetEntry[];
  shares: Share[];
  onClose: () => void;
  onNew: () => void;
  onSend: (text: string) => void;
  onAction: (messageId: string, action: string, payload?: Record<string, unknown>) => void;
  onUndo: (token: string) => void;
  onOpenPage: (page: string) => void;
  onOpenHelper: (id: string) => void;
  onRevoke: (shareId: string) => void;
  onImport: (body: { sample?: boolean; text?: string; fileName?: string }) => void;
  onEditEntry: (id: string) => void;
}

type Item = { who: 'me' | 'bot'; key: string; node: React.ReactNode; rich?: boolean; after?: React.ReactNode };

export const Chat: React.FC<Props> = (p) => {
  const h = HELPERS[p.helperId] || HELPERS.abel;
  const [text, setText] = useState('');
  const [attOpen, setAttOpen] = useState(false);
  const [usedOpen, setUsedOpen] = useState<string | null>(null);
  const [impShow, setImpShow] = useState<string | null>(null);
  const [impSel, setImpSel] = useState<Record<string, boolean[]>>({});
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seen = useRef<Set<string>>(new Set());

  useLayoutEffect(() => {
    const b = bodyRef.current;
    if (b) b.scrollTo({ top: b.scrollHeight, behavior: seen.current.size ? 'smooth' : 'auto' });
  }, [p.messages.length, p.waiting, p.open, usedOpen, impShow]);
  useEffect(() => {
    setUsedOpen(null);
    setImpShow(null);
  }, [p.helperId]);

  if (!p.open) return null;

  const send = (t: string) => {
    const v = t.trim();
    if (!v || p.waiting) return;
    setText('');
    p.onSend(v);
  };

  const byId = (id: string) => p.entries.find((e) => e.id === id);
  const usedLine = (m: ChatMessage) => {
    const es = (m.usedEntryIds || []).map(byId).filter((e): e is CabinetEntry => !!e && e.status !== 'archived');
    if (!es.length) return null;
    const open = usedOpen === m.id;
    return (
      <>
        <button className="used-l" onClick={() => setUsedOpen(open ? null : m.id)} aria-expanded={open}>
          <span className="ud">{es.slice(0, 3).map((e) => <i key={e.id} className={e.source === 'nordea' ? 'bank' : 'you'} />)}</span>
          Based on {es.length} {es.length === 1 ? 'thing' : 'things'} Abel knows
          <Chevron rotate={open ? -90 : 90} size={14} />
        </button>
        {open && (
          <div className="used-list">
            {es.map((e) => (
              <div className="used-i" key={e.id}>
                <span className={`dotc ${e.source === 'nordea' ? 'bank' : 'you'}`} />
                <span className="used-t"><b>{e.title}</b><span>{e.source === 'nordea' ? 'Nordea noticed · you confirmed' : e.source === 'document' ? 'From a document you imported' : 'You told Abel'}</span></span>
                <button className="btn link" onClick={() => p.onEditEntry(e.id)}>Edit</button>
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  const cardNode = (m: ChatMessage, c: MessageCard, ci: number): React.ReactNode => {
    const d = c.data || {};
    const open = !m.resolved;
    const act = (a: string, payload?: Record<string, unknown>) => p.onAction(m.id, a, payload);
    switch (c.type) {
      case 'offer':
        return (
          <div className="offer">
            <div className="of-h"><span className="of-logo" style={{ background: d.color }}>{d.initials}</span><span className="of-n"><b>{d.name}</b><span>{d.kind} · fictional partner</span></span><span className="of-tag">Partner offer</span></div>
            <div className="of-b"><b>{d.headline}</b></div>
            <div className="of-fee"><Icon name="shield" /><span>{d.feeText}</span></div>
            {open && (
              <>
                <div className="of-act"><button className="btn primary" onClick={() => act('offer_show')}>{d.cta}</button><button className="btn" onClick={() => act('offer_no')}>No thanks</button></div>
                <div className="of-foot"><button className="btn link" onClick={() => p.onOpenHelper('person')}>{d.alternative}</button><button className="btn link muted" onClick={() => act('offer_off')}>Turn off partner offers</button></div>
              </>
            )}
          </div>
        );
      case 'offer_list': {
        const bought = m.resolved?.startsWith('bought:') ? Number(m.resolved.slice(7)) : null;
        return (
          <div className="offer list">
            <div className="of-h sm"><span className="of-logo" style={{ background: d.color }}>{d.initials}</span><span className="of-n"><b>{d.name}</b><span>Partner offer · fictional</span></span></div>
            {(d.items || []).map((it: any, j: number) => (
              <div className={`of-row${bought === j ? ' bought' : ''}`} key={j}>
                <div className="of-rt"><span><b>{it.title}</b><span>{it.sub}</span></span><b className="of-p">{eurP(it.price)}{it.per || ''}</b></div>
                {bought == null ? (
                  <div className="of-ra"><button className="btn small" onClick={() => act('offer_view', { index: j })}>{d.view}</button><button className="btn small primary" onClick={() => act('offer_buy', { index: j })}>{d.buy}</button></div>
                ) : bought === j ? (
                  <span className="of-done">✓ You {d.verb} this</span>
                ) : null}
              </div>
            ))}
            <div className="of-fee"><Icon name="shield" /><span>{d.feeText}</span></div>
          </div>
        );
      }
      case 'confirm_plan':
        return (
          <div className="offer">
            <div className="of-h sm"><span className="of-logo" style={{ background: 'var(--brand)' }}><Icon name="cycle" /></span><span className="of-n"><b>{c.title}</b><span>Please confirm</span></span></div>
            <div className="of-row"><div className="of-rt"><span><b>Amount</b></span><b className="of-p">{eur(d.amount)} every month</b></div></div>
            <div className="of-row"><div className="of-rt"><span><b>From</b></span><span>{d.from}</span></div></div>
            <div className="of-row"><div className="of-rt"><span><b>To</b></span><span>{d.to}</span></div></div>
            <div className="of-row"><div className="of-rt"><span><b>Starts</b></span><span>{dayMonth(d.starts)}</span></div></div>
            <div className="of-fee"><Icon name="shield" /><span>{d.earns}</span></div>
            {open && <div className="of-act" style={{ paddingBottom: 12 }}><button className="btn primary" onClick={() => act('plan_confirm')}>Yes, set it up</button><button className="btn" onClick={() => act('plan_cancel')}>Cancel</button></div>}
          </div>
        );
      case 'confirm_save':
        return (
          <div className="offer">
            <div className="of-b" style={{ paddingTop: 14 }}><b>🔒 {d.draft?.title}</b></div>
            <div className="of-fee"><Icon name="shield" /><span>{c.body}</span></div>
            {open && <div className="of-act" style={{ paddingBottom: 12 }}><button className="btn primary" onClick={() => act('save_private')}>Save privately</button><button className="btn" onClick={() => act('save_no')}>Don’t save it</button></div>}
          </div>
        );
      case 'handoff':
        return (
          <div className="rc">
            <b className="rc-t">Ready! {c.title} would receive:</b>
            <div className="legend small"><span className="from you">You told us</span><span className="from bank">Nordea noticed</span></div>
            <ul className="rc-l">
              {(d.gets || []).slice(0, 6).map((g: any, k: number) => <li key={k}><span className={`dotc ${g.source === 'nordea' ? 'bank' : 'you'}`} />{g.title}</li>)}
              {(d.gets || []).length > 6 && <li className="more-l">…and {d.gets.length - 6} more</li>}
            </ul>
            {d.heldBack > 0 && <p className="rc-n">Held back: {d.heldBack} not approved by you, private, or not checked yet.</p>}
            <span className="earns no">{d.earns}</span>
            <p className="rc-n share-n"><Icon name="cal" /><span>{d.share}</span></p>
            {open && <div className="of-act" style={{ padding: '4px 0 0' }}><button className="btn primary" onClick={() => act('handoff_connect')}>Connect me</button><button className="btn" onClick={() => act('handoff_no')}>Not now</button></div>}
          </div>
        );
      case 'import': {
        const items: any[] = d.items || [];
        const sel = impSel[m.id] || items.map((x) => !!x.on);
        const n = sel.filter(Boolean).length;
        return (
          <div className="imp">
            {items.map((x, j) => (
              <button key={j} className={`imp-i${sel[j] ? ' on' : ''}`} disabled={!open} aria-pressed={sel[j]} onClick={() => setImpSel({ ...impSel, [m.id]: sel.map((v, k) => (k === j ? !v : v)) })}>
                <span className="imp-ck" aria-hidden="true">{sel[j] && <Icon name="check" />}</span>
                <span className="imp-t"><b>{x.sensitive ? '🔒 ' : ''}{x.title}</b><span>{x.detail}</span>{x.quote && <q>{x.quote}</q>}</span>
              </button>
            ))}
            {impShow === m.id && d.transcript && <div className="imp-src">{String(d.transcript).split('\n').map((l: string, k: number) => { const [w, ...rest] = l.split(': '); return <p key={k}><b>{w}:</b> {rest.join(': ')}</p>; })}</div>}
            {open && <div className="of-act"><button className="btn primary" disabled={!n} onClick={() => act('import_save', { selected: sel.map((v, k) => (v ? k : -1)).filter((k) => k >= 0) })}>Save {n} {n === 1 ? 'thing' : 'things'}</button><button className="btn" onClick={() => act('import_no')}>Not now</button></div>}
            {d.transcript && <div className="of-foot"><button className="btn link" onClick={() => setImpShow(impShow === m.id ? null : m.id)}>{impShow === m.id ? 'Hide the conversation' : 'Show the conversation'}</button></div>}
          </div>
        );
      }
      case 'info': {
        if (d.shareId) {
          const s = p.shares.find((x) => x.id === d.shareId);
          if (!s) return null;
          return s.revoked ? <span>Sharing stopped. The adviser can’t see what Abel knows any more.</span> : <span>🔗 Shared once with your adviser, until {dayMonth(s.until)}. <button className="btn link" onClick={() => p.onRevoke(s.id)}>Stop sharing now</button></span>;
        }
        if (d.link) return <button className="btn small" onClick={() => p.onOpenPage(d.link)}>{d.label}</button>;
        return null;
      }
      default:
        return null;
    }
  };

  // Build the list of bubbles (grouped like a messenger).
  const items: Item[] = [];
  const [g1, g2] = h.greet(p.userName);
  items.push({ who: 'bot', key: 'g1' + p.helperId, node: g1 }, { who: 'bot', key: 'g2' + p.helperId, node: g2 });
  p.messages.forEach((m) => {
    if (m.sender === 'user') {
      items.push({ who: 'me', key: m.id, node: m.text });
      return;
    }
    const parts = String(m.text || '').split(/\n{2,}/).filter(Boolean);
    const cards = (m.cards || []).map((c, ci) => ({ c, ci, node: cardNode(m, c, ci) })).filter((x) => x.node);
    const inlineInfo = cards.filter((x) => x.c.type === 'info');
    const richCards = cards.filter((x) => x.c.type !== 'info');
    parts.forEach((t, n) => {
      const last = n === parts.length - 1;
      items.push({
        who: 'bot',
        key: `${m.id}-t${n}`,
        node: (
          <>
            <span className="pre">{t}</span>
            {last && (m.notes || []).map((nt, k) => (
              <span className="noted" key={k}>{nt.text} {nt.undoToken && <button className="btn link" onClick={() => p.onUndo(nt.undoToken!)}>Undo</button>}</span>
            ))}
            {last && inlineInfo.map((x) => <span className="noted" key={x.ci}>{x.node}</span>)}
          </>
        ),
      });
    });
    richCards.forEach((x) => items.push({ who: 'bot', key: `${m.id}-c${x.ci}`, node: x.node, rich: true }));
    const lastBot = [...items].reverse().find((it) => it.who === 'bot');
    if (lastBot) lastBot.after = usedLine(m);
    if (m.resolved && !m.resolved.startsWith('bought:')) items.push({ who: 'me', key: `${m.id}-r`, node: m.resolved });
  });

  const last = p.messages[p.messages.length - 1];
  const pills = !p.waiting && last && last.sender === 'agent' && !last.resolved && last.suggestions?.length ? last.suggestions : !p.messages.length ? h.chips.map((c) => c[1]) : null;
  const pillLabel = (s: string) => (!p.messages.length ? h.chips.find((c) => c[1] === s)?.[0] || s : s);

  return (
    <section className={`chat ${h.cls}`} role="dialog" aria-label={`Chat with ${h.name}`}>
      <header className="chat-h">
        <span className="bot-av lg" aria-hidden="true"><Icon name={h.icon} /></span>
        <div className="chat-t">
          <b>{h.name}</b>
          <span id="chat-status"><i className="live-dot inline" />{p.waiting ? 'typing…' : `${h.sub} · online`}</span>
        </div>
        <button className="chat-ic" onClick={p.onNew} aria-label="Start a new conversation" title="New conversation">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5" /></svg>
        </button>
        <button className="chat-ic" onClick={p.onClose} aria-label="Close chat" title="Close">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      <div className="chat-body" id="chat-body" ref={bodyRef} aria-live="polite">
        <div className="chat-date"><span>Today</span></div>
        {items.map((it, n) => {
          const prev = items[n - 1], next = items[n + 1];
          const first = !prev || prev.who !== it.who, lastG = !next || next.who !== it.who;
          const pop = seen.current.has(it.key) ? '' : ' pop';
          seen.current.add(it.key);
          if (it.who === 'me') return <div key={it.key} className={`mrow me${pop}${first ? ' gstart' : ''}`}><div className="bub">{it.node}</div></div>;
          return (
            <div key={it.key} className={`mrow bot${pop}${first ? ' gstart' : ''}${it.rich ? ' wide' : ''}`}>
              {lastG ? <BotAvatar /> : <span className="av-sp" />}
              <div className="mcol">
                {first && <span className="mname">Abel</span>}
                <div className={it.rich ? 'rich' : 'bub'}>{it.node}</div>
                {it.after}
              </div>
            </div>
          );
        })}
        {p.waiting && (
          <div className="mrow bot pop gstart"><BotAvatar /><div className="mcol"><div className="bub typing" aria-label="Abel is typing"><i /><i /><i /></div></div></div>
        )}
        {pills && (
          <div className="qr pop">
            {pills.map((s) => <button key={s} className="qr-b" onClick={() => send(s)}>{pillLabel(s)}</button>)}
          </div>
        )}
      </div>
      <div className="att-pop" hidden={!attOpen}>
        <button onClick={() => { setAttOpen(false); p.onImport({ sample: true }); }}><Icon name="contact" /><span><b>Import a chat (sample)</b><span>Lauri and Mia plan their year</span></span></button>
        <button onClick={() => { setAttOpen(false); fileRef.current?.click(); }}><Icon name="file" /><span><b>File</b><span>Markdown or text</span></span></button>
      </div>
      <div className="chat-in">
        <button className="chat-plus" type="button" onClick={() => setAttOpen(!attOpen)} aria-label="Add a file">
          <Icon name="plus" />
        </button>
        <label className="sr" htmlFor="ai-q">Message {h.name}</label>
        <input
          id="ai-q"
          placeholder="Message…"
          autoComplete="off"
          enterKeyHint="send"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(text);
            }
          }}
        />
        <button className="chat-send" type="button" onClick={() => send(text)} disabled={p.waiting} aria-label="Send">
          <Icon name="send" />
        </button>
        <input
          type="file"
          ref={fileRef}
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const t = await f.text();
            p.onImport({ text: t, fileName: f.name });
          }}
        />
      </div>
      <p className="chat-foot">Concept · fictional data · nothing saved without your OK</p>
    </section>
  );
};
