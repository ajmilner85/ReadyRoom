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

const MissionPreparation: React.FC = () => {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [draggedPilot, setDraggedPilot] = useState<Pilot | null>(null);
  const [availablePilots] = useState(pilots);
  const [assignedPilots, setAssignedPilots] = useState<Record<string, Pilot[]>>({});

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
      
      body.dragging * {
        cursor: grabbing !important;
        overflow-x: hidden !important;
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
      setDraggedPilot(event.active.data.current.pilot);
      // Add a class to the body during drag to help with CSS targeting
      document.body.classList.add('dragging');
      
      // Disable pointer events on the source element to prevent scroll issues
      const sourceElement = document.getElementById(`pilot-${event.active.data.current.pilot.boardNumber}`);
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

    if (!over) {
      setDraggedPilot(null);
      return;
    }

    // Handle pilot being dropped on a flight
    if (active.data.current?.type === 'Pilot' && over.id.toString().startsWith('flight-')) {
      const pilot = active.data.current.pilot;
      const flightId = over.id.toString().replace('flight-', '');
      
      // Update assigned pilots - find first empty slot
      setAssignedPilots(prev => {
        const updatedAssignments = { ...prev };
        if (!updatedAssignments[flightId]) {
          updatedAssignments[flightId] = [];
        }
        // Only add if pilot isn't already in the flight
        if (!updatedAssignments[flightId].find(p => p.boardNumber === pilot.boardNumber)) {
          updatedAssignments[flightId].push(pilot);
        }
        return updatedAssignments;
      });
    }

    setDraggedPilot(null);
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
              width: 'auto'
            }}
          >
            <span style={{ width: '62px', textAlign: 'center', fontSize: '16px', color: '#646F7E' }}>
              {draggedPilot.boardNumber}
            </span>
            <span style={{ width: '120px', fontSize: '16px', fontWeight: 700 }}>
              {draggedPilot.callsign}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

export default MissionPreparation;