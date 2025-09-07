import React, { useEffect } from 'react';
import { Plus, BarChart3, Settings } from 'lucide-react';
import { usePolls } from '../../../hooks/usePolls';
import { usePermissions } from '../../../hooks/usePermissions';
import { useAppSettings } from '../../../context/AppSettingsContext';
import PollList from './PollList';
import LoadingSpinner from '../LoadingSpinner';

interface PollCardProps {
  onCreatePoll?: () => void;
  onManagePolls?: () => void;
  refreshTrigger?: number;
}

const PollCard: React.FC<PollCardProps> = ({ onCreatePoll, onManagePolls, refreshTrigger }) => {
  const { polls, loading, error, vote, removeVote, refresh } = usePolls(true); // Enable real-time polling
  const { hasPermission, permissions, loading: permissionsLoading, error: permissionsError } = usePermissions();
  const { settings } = useAppSettings();

  const canManagePolls = hasPermission('canManagePolls');
  const canVoteInPolls = hasPermission('canVoteInPolls');

  // Refresh polls when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      console.log('PollCard: Refreshing polls due to trigger:', refreshTrigger);
      refresh();
    }
  }, [refreshTrigger, refresh]);

  // Debug permissions and polls
  console.log('PollCard debug:', { 
    canManagePolls, 
    canVoteInPolls, 
    allPermissions: permissions,
    permissionsLoading,
    permissionsError,
    pollsLoading: loading,
    pollsError: error,
    pollsCount: polls.length,
    refreshTrigger
  });

  // Squadron color theming
  const useSquadronColors = settings.interfaceThemeUsesSquadronColors;
  const primaryColor = useSquadronColors ? '#3B82F6' : '#3B82F6'; // TODO: Get actual squadron color
  const accentColor = useSquadronColors ? '#10B981' : '#10B981'; // TODO: Get actual squadron accent color

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    borderRadius: '8px',
    border: '1px solid #E2E8F0',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px 0 24px',
    marginBottom: '16px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 300,
    color: '#1F2937',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    textAlign: 'center',
    flex: 1,
  };

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
  };

  const buttonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: '1px solid #D1D5DB',
    backgroundColor: '#FFFFFF',
    color: '#6B7280',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  };

  const createButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: primaryColor,
    borderColor: primaryColor,
    color: '#FFFFFF',
  };

  const contentStyle: React.CSSProperties = {
    flex: 1,
    padding: '0 16px 16px 16px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };

  const emptyStateStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    textAlign: 'center',
    color: '#6B7280',
    padding: '32px 16px',
  };

  const errorStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    textAlign: 'center',
    color: '#EF4444',
    padding: '32px 16px',
  };

  if (error) {
    return (
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div style={titleStyle}>Feature Polls</div>
        </div>
        <div style={errorStyle}>
          <p>Failed to load polls</p>
          <p style={{ fontSize: '14px', marginTop: '4px' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={titleStyle}>Feature Polls</div>
        {canManagePolls && (
          <div style={actionsStyle}>
            {onManagePolls && (
              <button
                onClick={onManagePolls}
                style={buttonStyle}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = '#F3F4F6';
                  e.currentTarget.style.borderColor = '#9CA3AF';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                  e.currentTarget.style.borderColor = '#D1D5DB';
                }}
                title="Manage Polls"
              >
                <Settings size={16} />
              </button>
            )}
            {onCreatePoll && (
              <button
                onClick={onCreatePoll}
                style={createButtonStyle}
                onMouseEnter={e => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.opacity = '1';
                }}
                title="Create Poll"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <LoadingSpinner />
          </div>
        ) : polls.length === 0 ? (
          <div style={emptyStateStyle}>
            <BarChart3 size={48} color="#D1D5DB" style={{ marginBottom: '16px' }} />
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 500 }}>
              No Active Polls
            </h3>
            <p style={{ margin: 0, fontSize: '14px' }}>
              {canManagePolls 
                ? "Create a poll to start gathering community feedback on new features."
                : "Check back later for polls about upcoming features."}
            </p>
          </div>
        ) : (
          <PollList
            polls={polls}
            onVote={canVoteInPolls ? vote : undefined}
            onRemoveVote={canVoteInPolls ? removeVote : undefined}
            primaryColor={primaryColor}
            accentColor={accentColor}
          />
        )}
      </div>
    </div>
  );
};

export default PollCard;