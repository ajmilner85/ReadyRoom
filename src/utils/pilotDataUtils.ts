/**
 * Utility functions for working with pilot data directly from Supabase
 * without needing to convert to legacy formats
 */
import { SupabasePilot, PilotStatus, Pilot, QualificationType } from '../types/PilotTypes';
import { supabase } from './supabaseClient';
import { getPilotQualifications } from './qualificationService';

/**
 * Safely prepare Supabase pilot data and convert to the expected Pilot format
 * without using the deprecated convertSupabasePilotToLegacy function
 * 
 * @param pilots - Array of raw pilot data from Supabase
 * @returns Array of Pilot objects that can be used in existing components
 */
export function adaptSupabasePilots(pilots: any[]): Pilot[] {
  if (!pilots || pilots.length === 0) return [];
  
  return pilots.map(pilot => {
    try {
      // First ensure we have a properly typed SupabasePilot with no null values
      const safePilot = {
        ...pilot,
        // Convert nulls to undefined for type safety
        discord_original_id: pilot.discord_original_id || undefined,
        discordId: pilot.discordId || undefined,
        qualifications: pilot.qualifications || [],
        roles: pilot.roles || {},
        updated_at: pilot.updated_at || undefined,
        status_id: pilot.status_id || undefined,
        // Ensure these properties exist to match SupabasePilot interface
        boardNumber: typeof pilot.boardNumber === 'number' ? pilot.boardNumber : 
                    (typeof pilot.boardNumber === 'string' ? parseInt(pilot.boardNumber) : 0),
        callsign: pilot.callsign || 'Unknown',
        id: pilot.id || `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      } as SupabasePilot;
      
      // Convert to Pilot format directly (without using deprecated function)
      return {
        id: safePilot.id,
        discordId: safePilot.discord_original_id,
        discord_original_id: safePilot.discord_original_id,
        callsign: safePilot.callsign,
        boardNumber: safePilot.boardNumber.toString(),
        status: determinePilotStatus(safePilot),
        status_id: safePilot.status_id,
        billet: getPilotRoleName(safePilot),
        qualifications: (safePilot.qualifications || []).map((q, index) => ({
          id: `${safePilot.id}-${index}`,
          type: q as QualificationType,
          dateAchieved: new Date().toISOString().split('T')[0]
        })),
        discordUsername: safePilot.discordId || ''
      } as Pilot;
    } catch (err) {
      console.error('Error adapting pilot:', err, pilot);
      // Return a minimal valid Pilot object to prevent crashes
      return {
        id: pilot?.id || `error-${Date.now()}`,
        callsign: pilot?.callsign || 'Error',
        boardNumber: typeof pilot?.boardNumber === 'number' ? pilot.boardNumber.toString() : '0',
        status: 'Inactive',
        billet: '',
        qualifications: [],
        discordUsername: ''
      } as Pilot;
    }
  });
}

/**
 * Determines the pilot's status based on their role in the squadron
 */
export function determinePilotStatus(pilot: SupabasePilot): PilotStatus {
  // If the pilot already has a status via the status_id, that's the source of truth
  if (pilot.status_id) {
    // Here we would ideally look up the status_id in a status map
    // For now we'll just return "Provisional" as a fallback
    return "Provisional";
  }

  // Use squadron role as a fallback for determining status
  const squadronRole = typeof pilot.roles === 'object' && 
                      pilot.roles !== null && 
                      'squadron' in pilot.roles && 
                      typeof pilot.roles.squadron === 'string' ? 
                      pilot.roles.squadron.toLowerCase() : '';

  if (squadronRole.includes('co') || squadronRole.includes('xo')) {
    return "Command";
  } else if (squadronRole.includes('oic') || squadronRole.includes('staff')) {
    return "Staff";
  } else if (squadronRole.includes('ret')) {
    return "Retired";
  } else if (squadronRole.includes('inactive')) {
    return "Inactive";
  } else if (squadronRole.includes('awol')) {
    return "AWOL";
  } else if (squadronRole.includes('leave')) {
    return "On Leave";
  } else if (squadronRole.includes('cadre')) {
    return "Cadre";
  } else {
    return "Provisional"; // Default status
  }
}

/**
 * Checks if a pilot is active (not inactive or retired)
 */
export function isPilotActive(pilot: SupabasePilot): boolean {
  // First try to determine from status_id or role
  const status = determinePilotStatus(pilot);
  return status !== 'Inactive' && status !== 'Retired';
}

/**
 * Formats a pilot's boardNumber as a string
 * This helps with consistency when using boardNumber in display or lookups
 */
export function formatBoardNumber(pilot: SupabasePilot): string {
  return pilot.boardNumber.toString();
}

/**
 * Gets the appropriate display name for a pilot
 * Usually callsign, but falls back to other identifiers if needed
 */
export function getPilotDisplayName(pilot: SupabasePilot): string {
  return pilot.callsign || `Pilot ${formatBoardNumber(pilot)}`;
}

/**
 * Gets the primary role name for a pilot from role data
 */
export function getPilotRoleName(pilot: SupabasePilot): string {
  // If we have a role_name property (from join query), use it
  if (pilot.role_name) {
    return pilot.role_name;
  }
  
  // If we have a role property (runtime set), use it
  if (pilot.role) {
    return pilot.role;
  }
  
  // Check legacy roles object
  if (pilot.roles?.squadron) {
    return pilot.roles.squadron;
  }
  
  return '';
}

/**
 * Creates a unique key for a pilot that can be used in React lists
 */
export function getPilotKey(pilot: SupabasePilot): string {
  return `${pilot.id}-${formatBoardNumber(pilot)}`;
}

/**
 * Fetches pilots directly from Supabase with their role assignments
 * @returns Promise with array of SupabasePilot objects and any error
 */
export async function fetchSupabasePilots() {
  try {
    const { data, error } = await supabase
      .from('pilots')
      .select(`
        *,
        pilot_roles!pilot_roles_pilot_id_fkey (
          id,
          role_id,
          effective_date,
          is_acting,
          end_date,
          roles:role_id (
            id,
            name,
            isExclusive,
            compatible_statuses,
            order
          )
        ),
        status:status_id(*)
      `)
      .order('boardNumber', { ascending: true });
    
    if (error) {
      console.error('Error fetching pilots:', error);
      return { pilots: [], error };
    }

    // Transform the data to remove role field maintenance
    const transformedPilots = (data || []).map((pilot: any) => {
      // Find active (non-ended) role assignments
      const activeRoles = pilot.pilot_roles?.filter((pr: any) => 
        !pr.end_date || new Date(pr.end_date) > new Date()
      ) || [];
      
      // Sort by effective_date to get the most recent role (single role only)
      activeRoles.sort((a: any, b: any) => 
        new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime()
      );
      
      // No role field - UI should get role from pilot_roles only
      return {
        ...pilot
        // Removed role_name and role fields
      };
    });
    
    return { 
      pilots: transformedPilots as SupabasePilot[],
      error: null 
    };
  } catch (err: any) {
    console.error('Exception fetching pilots:', err);
    return { 
      pilots: [], 
      error: err 
    };
  }
}

/**
 * Filter function to get only active pilots from a list of SupabasePilot objects
 * @param pilots Array of SupabasePilot objects
 * @returns Array of active SupabasePilot objects
 */
export function filterActivePilots(pilots: SupabasePilot[]): SupabasePilot[] {
  return pilots.filter(isPilotActive);
}

/**
 * Get full pilot data with qualifications included
 * @param pilotId The UUID of the pilot in Supabase
 * @returns Complete pilot data with qualifications
 */
export async function getPilotWithQualifications(pilotId: string) {
  if (!pilotId) {
    return { pilot: null, error: new Error('No pilot ID provided') };
  }
  
  try {
    // Fetch base pilot data
    const { data: pilotData, error: pilotError } = await supabase
      .from('pilots')
      .select(`
        *,
        roles:role_id(*),
        status:status_id(*)
      `)
      .eq('id', pilotId)
      .single();
      
    if (pilotError || !pilotData) {
      return { pilot: null, error: pilotError || new Error('Pilot not found') };
    }
    
    // Fetch qualifications for this pilot
    const { data: qualData, error: qualError } = await getPilotQualifications(pilotId);
    
    if (qualError) {
      // Return pilot without qualifications if there was an error
      return { 
        pilot: pilotData as unknown as SupabasePilot,
        error: qualError
      };
    }
    
    // Map qualification data to the string array format expected in SupabasePilot
    const qualStrings = qualData ? qualData.map(q => q.name || q.type) : [];
    
    // Combine pilot data with qualifications
    const pilotWithQuals = {
      ...pilotData,
      qualifications: qualStrings
    } as SupabasePilot;
    
    return {
      pilot: pilotWithQuals,
      error: null
    };
  } catch (err: any) {
    return { pilot: null, error: err };
  }
}

/**
 * Maps from Supabase pilot data to the shape needed for AssignedPilot
 * This helps transition from legacy Pilot to SupabasePilot while
 * maintaining compatibility with components that expect AssignedPilot
 * 
 * @param pilot SupabasePilot to transform
 * @param dashNumber Optional dash number to assign
 * @returns Pilot object with AssignedPilot compatible structure
 */
export function createAssignedPilotFromSupabase(
  pilot: SupabasePilot, 
  dashNumber?: string
) {
  // Convert qualifications from strings to Qualification objects
  const qualifications = (pilot.qualifications || []).map((q, index) => ({
    id: `${pilot.id}-${index}`,
    type: q as QualificationType,
    dateAchieved: new Date().toISOString().split('T')[0]
  }));

  return {
    id: pilot.id,
    callsign: pilot.callsign,
    boardNumber: formatBoardNumber(pilot),
    status: determinePilotStatus(pilot),
    dashNumber: dashNumber || '',
    // Add other properties needed for AssignedPilot
    qualifications,
    billet: getPilotRoleName(pilot),
    discordUsername: pilot.discordId || ''
  };
}

/**
 * Sort pilots by priority based on their qualifications
 * Useful for auto-assignment features
 * 
 * @param pilots Array of SupabasePilot objects
 * @param qualificationPriorities Optional map of qualification names to priority values (lower = higher priority)
 * @returns Sorted array of pilots with highest priority first
 */
export function sortPilotsByQualificationPriority(
  pilots: SupabasePilot[],
  qualificationPriorities?: Record<string, number>
): SupabasePilot[] {
  // Default qualification priorities if not provided
  const priorities = qualificationPriorities || {
    "mission commander": 1,
    "strike lead": 2,
    "instructor": 3,
    "section lead": 4,
    "flight lead": 5,
    "lso": 6,
    "cq": 7,
    "night cq": 8,
    "wingman": 9
  };

  // Helper function to calculate a pilot's priority score
  const getPilotPriority = (pilot: SupabasePilot): number => {
    const pilotQuals = pilot.qualifications || [];
    
    // Default priority if no qualifications match our priority list
    let highestPriority = 10; // Default lower than wingman
    
    // Check all qualifications for this pilot
    for (const qual of pilotQuals) {
      // Skip if not a string
      if (typeof qual !== 'string') continue;
      
      const qualName = qual.toLowerCase();
      
      // Check if qualification matches any priority pattern
      for (const [pattern, priority] of Object.entries(priorities)) {
        if (qualName.includes(pattern) && priority < highestPriority) {
          highestPriority = priority;
        }
      }
    }
    
    return highestPriority;
  };
  
  // Return a new sorted array
  return [...pilots].sort((a, b) => getPilotPriority(a) - getPilotPriority(b));
}

/**
 * Group pilots by qualification type for easier organization
 * 
 * @param pilots Array of SupabasePilot objects
 * @returns Object with pilots grouped by qualification category
 */
export function groupPilotsByQualification(
  pilots: SupabasePilot[]
): Record<string, SupabasePilot[]> {
  const groups: Record<string, SupabasePilot[]> = {
    flightLeads: [],
    instructors: [],
    missionCommanders: [],
    sectionLeads: [],
    wingmen: [],
    other: []
  };
  
  pilots.forEach(pilot => {
    const quals = pilot.qualifications || [];
    let categorized = false;
    
    // Check for qualifications (case insensitive)
    const hasQual = (pattern: string) => {
      return quals.some(q => {
        if (typeof q !== 'string') return false;
        return q.toLowerCase().includes(pattern.toLowerCase());
      });
    };
    
    if (hasQual('mission commander')) {
      groups.missionCommanders.push(pilot);
      categorized = true;
    }
    
    if (hasQual('instructor')) {
      groups.instructors.push(pilot);
      categorized = true;
    }
    
    if (hasQual('flight lead')) {
      groups.flightLeads.push(pilot);
      categorized = true;
    }
    
    if (hasQual('section lead')) {
      groups.sectionLeads.push(pilot);
      categorized = true;
    }
    
    if (hasQual('wingman')) {
      groups.wingmen.push(pilot);
      categorized = true;
    }
    
    // If pilot doesn't fit into any category
    if (!categorized) {
      groups.other.push(pilot);
    }
  });
  
  return groups;
}

/**
 * Check if a pilot has a specific qualification
 * 
 * @param pilot The SupabasePilot to check
 * @param qualificationName The name or partial name of the qualification to check for
 * @returns Boolean indicating if the pilot has the qualification
 */
export function pilotHasQualification(
  pilot: SupabasePilot,
  qualificationName: string
): boolean {
  if (!pilot.qualifications || pilot.qualifications.length === 0) {
    return false;
  }
  
  return pilot.qualifications.some(qual => {
    if (typeof qual !== 'string') return false;
    return qual.toLowerCase().includes(qualificationName.toLowerCase());
  });
}

/**
 * Get the highest qualification level for a pilot
 * 
 * @param pilot The SupabasePilot to check
 * @returns The highest qualification name found
 */
export function getHighestQualification(pilot: SupabasePilot): string {
  if (!pilot.qualifications || pilot.qualifications.length === 0) {
    return 'None';
  }
  
  // Priority order (highest to lowest)
  const qualPriority = [
    'mission commander',
    'strike lead',
    'instructor',
    'section lead',
    'flight lead',
    'lso',
    'wingman'
  ];
  
  for (const priority of qualPriority) {
    if (pilotHasQualification(pilot, priority)) {
      // Find the full qualification name that matches
      const matchingQual = pilot.qualifications.find(q => {
        if (typeof q !== 'string') return false;
        return q.toLowerCase().includes(priority);
      });
      
      return typeof matchingQual === 'string' ? matchingQual : priority;
    }
  }
  
  // If no priority qualification is found, return the first qualification name
  const firstQual = pilot.qualifications[0];
  return typeof firstQual === 'string' ? firstQual : 'None';
}

/**
 * Creates a lookup map of pilot data indexed by boardNumber
 * This makes it much easier to find pilots by their board number
 * 
 * @param pilots Array of SupabasePilot objects
 * @returns Record object with board numbers as keys and pilots as values
 */
export function createPilotBoardNumberMap(
  pilots: SupabasePilot[]
): Record<string, SupabasePilot> {
  const pilotMap: Record<string, SupabasePilot> = {};
  
  pilots.forEach(pilot => {
    pilotMap[formatBoardNumber(pilot)] = pilot;
  });
  
  return pilotMap;
}

/**
 * Convert a flight assignment structure from using legacy Pilot to using SupabasePilot
 * Useful for migrating components from the old to new structure
 * 
 * @param legacyAssignments Record with flight IDs as keys and arrays of AssignedPilot as values
 * @param pilotMap Map of board numbers to SupabasePilot objects
 * @returns A new object with the same structure but using SupabasePilot objects
 */
export function convertFlightAssignmentsToSupabase(
  legacyAssignments: Record<string, any[]>,
  pilotMap: Record<string, SupabasePilot>
): Record<string, any[]> {
  const result: Record<string, any[]> = {};
  
  // Process each flight in the assignments
  Object.keys(legacyAssignments).forEach(flightId => {
    const pilots = legacyAssignments[flightId];
    
    // Convert each assigned pilot to use SupabasePilot
    result[flightId] = pilots.map(assignedPilot => {
      const boardNumber = typeof assignedPilot.boardNumber === 'string' ? 
        assignedPilot.boardNumber : assignedPilot.boardNumber.toString();
      
      // Find the pilot in our map
      const supabasePilot = pilotMap[boardNumber];
      
      if (!supabasePilot) {
        // If pilot not found, return the original assignment
        console.warn(`Pilot with board number ${boardNumber} not found in pilot map`);
        return assignedPilot;
      }
      
      // Create a new assignment with the Supabase pilot data and dash number
      return {
        ...createAssignedPilotFromSupabase(supabasePilot, assignedPilot.dashNumber),
        dashNumber: assignedPilot.dashNumber
      };
    });
  });
  
  return result;
}
