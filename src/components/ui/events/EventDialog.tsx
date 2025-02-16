import React, { useState } from 'react';
import { X } from 'lucide-react';

interface EventDialogProps {
  onSave: (eventData: {
    title: string;
    description: string;
    datetime: string;
    restrictedTo?: string[];
  }) => void;
  onCancel: () => void;
  initialData?: {
    title: string;
    description: string;
    datetime: string;
    restrictedTo?: string[];
  };
}

export const EventDialog: React.FC<EventDialogProps> = ({
  onSave,
  onCancel,
  initialData
}) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [datetime, setDatetime] = useState(initialData?.datetime || '');
  const [restrictedTo, setRestrictedTo] = useState<string[]>(initialData?.restrictedTo || []);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError('Please enter an event title');
      return;
    }

    if (!datetime) {
      setError('Please select a date and time');
      return;
    }

    onSave({
      title: title.trim(),
      description: description.trim(),
      datetime,
      restrictedTo: restrictedTo.length > 0 ? restrictedTo : undefined
    });
  };

  const roleOptions = ['Cadre', 'Staff', 'All Pilots'];

  return (
    <>
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000
        }}
        onClick={onCancel}
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        backgroundColor: '#FFFFFF',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        borderRadius: '8px',
        zIndex: 1001
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid #E2E8F0'
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: '#0F172A'
          }}>
            {initialData ? 'Edit Event' : 'Create New Event'}
          </h2>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} color="#64748B" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Event Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
                placeholder="Enter event title"
              />
            </div>

            <div style={{ marginBottom: '16px', display: 'flex', gap: '16px' }}>
              <div style={{ flex: '0 0 auto' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Date & Time (Eastern Time)
                </label>
                <input
                  type="datetime-local"
                  value={datetime}
                  onChange={(e) => setDatetime(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    width: 'auto'
                  }}
                />
              </div>

              <div style={{ flex: '1' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Eligibility
                </label>
                <select
                  multiple
                  value={restrictedTo}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions, option => option.value);
                    setRestrictedTo(values);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                >
                  {roleOptions.map(role => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <div style={{
                  fontSize: '12px',
                  color: '#64748B',
                  marginTop: '4px'
                }}>
                  Hold Ctrl/Cmd to select multiple roles. Leave empty for no restrictions.
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  minHeight: '120px',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
                placeholder="Enter event description"
              />
            </div>

            {error && (
              <div style={{
                color: '#EF4444',
                fontSize: '14px',
                marginBottom: '16px'
              }}>
                {error}
              </div>
            )}
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            borderTop: '1px solid #E2E8F0',
            padding: '16px 24px'
          }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                backgroundColor: 'white',
                color: '#64748B',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: '#2563EB',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              {initialData ? 'Update Event' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

export default EventDialog;