import React, { useState, Suspense, useEffect, useCallback } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import GridLayout from './components/layout/GridLayout';
import { SectionProvider } from './components/layout/SectionContext';
import { AppSettingsProvider } from './context/AppSettingsContext';
import { PageLoadingProvider } from './context/PageLoadingContext';
import StandardPageLoader from './components/ui/StandardPageLoader';
import AppContent from './components/ui/AppContent';
import PermissionGuardedRoute from './components/auth/PermissionGuardedRoute';
import { splitFlight, divideFlight, updateFlightPosition, type Flight } from './types/FlightData';
import FlightCard from './components/ui/flight cards/FlightCard';
import SingleFlightCard from './components/ui/flight cards/SingleFlightCard';
import FuelStateDialog from './components/ui/dialogs/FuelStateDialog';
import PositionReportDialog from './components/ui/dialogs/PositionReportDialog';
import NavigationBar from './components/ui/NavigationBar';
import OnboardingGuide from './components/onboarding/OnboardingGuide';
import { useAuth } from './context/AuthContext';
import { initializeApp, cleanupApp } from './utils/appInitialization';
import type { Pilot } from './types/PilotTypes';

// Define AssignedPilot here since it's not exported from PilotTypes
interface AssignedPilot extends Pilot {
  dashNumber: string;
  attendanceStatus?: 'accepted' | 'tentative' | 'declined';
  rollCallStatus?: 'Present' | 'Absent' | 'Tentative';
}
import type { MissionCommanderInfo } from './types/MissionCommanderTypes';
import type { ExtractedFlight } from './types/FlightData';
import { loadAssignedPilots, saveMissionCommander, saveAssignedPilots, loadMissionCommander, loadExtractedFlights, saveExtractedFlights, loadPrepFlights, savePrepFlights } from './utils/localStorageUtils';

const RosterManagement = React.lazy(() => import('./components/ui/RosterManagement'));
const EventsManagement = React.lazy(() => import('./components/ui/EventsManagement'));
const MissionPreparation = React.lazy(() => import('./components/ui/MissionPreparation'));
const Settings = React.lazy(() => import('./components/settings/Settings'));
const Reports = React.lazy(() => import('./components/reports/Reports'));
const Home = React.lazy(() => import('./components/ui/Home'));
const ClearCache = React.lazy(() => import('./pages/ClearCache'));
const Debriefing = React.lazy(() => import('./components/debriefing/Debriefing'));

const App: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Mission Execution state
  const [flights, setFlights] = useState<Flight[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showFuelDialog, setShowFuelDialog] = useState(false);
  const [showPositionDialog, setShowPositionDialog] = useState(false);
  const [hoveredBoardNumber, setHoveredBoardNumber] = useState<string | null>(null);
  const [isHoveringBoardNumber, setIsHoveringBoardNumber] = useState(false);
  const [initialBoardNumber, setInitialBoardNumber] = useState<string>('');
  const [hoveredFlightId, setHoveredFlightId] = useState<string | null>(null);
  // Determine current view from URL path
  const getCurrentView = () => {
    const path = location.pathname;
    if (path === '/') return 'home'; // Root is now Home
    if (path === '/events') return 'events';
    if (path === '/roster') return 'roster';
    if (path === '/mission-coordination') return 'flights';
    if (path === '/mission-prep') return 'mission-prep';
    if (path === '/debriefing') return 'debriefing';
    if (path === '/reports') return 'reports';
    if (path === '/settings') return 'admin';
    return 'home'; // default to home
  };
  
  const [activeButton, setActiveButton] = useState<string>(getCurrentView());
  
  // Update activeButton when URL changes
  useEffect(() => {
    setActiveButton(getCurrentView());
  }, [location.pathname]);
  
  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Mission Preparation state (lifted up to persist across navigation)
  const [assignedPilots, setAssignedPilots] = useState<Record<string, AssignedPilot[]>>(() => loadAssignedPilots());
  const [missionCommander, setMissionCommander] = useState<MissionCommanderInfo | null>(() => loadMissionCommander());
  const [extractedFlights, setExtractedFlights] = useState<ExtractedFlight[]>(() => loadExtractedFlights());
  const [prepFlights, setPrepFlights] = useState<any[]>(() => loadPrepFlights());

  // Save state to localStorage when it changes
  useEffect(() => {
    saveAssignedPilots(assignedPilots);
  }, [assignedPilots]);

  useEffect(() => {
    saveMissionCommander(missionCommander);
  }, [missionCommander]);

  useEffect(() => {
    saveExtractedFlights(extractedFlights);
  }, [extractedFlights]);

  useEffect(() => {
    savePrepFlights(prepFlights);
  }, [prepFlights]);

  // Initialize app services
  useEffect(() => {
    initializeApp();
    
    // Cleanup on unmount
    return () => {
      cleanupApp();
    };
  }, []);

  // Onboarding disabled for alpha deployment
  // useEffect(() => {
  //   if (!loading && user && userProfile) {
  //     // Check if user has seen onboarding before
  //     const hasSeenOnboarding = localStorage.getItem(`onboarding_seen_${user.id}`);
  //     
  //     // Show onboarding if:
  //     // 1. User hasn't seen it before, OR
  //     // 2. User doesn't have a linked pilot record (needs guidance)
  //     if (!hasSeenOnboarding || !userProfile.pilot) {
  //       setShowOnboarding(true);
  //     }
  //   }
  // }, [loading, user, userProfile]);

  const handleOnboardingComplete = () => {
    if (user) {
      localStorage.setItem(`onboarding_seen_${user.id}`, 'true');
    }
    setShowOnboarding(false);
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
      
      // Handle drop on inactive/storage area
      if (over.id === 'inactive') {
        setFlights(prevFlights => {
          return prevFlights.map(f => {
            if (f.id === flight.id) {
              return {
                ...f,
                currentSection: '',
                currentDivision: 0
              };
            }
            return f;
          });
        });
        return;
      }
      
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
            } else if (divisionId === 'platform') {
              divisionNumber = -3;
            } else if (divisionId === 'bolter') {
              divisionNumber = -4;
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

  const handleUpdatePosition = (boardNumber: string, bearing: string, distance: string, altitude: string, lowState?: number) => {
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
    // Extract unique step times from transferred flights
    const stepTimes = transferredFlights
      .map(flight => (flight as any).stepTime ?? 0) // Get stepTime or default to 0
      .filter((stepTime, index, self) => self.indexOf(stepTime) === index); // Get unique values

    // Import useSections hook to access createLaunchDivisionsFromStepTimes
    // This will be handled by wrapping in SectionProvider context

    // Map the step times to division numbers for proper assignment
    const stepTimeToDivisionMap = new Map<number, number>();
    stepTimes.sort((a, b) => a - b); // Sort step times ascending
    stepTimes.forEach((stepTime) => {
      // Division numbers match step times for Launch section
      stepTimeToDivisionMap.set(stepTime, stepTime);
    });

    // Update flights to place them in the correct Launch division based on step time
    const flightsWithDivisions = transferredFlights.map(flight => {
      const stepTime = (flight as any).stepTime ?? 0;
      return {
        ...flight,
        currentSection: 'Launch',
        currentDivision: stepTimeToDivisionMap.get(stepTime) ?? 0
      };
    });

    setFlights(flightsWithDivisions);
    // Navigate to mission coordination page after transfer
    navigate('/mission-coordination');
  }, [navigate]);

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

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle keypresses when in flight management view
      if (getCurrentView() !== 'flights') return;

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

      // Handle position shortcuts for single flight cards
      if (isHoveringBoardNumber && hoveredBoardNumber) {
        const flight = flights.find(f =>
          f.members.some(m => m.boardNumber === hoveredBoardNumber)
        );

        if (flight && flight.formation === 'single') {
          // 'e' - Established (no position change, just sets state)
          if (e.key.toLowerCase() === 'e') {
            const updatedFlight = updateFlightPosition(
              flight,
              hoveredBoardNumber,
              'Established',
              '',
              '',
              flight.lowState
            );
            setFlights(prev => prev.map(f => f.id === flight.id ? updatedFlight : f));
            return;
          }

          // 'c' - Commenced (move to Charlie/Commence division)
          if (e.key.toLowerCase() === 'c') {
            const updatedFlight = {
              ...updateFlightPosition(
                flight,
                hoveredBoardNumber,
                'Commenced',
                '',
                '',
                flight.lowState
              ),
              currentSection: 'Recovery',
              currentDivision: -2 // Charlie/Commence
            };
            setFlights(prev => prev.map(f => f.id === flight.id ? updatedFlight : f));
            return;
          }

          // 'p' - Platform (move to Platform division)
          if (e.key.toLowerCase() === 'p') {
            const updatedFlight = {
              ...updateFlightPosition(
                flight,
                hoveredBoardNumber,
                'Platform',
                '',
                '',
                flight.lowState
              ),
              currentSection: 'Recovery',
              currentDivision: -3 // Platform
            };
            setFlights(prev => prev.map(f => f.id === flight.id ? updatedFlight : f));
            return;
          }

          // 'b' - Bolter (move to Bolter division)
          if (e.key.toLowerCase() === 'b') {
            const updatedFlight = {
              ...updateFlightPosition(
                flight,
                hoveredBoardNumber,
                'Bolter',
                '',
                '',
                flight.lowState
              ),
              currentSection: 'Recovery',
              currentDivision: -4 // Bolter
            };
            setFlights(prev => prev.map(f => f.id === flight.id ? updatedFlight : f));
            return;
          }
        }
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
  }, [location.pathname, hoveredFlightId, flights, showFuelDialog, showPositionDialog, hoveredBoardNumber, isHoveringBoardNumber]);

  return (
    <AppSettingsProvider>
      <PageLoadingProvider>
        <SectionProvider>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr' }} className="min-h-screen">
          <NavigationBar activeButton={activeButton} />
          <AppContent>
            <Routes>
            {/* Emergency cache clear route - no permission required */}
            <Route path="/clear-cache" element={
              <Suspense fallback={<StandardPageLoader message="Loading..." />}>
                <ClearCache />
              </Suspense>
            } />

            <Route path="/" element={
              <PermissionGuardedRoute requiredPermission="access_home">
                <Suspense fallback={<StandardPageLoader message="Loading home..." />}>
                  <Home />
                </Suspense>
              </PermissionGuardedRoute>
            } />
            <Route path="/events" element={
              <PermissionGuardedRoute requiredPermission="access_events">
                <Suspense fallback={<StandardPageLoader message="Loading events data..." />}>
                  <EventsManagement />
                </Suspense>
              </PermissionGuardedRoute>
            } />
            <Route path="/roster" element={
              <PermissionGuardedRoute requiredPermission="access_roster">
                <Suspense fallback={<StandardPageLoader message="Loading roster..." />}>
                  <RosterManagement />
                </Suspense>
              </PermissionGuardedRoute>
            } />
            <Route path="/mission-prep" element={
              <PermissionGuardedRoute requiredPermission="access_mission_prep">
                <Suspense fallback={<StandardPageLoader message="Loading mission preparation..." />}>
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
              </PermissionGuardedRoute>
            } />
            <Route path="/settings" element={
              <PermissionGuardedRoute requiredPermission="access_settings">
                <Suspense fallback={<StandardPageLoader message="Loading settings..." />}>
                  <Settings />
                </Suspense>
              </PermissionGuardedRoute>
            } />
            <Route path="/reports" element={
              <PermissionGuardedRoute requiredPermission="access_reports">
                <Suspense fallback={<StandardPageLoader message="Loading reports..." />}>
                  <Reports />
                </Suspense>
              </PermissionGuardedRoute>
            } />
            <Route path="/debriefing" element={
              <PermissionGuardedRoute requiredPermission="access_mission_debriefing">
                <Suspense fallback={<StandardPageLoader message="Loading debriefing..." />}>
                  <Debriefing />
                </Suspense>
              </PermissionGuardedRoute>
            } />
            <Route path="/mission-coordination" element={
              <PermissionGuardedRoute requiredPermission="access_flights">
                <DndContext
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  autoScroll={{ enabled: false }}
                >
                  <div
                    onMouseMove={(e) => {
                      const target = e.target as HTMLElement;

                      // Find flight ID by traversing up the DOM tree
                      let currentElement: HTMLElement | null = target;
                      while (currentElement && !currentElement.getAttribute('data-flight-id')) {
                        currentElement = currentElement.parentElement;
                      }
                      const flightId = currentElement?.getAttribute('data-flight-id') || null;
                      setHoveredFlightId(flightId);

                      // Find board number by checking current element and parents
                      let boardNumberElement: HTMLElement | null = target;
                      let foundBoardNumber: string | null = null;

                      // Search up the tree for data-board-number, but stop at flight card boundary
                      while (boardNumberElement && !boardNumberElement.getAttribute('data-flight-id')) {
                        const bn = boardNumberElement.getAttribute('data-board-number');
                        if (bn) {
                          foundBoardNumber = bn;
                          break;
                        }
                        boardNumberElement = boardNumberElement.parentElement;
                      }

                      // If we didn't find a board number and we're hovering over a flight card,
                      // check if it's a single flight card and use its board number
                      if (!foundBoardNumber && flightId) {
                        const flight = flights.find(f => f.id === flightId);
                        if (flight && flight.formation === 'single' && flight.members.length === 1) {
                          foundBoardNumber = flight.members[0].boardNumber;
                        }
                      }

                      if (foundBoardNumber) {
                        setHoveredBoardNumber(foundBoardNumber);
                        setIsHoveringBoardNumber(true);
                      } else {
                        setIsHoveringBoardNumber(false);
                      }
                    }}
                    onMouseLeave={() => {
                      setIsHoveringBoardNumber(false);
                      setHoveredFlightId(null);
                    }}
                    style={{
                      backgroundColor: '#F0F4F8',
                      height: '100%',
                      width: '100%'
                    }}
                  >
                    <GridLayout
                      flights={flights}
                      onUpdateMemberFuel={handleUpdateMemberFuel}
                    />
                    <DragOverlay
                      dropAnimation={null}
                      style={{ zIndex: 10000 }}
                    >
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
              </PermissionGuardedRoute>
            } />
            </Routes>
          </AppContent>
        </div>
        
        {/* Onboarding Guide */}
        <OnboardingGuide 
          isOpen={showOnboarding}
          onClose={handleOnboardingComplete}
        />
      </SectionProvider>
      </PageLoadingProvider>
    </AppSettingsProvider>
  );
};

export default App;