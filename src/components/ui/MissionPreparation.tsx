import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import MissionDetails from './mission prep/MissionDetails';
import AvailablePilots from './mission prep/AvailablePilots';
import FlightAssignments from './mission prep/FlightAssignments';
import Communications from './mission prep/Communications';
import PilotDragOverlay from './mission-execution/PilotDragOverlay';
import { pilots } from '../../types/PilotTypes';
import type { Event } from '../../types/EventTypes';
import type { Pilot } from '../../types/PilotTypes';
import type { MissionCommanderInfo } from '../../types/MissionCommanderTypes';
import type { Flight, ExtractedFlight } from '../../types/FlightData';
import { SAMPLE_EVENTS } from '../../data/sampleEvents';
import { getMissionCommanderCandidates, findPilotInFlights } from '../../utils/dragDropUtils';
import { useDragDrop } from '../../utils/useDragDrop';

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
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  
  // Filter out inactive and retired pilots
  const activePilots = useMemo(() => {
    return pilots.filter(pilot => 
      pilot.status !== 'Inactive' && pilot.status !== 'Retired'
    );
  }, []);
  
  // Use the external state if provided, otherwise use local state
  const [localAssignedPilots, setLocalAssignedPilots] = useState<Record<string, AssignedPilot[]>>({});
  const [localMissionCommander, setLocalMissionCommander] = useState<MissionCommanderInfo | null>(null);
  const [localExtractedFlights, setLocalExtractedFlights] = useState<ExtractedFlight[]>([]);
  const [localPrepFlights, setLocalPrepFlights] = useState<any[]>([]);
  
  // Use refs to track which state to use (external or local)
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
    }
  }, [assignedPilots, onAssignedPilotsChange]);

  const setMissionCommander = useCallback((value: React.SetStateAction<MissionCommanderInfo | null>) => {
    const newValue = typeof value === 'function' ? value(missionCommander) : value;
    if (onMissionCommanderChange) {
      onMissionCommanderChange(newValue);
    } else {
      setLocalMissionCommander(newValue);
    }
  }, [missionCommander, onMissionCommanderChange]);

  const setExtractedFlights = useCallback((value: React.SetStateAction<ExtractedFlight[]>) => {
    const newValue = typeof value === 'function' ? value(extractedFlights) : value;
    if (onExtractedFlightsChange) {
      onExtractedFlightsChange(newValue);
    } else {
      setLocalExtractedFlights(newValue);
    }
  }, [extractedFlights, onExtractedFlightsChange]);

  const setPrepFlights = useCallback((value: React.SetStateAction<any[]>) => {
    const newValue = typeof value === 'function' ? value(prepFlights) : value;
    if (onPrepFlightsChange) {
      onPrepFlightsChange(newValue);
    } else {
      setLocalPrepFlights(newValue);
    }
  }, [prepFlights, onPrepFlightsChange]);
  
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
    if (!flights.length) return;

    // Create a new copy of the current assignments to modify
    const newAssignments = { ...assignedPilots };

    // 1. Preserve original flight order, only sort within each callsign group
    // Group flights by callsign, maintaining the original order they appear
    const flightsByCallsign: Record<string, Flight[]> = {};
    const callsignOrder: string[] = [];
    
    flights.forEach(flight => {
      if (!flightsByCallsign[flight.callsign]) {
        flightsByCallsign[flight.callsign] = [];
        callsignOrder.push(flight.callsign);
      }
      flightsByCallsign[flight.callsign].push(flight);
    });
    
    // Sort flights within each callsign group by flight number
    Object.values(flightsByCallsign).forEach(callsignFlights => {
      callsignFlights.sort((a, b) => parseInt(a.flightNumber) - parseInt(b.flightNumber));
    });
    
    // Flatten back to a single array preserving callsign group order
    const sortedFlights: Flight[] = [];
    callsignOrder.forEach(callsign => {
      sortedFlights.push(...flightsByCallsign[callsign]);
    });

    // 2. Get unique callsigns in the order they first appear in the original list
    const uniqueCallsigns = callsignOrder;

    // 3. Create lists of all dash-1, dash-3, dash-2, and dash-4 positions that need to be filled
    const dashOnePositions: { flightId: string; callsign: string; flightNumber: string }[] = [];
    const dashThreePositions: { flightId: string; callsign: string; flightNumber: string }[] = [];
    const dashTwoPositions: { flightId: string; callsign: string; flightNumber: string }[] = [];
    const dashFourPositions: { flightId: string; callsign: string; flightNumber: string }[] = [];

    // Collect all positions that need to be filled
    sortedFlights.forEach(flight => {
      const flightId = `${flight.id}`;
      const currentAssignments = newAssignments[flightId] || [];
      
      // Check if dash-1 position is empty
      if (!currentAssignments.some(p => p.dashNumber === "1")) {
        dashOnePositions.push({ 
          flightId, 
          callsign: flight.callsign, 
          flightNumber: flight.flightNumber 
        });
      }
      
      // Check if dash-3 position is empty
      if (!currentAssignments.some(p => p.dashNumber === "3")) {
        dashThreePositions.push({ 
          flightId, 
          callsign: flight.callsign, 
          flightNumber: flight.flightNumber 
        });
      }
      
      // Check if dash-2 position is empty
      if (!currentAssignments.some(p => p.dashNumber === "2")) {
        dashTwoPositions.push({ 
          flightId, 
          callsign: flight.callsign, 
          flightNumber: flight.flightNumber 
        });
      }
      
      // Check if dash-4 position is empty
      if (!currentAssignments.some(p => p.dashNumber === "4")) {
        dashFourPositions.push({ 
          flightId, 
          callsign: flight.callsign, 
          flightNumber: flight.flightNumber 
        });
      }
    });

    // 4. Filter out pilots that are already assigned
    const getAssignedPilotBoardNumbers = () => {
      const assignedBoardNumbers = new Set<string>();
      Object.values(newAssignments).forEach(pilots => {
        pilots.forEach(pilot => {
          assignedBoardNumbers.add(pilot.boardNumber);
        });
      });
      return assignedBoardNumbers;
    };

    // Get pilots that are not yet assigned
    const getAvailablePilots = () => {
      const assignedBoardNumbers = getAssignedPilotBoardNumbers();
      return availablePilots.filter(pilot => !assignedBoardNumbers.has(pilot.boardNumber));
    };

    // 5. Categorize pilots by qualification and billet rank
    const categorizePilots = (pilots: Pilot[]) => {
      // Priority order for billets: CO, XO, OPS O, other staff positions
      const rankOrder = ['CO', 'XO', 'OPS O', 'Train OIC', 'Admin OIC', 'Intel OIC', 'DS Admin'];
      
      const rankPilots = pilots
        .filter(p => rankOrder.some(rank => p.billet?.includes(rank)))
        .sort((a, b) => {
          const aRank = rankOrder.findIndex(rank => a.billet?.includes(rank));
          const bRank = rankOrder.findIndex(rank => b.billet?.includes(rank));
          if (aRank === bRank) return 0;
          if (aRank === -1) return 1;
          if (bRank === -1) return -1;
          return aRank - bRank;
        });

      const flightLeads = pilots.filter(p => 
        p.qualifications.some(q => q.type === 'Flight Lead' || q.type === 'Strike Lead' || q.type === 'Instructor Pilot') &&
        !rankPilots.some(rp => rp.boardNumber === p.boardNumber)
      );
      
      const sectionLeads = pilots.filter(p => 
        p.qualifications.some(q => q.type === 'Section Lead') &&
        !flightLeads.some(fl => fl.boardNumber === p.boardNumber) &&
        !rankPilots.some(rp => rp.boardNumber === p.boardNumber)
      );
      
      const wingmen = pilots.filter(p => 
        !rankPilots.some(rp => rp.boardNumber === p.boardNumber) &&
        !flightLeads.some(fl => fl.boardNumber === p.boardNumber) &&
        !sectionLeads.some(sl => sl.boardNumber === p.boardNumber)
      );

      return {
        rankPilots,
        flightLeads,
        sectionLeads,
        wingmen
      };
    };

    // 6. Assign pilots based on the specified rules
    const assignPilotToPosition = (
      pilot: Pilot,
      position: { flightId: string; callsign: string; flightNumber: string },
      dashNumber: string
    ) => {
      if (!newAssignments[position.flightId]) {
        newAssignments[position.flightId] = [];
      }
      
      // Add the assigned pilot with the dash number
      newAssignments[position.flightId].push({
        ...pilot,
        dashNumber
      });
      
      return true; // Assignment successful
    };

    let availablePilotPool = getAvailablePilots();
    const categorized = categorizePilots(availablePilotPool);

    // Rule 1 & 2: Assign highest ranking pilots to dash-1 positions of first flight of each callsign
    uniqueCallsigns.forEach((callsign, index) => {
      // Find the first flight for this callsign
      const firstFlightPos = dashOnePositions.find(pos => 
        pos.callsign === callsign && pos.flightNumber === "1"
      );
      
      if (firstFlightPos) {
        // Assign based on rank for the first few callsigns
        if (index < categorized.rankPilots.length) {
          const pilot = categorized.rankPilots[index];
          assignPilotToPosition(pilot, firstFlightPos, "1");
        } else if (categorized.flightLeads.length > 0) {
          // If no more ranked pilots, use flight leads
          const pilot = categorized.flightLeads[0];
          assignPilotToPosition(pilot, firstFlightPos, "1");
          categorized.flightLeads.splice(0, 1); // Remove assigned pilot
        }
      }
    });

    // Update available pilots pool after first wave of assignments
    availablePilotPool = getAvailablePilots();
    const updatedCategorized = categorizePilots(availablePilotPool);

    // Rule 3: Fill remaining dash-1 positions with flight lead qualified pilots
    const remainingDashOnePositions = dashOnePositions.filter(pos => {
      return !newAssignments[pos.flightId]?.some(p => p.dashNumber === "1");
    });

    remainingDashOnePositions.forEach(position => {
      if (updatedCategorized.flightLeads.length > 0) {
        const pilot = updatedCategorized.flightLeads[0];
        assignPilotToPosition(pilot, position, "1");
        updatedCategorized.flightLeads.splice(0, 1); // Remove assigned pilot
      } else if (updatedCategorized.rankPilots.length > 0) {
        // Use ranked pilots if no more flight leads
        const pilot = updatedCategorized.rankPilots[0];
        assignPilotToPosition(pilot, position, "1");
        updatedCategorized.rankPilots.splice(0, 1);
      }
    });

    // Re-update available pilots
    availablePilotPool = getAvailablePilots();
    const categorizedAfterDashOne = categorizePilots(availablePilotPool);

    // Rule 4: Fill dash-3 positions with section lead qualified pilots
    dashThreePositions.forEach(position => {
      if (categorizedAfterDashOne.sectionLeads.length > 0) {
        const pilot = categorizedAfterDashOne.sectionLeads[0];
        assignPilotToPosition(pilot, position, "3");
        categorizedAfterDashOne.sectionLeads.splice(0, 1); // Remove assigned pilot
      } else if (categorizedAfterDashOne.flightLeads.length > 0) {
        // Use flight leads if no more section leads
        const pilot = categorizedAfterDashOne.flightLeads[0];
        assignPilotToPosition(pilot, position, "3");
        categorizedAfterDashOne.flightLeads.splice(0, 1);
      }
    });

    // Re-update available pilots
    availablePilotPool = getAvailablePilots();
    const categorizedAfterDashThree = categorizePilots(availablePilotPool);

    // Rule 5: Fill dash-2 positions with remaining pilots
    dashTwoPositions.forEach(position => {
      // Prioritize any remaining qualified pilots
      let pilotToAssign = null;
      
      if (categorizedAfterDashThree.wingmen.length > 0) {
        pilotToAssign = categorizedAfterDashThree.wingmen[0];
        categorizedAfterDashThree.wingmen.splice(0, 1);
      } else if (categorizedAfterDashThree.sectionLeads.length > 0) {
        pilotToAssign = categorizedAfterDashThree.sectionLeads[0];
        categorizedAfterDashThree.sectionLeads.splice(0, 1);
      } else if (categorizedAfterDashThree.flightLeads.length > 0) {
        pilotToAssign = categorizedAfterDashThree.flightLeads[0];
        categorizedAfterDashThree.flightLeads.splice(0, 1);
      } else if (categorizedAfterDashThree.rankPilots.length > 0) {
        pilotToAssign = categorizedAfterDashThree.rankPilots[0];
        categorizedAfterDashThree.rankPilots.splice(0, 1);
      }
      
      if (pilotToAssign) {
        assignPilotToPosition(pilotToAssign, position, "2");
      }
    });

    // Re-update available pilots
    availablePilotPool = getAvailablePilots();
    const categorizedAfterDashTwo = categorizePilots(availablePilotPool);

    // Rule 5 (continued): Fill dash-4 positions with remaining pilots
    dashFourPositions.forEach(position => {
      let pilotToAssign = null;
      
      if (categorizedAfterDashTwo.wingmen.length > 0) {
        pilotToAssign = categorizedAfterDashTwo.wingmen[0];
        categorizedAfterDashTwo.wingmen.splice(0, 1);
      } else if (categorizedAfterDashTwo.sectionLeads.length > 0) {
        pilotToAssign = categorizedAfterDashTwo.sectionLeads[0];
        categorizedAfterDashTwo.sectionLeads.splice(0, 1);
      } else if (categorizedAfterDashTwo.flightLeads.length > 0) {
        pilotToAssign = categorizedAfterDashTwo.flightLeads[0];
        categorizedAfterDashTwo.flightLeads.splice(0, 1);
      } else if (categorizedAfterDashTwo.rankPilots.length > 0) {
        pilotToAssign = categorizedAfterDashTwo.rankPilots[0];
        categorizedAfterDashTwo.rankPilots.splice(0, 1);
      }
      
      if (pilotToAssign) {
        assignPilotToPosition(pilotToAssign, position, "4");
      }
    });

    // Rule 6: Make sure each flight has at least 2 pilots if possible
    const checkFlightsWithFewerThanTwoPilots = () => {
      const flightsNeeding = [];
      
      for (const flight of sortedFlights) {
        const flightId = `${flight.id}`;
        const assignedCount = newAssignments[flightId]?.length || 0;
        
        if (assignedCount < 2) {
          flightsNeeding.push({
            flightId,
            callsign: flight.callsign,
            flightNumber: flight.flightNumber,
            assignedCount
          });
        }
      }
      
      return flightsNeeding;
    };

    const flightsNeedingPilots = checkFlightsWithFewerThanTwoPilots();
    const lastAvailablePilots = getAvailablePilots();
    
    // Try to ensure every flight has at least the lead and wingman positions filled
    flightsNeedingPilots.forEach(flight => {
      if (lastAvailablePilots.length === 0) return;
      
      const flightAssignments = newAssignments[flight.flightId] || [];
      
      // If no pilots assigned, add one to dash-1 position
      if (flightAssignments.length === 0) {
        const pilot = lastAvailablePilots.shift();
        if (pilot) {
          assignPilotToPosition(pilot, flight, "1");
        }
      }
      
      // If we have one pilot and still have available pilots, add one to dash-2 position
      if (flightAssignments.length === 1 && lastAvailablePilots.length > 0) {
        const pilot = lastAvailablePilots.shift();
        if (pilot) {
          assignPilotToPosition(pilot, flight, "2");
        }
      }
    });

    // Rule 8: Assign mission commander to the most senior pilot in a dash-1 slot
    const assignMissionCommander = () => {
      // Priority order for billets: CO, XO, OPS O, other staff positions
      const rankOrder = ['CO', 'XO', 'OPS O', 'Train OIC', 'Admin OIC', 'Intel OIC', 'DS Admin'];
      
      // Get all assigned pilots across all flights
      const allAssignedPilots: Array<{
        boardNumber: string;
        callsign: string;
        flightId: string;
        flightCallsign: string;
        flightNumber: string;
        billet: string;
        dashNumber: string;
      }> = [];
      
      Object.entries(newAssignments).forEach(([flightId, pilots]) => {
        pilots.forEach(pilot => {
          const flightParts = flightId.split('-');
          const flightCallsign = flightParts[0] || "";
          const flightNumber = flightParts[1] || "";
          
          allAssignedPilots.push({
            boardNumber: pilot.boardNumber,
            callsign: pilot.callsign,
            flightId,
            flightCallsign,
            flightNumber,
            billet: pilot.billet || "",
            dashNumber: pilot.dashNumber
          });
        });
      });
      
      // Sort by billet rank (most senior staff first)
      allAssignedPilots.sort((a, b) => {
        const aRank = rankOrder.findIndex(rank => a.billet?.includes(rank));
        const bRank = rankOrder.findIndex(rank => b.billet?.includes(rank));
        if (aRank === bRank) return 0;
        if (aRank === -1) return 1;
        if (bRank === -1) return -1;
        return aRank - bRank;
      });
      
      // Find the highest ranking staff member
      const seniorStaff = allAssignedPilots.find(pilot => 
        rankOrder.some(rank => pilot.billet?.includes(rank))
      );
      
      // If we have a senior staff member, assign them as mission commander
      if (seniorStaff) {
        setMissionCommander({
          boardNumber: seniorStaff.boardNumber,
          callsign: seniorStaff.callsign,
          flightId: seniorStaff.flightId,
          flightCallsign: seniorStaff.flightCallsign,
          flightNumber: seniorStaff.flightNumber
        });
      } else if (allAssignedPilots.length > 0) {
        // If no senior staff, find the first dash-1 pilot
        const dashOnePilot = allAssignedPilots.find(p => p.dashNumber === "1");
        if (dashOnePilot) {
          setMissionCommander({
            boardNumber: dashOnePilot.boardNumber,
            callsign: dashOnePilot.callsign,
            flightId: dashOnePilot.flightId,
            flightCallsign: dashOnePilot.flightCallsign,
            flightNumber: dashOnePilot.flightNumber
          });
        }
      }
    };
    
    // Apply the assignments and set mission commander
    setAssignedPilots(newAssignments);
    assignMissionCommander();
    
  }, [assignedPilots, setAssignedPilots, setMissionCommander]);

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
            height: 'calc(100vh - 20px)', // Changed from 40px to 20px to make cards taller
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
          <MissionDetails 
            width={CARD_WIDTH} 
            events={SAMPLE_EVENTS}
            selectedEvent={selectedEvent}
            onEventSelect={setSelectedEvent}
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