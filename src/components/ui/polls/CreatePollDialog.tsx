import React, { useState } from 'react';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import { pollService } from '../../../utils/pollService';
import type { CreatePollRequest } from '../../../types/PollTypes';

interface CreatePollDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPollCreated: () => void;
  primaryColor: string;
}

interface PollOption {
  title: string;
  description?: string;
  order: number;
}

const CreatePollDialog: React.FC<CreatePollDialogProps> = ({
  isOpen,
  onClose,
  onPollCreated,
  primaryColor,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<PollOption[]>([
    { title: '', description: '', order: 1 },
    { title: '', description: '', order: 2 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError('Poll title is required');
      return;
    }

    const validOptions = options.filter(opt => opt.title.trim().length > 0);
    if (validOptions.length < 2) {
      setError('At least 2 options are required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const pollData: CreatePollRequest = {
        title: title.trim(),
        description: description.trim() || undefined,
        options: validOptions.map((opt, index) => ({
          title: opt.title.trim(),
          description: opt.description?.trim() || undefined,
          order: index + 1,
        })),
      };

      await pollService.createPoll(pollData);
      onPollCreated();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create poll');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setOptions([
      { title: '', description: '', order: 1 },
      { title: '', description: '', order: 2 },
    ]);
    setError(null);
    onClose();
  };

  const addOption = () => {
    setOptions(prev => [
      ...prev,
      { title: '', description: '', order: prev.length + 1 }
    ]);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return; // Minimum 2 options
    
    setOptions(prev => prev.filter((_, i) => i !== index));
  };

  const updateOptionTitle = (index: number, title: string) => {
    setOptions(prev => prev.map((opt, i) => 
      i === index ? { ...opt, title } : opt
    ));
  };

  const updateOptionDescription = (index: number, description: string) => {
    setOptions(prev => prev.map((opt, i) => 
      i === index ? { ...opt, description } : opt
    ));
  };

  const moveOption = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= options.length) return;
    
    setOptions(prev => {
      const newOptions = [...prev];
      const [moved] = newOptions.splice(fromIndex, 1);
      newOptions.splice(toIndex, 0, moved);
      
      // Update order numbers
      return newOptions.map((opt, i) => ({ ...opt, order: i + 1 }));
    });
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
    maxWidth: '600px',
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

  const optionTitleStyle: React.CSSProperties = {
    ...inputStyle,
    margin: '0 0 8px 0',
    fontWeight: 500,
  };

  const optionDescriptionStyle: React.CSSProperties = {
    ...inputStyle,
    margin: 0,
    fontSize: '13px',
    minHeight: '60px',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: '80px',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  };

  const optionContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    marginBottom: '16px',
    padding: '12px',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    backgroundColor: '#FAFAFA',
  };

  const optionFieldsStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  };

  const dragHandleStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    color: '#9CA3AF',
    cursor: 'grab',
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (dragIndex !== dropIndex) {
      moveOption(dragIndex, dropIndex);
    }
  };

  const removeButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: '1px solid #E5E7EB',
    backgroundColor: '#FFFFFF',
    color: '#EF4444',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  };

  const addButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    border: '1px dashed #D1D5DB',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#6B7280',
    cursor: 'pointer',
    fontSize: '14px',
    width: '100%',
    marginTop: '8px',
    transition: 'all 0.2s ease',
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

  return (
    <div style={overlayStyle} onClick={handleClose}>
      <div style={dialogStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={titleStyle}>Create New Poll</h2>
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
                Poll Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="What should we prioritize next?"
                style={inputStyle}
                maxLength={500}
              />
            </div>

            {/* Description Field */}
            <div style={fieldStyle}>
              <label style={labelStyle}>
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Provide additional context about this poll..."
                style={textareaStyle}
                maxLength={2000}
              />
            </div>

            {/* Options */}
            <div style={fieldStyle}>
              <label style={labelStyle}>
                Options * (at least 2 required)
              </label>
              
              {options.map((option, index) => (
                <div 
                  key={index} 
                  style={optionContainerStyle}
                  draggable={true}
                  onDragStart={e => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, index)}
                >
                  <div 
                    style={dragHandleStyle}
                    onMouseDown={e => {
                      e.currentTarget.style.cursor = 'grabbing';
                    }}
                    onMouseUp={e => {
                      e.currentTarget.style.cursor = 'grab';
                    }}
                  >
                    <GripVertical size={16} />
                  </div>
                  
                  <div style={optionFieldsStyle}>
                    <input
                      type="text"
                      value={option.title}
                      onChange={e => updateOptionTitle(index, e.target.value)}
                      placeholder={`Option ${index + 1} Title`}
                      style={optionTitleStyle}
                      maxLength={200}
                    />
                    <textarea
                      value={option.description || ''}
                      onChange={e => updateOptionDescription(index, e.target.value)}
                      placeholder={`Description for option ${index + 1} (optional)`}
                      style={optionDescriptionStyle}
                      maxLength={500}
                    />
                  </div>
                  
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      style={removeButtonStyle}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = '#FEF2F2';
                        e.currentTarget.style.borderColor = '#FECACA';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = '#FFFFFF';
                        e.currentTarget.style.borderColor = '#E5E7EB';
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              
              <button
                type="button"
                onClick={addOption}
                style={addButtonStyle}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB';
                  e.currentTarget.style.borderColor = '#9CA3AF';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderColor = '#D1D5DB';
                }}
              >
                <Plus size={16} />
                Add Option
              </button>
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
                  Creating...
                </>
              ) : (
                'Create Poll'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreatePollDialog;