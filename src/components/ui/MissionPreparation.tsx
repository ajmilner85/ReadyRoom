import React, { useState, useEffect } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import MissionDetails from './mission prep/MissionDetails';
import AvailablePilots from './mission prep/AvailablePilots';
import FlightAssignments from './mission prep/FlightAssignments';
import Communications from './mission prep/Communications';
import { pilots } from '../../types/PilotTypes';
import type { Event } from '../../types/EventTypes';
import type { Pilot } from '../../types/PilotTypes';

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

// Define a type for the mission commander
interface MissionCommanderInfo {
  boardNumber: string;
  callsign: string;
  flightId: string;
  flightCallsign: string;
  flightNumber: string;
}

const MissionPreparation: React.FC = () => {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [draggedPilot, setDraggedPilot] = useState<Pilot | null>(null);
  const [availablePilots] = useState(pilots);
  const [assignedPilots, setAssignedPilots] = useState<Record<string, Pilot[]>>({});
  // Add reference for the current flight ID of a dragged pilot 
  const [currentDragFlightId, setCurrentDragFlightId] = useState<string | null>(null);
  const [draggedPilotBoardNumber, setDraggedPilotBoardNumber] = useState<string | null>(null);
  // Track the source of the drag (tile or list)
  const [dragSource, setDragSource] = useState<'tile' | 'list' | null>(null);
  // Add state for mission commander
  const [missionCommander, setMissionCommander] = useState<MissionCommanderInfo | null>(null);

  // Keep track of initial scroll positions of all containers
  const scrollPositions = React.useRef<Record<string, number>>({});

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

  // Find a pilot by board number across all flights
  const findPilotInFlights = (boardNumber: string): { flightId: string; pilot: Pilot; } | null => {
    for (const [flightId, flightPilots] of Object.entries(assignedPilots)) {
      const pilot = flightPilots.find(p => p.boardNumber === boardNumber);
      if (pilot) {
        return { flightId, pilot };
      }
    }
    return null;
  };

  // Before we start dragging, remove this pilot from any flights they're in
  const removePilotFromAllFlights = (boardNumber: string) => {
    setAssignedPilots(prev => {
      const updated = { ...prev };
      
      // Check all flights for this pilot
      Object.keys(updated).forEach(flightId => {
        // Remove this pilot from the flight
        updated[flightId] = updated[flightId].filter(p => p.boardNumber !== boardNumber);
        
        // If flight is now empty, remove it
        if (updated[flightId].length === 0) {
          delete updated[flightId];
        }
      });
      
      return updated;
    });
  };

  // Swap pilots between two positions
  const swapPilots = (
    source: { flightId: string; pilot: Pilot },
    target: { flightId: string; dashNumber: string; currentPilot?: Pilot }
  ) => {
    setAssignedPilots(prev => {
      const updated = { ...prev };
      
      // Remove source pilot from their flight
      if (source.flightId) {
        updated[source.flightId] = (updated[source.flightId] || [])
          .filter(p => p.boardNumber !== source.pilot.boardNumber);
      }
      
      // Create target flight array if it doesn't exist
      if (!updated[target.flightId]) {
        updated[target.flightId] = [];
      }
      
      // Remove any pilot currently in the target position
      updated[target.flightId] = updated[target.flightId]
        .filter(p => p.dashNumber !== target.dashNumber);
      
      // Add source pilot to target position
      updated[target.flightId].push({
        ...source.pilot,
        dashNumber: target.dashNumber
      });
      
      // If target had a pilot and it's a different pilot than source,
      // and source wasn't in the available pilots list,
      // then add that pilot to source position
      if (target.currentPilot && 
          target.currentPilot.boardNumber !== source.pilot.boardNumber &&
          source.flightId) {
        
        updated[source.flightId].push({
          ...target.currentPilot,
          dashNumber: source.pilot.dashNumber
        });
      }
      
      // Clean up any empty flights
      Object.keys(updated).forEach(id => {
        if (updated[id].length === 0) {
          delete updated[id];
        }
      });
      
      return updated;
    });
  };

  // Get all eligible mission commander candidates (pilots in -1 positions)
  const getMissionCommanderCandidates = () => {
    const candidates: { 
      label: string; 
      value: string;
      boardNumber: string;
      callsign: string;
      flightId: string;
      flightCallsign: string;
      flightNumber: string;
    }[] = [];

    Object.entries(assignedPilots).forEach(([flightId, flightPilots]) => {
      // Find all flights that have their -1 position filled
      const dashOnePilot = flightPilots.find(p => p.dashNumber === "1");
      
      if (dashOnePilot) {
        // Find the flight details of this pilot by manually searching through flights
        let flightDetails = { callsign: "", number: "" };
        
        // First look for the flight in our flights state
        document.querySelectorAll('.aircraft-tile-label').forEach(element => {
          if (element.textContent && element.textContent.includes(`-1`) && 
              element.closest('[data-drop-id]')?.getAttribute('data-drop-id') === `flight-${flightId}-position-1`) {
            const text = element.textContent.trim();
            const parts = text.split(' ');
            if (parts.length >= 2) {
              flightDetails.callsign = parts[0];
              flightDetails.number = parts[1].split('-')[0];
            }
          }
        });
        
        // Create a candidate entry with the correct format: "CALLSIGN FLIGHT-POSITION | BOARDNUM PILOTCALLSIGN"
        const label = `${flightDetails.callsign} ${flightDetails.number}-1 | ${dashOnePilot.boardNumber} ${dashOnePilot.callsign}`;
        
        candidates.push({
          label,
          value: dashOnePilot.boardNumber,
          boardNumber: dashOnePilot.boardNumber,
          callsign: dashOnePilot.callsign,
          flightId,
          flightCallsign: flightDetails.callsign,
          flightNumber: flightDetails.number
        });
      }
    });

    return candidates;
  };

  // Handle when a pilot is removed completely or moved to a non-lead position
  const handleMissionCommanderCheck = (boardNumber: string, newDashNumber?: string) => {
    // Check if the affected pilot is the mission commander
    if (missionCommander && missionCommander.boardNumber === boardNumber) {
      // If the pilot is moved to a non-lead position or removed completely, reset mission commander
      if (!newDashNumber || newDashNumber !== "1") {
        setMissionCommander(null);
      }
    }
  };

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
        handleMissionCommanderCheck(pilot.boardNumber);
        // Remove pilot from their current flight
        removePilotFromAllFlights(active.data.current.pilot.boardNumber);
      }
      setDraggedPilot(null);
      setDraggedPilotBoardNumber(null);
      setCurrentDragFlightId(null);
      setDragSource(null);
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
          setDraggedPilot(null);
          setDraggedPilotBoardNumber(null);
          setCurrentDragFlightId(null);
          setDragSource(null);
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
            setMissionCommander(prev => ({
              ...prev!,
              flightId,
              flightCallsign: newFlightCallsign,
              flightNumber: newFlightNumber
            }));
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
          
          swapPilots(sourcePilot, targetPosition);
        } else {
          // If coming from available pilots or target position is empty
          // Check if this affects the mission commander
          if (currentDragFlightId) {
            handleMissionCommanderCheck(pilot.boardNumber);
          }
          
          // First, remove this pilot from any flights they might be in
          removePilotFromAllFlights(pilot.boardNumber);

          // Add pilot to new position
          setAssignedPilots(prev => {
            const updated = { ...prev };
            if (!updated[flightId]) {
              updated[flightId] = [];
            }
            
            // Remove any pilot already in this position
            updated[flightId] = updated[flightId].filter(p => p.dashNumber !== dashNumber);
            
            // Add the pilot with their new dash number
            updated[flightId].push({
              ...pilot,
              dashNumber
            });
            
            return updated;
          });
        }
      }
    }

    setDraggedPilot(null);
    setDraggedPilotBoardNumber(null);
    setCurrentDragFlightId(null);
    setDragSource(null);
  };

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToWindowEdges]} // Only restrict to window edges, allow horizontal movement
    >
      <div style={{ 
          backgroundColor: '#F0F4F8', 
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '20px',
          boxSizing: 'border-box',
          overflow: 'hidden' // Prevent any overflow at root level
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
            overflowX: 'hidden' // Prevent horizontal scroll
          }}>
          <MissionDetails 
            width={CARD_WIDTH} 
            events={INITIAL_EVENTS}
            selectedEvent={selectedEvent}
            onEventSelect={setSelectedEvent}
            missionCommander={missionCommander}
            getMissionCommanderCandidates={getMissionCommanderCandidates}
            setMissionCommander={setMissionCommander}
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
            onPilotAssigned={(flightId, pilot) => {
              setAssignedPilots(prev => ({
                ...prev,
                [flightId]: [...(prev[flightId] || []), pilot]
              }));
            }}
          />
          <Communications width={CARD_WIDTH} />
        </div>
      </div>

      <DragOverlay 
        dropAnimation={null} 
        modifiers={[restrictToWindowEdges]}
        zIndex={9999}
      >
        {draggedPilot && (
          dragSource === 'tile' ? (
            // Mini Aircraft Tile design for when dragging from a tile
            <div
              style={{
                width: '70px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                backgroundColor: '#F9FAFB', // LIGHT_SLATE_GREY
                borderRadius: '8px',
                boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.1)',
                padding: '6px',
                pointerEvents: 'none',
                cursor: 'grabbing',
                opacity: 0.9
              }}
            >
              <img
                src="/src/assets/Aircraft Icon.svg"
                alt="Aircraft"
                style={{
                  width: '24px',
                  height: '32px',
                  filter: 'drop-shadow(0px 2px 2px rgba(0, 0, 0, 0.1))',
                  marginBottom: '2px'
                }}
              />
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 400,
                  textAlign: 'center',
                  color: '#646F7E',
                  marginBottom: '1px'
                }}
              >
                {draggedPilot.boardNumber}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  textAlign: 'center',
                  color: '#000000',
                }}
              >
                {draggedPilot.callsign}
              </div>
            </div>
          ) : (
            // Regular row design for when dragging from the available pilots list
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                height: '24px',
                padding: '0 10px',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25)',
                opacity: 0.9,
                cursor: 'grabbing',
                pointerEvents: 'none', // Prevent the overlay from interfering with drops
                transform: 'translateZ(0)', // Force GPU acceleration
                willChange: 'transform', // Performance optimization
                width: 'auto',
                minWidth: '180px', // Ensure minimum width to look good from both sources
                maxWidth: '200px' // Limit width to make it more compact
              }}
            >
              <span style={{ 
                width: '50px', 
                textAlign: 'center', 
                fontSize: '16px', 
                color: '#646F7E',
                marginRight: '8px' 
              }}>
                {draggedPilot.boardNumber}
              </span>
              <span style={{ 
                fontSize: '16px', 
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {draggedPilot.callsign}
              </span>
            </div>
          )
        )}
      </DragOverlay>
    </DndContext>
  );
};

export default MissionPreparation;