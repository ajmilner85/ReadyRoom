import { supabase } from './supabaseClient';

export interface SquadronCallsignMapping {
  squadronId: string;
  designation: string;
  callsigns: string[];
}

/**
 * Fetch all squadron callsign mappings from the database
 * @returns Array of squadron callsign mappings
 */
export async function getSquadronCallsignMappings(): Promise<{ data: SquadronCallsignMapping[] | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('org_squadrons')
      .select('id, designation, callsigns');

    if (error) {
      console.error('Error fetching squadron callsigns:', error);
      return { data: null, error };
    }

    if (!data || data.length === 0) {
      console.log('No squadrons found');
      return { data: [], error: null };
    }

    // Transform the data to ensure callsigns is properly formatted
    const mappings: SquadronCallsignMapping[] = data.map(squadron => ({
      squadronId: squadron.id,
      designation: squadron.designation || 'Unknown Squadron',
      callsigns: Array.isArray(squadron.callsigns) ? squadron.callsigns.filter((c): c is string => typeof c === 'string') : []
    }));

    console.log(`✅ Fetched ${mappings.length} squadron callsign mappings:`, 
      mappings.map(m => `${m.designation}: [${m.callsigns.join(', ')}]`)
    );

    return { data: mappings, error: null };
  } catch (err: any) {
    console.error('Error in getSquadronCallsignMappings:', err);
    return { data: null, error: err };
  }
}

/**
 * Find which squadron a flight callsign belongs to
 * @param flightCallsign The callsign to match
 * @param squadronMappings Array of squadron callsign mappings
 * @returns Squadron mapping if found, null otherwise
 */
export function getSquadronForCallsign(
  flightCallsign: string, 
  squadronMappings: SquadronCallsignMapping[]
): SquadronCallsignMapping | null {
  if (!flightCallsign || !squadronMappings) {
    return null;
  }

  const normalizedFlightCallsign = flightCallsign.toUpperCase().trim();

  for (const squadron of squadronMappings) {
    if (squadron.callsigns && Array.isArray(squadron.callsigns)) {
      const hasMatch = squadron.callsigns.some((callsign: any) => {
        if (typeof callsign !== 'string') return false;
        return callsign.toUpperCase().trim() === normalizedFlightCallsign;
      });
      
      if (hasMatch) {
        return squadron;
      }
    }
  }

  return null;
}

/**
 * Check if a flight callsign matches any squadron callsigns
 * @param flightCallsign The callsign to check
 * @param squadronMappings Array of squadron callsign mappings
 * @returns True if the callsign matches any squadron
 */
export function isStandardCallsign(
  flightCallsign: string,
  squadronMappings: SquadronCallsignMapping[]
): boolean {
  return getSquadronForCallsign(flightCallsign, squadronMappings) !== null;
}

/**
 * Get all unique callsigns from all squadrons
 * @param squadronMappings Array of squadron callsign mappings
 * @returns Array of unique callsigns
 */
export function getAllCallsigns(squadronMappings: SquadronCallsignMapping[]): string[] {
  const allCallsigns = new Set<string>();
  
  for (const squadron of squadronMappings) {
    if (squadron.callsigns && Array.isArray(squadron.callsigns)) {
      squadron.callsigns.forEach((callsign: any) => {
        if (typeof callsign === 'string') {
          allCallsigns.add(callsign.toUpperCase().trim());
        }
      });
    }
  }
  
  return Array.from(allCallsigns).sort();
}