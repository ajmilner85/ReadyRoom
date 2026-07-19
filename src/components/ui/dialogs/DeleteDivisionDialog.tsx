import React from 'react';

interface DeleteDivisionDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
  sectionTitle: string;
  divisionLabel: string;
  isPublished?: boolean;
  /** Event has already started / cycle has ended - it will be archived
      (recoverable), and Discord posts are left in place */
  isPast?: boolean;
}

export const DeleteDivisionDialog: React.FC<DeleteDivisionDialogProps> = ({
  onConfirm,
  onCancel,
  sectionTitle,
  divisionLabel,
  isPublished = false,
  isPast = false,
}) => {
  // Events/cycles with history are archived (soft-deleted, restorable by an
  // administrator) rather than permanently deleted; the dialog states exactly
  // what is and isn't recoverable for each case.
  const archives = isPublished || isPast;
  const verb = isPast ? 'archive' : 'delete';

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
      width: '320px',
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
          ? `Are you sure you want to ${verb} the "${divisionLabel}" event?`
          : sectionTitle === 'Cycle'
            ? `Are you sure you want to ${verb} the cycle "${divisionLabel}"?`
            : `Are you sure you want to delete the ${sectionTitle} division "${divisionLabel}"?`
        }
        {sectionTitle === 'Event' && isPast && (
          <div style={{
            marginTop: '12px',
            fontSize: '13px',
            color: '#475569',
            fontWeight: 500,
            textAlign: 'left'
          }}>
            This event has already taken place. It will be archived: attendance,
            training records, and Discord posts are all preserved, and an
            administrator can restore it.
          </div>
        )}
        {sectionTitle === 'Event' && isPublished && !isPast && (
          <div style={{
            marginTop: '12px',
            fontSize: '13px',
            color: '#DC2626',
            fontWeight: 500,
            textAlign: 'left'
          }}>
            This event is published to Discord. Deleting it removes the Discord
            post and cancels reminders — that cannot be undone. Responses
            already collected are preserved, and the event itself is archived
            and restorable by an administrator.
          </div>
        )}
        {sectionTitle === 'Cycle' && isPast && (
          <div style={{
            marginTop: '12px',
            fontSize: '13px',
            color: '#475569',
            fontWeight: 500,
            textAlign: 'left'
          }}>
            This cycle has ended. It will be archived with its records intact,
            and an administrator can restore it.
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
            backgroundColor: archives && isPast ? '#475569' : '#EF4444',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          {isPast ? 'Archive' : 'Delete'}
        </button>
      </div>
    </div>
  );
};
