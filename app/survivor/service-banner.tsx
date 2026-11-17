'use client';

import { useState } from 'react';

const message = 'Despite reported outages over the past week at the NSA, Microsoft Outlook, United Airlines, and several others, Bidroom.live has maintained service. Thank you to our infrastructure and site management team for their bravery in the face of chaos.';

export default function ServiceBanner() {
  const [paused, setPaused] = useState(false);

  return <aside className="sv-service-banner" aria-label="Site bulletin — November 17, 2026" data-paused={paused}>
    <div className="sv-service-badge" aria-hidden="true">
      <strong><span className="sv-service-dot" />Still online</strong>
      <time dateTime="2026-11-17">Nov 17 bulletin</time>
    </div>
    <p className="sv-sr-only">{message}</p>
    <div className="sv-service-window" aria-hidden="true">
      <div className="sv-service-track">
        <span className="sv-service-copy">{message}<span className="sv-service-separator">✦</span></span>
        <span className="sv-service-copy">{message}<span className="sv-service-separator">✦</span></span>
      </div>
    </div>
    <button
      type="button"
      className="sv-service-toggle"
      aria-label={paused ? 'Resume banner scrolling' : 'Pause banner scrolling'}
      aria-pressed={paused}
      onClick={() => setPaused(value => !value)}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true">
        {paused ? <path d="M6 3.5v13L16 10Z" /> : <><rect x="5" y="4" width="3" height="12" rx="1" /><rect x="12" y="4" width="3" height="12" rx="1" /></>}
      </svg>
    </button>
  </aside>;
}
