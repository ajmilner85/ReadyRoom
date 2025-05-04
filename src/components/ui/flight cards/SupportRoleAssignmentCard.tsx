import React, { useState, memo, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import AircraftTile from './AircraftTile';
import { Edit2, Trash2 } from 'lucide-react';
import type { Pilot } from '../../../types/PilotTypes';

interface SupportRoleAssignmentCardProps {
  id: string;
  callsign: string;
  pilots: Array<{
    boardNumber: string;
    callsign: string;
    dashNumber: string;
    attendanceStatus?: 'accepted' | 'tentative' | 'declined';
    rollCallStatus?: 'Present' | 'Absent' | 'Tentative';
  }>;
  onDeleteRole?: (id: string) => void;
  onEditRole?: (id: string, callsign: string) => void;
}

const SupportRoleAssignmentCard: React.FC<SupportRoleAssignmentCardProps> = ({
  id,
  callsign,
  pilots,
  onDeleteRole,
  onEditRole
}) => {
  const [isHovered, setIsHovered] = useState(false);
  
  // Use memoization to prevent unnecessary recalculations and re-renders
  const { filledPilots, isRoleEmpty } = useMemo(() => {
    // Create a stable filled pilots array that doesn't change on each render
    const filled = [...pilots];
    while (filled.length < 4) {
      filled.push({
        boardNumber: "",
        callsign: "",
        dashNumber: (filled.length + 1).toString()
      });
    }
    
    // Check if the role is empty by verifying no pilots have a board number
    const isEmpty = filled.every(p => !p.boardNumber || p.boardNumber.trim() === "");
    
    return { filledPilots: filled, isRoleEmpty: isEmpty };
  }, [pilots]);  return (
    <div
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        width: 'calc(100% - 20px)', // Account for shadow space
        padding: '10px 10px 5px 10px', // Reduced bottom padding
        margin: '10px', // Add margin for drop shadow
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        fontFamily: 'Inter, sans-serif',
        userSelect: 'none',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.2s ease-in-out',
        display: 'flex',
        flexDirection: 'column',
        marginBottom: '10px' // Add consistent spacing between cards
      }}onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >      {/* Hover controls (edit and delete) */}
      {isHovered && (
        <div
          style={{
            position: 'absolute',
            top: '5px',
            right: '5px',
            display: 'flex',
            gap: '5px',
            zIndex: 5
          }}
        >
          {/* Edit button - always available for renaming the role */}
          <button
            onClick={() => onEditRole?.(id, callsign)}
            style={{
              padding: '4px',
              borderRadius: '4px',
              cursor: 'pointer',
              background: 'white',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.1s ease',
              color: '#64748B',
              width: '24px',
              height: '24px'
            }}
            title="Edit support role"
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
              e.currentTarget.style.background = '#F8FAFC';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
              e.currentTarget.style.background = 'white';
            }}
          >
            <Edit2 size={14} color="#64748B" />
          </button>          {/* Delete button - only shown for empty roles */}
          {isRoleEmpty && (
            <button
              onClick={() => onDeleteRole?.(id)}
              style={{
                padding: '4px',
                borderRadius: '4px',
                cursor: 'pointer',
                background: 'white',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.1s ease',
                color: '#64748B',
                width: '24px',
                height: '24px'
              }}              title="Delete support role"
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                e.currentTarget.style.background = '#F8FAFC';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                e.currentTarget.style.background = 'white';
              }}
            >
              <Trash2 size={14} color="#64748B" />
            </button>
          )}
        </div>
      )}

      {/* Aircraft Tiles Container */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        position: 'relative',
        height: '137px', // Fixed height for tile container
        marginBottom: '0' // No margin needed
      }}>      {/* Map all four position slots evenly */}
        {filledPilots.map((pilot, index) => (
          <DroppableAircraftTile
            key={`${id}-position-${index+1}`}
            pilot={pilot}
            roleId={id}
            dashNumber={(index+1).toString()}
            roleName={callsign}
            verticalOffset={index * 10} // Staggered vertical layout
          />
        ))}
      </div>

      {/* Role name at the bottom of the card */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '22px', // Just enough for the text
        marginBottom: '0' // No bottom margin
      }}>
        <div style={{
          fontSize: '18px',
          fontWeight: 600,
          color: '#1E1E1E',
          textAlign: 'center',
          lineHeight: '22px' // Add line height to control text block height
        }}>
          {callsign}
        </div>
      </div>
    </div>
  );
};

// Component to handle droppable tiles for aircraft
interface DroppableAircraftTileProps {
  pilot: { 
    boardNumber: string; 
    callsign: string; 
    dashNumber: string; 
    attendanceStatus?: 'accepted' | 'tentative' | 'declined';
    rollCallStatus?: 'Present' | 'Absent' | 'Tentative'; 
  };
  roleId: string;
  dashNumber: string;
  roleName: string;
  verticalOffset?: number;
}

// Component for droppable aircraft tiles
const DroppableAircraftTile: React.FC<DroppableAircraftTileProps> = ({
  pilot,
  roleId,
  dashNumber,
  roleName,
  verticalOffset = 0
}) => {
  // Improved empty check using useMemo to prevent recalculations
  const { isEmpty, dropId } = React.useMemo(() => {
    const pilotBoardNumber = pilot?.boardNumber?.trim() || '';
    return {
      isEmpty: pilotBoardNumber === '',
      // Create unique drop IDs for support roles
      dropId: `support-${roleId}-position-${dashNumber}`
    };
  }, [pilot, roleId, dashNumber]);
  
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: {
      type: 'SupportRolePosition',
      roleId, // The full role ID
      dashNumber, // The dash number for this position
      currentPilot: !isEmpty ? pilot : undefined
    }
  });

  return (
    <div 
      ref={setNodeRef} 
      style={{ 
        position: 'relative', 
        marginRight: parseInt(dashNumber) !== 4 ? '15px' : '0',
        zIndex: isOver ? 10 : 1
      }}
      data-drop-id={dropId}
      data-role-id={roleId}
      data-pilot-board-number={pilot.boardNumber || ''}
      data-pilot-callsign={pilot.callsign || ''}
      data-dash-number={dashNumber}
      data-is-empty={isEmpty ? 'true' : 'false'}
    >      <AircraftTile
        boardNumber={isEmpty ? "" : pilot.boardNumber}
        callsign={isEmpty ? "" : pilot.callsign}
        dashNumber={dashNumber}
        attendanceStatus={isEmpty ? undefined : pilot.attendanceStatus}
        rollCallStatus={isEmpty ? undefined : pilot.rollCallStatus}
        flightId={roleId}
        flightNumber=""
        flightCallsign={roleName}
        isEmpty={isEmpty}
        verticalOffset={verticalOffset}
      />
      {isOver && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          borderRadius: '8px',
          pointerEvents: 'none'
        }} />
      )}
    </div>
  );
};

DroppableAircraftTile.displayName = 'DroppableSupportRoleTile';

export default memo(SupportRoleAssignmentCard);
