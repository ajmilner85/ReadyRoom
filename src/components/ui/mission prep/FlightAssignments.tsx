import React, { useState, useEffect } from 'react';
import { Card } from '../card';
import FlightAssignmentCard from '../flight cards/FlightAssignmentCard';
import type { Pilot } from '../../../types/PilotTypes';

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
              <FlightAssignmentCard
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