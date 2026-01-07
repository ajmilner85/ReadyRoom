import { supabase } from './supabaseClient';
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
    
    // Single query to get all pilot assignments with squadron data
    const pilotIds = pilots.map(p => p.id).filter(Boolean);
    
    const { data: assignmentData, error: assignmentError } = await supabase
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
      .is('end_date', null);

    if (assignmentError) {
      console.error('❌ Error fetching pilot assignments:', assignmentError);
      return { pilotSquadronMap: {}, squadrons: [], error: assignmentError };
    }

    // Single query to get all squadrons
    // Note: airframe join may fail if migration hasn't been run yet
    let squadronQuery = supabase
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
      `);
    
    // Try to add airframe data if the column exists
    try {
      squadronQuery = supabase
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
        `);
    } catch (e) {
      // Airframe column doesn't exist yet, use basic query
      console.log('Airframe data not available yet');
    }
    
    const { data: squadronData, error: squadronError } = await squadronQuery;

    if (squadronError) {
      console.error('❌ Error fetching squadrons:', squadronError);
      return { pilotSquadronMap: {}, squadrons: [], error: squadronError };
    }

    // Build pilot squadron mapping
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

    return { pilotSquadronMap, squadrons };
    
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