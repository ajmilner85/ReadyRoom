import React, { useEffect } from 'react';
import { Icon } from '../primitives';
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
  const { hasPermission } = usePermissions();
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


  // Squadron color theming
  const useSquadronColors = settings.interfaceThemeUsesSquadronColors;
  const primaryColor = useSquadronColors ? 'var(--rr-accent)' : 'var(--rr-accent)';

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--rr-panel)',
    borderRadius: '10px',
    border: '1px solid var(--rr-border)',
    // Fill what's left of the window below the summary cards, never shorter than 480px
    height: 'max(480px, calc(100dvh - 470px))',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--rr-shadow)',
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    marginBottom: '12px',
    borderBottom: '1px solid var(--rr-border)',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--rr-text2)',
    textTransform: 'uppercase',
    letterSpacing: '.14em',
    textAlign: 'left',
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
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: '1px solid var(--rr-border2)',
    backgroundColor: 'var(--rr-panel)',
    color: 'var(--rr-text2)',
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
    padding: '0 16px 16px 16px', // Restore normal padding
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0, // Important for flex child with overflow
    overflow: 'hidden', // Prevent content from expanding beyond bounds
  };

  const emptyStateStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    textAlign: 'center',
    color: 'var(--rr-text2)',
    padding: '32px 16px',
  };

  const errorStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    textAlign: 'center',
    color: 'var(--rr-bad)',
    padding: '32px 16px',
  };

  if (error) {
    return (
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div style={titleStyle}>Polls</div>
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
        <div style={titleStyle}>Polls</div>
        {canManagePolls && (
          <div style={actionsStyle}>
            {onManagePolls && (
              <button
                onClick={onManagePolls}
                style={buttonStyle}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
                  e.currentTarget.style.borderColor = 'var(--rr-border2)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
                  e.currentTarget.style.borderColor = 'var(--rr-border2)';
                }}
                title="Manage Polls"
              >
                <Icon name="settings" size={16} />
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
                <Icon name="plus" size={16} />
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
            <Icon name="reports" size={48} color="#D1D5DB" style={{ marginBottom: '16px' }} />
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
          />
        )}
      </div>
    </div>
  );
};

export default PollCard;