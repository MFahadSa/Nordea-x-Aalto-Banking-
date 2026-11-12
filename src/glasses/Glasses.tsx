// Smart glasses (concept, after coolkowkank's smart-glasses demo): Lauri's first-person view.
// The glasses' personal agent holds what it sees and hears ON THE DEVICE; nothing leaves until Lauri
// syncs. A sync sends the signals into the input pipeline (usefulness + privacy filter), and only
// what looked useful waits in his app for his decision. Questions go to Abel, who answers from what
// Lauri allowed. The right-hand panel is for the presenter: the story steps and the other inputs.
import React, { useEffect, useRef, useState } from 'react';
import { MOMENTS, WHATSAPP, PAYSLIP, CALENDAR, BANK_UPDATE, type Moment } from './samples.js';

type Sig = { kind: string; text: string };
const UID = new URLSearchParams(window.location.search).get('u') || 'lauri';

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j as T;
}

const Scene: React.FC<{ scene: Moment['scene'] }> = ({ scene }) => (
  <svg className="scene" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={scene === 'lunch' ? '#3B2A22' : '#2B3A6B'} /><stop offset="1" stopColor={scene === 'lunch' ? '#6B4A36' : '#C98E6B'} /></linearGradient>
      <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3A3A48" /><stop offset="1" stopColor="#1E1F2A" /></linearGradient>
    </defs>
    <rect width="1200" height="800" fill="url(#sky)" />
    {scene !== 'lunch' ? (
      <>
        <rect x="80" y="210" width="260" height="440" fill="#2A2F45" /><rect x="360" y="140" width="360" height="510" fill="#353B57" /><rect x="740" y="250" width="300" height="400" fill="#262B40" />
        {Array.from({ length: 6 }).map((_, r) => Array.from({ length: 5 }).map((__, c) => <rect key={`${r}-${c}`} x={390 + c * 64} y={175 + r * 70} width="36" height="40" fill={(r + c) % 3 ? '#F2C98A' : '#5A6185'} opacity=".85" />))}
        {Array.from({ length: 4 }).map((_, r) => <rect key={`b${r}`} x={392} y={205 + r * 140} width="296" height="8" fill="#4A5275" />)}
        <rect x="0" y="650" width="1200" height="150" fill="url(#ground)" />
        <g transform="translate(760 470)"><rect width="10" height="180" fill="#888" /><rect x="-60" y="-10" width="190" height="96" rx="6" fill="#F4F4F0" /><text x="35" y="22" textAnchor="middle" fontSize="20" fontWeight="700" fill="#0000A0">FOR SALE</text><text x="35" y="48" textAnchor="middle" fontSize="15" fill="#222">2 rooms · Kalasatama</text><text x="35" y="72" textAnchor="middle" fontSize="18" fontWeight="700" fill="#222">389 000 €</text></g>
        <g transform="translate(120 560)"><rect width="70" height="90" rx="8" fill="#F26B21" /><text x="35" y="58" textAnchor="middle" fontSize="40" fontWeight="700" fill="#fff">M</text></g>
        {scene === 'call' && <g transform="translate(960 120)"><rect width="190" height="80" rx="16" fill="rgba(10,14,40,.75)" stroke="#8FB8FF" /><text x="95" y="34" textAnchor="middle" fontSize="16" fill="#CFE3FF">📞 Mia</text><text x="95" y="58" textAnchor="middle" fontSize="13" fill="#9AA6D6">on call · 02:14</text></g>}
      </>
    ) : (
      <>
        <rect x="0" y="520" width="1200" height="280" fill="#5B3B28" />
        <rect x="380" y="120" width="440" height="340" rx="10" fill="#1F2A24" stroke="#C9A06B" strokeWidth="8" />
        <text x="600" y="175" textAnchor="middle" fontSize="30" fontWeight="700" fill="#F4E9D8">Field &amp; Fork</text>
        {[['Local Greens', '8.50'], ['Kale Caesar', '9.50'], ['Sandwich', '12.50'], ['Soup of the day', '10.00']].map(([n, p], i) => (
          <g key={n}><text x="420" y={235 + i * 50} fontSize="22" fill="#EADFCB">{n}</text><text x="780" y={235 + i * 50} textAnchor="end" fontSize="22" fill="#EADFCB">{p}</text></g>
        ))}
        <ellipse cx="600" cy="690" rx="260" ry="60" fill="#E9E2D6" /><circle cx="560" cy="680" r="34" fill="#C9C1B2" />
      </>
    )}
  </svg>
);

export const Glasses: React.FC = () => {
  const [scene, setScene] = useState<Moment['scene']>('street');
  const [buffer, setBuffer] = useState<Sig[]>([]);
  const [shown, setShown] = useState<Sig[]>([]);
  const [bubble, setBubble] = useState<{ who: string; text: string } | null>({ who: 'Personal AI · on your glasses', text: 'I keep what I see and hear on the glasses. Nothing leaves until you sync, and only useful things reach your bank.' });
  const [conv, setConv] = useState<string | undefined>();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const [input, setInput] = useState('');
  const [voice, setVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const say = (text: string) => {
    if (!voice || !('speechSynthesis' in window)) return;
    try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } catch { /* speech is optional */ }
  };
  const addSignal = (s: Sig) => { setBuffer((b) => [...b, s]); setShown((x) => [...x.slice(-4), s]); };

  const ask = async (text: string) => {
    setBusy('ask'); setBubble({ who: 'You asked', text });
    try {
      const r = await post<any>('/api/chat', { userId: UID, helperId: 'abel', text, conversationId: conv, requestId: `glasses-${Date.now()}` });
      setConv(r.conversationId);
      const reply = r.messages?.[r.messages.length - 1]?.text || '…';
      setBubble({ who: 'Abel · from what you allowed', text: reply });
      say(reply);
    } catch (e: any) { setBubble({ who: 'Abel', text: `I can’t answer right now (${e.message}).` }); } finally { setBusy(''); }
  };

  const play = (m: Moment) => {
    setScene(m.scene);
    setDone((d) => ({ ...d, [m.id]: true }));
    if (m.ask) { void ask(m.ask); return; }
    setBubble({ who: 'Personal AI · on your glasses', text: m.sub });
    m.signals.forEach((s, i) => timers.current.push(window.setTimeout(() => addSignal(s), 500 + i * 700)));
  };

  const sync = async () => {
    if (!buffer.length) return;
    setBusy('sync');
    try {
      const r = await post<any>('/api/ingest', { userId: UID, source: 'glasses', label: `Smart glasses · ${buffer.length} signals`, signals: buffer });
      const run = r.run;
      const text = `${run.heard} heard → ${run.kept} useful${run.private ? ` + ${run.private} private` : ''} · ${run.dropped} dropped${run.merged ? ` · ${run.merged} already known` : ''}. Waiting for you in the app: What Abel knows → From your inputs.${run.aiJudged ? '' : ' (AI unavailable: the rule check decided.)'}${r.stored ? `\n${r.stored.where === 'supabase' ? '✓ ' : '⚠ '}${r.stored.message}` : ''}`;
      setRes({ ok: !r.stored || r.stored.ok, text });
      setBubble({ who: 'Personal AI · synced', text: `Sent ${run.kept + run.private} of ${run.heard} things to your app for you to check. The rest stayed here and is gone.` });
      setBuffer([]); setShown([]);
      setDone((d) => ({ ...d, sync: true }));
    } catch (e: any) { setRes({ ok: false, text: e.message }); } finally { setBusy(''); }
  };

  const send = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    try {
      const r = await post<any>('/api/ingest', { userId: UID, ...body });
      const run = r.run;
      setRes({ ok: !r.stored || r.stored.ok, text: `${run.label}: ${run.heard} heard → ${run.kept} useful${run.private ? ` + ${run.private} private` : ''} · ${run.dropped} dropped${run.merged ? ` · ${run.merged} folded/known` : ''}.${r.message ? ` ${r.message}` : ''}${r.stored ? `\n${r.stored.where === 'supabase' ? '✓ ' : '⚠ '}${r.stored.message}` : ''}` });
      setDone((d) => ({ ...d, [key]: true }));
    } catch (e: any) { setRes({ ok: false, text: e.message }); } finally { setBusy(''); }
  };

  const typed = () => {
    const t = input.trim();
    if (!t) return;
    setInput('');
    if (/\?$/.test(t) || /^(am i|can i|could i|how|what|should i|do i)\b/i.test(t)) void ask(t);
    else addSignal({ kind: 'heard', text: `Lauri: ${t}` });
  };

  const mic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setRes({ ok: false, text: 'This browser has no speech input. Type instead.' }); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = 'en-US'; rec.interimResults = false;
    rec.onresult = (e: any) => { const t = e.results?.[0]?.[0]?.transcript || ''; setInput(t); };
    rec.onend = () => setListening(false);
    recRef.current = rec; setListening(true); rec.start();
  };

  return (
    <div className="gl">
      <div className="view">
        <Scene scene={scene} />
        <div className="lens" />
        <div className="hud-top">
          <span className="pill">👓 Lauri’s Personal AI · on-device</span>
          <span className="pill">{buffer.length ? `${buffer.length} on the glasses · not synced` : 'Nothing waiting on the glasses'}</span>
        </div>
        {bubble && <div className="bubble" role="status" aria-live="polite"><div className="who">{bubble.who}</div><p>{bubble.text}</p></div>}
        <div className="seen">{shown.map((s, i) => <div key={i} className={`sig k-${s.kind}`}>{s.kind === 'seen' ? '👁 ' : '👂 '}{s.text}</div>)}</div>
        <div className="sub">
          <button className={`rbtn ghost${listening ? ' on' : ''}`} onClick={mic} aria-label="Speak">{listening ? '● Listening' : '🎙'}</button>
          <input aria-label="Say something or ask Abel" placeholder="Say something, or ask Abel (end with ?)" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') typed(); }} />
          <button className="rbtn" disabled={busy === 'ask'} onClick={typed}>Send</button>
          <button className="rbtn" disabled={!buffer.length || busy === 'sync'} onClick={sync}>{busy === 'sync' ? 'Syncing…' : `Sync to my Cabinet${buffer.length ? ` (${buffer.length})` : ''}`}</button>
        </div>
      </div>
      <aside className="panel" aria-label="Demo steps">
        <h2>Demo steps</h2>
        <h3>From what Lauri sees to what Nordea approves</h3>
        <div className="legend"><span><i style={{ background: '#4CC4AF' }} />seen</span><span><i style={{ background: '#F0C25A' }} />heard</span><span><label><input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Abel speaks</label></span></div>
        {MOMENTS.map((m, i) => (
          <button key={m.id} className={`step${done[m.id] ? ' done' : ''}`} onClick={() => play(m)} disabled={!!busy}>
            <span className="n">{i + 1}</span><span><b>{m.title}</b><span className="s">{m.sub}</span></span>
          </button>
        ))}
        <button className={`step${done.sync ? ' done' : ''}`} onClick={sync} disabled={!buffer.length || !!busy}>
          <span className="n">{MOMENTS.length + 1}</span><span><b>Sync to my Context Cabinet</b><span className="s">The filter keeps only what is useful; private things are marked.</span></span>
        </button>
        <a className="step" href="/" target="_blank" rel="noopener"><span className="n">{MOMENTS.length + 2}</span><span><b>In the app: decide, then ask Abel about a pre-approval</b><span className="s">What Abel knows → From your inputs → Save. Then Abel → “Can I get a mortgage pre-approval?” → Connect me.</span></span></a>
        <a className="step" href="/workspace" target="_blank" rel="noopener"><span className="n">{MOMENTS.length + 3}</span><span><b>Nordea workspace: Kalle decides</b><span className="s">Only what Lauri shared · numbers by bank code · second approver above 250 000 €.</span></span></a>
        <h2 style={{ marginTop: 8 }}>Other inputs</h2>
        <button className={`step${done.wa ? ' done' : ''}`} disabled={!!busy} onClick={() => send('wa', { source: 'whatsapp', label: 'WhatsApp Chat with Mia.txt', text: WHATSAPP })}><span className="n">💬</span><span><b>WhatsApp chat with Mia</b><span className="s">5 messages: plans, a car loan ending, small talk.</span></span></button>
        <button className={`step${done.doc ? ' done' : ''}`} disabled={!!busy} onClick={() => send('doc', { source: 'document', label: 'Payslip October 2026.txt', text: PAYSLIP })}><span className="n">📄</span><span><b>Payslip (document)</b><span className="s">Salary, tax, net pay.</span></span></button>
        <button className={`step${done.csv ? ' done' : ''}`} disabled={!!busy} onClick={() => send('csv', { source: 'csv', label: 'nordea-update.json', text: BANK_UPDATE })}><span className="n">📊</span><span><b>Bank data update</b><span className="s">New transactions; Nordea notices a new monthly payment.</span></span></button>
        <button className={`step${done.cloud ? ' done' : ''}`} disabled={!!busy} onClick={() => send('cloud', { source: 'cloud', label: 'Personal AI cloud: calendar + notes', signals: CALENDAR })}><span className="n">☁️</span><span><b>Personal AI cloud (later)</b><span className="s">Calendar and notes, same pipeline.</span></span></button>
        {res && <div className={`res${res.ok ? '' : ' err'}`} role="status">{res.text}</div>}
        {buffer.length > 0 && <div className="buf"><b>On the glasses, not sent:</b><ul>{buffer.map((s, i) => <li key={i}>{s.text}</li>)}</ul></div>}
        <p className="links small"><a href="/workspace#/pipeline/lauri" target="_blank" rel="noopener">Presenter view: what was kept and dropped</a></p>
        <p className="concept">Concept · fictional data · scenes drawn for the demo · after the smart-glasses demo by coolkowkank</p>
      </aside>
    </div>
  );
};
