import type { Pilot } from '../types/PilotTypes';
import type { MissionCommanderInfo } from '../types/MissionCommanderTypes';

interface AssignedPilot extends Pilot {
  dashNumber: string;
  attendanceStatus?: 'accepted' | 'tentative';
  rollCallStatus?: 'Present' | 'Absent' | 'Tentative';
}

// Utility to clean up role IDs by removing duplicated prefixes
export const cleanRoleId = (roleId: string): string => {
  if (!roleId.startsWith('support-')) return roleId;
  
  // Check for and fix duplicated prefixes
  if (roleId.startsWith('support-support-')) {
    return 'support-' + roleId.substring(16); // Skip the duplicated prefix
  }
  
  // Handle any other case of multiple prefixes
  let count = 0;
  let currentIndex = 0;
  
  while (roleId.indexOf('support-', currentIndex) !== -1) {
    currentIndex = roleId.indexOf('support-', currentIndex) + 8;
    count++;
  }
  
  if (count > 1) {
    // Extract the unique part after all the support- prefixes
    const uniquePart = roleId.substring(8 * count);
    return 'support-' + uniquePart;
  }
  
  return roleId;
};

// Find a pilot by board number across all flights
export const findPilotInFlights = (
  boardNumber: string, 
  assignedPilots: Record<string, Pilot[]>
): { flightId: string; pilot: Pilot; } | null => {
  for (const [flightId, flightPilots] of Object.entries(assignedPilots)) {
    const pilot = flightPilots.find(p => p.boardNumber === boardNumber);
    if (pilot) {
      return { flightId, pilot };
    }
  }
  return null;
};

// Remove pilot from all flights
export const removePilotFromAllFlights = (
  boardNumber: string, 
  assignedPilots: Record<string, AssignedPilot[]>
): Record<string, AssignedPilot[]> => {
  const updated = { ...assignedPilots };
  
  // Check all flights for this pilot
  Object.keys(updated).forEach(flightId => {
    // Remove this pilot from the flight
    updated[flightId] = updated[flightId].filter(p => {
      // Make sure we're comparing strings properly
      const pilotBoardNumber = p.boardNumber?.trim() || '';
      return pilotBoardNumber !== boardNumber;
    });
    
    // If flight is now empty, remove it
    if (updated[flightId].length === 0) {
      delete updated[flightId];
    }
  });
  
  return updated;
};

// Swap pilots between two positions
export const swapPilots = (
  source: { flightId: string; pilot: AssignedPilot },
  target: { flightId: string; dashNumber: string; currentPilot?: AssignedPilot },
  assignedPilots: Record<string, AssignedPilot[]>
): Record<string, AssignedPilot[]> => {
  const updated = { ...assignedPilots };
  
  // Remove source pilot from their flight
  if (source.flightId) {
    updated[source.flightId] = (updated[source.flightId] || [])
      .filter(p => p.boardNumber !== source.pilot.boardNumber);
  }
  
  // Create target flight array if it doesn't exist
  if (!updated[target.flightId]) {
    updated[target.flightId] = [];
  }
  
  // Remove any pilot currently in the target position
  updated[target.flightId] = updated[target.flightId]
    .filter(p => p.dashNumber !== target.dashNumber);
    // Add source pilot to target position with preserved attendance status
  updated[target.flightId].push({
    ...source.pilot,
    dashNumber: target.dashNumber,
    attendanceStatus: source.pilot.attendanceStatus // Explicitly preserve attendance status
  });
  
  // If target had a pilot and it's a different pilot than source,
  // and source wasn't in the available pilots list,
  // then add that pilot to source position
  if (target.currentPilot && 
      target.currentPilot.boardNumber !== source.pilot.boardNumber &&
      source.flightId) {
    
    updated[source.flightId].push({
      ...target.currentPilot,
      dashNumber: source.pilot.dashNumber,
      attendanceStatus: target.currentPilot.attendanceStatus // Explicitly preserve attendance status
    });
  }
  
  // Clean up any empty flights
  Object.keys(updated).forEach(id => {
    if (updated[id].length === 0) {
      delete updated[id];
    }
  });
  
  return updated;
};

// Check and update mission commander status based on pilot movement
export const handleMissionCommanderCheck = (
  boardNumber: string,
  newFlightId: string | undefined,
  newDashNumber: string | undefined,
  currentCommander: MissionCommanderInfo | null
): MissionCommanderInfo | null => {
  // If no mission commander is set, nothing changes
  if (!currentCommander) {
    return null;
  }
  
  // If the pilot being moved is the current mission commander
  if (currentCommander?.boardNumber === boardNumber) {
    // If they're moving to a non-dash-1 position or being removed completely, 
    // they can no longer be mission commander
    if (!newDashNumber || newDashNumber !== "1") {
      return null;
    }
    
    // If they're moving to a dash-1 position in a different flight,
    // update their flight info but keep them as mission commander
    if (newFlightId && newFlightId !== currentCommander.flightId) {
      // Extract flight callsign and number from flight ID
      const flightParts = newFlightId.split('-');
      const flightCallsign = flightParts[0];
      const flightNumber = flightParts.length > 1 ? flightParts[1] : '';
      
      // Update mission commander with new flight info
      return {
        ...currentCommander,
        flightId: newFlightId,
        flightCallsign,
        flightNumber
      };
    }
  }
  
  return currentCommander;
};

// Check if a pilot is eligible to be mission commander based on their qualifications
// This function is kept for future use when we implement qualification-based mission commander selection
/* 
const isEligibleForMissionCommander = (pilot: Pilot): boolean => {
  // Add null check to prevent errors when qualifications is undefined
  if (!pilot.qualifications) {
    return false;
  }
  
  return pilot.qualifications.some(qual => 
    qual.type === 'Flight Lead' || qual.type === 'Strike Lead' || qual.type === 'Instructor Pilot'
  );
};
*/

// Get candidates for mission commander from all pilots
export const getMissionCommanderCandidates = (
  assignedPilots: Record<string, AssignedPilot[]>
): Array<{ boardNumber: string; callsign: string; }> => {
  // Filter to get only assigned pilots who are in -1 position
  const candidates: Array<{ boardNumber: string; callsign: string; }> = [];
  
  Object.entries(assignedPilots).forEach(([, flightPilots]) => {
    // Ensure the flight array exists and has pilots
    if (!flightPilots || !Array.isArray(flightPilots)) {
      return;
    }
    
    flightPilots.forEach(pilot => {
      // Skip if pilot is not properly formed
      if (!pilot || !pilot.boardNumber || !pilot.callsign) {
        return;
      }
      
      // Only pilots in -1 position are eligible
      // We're removing the additional qualification check here since being in
      // dash-1 position is what matters for selection in the dropdown
      if (pilot.dashNumber === "1") {
        candidates.push({
          boardNumber: pilot.boardNumber,
          callsign: pilot.callsign
        });
      }
    });
  });
  
  return candidates;
};