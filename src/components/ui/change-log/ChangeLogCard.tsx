import React from 'react';
import { Plus, FileText, Settings } from 'lucide-react';
import { useChangeLog } from '../../../hooks/useChangeLog';
import { usePermissions } from '../../../hooks/usePermissions';
import { useAppSettings } from '../../../context/AppSettingsContext';
import ChangeLogFeed from './ChangeLogFeed';
import LoadingSpinner from '../LoadingSpinner';

interface ChangeLogCardProps {
  onCreatePost?: () => void;
  onManagePosts?: () => void;
}

const ChangeLogCard: React.FC<ChangeLogCardProps> = ({ onCreatePost, onManagePosts }) => {
  const { posts, loading, error, hasMore, loadMore, react, removeReaction } = useChangeLog();
  const { hasPermission } = usePermissions();
  const { settings } = useAppSettings();

  const canManageChangeLog = hasPermission('manage_change_log');
  const canReactToPosts = hasPermission('react_to_posts');

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
    minHeight: 0, // Important for flex child with overflow
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
          <div style={titleStyle}>Change Log</div>
        </div>
        <div style={errorStyle}>
          <p>Failed to load change log</p>
          <p style={{ fontSize: '14px', marginTop: '4px' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={titleStyle}>Change Log</div>
        {canManageChangeLog && (
          <div style={actionsStyle}>
            {onManagePosts && (
              <button
                onClick={onManagePosts}
                style={buttonStyle}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = '#F3F4F6';
                  e.currentTarget.style.borderColor = '#9CA3AF';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                  e.currentTarget.style.borderColor = '#D1D5DB';
                }}
                title="Manage Posts"
              >
                <Settings size={16} />
              </button>
            )}
            {onCreatePost && (
              <button
                onClick={onCreatePost}
                style={createButtonStyle}
                onMouseEnter={e => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.opacity = '1';
                }}
                title="Create Post"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {loading && posts.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <LoadingSpinner />
          </div>
        ) : posts.length === 0 ? (
          <div style={emptyStateStyle}>
            <FileText size={48} color="#D1D5DB" style={{ marginBottom: '16px' }} />
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 500 }}>
              No Posts Yet
            </h3>
            <p style={{ margin: 0, fontSize: '14px' }}>
              {canManageChangeLog 
                ? "Create a post to announce new features and updates."
                : "Check back later for updates about new features."}
            </p>
          </div>
        ) : (
          <ChangeLogFeed
            posts={posts}
            hasMore={hasMore}
            loading={loading}
            onLoadMore={loadMore}
            onReact={canReactToPosts ? react : undefined}
            onRemoveReaction={canReactToPosts ? removeReaction : undefined}
            primaryColor={primaryColor}
            accentColor={accentColor}
          />
        )}
      </div>
    </div>
  );
};

export default ChangeLogCard;