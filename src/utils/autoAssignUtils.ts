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
      
      // Priority 1: Same squadron flight with gaps (if squadron cohesion enforced or prioritized)
      if (config.squadronCohesion === 'enforced' || config.squadronCohesion === 'prioritized') {
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
      
      // Priority 2: Any flight with gaps (for prioritized or ignore modes)
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
  pilotSquadronMap?: Record<string, any>,
  cycleId?: string
): Promise<{
  newAssignments: Record<string, AssignedPilot[]>,
  suggestedMissionCommander: MissionCommanderInfo | null
}> => {
  
  console.log('[AUTO-ASSIGN-DEBUG] Starting auto-assign with:', {
    flightsCount: flights?.length || 0,
    pilotsCount: availablePilots?.length || 0,
    pilotsWithRollCall: availablePilots?.filter(p => p.rollCallStatus).map(p => ({ callsign: p.callsign, rollCall: p.rollCallStatus, discord: p.attendanceStatus })),
    tentativePilots: availablePilots?.filter(p => p.rollCallStatus === 'Tentative' || p.attendanceStatus === 'tentative').map(p => ({ callsign: p.callsign, rollCall: p.rollCallStatus, discord: p.attendanceStatus })),
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
      callsigns: Array.isArray(squadron.callsigns) ? squadron.callsigns.filter((c: any) => typeof c === 'string') : [],
      squadronType: (squadron.squadron_type as 'operational' | 'training') || 'operational'
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

  console.log('[AUTO-ASSIGN-DEBUG] Available pilot pool after filtering assigned:', {
    totalCount: availablePilotPool.length,
    pilotsWithStatus: availablePilotPool.filter(p => p.rollCallStatus || p.attendanceStatus).map(p => ({
      callsign: p.callsign,
      rollCall: p.rollCallStatus,
      discord: p.attendanceStatus
    }))
  });


  // Determine flight processing order based on non-standard callsigns setting
  const flightOrder = determineFlightOrder(flights, squadronCallsigns, config.nonStandardCallsigns);

  console.log('[SQUADRON-DEBUG] Squadron mappings:', JSON.stringify(squadronCallsigns.map(s => ({
    squadron: s.designation,
    id: s.squadronId,
    callsigns: s.callsigns
  })), null, 2));
  console.log('[SQUADRON-DEBUG] Flight squadron assignments:', JSON.stringify(flightOrder.map(f => ({
    flight: f.callsign,
    squadron: getSquadronForCallsign(f.callsign, squadronCallsigns)?.designation || 'none'
  })), null, 2));

  // Execute assignment strategy
  if (config.trainingMode) {
    console.log('[STRATEGY-DEBUG] Using training mode IP-to-trainee assignment');
    await executeTrainingAssignment(flightOrder, availablePilotPool, newAssignments, allPilotQualifications, squadronCallsigns, config, pilotSquadronMap, cycleId);
  } else {
    console.log(`[STRATEGY-DEBUG] Using ${config.flightFillingPriority} strategy`);
    if (config.flightFillingPriority === 'depth') {
      console.log('[STRATEGY-DEBUG] Executing depth-first assignment');
      await executeDepthFirstAssignment(flightOrder, availablePilotPool, newAssignments, allPilotQualifications, squadronCallsigns, config, pilotSquadronMap);
    } else {
      console.log('[STRATEGY-DEBUG] Executing breadth-first assignment');
      await executeBreadthFirstAssignment(flightOrder, availablePilotPool, newAssignments, allPilotQualifications, squadronCallsigns, config, pilotSquadronMap);
    }
  }

  // Pass 2: Singleton Consolidation - Only run for depth-first (breadth-first and training intentionally create balanced flights)
  if (config.flightFillingPriority === 'depth' && !config.trainingMode) {
    console.log('[CONSOLIDATION-DEBUG] Running singleton consolidation for depth-first strategy');
    await consolidateSingletonFlights(flightOrder, newAssignments, squadronCallsigns, config, pilotSquadronMap);
  } else {
    console.log('[CONSOLIDATION-DEBUG] Skipping singleton consolidation (breadth-first or training mode)');
  }

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
 * Execute training assignment strategy
 * Pairs IPs (Instructor Pilots) with trainees at specified ratio
 */
async function executeTrainingAssignment(
  flightOrder: Flight[],
  availablePilotPool: Pilot[],
  newAssignments: Record<string, AssignedPilot[]>,
  allPilotQualifications: Record<string, any[]>,
  squadronCallsigns: SquadronCallsignMapping[],
  config: AutoAssignConfig,
  pilotSquadronMap?: Record<string, any>,
  cycleId?: string
): Promise<void> {
  console.log('[TRAINING-ASSIGN-DEBUG] Starting training assignment');
  console.log('[TRAINING-ASSIGN-DEBUG] Squadron mappings:', squadronCallsigns.map(s => ({
    designation: s.designation,
    callsigns: s.callsigns,
    squadronType: s.squadronType
  })));

  // Separate flights into training squadron flights and operational squadron flights
  const trainingSquadronFlights: Flight[] = [];
  const operationalSquadronFlights: Flight[] = [];
  
  for (const flight of flightOrder) {
    const flightSquadron = getSquadronForCallsign(flight.callsign, squadronCallsigns);
    console.log(`[TRAINING-ASSIGN-DEBUG] Flight ${flight.callsign}: squadron=${flightSquadron?.designation || 'none'}, squadronType=${flightSquadron?.squadronType || 'none'}`);
    
    if (flightSquadron?.squadronType === 'training') {
      trainingSquadronFlights.push(flight);
      console.log(`[TRAINING-ASSIGN-DEBUG] → Classified as TRAINING squadron flight`);
    } else {
      operationalSquadronFlights.push(flight);
      console.log(`[TRAINING-ASSIGN-DEBUG] → Classified as OPERATIONAL squadron flight`);
    }
  }

  console.log(`[TRAINING-ASSIGN-DEBUG] Flight split: ${trainingSquadronFlights.length} training squadron flights, ${operationalSquadronFlights.length} operational squadron flights`);

  // If no training squadrons are configured, fall back to using all flights for training
  const flightsForTraining = trainingSquadronFlights.length > 0 ? trainingSquadronFlights : flightOrder;
  const flightsForNonTrainees = trainingSquadronFlights.length > 0 ? operationalSquadronFlights : flightOrder;

  console.log(`[TRAINING-ASSIGN-DEBUG] Using ${flightsForTraining.length} flights for IP/trainee assignment, ${flightsForNonTrainees.length} flights available for non-trainees`);

  // Fetch training enrollment if cycleId is provided
  let enrolledTraineeIds = new Set<string>();
  if (cycleId && config.trainingMode) {
    try {
      const { getCycleEnrollments } = await import('./trainingEnrollmentService');
      const enrollments = await getCycleEnrollments(cycleId);
      enrollments.forEach(enrollment => {
        if (enrollment.status === 'active') {
          enrolledTraineeIds.add(enrollment.pilot_id);
        }
      });
      console.log(`[TRAINING-ASSIGN-DEBUG] Found ${enrolledTraineeIds.size} enrolled trainees in cycle`);
    } catch (error) {
      console.error('[TRAINING-ASSIGN-DEBUG] Failed to fetch cycle enrollments:', error);
    }
  }

  // Helper to check if pilot is an IP
  const isIP = (pilot: Pilot): boolean => {
    const quals = allPilotQualifications[pilot.id] || allPilotQualifications[pilot.boardNumber] || [];
    return quals.some(qual => {
      const qualName = qual.qualification?.name?.toLowerCase() || '';
      return qualName.includes('instructor pilot');
    });
  };

  // Separate IPs, trainees, and non-trainees
  const ips = availablePilotPool.filter(isIP);
  const nonIPs = availablePilotPool.filter(pilot => !isIP(pilot));

  // Trainees are determined by enrollment in the training cycle (if available)
  // Otherwise fall back to qualification-based detection
  let trainees: Pilot[];
  let nonTrainees: Pilot[];

  if (enrolledTraineeIds.size > 0) {
    // Use enrollment data to determine trainees
    trainees = nonIPs.filter(pilot =>
      enrolledTraineeIds.has(pilot.id) || enrolledTraineeIds.has(pilot.boardNumber)
    );
    nonTrainees = nonIPs.filter(pilot =>
      !enrolledTraineeIds.has(pilot.id) && !enrolledTraineeIds.has(pilot.boardNumber)
    );
    console.log('[TRAINING-ASSIGN-DEBUG] Using enrollment-based trainee detection');
  } else {
    // Fallback: Non-trainees are pilots who have qualifications beyond basic (FL, SL, MC, LSO, etc.)
    trainees = nonIPs.filter(pilot => {
      const quals = allPilotQualifications[pilot.id] || allPilotQualifications[pilot.boardNumber] || [];
      // If they have any leadership qualification, they're not a trainee
      const hasLeadershipQual = quals.some(qual => {
        const qualName = qual.qualification?.name?.toLowerCase() || '';
        return qualName.includes('flight lead') ||
               qualName.includes('section lead') ||
               qualName.includes('mission commander') ||
               qualName.includes('strike lead') ||
               qualName.includes('lso');
      });
      return !hasLeadershipQual;
    });
    nonTrainees = nonIPs.filter(pilot => !trainees.includes(pilot));
    console.log('[TRAINING-ASSIGN-DEBUG] Using qualification-based trainee detection (fallback)');
  }

  console.log(`[TRAINING-ASSIGN-DEBUG] Found ${ips.length} IPs, ${trainees.length} trainees, and ${nonTrainees.length} non-trainees`);

  // In 'exclude' mode, remove non-trainees from the pilot pool entirely
  const nonTraineeMode = config.nonTraineeHandling || 'exclude';
  if (nonTraineeMode === 'exclude' && nonTrainees.length > 0) {
    console.log(`[TRAINING-ASSIGN-DEBUG] Exclude mode: Removing ${nonTrainees.length} non-trainees from pilot pool`);
    // Remove non-trainees by filtering them out of the available pool
    // We'll only work with IPs and trainees
  }

  // Check attendance filter (Present only, or Present + Tentative)
  const attendanceFilter = config.includeTentative ? ['Present', 'Tentative', 'accepted', 'tentative'] : ['Present', 'accepted'];

  const filterByAttendance = (pilots: Pilot[]) => pilots.filter(pilot => {
    const rollCall = pilot.rollCallStatus;
    const discord = pilot.attendanceStatus;

    // Prioritize roll call over Discord
    if (rollCall) {
      return attendanceFilter.includes(rollCall);
    }
    return discord && attendanceFilter.includes(discord);
  });

  const availableIPs = filterByAttendance(ips);
  const availableTrainees = filterByAttendance(trainees);
  const availableNonTrainees = filterByAttendance(nonTrainees);

  console.log(`[TRAINING-ASSIGN-DEBUG] After attendance filter: ${availableIPs.length} IPs, ${availableTrainees.length} trainees, ${availableNonTrainees.length} non-trainees`);

  // Parse the ratio (e.g., "1:2" → 1 IP, 2 trainees per flight or "2:2" → 2 IPs, 2 trainees per flight)
  const ratio = config.ipToTraineeRatio || '1:2';
  const [ipsPerFlight, traineesPerFlight] = ratio.split(':').map(n => parseInt(n));

  console.log(`[TRAINING-ASSIGN-DEBUG] Using ratio ${ratio} (${ipsPerFlight} IPs + ${traineesPerFlight} trainees per flight)`);

  // Sort IPs by billet seniority (highest seniority first)
  const sortedIPs = availableIPs.sort((a, b) => {
    const orderA = getBilletOrder(a);
    const orderB = getBilletOrder(b);
    return orderA - orderB; // Lower order = higher seniority
  });

  // Sort trainees by board number (lower board number = more senior)
  const sortedTrainees = [...availableTrainees].sort((a, b) => {
    const boardA = parseInt(a.boardNumber) || 9999;
    const boardB = parseInt(b.boardNumber) || 9999;
    return boardA - boardB;
  });

  let traineeIndex = 0;
  let ipIndex = 0;
  let flightIndex = 0;
  const unassignedIPs: Pilot[] = []; // Track IPs that didn't get trainees

  // Define position assignments based on ratio
  // For multi-IP flights: -1 and -3 are IPs, -2 and -4 are flexible (IP or trainee)
  const getPositionAssignments = (ipsNeeded: number, traineesNeeded: number): { ipPositions: string[], traineePositions: string[] } => {
    if (ipsNeeded === 1) {
      // Single IP: always at -1, trainees at -2, -3, -4
      return { ipPositions: ['1'], traineePositions: ['2', '3', '4'].slice(0, traineesNeeded) };
    } else if (ipsNeeded === 2) {
      // Two IPs: -1 and -3, trainees at -2 and -4
      return { ipPositions: ['1', '3'], traineePositions: traineesNeeded === 1 ? ['2'] : ['2', '4'] };
    } else if (ipsNeeded === 3) {
      // Three IPs: -1, -3, and -2 (or -4), trainee at -4 (or -2)
      return { ipPositions: ['1', '3', '2'], traineePositions: ['4'] };
    }
    return { ipPositions: [], traineePositions: [] };
  };

  const { ipPositions, traineePositions } = getPositionAssignments(ipsPerFlight, traineesPerFlight);

  // Assign flights with the configured IP:Trainee ratio (use training squadron flights preferentially)
  while (flightIndex < flightsForTraining.length) {
    // Check if we have enough IPs and trainees for this flight
    if (ipIndex + ipsPerFlight > sortedIPs.length) {
      console.log('[TRAINING-ASSIGN-DEBUG] Not enough IPs remaining for another flight');
      // Add remaining IPs to unassigned pool
      for (let i = ipIndex; i < sortedIPs.length; i++) {
        unassignedIPs.push(sortedIPs[i]);
      }
      break;
    }

    if (traineeIndex >= sortedTrainees.length) {
      console.log('[TRAINING-ASSIGN-DEBUG] No more trainees available');
      // Add remaining IPs to unassigned pool
      for (let i = ipIndex; i < sortedIPs.length; i++) {
        unassignedIPs.push(sortedIPs[i]);
      }
      break;
    }

    const flight = flightsForTraining[flightIndex];
    const flightSquadron = getSquadronForCallsign(flight.callsign, squadronCallsigns);
    const startTraineeIndex = traineeIndex;
    const flightIPs: Pilot[] = [];
    const flightTrainees: Pilot[] = [];
    let allIPsCanAssign = true;

    // Collect IPs for this flight
    for (let i = 0; i < ipsPerFlight; i++) {
      const ip = sortedIPs[ipIndex + i];

      // Check squadron cohesion for IP
      if (config.squadronCohesion === 'enforced' && flightSquadron && pilotSquadronMap) {
        const ipSquadron = pilotSquadronMap[ip.id] || pilotSquadronMap[ip.boardNumber];
        if (!ipSquadron || ipSquadron.id !== flightSquadron.squadronId) {
          console.log(`[TRAINING-ASSIGN-DEBUG] IP ${ip.callsign} squadron mismatch for flight ${flight.callsign}`);
          allIPsCanAssign = false;
          break;
        }
      }

      flightIPs.push(ip);
    }

    // If not all IPs can be assigned, skip this flight
    if (!allIPsCanAssign) {
      flightIndex++;
      continue;
    }

    // Try to assign trainees
    let assignedTraineesCount = 0;
    let attemptsWithoutSuccess = 0;
    const maxAttempts = sortedTrainees.length;

    while (assignedTraineesCount < traineesPerFlight &&
           traineeIndex < sortedTrainees.length &&
           attemptsWithoutSuccess < maxAttempts) {
      const trainee = sortedTrainees[traineeIndex];

      // Check squadron cohesion for trainee
      let canAssignTrainee = true;
      if (config.squadronCohesion === 'enforced' && flightSquadron && pilotSquadronMap) {
        const traineeSquadron = pilotSquadronMap[trainee.id] || pilotSquadronMap[trainee.boardNumber];
        canAssignTrainee = traineeSquadron && traineeSquadron.id === flightSquadron.squadronId;
      }

      traineeIndex++;

      if (canAssignTrainee) {
        flightTrainees.push(trainee);
        assignedTraineesCount++;
        attemptsWithoutSuccess = 0;
      } else {
        console.log(`[TRAINING-ASSIGN-DEBUG] Skipping trainee ${trainee.callsign} - squadron mismatch`);
        attemptsWithoutSuccess++;
      }
    }

    // If we got at least one trainee, assign the flight
    if (assignedTraineesCount > 0) {
      // Assign IPs
      flightIPs.forEach((ip, idx) => {
        assignPilot(ip, flight, ipPositions[idx], newAssignments);
        console.log(`[TRAINING-ASSIGN-DEBUG] Assigned IP ${ip.callsign} to ${flight.callsign}-${ipPositions[idx]}`);
      });

      // Assign trainees
      flightTrainees.forEach((trainee, idx) => {
        assignPilot(trainee, flight, traineePositions[idx], newAssignments);
        console.log(`[TRAINING-ASSIGN-DEBUG] Assigned trainee ${trainee.callsign} to ${flight.callsign}-${traineePositions[idx]}`);
      });

      console.log(`[TRAINING-ASSIGN-DEBUG] Flight ${flight.callsign} complete: ${flightIPs.length} IPs + ${assignedTraineesCount} trainees`);
      ipIndex += ipsPerFlight;
      flightIndex++;
    } else {
      // No trainees assigned - add these IPs to unassigned pool and stop
      console.log(`[TRAINING-ASSIGN-DEBUG] No trainees could be assigned - stopping IP assignment`);
      for (let i = ipIndex; i < sortedIPs.length; i++) {
        unassignedIPs.push(sortedIPs[i]);
      }
      traineeIndex = startTraineeIndex;
      break;
    }
  }

  console.log(`[TRAINING-ASSIGN-DEBUG] IP/Trainee pairing complete. ${unassignedIPs.length} IPs remain unassigned`);

  // Handle non-trainees based on configuration
  console.log(`[TRAINING-ASSIGN-DEBUG] Non-trainee mode: ${nonTraineeMode}`);
  console.log(`[TRAINING-ASSIGN-DEBUG] Unassigned IPs: ${unassignedIPs.length} [${unassignedIPs.map(p => p.callsign).join(', ')}]`);
  console.log(`[TRAINING-ASSIGN-DEBUG] Available non-trainees: ${availableNonTrainees.length} [${availableNonTrainees.map(p => p.callsign).join(', ')}]`);
  console.log(`[TRAINING-ASSIGN-DEBUG] Training flights available: ${flightsForTraining.length} [${flightsForTraining.map(f => f.callsign).join(', ')}]`);
  console.log(`[TRAINING-ASSIGN-DEBUG] Operational flights available: ${flightsForNonTrainees.length} [${flightsForNonTrainees.map(f => f.callsign).join(', ')}]`);
  console.log(`[TRAINING-ASSIGN-DEBUG] Flight index after IP/trainee assignment: ${flightIndex}`);

  if (nonTraineeMode === 'exclude') {
    // Do nothing - IPs and trainees only
    console.log('[TRAINING-ASSIGN-DEBUG] Excluding non-trainees and unassigned IPs from assignment');
  } else if (nonTraineeMode === 'segregate') {
    // Strictly segregate: Training squadron flights ONLY get IP+trainee pairs
    // ALL other pilots (unassigned IPs + non-trainees) go to operational squadron flights
    console.log('[TRAINING-ASSIGN-DEBUG] Segregating: training flights complete with IP+trainee pairs, ALL remaining pilots go to operational flights');

    // Combine unassigned IPs and non-trainees for assignment to operational flights
    const pilotsForOperationalFlights = [...unassignedIPs, ...availableNonTrainees];
    
    // Assign ALL remaining pilots (unassigned IPs + non-trainees) to operational squadron flights ONLY
    if (flightsForNonTrainees.length > 0 && pilotsForOperationalFlights.length > 0) {
      console.log(`[TRAINING-ASSIGN-DEBUG] Assigning ${pilotsForOperationalFlights.length} pilots (${unassignedIPs.length} unassigned IPs + ${availableNonTrainees.length} non-trainees) to ${flightsForNonTrainees.length} operational squadron flights`);
      console.log(`[TRAINING-ASSIGN-DEBUG] Pilots being assigned: [${pilotsForOperationalFlights.map(p => p.callsign).join(', ')}]`);
      console.log(`[TRAINING-ASSIGN-DEBUG] Operational flights: [${flightsForNonTrainees.map(f => f.callsign).join(', ')}]`);
      await executeBreadthFirstAssignment(
        flightsForNonTrainees,
        pilotsForOperationalFlights,
        newAssignments,
        allPilotQualifications,
        squadronCallsigns,
        { ...config, trainingMode: false },
        pilotSquadronMap
      );
    } else if (flightsForNonTrainees.length === 0 && pilotsForOperationalFlights.length > 0) {
      console.log(`[TRAINING-ASSIGN-DEBUG] No operational squadron flights available - ${pilotsForOperationalFlights.length} pilots will remain unassigned`);
    }
  } else if (nonTraineeMode === 'integrate') {
    // Fill open slots in existing flights with non-trainees
    console.log('[TRAINING-ASSIGN-DEBUG] Integrating non-trainees into existing flights');

    let nonTraineeIndex = 0;
    const sortedNonTrainees = [...availableNonTrainees].sort((a, b) => {
      const orderA = getBilletOrder(a);
      const orderB = getBilletOrder(b);
      return orderA - orderB;
    });

    // Go through each flight that has IP/trainee assignments and fill gaps
    for (let i = 0; i < flightIndex && i < flightsForTraining.length; i++) {
      const flight = flightsForTraining[i];
      const currentAssignments = newAssignments[flight.id] || [];
      const occupiedPositions = currentAssignments.map(p => p.dashNumber);

      // Find open positions (1-4)
      const allPositions = ['1', '2', '3', '4'];
      const openPositions = allPositions.filter(pos => !occupiedPositions.includes(pos));

      // Fill open positions with non-trainees
      for (const position of openPositions) {
        if (nonTraineeIndex >= sortedNonTrainees.length) break;

        const nonTrainee = sortedNonTrainees[nonTraineeIndex];
        const flightSquadron = getSquadronForCallsign(flight.callsign, squadronCallsigns);

        // Check squadron cohesion
        let canAssign = true;
        if (config.squadronCohesion === 'enforced' && flightSquadron && pilotSquadronMap) {
          const pilotSquadron = pilotSquadronMap[nonTrainee.id] || pilotSquadronMap[nonTrainee.boardNumber];
          canAssign = pilotSquadron && pilotSquadron.id === flightSquadron.squadronId;
        }

        if (canAssign) {
          assignPilot(nonTrainee, flight, position, newAssignments);
          console.log(`[TRAINING-ASSIGN-DEBUG] Integrated non-trainee ${nonTrainee.callsign} to ${flight.callsign}-${position}`);
        }

        nonTraineeIndex++;
      }
    }
  }

  console.log('[TRAINING-ASSIGN-DEBUG] Training assignment complete');
}

/**
 * Execute breadth-first assignment strategy
 * Breadth-first creates balanced flights: 2-ship before 3-ship, 3-ship before 4-ship
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

  console.log('[BREADTH-DEBUG] Starting breadth-first assignment - targeting balanced flights');

  // Target flight sizes in order: 2-ship, then 3-ship, then 4-ship
  const targetSizes = [2, 3, 4];

  for (const targetSize of targetSizes) {
    console.log(`[BREADTH-DEBUG] Filling flights to ${targetSize}-ship strength`);

    let pilotsAssignedThisRound = 0;

    // For each flight, fill it to target size before moving to next flight
    for (const flight of flightOrder) {
      // Fill this flight to target size
      while ((newAssignments[flight.id]?.length || 0) < targetSize && availablePilotPool.length > 0) {
        const nextPosition = (newAssignments[flight.id]?.length || 0) + 1;

        // Skip if position already filled (Fill Gaps mode)
        const isAlreadyAssigned = newAssignments[flight.id]?.some(p => p.dashNumber === nextPosition.toString());
        if (isAlreadyAssigned && config.assignmentScope === 'fillGaps') {
          break;
        }

        console.log(`[BREADTH-DEBUG] Attempting to fill ${flight.callsign}-${flight.flightNumber || 'X'} position -${nextPosition} (current size: ${newAssignments[flight.id]?.length || 0}, target: ${targetSize})`);

        const bestPilot = await findBestPilotForPosition(
          flight,
          `-${nextPosition}`,
          availablePilotPool,
          allPilotQualifications,
          squadronCallsigns,
          config,
          pilotSquadronMap
        );

        if (bestPilot) {
          assignPilot(bestPilot, flight, nextPosition.toString(), newAssignments);
          console.log(`[BREADTH-DEBUG] Assigned ${bestPilot.callsign} to ${flight.callsign}-${flight.flightNumber || 'X'} position -${nextPosition}`);

          // Remove pilot from available pool
          availablePilotPool = availablePilotPool.filter(p => p.id !== bestPilot.id && p.boardNumber !== bestPilot.boardNumber);
          pilotsAssignedThisRound++;
        } else {
          // Can't fill this position, move to next flight
          break;
        }
      }

      // If we have no more pilots, break out of flight loop
      if (availablePilotPool.length === 0) {
        break;
      }
    }

    console.log(`[BREADTH-DEBUG] Completed ${targetSize}-ship round. Assigned ${pilotsAssignedThisRound} pilots this round. Remaining pilots: ${availablePilotPool.length}`);

    // If no pilots left, we're done
    if (availablePilotPool.length === 0) {
      break;
    }
  }

  console.log('[BREADTH-DEBUG] Breadth-first assignment complete');
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

    console.log(`[GATE-DEBUG] ${flight.callsign}${position} Gate ${gateIndex + 1}: ${candidates.length} candidates found (attendance: [${gate.attendance.join(', ')}], squadron: ${gate.squadron?.designation || 'any'}, quals: ${Array.isArray(gate.qualifications) ? gate.qualifications.join(',') : gate.qualifications || 'any'})`);

    if (candidates.length > 0) {
      // Tiebreaker: select by billet seniority (lowest order number)
      const bestPilot = selectByBilletSeniority(candidates);
      console.log(`[GATE-DEBUG] ${flight.callsign}${position} Selected: ${bestPilot.callsign}`);
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
  
  // For training squadrons, always treat as if squadron cohesion is not enforced
  const isTrainingSquadron = flightSquadron?.squadronType === 'training';
  const effectiveCohesion = isTrainingSquadron ? 'prioritized' : config.squadronCohesion;

  if (position === '-1') {
    // Gate 1: Mission Commander + Same Squadron (for all modes)
    gates.push({
      attendance: attendanceOptions,
      squadron: flightSquadron,
      qualifications: ['Mission Commander']
    });

    // Gate 2: Mission Commander + Any Squadron (for prioritized/ignore modes)
    if (effectiveCohesion !== 'enforced') {
      gates.push({
        attendance: attendanceOptions,
        squadron: null,
        qualifications: ['Mission Commander']
      });
    }

    // Gate 3: Flight Lead + Same Squadron (for all modes)
    gates.push({
      attendance: attendanceOptions,
      squadron: flightSquadron,
      qualifications: ['Flight Lead']
    });

    // Gate 4: Flight Lead + Any Squadron (for prioritized/ignore modes)
    if (effectiveCohesion !== 'enforced') {
      gates.push({
        attendance: attendanceOptions,
        squadron: null,
        qualifications: ['Flight Lead']
      });
    }

    // Gate 5: Unqualified + Same Squadron (if allowing unqualified)
    if (config.assignUnqualified) {
      gates.push({
        attendance: attendanceOptions,
        squadron: flightSquadron,
        qualifications: null
      });

      // Gate 6: Unqualified + Any Squadron (for prioritized/ignore modes)
      if (effectiveCohesion !== 'enforced') {
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

    if (effectiveCohesion !== 'enforced') {
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

      if (effectiveCohesion !== 'enforced') {
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

    if (effectiveCohesion !== 'enforced') {
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

    if (effectiveCohesion !== 'enforced') {
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
    
    // Only log attendance mismatches for pilots that have some status (avoid spam from pilots with no data)
    if (!attendanceMatch && (rollCall || discord)) {
      console.log(`[ATTENDANCE-DEBUG] ${pilot.callsign}: NO MATCH - rollCall: ${rollCall}, discord: ${discord}, gateAttendance: [${gate.attendance.join(', ')}], includeTentative: ${gate.attendance.includes('tentative')}`);
    }
    
    if (!attendanceMatch) return false;

    // Check squadron requirement
    if (gate.squadron && pilotSquadronMap) {
      const pilotSquadron = pilotSquadronMap[pilot.id] || pilotSquadronMap[pilot.boardNumber];
      if (!pilotSquadron || pilotSquadron.id !== gate.squadron.squadronId) {
        console.log(`[SQUADRON-DEBUG] ${pilot.callsign}: FAILED squadron check - pilot squadron: ${pilotSquadron?.designation || 'none'}, required: ${gate.squadron.designation}`);
        return false; // Pilot not from required squadron
      }
    }

    // Check qualifications
    if (gate.qualifications === 'NOT_OVERQUALIFIED') {
      const isOverqualified = hasOverQualifications(pilot, allPilotQualifications);
      if (isOverqualified) {
        console.log(`[QUALS-DEBUG] ${pilot.callsign}: FAILED overqualification check - is overqualified for wingman position`);
      }
      return !isOverqualified;
    } else if (gate.qualifications && Array.isArray(gate.qualifications)) {
      const hasQuals = hasRequiredQualifications(pilot, gate.qualifications, allPilotQualifications);
      if (!hasQuals) {
        console.log(`[QUALS-DEBUG] ${pilot.callsign}: FAILED qualification check - missing required: ${gate.qualifications.join(', ')}`);
      }
      return hasQuals;
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