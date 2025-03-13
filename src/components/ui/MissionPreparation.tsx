import React, { useState } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import MissionDetails from './mission prep/MissionDetails';
import AvailablePilots from './mission prep/AvailablePilots';
import FlightAssignments from './mission prep/FlightAssignments';
import Communications from './mission prep/Communications';
import PilotDragOverlay from './mission-execution/PilotDragOverlay';
import { pilots } from '../../types/PilotTypes';
import type { Event } from '../../types/EventTypes';
import type { Pilot } from '../../types/PilotTypes';
import type { MissionCommanderInfo } from '../../types/MissionCommanderTypes';
import { SAMPLE_EVENTS } from '../../data/sampleEvents';
import { getMissionCommanderCandidates } from '../../utils/dragDropUtils';
import { useDragDrop } from '../../utils/useDragDrop';

interface ExtractedFlight {
  name: string;
  units: {
    name: string;
    type: string;
    onboard_num: string;
    callsign?: { [key: number]: string | number } | string;
    fuel: number;
  }[];
}

interface AssignedPilot extends Pilot {
  dashNumber: string;
}

const CARD_WIDTH = '550px';

const MissionPreparation: React.FC = () => {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [availablePilots] = useState(pilots);
  const [assignedPilots, setAssignedPilots] = useState<Record<string, AssignedPilot[]>>({});
  const [missionCommander, setMissionCommander] = useState<MissionCommanderInfo | null>(null);
  const [extractedFlights, setExtractedFlights] = useState<ExtractedFlight[]>([]);

  // Use our custom hook for drag and drop functionality
  const { draggedPilot, dragSource, handleDragStart, handleDragEnd } = useDragDrop({
    missionCommander,
    setMissionCommander,
    assignedPilots: assignedPilots as Record<string, Pilot[]>,
    setAssignedPilots: (pilots: Record<string, Pilot[]>) => 
      setAssignedPilots(pilots as Record<string, AssignedPilot[]>)
  });

  // Function to get mission commander candidates from pilots in -1 positions
  const getMissionCommanderCandidatesWrapper = () => {
    return getMissionCommanderCandidates(assignedPilots);
  };

  // Handle extracted flights from AircraftGroups
  const handleExtractedFlights = (flights: ExtractedFlight[]) => {
    setExtractedFlights(flights);
  };

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToWindowEdges]} 
    >
      <div style={{ 
          backgroundColor: '#F0F4F8', 
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '20px',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}>
        <div style={{
            display: 'flex',
            gap: '20px',
            height: 'calc(100vh - 40px)',
            position: 'relative',
            zIndex: 1,
            maxWidth: '2240px',
            width: 'min(100%, 2240px)',
            boxSizing: 'border-box',
            justifyContent: 'center',
            overflowX: 'hidden'
          }}>
          <MissionDetails 
            width={CARD_WIDTH} 
            events={SAMPLE_EVENTS}
            selectedEvent={selectedEvent}
            onEventSelect={setSelectedEvent}
            missionCommander={missionCommander}
            getMissionCommanderCandidates={getMissionCommanderCandidatesWrapper}
            setMissionCommander={setMissionCommander}
            onExtractedFlights={handleExtractedFlights}
          />
          <AvailablePilots 
            width={CARD_WIDTH}
            pilots={availablePilots}
            selectedEvent={selectedEvent}
            assignedPilots={assignedPilots}
          />
          <FlightAssignments 
            width={CARD_WIDTH} 
            assignedPilots={assignedPilots}
            missionCommander={missionCommander}
            extractedFlights={extractedFlights}
          />

          <Communications width={CARD_WIDTH} />
        </div>
      </div>

      <DragOverlay 
        dropAnimation={null} 
        modifiers={[restrictToWindowEdges]}
        zIndex={9999}
      >
        <PilotDragOverlay 
          draggedPilot={draggedPilot} 
          dragSource={dragSource} 
        />
      </DragOverlay>
    </DndContext>
  );
};

export default MissionPreparation;