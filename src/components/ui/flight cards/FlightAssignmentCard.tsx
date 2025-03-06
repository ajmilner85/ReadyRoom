import React, { useState, useEffect } from 'react';
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
  onPilotAssigned?: (flightId: string, pilot: Pilot) => void;
}

const FlightAssignmentCard: React.FC<FlightAssignmentCardProps> = ({
  id,
  callsign,
  flightNumber,
  pilots,
  midsA = '',
  midsB = '',
  onPilotAssigned
}) => {
  const [isOver, setIsOver] = useState(false);
  const { setNodeRef, isOver: isDraggingOver } = useDroppable({
    id: `flight-${id}`,
    data: {
      type: 'Flight',
      flight: { id, callsign, flightNumber, pilots }
    }
  });

  useEffect(() => {
    setIsOver(isDraggingOver);
  }, [isDraggingOver]);

  // Call onPilotAssigned when drop ends
  useEffect(() => {
    if (!isDraggingOver && isOver && onPilotAssigned) {
      const dropHandler = (event: any) => {
        const dragData = event.active?.data?.current;
        if (dragData?.type === 'Pilot') {
          onPilotAssigned(id, dragData.pilot);
        }
      };
      window.addEventListener('drop', dropHandler);
      return () => window.removeEventListener('drop', dropHandler);
    }
  }, [id, isDraggingOver, isOver, onPilotAssigned]);

  // Determine if a pilot slot is empty
  const isEmpty = (pilot: { boardNumber: string; callsign: string; }): boolean => 
    !pilot.boardNumber && !pilot.callsign;

  // Get pilot by dash number
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
      ref={setNodeRef}
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        width: 'calc(100% - 20px)', // Account for shadow space
        padding: '10px 10px 5px 10px', // Removed bottom padding
        margin: '10px', // Add margin for drop shadow
        backgroundColor: isOver ? '#EFF6FF' : '#FFFFFF',
        borderRadius: '8px',
        fontFamily: 'Inter, sans-serif',
        userSelect: 'none',
        boxShadow: isOver 
          ? '0px 20px 25px -5px rgba(0, 0, 0, 0.3), 0px 10px 10px -5px rgba(0, 0, 0, 0.2)'
          : '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
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
        {/* Tiles in formation order: 1-2, 1-1, 1-3, 1-4 with vertical offsets */}
        
        {/* 1-2 position (offset 10px DOWN relative to 1-1) */}
        <div style={{ position: 'relative', marginRight: '15px' }}>
          <AircraftTile
            boardNumber={pilot2.boardNumber}
            callsign={pilot2.callsign}
            dashNumber={pilot2.dashNumber}
            flightNumber={flightNumber}
            flightCallsign={callsign}
            midsA={midsA}
            midsB={midsB}
            isEmpty={isEmpty(pilot2)}
            verticalOffset={10} // 10px DOWN from baseline
          />
        </div>
        
        {/* 1-1 position (flight lead) - BASELINE */}
        <div style={{ position: 'relative', marginRight: '15px' }}>
          <AircraftTile
            boardNumber={pilot1.boardNumber}
            callsign={pilot1.callsign}
            dashNumber={pilot1.dashNumber}
            flightNumber={flightNumber}
            flightCallsign={callsign}
            isFlightLead={true}
            midsA={midsA}
            midsB={midsB}
            isEmpty={isEmpty(pilot1)}
            verticalOffset={0} // Baseline reference
          />
        </div>
        
        {/* 1-3 position (section lead) - offset 10px DOWN from 1-1 */}
        <div style={{ position: 'relative', marginRight: '15px' }}>
          <AircraftTile
            boardNumber={pilot3.boardNumber}
            callsign={pilot3.callsign}
            dashNumber={pilot3.dashNumber}
            flightNumber={flightNumber}
            flightCallsign={callsign}
            isWingPair={true}
            midsA={midsA}
            midsB={midsB}
            isEmpty={isEmpty(pilot3)}
            verticalOffset={10} // 10px DOWN from baseline
          />
        </div>
        
        {/* 1-4 position - offset 20px DOWN from 1-1 */}
        <div style={{ position: 'relative' }}>
          <AircraftTile
            boardNumber={pilot4.boardNumber}
            callsign={pilot4.callsign}
            dashNumber={pilot4.dashNumber}
            flightNumber={flightNumber}
            flightCallsign={callsign}
            midsA={midsA}
            midsB={midsB}
            isEmpty={isEmpty(pilot4)}
            verticalOffset={20} // 20px DOWN from baseline
          />
        </div>
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

export default FlightAssignmentCard;