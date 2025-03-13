import type { Pilot } from '../types/PilotTypes';
import type { MissionCommanderInfo } from '../types/MissionCommanderTypes';

interface AssignedPilot extends Pilot {
  dashNumber: string;
}

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
    updated[flightId] = updated[flightId].filter(p => p.boardNumber !== boardNumber);
    
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
  
  // Add source pilot to target position
  updated[target.flightId].push({
    ...source.pilot,
    dashNumber: target.dashNumber
  });
  
  // If target had a pilot and it's a different pilot than source,
  // and source wasn't in the available pilots list,
  // then add that pilot to source position
  if (target.currentPilot && 
      target.currentPilot.boardNumber !== source.pilot.boardNumber &&
      source.flightId) {
    
    updated[source.flightId].push({
      ...target.currentPilot,
      dashNumber: source.pilot.dashNumber
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
  newDashNumber: string | undefined,
  currentCommander: MissionCommanderInfo | null
): MissionCommanderInfo | null => {
  // If the pilot being moved is the current mission commander
  if (currentCommander?.boardNumber === boardNumber) {
    // If they're leaving a -1 position, remove them as mission commander
    if (currentCommander.flightId && !newDashNumber) {
      return null;
    }
  }
  return currentCommander;
};

// Check if a pilot is eligible to be mission commander based on their qualifications
const isEligibleForMissionCommander = (pilot: Pilot): boolean => {
  // Add null check to prevent errors when qualifications is undefined
  if (!pilot.qualifications) {
    console.warn('Pilot missing qualifications:', pilot);
    return false;
  }
  
  return pilot.qualifications.some(qual => 
    qual.type === 'Flight Lead' || qual.type === 'Strike Lead' || qual.type === 'Instructor Pilot'
  );
};

// Get candidates for mission commander from all pilots
export const getMissionCommanderCandidates = (
  assignedPilots: Record<string, AssignedPilot[]>
): Array<{ boardNumber: string; callsign: string; }> => {
  // Filter to get only assigned pilots who are flight leads
  const candidates: Array<{ boardNumber: string; callsign: string; }> = [];
  
  Object.entries(assignedPilots).forEach(([flightId, flightPilots]) => {
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
      if (pilot.dashNumber === "1" && isEligibleForMissionCommander(pilot)) {
        candidates.push({
          boardNumber: pilot.boardNumber,
          callsign: pilot.callsign
        });
      }
    });
  });
  
  return candidates;
};