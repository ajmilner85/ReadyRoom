import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import AircraftTile from './AircraftTile';
import { Edit2, Trash2 } from 'lucide-react';
import type { Pilot } from '../../../types/PilotTypes';

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
    boardNumber: string;
    callsign: string;
    dashNumber: string;
  }>;
  midsA?: string;
  midsB?: string;
  onDeleteFlight?: (id: string) => void;
  onEditFlight?: (id: string, callsign: string) => void;
  missionCommander?: MissionCommanderInfo | null;
}

const FlightAssignmentCard: React.FC<FlightAssignmentCardProps> = ({
  id,
  callsign,
  flightNumber,
  pilots,
  midsA = '',
  midsB = '',
  onDeleteFlight,
  onEditFlight,
  missionCommander
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const getPilotByDashNumber = (dashNumber: string) => {
    return pilots.find(p => p.dashNumber === dashNumber) || {
      boardNumber: "",
      callsign: "",
      dashNumber
    };
  };

  // Check if a pilot is the mission commander
  const isMissionCommander = (boardNumber: string) => {
    return missionCommander !== null && 
           missionCommander.boardNumber === boardNumber && 
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

  // Check if the flight is empty (no assigned pilots)
  const isFlightEmpty = pilots.every(p => !p.boardNumber && !p.callsign);

  return (
    <div
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        width: 'calc(100% - 20px)', // Account for shadow space
        padding: '10px 10px 5px 10px', // Removed bottom padding
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
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hover controls (edit and delete) for empty flights */}
      {isHovered && isFlightEmpty && (
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
          {/* Edit button - using Lucide-React component to match other sections */}
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

          {/* Delete button - using Lucide-React component to match other sections */}
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

      {/* Aircraft Tiles Container */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        position: 'relative',
        height: '137px', // Fixed height for tile container
        marginBottom: '0' // Removed margin
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
        />
      </div>

      {/* Flight name at the bottom of the card with precise spacing */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '22px', // Just enough for the text
        marginBottom: '0' // Removed bottom margin
      }}>
        <div style={{
          fontSize: '18px',
          fontWeight: 600,
          color: '#1E1E1E',
          textAlign: 'center',
          lineHeight: '22px' // Add line height to control text block height
        }}>
          {callsign} {flightNumber}
        </div>
      </div>
    </div>
  );
};

// New component to handle droppable empty tiles
interface DroppableAircraftTileProps {
  pilot: { boardNumber: string; callsign: string; dashNumber: string; };
  flightId: string;
  dashNumber: string;
  flightNumber: string;
  flightCallsign: string;
  midsA?: string;
  midsB?: string;
  isFlightLead?: boolean;
  isWingPair?: boolean;
  isMissionCommander?: boolean;
}

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
  isMissionCommander = false
}) => {
  // Always make tiles droppable, but only trigger a fill action if the tile is empty
  // or if the user is dragging the existing pilot in this tile
  const isEmpty = !pilot.boardNumber && !pilot.callsign;
  const dropId = `flight-${flightId}-position-${dashNumber}`;
  
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: {
      type: 'FlightPosition',
      flightId,
      dashNumber,
      currentBoardNumber: pilot.boardNumber // Include current occupant's info
    }
  });

  return (
    <div 
      ref={setNodeRef} 
      style={{ 
        position: 'relative', 
        marginRight: dashNumber !== "4" ? '15px' : '0',
        zIndex: isOver ? 10 : 1 // Increase z-index when being dragged over
      }}
      data-drop-id={dropId}
    >
      <AircraftTile
        {...pilot}
        flightId={flightId}
        flightNumber={flightNumber}
        flightCallsign={flightCallsign}
        isFlightLead={isFlightLead}
        isWingPair={isWingPair}
        isEmpty={isEmpty}
        midsA={midsA}
        midsB={midsB}
        verticalOffset={
          dashNumber === "2" ? 10 :  // 1-2 offset 10px down
          dashNumber === "3" ? 10 :  // 1-3 offset 10px down
          dashNumber === "4" ? 20 :  // 1-4 offset 20px down
          0                          // 1-1 no offset
        }
        isMissionCommander={isMissionCommander}
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

export default FlightAssignmentCard;