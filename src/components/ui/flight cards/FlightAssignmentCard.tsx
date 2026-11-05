import React, { useState, memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import AircraftTile from './AircraftTile';
import { Icon, IconButton, legibleColor } from '../primitives';

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
    currentSquadron?: any;
    squadronAssignment?: any;
  }>;
  midsA?: string;
  midsB?: string;
  stepTime?: number; // Step time offset in minutes
  onDeleteFlight?: (id: string) => void;
  onEditFlight?: (id: string, callsign: string) => void;
  onStepTimeChange?: (id: string, stepTime: number) => void;
  missionCommander?: MissionCommanderInfo | null;
  /** Owning squadron's primary colour (left bar). */
  squadronColor?: string;
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
  missionCommander,
  squadronColor
}) => {
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

  const bar = legibleColor(squadronColor, 'var(--rr-accent)');

  return (
    <div
      className="flight-assignment-card group bg-panel2 border border-border rounded-rr-lg select-none"
      style={{ position: 'relative' }}
    >
      {/* Header: squadron bar · callsign · MIDS B · step time · actions */}
      <div className="flex items-center gap-2 px-3 py-[7px] border-b border-border">
        <span className="w-[3px] h-[14px] rounded-[2px] flex-none" style={{ background: bar }} />
        <span className="text-[13px] font-bold tracking-[.02em] text-text whitespace-nowrap">{callsign} {flightNumber}</span>
        {midsB ? (
          <span className="font-mono text-[10px] px-[6px] py-[1px] rounded-rr-sm bg-panel3 text-text2" title="MIDS B (flight channel)">
            B {midsB}
          </span>
        ) : null}
        <span className="flex-1" />
        <div
          onDoubleClick={handleStepTimeDoubleClick}
          className="flex items-center gap-1 font-mono text-[10.5px] text-text2 cursor-pointer"
          title="Double-click to edit step time"
        >
          <Icon name="clock" size={12} />
          <span className="text-text3">STEP</span>
          {isEditingStepTime ? (
            <input
              type="text"
              value={editedStepTime}
              onChange={handleStepTimeChange}
              onBlur={handleStepTimeBlur}
              onKeyDown={handleStepTimeKeyPress}
              onFocus={(e) => e.target.select()}
              autoFocus
              className="w-[38px] h-[18px] px-1 font-mono text-[10.5px] rounded-rr-sm bg-panel border border-accent text-text focus:outline-none"
            />
          ) : (
            <span className="text-text font-semibold">{formatStepTime(stepTime)}</span>
          )}
        </div>
        <div className="flight-card-actions flex items-center gap-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <IconButton icon="edit" size={24} iconSize={13} label="Edit flight" onClick={() => onEditFlight?.(id, callsign)} />
          <IconButton icon="trash" size={24} iconSize={13} label="Delete flight" className="hover:!text-bad" onClick={() => onDeleteFlight?.(id)} />
        </div>
      </div>

      {/* Finger-four: lead in front, -2 and -3 one step back, -4 two steps back */}
      <div className="flex justify-center items-start gap-[6px] px-3 pt-[10px] pb-[14px]">
        <DroppableAircraftTile
          pilot={pilot2}
          flightId={id}
          dashNumber="2"
          flightNumber={flightNumber}
          flightCallsign={callsign}
          midsA={midsA}
          midsB={midsB}
          isMissionCommander={isMissionCommander(pilot2.boardNumber)}
          verticalOffset={18}
        />
        <DroppableAircraftTile
          pilot={pilot1}
          flightId={id}
          dashNumber="1"
          flightNumber={flightNumber}
          flightCallsign={callsign}
          midsA={midsA}
          midsB={midsB}
          isFlightLead={true}
          isMissionCommander={isMissionCommander(pilot1.boardNumber)}
          verticalOffset={0}
        />
        <DroppableAircraftTile
          pilot={pilot3}
          flightId={id}
          dashNumber="3"
          flightNumber={flightNumber}
          flightCallsign={callsign}
          midsA={secondSectionMidsA}
          midsB={midsB}
          isWingPair={true}
          isMissionCommander={isMissionCommander(pilot3.boardNumber)}
          verticalOffset={18}
        />
        <DroppableAircraftTile
          pilot={pilot4}
          flightId={id}
          dashNumber="4"
          flightNumber={flightNumber}
          flightCallsign={callsign}
          midsA={secondSectionMidsA}
          midsB={midsB}
          isMissionCommander={isMissionCommander(pilot4.boardNumber)}
          verticalOffset={36}
        />
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
    currentSquadron?: any;
    squadronAssignment?: any;
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

  // Get pilot's squadron color
  const pilotSquadronColor = pilot?.currentSquadron?.color_palette?.primary ||
                             pilot?.squadronAssignment?.org_squadrons?.color_palette?.primary;

  // Force component to update when attendance status changes
  const [key, setKey] = useState(Date.now());
  // This effect ensures the component re-renders when attendance status or roll call status changes
  React.useEffect(() => {
    // Generate a new key whenever pilot's status changes
    setKey(Date.now());
  }, [pilot.attendanceStatus, pilot.rollCallStatus]);
  
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
        pilotSquadronColor={pilotSquadronColor}
      />
      {isOver && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'var(--rr-accent-weak)',
          outline: '1.5px dashed var(--rr-accent)',
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