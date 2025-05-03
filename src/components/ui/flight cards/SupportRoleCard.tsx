import React from 'react';

interface SupportRoleCardProps {
  id: string;
  callsign: string;
  assignedPilot?: {
    boardNumber: string;
    callsign: string;
    attendanceStatus?: 'accepted' | 'tentative' | 'declined';
    rollCallStatus?: 'Present' | 'Absent' | 'Tentative';
  };
  onDeleteRole: (id: string) => void;
  onEditRole: (id: string, callsign: string) => void;
}

const SupportRoleCard: React.FC<SupportRoleCardProps> = ({
  id,
  callsign,
  assignedPilot,
  onDeleteRole,
  onEditRole
}) => {
  return (
    <div 
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
        marginBottom: '12px',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
    >
      <div>
        <div style={{
          fontWeight: 600,
          fontSize: '16px',
          marginBottom: '4px'
        }}>
          {callsign}
        </div>
        
        <div style={{
          fontSize: '14px',
          color: assignedPilot ? '#1E293B' : '#94A3B8'
        }}>
          {assignedPilot ? assignedPilot.callsign : 'Unassigned'}
          
          {/* Show status badge if a pilot is assigned and has a status */}
          {assignedPilot && assignedPilot.attendanceStatus && (
            <span style={{
              display: 'inline-block',
              marginLeft: '8px',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '12px',
              backgroundColor: assignedPilot.attendanceStatus === 'tentative' ? '#FEF3C7' : 
                              assignedPilot.attendanceStatus === 'declined' ? '#FEE2E2' : '#DCFCE7',
              color: assignedPilot.attendanceStatus === 'tentative' ? '#92400E' : 
                    assignedPilot.attendanceStatus === 'declined' ? '#B91C1C' : '#166534'
            }}>
              {assignedPilot.attendanceStatus.charAt(0).toUpperCase() + assignedPilot.attendanceStatus.slice(1)}
            </span>
          )}
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => onEditRole(id, callsign)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#64748B',
            fontSize: '12px',
            padding: '4px 8px'
          }}
        >
          Edit
        </button>
        <button
          onClick={() => onDeleteRole(id)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#DC2626',
            fontSize: '12px',
            padding: '4px 8px'
          }}
        >          Delete
        </button>
      </div>
    </div>
  );
};

export default SupportRoleCard;

export default SupportRoleCard;

export default SupportRoleCard;

export default SupportRoleCard;
