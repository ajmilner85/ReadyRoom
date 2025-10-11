import React, { useState, memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import AircraftTile from './AircraftTile';
import { Edit2, Trash2, Clock } from 'lucide-react';

// Add mission commander interface
interface MissionCommanderInfo {
  boardNumber: string;
  callsign: string;
  flightId: string;
  flightCallsign: string;
  flightNumber: string;
}

interface FlightAssignmentCardProps {
  id: string;
  callsign: string;
  flightNumber: string;
  pilots: Array<{
    id: string;
    boardNumber: string;
    callsign: string;
    dashNumber: string;
    attendanceStatus?: 'accepted' | 'tentative' | 'declined';
    rollCallStatus?: 'Present' | 'Absent' | 'Tentative';
  }>;
  midsA?: string;
  midsB?: string;
  stepTime?: number; // Step time offset in minutes
  onDeleteFlight?: (id: string) => void;
  onEditFlight?: (id: string, callsign: string) => void;
  onStepTimeChange?: (id: string, stepTime: number) => void;
  missionCommander?: MissionCommanderInfo | null;
}

const FlightAssignmentCard: React.FC<FlightAssignmentCardProps> = ({
  id,
  callsign,
  flightNumber,
  pilots,
  midsA = '',
  midsB = '',
  stepTime = 0,
  onDeleteFlight,
  onEditFlight,
  onStepTimeChange,
  missionCommander
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingStepTime, setIsEditingStepTime] = useState(false);
  const [editedStepTime, setEditedStepTime] = useState(stepTime.toString());

  // Format step time for display
  const formatStepTime = (minutes: number): string => {
    if (minutes === 0) return '+0';
    if (minutes < 0) return `-${Math.abs(minutes)}`;
    return `+${minutes}`;
  };

  // Handle step time double-click
  const handleStepTimeDoubleClick = () => {
    setIsEditingStepTime(true);
    setEditedStepTime(Math.abs(stepTime).toString());
  };

  // Handle step time input change
  const handleStepTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow numbers
    if (value === '' || /^\d+$/.test(value)) {
      setEditedStepTime(value);
    }
  };

  // Handle step time blur (save)
  const handleStepTimeBlur = () => {
    const newValue = editedStepTime === '' ? 0 : parseInt(editedStepTime);
    if (newValue >= -999 && newValue <= 999 && onStepTimeChange) {
      onStepTimeChange(id, newValue);
    }
    setIsEditingStepTime(false);
  };

  // Handle step time key press
  const handleStepTimeKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleStepTimeBlur();
    } else if (e.key === 'Escape') {
      setIsEditingStepTime(false);
      setEditedStepTime(stepTime.toString());
    }
  };

  const getPilotByDashNumber = (dashNumber: string) => {
    return pilots.find(p => p.dashNumber === dashNumber) || {
      id: `empty-${id}-${dashNumber}`,
      boardNumber: "",
      callsign: "",
      dashNumber
    };
  };

  // Check if a pilot is the mission commander
  const isMissionCommander = (boardNumber: string) => {
    if (!missionCommander) return false;
    return missionCommander.boardNumber === boardNumber && 
           missionCommander.flightId === id;
  };

  // Get the pilots in the correct order: 1-2, 1-1, 1-3, 1-4
  const pilot2 = getPilotByDashNumber("2"); // 1-2
  const pilot1 = getPilotByDashNumber("1"); // 1-1 (flight lead)
  const pilot3 = getPilotByDashNumber("3"); // 1-3 (section lead)
  const pilot4 = getPilotByDashNumber("4"); // 1-4

  // Calculate the second section's MIDS A channel (MIDS A + 1)
  // If midsA is "1", then secondSectionMidsA will be "2"
  const midsANum = parseInt(midsA) || 0;
  const secondSectionMidsA = midsANum > 0 ? (midsANum + 1).toString() : '';

  return (
    <div
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        width: 'calc(100% - 20px)', // Account for shadow space
        padding: '10px 12px 2px 8px', // top: 10px (12-2), right: 12px, bottom: 2px (4-2), left: 8px
        margin: '10px', // Add margin for drop shadow
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        fontFamily: 'Inter, sans-serif',
        userSelect: 'none',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.2s ease-in-out',
        display: 'flex',
        flexDirection: 'row', // Changed to row for horizontal layout
        alignItems: 'stretch',
        marginBottom: '10px' // Add consistent spacing between cards
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Step time indicator - bottom left corner of card */}
      <div
        style={{
          position: 'absolute',
          bottom: '3px',
          left: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '12px',
          fontWeight: 500,
          color: '#64748B',
          padding: '2px 4px',
          zIndex: 10
        }}
      >
        <Clock size={13} style={{ flexShrink: 0, marginTop: '1px', marginLeft: '-1px' }} />
        <div
          onDoubleClick={handleStepTimeDoubleClick}
          style={{
            cursor: 'pointer',
            width: '32px',
            height: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            flexShrink: 0,
            marginLeft: '-3px'
          }}
          title="Double-click to edit step time"
        >
          {isEditingStepTime ? (
            <input
              type="text"
              value={editedStepTime}
              onChange={handleStepTimeChange}
              onBlur={handleStepTimeBlur}
              onKeyDown={handleStepTimeKeyPress}
              onFocus={(e) => e.target.select()}
              autoFocus
              style={{
                width: '100%',
                height: '100%',
                padding: '0',
                margin: '0',
                border: '1px solid #CBD5E1',
                borderRadius: '2px',
                fontSize: '12px',
                fontWeight: 500,
                textAlign: 'left',
                paddingLeft: '2px',
                backgroundColor: 'white',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          ) : (
            <span style={{ fontSize: '12px', fontWeight: 500 }}>{formatStepTime(stepTime)}</span>
          )}
        </div>
      </div>

      {/* Edit and Delete buttons - top right corner of card */}
      {isHovered && (
        <div
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            display: 'flex',
            gap: '5px',
            zIndex: 10
          }}
        >
          {/* Edit button */}
          <button
            onClick={() => onEditFlight?.(id, callsign)}
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
            title="Edit flight"
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
          </button>

          {/* Delete button */}
          <button
            onClick={() => onDeleteFlight?.(id)}
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
            title="Delete flight"
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
        </div>
      )}

      {/* Left section - Vertical callsign */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: '8px',
          minWidth: '30px'
        }}
      >
        {/* Vertical callsign */}
        <div
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: '18px',
            fontWeight: 600,
            color: '#1E1E1E',
            letterSpacing: '0.02em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {callsign} {flightNumber}
        </div>
      </div>

      {/* Main content area - tiles */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}>
        {/* Aircraft Tiles Container */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          position: 'relative',
          paddingRight: '12px', // 12px from right edge
          paddingBottom: '12px' // 12px from bottom edge
        }}>
        {/* Wrap each tile with DroppableAircraftTile when empty */}
        {/* 1-2 position - first section */}
        <DroppableAircraftTile
          pilot={pilot2}
          flightId={id}
          dashNumber="2"
          flightNumber={flightNumber}
          flightCallsign={callsign}
          midsA={midsA}  // First section MIDS A
          midsB={midsB}
          isMissionCommander={isMissionCommander(pilot2.boardNumber)}
          verticalOffset={10} // Apply the 10px offset for 1-2 position
        />
        
        {/* 1-1 position - first section */}
        <DroppableAircraftTile
          pilot={pilot1}
          flightId={id}
          dashNumber="1"
          flightNumber={flightNumber}
          flightCallsign={callsign}
          midsA={midsA}  // First section MIDS A
          midsB={midsB}
          isFlightLead={true}
          isMissionCommander={isMissionCommander(pilot1.boardNumber)}
          verticalOffset={0} // No offset for 1-1 (flight lead)
        />
        
        {/* 1-3 position - second section */}
        <DroppableAircraftTile
          pilot={pilot3}
          flightId={id}
          dashNumber="3"
          flightNumber={flightNumber}
          flightCallsign={callsign}
          midsA={secondSectionMidsA}  // Second section MIDS A
          midsB={midsB}
          isWingPair={true}
          isMissionCommander={isMissionCommander(pilot3.boardNumber)}
          verticalOffset={10} // Apply the 10px offset for 1-3 position
        />
        
        {/* 1-4 position - second section */}
        <DroppableAircraftTile
          pilot={pilot4}
          flightId={id}
          dashNumber="4"
          flightNumber={flightNumber}
          flightCallsign={callsign}
          midsA={secondSectionMidsA}  // Second section MIDS A
          midsB={midsB}
          isMissionCommander={isMissionCommander(pilot4.boardNumber)}
          verticalOffset={20} // Apply the 20px offset for 1-4 position
        />
        </div>
      </div>
    </div>
  );
};

// New component to handle droppable empty tiles
interface DroppableAircraftTileProps {
  pilot: { 
    id: string;
    boardNumber: string; 
    callsign: string; 
    dashNumber: string; 
    attendanceStatus?: 'accepted' | 'tentative' | 'declined';
    rollCallStatus?: 'Present' | 'Absent' | 'Tentative'; 
  };
  flightId: string;
  dashNumber: string;
  flightNumber: string;
  flightCallsign: string;
  midsA?: string;
  midsB?: string;
  isFlightLead?: boolean;
  isWingPair?: boolean;
  isMissionCommander?: boolean;
  verticalOffset?: number; // Add the verticalOffset prop
}

// Do NOT memoize this component to ensure it updates when attendance status changes
const DroppableAircraftTile: React.FC<DroppableAircraftTileProps> = ({
  pilot,
  flightId,
  dashNumber,
  flightNumber,
  flightCallsign,
  midsA,
  midsB,
  isFlightLead,
  isWingPair,
  isMissionCommander = false,
  verticalOffset = 0 // Default to 0 if not provided
}) => {
  const isEmpty = !pilot.boardNumber && !pilot.callsign;
  // Use the complete flight ID to ensure unique drop targets
  const dropId = `flight-${flightId}-position-${dashNumber}`;
  
  // Force component to update when attendance status changes
  const [key, setKey] = useState(Date.now());
  // This effect ensures the component re-renders when attendance status or roll call status changes
  React.useEffect(() => {
    // Generate a new key whenever pilot's status changes
    setKey(Date.now());
    
    // Debug logging for roll call status
    if (pilot.callsign === 'DSRM') {
      console.log(`[DROPPABLE-TILE-DEBUG] ${pilot.callsign} in flight ${flightId}-${dashNumber}:`, {
        rollCallStatus: pilot.rollCallStatus,
        attendanceStatus: pilot.attendanceStatus,
        boardNumber: pilot.boardNumber,
        id: pilot.id
      });
    }
  }, [pilot.attendanceStatus, pilot.rollCallStatus, flightId, dashNumber, pilot.callsign]);
  
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: {
      type: 'FlightPosition',
      flightId: flightId, // Ensure the full flight ID is passed
      dashNumber,
      currentPilot: !isEmpty ? pilot : undefined
    }
  });

  return (
    <div 
      ref={setNodeRef} 
      style={{ 
        position: 'relative', 
        marginRight: dashNumber !== "4" ? '15px' : '0',
        zIndex: isOver ? 10 : 1
      }}
      data-drop-id={dropId}
      data-flight-id={flightId} // Add a data attribute for debugging
      key={`${flightId}-${dashNumber}-${key}`} // Add a key that changes when attendance status changes
    >      <AircraftTile
        boardNumber={pilot.boardNumber}
        callsign={pilot.callsign}
        dashNumber={pilot.dashNumber}
        attendanceStatus={pilot.attendanceStatus} // Discord attendance status
        rollCallStatus={pilot.rollCallStatus} // Roll call attendance status (higher priority)
        flightId={flightId}
        flightNumber={flightNumber}
        flightCallsign={flightCallsign}
        isFlightLead={isFlightLead}
        isWingPair={isWingPair}
        isEmpty={isEmpty}
        midsA={midsA}
        midsB={midsB}
        isMissionCommander={isMissionCommander}
        verticalOffset={verticalOffset} // Pass the verticalOffset to AircraftTile
        pilot={pilot} // Pass the full pilot object for drag operations
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

// Add display name for component
DroppableAircraftTile.displayName = 'DroppableAircraftTile';

export default memo(FlightAssignmentCard);