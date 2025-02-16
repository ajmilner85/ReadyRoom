import React, { useState } from 'react';
import MissionDetails from './mission prep/MissionDetails';
import AvailablePilots from './mission prep/AvailablePilots';
import FlightAssignments from './mission prep/FlightAssignments';
import Communications from './mission prep/Communications';
import { pilots } from '../../types/PilotTypes';
import type { Event } from '../../types/EventTypes';

// Using the same dummy event data from EventsManagement for now
const INITIAL_EVENTS: Event[] = [
  {
    id: "1",
    title: "Training Cycle 25-1 Week 4 – A2G1: Bombs",
    description: "Welcome to Week 4 – time to drop some bombs! We'll be launching from the boat to drop a pair of JDAMs and a pair of LGBs each.",
    datetime: "2025-01-30T20:30:00",
    status: "upcoming",
    creator: {
      boardNumber: "637",
      callsign: "Prince",
      billet: "Train OIC"
    },
    attendance: {
      accepted: [
        { boardNumber: "637", callsign: "Prince", billet: "Train OIC" },
        { boardNumber: "551", callsign: "Boot" },
        { boardNumber: "523", callsign: "Grass" }
      ],
      declined: [
        { boardNumber: "556", callsign: "Zapp", billet: "OPS O" },
        { boardNumber: "771", callsign: "Ray" }
      ],
      tentative: []
    },
    restrictedTo: ["Cadre"]
  },
  {
    id: "2",
    title: "Training Cycle 25-1 Week 5 – A2G2: Rockets",
    description: "Rocket week! Time to practice those dive angles.",
    datetime: "2025-02-06T20:30:00",
    status: "upcoming",
    creator: {
      boardNumber: "637",
      callsign: "Prince",
      billet: "Train OIC"
    },
    attendance: {
      accepted: [
        { boardNumber: "637", callsign: "Prince", billet: "Train OIC" },
        { boardNumber: "551", callsign: "Boot" }
      ],
      declined: [],
      tentative: [
        { boardNumber: "523", callsign: "Grass" }
      ]
    },
    restrictedTo: ["Cadre"]
  }
];

const CARD_WIDTH = '550px';

const MissionPreparation: React.FC = () => {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  return (
    <div 
      style={{ 
        backgroundColor: '#F0F4F8', 
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px',
        boxSizing: 'border-box'
      }}
    >
      <div 
        style={{
          display: 'flex',
          gap: '20px',
          height: 'calc(100vh - 40px)',
          position: 'relative',
          zIndex: 1,
          maxWidth: '2240px',  // Allow for 4 columns of 550px + gaps
          width: 'min(100%, 2240px)',
          boxSizing: 'border-box',
          justifyContent: 'center'  // Center the columns
        }}
      >
        <MissionDetails 
          width={CARD_WIDTH} 
          events={INITIAL_EVENTS}
          selectedEvent={selectedEvent}
          onEventSelect={setSelectedEvent}
        />
        <AvailablePilots 
          width={CARD_WIDTH}
          pilots={pilots}
          selectedEvent={selectedEvent}
        />
        <FlightAssignments width={CARD_WIDTH} />
        <Communications width={CARD_WIDTH} />
      </div>
    </div>
  );
};

export default MissionPreparation;