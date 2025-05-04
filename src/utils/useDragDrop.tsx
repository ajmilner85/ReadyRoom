import { useState, useEffect } from 'react';
import { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import type { Pilot } from '../types/PilotTypes';
import type { MissionCommanderInfo } from '../types/MissionCommanderTypes';
import { removePilotFromAllFlights, handleMissionCommanderCheck } from './dragDropUtils';

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
    document.body.classList.remove('dragging');    if (!over) {
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
        
        // Remove pilot from all flights and update state
        const updatedPilots = removePilotFromAllFlights(pilot.boardNumber, assignedPilots);
        setAssignedPilots(updatedPilots);
      }
      setDraggedPilot(null);
      setDragSource(null);
      return;
    }// Handle pilot being dropped on a specific position (flight or support role)
    if (active.data.current?.type === 'Pilot' && draggedPilot && over.data.current) {
      const pilot = draggedPilot;
      const overId = over.id.toString();

      // Handle Flight position drops
      if (overId.startsWith('flight-') && overId.includes('-position-')) {
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
        const currentFlightId = active.data.current.currentFlightId;
        // First ensure the pilot is completely removed from any flights they might be in
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
        } else {          // No pilot in target position, simply add to the target position
          if (!updatedPilots[flightIdPart]) {
            updatedPilots[flightIdPart] = [];
          }
          
          updatedPilots[flightIdPart].push({
            ...pilot,
            dashNumber,
            // Explicitly preserve the attendance status
            attendanceStatus: pilot.attendanceStatus
          });
          
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
      }      // Handle dropping on Support Role Positions
      else if (overId.startsWith('support-') && overId.includes('-position-')) {
        const positionIndex = overId.indexOf('-position-');
        if (positionIndex === -1) {
          console.error('Invalid support role target ID format:', overId);
          return;
        }
        
        // Get data from over element instead of trying to parse it from string
        const targetData = over.data.current as { 
          roleId: string; 
          dashNumber: string;
          currentPilot?: AssignedPilot;
        };
        
        // Use the exact role ID from the data, don't try to parse it
        const roleIdPart = targetData.roleId;
        const dashNumber = targetData.dashNumber;
        
        console.log('[SUPPORT-DEBUG] Support role drop data:', {
          overId,
          roleIdFromData: roleIdPart,
          dashNumberFromData: dashNumber,
          targetData
        });
          // Use currentFlightId from the active element's data (this could be a flight ID or support role ID)
        const currentFlightId = active.data.current.currentFlightId;
        
        // First ensure the pilot is completely removed from any flights/roles they might be in
        let updatedPilots = removePilotFromAllFlights(pilot.boardNumber, assignedPilots);
        
        // Check if target position has a pilot - use the data from the over element
        if (targetData.currentPilot && targetData.currentPilot.boardNumber) {
          console.log('[SUPPORT-DEBUG] Target support role already has pilot:', {
            targetPilot: targetData.currentPilot.callsign,
            targetBoardNumber: targetData.currentPilot.boardNumber,
            draggingPilotBoardNumber: pilot.boardNumber
          });
          
          // If target position pilot is the current pilot, do nothing
          if (targetData.currentPilot.boardNumber === pilot.boardNumber) {
            console.log('[SUPPORT-DEBUG] Same pilot, no action needed');
            setDraggedPilot(null);
            setDragSource(null);
            return;
          }

          // Store the displaced pilot
          const displacedPilot = { ...targetData.currentPilot };
          
          // Remove the displaced pilot from any position
          updatedPilots = removePilotFromAllFlights(displacedPilot.boardNumber, updatedPilots);
            
          // Add the dragged pilot to the target position
          if (!updatedPilots[roleIdPart]) {
            updatedPilots[roleIdPart] = [];
          }
            updatedPilots[roleIdPart].push({
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
          
          // Sort the pilots by dashNumber for consistency
          if (updatedPilots[roleIdPart]) {
            updatedPilots[roleIdPart].sort((a, b) => {
              const aNum = parseInt(a.dashNumber) || 999;
              const bNum = parseInt(b.dashNumber) || 999;
              return aNum - bNum;
            });
          }
          
          if (currentFlightId && updatedPilots[currentFlightId]) {
            updatedPilots[currentFlightId].sort((a, b) => {
              const aNum = parseInt(a.dashNumber) || 999;
              const bNum = parseInt(b.dashNumber) || 999;
              return aNum - bNum;
            });
          }
          
          console.log('[SUPPORT-DEBUG] Updated assignments after support role swap:', {
            roleId: roleIdPart,
            dashNumber,
            updatedPilots: updatedPilots[roleIdPart]
          });
          
          // Apply the pilots update
          setAssignedPilots(updatedPilots);
          
          // Support roles don't affect mission commander status
          
        } else {          // No pilot in target support role position, simply add to the target position
          if (!updatedPilots[roleIdPart]) {
            updatedPilots[roleIdPart] = [];
          }
          
          // Check if this role already has a pilot with this dashNumber
          const existingPilotAtPosition = updatedPilots[roleIdPart].find(p => p.dashNumber === dashNumber);
              console.log('[SUPPORT-DEBUG] Before adding pilot to empty position:', {
            roleIdPart,
            dashNumber,
            existingAtPosition: existingPilotAtPosition,
            updatedPilotsAtRole: updatedPilots[roleIdPart] || []
          });
          
          // Initialize the support role array if it doesn't exist
          if (!updatedPilots[roleIdPart]) {
            updatedPilots[roleIdPart] = [];
          }
          
          // Remove any existing pilot at this dashNumber (if exists)
          if (existingPilotAtPosition) {
            // Remove the existing pilot from this position
            updatedPilots[roleIdPart] = updatedPilots[roleIdPart].filter(p => p.dashNumber !== dashNumber);
          }
            // Add the pilot to the role with the correct dashNumber
          updatedPilots[roleIdPart].push({
            ...pilot,
            dashNumber, // Use the dashNumber from the target position
            attendanceStatus: pilot.attendanceStatus
          });
          
          // Sort the pilots by dashNumber for consistency
          updatedPilots[roleIdPart].sort((a, b) => {
            const aNum = parseInt(a.dashNumber) || 999;
            const bNum = parseInt(b.dashNumber) || 999;
            return aNum - bNum;
          });
          
          console.log('[SUPPORT-DEBUG] Updated assignments after adding to support role:', {
            roleId: roleIdPart,
            dashNumber,
            updatedPilots: updatedPilots[roleIdPart],
            fullPilotData: pilot
          });
          
          // Log support role assignments after the update
          console.log(`[SUPPORT-DEBUG] After updating support role ${roleIdPart}:`, 
            Object.keys(updatedPilots)
              .filter(id => id.startsWith('support-'))
              .reduce((acc: Record<string, any>, key) => {
                acc[key] = updatedPilots[key]?.map(p => ({
                  boardNumber: p.boardNumber,
                  dashNumber: p.dashNumber,
                  callsign: p.callsign
                }));
                return acc;
              }, {})
          );
          
          setAssignedPilots(updatedPilots);
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