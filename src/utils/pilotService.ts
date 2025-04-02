import { supabase } from './supabaseClient';
import type { Database } from '../types/supabase';

export type Pilot = Database['public']['Tables']['pilots']['Row'];
export type NewPilot = Database['public']['Tables']['pilots']['Insert'];
export type UpdatePilot = Database['public']['Tables']['pilots']['Update'];

/**
 * Fetch all pilots from the database
 */
export async function getAllPilots(): Promise<{ data: Pilot[] | null; error: any }> {
  // First, fetch pilots with their roles using join
  const { data, error } = await supabase
    .from('pilots')
    .select(`
      *,
      roles:role_id (
        id,
        name
      )
    `)
    .order('boardNumber', { ascending: true });

  // Transform the data to include role as a string property
  if (data) {
    // Log raw data for debugging
    console.log('Raw data from Supabase:', data.slice(0, 3));
    
    await Promise.all(data.map(async (pilot) => {
      // Check if pilot has role_id but the join didn't work
      if (pilot.role_id && (!pilot.roles || !pilot.roles.name)) {
        console.log(`Pilot ${pilot.callsign} has role_id (${pilot.role_id}) but no joined role data`);
        
        // Fetch the role directly
        try {
          const { data: roleData } = await supabase
            .from('roles')
            .select('name')
            .eq('id', pilot.role_id)
            .single();
            
          if (roleData && roleData.name) {
            console.log(`Fetched role name "${roleData.name}" for ${pilot.callsign}`);
            pilot.role = roleData.name;
          }
        } catch (e) {
          console.error(`Error fetching role for ${pilot.callsign}:`, e);
        }
      } 
      // Handle correctly joined role data
      else if (pilot.roles && pilot.roles.name) {
        pilot.role = pilot.roles.name;
        console.log(`Set role for ${pilot.callsign} to "${pilot.role}"`);
      }
    }));
  }

  console.log('getAllPilots processed data:', data && data.map(p => ({
    callsign: p.callsign,
    role: p.role || 'No role'
  })));
  
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
 * Update a pilot's roles (DEPRECATED)
 * @deprecated Use updatePilotRole instead. This function is for legacy purposes only.
 */
export async function updatePilotRoles(
  id: string, 
  roles: any
): Promise<{ data: Pilot | null; error: any }> {
  console.warn('updatePilotRoles is deprecated. Please use updatePilotRole instead.');
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
  
  // Extract status IDs
  const statusIds = statuses.map(status => status.id);
  
  // If no matching statuses found, return empty array
  if (statusIds.length === 0) {
    return { data: [], error: null };
  }
  
  // Get pilots with any of the matching status IDs
  const { data, error } = await supabase
    .from('pilots')
    .select('*')
    .in('status_id', statusIds)
    .order('boardNumber', { ascending: true });
    
  return { data, error };
}

/**
 * Get a pilot's role
 * @param pilotId The ID of the pilot
 * @returns The role object associated with this pilot or null if no role is assigned
 */
export async function getPilotRole(pilotId: string): Promise<{ 
  data: { 
    id: string; 
    name: string; 
    isExclusive: boolean;
    compatible_statuses: string[];
    order: number;
    created_at: string;
  } | null; 
  error: any 
}> {
  try {
    // Try to get the pilot's role_id first
    const { data: pilot, error: pilotError } = await supabase
      .from('pilots')
      .select('role_id')
      .eq('id', pilotId)
      .single();
    
    if (pilotError) {
      throw pilotError;
    }
    
    // If pilot has no role_id, return null data
    if (!pilot || !pilot.role_id) {
      return { data: null, error: null };
    }
    
    // Now fetch the role details
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, name, isExclusive, compatible_statuses, order, created_at')
      .eq('id', pilot.role_id)
      .single();
      
    if (roleError) {
      throw roleError;
    }
    
    return { data: role || null, error: null };
  } catch (error) {
    console.error('Error in getPilotRole:', error);
    return { data: null, error };
  }
}

/**
 * Check if a role can be assigned to a pilot based on their status
 * @param pilotId The ID of the pilot to check
 * @param roleId The ID of the role to possibly assign
 * @returns Object indicating if assignment is possible and reason if not
 */
export async function canAssignRoleToPilot(
  pilotId: string, 
  roleId: string
): Promise<{ canAssign: boolean; reason?: string }> {
  try {
    // First get the pilot's status
    const { data: pilot, error: pilotError } = await supabase
      .from('pilots')
      .select('status_id')
      .eq('id', pilotId)
      .single();
    
    if (pilotError) {
      throw new Error(`Error fetching pilot data: ${pilotError.message}`);
    }
    
    if (!pilot || !pilot.status_id) {
      return { canAssign: false, reason: "Pilot has no status assigned" };
    }
    
    // Get the role details
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, name, compatible_statuses, isExclusive')
      .eq('id', roleId)
      .single();
    
    if (roleError) {
      throw new Error(`Error fetching role data: ${roleError.message}`);
    }
    
    if (!role) {
      return { canAssign: false, reason: "Role not found" };
    }
    
    // If the role has no compatible statuses specified, allow the assignment
    if (!role.compatible_statuses || role.compatible_statuses.length === 0) {
      return { canAssign: true };
    }
    
    // Check if pilot's status is compatible
    // Ensure we're working with strings for comparison
    const pilotStatusId = String(pilot.status_id);
    const compatibleStatusIds = role.compatible_statuses.map(id => String(id));
    
    if (!compatibleStatusIds.includes(pilotStatusId)) {
      return { 
        canAssign: false, 
        reason: "Pilot's status is not compatible with this role" 
      };
    }
    
    return { canAssign: true };
  } catch (error: any) {
    console.error('Error checking role compatibility:', error);
    return { canAssign: false, reason: error.message || "Error checking role compatibility" };
  }
}

/**
 * Set a pilot's role
 * @param id The ID of the pilot to update (either UUID or Discord ID)
 * @param roleId The ID of the role to set
 * @returns The updated pilot data
 */
export async function updatePilotRole(
  id: string, 
  roleId: string
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
    .update({ role_id: roleId })
    .eq('id', actualId)
    .select()
    .single();

  return { data, error };
}

/**
 * Get a pilot's assigned roles (multiple roles support)
 * @param pilotId The ID of the pilot
 * @returns Array of role objects assigned to this pilot
 */
export async function getPilotAssignedRoles(pilotId: string): Promise<{ 
  data: Array<{ 
    id: string; 
    name: string; 
    isExclusive: boolean;
    compatible_statuses: string[];
    order: number;
    created_at: string;
  }>; 
  error: any 
}> {
  try {
    // Get the pilot's role_id
    const { data: pilot, error: pilotError } = await supabase
      .from('pilots')
      .select('role_id')
      .eq('id', pilotId)
      .single();
    
    if (pilotError) {
      throw pilotError;
    }
    
    // If pilot has no role_id, return empty array
    if (!pilot || !pilot.role_id) {
      return { data: [], error: null };
    }
    
    // Get the role details
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, name, isExclusive, compatible_statuses, order, created_at')
      .eq('id', pilot.role_id)
      .single();
      
    if (roleError) {
      throw roleError;
    }
    
    return { 
      data: role ? [role] : [], 
      error: null
    };
  } catch (error) {
    console.error('Error in getPilotAssignedRoles:', error);
    return { data: [], error };
  }
}

/**
 * Update a pilot's role assignments (multiple roles)
 * @param pilotId The ID of the pilot to update (either UUID or Discord ID)
 * @param roleIds Array of role IDs to assign to the pilot
 * @returns Success status and error if any
 */
export async function updatePilotRoleAssignments(
  pilotId: string, 
  roleIds: string[]
): Promise<{ success: boolean; error: any }> {
  try {
    // First try to find the pilot by discord_original_id (for Discord IDs)
    const { data: pilotByDiscordId } = await supabase
      .from('pilots')
      .select('id')
      .eq('discord_original_id', pilotId)
      .single();
    
    // If found by Discord ID, use the actual UUID from the database
    const actualPilotId = pilotByDiscordId ? pilotByDiscordId.id : pilotId;
    
    // Since we're now using a direct role_id field instead of a junction table,
    // we'll just update the pilot's role_id with the first role in the array
    // (or null if no roles provided)
    const roleId = roleIds.length > 0 ? roleIds[0] : null;
    
    const { error: updateError } = await supabase
      .from('pilots')
      .update({ role_id: roleId })
      .eq('id', actualPilotId);
      
    if (updateError) {
      throw updateError;
    }
    
    return { success: true, error: null };
  } catch (error) {
    console.error('Error updating pilot role assignment:', error);
    return { success: false, error };
  }
}