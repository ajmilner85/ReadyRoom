import React, { useState, useEffect } from 'react';
import { Card } from '../card';
import { useDroppable } from '@dnd-kit/core';
import type { Pilot } from '../../../types/PilotTypes';

interface MissionFlightCardProps {
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

const MissionFlightCard: React.FC<MissionFlightCardProps> = ({
  id,
  callsign,
  flightNumber,
  pilots,
  midsA = 'N/A',
  midsB = 'N/A',
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

  const lead = pilots.find(p => p.dashNumber === "1") || pilots[0];
  const wingmen = pilots.filter(p => p !== lead);

  // Determine if this is an empty slot
  const isEmpty = (pilot: { boardNumber: string; callsign: string; }): boolean => 
    !pilot.boardNumber && !pilot.callsign;

  return (
    <div 
      ref={setNodeRef}
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        width: '442px',
        height: '100px',
        padding: '6px',
        backgroundColor: isOver ? '#EFF6FF' : '#FFFFFF',
        borderRadius: '8px',
        fontFamily: 'Inter, sans-serif',
        userSelect: 'none',
        boxShadow: isOver 
          ? '0px 20px 25px -5px rgba(0, 0, 0, 0.3), 0px 10px 10px -5px rgba(0, 0, 0, 0.2)'
          : '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        opacity: 1,
        transition: 'all 0.2s ease-in-out'
      }}
    >
      <div style={{
        display: 'flex',
        gap: '4px',
        height: '88px',
      }}>
        {/* Lead Aircraft */}
        <div style={{
          flex: '0 0 92px',
          backgroundColor: '#F8FAFC',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div 
            style={{ 
              fontSize: '36px', 
              fontWeight: 700, 
              lineHeight: '44px', 
              color: isEmpty(lead) ? '#94A3B8' : '#1E1E1E'
            }}
            title={isEmpty(lead) ? 'Empty slot' : lead.callsign}
          >
            {isEmpty(lead) ? '-' : lead.boardNumber}
          </div>
          <div style={{ fontSize: '12px', fontWeight: 300, lineHeight: '15px', color: '#000000' }}>
            {callsign} {flightNumber}-{lead.dashNumber}
          </div>
        </div>

        {/* Flight Members */}
        <div style={{
          flex: '0 0 138px',
          backgroundColor: '#F8FAFC',
          borderRadius: '8px',
          padding: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          {wingmen.map((pilot) => (
            <div key={`${flightNumber}-${pilot.dashNumber}`}
                 style={{
                   display: 'flex',
                   alignItems: 'center',
                   height: '24px',
                 }}>
              <span style={{ fontSize: '12px', fontWeight: 300, width: '28px', color: '#000000' }}>
                {flightNumber}-{pilot.dashNumber}
              </span>
              <span 
                style={{ 
                  fontSize: '20px', 
                  fontWeight: 700, 
                  marginLeft: '29px', 
                  color: isEmpty(pilot) ? '#94A3B8' : '#1E1E1E'
                }}
                title={isEmpty(pilot) ? 'Empty slot' : pilot.callsign}
              >
                {isEmpty(pilot) ? '-' : pilot.boardNumber}
              </span>
            </div>
          ))}
        </div>

        {/* MIDS A */}
        <div style={{
          flex: '0 0 92px',
          backgroundColor: '#F8FAFC',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '4px' }}>MIDS A</div>
          <div style={{ fontSize: '20px', fontWeight: 500, color: '#000000' }}>
            {midsA}
          </div>
        </div>

        {/* MIDS B */}
        <div style={{
          flex: '0 0 92px',
          backgroundColor: '#F8FAFC',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '4px' }}>MIDS B</div>
          <div style={{ fontSize: '20px', fontWeight: 500, color: '#000000' }}>
            {midsB}
          </div>
        </div>
      </div>
    </div>
  );
};

interface Flight {
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

interface FlightAssignmentsProps {
  width: string;
  assignedPilots?: Record<string, Pilot[]>;
  onPilotAssigned?: (flightId: string, pilot: Pilot) => void;
}

const FlightAssignments: React.FC<FlightAssignmentsProps> = ({ 
  width, 
  assignedPilots = {},
  onPilotAssigned 
}) => {
  const [flights] = useState<Flight[]>([
    {
      id: '1',
      callsign: "STING",
      flightNumber: "1",
      pilots: [
        { boardNumber: "744", callsign: "JACKPOT", dashNumber: "1" },
        { boardNumber: "637", callsign: "BOWSER", dashNumber: "2" },
        { boardNumber: "727", callsign: "KNIGHT", dashNumber: "3" },
        { boardNumber: "555", callsign: "DASH", dashNumber: "4" }
      ],
      midsA: "11",
      midsB: "12"
    },
    {
      id: '2',
      callsign: "STING",
      flightNumber: "2",
      pilots: [
        { boardNumber: "", callsign: "", dashNumber: "1" },
        { boardNumber: "", callsign: "", dashNumber: "2" },
        { boardNumber: "", callsign: "", dashNumber: "3" },
        { boardNumber: "", callsign: "", dashNumber: "4" }
      ],
      midsA: "",
      midsB: ""
    }
  ]);

  // Transform assigned pilots into the format needed for display
  const getUpdatedFlightPilots = (flight: Flight) => {
    const assigned = assignedPilots[flight.id] || [];
    const updatedPilots = [...flight.pilots];
    
    // Find first empty slot for each assigned pilot
    assigned.forEach(assignedPilot => {
      const emptySlotIndex = updatedPilots.findIndex(p => !p.boardNumber && !p.callsign);
      if (emptySlotIndex !== -1) {
        updatedPilots[emptySlotIndex] = {
          ...updatedPilots[emptySlotIndex],
          boardNumber: assignedPilot.boardNumber,
          callsign: assignedPilot.callsign
        };
      }
    });
    
    return updatedPilots;
  };

  return (
    <div style={{ width }}>
      <Card 
        style={{
          width: '100%',
          height: '100%',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflowY: 'hidden',
          boxSizing: 'border-box',
          transition: 'all 0.2s ease-in-out',
          backgroundColor: '#FFFFFF'
        }}
      >
        <div style={{
          width: '100%',
          textAlign: 'center',
          marginBottom: '16px'
        }}>
          <span style={{
            fontFamily: 'Inter',
            fontStyle: 'normal',
            fontWeight: 300,
            fontSize: '20px',
            lineHeight: '24px',
            color: '#64748B',
            textTransform: 'uppercase'
          }}>
            Flight Assignments
          </span>
        </div>
        <div className="flex-1" style={{ overflowY: 'auto' }}>
          <div className="space-y-4">
            {flights.map((flight) => (
              <MissionFlightCard
                key={flight.id}
                {...flight}
                pilots={getUpdatedFlightPilots(flight)}
                onPilotAssigned={onPilotAssigned}
              />
            ))}
          </div>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          marginTop: 'auto',
          padding: '24px 0 0 0',
          borderTop: '1px solid #E2E8F0'
        }}>
          <button
            style={{
              width: '119px',
              height: '30px',
              background: '#FFFFFF',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'box-shadow 0.2s ease-in-out',
              fontFamily: 'Inter',
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: '20px',
              lineHeight: '24px',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            +
          </button>
        </div>
      </Card>
    </div>
  );
};

export default FlightAssignments;