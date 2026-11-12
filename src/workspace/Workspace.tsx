// The Nordea employee workspace (concept, fictional data). Desktop. Follows the approved boards:
// Today · a case (shared context, bank-code affordability, cited AI draft, checks, decision) ·
// Pipeline (presenter view) · Audit log. Staff only ever see what a customer shared for a case.
import React, { useEffect, useMemo, useState } from 'react';

type Staff = { id: string; name: string; role: string };
const SRC: Record<string, string> = { glasses: '👓 Smart glasses', whatsapp: '💬 WhatsApp', document: '📄 Document', csv: '📊 Bank data', abel: '🗨️ Abel chat', cloud: '☁️ Personal AI', app: '🗨️ Abel chat', system: '📊 Bank data', staff: '🏦 Nordea' };
const eur = (n?: number) => (n == null ? '–' : `${Math.round(n).toLocaleString('fi-FI').replace(/ /g, ' ')} €`);
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const initials = (n: string) => n.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();
const sourceOf = (e: any) => SRC[e.provenance?.channel] || (e.source === 'nordea' ? SRC.system : SRC.app);

async function api<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j as T;
}

const useHash = () => {
  const [h, setH] = useState(window.location.hash.slice(1) || '/today');
  useEffect(() => { const f = () => setH(window.location.hash.slice(1) || '/today'); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return h;
};
const go = (h: string) => { window.location.hash = h; };

export const Workspace: React.FC = () => {
  const route = useHash();
  const [sid, setSid] = useState<string>(() => { try { return localStorage.getItem('ws-staff') || 'kalle'; } catch { return 'kalle'; } });
  const [t, setT] = useState<any>(null);
  const [toast, setToast] = useState('');
  const load = () => api<any>('/api/workspace/today').then(setT).catch(() => {});
  useEffect(() => { load(); const iv = setInterval(load, 5000); return () => clearInterval(iv); }, []);
  useEffect(() => { try { localStorage.setItem('ws-staff', sid); } catch { /* storage may be off */ } }, [sid]);
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 3200); return () => clearTimeout(x); }, [toast]);
  const staff: Staff[] = t?.staff || [{ id: 'kalle', name: 'Kalle Virtanen', role: 'Home loan adviser' }];
  const me = staff.find((s) => s.id === sid) || staff[0];
  const open = (t?.cases || []).filter((c: any) => c.status !== 'decided' && c.status !== 'withdrawn').length;
  const [section, arg] = route.split('/').filter(Boolean);
  const nav = (key: string, label: string, href: string, n?: number) => (
    <a className={section === key ? 'on' : ''} onClick={() => go(href)}>{label}{n ? <span className="n">{n}</span> : null}</a>
  );
  return (
    <div className="ws">
      <nav className="rail" aria-label="Workspace">
        <div className="word">Nordea</div>
        <div className="word-sub">Workspace · concept</div>
        {nav('today', 'Today', '/today')}
        {nav('case', 'Cases', (t?.cases?.[0] ? `/case/${t.cases[0].id}` : '/today'), open)}
        {nav('pipeline', 'Pipeline', '/pipeline/lauri')}
        {nav('audit', 'Audit log', '/audit/lauri')}
        <div className="foot">You see only what customers share with you, for a purpose and until a date. Every view is logged in their app.<br /><br /><a href="/">Open the customer app</a></div>
      </nav>
      <div className="main">
        <div className="top">
          <span className="crumb">{section === 'case' ? 'Cases' : section === 'pipeline' ? 'Pipeline' : section === 'audit' ? 'Audit log' : 'Today'}</span>
          <div className="me">
            <div className="av">{initials(me.name)}</div>
            <div>{me.name}<div className="muted small" style={{ fontWeight: 400 }}>{me.role}</div></div>
            <select aria-label="Signed in as (demo)" value={sid} onChange={(e) => setSid(e.target.value)}>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        {section === 'case' && arg ? <CaseView id={arg} sid={sid} onToast={setToast} onChanged={load} />
          : section === 'pipeline' ? <PipelineView uid={arg || 'lauri'} />
          : section === 'audit' ? <AuditView uid={arg || 'lauri'} />
          : <Today t={t} me={me} />}
        <div className="concept">Concept · fictional data and people · demo credit rules, not Nordea’s credit policy · not a Nordea product</div>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
};

// ---------------- Today ----------------
const STATUS: Record<string, [string, string]> = {
  open: ['Ready', 'ok'], waiting_customer: ['Waiting for customer', 'warn'], waiting_second: ['Needs second approver', 'sel'], decided: ['Decided', 'grey'], withdrawn: ['Sharing stopped', 'bad'],
};
const Today: React.FC<{ t: any; me: Staff }> = ({ t, me }) => {
  if (!t) return <div className="content"><p className="muted">Loading…</p></div>;
  const ready = t.cases.filter((c: any) => c.status === 'open' || c.status === 'waiting_second').length;
  return (
    <div className="content">
      <div className="col" style={{ flex: 1 }}>
        <div><h1>Hello, {me.name.split(' ')[0]}</h1><div className="muted">{ready ? `${ready} ${ready === 1 ? 'case' : 'cases'} ready for you.` : 'No cases ready right now.'}</div></div>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}><h2>Cases</h2><span className="muted small">A case opens when a customer taps “Connect me” in Abel</span></div>
          <div className="list">
            {t.cases.length ? t.cases.map((c: any) => (
              <div className="row" key={c.id}>
                <div className="av">{initials(c.name)}</div>
                <div style={{ flex: 1 }}><b>{c.name}</b> · {c.title}<div className="muted small">Opened {when(c.at)} · shared {c.shared} {c.shared === 1 ? 'item' : 'items'}{c.shareActive ? ` until ${c.shareUntil}` : ''}{c.waitingAnswers ? ` · ${c.waitingAnswers} question waiting` : ''}</div></div>
                <span className={`chip ${STATUS[c.status]?.[1] || 'grey'}`}>{STATUS[c.status]?.[0] || c.status}</span>
                <button className={`btn ${c.status === 'open' || c.status === 'waiting_second' ? 'p' : ''}`} onClick={() => go(`/case/${c.id}`)}>Open case</button>
              </div>
            )) : <div className="empty">No cases yet. In the customer app, ask Abel about a home loan and tap “Connect me”.</div>}
          </div>
        </div>
      </div>
      <div className="col" style={{ width: 380, flex: 'none' }}>
        <div className="card">
          <h2 style={{ marginBottom: 6 }}>Just arrived</h2>
          <div className="list small">
            {t.arrived.length ? t.arrived.map((a: any) => (
              <div key={a.id}><span className="src">{SRC[a.source] || a.source}</span> <b>{a.name}</b> {a.title ? <>shared “{a.title}”</> : a.outcome === 'dropped' ? 'dropped something' : 'kept something to themselves'}
                <div className="muted">{when(a.at)}{a.title ? ' · in an open case' : ' · you can’t see it, only that it exists'}</div></div>
            )) : <div className="empty">Nothing yet. Inputs arrive from the customer app, smart glasses and files.</div>}
          </div>
        </div>
        <div className="card" style={{ background: 'var(--sel)', boxShadow: 'none' }}>
          <h2>Why you see so little</h2>
          <p style={{ marginTop: 6 }}>The customer’s own agent keeps only useful signals, the customer decides what to save, and a case shows only what they shared for it. Less noise, and everything has a source.</p>
        </div>
      </div>
    </div>
  );
};

// ---------------- One case ----------------
const CaseView: React.FC<{ id: string; sid: string; onToast: (s: string) => void; onChanged: () => void }> = ({ id, sid, onToast, onChanged }) => {
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState('');
  const [sum, setSum] = useState<{ text: string; by: string; note?: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [ask, setAsk] = useState('');
  const load = () => api<any>(`/api/workspace/cases/${id}?staff=${sid}`).then((x) => { setD(x); setError(''); }).catch((e) => setError(e.message));
  useEffect(() => { setSum(null); load(); const iv = setInterval(load, 6000); return () => clearInterval(iv); }, [id, sid]);
  useEffect(() => { if (d && !amount) setAmount(String(d.affordability.maxLoan || '')); }, [d]);
  if (error) return <div className="content"><div className="card"><p className="err">{error}</p></div></div>;
  if (!d) return <div className="content"><p className="muted">Loading…</p></div>;
  const c = d.case; const a = d.affordability;
  const closed = c.status === 'decided' || c.status === 'withdrawn';
  const lastDecision = c.decisions[c.decisions.length - 1];
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); onToast(ok); await load(); onChanged(); } catch (e: any) { onToast(e.message); } finally { setBusy(''); }
  };
  const cite = (text: string) => text.split(/(\[\d+\])/).map((p, i) => (/^\[\d+\]$/.test(p) ? <sup key={i}>{p.slice(1, -1)}</sup> : <React.Fragment key={i}>{p}</React.Fragment>));
  return (
    <>
      <div className={`banner${d.shareActive ? '' : ' off'}`}>
        {d.shareActive
          ? `${d.customer?.name} shared ${d.items.length} ${d.items.length === 1 ? 'item' : 'items'} for this ${c.title.toLowerCase()}, until ${c.shareUntil} · ${d.heldBack} other ${d.heldBack === 1 ? 'item is' : 'items are'} not shared (you can’t see them) · every view is logged`
          : `${d.customer?.name} stopped sharing or the share ended: nothing is readable for this case.`}
      </div>
      <div className="content">
        <div className="col" style={{ width: 340, flex: 'none' }}>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}><h2>{d.customer?.name}</h2><span className="muted small">{c.title}</span></div>
            <div className="label" style={{ margin: '14px 0 2px' }}>Shared context</div>
            <div className="list">
              {d.items.length ? d.items.map((e: any, i: number) => (
                <div key={e.id}>
                  <b><sup style={{ color: 'var(--brand)' }}>{i + 1}</sup> {e.title}</b>
                  {e.detail && <div className="muted small">{e.detail}</div>}
                  <div style={{ marginTop: 4 }}><span className="src">{sourceOf(e)}</span><span className={`chip ${e.source === 'nordea' ? 'bank' : 'you'}`} style={{ fontSize: 11 }}>{e.source === 'nordea' ? 'Nordea noticed · confirmed' : 'from the customer'}</span></div>
                </div>
              )) : <div className="empty">Nothing readable.</div>}
            </div>
          </div>
          {c.requests.length > 0 && (
            <div className="card">
              <h2>Questions to the customer</h2>
              {c.requests.map((r: any) => (
                <div className="req" key={r.id}><b>{r.by}:</b> {r.ask}<div style={{ marginTop: 4 }}>{r.answer ? <><span className="chip you">Answer</span> {r.answer}</> : <span className="muted">Waiting for the answer in Abel…</span>}</div></div>
              ))}
            </div>
          )}
        </div>
        <div className="col" style={{ flex: 1 }}>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}><h2>Affordability</h2><span className="muted small">computed by bank code from Nordea’s account data · demo rules</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 12 }}>
              <div><div className="muted small">Monthly income</div><div className="stat">{eur(a.income)}</div></div>
              <div><div className="muted small">Left after spending and saving</div><div className="stat">{eur(a.leftOver)}</div></div>
              <div><div className="muted small">Indicative maximum price</div><div className="stat">{eur(a.maxPrice)}</div></div>
            </div>
            {a.goal && (
              <div style={{ marginTop: 14 }}>
                <div className="row small" style={{ justifyContent: 'space-between' }}><span>Deposit: {eur(a.goal.projected)} by {a.goal.targetDate.slice(0, 7)} towards {eur(a.goal.target)}</span><b>{a.goal.percentSaved} % saved now</b></div>
                <div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${Math.min(100, a.goal.percentSaved)}%` }} /></div>
              </div>
            )}
            <p className="muted small" style={{ marginTop: 10 }}>Demo rules: the payment at a {a.rules.stressRate * 100} % stress rate over {a.rules.years} years may be at most {a.rules.paymentShare * 100} % of income ({eur(a.maxPayment)} a month → loan up to {eur(a.maxLoan)}); at least {a.rules.depositShare * 100} % deposit.{a.price ? ` Price from the customer: ${eur(a.price)} → ${eur(a.paymentAtStress)} a month at the stress rate.` : ''}</p>
          </div>
          <div className="ai">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="label" style={{ color: 'var(--brand)' }}>Draft summary · {sum ? (sum.by === 'ai' ? 'written by AI, check before use' : 'written by bank code') : 'AI, cited'}</span>
              <button className="btn" disabled={busy === 'sum' || !d.shareActive} onClick={() => { setBusy('sum'); api<any>(`/api/workspace/cases/${id}/summary`, { staff: sid }).then(setSum).catch((e) => onToast(e.message)).finally(() => setBusy('')); }}>{busy === 'sum' ? 'Writing…' : sum ? 'Write again' : 'Draft summary'}</button>
            </div>
            {sum ? <p>{cite(sum.text)}</p> : <p className="muted">The AI writes words only, citing the shared items; every number is checked against the bank’s figures.</p>}
            {sum?.note && <p className="muted small" style={{ marginTop: 6 }}>{sum.note}</p>}
          </div>
          <div className="card">
            <h2 style={{ marginBottom: 4 }}>Missing for a full decision</h2>
            {d.missing.length ? d.missing.map((m: any) => (
              <div className="check" key={m.key}><div className="tick warn">!</div><div style={{ flex: 1 }}>{m.label}<div className="muted small">{m.sub}</div></div>
                <button className="btn" disabled={!!busy || closed || !d.shareActive} onClick={() => run('ask-' + m.key, () => api(`/api/workspace/cases/${id}/ask`, { staff: sid, ask: m.ask }), 'Asked in the customer’s Abel chat')}>Ask via Abel</button></div>
            )) : <p className="muted">Nothing obvious is missing.</p>}
            {!closed && d.shareActive && (
              <div className="row" style={{ marginTop: 10 }}>
                <input aria-label="Your own question" placeholder="Ask your own question…" value={ask} onChange={(e) => setAsk(e.target.value)} style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 10, padding: '8px 10px' }} />
                <button className="btn" disabled={!ask.trim() || !!busy} onClick={() => run('ask', () => api(`/api/workspace/cases/${id}/ask`, { staff: sid, ask }).then(() => setAsk('')), 'Asked in the customer’s Abel chat')}>Ask</button>
              </div>
            )}
          </div>
        </div>
        <div className="col" style={{ width: 300, flex: 'none' }}>
          <div className="card">
            <h2 style={{ marginBottom: 6 }}>Checks</h2>
            {d.checks.map((k: any) => (
              <div className="check" key={k.label}><div className={`tick ${k.ok === true ? 'ok' : k.ok === false ? 'warn' : 'grey'}`}>{k.ok === true ? '✓' : k.ok === false ? '!' : '–'}</div><div>{k.label}<div className="muted small">{k.sub}</div></div></div>
            ))}
          </div>
          <div className="card">
            <h2 style={{ marginBottom: 10 }}>Decision</h2>
            {c.status === 'decided' ? (
              <p><span className={`chip ${lastDecision.outcome === 'pre_approved' ? 'ok' : 'warn'}`}>{lastDecision.outcome === 'pre_approved' ? `Pre-approved ${eur(lastDecision.amount)}` : 'Declined'}</span><br /><span className="small">{lastDecision.reason}</span><br /><span className="muted small">By {c.decisions.map((x: any) => x.by).join(' and ')} · sent to the customer in Abel</span></p>
            ) : c.status === 'withdrawn' ? <p className="muted">The customer stopped sharing.</p> : (
              <>
                {c.status === 'waiting_second' && <p className="small" style={{ marginBottom: 10 }}><span className="chip sel">Waiting for a second approver</span><br />{lastDecision.by} proposed {eur(lastDecision.amount)}. {lastDecision.by.startsWith(staffName(sid)) ? 'Someone else must confirm it.' : 'Confirm with the same amount.'}</p>}
                <div className="field"><label htmlFor="amt">Amount (pre-approval)</label><input id="amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} /></div>
                {Number(amount) > a.maxLoan && <p className="small" style={{ color: 'var(--warn)', margin: '-4px 0 10px' }}>Above the indicative maximum loan ({eur(a.maxLoan)}) from the demo rules. You can still decide; say why in the reason.</p>}
                <div className="field"><label htmlFor="why">Reason the customer will read</label><textarea id="why" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="E.g. Your income and savings support this amount under our rules." /></div>
                <button className="btn p w" style={{ marginBottom: 8 }} disabled={!!busy || !reason.trim() || !Number(amount)} onClick={() => run('dec', () => api<any>(`/api/workspace/cases/${id}/decide`, { staff: sid, outcome: 'pre_approved', amount: Number(amount), reason }).then((r) => { if (r.needsSecond) onToast('Above the limit: a second approver must confirm'); }), 'Saved')}>{c.status === 'waiting_second' ? 'Confirm as second approver' : 'Pre-approve'}</button>
                <button className="btn q w" disabled={!!busy || !reason.trim()} onClick={() => run('decl', () => api(`/api/workspace/cases/${id}/decide`, { staff: sid, outcome: 'declined', reason }), 'Declined; the customer sees the reason')}>Decline with reason</button>
                <p className="muted small" style={{ marginTop: 8 }}>The customer gets the decision and the reason in Abel, with the list of what was used. Above {eur(250000)} a second person must confirm.</p>
              </>
            )}
          </div>
          <div className="card"><button className="btn q" onClick={() => go(`/audit/${c.userId}`)}>Who read this customer’s data →</button><br /><button className="btn q" onClick={() => go(`/pipeline/${c.userId}`)}>How these items got here →</button></div>
        </div>
      </div>
    </>
  );
};
const staffName = (sid: string) => (sid === 'sanna' ? 'Sanna' : 'Kalle');

// ---------------- Pipeline (presenter view) ----------------
const PipelineView: React.FC<{ uid: string }> = ({ uid }) => {
  const [d, setD] = useState<any>(null);
  useEffect(() => { const f = () => api<any>(`/api/workspace/pipeline/${uid}`).then(setD).catch(() => {}); f(); const iv = setInterval(f, 5000); return () => clearInterval(iv); }, [uid]);
  const rows = useMemo(() => {
    if (!d) return [];
    const out: any[] = [];
    for (const r of d.runs) {
      for (const c of d.items.filter((x: any) => x.runId === r.id)) out.push({ k: c.id, src: r.source, text: c.title, filter: c.filter === 'private' ? ['Private', 'warn'] : ['Kept', 'ok'], why: c.reason, cust: c.customer });
      for (const [i, s] of (r.droppedSignals || []).entries()) out.push({ k: r.id + i, src: r.source, text: s.text, filter: s.decision === 'merged' ? ['Merged', 'grey'] : ['Dropped', 'grey'], why: s.reason, cust: null });
    }
    return out;
  }, [d]);
  const CUST: Record<string, [string, string]> = { waiting: ['Waiting', 'warn'], saved: ['Saved', 'you'], private: ['Kept private', 'grey'], dropped: ['Dropped', 'grey'] };
  return (
    <div className="content" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div className="row"><h1>Pipeline · {uid[0].toUpperCase() + uid.slice(1)}</h1><span className="chip warn">Presenter view for the demo</span></div>
      {d && (
        <div className="card row" style={{ gap: 26, flexWrap: 'wrap' }}>
          {[['heard', 'signals heard'], ['useful', 'looked useful'], ['saved', 'customer saved'], ['shared', 'shared with Nordea'], ['used', 'used in a decision']].map(([k, l], i) => (
            <React.Fragment key={k}>{i > 0 && <span className="arrow">→</span>}<div><div className="big">{d.funnel[k]}</div><div className="muted">{l}</div></div></React.Fragment>
          ))}
          <div className="muted small" style={{ marginLeft: 'auto', maxWidth: 330 }}>Only in this demo view can you read dropped rows (from the server’s memory, never stored). Staff would see counts only; private items show as withheld.</div>
        </div>
      )}
      <div className="card">
        {rows.length ? (
          <table className="tbl"><thead><tr><th style={{ width: 150 }}>Input</th><th>What the agent heard</th><th style={{ width: 270 }}>Filter</th><th style={{ width: 150 }}>Customer</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.k}><td><span className="src">{SRC[r.src] || r.src}</span></td><td>{r.text}</td><td><span className={`chip ${r.filter[1]}`}>{r.filter[0]}</span> {r.why}</td><td>{r.cust ? <span className={`chip ${CUST[r.cust][1]}`}>{CUST[r.cust][0]}</span> : <span className="muted">–</span>}</td></tr>
            ))}</tbody></table>
        ) : <p className="empty">Nothing has come in yet. Use the smart glasses page or import a chat in the customer app.</p>}
      </div>
    </div>
  );
};

// ---------------- Audit log ----------------
const AuditView: React.FC<{ uid: string }> = ({ uid }) => {
  const [reads, setReads] = useState<any[] | null>(null);
  useEffect(() => { api<any>(`/api/workspace/audit/${uid}`).then((x) => setReads(x.reads)).catch(() => setReads([])); }, [uid]);
  return (
    <div className="content" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div><h1>Audit log · {uid[0].toUpperCase() + uid.slice(1)}</h1><p className="muted">Every read of this customer’s context: who, why, how many items. The customer sees the same list in their app (“Who sees it”).</p></div>
      <div className="card">
        {reads?.length ? (
          <table className="tbl"><thead><tr><th style={{ width: 170 }}>When</th><th style={{ width: 220 }}>Who</th><th>Purpose</th><th style={{ width: 140 }}>Items read</th></tr></thead>
            <tbody>{reads.map((r) => <tr key={r.id}><td>{when(r.timestamp)}</td><td>{r.agentName}</td><td>{r.purpose}</td><td>{r.itemsReadCount}{r.blockedCount ? <span className="muted"> · {r.blockedCount} held back</span> : null}</td></tr>)}</tbody></table>
        ) : <p className="empty">{reads ? 'No reads yet.' : 'Loading…'}</p>}
      </div>
    </div>
  );
};
