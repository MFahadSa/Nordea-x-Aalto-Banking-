import React from 'react';
import type { CabinetEntryType } from '../types.js';
import type { KnowsSummary } from '../services/api.js';

// "What Abel knows about you": a record card shown when a connection starts. The layout is a
// record card with a header band, a pixel portrait, a big serif name, a facts grid, and a 10×10
// grid where each square is 1% of what Abel knows: filled = this app gets it, plain = it stays with
// Abel, hatched = private, never shared. Our own colours (Nordea navy), no outside artwork.

function hash(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/** A 12×12 pixel portrait in a little street scene. Colours come from the name: same name, same face. */
const PixelAvatar: React.FC<{ name: string }> = ({ name }) => {
  const h = hash(name);
  const skin = ['#f2d0b1', '#e0b08a', '#c68b62', '#9a6544', '#6e4630'][h % 5];
  const hair = ['#2b2118', '#5a3a22', '#a8743c', '#d9c08a', '#9a9a9a', '#7a2d1d'][(h >> 3) % 6];
  const shirt = ['#2f7d6d', '#2c5fb8', '#6b4bb0', '#b8326a', '#3e7d3e'][(h >> 6) % 5];
  const long = (h >> 9) % 2 === 0;
  const L = long ? 'h' : 'k';
  // k sky, w window, g ground, r road line, h hair, s skin, e eye, b shirt
  const rows = [
    'kkkkkkkkkkkk',
    'kwkkhhhhkkkk',
    'kwkhhhhhhkkw',
    `kk${L}hssssh${L}kw`,
    `kk${L}sesses${L}kk`,
    `kk${L}ssssss${L}kk`,
    `kk${L}kssssk${L}kk`,
    'kkkkksskkkkk',
    'kkkbbbbbbkkk',
    'kkbbbbbbbbkk',
    'ggbbbbbbbbgg',
    'grrggrrggrrg',
  ];
  const col: Record<string, string> = { k: '#cfdbe8', w: '#aebdd0', g: '#7f8b99', r: '#e8edf2', h: hair, s: skin, e: '#1d1b18', b: shirt };
  return (
    <svg viewBox="0 0 12 12" width="84" height="84" shapeRendering="crispEdges" aria-hidden="true" style={{ borderRadius: 4, flex: 'none', border: '1px solid rgba(0,0,0,.15)' }}>
      {rows.flatMap((r, y) => [...r].map((c, x) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={col[c]} />))}
    </svg>
  );
};

/**
 * mode "share": what one app would see (filled = it sees it). mode "self": what Abel itself uses
 * (filled = used, hatched = private: Abel uses it but it is never shared, plain = not used).
 */
export const KnowsCard: React.FC<{ data: KnowsSummary; appName?: string; scopes?: CabinetEntryType[]; reads?: boolean; mode?: 'share' | 'self' }> = ({ data, appName = 'Abel', scopes = [], reads = false, mode = 'share' }) => {
  const self = mode === 'self';
  const sees = (i: KnowsSummary['items'][number]) => (self ? i.abelUses && !i.private : reads && i.shareable && scopes.includes(i.type));
  const total = data.items.length;
  const seen = data.items.filter(sees).length;
  const priv = data.items.filter((i) => i.private && (!self || i.abelUses)).length;
  const nordea = data.items.filter((i) => i.fromNordea).length;
  const pct = total ? Math.round(((self ? seen + priv : seen) / total) * 100) : 0;
  const seenPct = total ? Math.round((seen / total) * 100) : 0;
  const privPct = total ? Math.round((priv / total) * 100) : 0;
  const code = `AB-${new Date().getFullYear()}-${String(hash(data.name) % 900 + 100)}`;
  const serif = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
  const navy = '#0b1f4a';
  const accent = '#a4352c';
  const green = '#2f7d6d';
  const lives = data.facts.find((f) => f.label === 'Lives in')?.value;
  const paper: React.CSSProperties = {
    backgroundColor: 'var(--surface)',
    backgroundImage: 'linear-gradient(rgba(127,127,127,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(127,127,127,.07) 1px, transparent 1px)',
    backgroundSize: '14px 14px',
  };
  const label: React.CSSProperties = { fontSize: 11, color: 'var(--muted)' };
  return (
    <div data-testid="knows-card" style={{ flex: 'none', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', ...paper }}>
      <div style={{ background: navy, color: '#fff', padding: '9px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b style={{ fontFamily: serif, fontSize: 16 }}>What Abel knows</b>
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, opacity: 0.8 }}>{code}</span>
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: navy, letterSpacing: '.02em' }}>Customer record</span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <PixelAvatar name={data.name} />
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: green }}>{[lives && lives !== '—' ? lives : '', data.age ? `${data.age} years` : ''].filter(Boolean).join(' · ') || 'Nordea customer'}</span>
            <div style={{ fontFamily: serif, fontSize: 30, fontWeight: 700, lineHeight: 1.05, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.name}</div>
            <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: 'var(--ink)', marginTop: 2 }}>{data.customerSince ? `${data.customerSince} – today` : 'today'} · {total} things</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{nordea} noticed by Nordea · {total - nordea} told by you</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          {data.facts.map((f) => (
            <div key={f.label} style={{ minWidth: 0 }}>
              <div style={label}>{f.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: f.label === 'Saving for' ? accent : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.value}</div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <div style={{ ...label, marginBottom: 8 }}>{self ? 'Use map · one square = 1% · filled = Abel uses it · hatched = private, only Abel · pale = not used' : `Share map · one square = 1% · filled = ${appName} sees it · hatched = private, never shared`}</div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <svg viewBox="0 0 100 100" width="128" height="128" role="img" aria-label={`${pct}% of what Abel knows would be shared with ${appName}`} style={{ flex: 'none' }}>
              <defs>
                <pattern id="kc-hatch" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1" height="2.4" fill="#1d1b18" /></pattern>
              </defs>
              {Array.from({ length: 100 }, (_, n) => {
                const x = (n % 10) * 10, y = Math.floor(n / 10) * 10;
                const kind = n < seenPct ? 'seen' : (self ? n < seenPct + privPct : n >= 100 - privPct) ? 'private' : 'kept';
                return <rect key={n} x={x + 0.8} y={y + 0.8} width="8.4" height="8.4" rx="0.8"
                  fill={kind === 'seen' ? green : kind === 'private' ? 'url(#kc-hatch)' : 'rgba(47,125,109,.16)'}
                  stroke={kind === 'private' ? '#1d1b18' : 'none'} strokeWidth="0.6" />;
              })}
            </svg>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: serif, fontSize: 52, fontWeight: 700, color: reads || self ? green : 'var(--muted)', lineHeight: 0.95 }}>{pct}%</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink)', marginTop: 4 }}>
                {self ? 'of what Abel knows about you, Abel uses when it helps you' : reads ? `of what Abel knows about you, ${appName} would see` : `${appName} reads none of it. What it sends you review first.`}
              </div>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
                {self ? `${seen + priv} of ${total} used${total - seen - priv ? ` · ${total - seen - priv} not used` : ''}` : `${seen} of ${total} things`}{priv ? ` · ${priv} private` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--line)', padding: '9px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{self ? 'Is this you?' : 'Who gets to know you?'}</b>
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, fontWeight: 700, color: accent, whiteSpace: 'nowrap' }}>abel · nordea</span>
      </div>
    </div>
  );
};
