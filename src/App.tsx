import React, { useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import GridLayout from './components/layout/GridLayout';
import { SectionProvider } from './components/layout/SectionContext';
import { sampleFlights } from './types/FlightData';
import type { Flight } from './types/FlightData';
import FlightCard from './components/flight/FlightCard';

const App: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>(sampleFlights);
  const [activeId, setActiveId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (!over) return;

    // Handle flight card drops
    if (active.data.current?.type === 'FlightCard' && over.id) {
      const flight = active.data.current.flight;
      const [section, ...divisionParts] = over.id.toString().split('-');
      const divisionId = divisionParts.join('-'); // Rejoin in case there are dashes in the ID
      
      setFlights(prevFlights => {
        return prevFlights.map(f => {
          if (f.id === flight.id) {
            // Convert division ID to number, or use special values for Spin/Charlie
            let divisionNumber: number;
            if (divisionId === 'spin') {
              divisionNumber = -1; // Special value for Spin
            } else if (divisionId === 'charlie') {
              divisionNumber = -2; // Special value for Charlie
            } else {
              divisionNumber = parseInt(divisionId);
            }

            // Update the flight's position based on where it was dropped
            return {
              ...f,
              currentSection: section === 'tanker' ? 'Tanker' :
                            section === 'launch' ? 'Launch' :
                            section === 'enroute' ? 'En Route/Tasking' :
                            section === 'recovery' ? 'Recovery' : f.currentSection,
              currentDivision: divisionNumber
            };
          }
          return f;
        });
      });
    }
  };

  const handleUpdateMemberFuel = (flightId: string, dashNumber: string, newFuel: number) => {
    setFlights(prevFlights => {
      return prevFlights.map(flight => {
        if (flight.id === flightId) {
          // Update the member's fuel state
          const updatedMembers = flight.members.map(member => {
            if (member.dashNumber === dashNumber) {
              return { ...member, fuel: newFuel };
            }
            return member;
          });

          // Calculate new low state
          const newLowState = Math.min(...updatedMembers.map(m => m.fuel));

          return {
            ...flight,
            members: updatedMembers,
            lowState: newLowState
          };
        }
        return flight;
      });
    });
  };

  // Get the active flight for the overlay
  const activeFlight = flights.find(f => f.id === activeId);

  return (
    <SectionProvider>
      <DndContext 
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="min-h-screen bg-slate-50 p-4">
          <GridLayout 
            flights={flights}
            onUpdateMemberFuel={handleUpdateMemberFuel}
          />
          <DragOverlay>
            {activeFlight ? (
              <FlightCard 
                {...activeFlight}
                isDragging={true}
              />
            ) : null}
          </DragOverlay>
        </div>
      </DndContext>
    </SectionProvider>
  );
};

export default App;