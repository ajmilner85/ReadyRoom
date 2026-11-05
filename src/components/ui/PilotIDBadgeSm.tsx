import React from 'react';

interface PilotIDBadgeSmProps {
  /** Display only (never an identifier). Retained for API compatibility. */
  squadronTailCode?: string;
  boardNumber?: string;
  squadronInsigniaUrl?: string;
  /** Optional colour for the board number (e.g. squadron primary). */
  color?: string;
}

/**
 * Compact pilot ID: squadron insignia + board number in IBM Plex Mono.
 * Fixed width so lists stay aligned whether or not a squadron is assigned.
 */
const PilotIDBadgeSm: React.FC<PilotIDBadgeSmProps> = ({
  squadronTailCode,
  boardNumber = '00',
  squadronInsigniaUrl,
  color,
}) => {
  const hasSquadron = !!(squadronTailCode && squadronTailCode.trim()) || !!squadronInsigniaUrl;
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', width: '72px', flex: 'none' }}
      title={squadronTailCode ? `${squadronTailCode} ${boardNumber}` : boardNumber}
    >
      {hasSquadron && squadronInsigniaUrl ? (
        <img src={squadronInsigniaUrl} alt="" style={{ width: '18px', height: '18px', objectFit: 'contain', flex: 'none' }} />
      ) : (
        <span style={{ width: '18px', height: '18px', flex: 'none' }} />
      )}
      <span
        style={{
          fontFamily: 'var(--rr-font-mono)',
          fontSize: '12.5px',
          fontWeight: 600,
          color: color || 'var(--rr-text2)',
          letterSpacing: '.02em',
        }}
      >
        {boardNumber}
      </span>
    </span>
  );
};

export default PilotIDBadgeSm;
