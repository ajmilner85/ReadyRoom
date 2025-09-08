import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Trash2, Edit3, FileText } from 'lucide-react';
import { getAllPosts, updatePost, deletePost, archivePost, unarchivePost } from '../../../utils/changeLogService';
import type { ChangeLogPostWithStats } from '../../../types/ChangeLogTypes';
import { ConfirmationDialog } from '../dialogs/ConfirmationDialog';

interface PostManagementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPostUpdated: () => void;
  primaryColor: string;
}

const PostManagementDialog: React.FC<PostManagementDialogProps> = ({
  isOpen,
  onClose,
  onPostUpdated,
  primaryColor,
}) => {
  const [posts, setPosts] = useState<ChangeLogPostWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingPost, setProcessingPost] = useState<string | null>(null);
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
  const [editingPost, setEditingPost] = useState<{
    id: string;
    title: string;
    content: string;
    customDate: string;
    customTime: string;
    useCustomDateTime: boolean;
    originalCreatedAt: string;
  } | null>(null);

  const loadPosts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getAllPosts(50);
      setPosts(response.posts);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Cannot GET')) {
        setPosts([]);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load posts');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleArchive = async (postId: string, isArchived: boolean) => {
    if (processingPost === postId) return;
    
    setConfirmDialog({
      isOpen: true,
      title: isArchived ? 'Unarchive Post' : 'Archive Post',
      message: `Are you sure you want to ${isArchived ? 'unarchive' : 'archive'} this post? This action can be undone.`,
      type: 'warning',
      icon: 'archive',
      action: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setProcessingPost(postId);
        try {
          if (isArchived) {
            await unarchivePost(postId);
          } else {
            await archivePost(postId);
          }
          await loadPosts();
          onPostUpdated(); // Refresh the main display
        } catch (err) {
          setError(err instanceof Error ? err.message : `Failed to ${isArchived ? 'unarchive' : 'archive'} post`);
        } finally {
          setProcessingPost(null);
        }
      }
    });
  };

  const handleDeletePost = async (postId: string) => {
    if (processingPost === postId) return;
    
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Post',
      message: 'Are you sure you want to delete this post? This action cannot be undone.',
      type: 'danger',
      icon: 'trash',
      action: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setProcessingPost(postId);
        try {
          await deletePost(postId);
          await loadPosts();
          onPostUpdated(); // Refresh the main display
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to delete post');
        } finally {
          setProcessingPost(null);
        }
      }
    });
  };

  const handleEditPost = (post: ChangeLogPostWithStats) => {
    const createdAt = new Date(post.created_at);
    const dateStr = createdAt.toISOString().split('T')[0];
    const timeStr = createdAt.toTimeString().split(' ')[0].slice(0, 5);
    
    setEditingPost({
      id: post.id,
      title: post.title,
      content: post.content,
      customDate: dateStr,
      customTime: timeStr,
      useCustomDateTime: false,
      originalCreatedAt: post.created_at,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingPost || processingPost === editingPost.id) return;

    setProcessingPost(editingPost.id);
    try {
      const updateData: any = {
        title: editingPost.title,
        content: editingPost.content,
      };

      // Add custom timestamp if specified
      if (editingPost.useCustomDateTime && editingPost.customDate) {
        const timeToUse = editingPost.customTime || '09:00';
        const customTimestamp = new Date(`${editingPost.customDate}T${timeToUse}:00.000Z`);
        updateData.created_at = customTimestamp.toISOString();
      }

      await updatePost(editingPost.id, updateData);
      setEditingPost(null);
      await loadPosts();
      onPostUpdated(); // Refresh the main display
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update post');
    } finally {
      setProcessingPost(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingPost(null);
  };

  useEffect(() => {
    if (isOpen) {
      loadPosts();
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
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '900px',
    maxHeight: '80vh',
    overflow: 'hidden',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
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
    color: '#1F2937',
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
    color: '#6B7280',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  };

  const contentStyle: React.CSSProperties = {
    padding: '24px',
    overflowY: 'auto',
    maxHeight: 'calc(80vh - 140px)',
  };

  const postItemStyle: React.CSSProperties = {
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px',
    backgroundColor: '#FFFFFF',
  };

  const postHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '12px',
  };

  const postTitleStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1F2937',
    margin: '0 0 4px 0',
    flex: 1,
  };

  const postContentPreviewStyle: React.CSSProperties = {
    fontSize: '14px',
    color: '#6B7280',
    margin: 0,
    maxHeight: '60px',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
  };

  const statusBadgeStyle = (isArchived: boolean): React.CSSProperties => ({
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
    backgroundColor: isArchived ? '#F3F4F6' : '#DEF7EC',
    color: isArchived ? '#6B7280' : '#047857',
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
    border: '1px solid #E5E7EB',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  };

  const statsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    fontSize: '14px',
    color: '#6B7280',
    marginTop: '8px',
  };

  const emptyStateStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#6B7280',
  };

  const editFormStyle: React.CSSProperties = {
    backgroundColor: '#F9FAFB',
    border: '2px solid #E5E7EB',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #D1D5DB',
    borderRadius: '4px',
    fontSize: '14px',
    marginBottom: '12px',
    boxSizing: 'border-box',
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: '120px',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  };

  const editButtonsStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid',
    transition: 'all 0.2s ease',
  };

  const saveButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: primaryColor,
    borderColor: primaryColor,
    color: '#FFFFFF',
  };

  const cancelButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    color: '#374151',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={titleStyle}>Manage Change Log Posts</h2>
          <button
            onClick={onClose}
            style={closeButtonStyle}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#F3F4F6';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {error && (
            <div style={{
              padding: '12px',
              backgroundColor: '#FEF2F2',
              borderRadius: '6px',
              border: '1px solid #FECACA',
              marginBottom: '20px',
            }}>
              <div style={{ color: '#DC2626', fontSize: '14px' }}>
                {error}
              </div>
            </div>
          )}

          {loading ? (
            <div style={emptyStateStyle}>
              <div style={{
                width: '24px',
                height: '24px',
                border: '2px solid #E5E7EB',
                borderTopColor: primaryColor,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px',
              }} />
              Loading posts...
            </div>
          ) : posts.length === 0 ? (
            <div style={emptyStateStyle}>
              <FileText size={48} style={{ color: '#9CA3AF', margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#4B5563', margin: '0 0 8px 0' }}>
                No posts found
              </h3>
              <p style={{ margin: 0 }}>Create your first change log post to get started.</p>
            </div>
          ) : (
            <>
              {/* Editing Form */}
              {editingPost && (
                <div style={editFormStyle}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600, color: '#1F2937' }}>
                    Edit Post
                  </h3>
                  <input
                    type="text"
                    value={editingPost.title}
                    onChange={e => setEditingPost({ ...editingPost, title: e.target.value })}
                    placeholder="Post Title"
                    style={inputStyle}
                    maxLength={500}
                  />
                  <textarea
                    value={editingPost.content}
                    onChange={e => setEditingPost({ ...editingPost, content: e.target.value })}
                    placeholder="Post Content (Markdown supported)"
                    style={textareaStyle}
                    maxLength={5000}
                  />
                  
                  {/* Custom Date/Time Field */}
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                      <input
                        type="checkbox"
                        id={`useCustomDateTime-${editingPost.id}`}
                        checked={editingPost.useCustomDateTime}
                        onChange={e => setEditingPost({ ...editingPost, useCustomDateTime: e.target.checked })}
                        style={{ marginRight: '8px' }}
                      />
                      <label htmlFor={`useCustomDateTime-${editingPost.id}`} style={{ fontSize: '14px', fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
                        Override publication date/time
                      </label>
                    </div>
                    
                    {editingPost.useCustomDateTime && (
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>Date</label>
                          <input
                            type="date"
                            value={editingPost.customDate}
                            onChange={e => setEditingPost({ ...editingPost, customDate: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '8px',
                              border: '1px solid #D1D5DB',
                              borderRadius: '4px',
                              fontSize: '14px',
                              boxSizing: 'border-box',
                            }}
                            max={new Date().toISOString().split('T')[0]}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>Time</label>
                          <input
                            type="time"
                            value={editingPost.customTime}
                            onChange={e => setEditingPost({ ...editingPost, customTime: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '8px',
                              border: '1px solid #D1D5DB',
                              borderRadius: '4px',
                              fontSize: '14px',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {editingPost.useCustomDateTime && (
                      <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                        Original: {new Date(editingPost.originalCreatedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                  
                  <div style={editButtonsStyle}>
                    <button
                      onClick={handleCancelEdit}
                      style={cancelButtonStyle}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = '#F9FAFB';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = '#FFFFFF';
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={processingPost === editingPost.id}
                      style={{
                        ...saveButtonStyle,
                        opacity: processingPost === editingPost.id ? 0.7 : 1,
                        cursor: processingPost === editingPost.id ? 'not-allowed' : 'pointer',
                      }}
                      onMouseEnter={e => {
                        if (processingPost !== editingPost.id) {
                          e.currentTarget.style.opacity = '0.9';
                        }
                      }}
                      onMouseLeave={e => {
                        if (processingPost !== editingPost.id) {
                          e.currentTarget.style.opacity = '1';
                        }
                      }}
                    >
                      {processingPost === editingPost.id ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              )}

              {/* Posts List */}
              {posts.map(post => (
                <div key={post.id} style={postItemStyle}>
                  <div style={postHeaderStyle}>
                    <div style={{ flex: 1 }}>
                      <h3 style={postTitleStyle}>{post.title}</h3>
                      <p style={postContentPreviewStyle}>
                        {post.content.replace(/[#*`\[\]()]/g, '').substring(0, 150)}
                        {post.content.length > 150 ? '...' : ''}
                      </p>
                      <div style={statsStyle}>
                        <span>{post.stats.thumbs_up_count + post.stats.thumbs_down_count} reactions</span>
                        <span>By {post.author_name || 'Unknown'}</span>
                        <span>Created {new Date(post.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    
                    <div style={actionsStyle}>
                      <span style={statusBadgeStyle(post.is_archived)}>
                        {post.is_archived ? 'archived' : 'active'}
                      </span>
                      
                      <button
                        onClick={() => handleEditPost(post)}
                        disabled={processingPost === post.id || editingPost?.id === post.id}
                        style={{
                          ...actionButtonStyle,
                          opacity: (processingPost === post.id || editingPost?.id === post.id) ? 0.5 : 1,
                          cursor: (processingPost === post.id || editingPost?.id === post.id) ? 'not-allowed' : 'pointer',
                        }}
                        onMouseEnter={e => {
                          if (processingPost !== post.id && editingPost?.id !== post.id) {
                            e.currentTarget.style.backgroundColor = '#EBF8FF';
                          }
                        }}
                        onMouseLeave={e => {
                          if (processingPost !== post.id && editingPost?.id !== post.id) {
                            e.currentTarget.style.backgroundColor = '#FFFFFF';
                          }
                        }}
                        title="Edit post"
                      >
                        <Edit3 size={16} style={{ color: '#3B82F6' }} />
                      </button>

                      <button
                        onClick={() => handleToggleArchive(post.id, post.is_archived)}
                        disabled={processingPost === post.id}
                        style={{
                          ...actionButtonStyle,
                          opacity: processingPost === post.id ? 0.5 : 1,
                          cursor: processingPost === post.id ? 'not-allowed' : 'pointer',
                        }}
                        onMouseEnter={e => {
                          if (processingPost !== post.id) {
                            e.currentTarget.style.backgroundColor = '#FEF3C7';
                          }
                        }}
                        onMouseLeave={e => {
                          if (processingPost !== post.id) {
                            e.currentTarget.style.backgroundColor = '#FFFFFF';
                          }
                        }}
                        title={post.is_archived ? 'Unarchive post' : 'Archive post'}
                      >
                        {post.is_archived ? <Eye size={16} style={{ color: '#D97706' }} /> : <EyeOff size={16} style={{ color: '#D97706' }} />}
                      </button>

                      <button
                        onClick={() => handleDeletePost(post.id)}
                        disabled={processingPost === post.id}
                        style={{
                          ...actionButtonStyle,
                          opacity: processingPost === post.id ? 0.5 : 1,
                          cursor: processingPost === post.id ? 'not-allowed' : 'pointer',
                        }}
                        onMouseEnter={e => {
                          if (processingPost !== post.id) {
                            e.currentTarget.style.backgroundColor = '#FEF2F2';
                          }
                        }}
                        onMouseLeave={e => {
                          if (processingPost !== post.id) {
                            e.currentTarget.style.backgroundColor = '#FFFFFF';
                          }
                        }}
                        title="Delete post"
                      >
                        <Trash2 size={16} style={{ color: '#EF4444' }} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
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
        confirmText={confirmDialog.type === 'danger' ? 'Delete' : confirmDialog.title.includes('Archive') ? 'Archive' : 'Unarchive'}
      />
    </div>
  );
};

export default PostManagementDialog;