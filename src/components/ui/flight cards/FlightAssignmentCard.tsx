import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import AircraftTile from './AircraftTile';
import type { Pilot } from '../../../types/PilotTypes';

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
}

const FlightAssignmentCard: React.FC<FlightAssignmentCardProps> = ({
  id,
  callsign,
  flightNumber,
  pilots,
  midsA = '',
  midsB = ''
}) => {
  const getPilotByDashNumber = (dashNumber: string) => {
    return pilots.find(p => p.dashNumber === dashNumber) || {
      boardNumber: "",
      callsign: "",
      dashNumber
    };
  };

  // Get the pilots in the correct order: 1-2, 1-1, 1-3, 1-4
  const pilot2 = getPilotByDashNumber("2"); // 1-2
  const pilot1 = getPilotByDashNumber("1"); // 1-1 (flight lead)
  const pilot3 = getPilotByDashNumber("3"); // 1-3 (section lead)
  const pilot4 = getPilotByDashNumber("4"); // 1-4

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
    >
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
        {/* 1-2 position */}
        <DroppableAircraftTile
          pilot={pilot2}
          flightId={id}
          dashNumber="2"
          flightNumber={flightNumber}
          flightCallsign={callsign}
          midsA={midsA}
          midsB={midsB}
        />
        
        {/* 1-1 position */}
        <DroppableAircraftTile
          pilot={pilot1}
          flightId={id}
          dashNumber="1"
          flightNumber={flightNumber}
          flightCallsign={callsign}
          midsA={midsA}
          midsB={midsB}
          isFlightLead={true}
        />
        
        {/* 1-3 position */}
        <DroppableAircraftTile
          pilot={pilot3}
          flightId={id}
          dashNumber="3"
          flightNumber={flightNumber}
          flightCallsign={callsign}
          midsA={midsA}
          midsB={midsB}
          isWingPair={true}
        />
        
        {/* 1-4 position */}
        <DroppableAircraftTile
          pilot={pilot4}
          flightId={id}
          dashNumber="4"
          flightNumber={flightNumber}
          flightCallsign={callsign}
          midsA={midsA}
          midsB={midsB}
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
  isWingPair
}) => {
  const isEmpty = !pilot.boardNumber && !pilot.callsign;
  const { setNodeRef, isOver } = useDroppable({
    id: isEmpty ? `flight-${flightId}-position-${dashNumber}` : `disabled-${flightId}-${dashNumber}`,
    data: {
      type: 'FlightPosition',
      flightId,
      dashNumber
    },
    disabled: !isEmpty
  });

  return (
    <div ref={setNodeRef} style={{ position: 'relative', marginRight: dashNumber !== "4" ? '15px' : '0' }}>
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
      />
      {isEmpty && isOver && (
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