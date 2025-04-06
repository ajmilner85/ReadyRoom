import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import MissionDetails from './mission prep/MissionDetails';
import AvailablePilots from './mission prep/AvailablePilots';
import FlightAssignments from './mission prep/FlightAssignments';
import Communications from './mission prep/Communications';
import PilotDragOverlay from './mission-execution/PilotDragOverlay';
import { getAllPilots } from '../../utils/pilotService';
import { getPilotQualifications } from '../../utils/qualificationService';
import { convertSupabasePilotToLegacy } from '../../types/PilotTypes';
import type { Event } from '../../types/EventTypes';
import type { Pilot } from '../../types/PilotTypes';
import type { MissionCommanderInfo } from '../../types/MissionCommanderTypes';
import type { Flight, ExtractedFlight } from '../../types/FlightData';
import { CommsPlanEntry, generateInitialCommsData } from '../../types/CommsTypes';
import { SAMPLE_EVENTS } from '../../data/sampleEvents';
import { getMissionCommanderCandidates, findPilotInFlights } from '../../utils/dragDropUtils';
import { useDragDrop } from '../../utils/useDragDrop';
import { loadAssignedPilots, saveAssignedPilots, loadMissionCommander, saveMissionCommander, loadExtractedFlights, saveExtractedFlights, loadPrepFlights, savePrepFlights, loadSelectedEvent, saveSelectedEvent } from '../../utils/localStorageUtils';

interface AssignedPilot extends Pilot {
  dashNumber: string;
}

interface MissionPreparationProps {
  onTransferToMission?: (flights: Flight[]) => void;
  assignedPilots?: Record<string, AssignedPilot[]>;
  onAssignedPilotsChange?: (pilots: Record<string, AssignedPilot[]>) => void;
  missionCommander?: MissionCommanderInfo | null;
  onMissionCommanderChange?: (commander: MissionCommanderInfo | null) => void;
  extractedFlights?: ExtractedFlight[];
  onExtractedFlightsChange?: (flights: ExtractedFlight[]) => void;
  prepFlights?: any[];
  onPrepFlightsChange?: (flights: any[]) => void;
}

const CARD_WIDTH = '550px';

const MissionPreparation: React.FC<MissionPreparationProps> = ({ 
  onTransferToMission,
  assignedPilots: externalAssignedPilots,
  onAssignedPilotsChange,
  missionCommander: externalMissionCommander,
  onMissionCommanderChange,
  extractedFlights: externalExtractedFlights,
  onExtractedFlightsChange,
  prepFlights: externalPrepFlights,
  onPrepFlightsChange
}) => {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(loadSelectedEvent());
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allPilotQualifications, setAllPilotQualifications] = useState<Record<string, any[]>>({});
  
  // Fetch pilots from Supabase when component mounts
  useEffect(() => {
    const fetchPilots = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await getAllPilots();
        
        if (error) {
          throw new Error(error.message);
        }

        if (data && data.length > 0) {
          // Convert Supabase format to the format our UI expects
          const convertedPilots = data.map(pilot => {
            const legacyPilot = convertSupabasePilotToLegacy(pilot);
            if (pilot.discord_original_id) {
              legacyPilot.id = pilot.discord_original_id;
            }
            
            // Store supabase_id consistently for qualification lookups
            legacyPilot.supabase_id = pilot.id;
            
            // Set status based on squadron role if not set
            if (!legacyPilot.status) {
              const role = pilot.roles?.squadron?.toLowerCase() || '';
              if (role.includes('co')) {
                legacyPilot.status = 'Command';
              } else if (role.includes('xo')) {
                legacyPilot.status = 'Command';
              } else if (role.includes('oic')) {
                legacyPilot.status = 'Staff';
              } else if (role.includes('ret')) {
                legacyPilot.status = 'Retired';
              }
            }
            return legacyPilot;
          });
          setPilots(convertedPilots);
          
          // After fetching pilots, also fetch their qualifications
          await fetchAllPilotQualifications(convertedPilots);

          setLoadError(null);
        } else {
          // No pilots in database
          setPilots([]);
          setLoadError('No pilots found in the database');
        }
      } catch (err: any) {
        setLoadError(err.message);
        setPilots([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPilots();
  }, []);
  
  // Function to fetch qualifications for all pilots
  const fetchAllPilotQualifications = async (pilotsList: Pilot[]) => {
    if (pilotsList.length === 0) return;
    
    try {
      const qualMap: Record<string, any[]> = {};
      console.log(`Fetching qualifications for ${pilotsList.length} pilots...`);
      
      // Create an array to track all qualification fetch promises
      const fetchPromises: Promise<void>[] = [];
      
      // Fetch qualifications for each pilot
      for (const pilot of pilotsList) {
        // Always prioritize the Supabase UUID if available
        const pilotId = pilot.supabase_id || pilot.id;
        
        if (!pilotId) {
          console.warn(`Skipping qualification fetch for pilot with no ID: ${pilot.callsign} (${pilot.boardNumber})`);
          continue;
        }
        
        // Create a promise for fetching this pilot's qualifications
        const fetchPromise = async () => {
          const { data, error } = await getPilotQualifications(pilotId);
          
          if (error) {
            console.warn(`Error fetching qualifications for ${pilot.callsign} with ID ${pilotId}:`, error);
          } else if (data) {
            // Store in qualMap using all available pilot identifiers for easier lookup
            qualMap[pilot.boardNumber] = data;
            qualMap[pilot.id] = data;
            if (pilot.supabase_id) qualMap[pilot.supabase_id] = data;
            
            // Only log if we actually found qualifications
            if (data.length > 0) {
              console.log(`Found ${data.length} qualifications for ${pilot.callsign} (${pilot.boardNumber})`);
            }
          } else {
            // Initialize empty arrays to avoid undefined checks later
            qualMap[pilot.boardNumber] = [];
            qualMap[pilot.id] = [];
            if (pilot.supabase_id) qualMap[pilot.supabase_id] = [];
          }
        };
        
        // Add this promise to our array
        fetchPromises.push(fetchPromise());
      }
      
      // Wait for all qualification fetches to complete
      await Promise.all(fetchPromises);
      
      setAllPilotQualifications(qualMap);
      console.log('Pilot qualifications map updated', Object.keys(qualMap).length);
    } catch (err: any) {
      console.error('Error fetching all pilot qualifications:', err);
    }
  };
  
  // Filter out inactive and retired pilots
  const activePilots = useMemo(() => {
    return pilots.filter(pilot => 
      pilot.status !== 'Inactive' && pilot.status !== 'Retired'
    );
  }, [pilots]);
  
  // Use the external state if provided, otherwise use local state
  const [localAssignedPilots, setLocalAssignedPilots] = useState<Record<string, AssignedPilot[]>>(loadAssignedPilots() || {});
  const [localMissionCommander, setLocalMissionCommander] = useState<MissionCommanderInfo | null>(loadMissionCommander());
  const [localExtractedFlights, setLocalExtractedFlights] = useState<ExtractedFlight[]>(loadExtractedFlights() || []);
  const [localPrepFlights, setLocalPrepFlights] = useState<any[]>(loadPrepFlights() || []);
  
  // Use refs to track which state to use
  const processedMizRef = useRef<boolean>(false);
  
  // Determine which state to use
  const assignedPilots = externalAssignedPilots !== undefined ? externalAssignedPilots : localAssignedPilots;
  const missionCommander = externalMissionCommander !== undefined ? externalMissionCommander : localMissionCommander;
  const extractedFlights = externalExtractedFlights !== undefined ? externalExtractedFlights : localExtractedFlights;
  const prepFlights = externalPrepFlights !== undefined ? externalPrepFlights : localPrepFlights;
  
  // Create functions to update the appropriate state
  const setAssignedPilots = useCallback((value: React.SetStateAction<Record<string, AssignedPilot[]>>) => {
    const newValue = typeof value === 'function' ? value(assignedPilots) : value;
    if (onAssignedPilotsChange) {
      onAssignedPilotsChange(newValue);
    } else {
      setLocalAssignedPilots(newValue);
      saveAssignedPilots(newValue);
    }
  }, [assignedPilots, onAssignedPilotsChange]);

  const setMissionCommander = useCallback((value: React.SetStateAction<MissionCommanderInfo | null>) => {
    const newValue = typeof value === 'function' ? value(missionCommander) : value;
    if (onMissionCommanderChange) {
      onMissionCommanderChange(newValue);
    } else {
      setLocalMissionCommander(newValue);
      saveMissionCommander(newValue);
    }
  }, [missionCommander, onMissionCommanderChange]);

  const setExtractedFlights = useCallback((value: React.SetStateAction<ExtractedFlight[]>) => {
    const newValue = typeof value === 'function' ? value(extractedFlights) : value;
    if (onExtractedFlightsChange) {
      onExtractedFlightsChange(newValue);
    } else {
      setLocalExtractedFlights(newValue);
      saveExtractedFlights(newValue);
    }
  }, [extractedFlights, onExtractedFlightsChange]);

  const setPrepFlights = useCallback((value: React.SetStateAction<any[]>) => {
    const newValue = typeof value === 'function' ? value(prepFlights) : value;
    if (onPrepFlightsChange) {
      onPrepFlightsChange(newValue);
    } else {
      setLocalPrepFlights(newValue);
      savePrepFlights(newValue);
    }
  }, [prepFlights, onPrepFlightsChange]);

  const setSelectedEventWrapper = useCallback((event: Event | null) => {
    setSelectedEvent(event);
    saveSelectedEvent(event);
  }, []);
  
  // Use our custom hook for drag and drop functionality
  const { draggedPilot, dragSource, handleDragStart, handleDragEnd } = useDragDrop({
    missionCommander,
    setMissionCommander,
    assignedPilots,
    setAssignedPilots
  });

  // Get mission commander candidates with additional flight info
  const getMissionCommanderCandidatesWrapper = useCallback(() => {
    const candidates = getMissionCommanderCandidates(assignedPilots);
    return candidates.map(candidate => {
      const pilotAssignment = findPilotInFlights(candidate.boardNumber, assignedPilots);
      if (!pilotAssignment) return null;

      // Get flight info from the flight ID
      let flightCallsign = "";
      let flightNumber = "";
      
      // Try to find the corresponding flight in assigned pilots
      for (const [flightId, pilots] of Object.entries(assignedPilots)) {
        if (flightId === pilotAssignment.flightId && pilots.length > 0) {
          const flightParts = flightId.split('-');
          if (flightParts.length > 1) {
            flightCallsign = flightParts[0];
            flightNumber = flightParts[1];
          }
          break;
        }
      }

      return {
        label: `${candidate.callsign} (${candidate.boardNumber})`,
        value: candidate.boardNumber,
        boardNumber: candidate.boardNumber,
        callsign: candidate.callsign,
        flightId: pilotAssignment.flightId,
        flightCallsign: flightCallsign,
        flightNumber: flightNumber
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
  }, [assignedPilots]);

  // Handle extracted flights from AircraftGroups with safeguard against infinite loops
  const handleExtractedFlights = useCallback((flights: ExtractedFlight[]) => {
    if (flights.length > 0 && !processedMizRef.current) {
      processedMizRef.current = true;
      setExtractedFlights(flights);
    }
  }, [setExtractedFlights]);
  
  // Reset the processed flag when component unmounts
  useEffect(() => {
    return () => {
      processedMizRef.current = false;
    };
  }, []);

  // Update flights when FlightAssignments updates them
  const handleFlightsChange = useCallback((updatedFlights: any[]) => {
    setPrepFlights(updatedFlights);
  }, [setPrepFlights]);

  // Clear all pilot assignments and the mission commander
  const handleClearAssignments = useCallback(() => {
    setAssignedPilots({});
    setMissionCommander(null);
  }, [setAssignedPilots, setMissionCommander]);

  // Auto-assign pilots to flights according to priority rules
  const handleAutoAssign = useCallback((flights: Flight[], availablePilots: Pilot[]) => {
    if (!flights || flights.length === 0 || !availablePilots || availablePilots.length === 0) {
      console.log("Cannot auto-assign: no flights or pilots available");
      return;
    }

    console.log("Auto-assigning pilots to flights...");

    // Create a new assignment map from the existing one
    const newAssignments: Record<string, AssignedPilot[]> = { ...assignedPilots };

    // Map of qualification name patterns to prioritized positions
    const qualificationToPriorityMap: Record<string, number> = {
      "mission commander": 1,  // Highest priority
      "strike lead": 2,
      "instructor": 3,
      "section lead": 4,
      "flight lead": 5,
      "lso": 6,
      "cq": 7,
      "night cq": 8, 
      "wingman": 9   // Lowest priority
    };

    // Function to get pilot's highest qualification priority 
    const getPilotPriority = (pilot: Pilot): number => {
      // Get pilot qualifications from the database
      const pilotQuals = allPilotQualifications[pilot.id] || 
                        allPilotQualifications[pilot.boardNumber] || 
                        allPilotQualifications[pilot.supabase_id || ""] || [];
      
      // Default priority if no qualifications are found
      let highestPriority = 10; // Default lower than wingman

      // Check all qualifications for this pilot
      for (const qual of pilotQuals) {
        if (!qual.qualification) continue;
        
        const qualName = qual.qualification.name.toLowerCase();
        
        // Check if qualification matches any priority pattern
        for (const [pattern, priority] of Object.entries(qualificationToPriorityMap)) {
          if (qualName.includes(pattern) && priority < highestPriority) {
            highestPriority = priority;
          }
        }
      }
      
      return highestPriority;
    };

    // Sort pilots by priority (highest priority first)
    const sortedPilots = [...availablePilots].sort((a, b) => {
      return getPilotPriority(a) - getPilotPriority(b);
    });

    console.log("Sorted pilots by priority:", sortedPilots.map(p => p.callsign));

    // Function to check if a pilot is already assigned
    const isPilotAssigned = (pilotId: string): boolean => {
      for (const flightId in newAssignments) {
        for (const assignedPilot of newAssignments[flightId]) {
          if (assignedPilot.id === pilotId || assignedPilot.boardNumber === pilotId) {
            return true;
          }
        }
      }
      return false;
    };

    // First pass: assign flight leads (1-1) positions
    for (const flight of flights) {
      const flightId = flight.id;
      
      // Skip if flight already has a pilot in 1-1 position
      if (newAssignments[flightId]?.some(p => p.dashNumber === "1")) {
        continue;
      }

      // Initialize assignment array if it doesn't exist yet
      if (!newAssignments[flightId]) {
        newAssignments[flightId] = [];
      }

      // Find highest priority available pilot
      for (const pilot of sortedPilots) {
        if (!isPilotAssigned(pilot.id) && !isPilotAssigned(pilot.boardNumber)) {
          newAssignments[flightId].push({
            ...pilot,
            dashNumber: "1"  // Assign as flight lead (1-1)
          });
          break;
        }
      }
    }

    // Second pass: assign section leads (1-3) positions
    for (const flight of flights) {
      const flightId = flight.id;
      
      // Skip if flight already has a pilot in 1-3 position
      if (newAssignments[flightId]?.some(p => p.dashNumber === "3")) {
        continue;
      }

      // Initialize assignment array if it doesn't exist yet
      if (!newAssignments[flightId]) {
        newAssignments[flightId] = [];
      }

      // Find highest priority available pilot
      for (const pilot of sortedPilots) {
        if (!isPilotAssigned(pilot.id) && !isPilotAssigned(pilot.boardNumber)) {
          newAssignments[flightId].push({
            ...pilot,
            dashNumber: "3"  // Assign as section lead (1-3)
          });
          break;
        }
      }
    }

    // Third pass: assign wingmen (1-2, 1-4) positions
    for (const flight of flights) {
      const flightId = flight.id;
      
      // Initialize assignment array if it doesn't exist yet
      if (!newAssignments[flightId]) {
        newAssignments[flightId] = [];
      }

      // Check 1-2 position
      if (!newAssignments[flightId]?.some(p => p.dashNumber === "2")) {
        // Find first available pilot
        for (const pilot of sortedPilots) {
          if (!isPilotAssigned(pilot.id) && !isPilotAssigned(pilot.boardNumber)) {
            newAssignments[flightId].push({
              ...pilot,
              dashNumber: "2"  // Assign as wingman (1-2)
            });
            break;
          }
        }
      }

      // Check 1-4 position
      if (!newAssignments[flightId]?.some(p => p.dashNumber === "4")) {
        // Find first available pilot
        for (const pilot of sortedPilots) {
          if (!isPilotAssigned(pilot.id) && !isPilotAssigned(pilot.boardNumber)) {
            newAssignments[flightId].push({
              ...pilot, 
              dashNumber: "4"  // Assign as wingman (1-4)
            });
            break;
          }
        }
      }
    }

    // Assign mission commander to highest priority pilot
    if (flights.length > 0 && sortedPilots.length > 0) {
      // Find the highest priority assigned pilot
      let highestPriorityPilot: AssignedPilot | null = null;
      let highestPriorityFlightId = "";
      
      for (const flightId in newAssignments) {
        for (const pilot of newAssignments[flightId]) {
          // Only consider flight leads for mission commander
          if (pilot.dashNumber === "1") {
            const priority = getPilotPriority(pilot);
            
            if (!highestPriorityPilot || priority < getPilotPriority(highestPriorityPilot)) {
              highestPriorityPilot = pilot;
              highestPriorityFlightId = flightId;
            }
          }
        }
      }
      
      // Set mission commander if we found a suitable pilot
      if (highestPriorityPilot) {
        // Find the flight callsign and number
        const flight = flights.find(f => f.id === highestPriorityFlightId);
        
        if (flight) {
          setMissionCommander({
            boardNumber: highestPriorityPilot.boardNumber,
            callsign: highestPriorityPilot.callsign,
            flightId: highestPriorityFlightId,
            flightCallsign: flight.callsign,
            flightNumber: flight.flightNumber
          });
        }
      }
    }

    console.log("Auto-assignment complete:", newAssignments);
    
    // Update the assignments
    setAssignedPilots(newAssignments);
  }, [assignedPilots, setAssignedPilots, setMissionCommander, allPilotQualifications]);

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToWindowEdges]} 
    >
      <div style={{ 
          backgroundColor: '#F0F4F8', 
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '20px 20px 20px 20px',
          boxSizing: 'border-box',
          overflow: 'visible'
        }}>
        <div style={{
            display: 'flex',
            gap: '20px',
            height: 'calc(100vh - 20px)', 
            position: 'relative',
            zIndex: 1,
            maxWidth: '2240px',
            width: 'min(100%, 2240px)',
            boxSizing: 'border-box',
            justifyContent: 'center',
            overflowX: 'auto',
            overflowY: 'visible',
            padding: '15px',
            margin: '-15px',
          }}>
          {isLoading ? (
            <div className="flex items-center justify-center w-full">
              <p className="text-lg">Loading pilots data...</p>
            </div>
          ) : loadError ? (
            <div className="flex items-center justify-center w-full">
              <p className="text-red-500">{loadError}</p>
            </div>
          ) : (
            <>
              <MissionDetails 
                width={CARD_WIDTH} 
                events={SAMPLE_EVENTS}
                selectedEvent={selectedEvent}
                onEventSelect={setSelectedEventWrapper}
                missionCommander={missionCommander}
                getMissionCommanderCandidates={getMissionCommanderCandidatesWrapper}
                setMissionCommander={setMissionCommander}
                onExtractedFlights={handleExtractedFlights}
              />
              <AvailablePilots 
                width={CARD_WIDTH}
                pilots={activePilots}
                selectedEvent={selectedEvent}
                assignedPilots={assignedPilots}
                onAutoAssign={() => handleAutoAssign(prepFlights, activePilots)}
                onClearAssignments={handleClearAssignments}
                pilotQualifications={allPilotQualifications}
              />
              <FlightAssignments 
                width={CARD_WIDTH} 
                assignedPilots={assignedPilots}
                missionCommander={missionCommander}
                extractedFlights={extractedFlights}
                onFlightsChange={handleFlightsChange}
                initialFlights={prepFlights}
              />
              <Communications 
                width={CARD_WIDTH} 
                assignedPilots={assignedPilots}
                onTransferToMission={onTransferToMission}
                flights={prepFlights}
                extractedFlights={extractedFlights}
              />
            </>
          )}
        </div>
      </div>

      <DragOverlay 
        dropAnimation={null} 
        modifiers={[restrictToWindowEdges]}
        zIndex={9999}
      >
        <PilotDragOverlay 
          draggedPilot={draggedPilot} 
          dragSource={dragSource} 
        />
      </DragOverlay>
    </DndContext>
  );
};

export default MissionPreparation;