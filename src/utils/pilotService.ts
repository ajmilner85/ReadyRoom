import { supabase } from './supabaseClient';
import { Pilot, NewPilot, UpdatePilot } from './pilotTypes';

/**
 * Fetch all pilots from the database with their role assignments, status, and standing
 */
export async function getAllPilots(): Promise<{ data: Pilot[] | null; error: any }> {
  
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

    // Step 3: Fetch all active pilot status assignments
    const { data: statusAssignments, error: statusError } = await supabase
      .from('pilot_statuses')
      .select(`
        *,
        statuses:status_id (
          id,
          name,
          isActive,
          order
        )
      `)
      .is('end_date', null); // Only active statuses

    if (statusError) {
      console.error('❌ Error fetching status assignments:', statusError);
      return { data: null, error: statusError };
    }

    // Step 4: Fetch all active pilot standing assignments
    const { data: standingAssignments, error: standingError } = await supabase
      .from('pilot_standings')
      .select(`
        *,
        standings:standing_id (
          id,
          name,
          order
        )
      `)
      .is('end_date', null); // Only active standings

    if (standingError) {
      console.error('❌ Error fetching standing assignments:', standingError);
      return { data: null, error: standingError };
    }

    // Step 5: Fetch all active pilot squadron assignments
    const { data: squadronAssignments, error: squadronError } = await supabase
      .from('pilot_assignments')
      .select(`
        *,
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
          color_palette,
          discord_integration,
          updated_at
        )
      `)
      .is('end_date', null); // Only active assignments

    if (squadronError) {
      console.error('❌ Error fetching squadron assignments:', squadronError);
      return { data: null, error: squadronError };
    }



    // Step 6: Combine pilots with their assignments  
    const pilotsWithAssignments = (pilotsData || []).map(pilot => {
      // Find this pilot's active role assignment
      const pilotRoleAssignments = (roleAssignments || []).filter(
        ra => ra.pilot_id === pilot.id
      );
      pilotRoleAssignments.sort((a, b) => 
        new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime()
      );
      const currentRoleAssignment = pilotRoleAssignments[0];

      // Find this pilot's active status assignment
      const pilotStatusAssignment = (statusAssignments || []).find(
        sa => sa.pilot_id === pilot.id
      );

      // Find this pilot's active standing assignment
      const pilotStandingAssignment = (standingAssignments || []).find(
        sta => sta.pilot_id === pilot.id
      );

      // Find this pilot's active squadron assignment
      const pilotSquadronAssignment = (squadronAssignments || []).find(
        sqa => sqa.pilot_id === pilot.id
      );


      const transformedPilot: Pilot = {
        ...pilot, // Spread all pilot properties from database
        roles: currentRoleAssignment ? [{
          ...currentRoleAssignment,
          pilot_id: pilot.id,
          role: currentRoleAssignment.roles // This should be the role object
        }] : null,
        currentStatus: pilotStatusAssignment?.statuses || null,
        currentStanding: pilotStandingAssignment?.standings || null,
        standing_id: pilotStandingAssignment?.standing_id || undefined,
        // Set legacy status field based on current status for backward compatibility
        status: (pilotStatusAssignment?.statuses?.name as any) || 'Active',
        // Squadron assignment information (cast to any to extend Pilot interface)
        currentSquadron: pilotSquadronAssignment?.org_squadrons || null,
        squadronAssignment: pilotSquadronAssignment ? {
          id: pilotSquadronAssignment.id,
          pilot_id: pilotSquadronAssignment.pilot_id,
          squadron_id: pilotSquadronAssignment.squadron_id,
          start_date: pilotSquadronAssignment.start_date,
          end_date: pilotSquadronAssignment.end_date || undefined,
          created_at: pilotSquadronAssignment.created_at,
          updated_at: pilotSquadronAssignment.updated_at || undefined
        } : undefined
      };


      
      return transformedPilot;
    });

    
    return { data: pilotsWithAssignments as Pilot[], error: null };

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
  // Check if board number already exists for active pilots only (exclude Retired/Removed)
  const { data: existingPilot } = await supabase
    .from('pilots')
    .select(`
      id,
      pilot_statuses!inner (
        statuses!inner (
          name
        )
      )
    `)
    .eq('boardNumber', pilot.boardNumber)
    .not('pilot_statuses.statuses.name', 'in', '("Retired","Removed")')
    .is('pilot_statuses.end_date', null)
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
 * Create a new pilot with status and standing assignments
 */
export async function createPilotWithStatusAndStanding(
  pilotData: NewPilot,
  statusId: string,
  standingId: string
): Promise<{ data: Pilot | null; error: any }> {
  console.log('🔍 Creating new pilot with status and standing...');
  
  try {
    // Check if board number already exists for active pilots only (exclude Retired/Removed)
    const { data: existingPilot } = await supabase
      .from('pilots')
      .select(`
        id,
        pilot_statuses!inner (
          statuses!inner (
            name
          )
        )
      `)
      .eq('boardNumber', pilotData.boardNumber)
      .not('pilot_statuses.statuses.name', 'in', '("Retired","Removed")')
      .is('pilot_statuses.end_date', null)
      .single();

    if (existingPilot) {
      return { 
        data: null, 
        error: { message: `Pilot with board number ${pilotData.boardNumber} already exists` } 
      };
    }

    // Step 1: Create the pilot
    const { data: newPilot, error: pilotError } = await supabase
      .from('pilots')
      .insert(pilotData)
      .select()
      .single();

    if (pilotError || !newPilot) {
      console.error('❌ Error creating pilot:', pilotError);
      return { data: null, error: pilotError };
    }

    console.log('✅ Pilot created:', newPilot);

    // Step 2: Assign status
    const today = new Date().toISOString().split('T')[0];
    
    const { error: statusError } = await supabase
      .from('pilot_statuses')
      .insert({
        pilot_id: newPilot.id,
        status_id: statusId,
        start_date: today,
        end_date: null
      });

    if (statusError) {
      console.error('❌ Error assigning status:', statusError);
      // Try to delete the pilot since we couldn't assign status
      await supabase.from('pilots').delete().eq('id', newPilot.id);
      return { data: null, error: statusError };
    }

    console.log('✅ Status assigned');

    // Step 3: Assign standing
    const { error: standingError } = await supabase
      .from('pilot_standings')
      .insert({
        pilot_id: newPilot.id,
        standing_id: standingId,
        start_date: today,
        end_date: null
      });

    if (standingError) {
      console.error('❌ Error assigning standing:', standingError);
      // Try to delete the pilot and status since we couldn't assign standing
      await supabase.from('pilot_statuses').delete().eq('pilot_id', newPilot.id);
      await supabase.from('pilots').delete().eq('id', newPilot.id);
      return { data: null, error: standingError };
    }

    console.log('✅ Standing assigned');

    // Step 4: Fetch the complete pilot data with status and standing
    const result = await getAllPilots();
    if (result.error || !result.data) {
      return { data: null, error: result.error };
    }

    const completePilot = result.data.find(p => p.id === newPilot.id);
    if (!completePilot) {
      return { data: null, error: new Error('Failed to fetch created pilot') };
    }

    console.log('🎉 Pilot created successfully with status and standing');
    return { data: completePilot, error: null };

  } catch (error) {
    console.error('❌ Unexpected error in createPilotWithStatusAndStanding:', error);
    return { data: null, error };
  }
}

/**
 * Update an existing pilot
 * @param id The ID of the pilot to update
 * @param updates The pilot data to update
 */
export async function updatePilot(id: string, updates: UpdatePilot): Promise<{ data: Pilot | null; error: any }> {
  // If board number is being updated, check if it's unique among active pilots only
  if (updates.boardNumber) {
    const { data: existingPilots, error: checkError } = await supabase
      .from('pilots')
      .select(`
        id,
        pilot_statuses!inner (
          statuses!inner (
            name
          )
        )
      `)
      .eq('boardNumber', updates.boardNumber)
      .neq('id', id)
      .not('pilot_statuses.statuses.name', 'in', '("Retired","Removed")')
      .is('pilot_statuses.end_date', null);

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
 * Update a pilot's status using the pilot_statuses join table
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
  
  try {
    // Use the pilotStatusStandingService to update the status
    const { assignPilotStatus } = await import('./pilotStatusStandingService');
    await assignPilotStatus(actualId, statusId);
    
    // Return the updated pilot
    const { data: pilots } = await getAllPilots();
    const updatedPilot = pilots?.find(p => p.id === actualId) || null;
    
    return { data: updatedPilot, error: null };
  } catch (error) {
    return { data: null, error };
  }
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
    // Get the pilot's current status from pilot_statuses join table
    const { data: statusAssignment, error: pilotError } = await supabase
      .from('pilot_statuses')
      .select('status_id')
      .eq('pilot_id', pilotId)
      .is('end_date', null)
      .single();
    
    if (pilotError) {
      // If no status assignment found, allow role assignment
      if (pilotError.code === 'PGRST116') {
        return { canAssign: true };
      }
      throw new Error(`Error fetching pilot status: ${pilotError.message}`);
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
    const pilotStatusId = statusAssignment?.status_id;
    if (!pilotStatusId) {
      // If pilot has no status, allow assignment
      return { canAssign: true };
    }
    
    const compatibleStatusIds = role.compatible_statuses.map(id => String(id));
    
    if (!compatibleStatusIds.includes(String(pilotStatusId))) {
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
    
    // If the role is exclusive, end any existing assignments of this role IN THE SAME SQUADRON
    if (roleData?.isExclusive) {
      // Get the current pilot's squadron
      const { data: currentPilotSquadron, error: squadronError } = await supabase
        .from('pilot_assignments')
        .select('squadron_id')
        .eq('pilot_id', actualPilotId)
        .is('end_date', null)
        .single();
        
      if (squadronError && squadronError.code !== 'PGRST116') {
        throw squadronError;
      }
      
      if (currentPilotSquadron?.squadron_id) {
        // Get all pilots in the same squadron who have this role
        const { data: sameSquadronPilots, error: sameSquadronError } = await supabase
          .from('pilot_assignments')
          .select('pilot_id')
          .eq('squadron_id', currentPilotSquadron.squadron_id)
          .is('end_date', null);
          
        if (sameSquadronError) {
          throw sameSquadronError;
        }
        
        if (sameSquadronPilots && sameSquadronPilots.length > 0) {
          const sameSquadronPilotIds = sameSquadronPilots.map(p => p.pilot_id);
          
          // Get active pilots only (those with active status)
          const { data: activePilots, error: activeError } = await supabase
            .from('pilot_statuses')
            .select(`
              pilot_id,
              statuses!inner (
                isActive
              )
            `)
            .in('pilot_id', sameSquadronPilotIds)
            .eq('statuses.isActive', true)
            .is('end_date', null);
            
          if (activeError) {
            throw activeError;
          }
          
          const activePilotIds = activePilots?.map(p => p.pilot_id) || [];
          
          // End the role assignments only for ACTIVE pilots in the same squadron
          if (activePilotIds.length > 0) {
            const { error: endExistingError } = await supabase
              .from('pilot_roles')
              .update({ 
                end_date: new Date().toISOString().split('T')[0],
                updated_at: new Date().toISOString()
              })
              .eq('role_id', roleId)
              .in('pilot_id', activePilotIds)
              .is('end_date', null);
            
            if (endExistingError) {
              throw endExistingError;
            }
          }
        }
      }
      // If pilot has no squadron, we don't end any existing assignments 
      // (let the validation in RosterManagement handle this case)
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
 * Update a pilot's role without enforcing exclusive role constraints
 * This is used when the user explicitly chooses to accept duplicate roles
 * @param id The ID of the pilot to update (either UUID or Discord ID)
 * @param roleId The ID of the role to set
 * @param isActing Whether this is an acting role assignment
 * @param effectiveDate The date the role becomes effective (defaults to today)
 * @returns Success status and error if any
 */
export async function updatePilotRoleAllowDuplicates(
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
    
    // End any existing active roles for this pilot (single role per pilot)
    // But do NOT end roles for other pilots (this is the key difference)
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
    console.log('Creating new role assignment (allowing duplicates) with data:', {
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
      console.error('Error inserting role assignment (allowing duplicates):', insertError);
      throw insertError;
    }
    
    console.log('Successfully created role assignment (allowing duplicates):', insertData);
    return { success: true, error: null };
  } catch (error) {
    console.error('Error updating pilot role (allowing duplicates):', error);
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