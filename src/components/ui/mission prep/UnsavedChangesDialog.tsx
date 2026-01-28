import React, { useState } from 'react';

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onSaveAndSwitch: () => Promise<void>;
  onDiscardAndSwitch: () => void;
  onCancel: () => void;
  targetEventName: string;
}

/**
 * Modal dialog that warns the user about unsaved changes when they try to
 * switch events while a debounced save is still pending.
 */
const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  isOpen,
  onSaveAndSwitch,
  onDiscardAndSwitch,
  onCancel,
  targetEventName
}) => {
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSaveAndSwitch = async () => {
    setIsSaving(true);
    try {
      await onSaveAndSwitch();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1000
      }} onClick={onCancel} />

      {/* Dialog */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        zIndex: 1001,
        minWidth: '420px',
        maxWidth: '500px'
      }}>
        {/* Title */}
        <div style={{
          fontFamily: 'Inter',
          fontSize: '18px',
          fontWeight: 500,
          color: '#1F2937',
          marginBottom: '12px'
        }}>
          Unsaved Changes
        </div>

        {/* Body */}
        <div style={{
          fontFamily: 'Inter',
          fontSize: '14px',
          color: '#6B7280',
          marginBottom: '24px',
          lineHeight: '1.5'
        }}>
          You have unsaved changes to this mission. What would you like to do
          before switching to <strong style={{ color: '#374151' }}>{targetEventName || 'another event'}</strong>?
        </div>

        {/* Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          <button
            onClick={onCancel}
            style={{
              height: '38px',
              padding: '0 16px',
              background: '#FFFFFF',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              cursor: 'pointer',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 500,
              color: '#374151',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F9FAFB'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
          >
            Cancel
          </button>
          <button
            onClick={onDiscardAndSwitch}
            style={{
              height: '38px',
              padding: '0 16px',
              background: '#FFFFFF',
              border: '1px solid #F59E0B',
              borderRadius: '6px',
              cursor: 'pointer',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 500,
              color: '#D97706',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#FFFBEB'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
          >
            Discard Changes
          </button>
          <button
            onClick={handleSaveAndSwitch}
            disabled={isSaving}
            style={{
              height: '38px',
              padding: '0 16px',
              background: isSaving ? '#93C5FD' : '#3B82F6',
              border: 'none',
              borderRadius: '6px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 500,
              color: '#FFFFFF',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={e => { if (!isSaving) e.currentTarget.style.backgroundColor = '#2563EB'; }}
            onMouseLeave={e => { if (!isSaving) e.currentTarget.style.backgroundColor = '#3B82F6'; }}
          >
            {isSaving ? 'Saving...' : 'Save & Switch'}
          </button>
        </div>
      </div>
    </>
  );
};

export default UnsavedChangesDialog;
