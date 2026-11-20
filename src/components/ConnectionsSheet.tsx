import React, { useEffect, useState } from 'react';
import type { CabinetEntryType, ConnectableApp, ConnectionProtocol } from '../types.js';
import {
  ConnectionsView, fetchConnections, connectApp, changeConnection, disconnectApp, addOwnApp, removeOwnApp,
} from '../services/api.js';

const PROTO: Record<ConnectionProtocol, { name: string; what: string }> = {
  mcp: { name: 'MCP', what: 'The app reads what you allow, as context (Model Context Protocol).' },
  a2a: { name: 'A2A', what: 'The app’s agent talks to Abel, agent to agent, and asks him questions.' },
};
const DEFAULT_SCOPES: CabinetEntryType[] = ['profile', 'goal'];

const field: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--line)',
  background: 'var(--bg)', color: 'var(--ink)', fontSize: 15, boxSizing: 'border-box', fontFamily: 'inherit',
};
const card: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface)' };
const small: React.CSSProperties = { fontSize: 12.5, color: 'var(--muted)', margin: 0 };

const Badge: React.FC<{ app: ConnectableApp }> = ({ app }) => (
  <span aria-hidden="true" style={{ flex: 'none', width: 36, height: 36, borderRadius: 10, background: app.color, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13 }}>{app.initials}</span>
);
const Pill: React.FC<{ children: React.ReactNode; tone?: 'up' | 'grey' | 'down' }> = ({ children, tone = 'grey' }) => (
  <span className={`npill ${tone}`} style={{ fontSize: 11 }}>{children}</span>
);

/** Ticks for which drawers an app may read. */
const ScopePicker: React.FC<{ scopes: ConnectionsView['scopes']; value: CabinetEntryType[]; onChange: (v: CabinetEntryType[]) => void }> = ({ scopes, value, onChange }) => (
  <div className="chips" role="group" aria-label="What it may read">
    {scopes.map((s) => {
      const on = value.includes(s.type);
      return (
        <button type="button" key={s.type} className={`chip ${on ? 'on' : ''}`} aria-pressed={on}
          onClick={() => onChange(on ? value.filter((t) => t !== s.type) : [...value, s.type])}>{on ? '✓ ' : ''}{s.label}</button>
      );
    })}
  </div>
);

const ProtoPicker: React.FC<{ options: ConnectionProtocol[]; value: ConnectionProtocol; onChange: (p: ConnectionProtocol) => void }> = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div className="chips" role="radiogroup" aria-label="Connect with">
      {options.map((p) => (
        <button type="button" key={p} role="radio" aria-checked={value === p} className={`chip ${value === p ? 'on' : ''}`} onClick={() => onChange(p)}>{PROTO[p].name}</button>
      ))}
    </div>
    <p style={small}>{PROTO[value].what}</p>
  </div>
);

export const ConnectionsSheet: React.FC<{ userId: string; onClose: () => void; onCount?: (n: number) => void }> = ({ userId, onClose, onCount }) => {
  const [v, setV] = useState<ConnectionsView | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'all' | 'assistant' | 'tool'>('all');
  const [opening, setOpening] = useState<string | null>(null); // app id being connected
  const [proto, setProto] = useState<ConnectionProtocol>('mcp');
  const [scopes, setScopes] = useState<CabinetEntryType[]>(DEFAULT_SCOPES);
  const [seeOpen, setSeeOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [own, setOwn] = useState({ name: '', endpoint: '', description: '', kind: 'tool' as 'tool' | 'assistant', protocols: ['mcp'] as ConnectionProtocol[] });

  const run = async (fn: () => Promise<ConnectionsView>) => {
    setBusy(true); setErr('');
    try { const r = await fn(); setV(r); onCount?.(r.connections.filter((c) => c.status === 'active').length); return true; }
    catch (e: any) { setErr(e?.message || 'That didn’t work. Try again.'); return false; }
    finally { setBusy(false); }
  };
  useEffect(() => { run(() => fetchConnections(userId)); }, [userId]);

  const appOf = (id: string) => v?.apps.find((a) => a.id === id);
  const connectedIds = new Set(v?.connections.map((c) => c.appId));
  const available = (v?.apps || []).filter((a) => !connectedIds.has(a.id) && (tab === 'all' || a.kind === tab));

  return (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div className="sheet" role="dialog" aria-label="Active connections" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '88vh', overflowY: 'auto', gap: 12 }}>
        <div className="sec-title" style={{ padding: 0 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>Active connections</h3>
          <button className="btn small quiet" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p style={small}>Let other AI apps and tools use what Abel knows, only the parts you pick. Private things are never shared. <b>Concept demo:</b> nothing is sent to these apps yet.</p>
        {err && <p role="alert" style={{ color: 'var(--bad, #a4352c)', fontSize: 13, margin: 0 }}>{err}</p>}
        {!v ? <p style={small}>Loading…</p> : (
          <>
            <span className="kicker">Connected · {v.connections.length}</span>
            {v.connections.length === 0 && <p style={small}>Nothing connected yet. Pick an app below.</p>}
            {v.connections.map((c) => {
              const app = appOf(c.appId);
              if (!app) return null;
              return (
                <div key={c.id} style={card} data-testid="connection">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Badge app={app} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: 15 }}>{app.name}</b>
                      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                        <Pill>{PROTO[c.protocol].name}</Pill>
                        <Pill tone={c.status === 'active' ? 'up' : 'down'}>{c.status === 'active' ? 'Active' : 'Paused'}</Pill>
                      </div>
                    </div>
                  </div>
                  <span className="kicker">May read</span>
                  <ScopePicker scopes={v.scopes} value={c.scopes} onChange={(s) => run(() => changeConnection(userId, c.id, { scopes: s }))} />
                  {app.protocols.length > 1 && <><span className="kicker">Connected with</span><ProtoPicker options={app.protocols} value={c.protocol} onChange={(p) => run(() => changeConnection(userId, c.id, { protocol: p }))} /></>}
                  <button type="button" className="btn small quiet" style={{ alignSelf: 'flex-start' }} aria-expanded={seeOpen === c.id} onClick={() => setSeeOpen(seeOpen === c.id ? null : c.id)}>
                    {c.status === 'active' ? `It can see ${c.sees} ${c.sees === 1 ? 'thing' : 'things'}` : 'It can see nothing while paused'} {seeOpen === c.id ? '▴' : '▾'}
                  </button>
                  {seeOpen === c.id && (
                    c.seesTitles.length
                      ? <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>{c.seesTitles.map((t, i) => <li key={i}>{t}</li>)}</ul>
                      : <p style={small}>Nothing right now.</p>
                  )}
                  <div className="wait-act">
                    <button className="btn small" disabled={busy} onClick={() => run(() => changeConnection(userId, c.id, { status: c.status === 'active' ? 'paused' : 'active' }))}>{c.status === 'active' ? 'Pause' : 'Resume'}</button>
                    <button className="btn small quiet" disabled={busy} onClick={() => run(() => disconnectApp(userId, c.id))}>Disconnect</button>
                  </div>
                </div>
              );
            })}

            <span className="kicker" style={{ marginTop: 6 }}>Available</span>
            <div className="chips">
              {([['all', 'All'], ['assistant', 'AI assistants'], ['tool', 'Tools']] as const).map(([k, l]) => (
                <button key={k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            {available.length === 0 && <p style={small}>Everything here is connected.</p>}
            {available.map((app) => (
              <div key={app.id} style={card} data-testid="available-app">
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Badge app={app} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 15 }}>{app.name}</b>{app.custom && <span style={{ ...small, marginLeft: 6 }}>· added by you</span>}
                    <p style={{ ...small, marginTop: 2 }}>{app.description}</p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>{app.protocols.map((p) => <Pill key={p}>{PROTO[p].name}</Pill>)}</div>
                    {app.endpoint && <p style={{ ...small, marginTop: 4, wordBreak: 'break-all' }}>{app.endpoint}</p>}
                  </div>
                  {opening !== app.id && (
                    <button className="btn small primary" aria-label={`Connect ${app.name}`} onClick={() => { setOpening(app.id); setProto(app.protocols[0]); setScopes(DEFAULT_SCOPES); }}>Connect</button>
                  )}
                </div>
                {opening === app.id && (
                  <>
                    <span className="kicker">Connect with</span>
                    <ProtoPicker options={app.protocols} value={proto} onChange={setProto} />
                    <span className="kicker">It may read</span>
                    <ScopePicker scopes={v.scopes} value={scopes} onChange={setScopes} />
                    <div className="wait-act">
                      <button className="btn small primary" disabled={busy || !scopes.length}
                        onClick={async () => { if (await run(() => connectApp(userId, app.id, proto, scopes))) setOpening(null); }}>Connect {app.name}</button>
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
              <button className="btn block" onClick={() => setAdding(true)}>+ Add your own app or tool</button>
            ) : (
              <form style={card} onSubmit={async (e) => {
                e.preventDefault();
                if (await run(() => addOwnApp(userId, { name: own.name, endpoint: own.endpoint, description: own.description, kind: own.kind, protocol: own.protocols }))) {
                  setAdding(false); setOwn({ name: '', endpoint: '', description: '', kind: 'tool', protocols: ['mcp'] }); setTab('all');
                }
              }}>
                <b>Add your own</b>
                <p style={small}>For an app that’s not in the list: give its name and the address of its MCP server or A2A agent.</p>
                <input style={field} placeholder="Name, e.g. My budget bot" aria-label="App name" maxLength={40} value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} />
                <input style={field} placeholder="https://example.com/mcp" aria-label="Address" maxLength={200} inputMode="url" value={own.endpoint} onChange={(e) => setOwn({ ...own, endpoint: e.target.value })} />
                <input style={field} placeholder="What it does (optional)" aria-label="Description" maxLength={160} value={own.description} onChange={(e) => setOwn({ ...own, description: e.target.value })} />
                <div className="chips" role="group" aria-label="Type">
                  {(['assistant', 'tool'] as const).map((k) => (
                    <button type="button" key={k} className={`chip ${own.kind === k ? 'on' : ''}`} aria-pressed={own.kind === k} onClick={() => setOwn({ ...own, kind: k })}>{k === 'assistant' ? 'AI assistant' : 'Tool'}</button>
                  ))}
                </div>
                <div className="chips" role="group" aria-label="Protocols">
                  {(['mcp', 'a2a'] as const).map((p) => {
                    const on = own.protocols.includes(p);
                    return <button type="button" key={p} className={`chip ${on ? 'on' : ''}`} aria-pressed={on}
                      onClick={() => setOwn({ ...own, protocols: on ? own.protocols.filter((x) => x !== p) : [...own.protocols, p] })}>{on ? '✓ ' : ''}{PROTO[p].name}</button>;
                  })}
                </div>
                <div className="wait-act">
                  <button type="submit" className="btn small primary" disabled={busy || !own.name.trim() || !own.endpoint.trim() || !own.protocols.length}>Add to list</button>
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
