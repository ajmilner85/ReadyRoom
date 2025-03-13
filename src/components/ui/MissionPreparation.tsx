import React, { useCallback, useState, useRef, useEffect } from 'react';
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
import { getMissionCommanderCandidates, findPilotInFlights } from '../../utils/dragDropUtils';
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
  
  // Use useRef to track extracted flights to prevent infinite update loops
  const [extractedFlights, setExtractedFlights] = useState<ExtractedFlight[]>([]);
  const processedMizRef = useRef<boolean>(false);
  
  // Use our custom hook for drag and drop functionality
  const { draggedPilot, dragSource, handleDragStart, handleDragEnd } = useDragDrop({
    missionCommander,
    setMissionCommander,
    assignedPilots,
    setAssignedPilots
  });

  // Get mission commander candidates with additional flight info
  const getMissionCommanderCandidatesWrapper = useCallback(() => {
    const candidates = getMissionCommanderCandidates(assignedPilots);
    return candidates.map(candidate => {
      const pilotAssignment = findPilotInFlights(candidate.boardNumber, assignedPilots);
      if (!pilotAssignment) return null;

      // Get flight info from the flight ID
      let flightCallsign = "";
      let flightNumber = "";
      
      // Try to find the corresponding flight in assigned pilots
      for (const [flightId, pilots] of Object.entries(assignedPilots)) {
        if (flightId === pilotAssignment.flightId && pilots.length > 0) {
          const flightParts = flightId.split('-');
          if (flightParts.length > 1) {
            flightCallsign = flightParts[0];
            flightNumber = flightParts[1];
          }
          break;
        }
      }

      return {
        label: `${candidate.callsign} (${candidate.boardNumber})`,
        value: candidate.boardNumber,
        boardNumber: candidate.boardNumber,
        callsign: candidate.callsign,
        flightId: pilotAssignment.flightId,
        flightCallsign: flightCallsign,
        flightNumber: flightNumber
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
  }, [assignedPilots]);

  // Handle extracted flights from AircraftGroups with safeguard against infinite loops
  const handleExtractedFlights = useCallback((flights: ExtractedFlight[]) => {
    if (flights.length > 0 && !processedMizRef.current) {
      processedMizRef.current = true;
      setExtractedFlights(flights);
    }
  }, []);
  
  // Reset the processed flag when component unmounts
  useEffect(() => {
    return () => {
      processedMizRef.current = false;
    };
  }, []);

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