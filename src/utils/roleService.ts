// filepath: c:\Users\ajmil\OneDrive\Desktop\pri-fly\src\utils\roleService.ts
import { supabase, getCurrentUser } from './supabaseClient';
import { permissionCache } from './permissionCache';

// Define the Role interface with hierarchical exclusivity scope
export type ExclusivityScope = 'none' | 'squadron' | 'wing';

export interface Role {
  id: string;
  name: string;
  exclusivity_scope: ExclusivityScope;
  order: number;
  created_at?: string | null;
}

/**
 * Fetch all squadron roles
 */
export async function getAllRoles(): Promise<{ data: Role[] | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select('id, name, exclusivity_scope, order, created_at')
      .order('order', { ascending: true });

    if (error) {
      throw error;
    }

    // Validate each result item
    const validData: Role[] = [];
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (item &&
            typeof item === 'object' &&
            'id' in item &&
            'name' in item &&
            'exclusivity_scope' in item &&
            'order' in item) {
          validData.push(item as unknown as Role);
        }
      });
    }
    return { data: validData, error: null };
  } catch (e) {
    console.error('Error in getAllRoles:', e);
    return { data: null, error: e };
  }
}

/**
 * Add a new role
 */
export async function createRole(role: Omit<Role, 'id' | 'created_at'>): Promise<{ data: Role | null; error: any }> {
  try {
    // Get current user for RLS context
    const { user, error: userError } = await getCurrentUser();
    if (userError || !user) {
      return { data: null, error: userError || new Error('User not authenticated') };
    }

    // Ensure user permissions are calculated and cached in the correct format for RLS
    try {
      await permissionCache.getUserPermissions(user.id);
    } catch (permError) {
      console.warn('Could not cache permissions, proceeding anyway:', permError);
    }

    const { data, error } = await supabase
      .from('roles')
      .insert({
        name: role.name,
        exclusivity_scope: role.exclusivity_scope,
        order: role.order
      })
      .select('id, name, exclusivity_scope, order, created_at')
      .single();

    if (error) {
      throw error;
    }

    if (data && typeof data === 'object') {
      return { data: data as unknown as Role, error: null };
    }

    return { data: null, error: new Error("Invalid role data returned from database") };
  } catch (e) {
    console.error('Error in createRole:', e);
    return { data: null, error: e };
  }
}

/**
 * Update an existing role
 */
export async function updateRole(id: string, updates: Partial<Omit<Role, 'id' | 'created_at'>>): Promise<{ data: Role | null; error: any }> {
  try {
    // Get current user for RLS context
    const { user, error: userError } = await getCurrentUser();
    if (userError || !user) {
      return { data: null, error: userError || new Error('User not authenticated') };
    }

    // Ensure user permissions are calculated and cached in the correct format for RLS
    try {
      await permissionCache.getUserPermissions(user.id);
    } catch (permError) {
      console.error('Could not cache permissions:', permError);
      throw new Error('Failed to load user permissions');
    }

    // Create update object
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.exclusivity_scope !== undefined) updateData.exclusivity_scope = updates.exclusivity_scope;
    if (updates.order !== undefined) updateData.order = updates.order;

    const { data, error } = await supabase
      .from('roles')
      .update(updateData)
      .eq('id', id)
      .select('id, name, exclusivity_scope, order, created_at')
      .single();

    if (error) {
      throw error;
    }

    if (data && typeof data === 'object') {
      return { data: data as unknown as Role, error: null };
    }

    return { data: null, error: new Error("Invalid role data returned from database") };
  } catch (e) {
    console.error('Error in updateRole:', e);
    return { data: null, error: e };
  }
}

/**
 * Delete a role
 */
export async function deleteRole(id: string): Promise<{ success: boolean; error: any }> {
  try {
    // Check if any pilots are currently assigned this role in pilot_roles table
    const { data: pilotsWithRole, error: checkError } = await supabase
      .from('pilot_roles')
      .select(`
        pilot_id,
        pilots:pilot_id (id, callsign)
      `)
      .eq('role_id', id)
      .is('end_date', null); // Only check active role assignments
    
    if (checkError) {
      return { success: false, error: checkError };
    }
    
    // If pilots are using this role, prevent deletion
    // Add null check before accessing pilotsWithRole.length
    if (pilotsWithRole && pilotsWithRole.length > 0) {
      const pilotNames = pilotsWithRole.map(p => p.pilots?.callsign || 'Unknown').join(', ');
      return { 
        success: false, 
        error: {
          message: `Cannot delete role: It is currently assigned to the following pilots: ${pilotNames}`,
          details: pilotNames,
          code: "foreign_key_violation"
        } 
      };
    }
    
    // Also check if the role is assigned to pilots in the pilot_roles table
    // Using any type to work around potential schema issues
    const { count, error: countError } = await (supabase as any)
      .from('pilot_roles')
      .select('id', { count: 'exact' })
      .eq('role_id', id);
      
    if (countError) {
      return { success: false, error: countError };
    }
    
    if (count && count > 0) {
      // Remove the role assignments first
      const { error: removeError } = await (supabase as any)
        .from('pilot_roles')
        .delete()
        .eq('role_id', id);
        
      if (removeError) {
        return { success: false, error: removeError };
      }
    }

    // Now it's safe to delete the role
    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('id', id);

    return { success: !error, error };
  } catch (e) {
    console.error('Error in deleteRole:', e);
    return { success: false, error: e };
  }
}

/**
 * Get the usage count of a role
 * Returns the number of pilots currently assigned this role (active assignments only)
 */
export async function getRoleUsageCount(roleId: string): Promise<{ count: number; error: any }> {
  try {
    // Check pilot_roles junction table for active assignments only
    const { count, error } = await supabase
      .from('pilot_roles')
      .select('id', { count: 'exact' })
      .eq('role_id', roleId)
      .or('end_date.is.null,end_date.gt.' + new Date().toISOString());

    if (error) {
      return { count: 0, error };
    }

    return { count: count || 0, error: null };
  } catch (e) {
    console.error('Error in getRoleUsageCount:', e);
    return { count: 0, error: e };
  }
}

/**
 * Assign a role to a pilot using the pilot_roles join table with hierarchical exclusivity checks
 *
 * Exclusivity rules:
 * - 'none': Any number of active pilots can hold this role
 * - 'squadron': Only one active pilot per squadron can hold this role
 * - 'wing': Only one active pilot per wing can hold this role
 *
 * Note: Only considers pilots with ACTIVE statuses (statuses.isActive = true).
 * Retired/inactive pilots do not block new assignments.
 */
export async function assignRoleToPilot(
  pilotId: string,
  roleId: string,
  isActing: boolean = false,
  effectiveDate: string = new Date().toISOString().split('T')[0]
): Promise<{ data: any; error: any }> {
  try {
    // Get role exclusivity scope
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('exclusivity_scope')
      .eq('id', roleId)
      .single();

    if (roleError) {
      throw roleError;
    }

    const scope = (roleData as any)?.exclusivity_scope as ExclusivityScope;

    // If role has exclusivity scope, check for conflicts with active pilots
    if (scope && scope !== 'none') {
      // Get the pilot's current squadron and wing
      const { data: pilotAssignment, error: assignmentError } = await supabase
        .from('pilot_assignments')
        .select(`
          squadron_id,
          org_squadrons!inner (
            id,
            wing_id
          )
        `)
        .eq('pilot_id', pilotId)
        .is('end_date', null)
        .single();

      if (assignmentError || !pilotAssignment) {
        throw new Error('Could not determine pilot squadron/wing assignment');
      }

      const pilotSquadronId = pilotAssignment.squadron_id;
      const pilotWingId = pilotAssignment.org_squadrons?.wing_id;

      // Find pilots with this role who have ACTIVE statuses
      const { data: conflictingAssignments, error: conflictError } = await supabase
        .from('pilot_roles')
        .select(`
          pilot_id,
          pilots!inner (
            id,
            callsign,
            pilot_assignments!inner (
              squadron_id,
              org_squadrons!inner (
                id,
                wing_id
              )
            ),
            pilot_statuses!inner (
              statuses!inner (
                isActive
              )
            )
          )
        `)
        .eq('role_id', roleId)
        .is('end_date', null)
        .neq('pilot_id', pilotId); // Exclude the pilot we're assigning to

      if (conflictError) {
        throw conflictError;
      }

      // Filter to only active pilots
      const activeConflicts = conflictingAssignments?.filter(assignment => {
        const pilot = assignment.pilots;
        if (!pilot) return false;

        // Check if pilot has an active status
        const hasActiveStatus = pilot.pilot_statuses?.some(ps =>
          ps.statuses?.isActive === true
        );

        if (!hasActiveStatus) return false;

        // Check if the pilot's current assignment conflicts based on scope
        const currentAssignment = pilot.pilot_assignments?.[0]; // Get most recent
        if (!currentAssignment) return false;

        if (scope === 'squadron') {
          return currentAssignment.squadron_id === pilotSquadronId;
        } else if (scope === 'wing') {
          return currentAssignment.org_squadrons?.wing_id === pilotWingId;
        }

        return false;
      });

      // If there are conflicts, end those role assignments
      if (activeConflicts && activeConflicts.length > 0) {
        const conflictingPilotIds = activeConflicts.map(ac => ac.pilot_id);

        const { error: endExistingError } = await supabase
          .from('pilot_roles')
          .update({
            end_date: new Date().toISOString().split('T')[0],
            updated_at: new Date().toISOString()
          })
          .eq('role_id', roleId)
          .in('pilot_id', conflictingPilotIds)
          .is('end_date', null);

        if (endExistingError) {
          throw endExistingError;
        }
      }
    }

    // Create new role assignment
    const { data, error } = await supabase
      .from('pilot_roles')
      .insert({
        pilot_id: pilotId,
        role_id: roleId,
        effective_date: effectiveDate,
        is_acting: isActing
      })
      .select();

    return { data, error };
  } catch (e) {
    console.error('Error in assignRoleToPilot:', e);
    return { data: null, error: e };
  }
}

/**
 * Remove a role from a pilot (end the role assignment)
 */
export async function removeRoleFromPilot(pilotId: string, roleId: string): Promise<{ success: boolean; error: any }> {
  try {
    // End the role assignment by setting end_date
    const { error } = await supabase
      .from('pilot_roles')
      .update({ 
        end_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
      })
      .eq('pilot_id', pilotId)
      .eq('role_id', roleId)
      .is('end_date', null);
      
    return { success: !error, error };
  } catch (e) {
    console.error('Error in removeRoleFromPilot:', e);
    return { success: false, error: e };
  }
}

/**
 * Get all active roles assigned to a pilot
 */
export async function getPilotRoles(pilotId: string): Promise<{ data: Role[] | null; error: any }> {
  try {
    // Get active pilot roles with role details
    const { data: pilotRoles, error: pilotRoleError } = await supabase
      .from('pilot_roles')
      .select(`
        role_id,
        effective_date,
        end_date,
        is_acting,
        roles:role_id (
          id,
          name,
          exclusivity_scope,
          order,
          created_at
        )
      `)
      .eq('pilot_id', pilotId)
      .or('end_date.is.null,end_date.gt.' + new Date().toISOString())
      .order('effective_date', { ascending: false});

    if (pilotRoleError) {
      throw pilotRoleError;
    }

    if (!pilotRoles || pilotRoles.length === 0) {
      return { data: [], error: null };
    }

    // Transform to Role format
    const roles: Role[] = pilotRoles
      .filter(pr => pr.roles && (pr.roles as any).id)
      .map(pr => {
        const roleData = pr.roles as any;
        return {
          id: roleData.id,
          name: roleData.name,
          exclusivity_scope: roleData.exclusivity_scope as ExclusivityScope,
          order: roleData.order,
          created_at: roleData.created_at
        };
      });

    return { data: roles, error: null };
  } catch (e) {
    console.error('Error in getPilotRoles:', e);
    return { data: null, error: e };
  }
}

/**
 * Initialize default roles if none exist
 * Note: Compatible statuses no longer exist - any billet can be assigned to any status
 */
export async function initializeDefaultRoles(): Promise<void> {
  // Check if roles table exists and has data
  const { count, error: countError } = await supabase
    .from('roles')
    .select('id', { count: 'exact' });

  // If error, the table might not exist yet
  if (countError) {
    console.error('Error checking roles table:', countError);
    return;
  }

  // If we have roles, don't initialize
  if (count && count > 0) {
    return;
  }

  try {
    // Default roles with hierarchical exclusivity scopes
    const defaultRoles = [
      { name: 'CO', exclusivity_scope: 'squadron' as ExclusivityScope, order: 10 },
      { name: 'XO', exclusivity_scope: 'squadron' as ExclusivityScope, order: 20 },
      { name: 'OPSO', exclusivity_scope: 'squadron' as ExclusivityScope, order: 30 },
      { name: 'Admin OIC', exclusivity_scope: 'squadron' as ExclusivityScope, order: 40 },
      { name: 'Intel OIC', exclusivity_scope: 'squadron' as ExclusivityScope, order: 50 },
      { name: 'Train OIC', exclusivity_scope: 'squadron' as ExclusivityScope, order: 60 },
      { name: 'DS Admin', exclusivity_scope: 'squadron' as ExclusivityScope, order: 70 },
      { name: 'Instructor', exclusivity_scope: 'none' as ExclusivityScope, order: 80 },
      { name: 'LSO', exclusivity_scope: 'none' as ExclusivityScope, order: 90 }
    ];

    await supabase.from('roles').insert(defaultRoles);
    console.log('Default roles initialized');
  } catch (error) {
    console.error('Failed to initialize default roles:', error);
  }
}
