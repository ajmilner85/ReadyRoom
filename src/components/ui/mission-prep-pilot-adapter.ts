/**
 * Adapter utilities for MissionPreparation.tsx to help transition
 * from legacy Pilot format to using Supabase data directly
 */

import { Pilot, SupabasePilot } from '../../types/PilotTypes';
import { adaptSupabasePilots } from '../../utils/pilotDataUtils';

/**
 * Fetches pilots with proper error handling and type safety
 * @param getAllPilotsFunction - The function to fetch pilots from Supabase
 * @returns The processed pilot data in legacy format
 */
export async function fetchPilotsWithAdapter(getAllPilotsFunction: any) {
  const { data, error } = await getAllPilotsFunction();
        
  if (error) {
    throw new Error(error.message);
  }
  
  if (data && data.length > 0) {
    // Use our adapter function to convert Supabase data to legacy format
    return adaptSupabasePilots(data as any[]);
  }
  
  return [];
}

/**
 * Filter function to get only active pilots
 * @param pilots - List of pilots to filter
 * @returns Active pilots (not inactive or retired)
 */
export function getActivePilots(pilots: Pilot[] | null | undefined): Pilot[] {
  if (!pilots || pilots.length === 0) return [];
  
  return pilots.filter((pilot: Pilot) => 
    pilot.status !== 'Inactive' && pilot.status !== 'Retired'
  );
}

/**
 * Extended AssignedPilot interface that combines legacy and Supabase approaches
 * This is used during the transition period
 */
export interface AdaptedAssignedPilot extends Pilot {
  dashNumber: string;
  // Add any additional Supabase-specific properties that might be needed
}

/**
 * Format a flight ID for display in the UI
 */
export function formatFlightId(flightId: string): {callsign: string, number: string} {
  const parts = flightId.split('-');
  return {
    callsign: parts[0] || '',
    number: parts[1] || ''
  };
}
