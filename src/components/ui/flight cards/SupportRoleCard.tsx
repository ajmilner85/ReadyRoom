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
        <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>
          {callsign}
        </div>
        <div style={{ fontSize: '14px', color: assignedPilot ? '#1E293B' : '#94A3B8' }}>
          {assignedPilot ? assignedPilot.callsign : 'Unassigned'}
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
        >
          Delete
        </button>
      </div>
    </div>
  );
};

export default SupportRoleCard;
