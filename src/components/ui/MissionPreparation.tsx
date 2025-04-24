// filepath: c:\Users\ajmil\OneDrive\Desktop\pri-fly\src\components\ui\MissionPreparationRefactored.tsx
import React, { useCallback, useEffect } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import MissionDetails from './mission prep/MissionDetails';
import AvailablePilots from './mission prep/AvailablePilots';
import FlightAssignments from './mission prep/FlightAssignments';
import Communications from './mission prep/Communications';
import PilotDragOverlay from './mission-execution/PilotDragOverlay';
import type { Flight, ExtractedFlight } from '../../types/FlightData';
import type { MissionCommanderInfo } from '../../types/MissionCommanderTypes';
import type { Pilot } from '../../types/PilotTypes';
import { useDragDrop } from '../../utils/useDragDrop';
import { autoAssignPilots } from '../../utils/autoAssignUtils';
import { getMissionCommanderCandidatesWithFlightInfo } from '../../utils/missionCommanderUtils';
import { useMissionPrepData } from '../../hooks/useMissionPrepData';
import { useMissionPrepState } from '../../hooks/useMissionPrepState';

interface AssignedPilot extends Pilot {
  dashNumber: string;
}

interface MissionPreparationProps {
  onTransferToMission?: (flights: Flight[]) => void;
  assignedPilots?: Record<string, AssignedPilot[]>;
  onAssignedPilotsChange?: (pilots: Record<string, AssignedPilot[]>) => void;
  missionCommander?: MissionCommanderInfo | null;
  onMissionCommanderChange?: (commander: MissionCommanderInfo | null) => void;
  extractedFlights?: ExtractedFlight[];
  onExtractedFlightsChange?: (flights: ExtractedFlight[]) => void;
  prepFlights?: any[];
  onPrepFlightsChange?: (flights: any[]) => void;
}

const CARD_WIDTH = '550px';

const MissionPreparation: React.FC<MissionPreparationProps> = ({ 
  onTransferToMission,
  assignedPilots: externalAssignedPilots,
  onAssignedPilotsChange,
  missionCommander: externalMissionCommander,
  onMissionCommanderChange,
  extractedFlights: externalExtractedFlights,
  onExtractedFlightsChange,
  prepFlights: externalPrepFlights,
  onPrepFlightsChange
}) => {
  // Use custom hooks to manage data fetching and state
  const {
    events,
    selectedEvent,
    setSelectedEvent,
    activePilots,
    isLoading,
    loadError,
    allPilotQualifications
  } = useMissionPrepData();
  // Use custom hook to manage state
  const {
    assignedPilots,
    setAssignedPilots,
    missionCommander,
    setMissionCommander,
    extractedFlights,
    prepFlights,
    setPrepFlights,
    handleExtractedFlights,
    resetProcessedFlag
  } = useMissionPrepState(
    externalAssignedPilots,
    onAssignedPilotsChange,
    externalMissionCommander,
    onMissionCommanderChange,
    externalExtractedFlights,
    onExtractedFlightsChange,
    externalPrepFlights,
    onPrepFlightsChange
  );

  // Use custom hook for drag and drop functionality
  const { draggedPilot, dragSource, handleDragStart, handleDragEnd } = useDragDrop({
    missionCommander,
    setMissionCommander,
    assignedPilots,
    setAssignedPilots
  });

  // Get mission commander candidates with additional flight info
  const getMissionCommanderCandidatesWrapper = useCallback(() => {
    return getMissionCommanderCandidatesWithFlightInfo(assignedPilots);
  }, [assignedPilots]);

  // Update flights when FlightAssignments updates them
  const handleFlightsChange = useCallback((updatedFlights: any[]) => {
    setPrepFlights(updatedFlights);
  }, [setPrepFlights]);

  // Clear all pilot assignments and the mission commander
  const handleClearAssignments = useCallback(() => {
    setAssignedPilots({});
    setMissionCommander(null);
  }, [setAssignedPilots, setMissionCommander]);

  // Auto-assign pilots to flights according to priority rules
  const handleAutoAssign = useCallback(() => {
    if (!prepFlights || prepFlights.length === 0) {
      console.log("Cannot auto-assign: no flights available");
      return;
    }

    const { newAssignments, suggestedMissionCommander } = autoAssignPilots(
      prepFlights, 
      activePilots, 
      assignedPilots, 
      allPilotQualifications
    );
    
    // Update the assignments
    setAssignedPilots(newAssignments);
    
    // Set mission commander if we found a suitable pilot
    if (suggestedMissionCommander) {
      setMissionCommander(suggestedMissionCommander);
    }
  }, [
    prepFlights,
    activePilots,
    assignedPilots,
    allPilotQualifications,
    setAssignedPilots,
    setMissionCommander
  ]);
  
  // Reset the processed flag when component unmounts
  useEffect(() => {
    return () => {
      resetProcessedFlag();
    };
  }, [resetProcessedFlag]);

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
          padding: '20px 20px 20px 20px',
          boxSizing: 'border-box',
          overflow: 'visible'
        }}>
        <div style={{
            display: 'flex',
            gap: '20px',
            height: 'calc(100vh - 20px)', 
            position: 'relative',
            zIndex: 1,
            maxWidth: '2240px',
            width: 'min(100%, 2240px)',
            boxSizing: 'border-box',
            justifyContent: 'center',
            overflowX: 'auto',
            overflowY: 'visible',
            padding: '15px',
            margin: '-15px',
          }}>
          {isLoading ? (
            <div className="flex items-center justify-center w-full">
              <p className="text-lg">Loading pilots data...</p>
            </div>
          ) : loadError ? (
            <div className="flex items-center justify-center w-full">
              <p className="text-red-500">{loadError}</p>
            </div>
          ) : (
            <>
              <MissionDetails 
                width={CARD_WIDTH} 
                events={events} 
                selectedEvent={selectedEvent}
                onEventSelect={setSelectedEvent}
                missionCommander={missionCommander}
                getMissionCommanderCandidates={getMissionCommanderCandidatesWrapper}
                setMissionCommander={setMissionCommander}
                onExtractedFlights={handleExtractedFlights}
              />
              <AvailablePilots 
                width={CARD_WIDTH}
                pilots={activePilots}
                selectedEvent={selectedEvent}
                assignedPilots={assignedPilots}
                onAutoAssign={handleAutoAssign}
                onClearAssignments={handleClearAssignments}
                pilotQualifications={allPilotQualifications}
              />
              <FlightAssignments 
                width={CARD_WIDTH} 
                assignedPilots={assignedPilots}
                missionCommander={missionCommander}
                extractedFlights={extractedFlights}
                onFlightsChange={handleFlightsChange}
                initialFlights={prepFlights}
              />
              <Communications 
                width={CARD_WIDTH} 
                assignedPilots={assignedPilots}
                onTransferToMission={onTransferToMission}
                flights={prepFlights}
                extractedFlights={extractedFlights}
              />
            </>
          )}
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
