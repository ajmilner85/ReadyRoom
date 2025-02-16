import React from 'react';
import { Card } from '../card';

interface MissionFlightCardProps {
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

const MissionFlightCard: React.FC<MissionFlightCardProps> = ({
  callsign,
  flightNumber,
  pilots,
  midsA = 'N/A',
  midsB = 'N/A'
}) => {
  const lead = pilots.find(p => p.dashNumber === "1") || pilots[0];
  const wingmen = pilots.filter(p => p !== lead);

  return (
    <div style={{
      position: 'relative',
      boxSizing: 'border-box',
      width: '442px',
      height: '100px',
      padding: '6px',
      backgroundColor: '#FFFFFF',
      borderRadius: '8px',
      fontFamily: 'Inter, sans-serif',
      userSelect: 'none',
      boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
      opacity: 1,
    }}>
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
            style={{ fontSize: '36px', fontWeight: 700, lineHeight: '44px', color: '#1E1E1E' }}
            title={`${lead.callsign}`}
          >
            {lead.boardNumber}
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
            <div key={pilot.boardNumber} 
                 style={{
                   display: 'flex',
                   alignItems: 'center',
                   height: '24px',
                 }}>
              <span style={{ fontSize: '12px', fontWeight: 300, width: '28px', color: '#000000' }}>
                {flightNumber}-{pilot.dashNumber}
              </span>
              <span 
                style={{ fontSize: '20px', fontWeight: 700, marginLeft: '29px', color: '#1E1E1E' }}
                title={`${pilot.callsign}`}
              >
                {pilot.boardNumber}
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

interface FlightAssignmentsProps {
  width: string;
}

const FlightAssignments: React.FC<FlightAssignmentsProps> = ({ width }) => {
  // Example flight data - will be replaced with actual flights
  const exampleFlights = [
    {
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
    }
  ];

  return (
    <div style={{ width }}>
      <Card 
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflowY: 'hidden',
          boxSizing: 'border-box'
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
            {exampleFlights.map((flight, index) => (
              <MissionFlightCard
                key={index}
                callsign={flight.callsign}
                flightNumber={flight.flightNumber}
                pilots={flight.pilots}
                midsA={flight.midsA}
                midsB={flight.midsB}
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