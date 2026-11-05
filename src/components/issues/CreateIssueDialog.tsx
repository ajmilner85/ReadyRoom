import React, { useState } from 'react';
import type { IssueEntityType, IssuePriority, CreateIssueRequest } from '../../types/IssueTypes';
import { createIssue } from '../../utils/issueService';

interface CreateIssueDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onIssueCreated: () => void;
  entityType: IssueEntityType;
  entityId?: string;
  entityName?: string;
}

export const CreateIssueDialog: React.FC<CreateIssueDialogProps> = ({
  isOpen,
  onClose,
  onIssueCreated,
  entityType,
  entityId,
  entityName,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const request: CreateIssueRequest = {
        entity_type: entityType,
        entity_id: entityId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
      };

      await createIssue(request);
      onIssueCreated();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create issue');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setError(null);
    onClose();
  };

  const getEntityTypeLabel = () => {
    switch (entityType) {
      case 'syllabus_mission':
        return 'Mission';
      case 'syllabus':
        return 'Syllabus';
      case 'event':
        return 'Event';
      case 'app':
        return 'App';
      default:
        return 'Issue';
    }
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
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--rr-panel)',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflow: 'hidden',
          boxShadow: 'var(--rr-shadow-lg)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 24px',
            borderBottom: '1px solid var(--rr-border)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--rr-text)' }}>
            New {getEntityTypeLabel()} Issue
          </h2>
          <button
            onClick={handleClose}
            style={{
              padding: '8px',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--rr-text2)',
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

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px', overflowY: 'auto', maxHeight: 'calc(90vh - 140px)' }}>
            {/* Entity info */}
            {entityName && (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--rr-panel2)',
                  borderRadius: '6px',
                  marginBottom: '20px',
                  fontSize: '13px',
                  color: 'var(--rr-text2)',
                }}
              >
                <strong>{getEntityTypeLabel()}:</strong> {entityName}
              </div>
            )}

            {/* Error message */}
            {error && (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'rgba(224,82,78,.12)',
                  borderRadius: '6px',
                  marginBottom: '20px',
                  color: 'var(--rr-bad)',
                  fontSize: '13px',
                }}
              >
                {error}
              </div>
            )}

            {/* Title field */}
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--rr-text)',
                }}
              >
                Title <span style={{ color: 'var(--rr-bad)' }}>*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief description of the issue"
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Description field */}
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--rr-text)',
                }}
              >
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional details about the issue (optional)"
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Priority field */}
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--rr-text)',
                }}
              >
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as IssuePriority)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--rr-border2)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: 'var(--rr-panel)',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                <option value="low">Low - Minor issue, can wait</option>
                <option value="medium">Medium - Should be addressed</option>
                <option value="high">High - Important, needs attention soon</option>
                <option value="critical">Critical - Urgent, needs immediate action</option>
              </select>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              padding: '16px 24px',
              borderTop: '1px solid var(--rr-border)',
              backgroundColor: 'var(--rr-panel2)',
            }}
          >
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 500,
                border: '1px solid var(--rr-border2)',
                borderRadius: '6px',
                backgroundColor: 'var(--rr-panel)',
                color: 'var(--rr-text)',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || submitting}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 500,
                border: 'none',
                borderRadius: '6px',
                backgroundColor: !title.trim() || submitting ? 'var(--rr-panel3)' : 'var(--rr-accent)',
                color: !title.trim() || submitting ? 'var(--rr-text3)' : 'white',
                cursor: !title.trim() || submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Creating...' : 'Create Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateIssueDialog;
