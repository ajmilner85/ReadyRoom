import React, { useState, useEffect } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import GridLayout from './components/layout/GridLayout';
import { SectionProvider } from './components/layout/SectionContext';
import { sampleFlights } from './types/FlightData';
import type { Flight } from './types/FlightData';
import FlightCard from './components/ui/flight cards/FlightCard';
import FuelStateDialog from './components/ui/dialogs/FuelStateDialog';
import NavigationBar from './components/ui/NavigationBar';

const App: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>(sampleFlights);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showFuelDialog, setShowFuelDialog] = useState(false);
  const [hoveredBoardNumber, setHoveredBoardNumber] = useState<string | null>(null);
  const [isHoveringBoardNumber, setIsHoveringBoardNumber] = useState(false);
  const [initialBoardNumber, setInitialBoardNumber] = useState<string>('');

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      console.log('F key pressed', {
        showFuelDialog,
        hoveredBoardNumber,
        isHoveringBoardNumber,
        initialBoardNumber
      });

      if (e.key.toLowerCase() === 'f') {
        if (showFuelDialog) {
          // Second press of 'f' closes the dialog
          console.log('Closing dialog');
          setShowFuelDialog(false);
          setInitialBoardNumber('');
        } else {
          // First press of 'f' opens the dialog
          console.log('Opening dialog');
          setShowFuelDialog(true);
          
          // Only use hovered board number if actually hovering
          const newInitialBoardNumber = isHoveringBoardNumber ? hoveredBoardNumber : '';
          console.log('Setting initial board number:', newInitialBoardNumber);
          setInitialBoardNumber(newInitialBoardNumber || '');
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [hoveredBoardNumber, showFuelDialog, isHoveringBoardNumber]);

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
            if (divisionId === 'spin') {
              divisionNumber = -1;
            } else if (divisionId === 'charlie') {
              divisionNumber = -2;
            } else {
              divisionNumber = parseInt(divisionId);
            }

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

  const handleUpdateMemberFuel = (boardNumber: string, newFuel: number) => {
    setFlights(prevFlights => {
      return prevFlights.map(flight => {
        const updatedMembers = flight.members.map(member => {
          if (member.boardNumber === boardNumber) {
            return { ...member, fuel: newFuel };
          }
          return member;
        });

        if (updatedMembers.some(m => m.boardNumber === boardNumber)) {
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
            }}
            onMouseLeave={() => {
              setIsHoveringBoardNumber(false);
            }}
            className="bg-slate-50"
          >
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
            {showFuelDialog && (
              <FuelStateDialog
                initialBoardNumber={initialBoardNumber}
                onClose={() => {
                  setShowFuelDialog(false);
                  setInitialBoardNumber('');
                }}
                onUpdateFuel={handleUpdateMemberFuel}
              />
            )}
          </div>
        </div>
      </DndContext>
    </SectionProvider>
  );
};

export default App;