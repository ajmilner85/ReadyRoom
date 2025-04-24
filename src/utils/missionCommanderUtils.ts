import { getMissionCommanderCandidates, findPilotInFlights } from './dragDropUtils';

/**
 * Get mission commander candidates with additional flight info
 * @param assignedPilots Current assigned pilots map
 * @returns Array of mission commander candidates with flight info and label/value for selection
 */
export const getMissionCommanderCandidatesWithFlightInfo = (
  assignedPilots: Record<string, any[]>
): {
  label: string;
  value: string;
  boardNumber: string;
  callsign: string;
  flightId: string;
  flightCallsign: string;
  flightNumber: string;
}[] => {
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
};
