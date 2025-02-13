import React, { useState, useEffect } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import GridLayout from './components/layout/GridLayout';
import { SectionProvider } from './components/layout/SectionContext';
import { sampleFlights, splitFlight, divideFlight, type Flight } from './types/FlightData';
import FlightCard from './components/ui/flight cards/FlightCard';
import SingleFlightCard from './components/ui/flight cards/SingleFlightCard';
import FuelStateDialog from './components/ui/dialogs/FuelStateDialog';
import NavigationBar from './components/ui/NavigationBar';

const App: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>(sampleFlights);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showFuelDialog, setShowFuelDialog] = useState(false);
  const [hoveredBoardNumber, setHoveredBoardNumber] = useState<string | null>(null);
  const [isHoveringBoardNumber, setIsHoveringBoardNumber] = useState(false);
  const [initialBoardNumber, setInitialBoardNumber] = useState<string>('');
  const [hoveredFlightId, setHoveredFlightId] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Handle fuel dialog
      if (e.key.toLowerCase() === 'f') {
        if (showFuelDialog) {
          setShowFuelDialog(false);
          setInitialBoardNumber('');
        } else {
          setShowFuelDialog(true);
          const newInitialBoardNumber = isHoveringBoardNumber ? hoveredBoardNumber : '';
          setInitialBoardNumber(newInitialBoardNumber || '');
        }
        return;
      }

      // Handle split/divide when a flight is being hovered
      if (!hoveredFlightId) return;

      const hoveredFlight = flights.find(f => f.id === hoveredFlightId);
      if (!hoveredFlight) return;

      if (e.key.toLowerCase() === 's') {
        // Split the flight into individual aircraft
        if (hoveredFlight.formation === 'group' || hoveredFlight.formation === 'section') {
          const splitFlights = splitFlight(hoveredFlight);
          setFlights(prev => {
            const updatedFlights = prev.filter(f => f.id !== hoveredFlightId);
            return [...updatedFlights, ...splitFlights];
          });
        }
      } else if (e.key.toLowerCase() === 'd') {
        // Divide the flight into sections
        if (hoveredFlight.formation === 'group') {
          const dividedFlights = divideFlight(hoveredFlight);
          console.log('Divided flights:', dividedFlights);
          setFlights(prev => {
            const updatedFlights = prev.filter(f => f.id !== hoveredFlightId);
            return [...updatedFlights, ...dividedFlights];
          });
        } else if (hoveredFlight.formation === 'section' && hoveredFlight.members.length === 2) {
          // If it's already a section with 2 aircraft, split it into singles
          const splitFlights = splitFlight(hoveredFlight);
          setFlights(prev => {
            const updatedFlights = prev.filter(f => f.id !== hoveredFlightId);
            return [...updatedFlights, ...splitFlights];
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [hoveredFlightId, flights, showFuelDialog, hoveredBoardNumber, isHoveringBoardNumber]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (!over) return;

    if (active.data.current?.type === 'FlightCard' && over.id) {
      const flight = active.data.current.flight;
      const [section, ...divisionParts] = over.id.toString().split('-');
      const divisionId = divisionParts.join('-');
      
      setFlights(prevFlights => {
        return prevFlights.map(f => {
          if (f.id === flight.id) {
            let divisionNumber: number;
            
            // Handle special division IDs
            if (divisionId === 'spin') {
              divisionNumber = -1;
            } else if (divisionId === 'charlie') {
              divisionNumber = -2;
            } else if (divisionId === 'inbound') {
              divisionNumber = 99; // Use 99 as a special number for inbound
            } else {
              divisionNumber = parseInt(divisionId);
            }

            // Map section names
            const sectionTitle = 
              section === 'tanker' ? 'Tanker' :
              section === 'launch' ? 'Launch' :
              section === 'enroute' ? 'En Route/Tasking' :
              section === 'recovery' ? 'Recovery' : 
              f.currentSection;

            return {
              ...f,
              currentSection: sectionTitle,
              currentDivision: divisionNumber
            };
          }
          return f;
        });
      });
    }
  };

  const findFlightByBoardNumber = (boardNumber: string): { flight: Flight; dashNumber: string } | null => {
    for (const flight of flights) {
      const member = flight.members.find(m => m.boardNumber === boardNumber);
      if (member) {
        return { flight, dashNumber: member.dashNumber };
      }
    }
    return null;
  };

  const handleUpdateMemberFuel = (flightId: string, dashNumber: string, newFuel: number) => {
    setFlights(prevFlights => {
      return prevFlights.map(flight => {
        if (flight.id === flightId) {
          // Update the specific member's fuel
          const updatedMembers = flight.members.map(member => {
            if (member.dashNumber === dashNumber) {
              return { ...member, fuel: newFuel };
            }
            return member;
          });

          // Calculate new low state based on all members
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

  // Handle fuel updates from the dialog
  const handleFuelDialogUpdate = (boardNumber: string, newFuel: number) => {
    const flightInfo = findFlightByBoardNumber(boardNumber);
    if (flightInfo) {
      handleUpdateMemberFuel(flightInfo.flight.id, flightInfo.dashNumber, newFuel);
    }
  };

  const activeFlight = flights.find(f => f.id === activeId);

  return (
    <SectionProvider>
      <DndContext 
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr' }} className="min-h-screen">
          <NavigationBar />
          <div 
            onMouseMove={(e) => {
              const target = e.target as HTMLElement;
              const boardNumber = target.getAttribute('data-board-number');
              if (boardNumber) {
                setHoveredBoardNumber(boardNumber);
                setIsHoveringBoardNumber(true);
              } else {
                setIsHoveringBoardNumber(false);
              }

              // Find the closest parent with a data-flight-id attribute
              let currentElement: HTMLElement | null = target;
              while (currentElement && !currentElement.getAttribute('data-flight-id')) {
                currentElement = currentElement.parentElement;
              }
              
              const flightId = currentElement?.getAttribute('data-flight-id') || null;
              setHoveredFlightId(flightId);
            }}
            onMouseLeave={() => {
              setIsHoveringBoardNumber(false);
              setHoveredFlightId(null);
            }}
            className="bg-slate-50"
          >
            <GridLayout 
              flights={flights}
              onUpdateMemberFuel={handleUpdateMemberFuel}
            />
            <DragOverlay>
              {activeFlight && (
                activeFlight.formation === 'single' ? (
                  <SingleFlightCard 
                    {...activeFlight}
                    isDragging={true}
                  />
                ) : (
                  <FlightCard 
                    {...activeFlight}
                    isDragging={true}
                  />
                )
              )}
            </DragOverlay>
            {showFuelDialog && (
              <FuelStateDialog
                initialBoardNumber={initialBoardNumber}
                onClose={() => {
                  setShowFuelDialog(false);
                  setInitialBoardNumber('');
                }}
                onUpdateFuel={handleFuelDialogUpdate}
              />
            )}
          </div>
        </div>
      </DndContext>
    </SectionProvider>
  );
};

export default App;