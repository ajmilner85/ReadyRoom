import React, { useState } from 'react';
import { X } from 'lucide-react';
import { createPost } from '../../../utils/changeLogService';
import type { CreatePostRequest } from '../../../types/ChangeLogTypes';

interface CreatePostDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated: () => void;
  primaryColor: string;
}

const CreatePostDialog: React.FC<CreatePostDialogProps> = ({
  isOpen,
  onClose,
  onPostCreated,
  primaryColor,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [useCustomDateTime, setUseCustomDateTime] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError('Post title is required');
      return;
    }

    if (!content.trim()) {
      setError('Post content is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const postData: CreatePostRequest = {
        title: title.trim(),
        content: content.trim(),
      };

      // Add custom timestamp if specified
      if (useCustomDateTime && customDate) {
        const timeToUse = customTime || '09:00';
        const customTimestamp = new Date(`${customDate}T${timeToUse}:00.000Z`);
        postData.created_at = customTimestamp.toISOString();
      }

      await createPost(postData);
      onPostCreated();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setContent('');
    setCustomDate('');
    setCustomTime('');
    setUseCustomDateTime(false);
    setError(null);
    onClose();
  };

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
    maxWidth: '700px',
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

  const fieldStyle: React.CSSProperties = {
    marginBottom: '20px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '6px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px',
    border: '1px solid #D1D5DB',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#1F2937',
    transition: 'border-color 0.2s ease',
    boxSizing: 'border-box',
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: '500px', // 2.5x taller (200px * 2.5 = 500px)
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  };

  const footerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px 24px 24px',
    borderTop: '1px solid #F3F4F6',
  };

  const buttonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    border: '1px solid',
  };

  const cancelButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    color: '#374151',
  };

  const createButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: primaryColor,
    borderColor: primaryColor,
    color: '#FFFFFF',
  };

  const helperTextStyle: React.CSSProperties = {
    fontSize: '12px',
    color: '#6B7280',
    marginTop: '4px',
  };

  return (
    <div style={overlayStyle} onClick={handleClose}>
      <div style={dialogStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={titleStyle}>Create Change Log Post</h2>
          <button
            onClick={handleClose}
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
        <form onSubmit={handleSubmit}>
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

            {/* Title Field */}
            <div style={fieldStyle}>
              <label style={labelStyle}>
                Post Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="ReadyRoom v2.1 - New Features Released"
                style={inputStyle}
                maxLength={500}
              />
            </div>

            {/* Content Field */}
            <div style={fieldStyle}>
              <label style={labelStyle}>
                Content *
              </label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="## What's New

- **Enhanced Event Management**: Improved squadron event organization tools
- **Mission Planning Updates**: Streamlined flight assignment process  
- **Discord Integration**: Better sync with Discord servers
- **Performance Improvements**: Faster loading and better responsiveness

## Bug Fixes
- Fixed issue with qualification tracking
- Resolved sync problems with Discord
- Improved error handling

Let us know what you think about these updates!"
                style={textareaStyle}
                maxLength={5000}
              />
              <div style={helperTextStyle}>
                Supports Markdown formatting (headers, lists, bold, italic, links, etc.)
              </div>
            </div>

            {/* Custom Date/Time Field */}
            <div style={fieldStyle}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                <input
                  type="checkbox"
                  id="useCustomDateTime"
                  checked={useCustomDateTime}
                  onChange={e => setUseCustomDateTime(e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                <label htmlFor="useCustomDateTime" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
                  Override publication date/time
                </label>
              </div>
              
              {useCustomDateTime && (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Date</label>
                    <input
                      type="date"
                      value={customDate}
                      onChange={e => setCustomDate(e.target.value)}
                      style={inputStyle}
                      max={new Date().toISOString().split('T')[0]} // Can't set future dates
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Time</label>
                    <input
                      type="time"
                      value={customTime}
                      onChange={e => setCustomTime(e.target.value)}
                      style={inputStyle}
                      placeholder="09:00"
                    />
                  </div>
                </div>
              )}
              
              {useCustomDateTime && (
                <div style={helperTextStyle}>
                  Leave time blank to default to 09:00. Date/time will be converted to UTC.
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={footerStyle}>
            <button
              type="button"
              onClick={handleClose}
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
              type="submit"
              disabled={isSubmitting}
              style={{
                ...createButtonStyle,
                opacity: isSubmitting ? 0.7 : 1,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={e => {
                if (!isSubmitting) {
                  e.currentTarget.style.opacity = '0.9';
                }
              }}
              onMouseLeave={e => {
                if (!isSubmitting) {
                  e.currentTarget.style.opacity = '1';
                }
              }}
            >
              {isSubmitting ? (
                <>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid currentColor',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                  Publishing...
                </>
              ) : (
                'Publish Post'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreatePostDialog;