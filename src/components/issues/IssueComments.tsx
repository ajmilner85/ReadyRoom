import React, { useState, useEffect } from 'react';
import type { IssueCommentWithUser } from '../../types/IssueTypes';
import { getIssueComments, createComment, deleteComment } from '../../utils/issueService';

interface IssueCommentsProps {
  issueId: string;
  canComment: boolean;
  canDeleteComments: boolean;
  onCommentCountChange?: (count: number) => void;
}

export const IssueComments: React.FC<IssueCommentsProps> = ({
  issueId,
  canComment,
  canDeleteComments,
  onCommentCountChange,
}) => {
  const [comments, setComments] = useState<IssueCommentWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load comments
  useEffect(() => {
    const loadComments = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getIssueComments(issueId);
        setComments(data);
        onCommentCountChange?.(data.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load comments');
      } finally {
        setLoading(false);
      }
    };
    loadComments();
  }, [issueId, onCommentCountChange]);

  // Handle adding a comment
  const handleAddComment = async () => {
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await createComment(issueId, { content: newComment.trim() });
      // Reload comments to get the new one with user info
      const data = await getIssueComments(issueId);
      setComments(data);
      onCommentCountChange?.(data.length);
      setNewComment('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle deleting a comment
  const handleDeleteComment = async (commentId: string) => {
    if (deletingId) return;

    setDeletingId(commentId);
    try {
      await deleteComment(commentId);
      const newComments = comments.filter((c) => c.id !== commentId);
      setComments(newComments);
      onCommentCountChange?.(newComments.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete comment');
    } finally {
      setDeletingId(null);
    }
  };

  // Get display name for a user (prefer display_name which includes board number)
  const getDisplayName = (comment: IssueCommentWithUser) => {
    if (!comment.created_by_user) return 'Unknown';
    return comment.created_by_user.display_name || 'Unknown';
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  if (loading) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: 'var(--rr-text2)', fontSize: '13px' }}>
        Loading comments...
      </div>
    );
  }

  return (
    <div>
      {/* Comments list */}
      {comments.length > 0 ? (
        <div style={{ borderTop: '1px solid var(--rr-border)' }}>
          {comments.map((comment) => (
            <div
              key={comment.id}
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--rr-border)',
                backgroundColor: deletingId === comment.id ? 'var(--rr-panel2)' : 'var(--rr-panel)',
                opacity: deletingId === comment.id ? 0.5 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--rr-text)' }}>
                    {getDisplayName(comment)}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--rr-text3)' }}>{formatDate(comment.created_at)}</span>
                </div>
                {canDeleteComments && (
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    disabled={deletingId === comment.id}
                    title="Delete comment"
                    style={{
                      padding: '4px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: 'var(--rr-text3)',
                      cursor: deletingId === comment.id ? 'wait' : 'pointer',
                      borderRadius: '4px',
                      transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--rr-bad)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--rr-text3)')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--rr-text2)', whiteSpace: 'pre-wrap' }}>
                {comment.content}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: '24px 16px',
            textAlign: 'center',
            color: 'var(--rr-text3)',
            fontSize: '13px',
            borderTop: '1px solid var(--rr-border)',
          }}
        >
          No comments yet
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          style={{
            padding: '8px 16px',
            backgroundColor: 'rgba(224,82,78,.12)',
            color: 'var(--rr-bad)',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Add comment form */}
      {canComment && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--rr-border)', backgroundColor: 'var(--rr-panel2)' }}>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            rows={2}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--rr-border2)',
              borderRadius: '6px',
              fontSize: '13px',
              resize: 'vertical',
              minHeight: '60px',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              onClick={handleAddComment}
              disabled={!newComment.trim() || submitting}
              style={{
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 500,
                border: 'none',
                borderRadius: '6px',
                backgroundColor: !newComment.trim() || submitting ? 'var(--rr-panel3)' : 'var(--rr-accent)',
                color: !newComment.trim() || submitting ? 'var(--rr-text3)' : 'white',
                cursor: !newComment.trim() || submitting ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              {submitting ? 'Adding...' : 'Add Comment'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IssueComments;
