import React from 'react';

interface SupportRoleCardProps {
  id: string;
  callsign: string;
  pilots?: Array<{
    boardNumber: string;
    callsign: string;
    dashNumber: string;
    attendanceStatus?: 'accepted' | 'tentative' | 'declined';
    rollCallStatus?: 'Present' | 'Absent' | 'Tentative';
  }>;
  onDeleteRole: (id: string) => void;
  onEditRole: (id: string, callsign: string) => void;
}

const SupportRoleCard: React.FC<SupportRoleCardProps> = ({
  id,
  callsign,
  pilots = [],
  onDeleteRole,
  onEditRole
}) => {
  // Find the first assigned pilot if any
  const assignedPilot = pilots.find(p => p.boardNumber && p.callsign);

  return (
    <div 
      style={{
        backgroundColor: 'var(--rr-panel)',
        borderRadius: '8px',
        padding: '16px',
        boxShadow: 'var(--rr-shadow)',
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
        <div style={{ fontSize: '14px', color: assignedPilot ? 'var(--rr-text)' : 'var(--rr-text3)' }}>
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
            color: 'var(--rr-text2)',
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
            color: 'var(--rr-bad)',
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
