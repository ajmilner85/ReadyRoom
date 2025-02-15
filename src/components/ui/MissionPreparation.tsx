import React from 'react';
import MissionDetails from './mission prep/MissionDetails';
import AvailablePilots from './mission prep/AvailablePilots';
import FlightAssignments from './mission prep/FlightAssignments';
import Communications from './mission prep/Communications';

const CARD_WIDTH = '550px';  // Same width as mission coordination page cards

const MissionPreparation: React.FC = () => {
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
        <MissionDetails width={CARD_WIDTH} />
        <AvailablePilots width={CARD_WIDTH} />
        <FlightAssignments width={CARD_WIDTH} />
        <Communications width={CARD_WIDTH} />
      </div>
    </div>
  );
};

export default MissionPreparation;