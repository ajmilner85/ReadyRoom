import { useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay } from '@dnd-kit/core';
import FlightCard from './components/flight/FlightCard';
import GridLayout from './components/grid/GridLayout';
import { sampleFlights, Flight } from './types/FlightData';

function App() {
  const [flights, setFlights] = useState<Flight[]>(sampleFlights);
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeFlight = activeId ? flights.find(f => f.id === activeId) : null;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const [sectionType, divisionNumber] = over.id.toString().split('-');
    const flightId = active.id.toString();

    // Map section type to section title
    const sectionTitleMap: { [key: string]: string } = {
      'launch': 'Launch',
      'enroute': 'En Route/Tasking',
      'recovery': 'Recovery',
      'tanker': 'Tanker'
    };

    setFlights(flights.map(flight => {
      if (flight.id === flightId) {
        return {
          ...flight,
          currentSection: sectionTitleMap[sectionType] || '',
          currentDivision: parseInt(divisionNumber)
        };
      }
      return flight;
    }));
  }

  const handleUpdateMemberFuel = (flightId: string, dashNumber: string, newFuel: number) => {
    setFlights(flights.map(flight => {
      if (flight.id === flightId) {
        const updatedMembers = flight.members.map(member => 
          member.dashNumber === dashNumber 
            ? { ...member, fuel: newFuel } 
            : member
        );

        return {
          ...flight,
          members: updatedMembers,
          // Update low state to the minimum fuel value
          lowState: Math.min(...updatedMembers.map(m => m.fuel))
        };
      }
      return flight;
    }));
  };

  return (
    <div style={{ 
      height: '100vh', 
      backgroundColor: '#F0F0F0',
    }}>
      <DndContext
        onDragStart={(event) => setActiveId(event.active.id as string)}
        onDragEnd={handleDragEnd}
      >
        <GridLayout 
          flights={flights} 
          onUpdateMemberFuel={(flightId, dashNumber, newFuel) => 
            handleUpdateMemberFuel(flightId, dashNumber, newFuel)
          } 
        />
        {/* Temporary holding area for unassigned flights */}
        <div style={{ padding: '10px' }}>
          {flights.filter(flight => !flight.currentSection || flight.currentSection === "").map((flight) => (
            <div key={flight.id} style={{ marginBottom: '10px' }}>
              <FlightCard
                {...flight}
                isDragging={activeId === flight.id}
                onUpdateMemberFuel={(dashNumber, newFuel) => 
                  handleUpdateMemberFuel(flight.id, dashNumber, newFuel)
                }
              />
            </div>
          ))}
        </div>
        <DragOverlay>
          {activeFlight ? (
            <FlightCard
              {...activeFlight}
              isDragging={true}
              onUpdateMemberFuel={(dashNumber, newFuel) => 
                handleUpdateMemberFuel(activeFlight.id, dashNumber, newFuel)
              }
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export default App;