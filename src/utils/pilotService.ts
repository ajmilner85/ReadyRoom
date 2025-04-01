import { supabase } from './supabaseClient';
import type { Database } from '../types/supabase';

export type Pilot = Database['public']['Tables']['pilots']['Row'];
export type NewPilot = Database['public']['Tables']['pilots']['Insert'];
export type UpdatePilot = Database['public']['Tables']['pilots']['Update'];

/**
 * Fetch all pilots from the database
 */
export async function getAllPilots(): Promise<{ data: Pilot[] | null; error: any }> {
  const { data, error } = await supabase
    .from('pilots')
    .select('*')
    .order('boardNumber', { ascending: true });

  return { data, error };
}

/**
 * Fetch a single pilot by ID
 */
export async function getPilotById(id: string): Promise<{ data: Pilot | null; error: any }> {
  const { data, error } = await supabase
    .from('pilots')
    .select('*')
    .eq('id', id)
    .single();

  return { data, error };
}

/**
 * Fetch a single pilot by their original Discord ID
 */
export async function getPilotByDiscordOriginalId(discordId: string): Promise<{ data: Pilot | null; error: any }> {
  const { data, error } = await supabase
    .from('pilots')
    .select('*')
    .eq('discord_original_id', discordId)
    .single();

  return { data, error };
}

/**
 * Add a new pilot to the database
 * @param pilot The pilot data to add
 */
export async function createPilot(pilot: NewPilot): Promise<{ data: Pilot | null; error: any }> {
  // Check if board number already exists
  const { data: existingPilot } = await supabase
    .from('pilots')
    .select('id')
    .eq('boardNumber', pilot.boardNumber)
    .single();

  if (existingPilot) {
    return { 
      data: null, 
      error: { message: `Pilot with board number ${pilot.boardNumber} already exists` } 
    };
  }

  const { data, error } = await supabase
    .from('pilots')
    .insert(pilot)
    .select()
    .single();

  return { data, error };
}

/**
 * Update an existing pilot
 * @param id The ID of the pilot to update
 * @param updates The pilot data to update
 */
export async function updatePilot(id: string, updates: UpdatePilot): Promise<{ data: Pilot | null; error: any }> {
  // If board number is being updated, check if it's unique
  if (updates.boardNumber) {
    const { data: existingPilot } = await supabase
      .from('pilots')
      .select('id')
      .eq('boardNumber', updates.boardNumber)
      .neq('id', id)
      .single();

    if (existingPilot) {
      return { 
        data: null, 
        error: { message: `Board number ${updates.boardNumber} is already in use` } 
      };
    }
  }

  const { data, error } = await supabase
    .from('pilots')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  return { data, error };
}

/**
 * Delete a pilot by ID
 * @param id The ID of the pilot to delete
 */
export async function deletePilot(id: string): Promise<{ success: boolean; error: any }> {
  const { error } = await supabase
    .from('pilots')
    .delete()
    .eq('id', id);

  return { success: !error, error };
}

/**
 * Update a pilot's qualifications
 */
export async function updatePilotQualifications(
  id: string, 
  qualifications: string[]
): Promise<{ data: Pilot | null; error: any }> {
  const { data, error } = await supabase
    .from('pilots')
    .update({ qualifications })
    .eq('id', id)
    .select()
    .single();

  return { data, error };
}

/**
 * Update a pilot's roles
 */
export async function updatePilotRoles(
  id: string, 
  roles: any
): Promise<{ data: Pilot | null; error: any }> {
  const { data, error } = await supabase
    .from('pilots')
    .update({ roles })
    .eq('id', id)
    .select()
    .single();

  return { data, error };
}

/**
 * Update a pilot's status
 * @param id The ID of the pilot to update (either UUID or Discord ID)
 * @param statusId The ID of the status to assign
 */
export async function updatePilotStatus(
  id: string, 
  statusId: string
): Promise<{ data: Pilot | null; error: any }> {
  // First try to find the pilot by discord_original_id (for Discord IDs)
  const { data: pilotByDiscordId } = await supabase
    .from('pilots')
    .select('id')
    .eq('discord_original_id', id)
    .single();
  
  // If found by Discord ID, use the actual UUID from the database
  const actualId = pilotByDiscordId ? pilotByDiscordId.id : id;
  
  // Now update using the correct UUID
  const { data, error } = await supabase
    .from('pilots')
    .update({ status_id: statusId })
    .eq('id', actualId)
    .select()
    .single();

  return { data, error };
}

/**
 * Get pilots by status ID
 * @param statusId The status ID to filter by
 */
export async function getPilotsByStatus(
  statusId: string
): Promise<{ data: Pilot[] | null; error: any }> {
  const { data, error } = await supabase
    .from('pilots')
    .select('*')
    .eq('status_id', statusId)
    .order('boardNumber', { ascending: true });

  return { data, error };
}

/**
 * Get pilots by active status
 * @param isActive Whether to get pilots with active status or inactive status
 */
export async function getPilotsByActiveStatus(
  isActive: boolean
): Promise<{ data: Pilot[] | null; error: any }> {
  // First get all statuses with the specified active state
  const { data: statuses, error: statusError } = await supabase
    .from('statuses')
    .select('id')
    .eq('isActive', isActive);
    
  if (statusError || !statuses) {
    return { data: null, error: statusError || new Error('Failed to fetch statuses') };
  }
  
  // Then get all pilots with those status IDs
  const statusIds = statuses.map(status => status.id);
  const { data, error } = await supabase
    .from('pilots')
    .select('*')
    .in('status_id', statusIds)
    .order('boardNumber', { ascending: true });
    
  return { data, error };
}