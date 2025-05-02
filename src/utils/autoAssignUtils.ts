import type { Flight } from '../types/FlightData';
import type { Pilot } from '../types/PilotTypes'; // Import the main Pilot type
import type { MissionCommanderInfo } from '../types/MissionCommanderTypes';

// Use the imported Pilot type and extend it locally if needed,
// but ensure attendanceStatus includes 'declined' based on the imported type.
interface AssignedPilot extends Pilot {
  dashNumber: string;
  // attendanceStatus and rollCallStatus are inherited from Pilot
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
  availablePilots: Pilot[], // Use the imported Pilot type
  assignedPilots: Record<string, AssignedPilot[]>,
  allPilotQualifications: Record<string, any[]>
): {
  newAssignments: Record<string, AssignedPilot[]>,
  suggestedMissionCommander: MissionCommanderInfo | null
} => {
  // DEBUG: Log attendance status of available pilots
  console.log('[ROLL-CALL-DEBUG] Pilots available for auto-assign:', availablePilots.length);
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

  // --- UPDATED: Filter pilots based on assignable statuses --- 
  const assignablePilots = availablePilots.filter(pilot => {
    const rollCall = pilot.rollCallStatus;
    const discord = pilot.attendanceStatus; // This now correctly includes 'declined'

    // Rule 3: Explicitly EXCLUDE pilots who are Absent or Declined
    if (rollCall === 'Absent' || discord === 'declined') {
      console.log(`[ROLL-CALL-DEBUG] Excluding ${pilot.callsign} due to negative status: RollCall=${rollCall || 'none'}, Discord=${discord || 'none'}`);
      return false; // Do not assign if Absent or Declined
    }

    // Rule 4: Explicitly EXCLUDE pilots if BOTH statuses are undefined
    if (rollCall === undefined && discord === undefined) {
      console.log(`[ROLL-CALL-DEBUG] Excluding ${pilot.callsign} due to both statuses being undefined.`);
      return false; // Do not assign if both are undefined
    }

    // If not explicitly excluded, the pilot is assignable (Present, Accepted, Tentative, or only one status defined)
    return true;
  });

  console.log(`[ROLL-CALL-DEBUG] Filtered ${assignablePilots.length} pilots eligible for assignment:`, assignablePilots.map(p => `${p.callsign} (D:${p.attendanceStatus || 'N/A'}, R:${p.rollCallStatus || 'N/A'})`));


  // Check if there are any assignable pilots left after filtering
  if (assignablePilots.length === 0) {
    console.log("No pilots with assignable status found after filtering.");
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
    const pilotQuals = allPilotQualifications[pilot.id] ||
                      allPilotQualifications[pilot.boardNumber] ||
                      [];
    let highestPriority = 10; // Default lower than wingman

    for (const qual of pilotQuals) {
      if (!qual.qualification) continue;
      const qualName = qual.qualification.name.toLowerCase();
      for (const [pattern, priority] of Object.entries(qualificationToPriorityMap)) {
        if (qualName.includes(pattern) && priority < highestPriority) {
          highestPriority = priority;
        }
      }
    }
    return highestPriority;
  };

  // --- UPDATED: Helper function for status priority based on rules ---
  const getPilotStatusPriority = (pilot: Pilot): number => {
    const rollCall = pilot.rollCallStatus;
    const discord = pilot.attendanceStatus;

    // Rule 1: Highest priority for positive responses
    if (rollCall === 'Present' || discord === 'accepted') return 1;

    // Rule 2: Next priority for tentative responses
    if (rollCall === 'Tentative' || discord === 'tentative') return 2;

    // Should not happen due to filtering, but assign lowest priority just in case
    // This covers cases where only one status is defined and it's not positive/tentative (which shouldn't occur with current types)
    return 3; 
  };

  // --- UPDATED: Sort pilots by status priority, then qualification priority ---
  const sortedPilots = [...assignablePilots].sort((a, b) => {
    const statusPriorityA = getPilotStatusPriority(a);
    const statusPriorityB = getPilotStatusPriority(b);

    if (statusPriorityA !== statusPriorityB) {
      return statusPriorityA - statusPriorityB; // Lower status number = higher priority (1 > 2)
    }

    // If status priority is the same, sort by qualification priority
    return getPilotPriority(a) - getPilotPriority(b); // Lower qualification number = higher priority
  });

  console.log("Sorted pilots by status and qualification priority:", sortedPilots.map(p => `${p.callsign} (S:${getPilotStatusPriority(p)}, Q:${getPilotPriority(p)})`));

  // Function to check if a pilot is already assigned
  const isPilotAssigned = (pilotId: string): boolean => {
    for (const flightId in newAssignments) {
      for (const assignedPilot of newAssignments[flightId]) {
        // Check both id and boardNumber for robustness, though id should be primary
        if (assignedPilot.id === pilotId || (assignedPilot.boardNumber && assignedPilot.boardNumber === pilotId)) {
          return true;
        }
      }
    }
    return false;
  };

  // Helper to get the primary ID (Supabase UUID) or fallback to boardNumber if needed
  const getPilotIdentifier = (pilot: Pilot): string => pilot.id || pilot.boardNumber;


  // First pass: assign flight leads (1-1) positions
  for (const flight of flights) {
    const flightId = flight.id;
    if (newAssignments[flightId]?.some(p => p.dashNumber === "1")) continue;
    if (!newAssignments[flightId]) newAssignments[flightId] = [];

    for (const pilot of sortedPilots) {
      const pilotId = getPilotIdentifier(pilot);
      if (!isPilotAssigned(pilotId)) {
        const assignedPilot: AssignedPilot = { ...pilot, dashNumber: "1" };
        console.log(`[ROLL-CALL-DEBUG] Assigning FL (1-1) in ${flightId}: ${pilot.callsign} (S:${getPilotStatusPriority(pilot)}, Q:${getPilotPriority(pilot)})`);
        newAssignments[flightId].push(assignedPilot);
        break; // Assign one pilot and move to the next flight
      }
    }
  }

  // Second pass: assign section leads (1-3) positions
  for (const flight of flights) {
    const flightId = flight.id;
    if (newAssignments[flightId]?.some(p => p.dashNumber === "3")) continue;
    if (!newAssignments[flightId]) newAssignments[flightId] = [];

    for (const pilot of sortedPilots) {
      const pilotId = getPilotIdentifier(pilot);
      if (!isPilotAssigned(pilotId)) {
        const assignedPilot: AssignedPilot = { ...pilot, dashNumber: "3" };
         console.log(`[ROLL-CALL-DEBUG] Assigning SL (1-3) in ${flightId}: ${pilot.callsign} (S:${getPilotStatusPriority(pilot)}, Q:${getPilotPriority(pilot)})`);
        newAssignments[flightId].push(assignedPilot);
        break;
      }
    }
  }

  // Third pass: assign wingmen (1-2, 1-4) positions
  for (const flight of flights) {
    const flightId = flight.id;
    if (!newAssignments[flightId]) newAssignments[flightId] = [];

    // Assign 1-2
    if (!newAssignments[flightId]?.some(p => p.dashNumber === "2")) {
      for (const pilot of sortedPilots) {
        const pilotId = getPilotIdentifier(pilot);
        if (!isPilotAssigned(pilotId)) {
          const assignedPilot: AssignedPilot = { ...pilot, dashNumber: "2" };
          console.log(`[ROLL-CALL-DEBUG] Assigning W1 (1-2) in ${flightId}: ${pilot.callsign} (S:${getPilotStatusPriority(pilot)}, Q:${getPilotPriority(pilot)})`);
          newAssignments[flightId].push(assignedPilot);
          break;
        }
      }
    }

    // Assign 1-4
    if (!newAssignments[flightId]?.some(p => p.dashNumber === "4")) {
      for (const pilot of sortedPilots) {
        const pilotId = getPilotIdentifier(pilot);
        if (!isPilotAssigned(pilotId)) {
          const assignedPilot: AssignedPilot = { ...pilot, dashNumber: "4" };
          console.log(`[ROLL-CALL-DEBUG] Assigning W2 (1-4) in ${flightId}: ${pilot.callsign} (S:${getPilotStatusPriority(pilot)}, Q:${getPilotPriority(pilot)})`);
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
      console.log(`[ROLL-CALL-DEBUG] - ${flightId} pos ${pilot.dashNumber}: ${pilot.callsign} (D:${pilot.attendanceStatus || 'N/A'}, R:${pilot.rollCallStatus || 'N/A'})`);
    }
  }

  // Find mission commander candidate
  let suggestedMissionCommander: MissionCommanderInfo | null = null;
  let highestPriorityPilot: AssignedPilot | null = null;
  let highestPriorityFlightId = "";

  for (const flightId in newAssignments) {
    for (const pilot of newAssignments[flightId]) {
      if (pilot.dashNumber === "1") { // Only consider flight leads
        const priority = getPilotPriority(pilot);
        if (!highestPriorityPilot || priority < getPilotPriority(highestPriorityPilot)) {
          highestPriorityPilot = pilot;
          highestPriorityFlightId = flightId;
        }
      }
    }
  }

  if (highestPriorityPilot) {
    const flight = flights.find(f => f.id === highestPriorityFlightId);
    if (flight) {
      suggestedMissionCommander = {
        boardNumber: highestPriorityPilot.boardNumber,
        callsign: highestPriorityPilot.callsign,
        flightId: highestPriorityFlightId,
        flightCallsign: flight.callsign,
        flightNumber: flight.flightNumber
      };
      console.log(`[ROLL-CALL-DEBUG] Suggested Mission Commander: ${suggestedMissionCommander.callsign}`);
    }
  } else {
     console.log(`[ROLL-CALL-DEBUG] No suitable Mission Commander candidate found.`);
  }


  console.log("Auto-assignment complete.");

  return {
    newAssignments,
    suggestedMissionCommander
  };
};
