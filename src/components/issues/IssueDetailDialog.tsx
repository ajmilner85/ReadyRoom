import React, { useState, useCallback } from 'react';
import type { IssueWithDetails, IssueStatus, IssuePriority } from '../../types/IssueTypes';
import { updateIssue, deleteIssue } from '../../utils/issueService';
import { IssueBadge } from './IssueBadge';
import { IssueComments } from './IssueComments';

interface IssueDetailDialogProps {
  isOpen: boolean;
  issue: IssueWithDetails | null;
  onClose: () => void;
  onIssueUpdated: () => void;
  onIssueDeleted: () => void;
  canEdit: boolean;
  canResolve: boolean;
  canComment: boolean;
}

export const IssueDetailDialog: React.FC<IssueDetailDialogProps> = ({
  isOpen,
  issue,
  onClose,
  onIssueUpdated,
  onIssueDeleted,
  canEdit,
  canResolve,
  canComment,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<IssuePriority>('medium');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  // This hook must be defined before any early returns
  const handleCommentCountChange = useCallback((count: number) => {
    setCommentCount(count);
  }, []);

  if (!isOpen || !issue) return null;

  // Start editing mode
  const handleStartEdit = () => {
    setEditTitle(issue.title);
    setEditDescription(issue.description || '');
    setEditPriority(issue.priority);
    setIsEditing(true);
    setError(null);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false);
    setError(null);
  };

  // Save edits
  const handleSaveEdit = async () => {
    if (!editTitle.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateIssue(issue.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        priority: editPriority,
      });
      setIsEditing(false);
      onIssueUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update issue');
    } finally {
      setSaving(false);
    }
  };

  // Toggle status (open/closed)
  const handleStatusToggle = async () => {
    if (!canResolve) return;

    setSaving(true);
    setError(null);
    try {
      const newStatus: IssueStatus = issue.status === 'open' ? 'closed' : 'open';
      await updateIssue(issue.id, { status: newStatus });
      onIssueUpdated();
      onClose(); // Close dialog after successful status change
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  // Delete issue
  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteIssue(issue.id);
      onIssueDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete issue');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Get display name for a user
  const getDisplayName = (user?: IssueWithDetails['created_by_user']) => {
    if (!user) return 'Unknown';
    const pilot = user.pilots;
    if (pilot?.callsign) return pilot.callsign;
    return user.display_name || 'Unknown';
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isEditing) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            padding: '16px 24px',
            borderBottom: '1px solid #E5E7EB',
          }}
        >
          <div style={{ flex: 1, marginRight: '16px' }}>
            {isEditing ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '18px',
                  fontWeight: 600,
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                }}
              />
            ) : (
              <>
                <h2
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '18px',
                    fontWeight: 600,
                    color: issue.status === 'closed' ? '#6B7280' : '#1F2937',
                    textDecoration: issue.status === 'closed' ? 'line-through' : 'none',
                  }}
                >
                  {issue.title}
                </h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <IssueBadge type="status" value={issue.status} size="medium" />
                  <IssueBadge type="priority" value={issue.priority} size="medium" />
                </div>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#6B7280',
              cursor: 'pointer',
              borderRadius: '6px',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Error message */}
          {error && (
            <div
              style={{
                padding: '12px 24px',
                backgroundColor: '#FEE2E2',
                color: '#DC2626',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          )}

          {/* Description */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #E5E7EB' }}>
            {isEditing ? (
              <>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ marginTop: '16px' }}>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#374151',
                    }}
                  >
                    Priority
                  </label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as IssuePriority)}
                    style={{
                      padding: '10px 12px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    color: '#4B5563',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {issue.description || <em style={{ color: '#9CA3AF' }}>No description provided</em>}
                </p>
              </>
            )}
          </div>

          {/* Meta info */}
          <div
            style={{
              padding: '12px 24px',
              backgroundColor: '#F9FAFB',
              fontSize: '13px',
              color: '#6B7280',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '8px',
            }}
          >
            <div>
              <strong>Created by:</strong> {getDisplayName(issue.created_by_user)}
            </div>
            <div>
              <strong>Created:</strong> {formatDate(issue.created_at)}
            </div>
            {issue.status === 'closed' && (
              <>
                <div>
                  <strong>Resolved by:</strong> {getDisplayName(issue.resolved_by_user)}
                </div>
                <div>
                  <strong>Resolved:</strong> {issue.resolved_at ? formatDate(issue.resolved_at) : '-'}
                </div>
              </>
            )}
          </div>

          {/* Comments section header */}
          <div
            style={{
              padding: '12px 24px',
              borderTop: '1px solid #E5E7EB',
              borderBottom: '1px solid #E5E7EB',
              backgroundColor: '#F9FAFB',
              fontSize: '14px',
              fontWeight: 500,
              color: '#374151',
            }}
          >
            Comments ({commentCount})
          </div>

          {/* Comments */}
          <IssueComments
            issueId={issue.id}
            canComment={canComment}
            canDeleteComments={canResolve}
            onCommentCountChange={handleCommentCountChange}
          />
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 24px',
            borderTop: '1px solid #E5E7EB',
            backgroundColor: '#F9FAFB',
          }}
        >
          <div>
            {canResolve && !isEditing && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={saving || deleting}
                style={{
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 500,
                  border: '1px solid #FCA5A5',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  color: '#DC2626',
                  cursor: saving || deleting ? 'not-allowed' : 'pointer',
                }}
              >
                Delete
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            {isEditing ? (
              <>
                <button
                  onClick={handleCancelEdit}
                  disabled={saving}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 500,
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    backgroundColor: 'white',
                    color: '#374151',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editTitle.trim() || saving}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 500,
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: !editTitle.trim() || saving ? '#E5E7EB' : '#2563EB',
                    color: !editTitle.trim() || saving ? '#9CA3AF' : 'white',
                    cursor: !editTitle.trim() || saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                {canEdit && (
                  <button
                    onClick={handleStartEdit}
                    disabled={saving}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: 500,
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      backgroundColor: 'white',
                      color: '#374151',
                      cursor: saving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Edit
                  </button>
                )}
                {canResolve && (
                  <button
                    onClick={handleStatusToggle}
                    disabled={saving}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: 500,
                      border: 'none',
                      borderRadius: '6px',
                      backgroundColor: issue.status === 'open' ? '#047857' : '#2563EB',
                      color: 'white',
                      cursor: saving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {saving ? 'Updating...' : issue.status === 'open' ? 'Close Issue' : 'Reopen Issue'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Delete confirmation modal */}
        {showDeleteConfirm && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '12px',
            }}
          >
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '24px',
                maxWidth: '400px',
                textAlign: 'center',
              }}
            >
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600, color: '#1F2937' }}>
                Delete Issue?
              </h3>
              <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#6B7280' }}>
                This will permanently delete this issue and all its comments. This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: 500,
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    backgroundColor: 'white',
                    color: '#374151',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: 500,
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: '#DC2626',
                    color: 'white',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {deleting ? 'Deleting...' : 'Delete Issue'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default IssueDetailDialog;
