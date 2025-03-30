import { supabase } from './supabaseClient';
import { v4 as uuidv4 } from 'uuid';
import { Pilot, convertLegacyPilotToSupabase } from '../types/PilotTypes';

/**
 * Imports pilots from the provided data array into Supabase
 */
export async function importPilotsToSupabase(pilotsData?: Pilot[]) {
  if (!pilotsData || pilotsData.length === 0) {
    return { 
      success: false, 
      error: 'No pilot data provided for import'
    };
  }

  try {
    // Convert legacy pilots to Supabase format
    const supabasePilots = pilotsData.map(pilot => {
      const supabasePilot = convertLegacyPilotToSupabase(pilot);
      
      // Generate a UUID for each pilot (since we need an ID)
      return {
        ...supabasePilot,
        id: uuidv4(), // Generate UUID v4 for the ID
        discord_original_id: pilot.id // Store original Discord ID for reference
      };
    });
    
    // Insert all pilots with explicit UUIDs
    const { data, error } = await supabase
      .from('pilots')
      .insert(supabasePilots)
      .select();
    
    if (error) {
      throw error;
    }
    
    return { success: true, count: data.length };
  } catch (error) {
    return { success: false, error };
  }
}