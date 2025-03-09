import { useState, useEffect, useRef } from 'react';
import { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import type { Pilot } from '../types/PilotTypes';
import type { MissionCommanderInfo } from '../types/MissionCommanderTypes';
import { removePilotFromAllFlights, swapPilots, handleMissionCommanderCheck } from './dragDropUtils';

interface UseDragDropProps {
  missionCommander: MissionCommanderInfo | null;
  setMissionCommander: (commander: MissionCommanderInfo | null) => void;
  assignedPilots: Record<string, Pilot[]>;
  setAssignedPilots: (pilots: Record<string, Pilot[]>) => void;
}

export const useDragDrop = ({
  missionCommander,
  setMissionCommander,
  assignedPilots,
  setAssignedPilots
}: UseDragDropProps) => {
  const [draggedPilot, setDraggedPilot] = useState<Pilot | null>(null);
  const [draggedPilotBoardNumber, setDraggedPilotBoardNumber] = useState<string | null>(null);
  const [currentDragFlightId, setCurrentDragFlightId] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<'tile' | 'list' | null>(null);
  
  // Keep track of initial scroll positions of all containers
  const scrollPositions = useRef<Record<string, number>>({});

  // Add a strong horizontal scroll lock during drag operations
  useEffect(() => {
    // Create a style element for global CSS
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      /* Global styles to prevent horizontal scroll during drag */
      body.dragging {
        overflow-x: hidden !important;
      }
      
      /* More targeted cursor change, exempting aircraft tiles */
      body.dragging *:not(.aircraft-tile-container):not(.aircraft-tile-container *) {
        cursor: grabbing !important;
      }
      
      /* Isolate overflow handling to scroll containers only */
      body.dragging .pilots-scroll-container, 
      body.dragging .qualification-group {
        overflow-x: hidden !important;
      }
      
      /* Preserve aircraft tile styling during drag */
      body.dragging .aircraft-tile-container,
      body.dragging .aircraft-tile-container * {
        transform: none !important;
        transition: none !important;
      }
      
      /* Explicitly prevent any transforms on indicator dots */
      body.dragging .indicator-dots {
        transform: translate(-50%, -60%) !important;
        position: absolute !important;
        left: 50% !important;
        top: 50% !important;
      }
      
      /* Disable transform on original element during drag */
      [data-dragging="true"] {
        transform: none !important;
        transition: none !important;
      }
    `;
    document.head.appendChild(styleElement);
  
    // Function to lock all horizontal scroll
    const lockHorizontalScroll = () => {
      // Store the initial scroll position for each container
      const containers = document.querySelectorAll('.pilots-scroll-container, .qualification-group');
      containers.forEach((container) => {
        if (container instanceof HTMLElement) {
          const id = container.id || Math.random().toString(36);
          if (!container.id) container.id = id;
          scrollPositions.current[id] = container.scrollLeft;
          
          // Lock the horizontal scroll
          container.style.overflowX = 'hidden';
          container.scrollLeft = scrollPositions.current[id];
        }
      });
    };
    
    // Regularly enforce horizontal scroll position during drag
    let interval: number | null = null;
    
    if (draggedPilot) {
      lockHorizontalScroll();
      
      // Set an interval to constantly enforce scroll position
      interval = window.setInterval(() => {
        Object.entries(scrollPositions.current).forEach(([id, pos]) => {
          const elem = document.getElementById(id);
          if (elem && elem.scrollLeft !== pos) {
            elem.scrollLeft = pos;
          }
        });
      }, 10);
    }
    
    return () => {
      if (interval !== null) {
        window.clearInterval(interval);
      }
      document.head.removeChild(styleElement);
    };
  }, [draggedPilot]);

  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === 'Pilot') {
      const pilot = event.active.data.current.pilot;
      setDraggedPilot(pilot);
      setDraggedPilotBoardNumber(pilot.boardNumber);
      
      // Store the current flight ID if the pilot is being dragged from a flight
      const currentFlightId = event.active.data.current.currentFlightId;
      setCurrentDragFlightId(currentFlightId || null);
      
      // Set drag source (tile or list)
      setDragSource(currentFlightId ? 'tile' : 'list');
      
      // Add a class to the body during drag to help with CSS targeting
      document.body.classList.add('dragging');
      
      // Disable pointer events on the source element to prevent scroll issues
      const sourceElement = document.getElementById(`pilot-${pilot.boardNumber}`);
      if (sourceElement) {
        sourceElement.style.pointerEvents = 'none';
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // Remove the dragging class
    document.body.classList.remove('dragging');
    
    // Re-enable pointer events on the source element
    if (active.data.current?.type === 'Pilot') {
      const sourceElement = document.getElementById(`pilot-${active.data.current.pilot.boardNumber}`);
      if (sourceElement) {
        sourceElement.style.pointerEvents = 'auto';
      }
    }

    // If not dropped on a valid target, and it's a pilot being dragged from a flight, remove them
    if (!over) {
      if (active.data.current?.type === 'Pilot' && active.data.current.currentFlightId) {
        const pilot = active.data.current.pilot;
        // Check if this affects the mission commander
        const newMissionCommander = handleMissionCommanderCheck(
          pilot.boardNumber, 
          undefined, 
          missionCommander
        );
        
        if (newMissionCommander !== missionCommander) {
          setMissionCommander(newMissionCommander);
        }
        
        // Remove pilot from their current flight
        setAssignedPilots(
          removePilotFromAllFlights(active.data.current.pilot.boardNumber, assignedPilots)
        );
      }
      resetDragState();
      return;
    }

    // Handle pilot being dropped on a specific flight position
    if (active.data.current?.type === 'Pilot' && draggedPilotBoardNumber) {
      const pilot = active.data.current.pilot;
      const overId = over.id.toString();

      // Check if this is a flight position drop
      if (overId.startsWith('flight-') && overId.includes('-position-')) {
        const [, flightId, , dashNumber] = overId.split('-');

        // Check if we're dropping the pilot on its own position
        const isReturningToSamePosition = 
          currentDragFlightId === flightId && 
          assignedPilots[flightId]?.some(p => 
            p.boardNumber === pilot.boardNumber && p.dashNumber === dashNumber
          );

        // If we're dropping a pilot back to its own position, do nothing
        if (isReturningToSamePosition) {
          resetDragState();
          return;
        }
        
        // If the pilot being moved is the mission commander and is leaving a -1 position
        // or moving to a different position, check if we need to update mission commander
        if (missionCommander && missionCommander.boardNumber === pilot.boardNumber) {
          // If it's moving to another -1 position, update the mission commander info
          if (dashNumber === "1") {
            // Get the flight info for the new position
            const flightElements = document.querySelectorAll('.aircraft-tile-label');
            let newFlightCallsign = "";
            let newFlightNumber = "";
            
            flightElements.forEach(el => {
              if (el.textContent?.includes(`${flightId}`)) {
                const parts = el.textContent.split(' ');
                newFlightCallsign = parts[0] || "";
                newFlightNumber = parts[1]?.split('-')[0] || "";
              }
            });
            
            // Update mission commander with new flight info
            setMissionCommander({
              ...missionCommander,
              flightId,
              flightCallsign: newFlightCallsign,
              flightNumber: newFlightNumber
            });
          } else {
            // If moving to a non-1 position, reset the mission commander
            setMissionCommander(null);
          }
        }

        // Check if target position has a pilot
        const targetPositionPilot = assignedPilots[flightId]?.find(p => p.dashNumber === dashNumber);
        
        if (targetPositionPilot && currentDragFlightId) {
          // If target position pilot is mission commander and is being moved from a -1 position, reset
          if (missionCommander && missionCommander.boardNumber === targetPositionPilot.boardNumber) {
            setMissionCommander(null);
          }
          
          // If pilot is coming from another position, swap the pilots
          const sourcePilot = { 
            flightId: currentDragFlightId, 
            pilot 
          };
          
          const targetPosition = { 
            flightId, 
            dashNumber,
            currentPilot: targetPositionPilot
          };
          
          setAssignedPilots(swapPilots(sourcePilot, targetPosition, assignedPilots));
        } else {
          // If coming from available pilots or target position is empty
          // Check if this affects the mission commander
          if (currentDragFlightId) {
            const newMissionCommander = handleMissionCommanderCheck(
              pilot.boardNumber,
              dashNumber,
              missionCommander
            );
            
            if (newMissionCommander !== missionCommander) {
              setMissionCommander(newMissionCommander);
            }
          }
          
          // First, remove this pilot from any flights they might be in
          const updatedAssignedPilots = removePilotFromAllFlights(pilot.boardNumber, assignedPilots);

          // Add pilot to new position
          setAssignedPilots({
            ...updatedAssignedPilots,
            [flightId]: [
              ...(updatedAssignedPilots[flightId] || []).filter(p => p.dashNumber !== dashNumber),
              {
                ...pilot,
                dashNumber
              }
            ]
          });
        }
      }
    }

    resetDragState();
  };

  const resetDragState = () => {
    setDraggedPilot(null);
    setDraggedPilotBoardNumber(null);
    setCurrentDragFlightId(null);
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