import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatDossierDate } from './dossierStyles';

interface DossierGapWarningDialogProps {
  isOpen: boolean;
  entryTitle: string;
  fieldLabel: string; // e.g. "status", "standing", "squadron assignment", "billet"
  /** Display value of the earlier entry (e.g. "Active"), when known */
  previousLabel?: string | null;
  /** Deleted entry's end date — the earlier entry can be extended to cover the deleted period */
  extendToDate?: string | null;
  /** No later entry exists — the earlier entry can be made ongoing (end date removed) */
  canExtendOpenEnded?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onDeleteAnyway: () => void;
  /** Extend the earlier entry to the given end date (null = open-ended), then delete */
  onExtendPreviousAndDelete: (endDate: string | null) => void;
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
 * Warns before deleting a dossier timeline entry that would leave a hole in
 * the pilot's history for its field (status/standing/squadron/billet):
 * either nothing "current" (deleting the most recent entry when the one
 * before it was closed out), or a gap in past coverage (deleting a duplicate
 * middle entry whose predecessor was closed when the duplicate was created).
 * Offers to repair the earlier entry as part of the delete.
 */
const DossierGapWarningDialog: React.FC<DossierGapWarningDialogProps> = ({
  isOpen,
  entryTitle,
  fieldLabel,
  previousLabel = null,
  extendToDate = null,
  canExtendOpenEnded = false,
  busy = false,
  onCancel,
  onDeleteAnyway,
  onExtendPreviousAndDelete
}) => {
  if (!isOpen) return null;

  const hasRepairOptions = canExtendOpenEnded || !!extendToDate;
  const earlierEntryName = previousLabel ? `"${previousLabel}"` : 'earlier';

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
          maxWidth: '460px',
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
            {canExtendOpenEnded
              ? `This will remove the pilot's current ${fieldLabel}`
              : `This will leave a gap in the pilot's ${fieldLabel} history`}
          </h2>
          {hasRepairOptions ? (
            <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: 1.5, margin: 0, textAlign: 'left' }}>
              The entry right before "{entryTitle}" was marked as finished — most likely from when this entry
              was first added. Deleting this entry on its own leaves that period of the pilot's {fieldLabel} history
              uncovered.
              <br /><br />
              If this entry was a mistake (for example, a duplicate), the {earlierEntryName} entry before it is
              probably still correct and just needs its end date adjusted to close the gap.
            </p>
          ) : (
            <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: 1.5, margin: 0, textAlign: 'left' }}>
              Deleting "{entryTitle}" will leave this pilot with no {fieldLabel} at all going forward — there's
              no earlier entry to fall back on.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 24px 24px 24px' }}>
          {canExtendOpenEnded && (
            <button
              onClick={() => onExtendPreviousAndDelete(null)}
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
              Make the {earlierEntryName} entry ongoing & delete this one
            </button>
          )}
          {extendToDate && (
            <button
              onClick={() => onExtendPreviousAndDelete(extendToDate)}
              disabled={busy}
              style={{
                ...buttonBase,
                backgroundColor: canExtendOpenEnded ? '#FFFFFF' : '#3B82F6',
                borderColor: '#3B82F6',
                color: canExtendOpenEnded ? '#3B82F6' : '#FFFFFF',
                opacity: busy ? 0.7 : 1,
                cursor: busy ? 'wait' : 'pointer'
              }}
              onMouseEnter={e => { if (!busy) e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = busy ? '0.7' : '1'; }}
            >
              Extend the {earlierEntryName} entry to {formatDossierDate(extendToDate)} & delete this one
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
