import React, { useEffect, useState } from 'react';
import type { CabinetEntryType, ConnectableApp, ConnectionDirection, ConnectionProtocol } from '../types.js';
import {
  ConnectionsView, KnowsSummary, fetchConnections, fetchKnowsSummary, connectApp, changeConnection, newConnectionKey,
  syncConnection, disconnectApp, addOwnApp, removeOwnApp,
} from '../services/api.js';
import { KnowsCard } from './KnowsCard.js';

const DEFAULT_SCOPES: CabinetEntryType[] = ['profile', 'goal'];
const PROTO: Record<ConnectionProtocol, string> = { mcp: 'MCP', a2a: 'A2A' };

const field: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--line)',
  background: 'var(--bg)', color: 'var(--ink)', fontSize: 15, boxSizing: 'border-box', fontFamily: 'inherit',
};
const card: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface)' };
const small: React.CSSProperties = { fontSize: 12.5, color: 'var(--muted)', margin: 0 };
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, wordBreak: 'break-all', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', flex: 1 };

/** Same rule as the server: the protocol comes from the address; the customer is never asked. */
function detect(address: string): ConnectionProtocol | undefined {
  let path = '';
  try { const u = new URL(address); path = `${u.hostname}${u.pathname}`.toLowerCase(); } catch { return undefined; }
  if (/\/\.well-known\/agent(-card)?\.json$/.test(path) || /(^|[./-])a2a([./-]|$)/.test(path)) return 'a2a';
  if (/(^|[./-])mcp([./-]|$)/.test(path) || /\/sse\/?$/.test(path)) return 'mcp';
  return undefined;
}

const Badge: React.FC<{ app: ConnectableApp }> = ({ app }) => (
  <span aria-hidden="true" style={{ flex: 'none', width: 36, height: 36, borderRadius: 10, background: app.color, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13 }}>{app.initials}</span>
);
const Pill: React.FC<{ children: React.ReactNode; tone?: 'up' | 'grey' | 'down' }> = ({ children, tone = 'grey' }) => (
  <span className={`npill ${tone}`} style={{ fontSize: 11 }}>{children}</span>
);
const Copy: React.FC<{ text: string; label: string }> = ({ text, label }) => {
  const [done, setDone] = useState<'' | 'ok' | 'no'>('');
  return (
    <button type="button" className="btn small" aria-label={label}
      onClick={() => navigator.clipboard.writeText(text).then(() => setDone('ok'), () => setDone('no')).finally(() => setTimeout(() => setDone(''), 1500))}>
      {done === 'ok' ? 'Copied' : done === 'no' ? 'Select it' : 'Copy'}
    </button>
  );
};
const ScopePicker: React.FC<{ scopes: ConnectionsView['scopes']; value: CabinetEntryType[]; onChange: (v: CabinetEntryType[]) => void }> = ({ scopes, value, onChange }) => (
  <div className="chips" role="group" aria-label="What it may read">
    {scopes.map((s) => {
      const on = value.includes(s.type);
      return <button type="button" key={s.type} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange(on ? value.filter((t) => t !== s.type) : [...value, s.type])}>{on ? '✓ ' : ''}{s.label}</button>;
    })}
  </div>
);

export const ConnectionsSheet: React.FC<{ userId: string; onClose: () => void; onCount?: (n: number) => void; onSynced?: () => void }> = ({ userId, onClose, onCount, onSynced }) => {
  const [v, setV] = useState<ConnectionsView | null>(null);
  const [knows, setKnows] = useState<KnowsSummary | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [dir, setDir] = useState<ConnectionDirection>('out');
  const [opening, setOpening] = useState<string | null>(null);
  const [scopes, setScopes] = useState<CabinetEntryType[]>(DEFAULT_SCOPES);
  const [seeOpen, setSeeOpen] = useState<string | null>(null);
  const [key, setKey] = useState<{ connectionId: string; key: string } | null>(null);
  const [syncMsg, setSyncMsg] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [own, setOwn] = useState({ name: '', endpoint: '', description: '' });

  const run = async (fn: () => Promise<ConnectionsView>) => {
    setBusy(true); setErr('');
    try {
      const r = await fn();
      setV(r);
      if (r.newKey) setKey(r.newKey);
      onCount?.(r.connections.filter((c) => c.status === 'active').length);
      return r;
    } catch (e: any) { setErr(e?.message || 'That didn’t work. Try again.'); return null; }
    finally { setBusy(false); }
  };
  useEffect(() => {
    run(() => fetchConnections(userId));
    fetchKnowsSummary(userId).then(setKnows).catch(() => setKnows(null));
  }, [userId]);

  const appOf = (id: string) => v?.apps.find((a) => a.id === id);
  const mine = (v?.connections || []).filter((c) => c.direction === dir);
  const connectedIds = new Set(v?.connections.map((c) => c.appId));
  const available = (v?.apps || []).filter((a) => a.direction === dir && !connectedIds.has(a.id));
  const link = (id: string) => `${window.location.origin}/api/connect/${id}`;
  const detected = own.endpoint.trim() ? detect(own.endpoint.trim()) : undefined;
  const switchDir = (d: ConnectionDirection) => { setDir(d); setOpening(null); setAdding(false); setErr(''); };

  return (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div className="sheet" role="dialog" aria-label="Active connections" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '88vh', overflowY: 'auto', gap: 12 }}>
        <div className="sec-title" style={{ padding: 0 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>Active connections</h3>
          <button className="btn small quiet" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="chips" role="tablist" aria-label="Direction">
          <button role="tab" aria-selected={dir === 'out'} className={`chip ${dir === 'out' ? 'on' : ''}`} onClick={() => switchDir('out')}>↗ Apps that use Abel</button>
          <button role="tab" aria-selected={dir === 'in'} className={`chip ${dir === 'in' ? 'on' : ''}`} onClick={() => switchDir('in')}>↙ Tools that bring info in</button>
        </div>
        <p style={small}>
          {dir === 'out'
            ? 'An AI app like Claude or Gemini reads what you allow. You get a link and a key to paste into it; the same link works for MCP and A2A, so you don’t pick. Private things are never shared, and every read shows in Who sees it.'
            : 'A tool sends info to Abel. Nothing goes straight into what Abel knows: it waits in “From your inputs”, where you save, keep private or drop each thing.'}
          {' '}<b>Concept demo.</b>{dir === 'in' ? ' Abel doesn’t contact these tools yet; “Try a sync” sends sample info.' : ''}
        </p>
        {err && <p role="alert" style={{ color: 'var(--bad, #a4352c)', fontSize: 13, margin: 0 }}>{err}</p>}

        {!v ? <p style={small}>Loading…</p> : (
          <>
            <span className="kicker">Connected · {mine.length}</span>
            {mine.length === 0 && <p style={small}>Nothing connected yet.</p>}
            {mine.map((c) => {
              const app = appOf(c.appId);
              if (!app) return null;
              const showKey = key?.connectionId === c.id ? key.key : '';
              return (
                <div key={c.id} style={card} data-testid="connection">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Badge app={app} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: 15 }}>{app.name}</b>
                      <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                        {c.direction === 'in' && <Pill>{c.protocol ? PROTO[c.protocol] : 'Protocol checked on connect'}</Pill>}
                        <Pill tone={c.status === 'active' ? 'up' : 'down'}>{c.status === 'active' ? 'Active' : 'Paused'}</Pill>
                      </div>
                    </div>
                  </div>
                  {c.direction === 'out' ? (
                    <>
                      <span className="kicker">May read</span>
                      <ScopePicker scopes={v.scopes} value={c.scopes} onChange={(s) => run(() => changeConnection(userId, c.id, { scopes: s }))} />
                      <button type="button" className="btn small quiet" style={{ alignSelf: 'flex-start' }} aria-expanded={seeOpen === c.id} onClick={() => setSeeOpen(seeOpen === c.id ? null : c.id)}>
                        {c.status === 'active' ? `It can see ${c.sees} ${c.sees === 1 ? 'thing' : 'things'}` : 'It can see nothing while paused'} {seeOpen === c.id ? '▴' : '▾'}
                      </button>
                      {seeOpen === c.id && (knows
                        ? <KnowsCard data={knows} appName={app.name} scopes={c.scopes} reads={c.status === 'active'} />
                        : c.seesTitles.length ? <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>{c.seesTitles.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p style={small}>Nothing right now.</p>)}
                      <span className="kicker">Paste into {app.name}</span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={mono} data-testid="conn-link">{link(c.id)}</span><Copy text={link(c.id)} label="Copy link" /></div>
                      {showKey ? (
                        <>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={mono} data-testid="conn-key">{showKey}</span><Copy text={showKey} label="Copy key" /></div>
                          <p style={{ ...small, color: 'var(--ink)' }}>🔑 This key is shown only now. Anyone with it sees what you ticked, so paste it only into {app.name}.</p>
                        </>
                      ) : (
                        <p style={small}>{c.hasKey ? `Key ending …${c.keyHint}. Lost it? Make a new one; the old one stops working.` : 'No key yet. Make a new one.'}{c.lastUsedAt ? ` Last read ${new Date(c.lastUsedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : ' Not used yet.'}</p>
                      )}
                    </>
                  ) : (
                    <>
                      <p style={small}>Reads nothing from your cabinet. What it sends waits for you first.</p>
                      <button className="btn small" style={{ alignSelf: 'flex-start' }} disabled={busy || c.status !== 'active'}
                        onClick={async () => { const r = await run(() => syncConnection(userId, c.id)); if (r?.synced) { setSyncMsg({ ...syncMsg, [c.id]: `Sent ${r.synced.heard} things through the airlock. ${r.synced.waiting ? `${r.synced.waiting} wait for you in “From your inputs”.` : 'Nothing looked useful, so nothing waits.'}` }); onSynced?.(); } }}>
                        Try a sync (sample)
                      </button>
                      {syncMsg[c.id] && <p style={{ ...small, color: 'var(--ink)' }} role="status">{syncMsg[c.id]}</p>}
                    </>
                  )}
                  <div className="wait-act">
                    <button className="btn small" disabled={busy} onClick={() => run(() => changeConnection(userId, c.id, { status: c.status === 'active' ? 'paused' : 'active' }))}>{c.status === 'active' ? 'Pause' : 'Resume'}</button>
                    {c.direction === 'out' && <button className="btn small quiet" disabled={busy} onClick={() => run(() => newConnectionKey(userId, c.id))}>New key</button>}
                    <button className="btn small quiet" disabled={busy} onClick={() => { if (key?.connectionId === c.id) setKey(null); run(() => disconnectApp(userId, c.id)); }}>Disconnect</button>
                  </div>
                </div>
              );
            })}

            <span className="kicker" style={{ marginTop: 6 }}>{dir === 'out' ? 'AI apps' : 'Tools'}</span>
            {available.length === 0 && <p style={small}>Everything here is connected.</p>}
            {available.map((app) => (
              <div key={app.id} style={card} data-testid="available-app">
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Badge app={app} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 15 }}>{app.name}</b>{app.custom && <span style={{ ...small, marginLeft: 6 }}>· added by you</span>}
                    <p style={{ ...small, marginTop: 2 }}>{app.description}</p>
                    {app.direction === 'in' && <div style={{ marginTop: 4 }}><Pill>{app.protocol ? PROTO[app.protocol] : 'Protocol checked on connect'}</Pill></div>}
                    {app.endpoint && <p style={{ ...small, marginTop: 4, wordBreak: 'break-all' }}>{app.endpoint}</p>}
                  </div>
                  {opening !== app.id && (
                    <button className="btn small primary" aria-label={`Connect ${app.name}`} disabled={busy} onClick={() => { setOpening(app.id); setScopes(DEFAULT_SCOPES); }}>Connect</button>
                  )}
                </div>
                {opening === app.id && (
                  <>
                    {knows && <KnowsCard data={knows} appName={app.name} scopes={scopes} reads={app.direction === 'out'} />}
                    {app.direction === 'out' ? (
                      <>
                        <span className="kicker">{app.name} may read</span>
                        <ScopePicker scopes={v.scopes} value={scopes} onChange={setScopes} />
                        <p style={small}>The squares fill as you tick. Private things are never included, and you can change this any time.</p>
                      </>
                    ) : (
                      <p style={small}>{app.name} won’t read any of this. What it sends waits for you before Abel can use it.</p>
                    )}
                    <div className="wait-act">
                      <button className="btn small primary" disabled={busy || (app.direction === 'out' && !scopes.length)}
                        onClick={async () => { if (await run(() => connectApp(userId, app.id, app.direction === 'out' ? scopes : []))) setOpening(null); }}>Connect {app.name}</button>
                      <button className="btn small quiet" onClick={() => setOpening(null)}>Cancel</button>
                    </div>
                  </>
                )}
                {app.custom && opening !== app.id && (
                  <button className="btn small quiet" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => run(() => removeOwnApp(userId, app.id))}>Remove from list</button>
                )}
              </div>
            ))}

            {!adding ? (
              <button className="btn block" onClick={() => setAdding(true)}>{dir === 'out' ? '+ Add another AI app' : '+ Add your own tool'}</button>
            ) : (
              <form style={card} onSubmit={async (e) => {
                e.preventDefault();
                const r = await run(() => addOwnApp(userId, { name: own.name, direction: dir, endpoint: dir === 'in' ? own.endpoint : undefined, description: own.description }));
                if (r) {
                  // Go straight to the connect step, with the card, for the app just added.
                  const added = r.apps.find((a) => a.custom && a.name.toLowerCase() === own.name.trim().toLowerCase());
                  setAdding(false); setOwn({ name: '', endpoint: '', description: '' });
                  if (added) { setOpening(added.id); setScopes(DEFAULT_SCOPES); }
                }
              }}>
                <b>{dir === 'out' ? 'Another AI app' : 'Your own tool'}</b>
                <p style={small}>{dir === 'out'
                  ? 'Just a name. After you connect it, you get a link and a key to paste into it: it connects to Abel, so no address is needed.'
                  : 'Paste the address of the tool’s MCP server or A2A agent. Abel reads the protocol from it.'}</p>
                <input style={field} placeholder={dir === 'out' ? 'Name, e.g. My budget bot' : 'Name, e.g. Strava'} aria-label="App name" maxLength={40} value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} />
                {dir === 'in' && (
                  <>
                    <input style={field} placeholder="https://example.com/mcp" aria-label="Address" maxLength={200} inputMode="url" value={own.endpoint} onChange={(e) => setOwn({ ...own, endpoint: e.target.value })} />
                    {own.endpoint.trim() && <p style={small} data-testid="detected">{detected ? `Looks like ${PROTO[detected]}${detected === 'a2a' ? ' (an agent card)' : ' (an MCP server)'}.` : 'Can’t tell from the address; Abel checks when it first connects.'}</p>}
                  </>
                )}
                <input style={field} placeholder="What it does (optional)" aria-label="Description" maxLength={160} value={own.description} onChange={(e) => setOwn({ ...own, description: e.target.value })} />
                <div className="wait-act">
                  <button type="submit" className="btn small primary" disabled={busy || !own.name.trim() || (dir === 'in' && !own.endpoint.trim())}>Add</button>
                  <button type="button" className="btn small quiet" onClick={() => setAdding(false)}>Cancel</button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};
