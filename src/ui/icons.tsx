import React from 'react';

// Icon paths from the v14 prototype (our own simple line icons). Static strings, never user content.
export const ICONS: Record<string, string> = {
 "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4\"/>",
 "moon": "<path d=\"M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z\"/>",
 "spark": "<path d=\"M12 3.5l1.9 4.9 4.9 1.9-4.9 1.9L12 17.1l-1.9-4.9-4.9-1.9 4.9-1.9z\"/><path d=\"M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z\"/>",
 "send": "<path d=\"M12 19V5M5.5 11.5L12 5l6.5 6.5\"/>",
 "check": "<path d=\"M5 12.5l4.2 4.2L19 7\"/>",
 "plus": "<path d=\"M12 5v14M5 12h14\"/>",
 "chat": "<path d=\"M4 5h16v11H9l-5 4z\"/>",
 "cab": "<rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\"/><path d=\"M4 12h16M10 8h4M10 16h4\"/>",
 "home": "<path d=\"M4 11l8-6.5 8 6.5V20H4z\"/><path d=\"M10 20v-5h4v5\"/>",
 "star": "<path d=\"M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z\"/>",
 "mic": "<rect x=\"9\" y=\"3.5\" width=\"6\" height=\"11\" rx=\"3\"/><path d=\"M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5\"/>",
 "clip": "<path d=\"M19 11.5l-7.1 7.1a4.5 4.5 0 0 1-6.4-6.4l7.4-7.4a3 3 0 0 1 4.2 4.2l-7.3 7.3a1.5 1.5 0 0 1-2.1-2.1l6.7-6.7\"/>",
 "camera": "<path d=\"M4 8h3l1.5-2h7L17 8h3v11H4z\"/><circle cx=\"12\" cy=\"13\" r=\"3.5\"/>",
 "image": "<rect x=\"4\" y=\"5\" width=\"16\" height=\"14\" rx=\"2\"/><circle cx=\"9\" cy=\"10\" r=\"1.6\"/><path d=\"M5 18l5-5 3 3 2-2 4 4\"/>",
 "file": "<path d=\"M7 3.5h7l4 4V20H7z\"/><path d=\"M14 3.5V8h4M9.5 12.5h5M9.5 16h5\"/>",
 "person": "<circle cx=\"12\" cy=\"8.5\" r=\"3.5\"/><path d=\"M5 20c.8-3.6 3.7-5.5 7-5.5s6.2 1.9 7 5.5\"/>",
 "cycle": "<path d=\"M19.5 12a7.5 7.5 0 0 1-12.9 5.2M4.5 12a7.5 7.5 0 0 1 12.9-5.2\"/><path d=\"M17.4 3.5v3.3h-3.3M6.6 20.5v-3.3h3.3\"/>",
 "pie": "<path d=\"M12 4a8 8 0 1 0 8 8h-8z\"/><path d=\"M14.5 2.8v6.7h6.7a7 7 0 0 0-6.7-6.7z\"/>",
 "sprout": "<path d=\"M12 20v-8\"/><path d=\"M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 10c0-3.5 2.5-5.5 6.5-5.5 0 3.5-2.5 5.5-6.5 5.5z\"/>",
 "drop": "<path d=\"M12 3.5c3 4 6 7.2 6 10.5a6 6 0 0 1-12 0c0-3.3 3-6.5 6-10.5z\"/><path d=\"M9 14.5a3 3 0 0 0 3 3\"/>",
 "arrow": "<path d=\"M7 17L17 7M9 7h8v8\"/>",
 "pay": "<rect x=\"3.5\" y=\"6\" width=\"17\" height=\"12\" rx=\"2\"/><path d=\"M3.5 10h17M7 14.5h4\"/>",
 "scan": "<path d=\"M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3\"/><path d=\"M8 9v6M11 9v6M13.5 9v6M16 9v6\"/>",
 "transfer": "<rect x=\"4\" y=\"5\" width=\"11\" height=\"8\" rx=\"2\"/><rect x=\"9\" y=\"11\" width=\"11\" height=\"8\" rx=\"2\"/><path d=\"M12.5 15h4M15 13l2 2-2 2\"/>",
 "chev": "<path d=\"M9.5 6l6 6-6 6\"/>",
 "back": "<path d=\"M15 5l-7 7 7 7\"/>",
 "more": "<circle cx=\"6\" cy=\"12\" r=\"1.6\"/><circle cx=\"12\" cy=\"12\" r=\"1.6\"/><path d=\"M17 10.4a1.6 1.6 0 1 0 1.6 1.6\"/>",
 "contact": "<path d=\"M4 5h12v9H8l-4 3z\"/><path d=\"M9 17v1h7l4 3V10h-4\"/>",
 "insights": "<circle cx=\"12\" cy=\"12\" r=\"8\"/><path d=\"M12 4v8l6 4\"/>",
 "shield": "<path d=\"M12 3.5l7 3v5.5c0 4.2-3 7.4-7 8.5-4-1.1-7-4.3-7-8.5V6.5z\"/>",
 "invest": "<path d=\"M4 18l5-6 4 3 7-9\"/><path d=\"M15 6h5v5\"/>",
 "cal": "<rect x=\"4\" y=\"5.5\" width=\"16\" height=\"14\" rx=\"2\"/><path d=\"M4 10h16M8.5 3.5v4M15.5 3.5v4\"/>",
 "sliders": "<path d=\"M5 7h9M18 7h1M5 17h3M12 17h7\"/><circle cx=\"16\" cy=\"7\" r=\"2\"/><circle cx=\"10\" cy=\"17\" r=\"2\"/>",
 "gift": "<rect x=\"4\" y=\"9\" width=\"16\" height=\"11\" rx=\"1.5\"/><path d=\"M4 13h16M12 9v11M12 9c-2-4-6-3.5-6-1.5S10 9 12 9zm0 0c2-4 6-3.5 6-1.5S14 9 12 9z\"/>"
};

export const Icon: React.FC<{ name: string; size?: number; className?: string; strokeWidth?: number }> = ({ name, size = 18, className, strokeWidth = 2 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    dangerouslySetInnerHTML={{ __html: ICONS[name] || '' }}
  />
);

export const Bell: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

export const Chevron: React.FC<{ rotate?: number; size?: number }> = ({ rotate = 0, size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" style={{ fill: 'none', transform: `rotate(${rotate}deg)`, transition: 'transform .2s' }} aria-hidden="true">
    <path d="M9 6l6 6-6 6" style={{ fill: 'none' }} />
  </svg>
);

export const BotAvatar: React.FC = () => (
  <span className="bot-av" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5l1.9 4.9 4.9 1.9-4.9 1.9L12 17.1l-1.9-4.9-4.9-1.9 4.9-1.9z" />
    </svg>
  </span>
);
