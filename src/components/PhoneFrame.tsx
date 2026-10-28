import React, { useEffect, useRef } from 'react';

interface PhoneFrameProps {
  children: React.ReactNode;
  statusBarTheme?: 'brand' | 'light';
  overlay?: React.ReactNode;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({
  children,
  statusBarTheme = 'brand',
  overlay,
}) => {
  const holderRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fitPhone() {
      const hold = holderRef.current;
      const ph = phoneRef.current;
      if (!hold || !ph) return;

      if (window.innerWidth <= 480 && window.matchMedia('(pointer:coarse)').matches) {
        hold.style.width = '';
        hold.style.height = '';
        ph.style.transform = '';
        return;
      }

      const top = hold.getBoundingClientRect().top + window.scrollY;
      const footH = 40;
      const s = Math.min(1, (window.innerHeight - top - footH) / 864, (window.innerWidth - 24) / 410);
      const k = Math.max(0.4, s);
      ph.style.transform = `scale(${k})`;
      hold.style.width = `${410 * k}px`;
      hold.style.height = `${864 * k}px`;
    }

    fitPhone();
    window.addEventListener('resize', fitPhone);
    return () => window.removeEventListener('resize', fitPhone);
  }, []);

  return (
    <div className="phone-holder" ref={holderRef} id="pholder">
      <div className="phone" ref={phoneRef} id="phone">
        {/* Status Bar */}
        <div className={`status ${statusBarTheme === 'light' ? 'light' : ''}`} id="status">
          <span>9:41</span>
          <span>
            5G<i className="batt" aria-hidden="true" />
          </span>
        </div>

        {/* Screen Content */}
        <div className="screen" id="screen" tabIndex={-1}>
          {children}
        </div>

        {/* In-Phone Modals and Overlays */}
        {overlay}
      </div>
    </div>
  );
};
