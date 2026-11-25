// More → Memory: what Nora may remember and how, modelled on Claude's memory settings, adapted to banking.
// Private things are never saved automatically: a private note is saved only when the customer taps Save privately,
// a private goal only after its confirm card. Import gives a short prompt for another AI that asks only for what
// matters for banking; what comes back goes to Nora knows → Waiting for you, and nothing is saved without a tap.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppState, sendToPipeline } from '../services/api.js';
import { Icon } from '../ui/icons.js';
import { Band, DetailHead, Toggle } from './Nordea.js';

interface Memory { searchChats: boolean; fromChats: boolean }

export const IMPORT_PROMPT = `I'm moving to Nora, my bank's assistant at Nordea. Please list what you know about me that matters for my everyday money, and nothing else.

Only include:
- Life situation: work or study, where I live (rent or own), who I live with
- Money goals and plans: what I'm saving for, rough amounts and dates
- Big upcoming events: moving, a wedding, a baby, studies, a car
- Money habits and preferences: how I like to budget, save or invest, and how careful I am with risk
- How I like answers: short or detailed

Leave out: health, religion, politics, relationships, other people's private details, passwords, card or account numbers, and anything you're not sure about.

Write one short line per item, starting with the category, for example:
Goal: Save 3 000 € for a trip to Japan by June 2027`;

const Row: React.FC<{ name: string; sub: React.ReactNode; right: React.ReactNode }> = ({ name, sub, right }) => (
  <div className="mem-row">
    <div className="mem-t"><b>{name}</b><span>{sub}</span></div>
    <div className="mem-r">{right}</div>
  </div>
);

function exportMarkdown(state: AppState) {
  const live = state.entries.filter((e) => e.status !== 'archived' && e.status !== 'disputed');
  const groups: [string, typeof live][] = [
    ['Goals', live.filter((e) => e.type === 'goal')],
    ['Life events', live.filter((e) => e.type === 'life_event')],
    ['Preferences', live.filter((e) => e.type === 'preference')],
    ['Facts', live.filter((e) => e.type !== 'goal' && e.type !== 'life_event' && e.type !== 'preference')],
  ];
  const day = new Date().toISOString().slice(0, 10);
  const lines = [`# What Nora knows about ${state.user.name}`, '', `Exported ${day}. Source: Nordea app → More → Memory.`, ''];
  for (const [h, list] of groups) {
    if (!list.length) continue;
    lines.push(`## ${h}`, '');
    for (const e of list) {
      const from = e.source === 'nordea' ? 'from Nordea' : e.source === 'document' ? 'from a document' : 'from you';
      lines.push(`- **${e.title}**${e.detail && e.detail !== e.title ? `: ${e.detail}` : ''} _(${from}${e.private ? ', private' : ''})_`);
    }
    lines.push('');
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nora-memory-${day}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const ImportSheet: React.FC<{ userId: string; onClose: () => void; onDone: (n: number) => void }> = ({ userId, onClose, onDone }) => {
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(IMPORT_PROMPT); setCopied(true); } catch { setErr('Couldn’t copy. Select the text and copy it yourself.'); }
  };
  const send = async () => {
    setBusy(true); setErr('');
    try {
      const r = await sendToPipeline(userId, 'cloud', { text: text.trim(), label: 'Imported from another AI' });
      onDone(r.candidates?.length || 0);
    } catch (e: any) { setErr(e?.message || 'That didn’t work. Try again.'); }
    setBusy(false);
  };
  const sheet = (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div className="sheet ofs" role="dialog" aria-modal="true" aria-label="Import memory" onClick={(e) => e.stopPropagation()}>
        <div className="ofs-h">
          <h3>Import from another AI</h3>
          <button className="ofs-x" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button>
        </div>
        <section>
          <h4>1. Copy this prompt</h4>
          <p className="ofs-small">Paste it into the other AI. It only asks for what helps with your money, and leaves out private topics.</p>
          <pre className="mem-prompt">{IMPORT_PROMPT}</pre>
          <button className="btn" onClick={copy}><Icon name={copied ? 'check' : 'file'} size={16} />{copied ? 'Copied' : 'Copy prompt'}</button>
        </section>
        <section>
          <h4>2. Paste the answer here</h4>
          <textarea className="mem-paste" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Goal: Save 3 000 € for a trip to Japan by June 2027" aria-label="The other AI's answer" />
          <p className="ofs-small">Nothing is saved yet. Each item waits in Nora knows → Waiting for you, and you choose what to keep.</p>
        </section>
        {err && <p className="ofs-small" role="alert" style={{ color: 'var(--bad, #c0392b)' }}>{err}</p>}
        <div className="ofs-acts">
          <button className="btn primary" disabled={!text.trim() || busy} onClick={send}>{busy ? 'Reading…' : 'Review what to keep'}</button>
        </div>
      </div>
    </div>
  );
  const host = document.querySelector('.phone');
  return host ? createPortal(sheet, host) : sheet;
};

export const MemoryPage: React.FC<{ state: AppState; onBack: () => void; onOpenKnows: () => void; onToast: (m: string) => void }> = ({ state, onBack, onOpenKnows, onToast }) => {
  const userId = state.user.id;
  const [m, setM] = useState<Memory | null>(null);
  const [importing, setImporting] = useState(false);
  useEffect(() => { fetch(`/api/memory?userId=${encodeURIComponent(userId)}`).then((r) => r.json()).then(setM).catch(() => setM(null)); }, [userId]);
  const set = async (k: keyof Memory) => {
    if (!m) return;
    const next = { ...m, [k]: !m[k] };
    setM(next);
    const r = await fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, [k]: next[k] }) }).catch(() => null);
    if (!r?.ok) { setM(m); onToast('That didn’t work. Try again.'); }
  };
  return (
    <>
      <DetailHead title="Memory" sub="What Nora remembers, and how" onBack={onBack} />
      <div className="nbody">
        <div className="ncard flat mem">
          <Row name="Use your past chats" sub="Nora can see what your earlier chats were about, so you don’t have to repeat yourself."
            right={m && <Toggle on={m.searchChats} onChange={() => set('searchChats')} label="Use your past chats" />} />
          <Row name="Remember things from chats" sub="Nora can suggest goals and plans you mention. Nothing is saved without your OK."
            right={m && <Toggle on={m.fromChats} onChange={() => set('fromChats')} label="Remember things from chats" />} />
          <Row name="Exclude private topics" sub="Private things, like health, religion or relationships, are never saved automatically. A private note is saved only when you tap Save privately, and a private goal only after you confirm its card. Only Nora can read them. Always on to protect you."
            right={<span className="tgl on locked" role="switch" aria-checked="true" aria-disabled="true" aria-label="Exclude private topics: always on" title="Always on"><i /></span>} />
          <Row name="Import from another AI" sub="Bring what another AI assistant knows about you. We give you a prompt that asks only for what matters for banking."
            right={<button className="btn small" onClick={() => setImporting(true)}>Start import</button>} />
          <Row name="Export memory" sub="Download what Nora knows as a Markdown file."
            right={<button className="btn small" onClick={() => { exportMarkdown(state); onToast('Downloaded'); }}>Export</button>} />
        </div>
        <p className="foot-note">Turning a setting off doesn’t remove what Nora already knows. You can remove things in Nora knows.</p>
      </div>
      {importing && <ImportSheet userId={userId} onClose={() => setImporting(false)}
        onDone={(n) => { setImporting(false); onToast(n ? `${n} ${n === 1 ? 'item waits' : 'items wait'} for you in Nora knows` : 'Nothing to keep was found'); if (n) onOpenKnows(); }} />}
    </>
  );
};
