// Building blocks that copy the Nordea app's patterns (header, round actions, chevron rows, grey bands).
import React from 'react';
import { Icon } from '../ui/icons.js';

// Our own background art for the blue bands (soft blocks and lines), not Nordea's.
const BG_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='390' height='260' viewBox='0 0 390 260'><g fill='none' stroke='#ffffff' stroke-opacity='.14' stroke-width='1'><path d='M240 40l40-23 40 23-40 23z'/><path d='M240 40v46l40 23V63M320 40v46l-40 23'/><path d='M300 120l30-17 30 17-30 17z'/><path d='M300 120v34l30 17v-34M360 120v34l-30 17'/><path d='M20 210l32-18 32 18-32 18z'/><path d='M20 210v30l32 18v-30M84 210v30l-32 18'/></g><g stroke='#ffffff' stroke-opacity='.16' stroke-dasharray='4 7'><path d='M0 150L200 35'/><path d='M150 260L390 122'/></g><g fill='#5a6cff' fill-opacity='.28'><path d='M262 170l22-13 22 13-22 13z'/><path d='M120 70l14-8 14 8-14 8z'/></g><circle cx='352' cy='52' r='26' fill='#3045ff' fill-opacity='.22'/></svg>`;
export const BAND_BG = `url("data:image/svg+xml;utf8,${encodeURIComponent(BG_SVG)}"),linear-gradient(175deg,#0000A0 0%,#00006E 100%)`;

export interface RoundAction {
  icon: string;
  label: string;
  onClick: () => void;
  dot?: boolean;
}

export const RoundActions: React.FC<{ actions: RoundAction[] }> = ({ actions }) => (
  <div className={`nq-row ${actions.length === 3 ? 'three' : ''}`}>
    {actions.map((a) => (
      <button key={a.label} className="nq" onClick={a.onClick}>
        <span className="nq-c">
          <Icon name={a.icon} />
          {a.dot && <i className="live-dot" />}
        </span>
        <span className="nq-l">{a.label}</span>
      </button>
    ))}
  </div>
);

export const DetailHead: React.FC<{ title: string; big?: string; sub?: string; actions?: RoundAction[]; onBack?: () => void }> = ({ title, big, sub, actions, onBack }) => (
  <header className="nhead detail" style={{ backgroundImage: BAND_BG }}>
    <div className="dh-top">
      {onBack ? (
        <button className="dh-back" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
      ) : (
        <span className="dh-back" />
      )}
      <b>{title}</b>
      <span className="dh-back" />
    </div>
    {big && <p className="dh-big">{big}</p>}
    {sub && <p className="dh-sub">{sub}</p>}
    {actions && actions.length > 0 && <RoundActions actions={actions} />}
  </header>
);

export const NChev: React.FC = () => (
  <span className="nchev" aria-hidden="true">
    <Icon name="chev" />
  </span>
);

/** A Nordea list row: name and grey sub-line on the left, bold amount on the right, chevron. */
export const NRow: React.FC<{
  name: React.ReactNode;
  sub?: React.ReactNode;
  amount?: React.ReactNode;
  note?: React.ReactNode;
  onClick?: () => void;
  right?: React.ReactNode;
  chevron?: boolean;
  className?: string;
}> = ({ name, sub, amount, note, onClick, right, chevron = true, className = '' }) => {
  const inner = (
    <>
      <span className="n-l">
        <span className="n-name">{name}</span>
        {sub && <span className="n-sub">{sub}</span>}
      </span>
      {amount != null && (
        <span className="n-r">
          <b>{amount}</b>
          {note && <span className="n-sub">{note}</span>}
        </span>
      )}
      {right}
      {chevron && onClick && <NChev />}
    </>
  );
  return onClick ? (
    <button className={`nrow2 ${className}`} onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className={`nrow2 static ${className}`}>{inner}</div>
  );
};

export const Band: React.FC<{ left: string; right?: React.ReactNode }> = ({ left, right }) => (
  <div className="nband">
    <span>{left}</span>
    {right != null && <span className="nband-r">{right}</span>}
  </div>
);

export const Toggle: React.FC<{ on: boolean; onChange: () => void; label: string }> = ({ on, onChange, label }) => (
  <button className={`tgl${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onChange}>
    <i />
  </button>
);
