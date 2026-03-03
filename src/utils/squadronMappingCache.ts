import { sb } from './supabaseClient';
import type { Squadron } from '../types/OrganizationTypes';
import type { Pilot } from '../types/PilotTypes';

interface CachedSquadronMapping {
  pilotSquadronMap: Record<string, Squadron>;
  squadrons: Squadron[];
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

// Cache with 5-minute TTL
const CACHE_TTL = 5 * 60 * 1000;
let squadronMappingCache: CachedSquadronMapping | null = null;

/**
 * Optimized squadron mapping that fetches all data in a single query
 */
export async function getOptimizedSquadronMapping(pilots: Pilot[]): Promise<{
  pilotSquadronMap: Record<string, Squadron>;
  squadrons: Squadron[];
  error?: any;
}> {
  // Check cache first
  if (squadronMappingCache && (Date.now() - squadronMappingCache.timestamp) < squadronMappingCache.ttl) {
    return {
      pilotSquadronMap: squadronMappingCache.pilotSquadronMap,
      squadrons: squadronMappingCache.squadrons
    };
  }

  try {

    // Query pilot assignments with squadron data (uses sb() for JWT freshness and retry)
    const pilotIds = pilots.map(p => p.id).filter(Boolean);

    let assignmentData: any[] | null = null;
    let assignmentError: any = null;

    try {
      const result = await sb(async (supabase) => supabase
        .from('pilot_assignments')
        .select(`
          pilot_id,
          org_squadrons (
            id,
            name,
            designation,
            wing_id,
            tail_code,
            established_date,
            deactivated_date,
            insignia_url,
            carrier_id,
            callsigns,
            discord_integration,
            updated_at,
            squadron_type
          )
        `)
        .in('pilot_id', pilotIds)
        .is('end_date', null));

      assignmentData = result.data;
      assignmentError = result.error;
    } catch (err) {
      assignmentError = err;
    }

    if (assignmentError) {
      console.error('❌ Error fetching pilot assignments (continuing to fetch squadrons):', assignmentError);
      // Don't return early — still fetch org_squadrons below
    }

    // Query all squadrons (uses sb() for JWT freshness and retry)
    // Note: airframe join may fail if migration hasn't been run yet
    let squadronData: any[] | null = null;
    let squadronError: any = null;

    try {
      // Try with airframe data first
      const result = await sb(async (supabase) => supabase
        .from('org_squadrons')
        .select(`
          id,
          name,
          designation,
          wing_id,
          tail_code,
          established_date,
          deactivated_date,
          insignia_url,
          carrier_id,
          callsigns,
          airframe_id,
          discord_integration,
          updated_at,
          squadron_type,
          airframe:ref_aircraft_types(id, designation, name)
        `));

      squadronData = result.data;
      squadronError = result.error;
    } catch (e) {
      // Airframe column doesn't exist yet, try basic query
      try {
        const result = await sb(async (supabase) => supabase
          .from('org_squadrons')
          .select(`
            id,
            name,
            designation,
            wing_id,
            tail_code,
            established_date,
            deactivated_date,
            insignia_url,
            carrier_id,
            callsigns,
            discord_integration,
            updated_at,
            squadron_type
          `));

        squadronData = result.data;
        squadronError = result.error;
      } catch (e2) {
        squadronError = e2;
      }
    }

    if (squadronError) {
      console.error('❌ Error fetching squadrons:', squadronError);
      return { pilotSquadronMap: {}, squadrons: [], error: squadronError };
    }

    // Build pilot squadron mapping (only if assignments loaded successfully)
    const pilotSquadronMap: Record<string, Squadron> = {};

    if (assignmentData) {
      for (const assignment of assignmentData) {
        if (assignment.org_squadrons) {
          const squadron = assignment.org_squadrons as Squadron;

          // Map by pilot ID
          pilotSquadronMap[assignment.pilot_id] = squadron;

          // Also map by board number if we can find the pilot
          const pilot = pilots.find(p => p.id === assignment.pilot_id);
          if (pilot?.boardNumber) {
            pilotSquadronMap[pilot.boardNumber] = squadron;
          }
        }
      }
    }

    const squadrons = (squadronData || []) as unknown as Squadron[];

    // Cache the result
    squadronMappingCache = {
      pilotSquadronMap,
      squadrons,
      timestamp: Date.now(),
      ttl: CACHE_TTL
    };

    return { pilotSquadronMap, squadrons, ...(assignmentError ? { error: assignmentError } : {}) };

  } catch (err) {
    console.error('❌ Error in optimized squadron mapping:', err);
    return { pilotSquadronMap: {}, squadrons: [], error: err };
  }
}

/**
 * Clear the squadron mapping cache (call when data changes)
 */
export function clearSquadronMappingCache(): void {
  squadronMappingCache = null;
}

/**
 * Background prefetch of squadron mapping (non-blocking)
 */
export async function prefetchSquadronMapping(pilots: Pilot[]): Promise<void> {
  // Only prefetch if cache is empty or stale
  if (!squadronMappingCache || (Date.now() - squadronMappingCache.timestamp) > squadronMappingCache.ttl) {
    // Fire and forget - don't await
    getOptimizedSquadronMapping(pilots).catch(err =>
      console.error('Background squadron mapping prefetch failed:', err)
    );
  }
}
