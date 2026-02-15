import React, { useState, useMemo } from 'react';
import type { IssueWithDetails, IssueStatus, IssuePriority } from '../../types/IssueTypes';
import { PRIORITY_ORDER } from '../../types/IssueTypes';
import { IssueItem } from './IssueItem';

interface IssuesListProps {
  issues: IssueWithDetails[];
  loading: boolean;
  error: string | null;
  onIssueClick: (issue: IssueWithDetails) => void;
  onStatusToggle?: (issue: IssueWithDetails, newStatus: IssueStatus) => void;
  canCreate: boolean;
  canResolve: boolean;
  onCreateClick?: () => void;
  showFilters?: boolean;
  showMissionName?: boolean;
  emptyMessage?: string;
}

type FilterStatus = 'all' | 'open' | 'closed';

export const IssuesList: React.FC<IssuesListProps> = ({
  issues,
  loading,
  error,
  onIssueClick,
  onStatusToggle,
  canCreate,
  canResolve,
  onCreateClick,
  showFilters = true,
  showMissionName = false,
  emptyMessage = 'No issues found',
}) => {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('open');
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | 'all'>('all');

  // Filter and sort issues
  const filteredIssues = useMemo(() => {
    let result = [...issues];

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter((issue) => issue.status === statusFilter);
    }

    // Apply priority filter
    if (priorityFilter !== 'all') {
      result = result.filter((issue) => issue.priority === priorityFilter);
    }

    // Sort: open issues first, then by priority, then by date
    result.sort((a, b) => {
      // Status: open before closed
      if (a.status !== b.status) {
        return a.status === 'open' ? -1 : 1;
      }
      // Priority: critical > high > medium > low
      const priorityDiff = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      // Date: newest first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return result;
  }, [issues, statusFilter, priorityFilter]);

  const openCount = issues.filter((i) => i.status === 'open').length;
  const closedCount = issues.filter((i) => i.status === 'closed').length;

  const handleStatusToggle = onStatusToggle
    ? (issue: IssueWithDetails, newStatus: IssueStatus) => onStatusToggle(issue, newStatus)
    : undefined;

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>
        <div
          style={{
            width: '24px',
            height: '24px',
            border: '2px solid #E5E7EB',
            borderTopColor: '#2563EB',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 12px',
          }}
        />
        Loading issues...
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '24px',
          textAlign: 'center',
          color: '#DC2626',
          backgroundColor: '#FEE2E2',
          borderRadius: '8px',
          margin: '16px',
        }}
      >
        <strong>Error loading issues:</strong> {error}
      </div>
    );
  }

  return (
    <div>
      {/* Header with filters and create button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid #E5E7EB',
          backgroundColor: '#F9FAFB',
        }}
      >
        {showFilters && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Status filter tabs */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['open', 'closed', 'all'] as FilterStatus[]).map((status) => {
                const count = status === 'all' ? issues.length : status === 'open' ? openCount : closedCount;
                const isActive = statusFilter === status;
                return (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '13px',
                      fontWeight: 500,
                      border: 'none',
                      borderRadius: '6px',
                      backgroundColor: isActive ? '#2563EB' : 'transparent',
                      color: isActive ? 'white' : '#6B7280',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)} ({count})
                  </button>
                );
              })}
            </div>

            {/* Priority filter dropdown */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as IssuePriority | 'all')}
              style={{
                padding: '6px 10px',
                fontSize: '13px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                backgroundColor: 'white',
                color: '#374151',
                cursor: 'pointer',
              }}
            >
              <option value="all">All priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        )}

        {!showFilters && <div />}

        {canCreate && onCreateClick && (
          <button
            onClick={onCreateClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#2563EB',
              color: 'white',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1D4ED8')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563EB')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Issue
          </button>
        )}
      </div>

      {/* Issues list */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {filteredIssues.length === 0 ? (
          <div
            style={{
              padding: '40px 24px',
              textAlign: 'center',
              color: '#6B7280',
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#D1D5DB"
              strokeWidth="1.5"
              style={{ margin: '0 auto 16px' }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ margin: 0, fontSize: '14px' }}>{emptyMessage}</p>
            {canCreate && onCreateClick && statusFilter !== 'all' && issues.length > 0 && (
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#9CA3AF' }}>
                Try changing your filters or{' '}
                <button
                  onClick={onCreateClick}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 'inherit',
                    textDecoration: 'underline',
                  }}
                >
                  create a new issue
                </button>
              </p>
            )}
          </div>
        ) : (
          filteredIssues.map((issue) => (
            <IssueItem
              key={issue.id}
              issue={issue}
              onClick={() => onIssueClick(issue)}
              onStatusToggle={handleStatusToggle ? (newStatus) => handleStatusToggle(issue, newStatus) : undefined}
              canResolve={canResolve}
              showMissionName={showMissionName}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default IssuesList;
