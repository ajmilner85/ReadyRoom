import { useState, useEffect } from 'react';
import { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import type { Pilot } from '../types/PilotTypes';
import type { MissionCommanderInfo } from '../types/MissionCommanderTypes';
import { removePilotFromAllFlights, swapPilots, handleMissionCommanderCheck } from './dragDropUtils';

interface AssignedPilot extends Pilot {
  dashNumber: string;
  attendanceStatus?: 'accepted' | 'tentative';
}

interface UseDragDropProps {
  missionCommander: MissionCommanderInfo | null;
  setMissionCommander: (commander: MissionCommanderInfo | null) => void;
  assignedPilots: Record<string, AssignedPilot[]>;
  setAssignedPilots: (pilots: Record<string, AssignedPilot[]>) => void;
}

export const useDragDrop = ({
  missionCommander,
  setMissionCommander,
  assignedPilots,
  setAssignedPilots
}: UseDragDropProps) => {
  const [draggedPilot, setDraggedPilot] = useState<AssignedPilot | null>(null);
  const [dragSource, setDragSource] = useState<'tile' | 'list' | null>(null);

  // Add a strong horizontal scroll lock during drag operations
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      body.dragging {
        overflow-x: hidden !important;
      }
      
      body.dragging *:not(.aircraft-tile-container):not(.aircraft-tile-container *) {
        cursor: grabbing !important;
      }
      
      body.dragging .pilots-scroll-container, 
      body.dragging .qualification-group {
        overflow-x: hidden !important;
      }
      
      body.dragging .aircraft-tile-container,
      body.dragging .aircraft-tile-container * {
        transform: none !important;
        transition: none !important;
      }
    `;
    document.head.appendChild(styleElement);
  
    return () => {
      document.head.removeChild(styleElement);
      document.body.classList.remove('dragging');
    };
  }, []);  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === 'Pilot') {      
      const pilotData = event.active.data.current;
        const pilot: AssignedPilot = {
        ...pilotData.pilot,
        dashNumber: pilotData.pilot.dashNumber || '',
        attendanceStatus: pilotData.pilot.attendanceStatus,
        rollCallStatus: pilotData.pilot.rollCallStatus
      };
      setDraggedPilot(pilot);
      setDragSource(pilotData.currentFlightId ? 'tile' : 'list');
      document.body.classList.add('dragging');
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    document.body.classList.remove('dragging');

    if (!over) {
      // Handle dropping outside valid drop zones
      if (active.data.current?.type === 'Pilot' && active.data.current.currentFlightId) {
        const pilot = active.data.current.pilot;
        // Pass undefined for flightId and dashNumber to indicate removal
        const newMissionCommander = handleMissionCommanderCheck(
          pilot.boardNumber, 
          undefined, 
          undefined, 
          missionCommander
        );
        if (newMissionCommander !== missionCommander) {
          setMissionCommander(newMissionCommander);
        }
        setAssignedPilots(removePilotFromAllFlights(pilot.boardNumber, assignedPilots));
      }
      setDraggedPilot(null);
      setDragSource(null);
      return;
    }

    // Handle pilot being dropped on a specific flight position
    if (active.data.current?.type === 'Pilot' && draggedPilot && over.data.current) {
      const pilot = draggedPilot;
      const overId = over.id.toString();

      if (overId.startsWith('flight-') && overId.includes('-position-')) {
        // Extract the true flight ID from the drop target ID 
        // The format is flight-{flightId}-position-{dashNumber}
        // But flightId itself may contain hyphens (e.g., extracted-timestamp-index)
        // So we parse more carefully
        
        const positionIndex = overId.indexOf('-position-');
        if (positionIndex === -1) {
          console.error('Invalid drop target ID format:', overId);
          return;
        }

        // Extract the flight ID part between 'flight-' and '-position-'
        const flightIdPart = overId.substring(7, positionIndex);
        // Extract the dash number after '-position-'
        const dashNumber = overId.substring(positionIndex + 10);
        
        // Use currentFlightId from the active element's data
        const currentFlightId = active.data.current.currentFlightId;        // First ensure the pilot is completely removed from any flights they might be in
        // This is important to prevent duplicates
        let updatedPilots = removePilotFromAllFlights(pilot.boardNumber, assignedPilots);

        // Check if target position has a pilot
        const targetData = over.data.current as { currentPilot?: AssignedPilot };
        
        if (targetData.currentPilot && targetData.currentPilot.boardNumber) {
          console.log('Target already has pilot:', targetData.currentPilot.callsign);
          
          // If target position pilot is the current pilot, do nothing
          if (targetData.currentPilot.boardNumber === pilot.boardNumber) {
            setDraggedPilot(null);
            setDragSource(null);
            return;
          }

          // Store the displaced pilot - we'll need to assign them elsewhere
          const displacedPilot = { ...targetData.currentPilot };
          
          // Remove the displaced pilot from any position
          updatedPilots = removePilotFromAllFlights(displacedPilot.boardNumber, updatedPilots);
            // Add the dragged pilot to the target position
          if (!updatedPilots[flightIdPart]) {
            updatedPilots[flightIdPart] = [];
          }
          
          updatedPilots[flightIdPart].push({
            ...pilot,
            dashNumber,
            attendanceStatus: pilot.attendanceStatus
          });
          
          // If the dragged pilot came from a tile, put the displaced pilot back in that position
          if (currentFlightId) {
            if (!updatedPilots[currentFlightId]) {
              updatedPilots[currentFlightId] = [];
            }
            
            updatedPilots[currentFlightId].push({
              ...displacedPilot,
              dashNumber: pilot.dashNumber
            });
          }
          
          console.log('Updated assignments after swap:', updatedPilots);
          
          // Apply the pilots update first, then check for mission commander updates
          // This ensures that getMissionCommanderCandidates will have the latest pilot positions 
          // when determining eligibility
          setAssignedPilots(updatedPilots);
          
          // Now update mission commander status after the positions are updated
          // This is critical for when pilots are moved back to -1 positions
          const newMissionCommander = handleMissionCommanderCheck(
            pilot.boardNumber,
            flightIdPart,
            dashNumber,
            missionCommander
          );
          
          if (newMissionCommander !== missionCommander) {
            console.log('Mission commander status updated:', newMissionCommander);
            setMissionCommander(newMissionCommander);
          }
          
          // Also check the displaced pilot
          if (displacedPilot.boardNumber === missionCommander?.boardNumber) {
            const displacedMissionCommander = handleMissionCommanderCheck(
              displacedPilot.boardNumber,
              currentFlightId,
              pilot.dashNumber,
              missionCommander
            );
              
            if (displacedMissionCommander !== missionCommander && displacedMissionCommander !== newMissionCommander) {
              console.log('Displaced pilot mission commander status updated:', displacedMissionCommander);
              setMissionCommander(displacedMissionCommander);
            }
          }
        } else {
          // No pilot in target position, simply add to the target position
          if (!updatedPilots[flightIdPart]) {
            updatedPilots[flightIdPart] = [];
          }          updatedPilots[flightIdPart].push({
            ...pilot,
            dashNumber,
            // Explicitly preserve the attendance status
            attendanceStatus: pilot.attendanceStatus
          });
          
          console.log('[DEBUG] Added pilot to empty position:', updatedPilots);
          console.log('[DEBUG] Pilot attendance status being added:', pilot.attendanceStatus);
          console.log('[DEBUG] Updated pilots in this flight:', updatedPilots[flightIdPart]);
          
          // Apply the pilots update first, then check for mission commander
          setAssignedPilots(updatedPilots);
          
          // Update mission commander status after positions are updated
          const newMissionCommander = handleMissionCommanderCheck(
            pilot.boardNumber,
            flightIdPart,
            dashNumber,
            missionCommander
          );
          
          if (newMissionCommander !== missionCommander) {
            console.log('Mission commander status updated:', newMissionCommander);
            setMissionCommander(newMissionCommander);
          }
        }
      }
    }

    setDraggedPilot(null);
    setDragSource(null);
  };

  return {
    draggedPilot,
    dragSource,
    handleDragStart,
    handleDragEnd
  };
};

export default useDragDrop;