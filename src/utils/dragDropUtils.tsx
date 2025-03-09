import type { Pilot } from '../types/PilotTypes';
import type { MissionCommanderInfo } from '../types/MissionCommanderTypes';

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
  assignedPilots: Record<string, Pilot[]>
): Record<string, Pilot[]> => {
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
  source: { flightId: string; pilot: Pilot },
  target: { flightId: string; dashNumber: string; currentPilot?: Pilot },
  assignedPilots: Record<string, Pilot[]>
): Record<string, Pilot[]> => {
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

// Check if pilot being moved affects mission commander
export const handleMissionCommanderCheck = (
  boardNumber: string, 
  newDashNumber: string | undefined, 
  missionCommander: MissionCommanderInfo | null
): MissionCommanderInfo | null => {
  // Check if the affected pilot is the mission commander
  if (missionCommander && missionCommander.boardNumber === boardNumber) {
    // If the pilot is moved to a non-lead position or removed completely, reset mission commander
    if (!newDashNumber || newDashNumber !== "1") {
      return null;
    }
  }
  return missionCommander;
};

// Get all mission commander candidates from positions -1
export const getMissionCommanderCandidates = (assignedPilots: Record<string, Pilot[]>) => {
  const candidates: { 
    label: string; 
    value: string;
    boardNumber: string;
    callsign: string;
    flightId: string;
    flightCallsign: string;
    flightNumber: string;
  }[] = [];

  Object.entries(assignedPilots).forEach(([flightId, flightPilots]) => {
    // Find all flights that have their -1 position filled
    const dashOnePilot = flightPilots.find(p => p.dashNumber === "1");
    
    if (dashOnePilot) {
      // Find the flight details of this pilot by manually searching through flights
      let flightDetails = { callsign: "", number: "" };
      
      // First look for the flight in our flights state
      document.querySelectorAll('.aircraft-tile-label').forEach(element => {
        if (element.textContent && element.textContent.includes(`-1`) && 
            element.closest('[data-drop-id]')?.getAttribute('data-drop-id') === `flight-${flightId}-position-1`) {
          const text = element.textContent.trim();
          const parts = text.split(' ');
          if (parts.length >= 2) {
            flightDetails.callsign = parts[0];
            flightDetails.number = parts[1].split('-')[0];
          }
        }
      });
      
      // Create a candidate entry with the correct format: "CALLSIGN FLIGHT-POSITION | BOARDNUM PILOTCALLSIGN"
      const label = `${flightDetails.callsign} ${flightDetails.number}-1 | ${dashOnePilot.boardNumber} ${dashOnePilot.callsign}`;
      
      candidates.push({
        label,
        value: dashOnePilot.boardNumber,
        boardNumber: dashOnePilot.boardNumber,
        callsign: dashOnePilot.callsign,
        flightId,
        flightCallsign: flightDetails.callsign,
        flightNumber: flightDetails.number
      });
    }
  });

  return candidates;
};