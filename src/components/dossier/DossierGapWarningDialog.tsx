import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface DossierGapWarningDialogProps {
  isOpen: boolean;
  entryTitle: string;
  fieldLabel: string; // e.g. "status", "standing", "squadron assignment", "billet"
  canReopenPrevious: boolean; // whether there's an earlier entry that can be restored
  busy?: boolean;
  onCancel: () => void;
  onDeleteAnyway: () => void;
  onReopenAndDelete: () => void;
}

const buttonBase: React.CSSProperties = {
  flex: 1,
  padding: '10px 16px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  border: '1px solid',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

/**
 * Warns before deleting a dossier timeline entry that is the pilot's most
 * recent record for its field (status/standing/squadron/billet) when doing so
 * would leave nothing "current" — either because it's the only entry, or
 * because the entry before it was already closed out and nothing will
 * reopen it once this one is gone.
 */
const DossierGapWarningDialog: React.FC<DossierGapWarningDialogProps> = ({
  isOpen,
  entryTitle,
  fieldLabel,
  canReopenPrevious,
  busy = false,
  onCancel,
  onDeleteAnyway,
  onReopenAndDelete
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1002,
        padding: '20px'
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '440px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '24px 24px 16px 24px', textAlign: 'center' }}>
          <div style={{ color: '#F59E0B', marginBottom: '16px' }}>
            <AlertTriangle size={20} style={{ margin: '0 auto' }} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1F2937', margin: '0 0 12px 0' }}>
            This will remove the pilot's current {fieldLabel}
          </h2>
          {canReopenPrevious ? (
            <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: 1.5, margin: 0, textAlign: 'left' }}>
              Deleting "{entryTitle}" will leave this pilot without a current {fieldLabel}, because the entry
              right before it was already marked as finished — most likely from when this entry was first added.
              <br /><br />
              If this entry was a mistake (for example, a duplicate), the earlier entry is probably still correct
              and just needs to be marked as ongoing again.
            </p>
          ) : (
            <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: 1.5, margin: 0, textAlign: 'left' }}>
              Deleting "{entryTitle}" will leave this pilot with no {fieldLabel} at all going forward — there's
              no earlier entry to fall back on.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 24px 24px 24px' }}>
          {canReopenPrevious && (
            <button
              onClick={onReopenAndDelete}
              disabled={busy}
              style={{
                ...buttonBase,
                backgroundColor: '#3B82F6',
                borderColor: '#3B82F6',
                color: '#FFFFFF',
                opacity: busy ? 0.7 : 1,
                cursor: busy ? 'wait' : 'pointer'
              }}
              onMouseEnter={e => { if (!busy) e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = busy ? '0.7' : '1'; }}
            >
              Restore Earlier Entry & Delete This One
            </button>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onCancel}
              disabled={busy}
              style={{
                ...buttonBase,
                backgroundColor: '#FFFFFF',
                borderColor: '#D1D5DB',
                color: '#374151',
                opacity: busy ? 0.7 : 1,
                cursor: busy ? 'wait' : 'pointer'
              }}
              onMouseEnter={e => { if (!busy) e.currentTarget.style.backgroundColor = '#F9FAFB'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
            >
              Cancel
            </button>
            <button
              onClick={onDeleteAnyway}
              disabled={busy}
              style={{
                ...buttonBase,
                backgroundColor: '#FFFFFF',
                borderColor: '#FCA5A5',
                color: '#DC2626',
                opacity: busy ? 0.7 : 1,
                cursor: busy ? 'wait' : 'pointer'
              }}
              onMouseEnter={e => { if (!busy) e.currentTarget.style.backgroundColor = '#FEF2F2'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
            >
              Delete Anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DossierGapWarningDialog;
