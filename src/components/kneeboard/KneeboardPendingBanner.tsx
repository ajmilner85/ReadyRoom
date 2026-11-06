import React from 'react';
import { Icon } from '../ui/primitives';

/**
 * Kneeboard warning: mission data hasn't been published yet. Sized for 1:1 OpenKneeboard
 * rendering (22px text, matching the kneeboard's large type) rather than the app's 12–13px.
 */
const KneeboardPendingBanner: React.FC<{ text: string }> = ({ text }) => (
  <div
    role="status"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      padding: '14px 18px',
      marginBottom: '16px',
      borderRadius: '10px',
      border: '2px solid var(--rr-warn)',
      background: 'color-mix(in srgb, var(--rr-warn) 16%, transparent)',
      color: 'var(--rr-text)',
      fontSize: '22px',
      fontWeight: 600,
      lineHeight: 1.3,
    }}
  >
    <Icon name="alertTriangle" size={28} style={{ color: 'var(--rr-warn)', flex: 'none' }} />
    <span>{text}</span>
  </div>
);

export default KneeboardPendingBanner;
