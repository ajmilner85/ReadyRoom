import React, { useState } from 'react';
import type { IssueWithDetails, IssueStatus } from '../../types/IssueTypes';
import { IssueBadge } from './IssueBadge';

interface IssueItemProps {
  issue: IssueWithDetails;
  onClick: () => void;
  onStatusToggle?: (newStatus: IssueStatus) => void;
  canResolve: boolean;
  showMissionName?: boolean;
}

export const IssueItem: React.FC<IssueItemProps> = ({
  issue,
  onClick,
  onStatusToggle,
  canResolve,
  showMissionName = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const handleStatusToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canResolve || !onStatusToggle || isToggling) return;

    setIsToggling(true);
    try {
      const newStatus: IssueStatus = issue.status === 'open' ? 'closed' : 'open';
      await onStatusToggle(newStatus);
    } finally {
      setIsToggling(false);
    }
  };

  // Get display name for the creator
  const getCreatorName = () => {
    if (!issue.created_by_user) return 'Unknown';
    const pilot = issue.created_by_user.pilots;
    if (pilot?.callsign) return pilot.callsign;
    return issue.created_by_user.display_name || 'Unknown';
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  };

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: isHovered ? '#F9FAFB' : 'white',
        borderBottom: '1px solid #E5E7EB',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
      }}
    >
      {/* Status toggle button */}
      {canResolve && onStatusToggle && (
        <button
          onClick={handleStatusToggle}
          disabled={isToggling}
          title={issue.status === 'open' ? 'Close issue' : 'Reopen issue'}
          style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            border: `2px solid ${issue.status === 'open' ? '#047857' : '#9CA3AF'}`,
            backgroundColor: issue.status === 'closed' ? '#9CA3AF' : 'transparent',
            cursor: isToggling ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px',
            opacity: isToggling ? 0.5 : 1,
          }}
        >
          {issue.status === 'closed' && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
      )}

      {/* Issue content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title and badges row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: issue.status === 'closed' ? '#6B7280' : '#1F2937',
              textDecoration: issue.status === 'closed' ? 'line-through' : 'none',
            }}
          >
            {issue.title}
          </span>
          <IssueBadge type="priority" value={issue.priority} />
          {issue.status === 'closed' && <IssueBadge type="status" value={issue.status} />}
        </div>

        {/* Meta row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginTop: '4px',
            fontSize: '12px',
            color: '#6B7280',
          }}
        >
          {showMissionName && issue.mission_name && (
            <span style={{ fontWeight: 500, color: '#4B5563' }}>{issue.mission_name}</span>
          )}
          <span>by {getCreatorName()}</span>
          <span>{formatDate(issue.created_at)}</span>
          {(issue.comment_count ?? 0) > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {issue.comment_count}
            </span>
          )}
        </div>
      </div>

      {/* Arrow indicator */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#9CA3AF"
        strokeWidth="2"
        style={{ flexShrink: 0, marginTop: '4px' }}
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  );
};

export default IssueItem;
