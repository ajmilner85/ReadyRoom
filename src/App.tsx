import React, { useState, Suspense, useEffect, useCallback } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import GridLayout from './components/layout/GridLayout';
import { SectionProvider } from './components/layout/SectionContext';
import { splitFlight, divideFlight, updateFlightPosition, type Flight } from './types/FlightData';
import FlightCard from './components/ui/flight cards/FlightCard';
import SingleFlightCard from './components/ui/flight cards/SingleFlightCard';
import FuelStateDialog from './components/ui/dialogs/FuelStateDialog';
import PositionReportDialog from './components/ui/dialogs/PositionReportDialog';
import NavigationBar from './components/ui/NavigationBar';
import type { AssignedPilot } from './types/PilotTypes';
import type { MissionCommanderInfo } from './types/MissionCommanderTypes';
import type { ExtractedFlight } from './types/FlightData';

// Lazy load components that aren't needed immediately
const RosterManagement = React.lazy(() => import('./components/ui/RosterManagement'));
const EventsManagement = React.lazy(() => import('./components/ui/EventsManagement'));
const MissionPreparation = React.lazy(() => import('./components/ui/MissionPreparation'));

const App: React.FC = () => {
  // Mission Execution state
  const [flights, setFlights] = useState<Flight[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showFuelDialog, setShowFuelDialog] = useState(false);
  const [showPositionDialog, setShowPositionDialog] = useState(false);
  const [hoveredBoardNumber, setHoveredBoardNumber] = useState<string | null>(null);
  const [isHoveringBoardNumber, setIsHoveringBoardNumber] = useState(false);
  const [initialBoardNumber, setInitialBoardNumber] = useState<string>('');
  const [hoveredFlightId, setHoveredFlightId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'roster' | 'flights' | 'events' | 'mission-prep'>('flights');
  const [activeButton, setActiveButton] = useState<string>('flights');

  // Mission Preparation state (lifted up to persist across navigation)
  const [assignedPilots, setAssignedPilots] = useState<Record<string, AssignedPilot[]>>({});
  const [missionCommander, setMissionCommander] = useState<MissionCommanderInfo | null>(null);
  const [extractedFlights, setExtractedFlights] = useState<ExtractedFlight[]>([]);
  const [prepFlights, setPrepFlights] = useState<any[]>([]);

  const handleNavigate = (view: 'roster' | 'flights' | 'events' | 'mission-prep') => {
    setCurrentView(view);
    setActiveButton(view);
  };

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
            } else if (divisionId === 'inbound') {
              divisionNumber = 99;
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
          const updatedMembers = flight.members.map(member => {
            if (member.dashNumber === dashNumber) {
              return { ...member, fuel: newFuel };
            }
            return member;
          });

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

  const handleUpdatePosition = (boardNumber: string, bearing: string, distance: string, altitude: string, lowState: number) => {
    setFlights(prevFlights => {
      return prevFlights.map(flight => {
        const member = flight.members.find(m => m.boardNumber === boardNumber);
        if (member) {
          return updateFlightPosition(flight, boardNumber, bearing, distance, altitude, lowState);
        }
        return flight;
      });
    });
  };

  // Function to handle transfer of flights from Mission Preparation
  const handleTransferToMission = useCallback((transferredFlights: Flight[]) => {
    setFlights(transferredFlights);
  }, []);

  // Handlers for Mission Preparation state updates
  const handleAssignedPilotsChange = useCallback((pilots: Record<string, AssignedPilot[]>) => {
    setAssignedPilots(pilots);
  }, []);

  const handleMissionCommanderChange = useCallback((commander: MissionCommanderInfo | null) => {
    setMissionCommander(commander);
  }, []);

  const handleExtractedFlightsChange = useCallback((flights: ExtractedFlight[]) => {
    setExtractedFlights(flights);
  }, []);

  const handlePrepFlightsChange = useCallback((flights: any[]) => {
    setPrepFlights(flights);
  }, []);

  const activeFlight = flights.find(f => f.id === activeId);

  const renderMainContent = () => {
    if (currentView === 'roster') {
      return (
        <Suspense fallback={
          <div className="bg-slate-50" style={{ width: '100%', height: '100%' }} />
        }>
          <RosterManagement />
        </Suspense>
      );
    }

    if (currentView === 'events') {
      return (
        <Suspense fallback={
          <div className="bg-slate-50" style={{ width: '100%', height: '100%' }} />
        }>
          <EventsManagement />
        </Suspense>
      );
    }

    if (currentView === 'mission-prep') {
      return (
        <Suspense fallback={
          <div className="bg-slate-50" style={{ width: '100%', height: '100%' }} />
        }>
          <MissionPreparation 
            onTransferToMission={handleTransferToMission}
            assignedPilots={assignedPilots}
            onAssignedPilotsChange={handleAssignedPilotsChange}
            missionCommander={missionCommander}
            onMissionCommanderChange={handleMissionCommanderChange}
            extractedFlights={extractedFlights}
            onExtractedFlightsChange={handleExtractedFlightsChange}
            prepFlights={prepFlights}
            onPrepFlightsChange={handlePrepFlightsChange}
          />
        </Suspense>
      );
    }

    return (
      <DndContext 
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
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
              onUpdateFuel={(boardNumber, newFuel) => {
                const flightInfo = findFlightByBoardNumber(boardNumber);
                if (flightInfo) {
                  handleUpdateMemberFuel(flightInfo.flight.id, flightInfo.dashNumber, newFuel);
                }
              }}
            />
          )}
          {showPositionDialog && (
            <PositionReportDialog
              initialBoardNumber={initialBoardNumber}
              onClose={() => {
                setShowPositionDialog(false);
                setInitialBoardNumber('');
              }}
              onUpdatePosition={handleUpdatePosition}
            />
          )}
        </div>
      </DndContext>
    );
  };

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle keypresses when in flight management view
      if (currentView !== 'flights') return;

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

      // Handle position report dialog
      if (e.key.toLowerCase() === 't') {
        if (showPositionDialog) {
          setShowPositionDialog(false);
          setInitialBoardNumber('');
        } else {
          setShowPositionDialog(true);
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
        if (hoveredFlight.formation === 'group' || hoveredFlight.formation === 'section') {
          const splitFlights = splitFlight(hoveredFlight);
          setFlights(prev => {
            const updatedFlights = prev.filter(f => f.id !== hoveredFlightId);
            return [...updatedFlights, ...splitFlights];
          });
        }
      } else if (e.key.toLowerCase() === 'd') {
        if (hoveredFlight.formation === 'group') {
          const dividedFlights = divideFlight(hoveredFlight);
          setFlights(prev => {
            const updatedFlights = prev.filter(f => f.id !== hoveredFlightId);
            return [...updatedFlights, ...dividedFlights];
          });
        } else if (hoveredFlight.formation === 'section' && hoveredFlight.members.length === 2) {
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
  }, [currentView, hoveredFlightId, flights, showFuelDialog, showPositionDialog, hoveredBoardNumber, isHoveringBoardNumber]);

  return (
    <SectionProvider>
      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr' }} className="min-h-screen">
        <NavigationBar onNavigate={handleNavigate} activeButton={activeButton} />
        {renderMainContent()}
      </div>
    </SectionProvider>
  );
};

export default App;