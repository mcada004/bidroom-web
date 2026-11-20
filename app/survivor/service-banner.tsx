'use client';

import { useEffect, useState } from 'react';

const message = 'Despite reported outages over the past week at the NSA, Microsoft Outlook, United Airlines, and several others, Bidroom.live has maintained service. Thank you to our infrastructure and site management team for their bravery in the face of chaos.';

const dismissalKey = 'survivor:bulletin:2026-11-17:dismissed';

export default function ServiceBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try { setVisible(localStorage.getItem(dismissalKey) !== 'yes'); }
    catch { setVisible(true); }
  }, []);
  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(dismissalKey, 'yes'); } catch { /* Still dismissed for this visit. */ }
  }
  if (!visible) return null;
  return <aside className="sv-service-banner" aria-label="Site bulletin">
    <div><strong>Still online · Nov 17 bulletin</strong><p>{message}</p></div>
    <button type="button" onClick={dismiss} aria-label="Dismiss site bulletin">Dismiss</button>
  </aside>;
}
