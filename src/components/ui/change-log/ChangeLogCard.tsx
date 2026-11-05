import React, { useState } from 'react';
import { Plus, FileText, Settings } from 'lucide-react';
import { useChangeLog } from '../../../hooks/useChangeLog';
import { usePermissions } from '../../../hooks/usePermissions';
import { useAppSettings } from '../../../context/AppSettingsContext';
import ChangeLogFeed from './ChangeLogFeed';
import LoadingSpinner from '../LoadingSpinner';
import CreatePostDialog from './CreatePostDialog';
import PostManagementDialog from './PostManagementDialog';

interface ChangeLogCardProps {
  // No external handlers needed - component manages its own dialogs
}

const ChangeLogCard: React.FC<ChangeLogCardProps> = () => {
  const { posts, loading, error, hasMore, loadMore, react, removeReaction, refresh } = useChangeLog();
  const { permissions } = usePermissions();
  const { settings } = useAppSettings();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showManageDialog, setShowManageDialog] = useState(false);

  const canManageChangeLog = permissions?.canManageChangeLog || false;
  const canReactToPosts = permissions?.canReactToPosts || false;

  // Squadron color theming
  const useSquadronColors = settings.interfaceThemeUsesSquadronColors;
  const primaryColor = useSquadronColors ? '#3B82F6' : '#3B82F6'; // TODO: Get actual squadron color

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--rr-panel)',
    borderRadius: '10px',
    border: '1px solid var(--rr-border)',
    height: 'calc(100vh - 48px)',
    maxHeight: 'calc(100vh - 48px)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--rr-shadow)',
    overflow: 'hidden',
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
    color: 'var(--rr-text2)',
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
            <button
              onClick={() => setShowManageDialog(true)}
              style={buttonStyle}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
                e.currentTarget.style.borderColor = 'var(--rr-border2)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
                e.currentTarget.style.borderColor = 'var(--rr-border2)';
              }}
              title="Manage Posts"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={() => setShowCreateDialog(true)}
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
          />
        )}
      </div>

      {/* Create Post Dialog */}
      <CreatePostDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onPostCreated={() => {
          setShowCreateDialog(false);
          refresh();
        }}
        primaryColor={primaryColor}
      />

      {/* Post Management Dialog */}
      <PostManagementDialog
        isOpen={showManageDialog}
        onClose={() => setShowManageDialog(false)}
        onPostUpdated={refresh}
        primaryColor={primaryColor}
      />
    </div>
  );
};

export default ChangeLogCard;