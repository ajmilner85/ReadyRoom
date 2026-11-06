import type { Flight, FlightMember } from '../types/FlightData';

/**
 * Builds Mission Coordination flight strips from Mission Prep flight assignments
 * ("Transfer to Mission"). Moved verbatim from Communications.tsx so the Flight Assignments
 * footer can use it.
 */

/** Total fuel (lbs) for a DCS unit, including FPU-8A external tanks on the F/A-18C. */
export function calculateTotalFuel(unit: any): number {
  let totalFuel = unit.fuel || 4900; // Default to standard F/A-18C internal fuel if not specified
  try {
    if (unit.payload?.pylons) {
      const pylonValues = Array.isArray(unit.payload.pylons) ? unit.payload.pylons : Object.values(unit.payload.pylons);
      pylonValues.forEach((pylon: { CLSID: string }) => {
        if (!pylon || typeof pylon !== 'object') return;
        const clsid = pylon.CLSID;
        if (!clsid) return;
        // Only count FPU-8A tanks for F/A-18C
        if (clsid === '{FPU_8A_FUEL_TANK}' && unit.type === 'FA-18C_hornet') totalFuel += 2200;
      });
    }
  } catch (error) {
    console.error('Error calculating fuel:', error);
  }
  return totalFuel;
}

/** Split a DCS group name ("ENFIELD 1") into callsign + flight number. */
export function parseGroupName(name: string): { callsign: string; flightNumber: string } {
  const lastSpaceIndex = name.lastIndexOf(' ');
  if (lastSpaceIndex === -1) return { callsign: name, flightNumber: '1' };
  const callsign = name.substring(0, lastSpaceIndex);
  const flightNumber = name.substring(lastSpaceIndex + 1);
  if (!/^\d+$/.test(flightNumber)) return { callsign: name, flightNumber: '1' };
  return { callsign, flightNumber };
}

export function buildTransferFlights(
  flights: any[],
  assignedPilots: Record<string, any> | null | undefined,
  squadrons: any[],
  extractedFlights: any[],
): Flight[] {
  return flights.map(flight => {
    const assigned = assignedPilots?.[flight.id] || [];

    // Owning squadron = the one whose callsign list contains this callsign (id, never tail code)
    const owningSquadron = squadrons.find(sq =>
      sq.callsigns && Array.isArray(sq.callsigns) &&
      sq.callsigns.some((cs: string) => cs.toUpperCase() === flight.callsign.toUpperCase())
    );

    const matchingExtractedFlight = extractedFlights.find(ef => {
      const { callsign, flightNumber } = parseGroupName(ef.name);
      return callsign.toUpperCase() === flight.callsign && flightNumber === flight.flightNumber;
    });

    const members = (flight.pilots || []).map((pilot: any) => {
      const assignedPilot = assigned.find((p: any) => p.dashNumber === pilot.dashNumber);
      let fuelValue = 5.0;
      if (matchingExtractedFlight && matchingExtractedFlight.units) {
        const dashPosition = parseInt(pilot.dashNumber) - 1;
        if (dashPosition >= 0 && dashPosition < matchingExtractedFlight.units.length) {
          const unit = matchingExtractedFlight.units[dashPosition];
          if (unit) fuelValue = calculateTotalFuel(unit) / 1000; // lbs -> thousands of lbs
        }
      }
      return {
        dashNumber: pilot.dashNumber,
        boardNumber: assignedPilot?.boardNumber || '',
        fuel: fuelValue,
        pilotCallsign: assignedPilot?.callsign || '',
      };
    }).filter((member: any) => member.boardNumber !== '');

    if (members.length === 0) return null;

    const lowState = Math.min(...members.map((m: FlightMember) => m.fuel));

    let aircraftType: string | undefined;
    if (owningSquadron && (owningSquadron as any).airframe) {
      aircraftType = (owningSquadron as any).airframe.designation;
    } else if (matchingExtractedFlight && matchingExtractedFlight.units && matchingExtractedFlight.units.length > 0) {
      aircraftType = matchingExtractedFlight.units[0].type;
    }

    return {
      id: `transferred-${flight.id}-${Date.now()}`,
      flightNumber: flight.flightNumber,
      callsign: flight.callsign,
      members,
      lowState,
      currentSection: '', // set to Launch in App.tsx
      currentDivision: 0, // updated from stepTime in App.tsx
      formation: members.length > 1 ? 'group' : 'single',
      squadronId: owningSquadron?.id,
      squadronColorPalette: owningSquadron?.color_palette
        ? { primary: owningSquadron.color_palette.primary, accent: owningSquadron.color_palette.accent }
        : undefined,
      aircraftType,
      stepTime: flight.stepTime ?? 0,
    };
  }).filter(Boolean) as Flight[];
}
