import React, { useState } from 'react';
import { DndContext, DragEndEvent } from '@dnd-kit/core';
import GridLayout from './components/layout/GridLayout';
import { SectionProvider } from './components/layout/SectionContext';
import { sampleFlights } from './types/FlightData';
import type { Flight } from './types/FlightData';

const App: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>(sampleFlights);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    // Handle flight card drops
    if (active.data.current?.type === 'FlightCard' && over.id) {
      const flight = active.data.current.flight;
      const [section, divisionId] = over.id.toString().split('-');
      
      setFlights(prevFlights => {
        return prevFlights.map(f => {
          if (f.id === flight.id) {
            // Update the flight's position based on where it was dropped
            return {
              ...f,
              currentSection: section === 'tanker' ? 'Tanker' :
                            section === 'launch' ? 'Launch' :
                            section === 'enroute' ? 'En Route/Tasking' :
                            section === 'recovery' ? 'Recovery' : f.currentSection,
              currentDivision: parseInt(divisionId)
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

  return (
    <SectionProvider>
      <DndContext onDragEnd={handleDragEnd}>
        <div className="min-h-screen bg-slate-50 p-4">
          <GridLayout 
            flights={flights}
            onUpdateMemberFuel={handleUpdateMemberFuel}
          />
        </div>
      </DndContext>
    </SectionProvider>
  );
};

export default App;