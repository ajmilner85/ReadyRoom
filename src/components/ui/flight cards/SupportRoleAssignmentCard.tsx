import React, { useState, memo, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import AircraftTile from './AircraftTile';
import { Edit2, Trash2 } from 'lucide-react';

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
  carrier?: {
    hull?: string;  // Hull number (e.g., "CVN-72")
    name?: string;  // Carrier name (e.g., "Abraham Lincoln")
  };
  slots?: Array<{
    type: string;
    name: string;
    id: string;
  }>;
  onDeleteRole?: (id: string) => void;
  onEditRole?: (id: string, callsign: string) => void;
}

const SupportRoleAssignmentCard: React.FC<SupportRoleAssignmentCardProps> = ({
  id,
  callsign,
  pilots,
  carrier,
  slots,
  onDeleteRole,
  onEditRole
}) => {  const [isHovered, setIsHovered] = useState(false);
    // Use memoization to prevent unnecessary recalculations and re-renders
  const { filledPilots, isCommandControl, slotNames, hasAssignedPilots } = useMemo(() => {
    // Determine if this is a Command & Control role
    const isCommandControl = id.includes('command-control');
    
    // Create a stable filled pilots array that doesn't change on each render
    const filled = [...pilots];
    
    // Check if any pilots are assigned (non-empty)
    const hasAssignedPilots = filled.some(p => p.boardNumber?.trim());
    
    // Don't add empty slots - use exactly what was provided
    // This fixes issues #2 and #3 where empty slots were appearing
    
    // For Command & Control, check if we have slots configuration
    // and make sure the pilots array matches that length
    if (isCommandControl) {
      // If slots are defined, use their length
      if (slots && slots.length > 0) {
        // For Command & Control with defined slots:
        // 1. Keep the original pilots array if it has pilots
        // 2. Only create a new pilots array if the slots length doesn't match
        if (filled.length !== slots.length) {
          // If lengths don't match, create a new one with the correct length
          console.log(`Command & Control card ${id}: Resizing pilots array from ${filled.length} to ${slots.length} based on slots`);
          return {
            filledPilots: Array(slots.length).fill(0).map((_, i) => {
              // Try to keep existing pilots if possible
              if (i < filled.length && filled[i].boardNumber?.trim()) {
                return filled[i];
              }
              return {
                boardNumber: "",
                callsign: "", 
                dashNumber: (i + 1).toString()
              };
            }),
            isCommandControl,
            slotNames: slots.map(slot => slot.name),
            hasAssignedPilots
          };
        }
      } else {
        // No slots defined, but we're a Command & Control role
        // Use the pilots length as is - don't artificially expand it
        console.log(`Command & Control card ${id}: No slots defined, using existing pilots length: ${filled.length}`);
      }
    }
    
    // Create slot names array based on the role type
    let slotNames: string[] = [];
    
    if (isCommandControl) {
      // For Command & Control roles
      if (slots && slots.length > 0) {
        // Use slot names provided in the slots array
        slotNames = slots.map(slot => slot.name);
        console.log(`Using custom slot names for role ${id}:`, slotNames);
      } else {
        // Default names based on position
        const defaultTypes = ['AWACS', 'OLYMPUS', 'GCI', 'JTAC'];
        slotNames = filled.map((_, index) => {
          return defaultTypes[index % defaultTypes.length];
        });
        console.log(`Using default slot names for role ${id}:`, slotNames);
      }
    } else {
      // Default carrier position names
      slotNames = ['AIR BOSS', 'MINI BOSS', 'MARSHALL', 'PADDLES'];
    }
    
    return { filledPilots: filled, isCommandControl, slotNames, hasAssignedPilots };
  }, [pilots, id, slots]);
  
  return (
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
        marginBottom: '10px', // Add consistent spacing between cards
        minHeight: '174px' // Set minimum height for the card
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hover controls (edit and delete) */}
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
            <Edit2 size={14} color="#64748B" />          </button>
          
          {/* Delete button - Only show when explicitly approved by parent component with onDeleteRole */}
          {onDeleteRole && (
            <button
              onClick={() => !hasAssignedPilots && onDeleteRole?.(id)}
              style={{
                padding: '4px',
                borderRadius: '4px',
                cursor: hasAssignedPilots ? 'not-allowed' : 'pointer',
                background: hasAssignedPilots ? '#F1F5F9' : 'white',
                boxShadow: hasAssignedPilots ? 'none' : '0 2px 4px rgba(0,0,0,0.1)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.1s ease',
                color: hasAssignedPilots ? '#CBD5E1' : '#64748B',
                width: '24px',
                height: '24px'
              }}
              title={hasAssignedPilots ? "Remove all pilots first" : "Delete support role"}
              onMouseEnter={(e) => {
                if (!hasAssignedPilots) {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                  e.currentTarget.style.background = '#F8FAFC';
                }
              }}
              onMouseLeave={(e) => {
                if (!hasAssignedPilots) {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.background = 'white';
                }
              }}
              disabled={hasAssignedPilots}
            >
              <Trash2 size={14} color={hasAssignedPilots ? "#CBD5E1" : "#64748B"} />
            </button>
          )}
        </div>
      )}

      {/* Aircraft Tiles Container */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        height: '102px', // Adjusted to match required tile height
        marginBottom: '10px', // Add some margin to separate from role name
        gap: '15px' // Consistent gap between tiles
      }}>
        {/* Map all position slots evenly */}
        {filledPilots.map((pilot, index) => {
          // Get dash number
          const dashNumber = (index + 1).toString();
          
          // Use the slot name from our memoized array
          const positionName = slotNames[index] || "UNKNOWN";
          
          return (
            <DroppableAircraftTile
              key={`${id}-position-${dashNumber}`}
              pilot={pilot}
              roleId={id}
              dashNumber={dashNumber}
              roleName={positionName} // Use the specific position name here
            />
          );
        })}
      </div>      {/* Role name at the bottom of the card */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '28px', // Increased height for potential two-line display
        marginBottom: '5px', // Add some bottom margin
        marginTop: 'auto' // Push to bottom of available space
      }}>
        <div style={{
          fontSize: '16px',
          fontWeight: 600,
          color: '#1E1E1E',
          textAlign: 'center',
          lineHeight: '18px', // Adjusted for potential multi-line
          overflow: 'hidden',
          textOverflow: 'ellipsis'        }}>
          {carrier && carrier.hull && carrier.name ? 
            `${carrier.hull} ${carrier.name}` : 
            callsign}
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
}

// Component for droppable aircraft tiles
const DroppableAircraftTile = React.memo(({
  pilot,
  roleId,
  dashNumber,
  roleName
}: DroppableAircraftTileProps) => {
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
        width: '92px',
        height: '102px',
        zIndex: isOver ? 10 : 1
      }}
      data-drop-id={dropId}
      data-role-id={roleId}
      data-pilot-board-number={pilot.boardNumber || ''}
      data-pilot-callsign={pilot.callsign || ''}
      data-dash-number={dashNumber}
      data-is-empty={isEmpty ? 'true' : 'false'}
    >
      <AircraftTile
        boardNumber={isEmpty ? "" : pilot.boardNumber}
        callsign={isEmpty ? "" : pilot.callsign}
        dashNumber={dashNumber}
        attendanceStatus={isEmpty ? undefined : pilot.attendanceStatus}
        rollCallStatus={isEmpty ? undefined : pilot.rollCallStatus}
        flightId={roleId}
        flightNumber=""
        flightCallsign={roleName} // Use the position name passed from parent
        isEmpty={isEmpty}
        iconType="personnel"
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
});

DroppableAircraftTile.displayName = 'DroppableSupportRoleTile';

export default memo(SupportRoleAssignmentCard);
