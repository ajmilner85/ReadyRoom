import React from 'react';

interface DeleteDivisionDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
  sectionTitle: string;
  divisionLabel: string;
  isPublished?: boolean;
}

export const DeleteDivisionDialog: React.FC<DeleteDivisionDialogProps> = ({
  onConfirm,
  onCancel,
  sectionTitle,
  divisionLabel,
  isPublished = false,
}) => {
  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: 'white',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
      width: '300px',
      zIndex: 1001,
      pointerEvents: 'auto'
    }}>
      <div style={{
        marginBottom: '16px',
        fontFamily: 'Inter',
        fontSize: '14px',
        color: '#64748B',
        textAlign: 'center'
      }}>
        {sectionTitle === 'Event' 
          ? `Are you sure you want to delete the "${divisionLabel}" event?`
          : `Are you sure you want to delete the ${sectionTitle} division "${divisionLabel}"?`
        }
        {sectionTitle === 'Event' && isPublished && (
          <div style={{
            marginTop: '12px',
            fontSize: '13px',
            color: '#DC2626',
            fontWeight: 500
          }}>
            Deleting this event will also delete the Discord event post, responses, and reminders.
          </div>
        )}
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px'
      }}>
        <button
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            backgroundColor: 'white',
            color: '#64748B',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#EF4444',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
};