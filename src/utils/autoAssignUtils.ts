import type { Flight } from '../types/FlightData';
import type { Pilot } from '../types/PilotTypes';
import type { MissionCommanderInfo } from '../types/MissionCommanderTypes';

interface AssignedPilot extends Pilot {
  dashNumber: string;
  attendanceStatus?: 'accepted' | 'tentative';
  rollCallStatus?: 'Present' | 'Absent' | 'Tentative'; // Add rollCallStatus
}

/**
 * Auto-assign pilots to flights according to priority rules
 * @param flights Available flights to assign pilots to
 * @param availablePilots Pool of pilots that can be assigned
 * @param assignedPilots Current assignment state
 * @param allPilotQualifications Qualification data for all pilots
 * @returns Object with new assignments and suggested mission commander
 */
export const autoAssignPilots = (
  flights: Flight[], 
  availablePilots: Pilot[], 
  assignedPilots: Record<string, AssignedPilot[]>,
  allPilotQualifications: Record<string, any[]>
): {
  newAssignments: Record<string, AssignedPilot[]>,
  suggestedMissionCommander: MissionCommanderInfo | null
} => {
  // DEBUG: Log attendance status of available pilots
  console.log('[ROLL-CALL-DEBUG] Pilots to auto-assign with statuses:');
  availablePilots.forEach(pilot => {
    console.log(`[ROLL-CALL-DEBUG] - ${pilot.callsign} (${pilot.boardNumber}): Discord: ${pilot.attendanceStatus || 'undefined'}, RollCall: ${pilot.rollCallStatus || 'undefined'}`);
  });

  if (!flights || flights.length === 0 || !availablePilots || availablePilots.length === 0) {
    console.log("Cannot auto-assign: no flights or pilots available");
    return {
      newAssignments: { ...assignedPilots },
      suggestedMissionCommander: null
    };
  }

  console.log("Auto-assigning pilots to flights...");

  // --- NEW: Filter pilots based on assignable statuses ---
  const assignablePilots = availablePilots.filter(pilot => {
    const rollCall = pilot.rollCallStatus;
    const discord = pilot.attendanceStatus;
    // Include Present, Accepted, Tentative (Roll Call), Tentative (Discord)
    return rollCall === 'Present' || discord === 'accepted' || rollCall === 'Tentative' || discord === 'tentative';
  });

  console.log(`[ROLL-CALL-DEBUG] Filtered ${assignablePilots.length} pilots eligible for assignment:`, assignablePilots.map(p => p.callsign));

  // Check if there are any assignable pilots left after filtering
  if (assignablePilots.length === 0) {
    console.log("No pilots with assignable status found.");
    return {
      newAssignments: { ...assignedPilots }, // Return current state if no one is assignable
      suggestedMissionCommander: null
    };
  }

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
    // Get pilot qualifications from the database using the primary ID or board number
    const pilotQuals = allPilotQualifications[pilot.id] || 
                      allPilotQualifications[pilot.boardNumber] || 
                      [];
    
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

  // --- NEW: Helper function for status priority ---
  const getPilotStatusPriority = (pilot: Pilot): number => {
    const rollCall = pilot.rollCallStatus;
    const discord = pilot.attendanceStatus;

    // UPDATED: Treat Present and Accepted as equal top priority (1)
    if (rollCall === 'Present' || discord === 'accepted') return 1; 
    // UPDATED: Tentative Roll Call is next priority (2)
    if (rollCall === 'Tentative') return 2;
    // UPDATED: Tentative Discord is next priority (3)
    if (discord === 'tentative') return 3;
    
    return 4; // Fallback for pilots who somehow passed filtering but have no valid status
  };

  // --- UPDATED: Sort pilots by status priority, then qualification priority ---
  const sortedPilots = [...assignablePilots].sort((a, b) => {
    const statusPriorityA = getPilotStatusPriority(a);
    const statusPriorityB = getPilotStatusPriority(b);

    if (statusPriorityA !== statusPriorityB) {
      return statusPriorityA - statusPriorityB; // Lower status number = higher priority
    }

    // If status priority is the same, sort by qualification priority
    return getPilotPriority(a) - getPilotPriority(b); // Lower qualification number = higher priority
  });

  console.log("Sorted pilots by status and qualification priority:", sortedPilots.map(p => `${p.callsign} (S:${getPilotStatusPriority(p)}, Q:${getPilotPriority(p)})`));

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
    }    // Find highest priority available pilot
    for (const pilot of sortedPilots) {
      if (!isPilotAssigned(pilot.id) && !isPilotAssigned(pilot.boardNumber)) {
        const assignedPilot: AssignedPilot = {
          ...pilot,
          dashNumber: "1",  // Assign as flight lead (1-1)
          // Preserve both statuses
          attendanceStatus: pilot.attendanceStatus,
          rollCallStatus: pilot.rollCallStatus
        };

        // Add debug for position 1
        console.log(`[ROLL-CALL-DEBUG] Assigning to position 1 (${flightId}): ${pilot.callsign} with Discord: ${pilot.attendanceStatus || 'undefined'}, RollCall: ${pilot.rollCallStatus || 'undefined'}`);

        newAssignments[flightId].push(assignedPilot);
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
    for (const pilot of sortedPilots) {      if (!isPilotAssigned(pilot.id) && !isPilotAssigned(pilot.boardNumber)) {
        newAssignments[flightId].push({
          ...pilot,
          dashNumber: "3",  // Assign as section lead (1-3)
          // Preserve both statuses
          attendanceStatus: pilot.attendanceStatus,
          rollCallStatus: pilot.rollCallStatus
        });
        // Add debug for position 3
        console.log(`[ROLL-CALL-DEBUG] Assigning to position 3 (${flightId}): ${pilot.callsign} with Discord: ${pilot.attendanceStatus || 'undefined'}, RollCall: ${pilot.rollCallStatus || 'undefined'}`);
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
    }    // Check 1-2 position
    if (!newAssignments[flightId]?.some(p => p.dashNumber === "2")) {
      // Find first available pilot
      for (const pilot of sortedPilots) {
        if (!isPilotAssigned(pilot.id) && !isPilotAssigned(pilot.boardNumber)) {
          const assignedPilot: AssignedPilot = {
            ...pilot,
            dashNumber: "2",  // Assign as wingman (1-2)
            // Preserve both statuses
            attendanceStatus: pilot.attendanceStatus,
            rollCallStatus: pilot.rollCallStatus
          };

          // Add debug for position 2
          console.log(`[ROLL-CALL-DEBUG] Assigning to position 2 (${flightId}): ${pilot.callsign} with Discord: ${pilot.attendanceStatus || 'undefined'}, RollCall: ${pilot.rollCallStatus || 'undefined'}`);

          newAssignments[flightId].push(assignedPilot);
          break;
        }
      }
    }

    // Check 1-4 position
    if (!newAssignments[flightId]?.some(p => p.dashNumber === "4")) {
      // Find first available pilot
      for (const pilot of sortedPilots) {
        if (!isPilotAssigned(pilot.id) && !isPilotAssigned(pilot.boardNumber)) {
          const assignedPilot: AssignedPilot = {
            ...pilot,
            dashNumber: "4",  // Assign as wingman (1-4)
            // Preserve both statuses
            attendanceStatus: pilot.attendanceStatus,
            rollCallStatus: pilot.rollCallStatus
          };

          // Add debug for position 4
          console.log(`[ROLL-CALL-DEBUG] Assigning to position 4 (${flightId}): ${pilot.callsign} with Discord: ${pilot.attendanceStatus || 'undefined'}, RollCall: ${pilot.rollCallStatus || 'undefined'}`);

          newAssignments[flightId].push(assignedPilot);
          break;
        }
      }
    }
  }

  // Add debug for final assigned pilots
  console.log('[ROLL-CALL-DEBUG] Final assigned pilots with statuses:');
  for (const flightId in newAssignments) {
    for (const pilot of newAssignments[flightId]) {
      console.log(`[ROLL-CALL-DEBUG] - ${flightId} position ${pilot.dashNumber}: ${pilot.callsign} with Discord: ${pilot.attendanceStatus || 'undefined'}, RollCall: ${pilot.rollCallStatus || 'undefined'}`);
    }
  }

  // Find mission commander candidate
  let suggestedMissionCommander: MissionCommanderInfo | null = null;
  
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
        suggestedMissionCommander = {
          boardNumber: highestPriorityPilot.boardNumber,
          callsign: highestPriorityPilot.callsign,
          flightId: highestPriorityFlightId,
          flightCallsign: flight.callsign,
          flightNumber: flight.flightNumber
        };
      }
    }
  }

  console.log("Auto-assignment complete:", newAssignments);
  
  return {
    newAssignments,
    suggestedMissionCommander
  };
};
