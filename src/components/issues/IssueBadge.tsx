import React from 'react';
import type { IssueStatus, IssuePriority } from '../../types/IssueTypes';
import { STATUS_CONFIG, PRIORITY_CONFIG } from '../../types/IssueTypes';

interface IssueBadgeProps {
  type: 'status' | 'priority';
  value: IssueStatus | IssuePriority;
  size?: 'small' | 'medium';
}

export const IssueBadge: React.FC<IssueBadgeProps> = ({ type, value, size = 'small' }) => {
  const config = type === 'status'
    ? STATUS_CONFIG[value as IssueStatus]
    : PRIORITY_CONFIG[value as IssuePriority];

  const padding = size === 'small' ? '2px 8px' : '4px 12px';
  const fontSize = size === 'small' ? '11px' : '12px';

  return (
    <span
      style={{
        display: 'inline-block',
        padding,
        borderRadius: '12px',
        fontSize,
        fontWeight: 500,
        color: config.color,
        backgroundColor: config.bgColor,
        whiteSpace: 'nowrap',
      }}
    >
      {config.label}
    </span>
  );
};

export default IssueBadge;
