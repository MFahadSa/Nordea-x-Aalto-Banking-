import React from 'react';
import type { CabinetEntryType } from '../types.js';
import type { KnowsSummary } from '../services/api.js';

// "What Abel knows about you": a record card shown when a connection starts.
// One square per thing Abel knows. Filled = this connection would see it; outlined = it stays with Abel;
// hatched = private (never shared). The pixel avatar is drawn from the name, not from a photo.

const TONE: Partial<Record<CabinetEntryType, string>> = {
  profile: '#2f7d6d', goal: '#2c5fb8', life_event: '#8a5bc4', preference: '#b8326a', fact: '#3e8e3e', observation: '#b4570a',
};

function hash(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/** A 10×10 pixel portrait: face, hair and shirt colours picked from the name. Same name, same face. */
const PixelAvatar: React.FC<{ name: string }> = ({ name }) => {
  const h = hash(name);
  const skin = ['#f2d0b1', '#e0b08a', '#c68b62', '#9a6544', '#6e4630'][h % 5];
  const hair = ['#2b2118', '#5a3a22', '#a8743c', '#d9c08a', '#8a8a8a', '#7a2d1d'][(h >> 3) % 6];
  const shirt = ['#2f7d6d', '#2c5fb8', '#8a5bc4', '#b4570a', '#3e8e3e'][(h >> 6) % 5];
  const long = (h >> 9) % 2 === 0;
  // rows of 10: . sky, h hair, s skin, e eye, m mouth, b shirt
  const rows = [
    '..........',
    '...hhhh...',
    '..hhhhhh..',
    `.${long ? 'h' : '.'}ssssss${long ? 'h' : '.'}.`,
    `.${long ? 'h' : '.'}seesse${long ? 'h' : '.'}.`,
    `.${long ? 'h' : '.'}ssssss${long ? 'h' : '.'}.`,
    `.${long ? 'h' : '.'}.smms.${long ? 'h' : '.'}.`,
    '....ss....',
    '..bbbbbb..',
    '.bbbbbbbb.',
  ];
  const col: Record<string, string> = { h: hair, s: skin, e: '#1d1b18', m: '#a4352c', b: shirt };
  return (
    <svg viewBox="0 0 10 10" width="76" height="76" shapeRendering="crispEdges" aria-hidden="true" style={{ borderRadius: 6, background: '#cfd8e3', flex: 'none' }}>
      <rect x="0" y="8.6" width="10" height="1.4" fill="#9aa8b8" />
      {rows.flatMap((r, y) => [...r].map((c, x) => (col[c] ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={col[c]} /> : null)))}
    </svg>
  );
};

export const KnowsCard: React.FC<{ data: KnowsSummary; appName: string; scopes: CabinetEntryType[]; reads: boolean }> = ({ data, appName, scopes, reads }) => {
  const sees = (i: KnowsSummary['items'][number]) => reads && i.shareable && scopes.includes(i.type);
  const total = data.items.length;
  const seen = data.items.filter(sees).length;
  const pct = total ? Math.round((seen / total) * 100) : 0;
  const nordea = data.items.filter((i) => i.fromNordea).length;
  const priv = data.items.filter((i) => i.private).length;
  const kinds = [...new Set(data.items.map((i) => i.type))];
  const code = `AB-${String(hash(data.name) % 9000 + 1000)}`;
  // Fewer things, bigger squares: 5 to 10 columns, cells 16 to 12 px.
  const cols = Math.min(10, Math.max(5, Math.ceil(Math.sqrt(total * 1.6))));
  const cell = total <= 20 ? 18 : total <= 50 ? 14 : 12;
  const serif = 'Georgia, "Times New Roman", serif';
  return (
    <div data-testid="knows-card" style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--surface)' }}>
      <div style={{ background: '#0b1f4a', color: '#fff', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b style={{ fontSize: 13.5, letterSpacing: '.02em' }}>What Abel knows about you</b>
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, opacity: 0.75 }}>{code}</span>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <PixelAvatar name={data.name} />
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 11.5, color: 'var(--muted)', letterSpacing: '.04em' }}>NORDEA CUSTOMER{data.customerSince ? ` · SINCE ${data.customerSince}` : ''}</span>
            <div style={{ fontFamily: serif, fontSize: 26, fontWeight: 700, lineHeight: 1.1, color: 'var(--ink)' }}>{data.name}</div>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{data.age ? `${data.age} years · ` : ''}{total} things known · {nordea} noticed by Nordea</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          {data.facts.map((f) => (
            <div key={f.label} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{f.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.value}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>One square = one thing Abel knows · filled = {appName} sees it · hatched = private, never shared</div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <svg viewBox={`0 0 ${cols * cell} ${Math.max(1, Math.ceil(total / cols)) * cell}`} width={cols * cell} role="img" aria-label={`${seen} of ${total} things would be shared`} style={{ flex: 'none' }}>
              <defs>
                <pattern id="kc-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.2" height="3" fill="#8a8f9c" /></pattern>
              </defs>
              {data.items.map((i, n) => {
                const x = (n % cols) * cell, y = Math.floor(n / cols) * cell;
                const c = TONE[i.type] || '#777';
                return <rect key={i.id} x={x + 1.5} y={y + 1.5} width={cell - 3} height={cell - 3} rx="2"
                  fill={i.private ? 'url(#kc-hatch)' : sees(i) ? c : 'none'} stroke={i.private ? 'var(--muted)' : c} strokeWidth="1.2"><title>{`${i.label}: ${i.title}`}</title></rect>;
              })}
            </svg>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: serif, fontSize: 40, fontWeight: 700, color: reads ? '#2f7d6d' : 'var(--muted)', lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{reads ? `${seen} of ${total} things ${appName} would see` : `${appName} sees none of it. It can only add, after you approve.`}</div>
              {priv > 0 && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{priv} private, never shared</div>}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 8 }}>
            {kinds.map((k) => {
              const it = data.items.find((i) => i.type === k)!;
              return <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--muted)' }}><i style={{ width: 9, height: 9, borderRadius: 2, background: TONE[k] || '#777', display: 'inline-block' }} />{it.label}</span>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
