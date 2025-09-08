import type { Flight } from '../types/FlightData';
import type { Pilot } from '../types/PilotTypes';
import type { MissionCommanderInfo } from '../types/MissionCommanderTypes';
import type { AutoAssignConfig } from '../components/ui/mission prep/AutoAssignConfig';
import { getSquadronCallsignMappings, getSquadronForCallsign, isStandardCallsign, type SquadronCallsignMapping } from './squadronCallsignService';

interface AssignedPilot extends Pilot {
  dashNumber: string;
}

interface AssignmentGate {
  attendance: string[];
  squadron: SquadronCallsignMapping | null;
  qualifications: string[] | 'NOT_OVERQUALIFIED' | null;
}

/**
 * Get qualification rank for seniority sorting (lower number = higher qualification)
 */
function getQualificationRank(pilot: Pilot): number {
  const qualifications = pilot.qualifications || [];
  
  // Strike Lead is highest (rank 1) - closest to Mission Commander
  if (qualifications.some(q => q.type === 'Strike Lead')) return 1;
  
  // Flight Lead is next (rank 2)
  if (qualifications.some(q => q.type === 'Flight Lead')) return 2;
  
  // Section Lead (rank 3)
  if (qualifications.some(q => q.type === 'Section Lead')) return 3;
  
  // LSO (rank 4)
  if (qualifications.some(q => q.type === 'LSO')) return 4;
  
  // IP (Instructor Pilot) (rank 5) 
  if (qualifications.some(q => q.type === 'Instructor Pilot')) return 5;
  
  // Wingman or no special qualifications (rank 6 - lowest, will be moved first)
  return 6;
}

/**
 * Consolidate singleton flights by moving lone pilots to fill gaps in other flights
 * This prevents inefficient single-pilot flights when possible
 */
async function consolidateSingletonFlights(
  flightOrder: Flight[],
  newAssignments: Record<string, AssignedPilot[]>,
  squadronCallsigns: SquadronCallsignMapping[],
  config: AutoAssignConfig,
  pilotSquadronMap?: Record<string, any>
): Promise<void> {
  
  let consolidationCount = 0;
  let maxIterations = 10; // Prevent infinite loops
  
  while (consolidationCount < maxIterations) {
    // Re-detect singletons after each move to avoid unnecessary subsequent moves
    const singletonFlights: { flight: Flight; pilot: AssignedPilot }[] = [];
    const flightsWithGaps: { flight: Flight; availablePositions: string[] }[] = [];
    
    for (const flight of flightOrder) {
      const assignedPilots = newAssignments[flight.id] || [];
      
      if (assignedPilots.length === 1) {
        // This is a singleton flight - candidate for moving its pilot elsewhere
        singletonFlights.push({ flight, pilot: assignedPilots[0] });
        
        // But it also has gaps (positions 2, 3, 4) - could accept pilots from other singletons
        const occupiedPositions = assignedPilots.map(p => p.dashNumber);
        const allPositions = ['1', '2', '3', '4'];
        const availablePositions = allPositions.filter(pos => !occupiedPositions.includes(pos));
        
        if (availablePositions.length > 0) {
          flightsWithGaps.push({ flight, availablePositions });
        }
      } else if (assignedPilots.length > 1 && assignedPilots.length < 4) {
        // Multi-pilot flight with gaps
        const occupiedPositions = assignedPilots.map(p => p.dashNumber);
        const allPositions = ['1', '2', '3', '4'];
        const availablePositions = allPositions.filter(pos => !occupiedPositions.includes(pos));
        
        if (availablePositions.length > 0) {
          flightsWithGaps.push({ flight, availablePositions });
        }
      }
    }
    
    
    // If no singletons remain, we're done
    if (singletonFlights.length === 0) {
      break;
    }
    
    // Try to move one singleton pilot per iteration
    let movedThisIteration = false;
    
    // Sort singletons by pilot seniority (lowest rank/least qualified first)
    const sortedSingletons = singletonFlights.sort((a, b) => {
      // Get pilot qualifications for ranking
      const pilotA = a.pilot;
      const pilotB = b.pilot;
      
      // First sort by role seniority if available (higher order = lower seniority)
      const roleA = pilotA.roles?.[0];
      const roleB = pilotB.roles?.[0];
      
      if (roleA?.role?.order && roleB?.role?.order) {
        return roleB.role.order - roleA.role.order; // Higher order number = lower seniority = move first
      }
      
      // Fallback to qualification-based ranking
      const qualRankA = getQualificationRank(pilotA);
      const qualRankB = getQualificationRank(pilotB);
      
      if (qualRankA !== qualRankB) {
        return qualRankB - qualRankA; // Higher rank number = lower qualification = move first
      }
      
      // Final fallback: board number (higher board number = junior)
      const boardA = parseInt(pilotA.boardNumber) || 0;
      const boardB = parseInt(pilotB.boardNumber) || 0;
      return boardB - boardA;
    });
    
    
    for (const singleton of sortedSingletons) {
      // Exclude the current singleton's own flight from target considerations
      const eligibleGapFlights = flightsWithGaps.filter(gap => gap.flight.id !== singleton.flight.id);
      
      let moved = false;
      
      // Priority 1: Same squadron flight with gaps (if squadron cohesion allows)
      if (config.squadronCohesion !== 'prioritizeQualifications') {
        const sameSquadronFlights = eligibleGapFlights.filter(gap => {
          const flightSquadron = getSquadronForCallsign(gap.flight.callsign, squadronCallsigns);
          const pilotSquadron = pilotSquadronMap ? (pilotSquadronMap[singleton.pilot.id] || pilotSquadronMap[singleton.pilot.boardNumber]) : null;
          return flightSquadron && pilotSquadron && pilotSquadron.id === flightSquadron.squadronId;
        });
        
        for (const targetFlight of sameSquadronFlights) {
          // Move to the lowest available position
          const lowestPosition = targetFlight.availablePositions.sort()[0];
          
          // Remove from singleton flight
          newAssignments[singleton.flight.id] = [];
          
          // Add to target flight
          const newAssignment = {
            ...singleton.pilot,
            dashNumber: lowestPosition
          };
          newAssignments[targetFlight.flight.id].push(newAssignment);
          
          moved = true;
          movedThisIteration = true;
          break;
        }
      }
      
      // Priority 2: Any flight with gaps (if enforced cohesion is not set)
      if (!moved && config.squadronCohesion !== 'enforced' && eligibleGapFlights.length > 0) {
        const targetFlight = eligibleGapFlights[0]; // Take first available flight with gaps
        const lowestPosition = targetFlight.availablePositions.sort()[0];
        
        
        // Remove from singleton flight
        newAssignments[singleton.flight.id] = [];
        
        // Add to target flight
        const newAssignment = {
          ...singleton.pilot,
          dashNumber: lowestPosition
        };
        newAssignments[targetFlight.flight.id].push(newAssignment);
        
        moved = true;
        movedThisIteration = true;
      }
      
      if (moved) {
        break; // Move one pilot per iteration, then re-detect singletons
      }
    }
    
    if (!movedThisIteration) {
      break;
    }
    
    consolidationCount++;
  }
  
}

/**
 * New configurable auto-assign pilots function
 * @param flights Available flights to assign pilots to
 * @param availablePilots Pool of pilots that can be assigned
 * @param assignedPilots Current assignment state
 * @param allPilotQualifications Qualification data for all pilots
 * @param config Auto-assignment configuration
 * @returns Object with new assignments and suggested mission commander
 */
export const autoAssignPilots = async (
  flights: Flight[],
  availablePilots: Pilot[],
  assignedPilots: Record<string, AssignedPilot[]>,
  allPilotQualifications: Record<string, any[]>,
  config: AutoAssignConfig,
  pilotSquadronMap?: Record<string, any>
): Promise<{
  newAssignments: Record<string, AssignedPilot[]>,
  suggestedMissionCommander: MissionCommanderInfo | null
}> => {
  
  console.log('[AUTO-ASSIGN-DEBUG] Starting auto-assign with:', {
    flightsCount: flights?.length || 0,
    pilotsCount: availablePilots?.length || 0,
    pilotsWithRollCall: availablePilots?.filter(p => p.rollCallStatus).map(p => ({ callsign: p.callsign, rollCall: p.rollCallStatus, discord: p.attendanceStatus })),
    config
  });
  
  if (!flights || flights.length === 0 || !availablePilots || availablePilots.length === 0) {
    return {
      newAssignments: { ...assignedPilots },
      suggestedMissionCommander: null
    };
  }

  // Step 0: Clear existing assignments if configured
  let newAssignments: Record<string, AssignedPilot[]> = {};
  if (config.assignmentScope === 'clear') {
    for (const flight of flights) {
      newAssignments[flight.id] = [];
    }
  } else {
    // Fill gaps mode - preserve existing assignments
    newAssignments = { ...assignedPilots };
    for (const flight of flights) {
      if (!newAssignments[flight.id]) {
        newAssignments[flight.id] = [];
      }
    }
  }

  // Get squadron callsign mappings - try to use from cache first or fallback to API
  let squadronCallsigns: SquadronCallsignMapping[] = [];
  
  if (pilotSquadronMap && Object.keys(pilotSquadronMap).length > 0) {
    // Use cached squadron data if available
    const uniqueSquadrons = new Map<string, any>();
    Object.values(pilotSquadronMap).forEach(squadron => {
      if (squadron && squadron.id) {
        uniqueSquadrons.set(squadron.id, squadron);
      }
    });
    
    squadronCallsigns = Array.from(uniqueSquadrons.values()).map(squadron => ({
      squadronId: squadron.id,
      designation: squadron.designation || 'Unknown Squadron',
      callsigns: Array.isArray(squadron.callsigns) ? squadron.callsigns.filter((c: any) => typeof c === 'string') : []
    }));
    
  } else {
    // Fallback to API call
    const { data: squadronMappings, error } = await getSquadronCallsignMappings();
    if (error) {
      console.error('❌ Failed to fetch squadron callsigns:', error);
      return {
        newAssignments,
        suggestedMissionCommander: null
      };
    }
    squadronCallsigns = squadronMappings || [];
  }

  // Create available pilot pool (exclude already assigned pilots)
  const assignedPilotIds = new Set<string>();
  for (const flightAssignments of Object.values(newAssignments)) {
    for (const assignedPilot of flightAssignments) {
      assignedPilotIds.add(assignedPilot.id);
      assignedPilotIds.add(assignedPilot.boardNumber);
    }
  }

  let availablePilotPool = availablePilots.filter(pilot => 
    !assignedPilotIds.has(pilot.id) && !assignedPilotIds.has(pilot.boardNumber)
  );


  // Determine flight processing order based on non-standard callsigns setting
  const flightOrder = determineFlightOrder(flights, squadronCallsigns, config.nonStandardCallsigns);

  // Execute assignment strategy
  if (config.flightFillingPriority === 'depth') {
    await executeDepthFirstAssignment(flightOrder, availablePilotPool, newAssignments, allPilotQualifications, squadronCallsigns, config, pilotSquadronMap);
  } else {
    await executeBreadthFirstAssignment(flightOrder, availablePilotPool, newAssignments, allPilotQualifications, squadronCallsigns, config, pilotSquadronMap);
  }

  // Pass 2: Singleton Consolidation - Prevent singleton flights by redistributing lone pilots
  await consolidateSingletonFlights(flightOrder, newAssignments, squadronCallsigns, config, pilotSquadronMap);

  // Find mission commander candidate
  const suggestedMissionCommander = findMissionCommander(flights, newAssignments, allPilotQualifications);


  return {
    newAssignments,
    suggestedMissionCommander
  };
};

/**
 * Determine flight processing order based on non-standard callsigns setting
 */
function determineFlightOrder(
  flights: Flight[],
  squadronCallsigns: SquadronCallsignMapping[],
  nonStandardSetting: string
): Flight[] {
  const standardFlights = flights.filter(flight => isStandardCallsign(flight.callsign, squadronCallsigns));
  const nonStandardFlights = flights.filter(flight => !isStandardCallsign(flight.callsign, squadronCallsigns));


  switch (nonStandardSetting) {
    case 'ignore':
      return standardFlights;
    case 'fillLast':
      return [...standardFlights, ...nonStandardFlights];
    case 'fillFirst':
      return [...nonStandardFlights, ...standardFlights];
    case 'fillInSequence':
    default:
      return flights; // Original order
  }
}

/**
 * Execute depth-first assignment strategy
 */
async function executeDepthFirstAssignment(
  flightOrder: Flight[],
  availablePilotPool: Pilot[],
  newAssignments: Record<string, AssignedPilot[]>,
  allPilotQualifications: Record<string, any[]>,
  squadronCallsigns: SquadronCallsignMapping[],
  config: AutoAssignConfig,
  pilotSquadronMap?: Record<string, any>
): Promise<void> {

  for (const flight of flightOrder) {

    // Fill all positions for this flight before moving to next
    const positionOrder = ['-1', '-2', '-3', '-4'];
    
    for (const position of positionOrder) {
      // Skip if position already filled (Fill Gaps mode)
      const isAlreadyAssigned = newAssignments[flight.id]?.some(p => p.dashNumber === position.substring(1));
      if (isAlreadyAssigned && config.assignmentScope === 'fillGaps') {
        continue;
      }

      const bestPilot = await findBestPilotForPosition(
        flight, 
        position, 
        availablePilotPool, 
        allPilotQualifications, 
        squadronCallsigns, 
        config,
        pilotSquadronMap
      );

      if (bestPilot) {
        assignPilot(bestPilot, flight, position.substring(1), newAssignments);
        // Remove pilot from available pool
        availablePilotPool = availablePilotPool.filter(p => p.id !== bestPilot.id && p.boardNumber !== bestPilot.boardNumber);
      }
    }
  }
}

/**
 * Execute breadth-first assignment strategy
 */
async function executeBreadthFirstAssignment(
  flightOrder: Flight[],
  availablePilotPool: Pilot[],
  newAssignments: Record<string, AssignedPilot[]>,
  allPilotQualifications: Record<string, any[]>,
  squadronCallsigns: SquadronCallsignMapping[],
  config: AutoAssignConfig,
  pilotSquadronMap?: Record<string, any>
): Promise<void> {

  const positionOrder = ['-1', '-2', '-3', '-4'];
  
  for (const position of positionOrder) {
    
    for (const flight of flightOrder) {
      // Skip if position already filled (Fill Gaps mode)
      const isAlreadyAssigned = newAssignments[flight.id]?.some(p => p.dashNumber === position.substring(1));
      if (isAlreadyAssigned && config.assignmentScope === 'fillGaps') {
        continue;
      }

      const bestPilot = await findBestPilotForPosition(
        flight, 
        position, 
        availablePilotPool, 
        allPilotQualifications, 
        squadronCallsigns, 
        config,
        pilotSquadronMap
      );

      if (bestPilot) {
        assignPilot(bestPilot, flight, position.substring(1), newAssignments);
        // Remove pilot from available pool
        availablePilotPool = availablePilotPool.filter(p => p.id !== bestPilot.id && p.boardNumber !== bestPilot.boardNumber);
      }
    }
  }
}

/**
 * Find the best pilot for a specific position using gate-based filtering
 */
async function findBestPilotForPosition(
  flight: Flight,
  position: string,
  availablePilots: Pilot[],
  allPilotQualifications: Record<string, any[]>,
  squadronCallsigns: SquadronCallsignMapping[],
  config: AutoAssignConfig,
  pilotSquadronMap?: Record<string, any>
): Promise<Pilot | null> {
  const flightSquadron = getSquadronForCallsign(flight.callsign, squadronCallsigns);
  const gates = buildGatesForPosition(position, flightSquadron, config);


  for (let gateIndex = 0; gateIndex < gates.length; gateIndex++) {
    const gate = gates[gateIndex];
    const candidates = filterPilotsByGate(availablePilots, gate, allPilotQualifications, pilotSquadronMap);


    if (candidates.length > 0) {
      // Tiebreaker: select by billet seniority (lowest order number)
      const bestPilot = selectByBilletSeniority(candidates);
      return bestPilot;
    }
  }

  return null;
}

/**
 * Build gates for a specific position type
 */
function buildGatesForPosition(
  position: string,
  flightSquadron: SquadronCallsignMapping | null,
  config: AutoAssignConfig
): AssignmentGate[] {
  const gates: AssignmentGate[] = [];
  const attendanceOptions = config.includeTentative ? ['accepted', 'tentative'] : ['accepted'];

  if (position === '-1') {
    // Gate 1: Overqualified + Same Squadron + Accepted
    gates.push({
      attendance: attendanceOptions,
      squadron: flightSquadron,
      qualifications: ['Mission Commander']
    });

    // Gate 2: Remove squadron requirement if prioritizing qualifications
    if (config.squadronCohesion === 'prioritizeQualifications') {
      gates.push({
        attendance: attendanceOptions,
        squadron: null,
        qualifications: ['Mission Commander']
      });
    }

    // Gate 3: Reinstate squadron, qualified requirement
    gates.push({
      attendance: attendanceOptions,
      squadron: flightSquadron,
      qualifications: ['Flight Lead']
    });

    // Gate 4: Remove squadron if prioritizing qualifications
    if (config.squadronCohesion === 'prioritizeQualifications') {
      gates.push({
        attendance: attendanceOptions,
        squadron: null,
        qualifications: ['Flight Lead']
      });
    }

    // Gate 5: Allow unqualified if configured
    if (config.assignUnqualified) {
      gates.push({
        attendance: attendanceOptions,
        squadron: flightSquadron,
        qualifications: null
      });

      // Gate 6: Remove squadron for unqualified if prioritizing qualifications
      if (config.squadronCohesion === 'prioritizeQualifications') {
        gates.push({
          attendance: attendanceOptions,
          squadron: null,
          qualifications: null
        });
      }
    }
  } else if (position === '-3') {
    // Section Lead position gates
    gates.push({
      attendance: attendanceOptions,
      squadron: flightSquadron,
      qualifications: ['Section Lead']
    });

    if (config.squadronCohesion === 'prioritizeQualifications') {
      gates.push({
        attendance: attendanceOptions,
        squadron: null,
        qualifications: ['Section Lead']
      });
    }

    if (config.assignUnqualified) {
      gates.push({
        attendance: attendanceOptions,
        squadron: flightSquadron,
        qualifications: null
      });

      if (config.squadronCohesion === 'prioritizeQualifications') {
        gates.push({
          attendance: attendanceOptions,
          squadron: null,
          qualifications: null
        });
      }
    }
  } else if (position === '-2' || position === '-4') {
    // Wingman positions - prefer non-overqualified pilots
    gates.push({
      attendance: attendanceOptions,
      squadron: flightSquadron,
      qualifications: 'NOT_OVERQUALIFIED'
    });

    if (config.squadronCohesion === 'prioritizeQualifications') {
      gates.push({
        attendance: attendanceOptions,
        squadron: null,
        qualifications: 'NOT_OVERQUALIFIED'
      });
    }

    // Fallback to any pilot
    gates.push({
      attendance: attendanceOptions,
      squadron: flightSquadron,
      qualifications: null
    });

    if (config.squadronCohesion === 'prioritizeQualifications') {
      gates.push({
        attendance: attendanceOptions,
        squadron: null,
        qualifications: null
      });
    }
  }

  return gates;
}

/**
 * Filter pilots by gate criteria
 */
function filterPilotsByGate(
  pilots: Pilot[],
  gate: AssignmentGate,
  allPilotQualifications: Record<string, any[]>,
  pilotSquadronMap?: Record<string, any>
): Pilot[] {
  return pilots.filter(pilot => {
    // Check attendance - prioritize Roll Call over Discord
    const rollCall = pilot.rollCallStatus;
    const discord = pilot.attendanceStatus;
    
    let attendanceMatch = false;
    
    // If roll call status exists, use that (it takes precedence over Discord)
    if (rollCall) {
      if (gate.attendance.includes('accepted') && rollCall === 'Present') {
        attendanceMatch = true;
        console.log(`[ATTENDANCE-DEBUG] ${pilot.callsign}: Roll call Present matched accepted gate`);
      }
      if (gate.attendance.includes('tentative') && rollCall === 'Tentative') {
        attendanceMatch = true;
        console.log(`[ATTENDANCE-DEBUG] ${pilot.callsign}: Roll call Tentative matched tentative gate`);
      }
      // Roll call 'Absent' means pilot is not available, regardless of Discord status
      if (rollCall === 'Absent') {
        attendanceMatch = false;
        console.log(`[ATTENDANCE-DEBUG] ${pilot.callsign}: Roll call Absent - not available`);
      }
    } else {
      // Fall back to Discord attendance only if no roll call status
      if (gate.attendance.includes('accepted') && discord === 'accepted') {
        attendanceMatch = true;
        console.log(`[ATTENDANCE-DEBUG] ${pilot.callsign}: Discord accepted matched accepted gate`);
      }
      if (gate.attendance.includes('tentative') && discord === 'tentative') {
        attendanceMatch = true;
        console.log(`[ATTENDANCE-DEBUG] ${pilot.callsign}: Discord tentative matched tentative gate`);
      }
    }
    
    if (!attendanceMatch) {
      console.log(`[ATTENDANCE-DEBUG] ${pilot.callsign}: NO MATCH - rollCall: ${rollCall}, discord: ${discord}, gateAttendance: ${gate.attendance.join(',')}`);
    }
    
    if (!attendanceMatch) return false;

    // Check squadron requirement
    if (gate.squadron && pilotSquadronMap) {
      const pilotSquadron = pilotSquadronMap[pilot.id] || pilotSquadronMap[pilot.boardNumber];
      if (!pilotSquadron || pilotSquadron.id !== gate.squadron.squadronId) {
        return false; // Pilot not from required squadron
      }
    }

    // Check qualifications
    if (gate.qualifications === 'NOT_OVERQUALIFIED') {
      return !hasOverQualifications(pilot, allPilotQualifications);
    } else if (gate.qualifications && Array.isArray(gate.qualifications)) {
      return hasRequiredQualifications(pilot, gate.qualifications, allPilotQualifications);
    }

    return true;
  });
}

/**
 * Check if pilot has required qualifications
 */
function hasRequiredQualifications(pilot: Pilot, requiredQuals: string[], allPilotQualifications: Record<string, any[]>): boolean {
  const pilotQuals = allPilotQualifications[pilot.id] || allPilotQualifications[pilot.boardNumber] || [];
  
  return requiredQuals.some(reqQual => {
    return pilotQuals.some(qual => {
      const qualName = qual.qualification?.name?.toLowerCase() || '';
      const reqQualLower = reqQual.toLowerCase();
      
      if (reqQualLower === 'mission commander') {
        return qualName.includes('mission commander');
      } else if (reqQualLower === 'flight lead') {
        return qualName.includes('flight lead') || qualName.includes('mission commander') || qualName.includes('strike lead');
      } else if (reqQualLower === 'section lead') {
        return qualName.includes('section lead') || qualName.includes('flight lead') || qualName.includes('mission commander');
      }
      
      return qualName.includes(reqQualLower);
    });
  });
}

/**
 * Check if pilot has over-qualifications (FL/SL/MC for wingman positions)
 */
function hasOverQualifications(pilot: Pilot, allPilotQualifications: Record<string, any[]>): boolean {
  const pilotQuals = allPilotQualifications[pilot.id] || allPilotQualifications[pilot.boardNumber] || [];
  
  return pilotQuals.some(qual => {
    const qualName = qual.qualification?.name?.toLowerCase() || '';
    return qualName.includes('flight lead') || 
           qualName.includes('section lead') || 
           qualName.includes('mission commander') ||
           qualName.includes('strike lead');
  });
}

/**
 * Select pilot by billet seniority (lowest order number)
 */
function selectByBilletSeniority(candidates: Pilot[]): Pilot {
  return candidates.reduce((best, current) => {
    const bestOrder = getBilletOrder(best);
    const currentOrder = getBilletOrder(current);
    return currentOrder < bestOrder ? current : best;
  });
}

/**
 * Get billet order for seniority comparison
 */
function getBilletOrder(pilot: Pilot): number {
  if (pilot.roles && pilot.roles.length > 0) {
    const activeRole = pilot.roles.find(ra => !ra.end_date);
    if (activeRole && activeRole.role && typeof activeRole.role.order === 'number') {
      return activeRole.role.order;
    }
  }
  return 9999; // Default to very low seniority
}

/**
 * Assign pilot to flight position
 */
function assignPilot(pilot: Pilot, flight: Flight, dashNumber: string, newAssignments: Record<string, AssignedPilot[]>): void {
  if (!newAssignments[flight.id]) {
    newAssignments[flight.id] = [];
  }
  
  const assignedPilot: AssignedPilot = { ...pilot, dashNumber };
  newAssignments[flight.id].push(assignedPilot);
  
}

/**
 * Find mission commander candidate
 */
function findMissionCommander(
  flights: Flight[],
  newAssignments: Record<string, AssignedPilot[]>,
  _allPilotQualifications: Record<string, any[]>
): MissionCommanderInfo | null {
  let bestMissionCommander: { pilot: AssignedPilot; flight: Flight; billetOrder: number } | null = null;

  for (const flight of flights) {
    const flightLead = newAssignments[flight.id]?.find(p => p.dashNumber === '1');
    if (flightLead) {
      const billetOrder = getBilletOrder(flightLead);
      
      if (!bestMissionCommander || billetOrder < bestMissionCommander.billetOrder) {
        bestMissionCommander = { pilot: flightLead, flight, billetOrder };
      }
    }
  }

  if (bestMissionCommander) {
    return {
      boardNumber: bestMissionCommander.pilot.boardNumber,
      callsign: bestMissionCommander.pilot.callsign,
      flightId: bestMissionCommander.flight.id,
      flightCallsign: bestMissionCommander.flight.callsign,
      flightNumber: bestMissionCommander.flight.flightNumber
    };
  }

  return null;
}