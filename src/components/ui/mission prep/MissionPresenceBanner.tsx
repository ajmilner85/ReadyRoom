import React from 'react';
import type { MissionPresenceUser } from '../../../hooks/useMissionRealtime';

interface MissionPresenceBannerProps {
  activeUsers: MissionPresenceUser[];
  isConnected: boolean;
}

/**
 * Floating banner that shows which other users are currently viewing/editing
 * the same mission. Uses Supabase Presence (no database table needed).
 */
const MissionPresenceBanner: React.FC<MissionPresenceBannerProps> = ({
  activeUsers,
  isConnected
}) => {
  if (!isConnected || activeUsers.length === 0) return null;

  const names = activeUsers.map(u => u.user_name);
  const displayText =
    names.length === 1
      ? `${names[0]} is also editing this mission`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are also editing this mission`
        : `${names[0]} and ${names.length - 1} others are also editing this mission`;

  return (
    <div style={{
      position: 'fixed',
      top: '72px',
      right: '20px',
      backgroundColor: 'var(--rr-accent-weak)',
      border: '1px solid var(--rr-accent)',
      borderRadius: '6px',
      padding: '8px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      zIndex: 900,
      fontFamily: 'inherit',
      fontSize: '13px',
      color: 'var(--rr-accent-text)',
      boxShadow: 'var(--rr-shadow)'
    }}>
      {/* Simple dot indicator */}
      <span style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: 'var(--rr-accent)',
        flexShrink: 0
      }} />
      <span>{displayText}</span>
    </div>
  );
};

export default MissionPresenceBanner;
