/**
 * Utility functions for working with pilot data directly from Supabase
 * without needing to convert to legacy formats
 */
import { SupabasePilot, PilotStatus, Pilot, convertSupabasePilotToLegacy } from '../types/PilotTypes';

/**
 * Adapter function to safely prepare Supabase pilot data for use in components
 * that still expect legacy Pilot format. This is a transitional function
 * to help with migration to directly using SupabasePilot objects.
 * 
 * @param pilots - Array of raw pilot data from Supabase
 * @returns Array of legacy Pilot objects that can be used in existing components
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
        role_id: pilot.role_id || undefined,
        status_id: pilot.status_id || undefined,
        // Ensure these properties exist to match SupabasePilot interface
        boardNumber: typeof pilot.boardNumber === 'number' ? pilot.boardNumber : 
                    (typeof pilot.boardNumber === 'string' ? parseInt(pilot.boardNumber) : 0),
        callsign: pilot.callsign || 'Unknown',
        id: pilot.id || `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      } as SupabasePilot;
      
      // Then convert to legacy format
      return convertSupabasePilotToLegacy(safePilot);
    } catch (err) {
      console.error('Error adapting pilot:', err, pilot);
      // Return a minimal valid pilot object to prevent crashes
      return {
        id: pilot?.id || `error-${Date.now()}`,
        callsign: pilot?.callsign || 'Error',
        boardNumber: typeof pilot?.boardNumber === 'string' ? pilot.boardNumber : '0',
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
 * Gets the primary role name for a pilot
 */
export function getPilotRoleName(pilot: SupabasePilot): string {
  // Check all the possible places where role name might be stored
  return pilot.role_name || 
         pilot.role || 
         (pilot.roles?.squadron || '');
}

/**
 * Creates a unique key for a pilot that can be used in React lists
 */
export function getPilotKey(pilot: SupabasePilot): string {
  return `${pilot.id}-${formatBoardNumber(pilot)}`;
}
