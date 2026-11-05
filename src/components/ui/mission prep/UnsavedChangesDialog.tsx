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
        backgroundColor: 'var(--rr-panel)',
        borderRadius: '10px',
        padding: '24px',
        boxShadow: 'var(--rr-shadow)',
          border: '1px solid var(--rr-border)',
        zIndex: 1001,
        minWidth: '420px',
        maxWidth: '500px'
      }}>
        {/* Title */}
        <div style={{
          fontFamily: 'inherit',
          fontSize: '18px',
          fontWeight: 500,
          color: 'var(--rr-text)',
          marginBottom: '12px'
        }}>
          Unsaved Changes
        </div>

        {/* Body */}
        <div style={{
          fontFamily: 'inherit',
          fontSize: '14px',
          color: 'var(--rr-text2)',
          marginBottom: '24px',
          lineHeight: '1.5'
        }}>
          You have unsaved changes to this mission. What would you like to do
          before switching to <strong style={{ color: 'var(--rr-text)' }}>{targetEventName || 'another event'}</strong>?
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
              background: 'var(--rr-panel)',
              border: '1px solid var(--rr-border2)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--rr-text)',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--rr-panel2)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--rr-panel)'; }}
          >
            Cancel
          </button>
          <button
            onClick={onDiscardAndSwitch}
            style={{
              height: '38px',
              padding: '0 16px',
              background: 'var(--rr-panel)',
              border: '1px solid var(--rr-warn)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--rr-warn)',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(222,154,31,.14)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--rr-panel)'; }}
          >
            Discard Changes
          </button>
          <button
            onClick={handleSaveAndSwitch}
            disabled={isSaving}
            style={{
              height: '38px',
              padding: '0 16px',
              background: isSaving ? '#93C5FD' : 'var(--rr-accent)',
              border: 'none',
              borderRadius: '6px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 500,
              color: '#FFFFFF',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={e => { if (!isSaving) e.currentTarget.style.backgroundColor = 'var(--rr-accent)'; }}
            onMouseLeave={e => { if (!isSaving) e.currentTarget.style.backgroundColor = 'var(--rr-accent)'; }}
          >
            {isSaving ? 'Saving...' : 'Save & Switch'}
          </button>
        </div>
      </div>
    </>
  );
};

export default UnsavedChangesDialog;
