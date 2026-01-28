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
      backgroundColor: '#EFF6FF',
      border: '1px solid #93C5FD',
      borderRadius: '6px',
      padding: '8px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      zIndex: 900,
      fontFamily: 'Inter',
      fontSize: '13px',
      color: '#1E40AF',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      {/* Simple dot indicator */}
      <span style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: '#3B82F6',
        flexShrink: 0
      }} />
      <span>{displayText}</span>
    </div>
  );
};

export default MissionPresenceBanner;
