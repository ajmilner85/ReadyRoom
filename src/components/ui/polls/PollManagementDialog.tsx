import React, { useState, useEffect } from 'react';
import { Icon } from '../primitives';
import { pollService } from '../../../utils/pollService';
import type { PollWithResults } from '../../../types/PollTypes';
import { ConfirmationDialog } from '../dialogs/ConfirmationDialog';
import EditPollDialog from './EditPollDialog';

interface PollManagementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPollDeleted: () => void;
  primaryColor: string;
}

const PollManagementDialog: React.FC<PollManagementDialogProps> = ({
  isOpen,
  onClose,
  onPollDeleted,
  primaryColor,
}) => {
  const [polls, setPolls] = useState<PollWithResults[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingPoll, setProcessingPoll] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
    type: 'danger' | 'warning';
    icon: 'trash' | 'archive';
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: () => {},
    type: 'danger',
    icon: 'trash'
  });
  const [editDialog, setEditDialog] = useState<{
    isOpen: boolean;
    poll: PollWithResults | null;
  }>({
    isOpen: false,
    poll: null
  });

  const loadPolls = async () => {
    try {
      setLoading(true);
      setError(null);
      const allPolls = await pollService.getAllPolls();
      setPolls(allPolls);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Cannot GET')) {
        setPolls([]);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load polls');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (pollId: string, isActive: boolean) => {
    if (processingPoll === pollId) return;
    
    setProcessingPoll(pollId);
    try {
      if (isActive) {
        await pollService.deactivatePoll(pollId);
      } else {
        await pollService.activatePoll(pollId);
      }
      await loadPolls();
      onPollDeleted(); // Refresh the main poll display
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${isActive ? 'deactivate' : 'activate'} poll`);
    } finally {
      setProcessingPoll(null);
    }
  };

  const handleArchivePoll = async (pollId: string) => {
    if (processingPoll === pollId) return;
    
    setConfirmDialog({
      isOpen: true,
      title: 'Archive Poll',
      message: 'Are you sure you want to archive this poll? This action can be undone.',
      type: 'warning',
      icon: 'archive',
      action: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setProcessingPoll(pollId);
        try {
          await pollService.archivePoll(pollId);
          await loadPolls();
          onPollDeleted(); // Refresh the main poll display
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to archive poll');
        } finally {
          setProcessingPoll(null);
        }
      }
    });
  };

  const handleDeletePoll = async (pollId: string) => {
    if (processingPoll === pollId) return;
    
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Poll',
      message: 'Are you sure you want to delete this poll? This action cannot be undone.',
      type: 'danger',
      icon: 'trash',
      action: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setProcessingPoll(pollId);
        try {
          await pollService.deletePoll(pollId);
          await loadPolls();
          onPollDeleted(); // Refresh the main poll display
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to delete poll');
        } finally {
          setProcessingPoll(null);
        }
      }
    });
  };

  const handleEditPoll = (poll: PollWithResults) => {
    setEditDialog({
      isOpen: true,
      poll: poll
    });
  };

  const handlePollUpdated = async () => {
    setEditDialog({ isOpen: false, poll: null });
    await loadPolls();
    onPollDeleted(); // Refresh the main poll display
  };

  useEffect(() => {
    if (isOpen) {
      loadPolls();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  };

  const dialogStyle: React.CSSProperties = {
    backgroundColor: 'var(--rr-panel)',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '800px',
    maxHeight: '80vh',
    overflow: 'hidden',
    boxShadow: 'var(--rr-shadow-lg)',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px 24px 0 24px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 600,
    color: 'var(--rr-text)',
    margin: 0,
  };

  const closeButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--rr-text2)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  };

  const contentStyle: React.CSSProperties = {
    padding: '24px',
    overflowY: 'auto',
    maxHeight: 'calc(80vh - 140px)',
  };

  const pollItemStyle: React.CSSProperties = {
    border: '1px solid var(--rr-border)',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px',
    backgroundColor: 'var(--rr-panel)',
  };

  const pollHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '12px',
  };

  const pollTitleStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--rr-text)',
    margin: '0 0 4px 0',
    flex: 1,
  };

  const pollDescriptionStyle: React.CSSProperties = {
    fontSize: '14px',
    color: 'var(--rr-text2)',
    margin: 0,
  };

  const statusBadgeStyle = (status: string): React.CSSProperties => ({
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
    backgroundColor: status === 'active' ? '#DEF7EC' : status === 'archived' ? 'var(--rr-panel2)' : 'rgba(224,82,78,.12)',
    color: status === 'active' ? 'var(--rr-good)' : status === 'archived' ? 'var(--rr-text2)' : 'var(--rr-bad)',
  });

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
    marginLeft: '16px',
  };

  const actionButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: '1px solid var(--rr-border)',
    backgroundColor: 'var(--rr-panel)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  };

  const statsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    fontSize: '14px',
    color: 'var(--rr-text2)',
    marginTop: '8px',
  };

  const emptyStateStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '40px 20px',
    color: 'var(--rr-text2)',
  };

  const getStatusText = (poll: PollWithResults): string => {
    if (poll.archived_at) return 'archived';
    if (poll.is_active) return 'active';
    return 'inactive';
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={titleStyle}>Manage Polls</h2>
          <button
            onClick={onClose}
            style={closeButtonStyle}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {error && (
            <div style={{
              padding: '12px',
              backgroundColor: 'rgba(224,82,78,.12)',
              borderRadius: '6px',
              border: '1px solid var(--rr-bad)',
              marginBottom: '20px',
            }}>
              <div style={{ color: 'var(--rr-bad)', fontSize: '14px' }}>
                {error}
              </div>
            </div>
          )}

          {loading ? (
            <div style={emptyStateStyle}>
              <div style={{
                width: '24px',
                height: '24px',
                border: '2px solid var(--rr-border)',
                borderTopColor: primaryColor,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px',
              }} />
              Loading polls...
            </div>
          ) : polls.length === 0 ? (
            <div style={emptyStateStyle}>
              <Icon name="reports" size={48} style={{ color: 'var(--rr-text3)', margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--rr-text2)', margin: '0 0 8px 0' }}>
                No polls found
              </h3>
              <p style={{ margin: 0 }}>Create your first poll to get started.</p>
            </div>
          ) : (
            polls.map(poll => (
              <div key={poll.id} style={pollItemStyle}>
                <div style={pollHeaderStyle}>
                  <div style={{ flex: 1 }}>
                    <h3 style={pollTitleStyle}>{poll.title}</h3>
                    {poll.description && (
                      <p style={pollDescriptionStyle}>{poll.description}</p>
                    )}
                    <div style={statsStyle}>
                      <span>{(poll as any).stats?.total_votes || 0} votes</span>
                      <span>{poll.options.length} options</span>
                      <span>Created {new Date(poll.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  <div style={actionsStyle}>
                    <span style={statusBadgeStyle(getStatusText(poll))}>
                      {getStatusText(poll)}
                    </span>
                    
                    {!poll.archived_at && (
                      <>
                        <button
                          onClick={() => handleEditPoll(poll)}
                          disabled={processingPoll === poll.id}
                          style={{
                            ...actionButtonStyle,
                            opacity: processingPoll === poll.id ? 0.5 : 1,
                            cursor: processingPoll === poll.id ? 'not-allowed' : 'pointer',
                          }}
                          onMouseEnter={e => {
                            if (processingPoll !== poll.id) {
                              e.currentTarget.style.backgroundColor = '#EBF8FF';
                            }
                          }}
                          onMouseLeave={e => {
                            if (processingPoll !== poll.id) {
                              e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
                            }
                          }}
                          title="Edit poll"
                        >
                          <Icon name="edit" size={16} style={{ color: 'var(--rr-accent-text)' }} />
                        </button>

                        <button
                          onClick={() => handleToggleActive(poll.id, poll.is_active)}
                          disabled={processingPoll === poll.id}
                          style={{
                            ...actionButtonStyle,
                            opacity: processingPoll === poll.id ? 0.5 : 1,
                            cursor: processingPoll === poll.id ? 'not-allowed' : 'pointer',
                          }}
                          onMouseEnter={e => {
                            if (processingPoll !== poll.id) {
                              e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
                            }
                          }}
                          onMouseLeave={e => {
                            if (processingPoll !== poll.id) {
                              e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
                            }
                          }}
                          title={poll.is_active ? 'Deactivate poll' : 'Activate poll'}
                        >
                          {poll.is_active ? <Icon name="eyeOff" size={16} /> : <Icon name="eye" size={16} />}
                        </button>

                        <button
                          onClick={() => handleArchivePoll(poll.id)}
                          disabled={processingPoll === poll.id}
                          style={{
                            ...actionButtonStyle,
                            opacity: processingPoll === poll.id ? 0.5 : 1,
                            cursor: processingPoll === poll.id ? 'not-allowed' : 'pointer',
                          }}
                          onMouseEnter={e => {
                            if (processingPoll !== poll.id) {
                              e.currentTarget.style.backgroundColor = 'rgba(222,154,31,.14)';
                            }
                          }}
                          onMouseLeave={e => {
                            if (processingPoll !== poll.id) {
                              e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
                            }
                          }}
                          title="Archive poll"
                        >
                          <Icon name="archive" size={16} style={{ color: 'var(--rr-warn)' }} />
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => handleDeletePoll(poll.id)}
                      disabled={processingPoll === poll.id}
                      style={{
                        ...actionButtonStyle,
                        opacity: processingPoll === poll.id ? 0.5 : 1,
                        cursor: processingPoll === poll.id ? 'not-allowed' : 'pointer',
                      }}
                      onMouseEnter={e => {
                        if (processingPoll !== poll.id) {
                          e.currentTarget.style.backgroundColor = 'rgba(224,82,78,.12)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (processingPoll !== poll.id) {
                          e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
                        }
                      }}
                      title="Delete poll"
                    >
                      <Icon name="trash" size={16} style={{ color: 'var(--rr-bad)' }} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmDialog.isOpen}
        onConfirm={confirmDialog.action}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        icon={confirmDialog.icon}
        confirmText={confirmDialog.type === 'danger' ? 'Delete' : 'Archive'}
      />

      {/* Edit Poll Dialog */}
      <EditPollDialog
        isOpen={editDialog.isOpen}
        poll={editDialog.poll}
        onClose={() => setEditDialog({ isOpen: false, poll: null })}
        onPollUpdated={handlePollUpdated}
        primaryColor={primaryColor}
      />
    </div>
  );
};

export default PollManagementDialog;