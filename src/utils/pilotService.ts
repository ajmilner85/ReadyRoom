import { supabase } from './supabaseClient';
import { Pilot, NewPilot, UpdatePilot } from './pilotTypes';

/**
 * Fetch all pilots from the database with their role assignments
 */
export async function getAllPilots(): Promise<{ data: Pilot[] | null; error: any }> {
  console.log('🔍 Fetching all pilots with roles...');
  
  try {
    // Step 1: Fetch all pilots
    const { data: pilotsData, error: pilotsError } = await supabase
      .from('pilots')
      .select('*')
      .order('boardNumber', { ascending: true });

    if (pilotsError) {
      console.error('❌ Error fetching pilots:', pilotsError);
      return { data: null, error: pilotsError };
    }

    console.log('✅ Fetched pilots:', pilotsData?.length);

    // Step 2: Fetch all active pilot role assignments with role details
    const { data: roleAssignments, error: rolesError } = await supabase
      .from('pilot_roles')
      .select(`
        *,
        roles:role_id (
          id,
          name,
          isExclusive,
          compatible_statuses,
          order
        )
      `)
      .is('end_date', null); // Only active roles

    if (rolesError) {
      console.error('❌ Error fetching role assignments:', rolesError);
      return { data: null, error: rolesError };
    }

    console.log('✅ Fetched role assignments:', roleAssignments?.length);
    console.log('🔍 Sample role assignment:', roleAssignments?.[0]);

    // Step 3: Combine pilots with their role assignments
    const pilotsWithRoles = (pilotsData || []).map(pilot => {
      // Find this pilot's active role assignments
      const pilotRoleAssignments = (roleAssignments || []).filter(
        ra => ra.pilot_id === pilot.id
      );

      console.log(`🔍 Pilot ${pilot.callsign} role assignments:`, pilotRoleAssignments);

      // Sort by effective_date to get the most recent (single role only)
      pilotRoleAssignments.sort((a, b) => 
        new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime()
      );

      // Get the most recent active role
      const currentRoleAssignment = pilotRoleAssignments[0];

      const transformedPilot: Pilot = {
        ...pilot, // Spread all pilot properties from database
        roles: currentRoleAssignment ? [{
          ...currentRoleAssignment,
          pilot_id: pilot.id,
          role: currentRoleAssignment.roles // This should be the role object
        }] : null
      };

      console.log(`✅ Transformed pilot ${pilot.callsign}:`, {
        id: pilot.id,
        callsign: pilot.callsign,
        rolesCount: transformedPilot.roles?.length || 0,
        currentRole: transformedPilot.roles?.[0]?.role?.name
      });

      return transformedPilot;
    });

    console.log('🎉 All pilots transformed successfully');
    return { data: pilotsWithRoles as Pilot[], error: null };

  } catch (error) {
    console.error('❌ Unexpected error in getAllPilots:', error);
    return { data: null, error };
  }
}

/**
 * Fetch a single pilot by ID with their role assignments
 */
export async function getPilotById(id: string): Promise<{ data: Pilot | null; error: any }> {
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
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    return { data: null, error };
  }

  if (!data) {
    return { data: null, error: null };
  }

  // Transform the data to include role information
  const pilot = data as any;
  const activeRoles = pilot.pilot_roles?.filter((pr: any) => {
    if (!pr.end_date) return true; // NULL end_date means active
    // Compare dates - if end_date is in the future, role is still active
    const endDate = new Date(pr.end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    return endDate >= today;
  }) || [];
  
  activeRoles.sort((a: any, b: any) => 
    new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime()
  );
  
  // Get the most recent active role (single role per pilot)
  const currentRole = activeRoles[0];
  
  const transformedPilot: Pilot = {
    ...pilot,
    // Remove role field - UI should get role from roles array only
    roles: currentRole ? [{
      id: currentRole.id,
      pilot_id: pilot.id,
      role_id: currentRole.role_id,
      effective_date: currentRole.effective_date,
      is_acting: currentRole.is_acting,
      end_date: currentRole.end_date,
      created_at: currentRole.created_at || new Date().toISOString(),
      updated_at: currentRole.updated_at,
      role: currentRole.roles
    }] : []
  };

  return { data: transformedPilot, error: null };
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
    const { data: existingPilots, error: checkError } = await supabase
      .from('pilots')
      .select('id')
      .eq('boardNumber', updates.boardNumber)
      .neq('id', id);

    // Don't use .single() as it causes errors when no records are found
    // Instead, check if data exists and has length > 0
    if (checkError) {
      return { data: null, error: checkError };
    }
    
    if (existingPilots && existingPilots.length > 0) {
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
  _id: string, 
  _roles: any
): Promise<{ data: Pilot | null; error: any }> {
  console.warn('updatePilotRoles is deprecated. Please use updatePilotRole instead.');
  console.error('This function should not be used - pilot roles are now managed via pilot_roles table');
  return { data: null, error: { message: 'Deprecated function - use updatePilotRole instead' } };
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
 * Get a pilot's primary role (most recent active role)
 * @param pilotId The ID of the pilot
 * @returns The primary role object associated with this pilot or null if no role is assigned
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
    // Get the pilot's active role assignments
    const { data: pilotRoles, error: pilotRoleError } = await supabase
      .from('pilot_roles')
      .select(`
        id,
        role_id,
        effective_date,
        end_date,
        roles:role_id (
          id,
          name,
          isExclusive,
          compatible_statuses,
          order,
          created_at
        )
      `)
      .eq('pilot_id', pilotId)
      .or('end_date.is.null,end_date.gt.' + new Date().toISOString())
      .order('effective_date', { ascending: false });
    
    if (pilotRoleError) {
      throw pilotRoleError;
    }
    
    // If no active roles, return null
    if (!pilotRoles || pilotRoles.length === 0) {
      return { data: null, error: null };
    }
    
    // Get the most recent role
    const mostRecentRole = pilotRoles[0];
    const role = mostRecentRole.roles;
    
    if (!role) {
      return { data: null, error: null };
    }
    
    return { 
      data: {
        ...role,
        created_at: role.created_at || ''
      }, 
      error: null 
    };
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
 * Set a pilot's role using the pilot_roles join table (single role only)
 * @param id The ID of the pilot to update (either UUID or Discord ID)
 * @param roleId The ID of the role to set
 * @param isActing Whether this is an acting role assignment
 * @param effectiveDate The date the role becomes effective (defaults to today)
 * @returns Success status and error if any
 */
export async function updatePilotRole(
  id: string, 
  roleId: string,
  isActing: boolean = false,
  effectiveDate: string = new Date().toISOString().split('T')[0]
): Promise<{ success: boolean; error: any }> {
  try {
    // First try to find the pilot by discord_original_id (for Discord IDs)
    const { data: pilotByDiscordId } = await supabase
      .from('pilots')
      .select('id')
      .eq('discord_original_id', id)
      .single();
    
    // If found by Discord ID, use the actual UUID from the database
    const actualPilotId = pilotByDiscordId ? pilotByDiscordId.id : id;
    
    // Check if the role is exclusive
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('isExclusive')
      .eq('id', roleId)
      .single();
    
    if (roleError) {
      throw roleError;
    }
    
    // If the role is exclusive, end any existing assignments of this role
    if (roleData?.isExclusive) {
      const { error: endExistingError } = await supabase
        .from('pilot_roles')
        .update({ 
          end_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString()
        })
        .eq('role_id', roleId)
        .is('end_date', null);
      
      if (endExistingError) {
        throw endExistingError;
      }
    }
    
    // End any existing active roles for this pilot (single role per pilot)
    const { error: endPilotRolesError } = await supabase
      .from('pilot_roles')
      .update({ 
        end_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
      })
      .eq('pilot_id', actualPilotId)
      .is('end_date', null);
    
    if (endPilotRolesError) {
      throw endPilotRolesError;
    }
    
    // Create new role assignment (end_date defaults to NULL)
    console.log('Creating new role assignment with data:', {
      pilot_id: actualPilotId,
      role_id: roleId,
      effective_date: effectiveDate,
      is_acting: isActing
    });
    
    const { data: insertData, error: insertError } = await supabase
      .from('pilot_roles')
      .insert({
        pilot_id: actualPilotId,
        role_id: roleId,
        effective_date: effectiveDate,
        is_acting: isActing
        // end_date is intentionally omitted to default to NULL
      })
      .select(); // Add select to see what was inserted
    
    if (insertError) {
      console.error('Error inserting role assignment:', insertError);
      throw insertError;
    }
    
    console.log('Successfully created role assignment:', insertData);
    return { success: true, error: null };
  } catch (error) {
    console.error('Error updating pilot role:', error);
    return { success: false, error };
  }
}

/**
 * Get a pilot's current role (single role support only)
 * @param pilotId The ID of the pilot
 * @returns The current role object assigned to this pilot
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
    // Get the pilot's current active role assignment (most recent)
    const { data: pilotRoles, error: pilotRoleError } = await supabase
      .from('pilot_roles')
      .select(`
        id,
        role_id,
        effective_date,
        end_date,
        is_acting,
        roles:role_id (
          id,
          name,
          isExclusive,
          compatible_statuses,
          order,
          created_at
        )
      `)
      .eq('pilot_id', pilotId)
      .or('end_date.is.null,end_date.gt.' + new Date().toISOString())
      .order('effective_date', { ascending: false })
      .limit(1); // Only get the most recent role
    
    if (pilotRoleError) {
      throw pilotRoleError;
    }
    
    // If no active role, return empty array
    if (!pilotRoles || pilotRoles.length === 0) {
      return { data: [], error: null };
    }
    
    // Return single role in array format for consistency
    const currentRole = pilotRoles[0];
    if (!currentRole.roles || !currentRole.roles.id) {
      return { data: [], error: null };
    }
    
    const role = {
      id: currentRole.roles.id,
      name: currentRole.roles.name,
      isExclusive: currentRole.roles.isExclusive,
      compatible_statuses: currentRole.roles.compatible_statuses,
      order: currentRole.roles.order,
      created_at: currentRole.roles.created_at || ''
    };
    
    return { data: [role], error: null };
  } catch (error) {
    console.error('Error in getPilotAssignedRoles:', error);
    return { data: [], error };
  }
}

/**
 * Update a pilot's role assignment (single role using pilot_roles table)
 * @param pilotId The ID of the pilot to update (either UUID or Discord ID)
 * @param roleId The role ID to assign to the pilot (single role only)
 * @param effectiveDate The date this assignment becomes effective
 * @returns Success status and error if any
 */
export async function updatePilotRoleAssignments(
  pilotId: string, 
  roleId: string | null,
  effectiveDate: string = new Date().toISOString().split('T')[0]
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
    
    // End all existing active role assignments for this pilot
    const { error: endExistingError } = await supabase
      .from('pilot_roles')
      .update({ 
        end_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
      })
      .eq('pilot_id', actualPilotId)
      .is('end_date', null);
    
    if (endExistingError) {
      throw endExistingError;
    }
    
    // Create new role assignment if roleId is provided
    if (roleId) {
      const { error: insertError } = await supabase
        .from('pilot_roles')
        .insert({
          pilot_id: actualPilotId,
          role_id: roleId,
          effective_date: effectiveDate,
          is_acting: false
          // end_date defaults to NULL
        });
      
      if (insertError) {
        throw insertError;
      }
    }
    
    return { success: true, error: null };
  } catch (error) {
    console.error('Error updating pilot role assignment:', error);
    return { success: false, error };
  }
}

/**
 * Add a role assignment to a pilot using the pilot_roles join table
 * @param pilotId The ID of the pilot
 * @param roleId The ID of the role to assign
 * @param isActing Whether this is an acting role assignment
 * @param effectiveDate The date the role becomes effective
 * @returns Success status and error if any
 */
export async function addPilotRoleAssignment(
  pilotId: string,
  roleId: string,
  isActing: boolean = false,
  effectiveDate: string = new Date().toISOString().split('T')[0]
): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('pilot_roles')
      .insert({
        pilot_id: pilotId,
        role_id: roleId,
        effective_date: effectiveDate,
        is_acting: isActing
      });
    
    if (error) {
      throw error;
    }
    
    return { success: true, error: null };
  } catch (error) {
    console.error('Error adding pilot role assignment:', error);
    return { success: false, error };
  }
}

/**
 * Clear a pilot's Discord credentials
 * @param id The ID of the pilot to update (either UUID or Discord ID)
 * @returns Success status and error if any
 */
export async function clearDiscordCredentials(id: string): Promise<{ success: boolean; error: any }> {
  try {
    // First try to find the pilot by discord_original_id (for Discord IDs)
    const { data: pilotByDiscordId } = await supabase
      .from('pilots')
      .select('id')
      .eq('discord_original_id', id)
      .single();
    
    // If found by Discord ID, use the actual UUID from the database
    const actualId = pilotByDiscordId ? pilotByDiscordId.id : id;
    
    // Now update using the correct UUID, clearing Discord-related fields
    const { error } = await supabase
      .from('pilots')
      .update({ 
        discordId: null, 
        discord_original_id: null
        // Removed discordUsername as it doesn't exist in the database schema
      })
      .eq('id', actualId);

    return { success: !error, error };
  } catch (err) {
    console.error('Error clearing Discord credentials:', err);
    return { success: false, error: err };
  }
}