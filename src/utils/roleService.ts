import { supabase } from './supabaseClient';

// Define the Role interface
export interface Role {
  id: string;
  name: string;
  isExclusive: boolean;
  compatible_statuses: string[];
  order: number;
  created_at?: string;
}

/**
 * Fetch all squadron roles
 */
export async function getAllRoles(): Promise<{ data: Role[] | null; error: any }> {
  try {
    // First, try with the expected camelCase column name
    const { data, error } = await supabase
      .from('roles')
      .select('id, name, "isExclusive", compatible_statuses, order, created_at');

    if (error) {
      // If that fails, try with lowercase column name and alias it to match our interface
      const { data: dataAlt, error: errorAlt } = await supabase
        .from('roles')
        .select('id, name, isexclusive as "isExclusive", compatible_statuses, order, created_at')
        .order('order', { ascending: true });
      
      if (errorAlt) {
        throw errorAlt;
      }
      
      return { data: dataAlt, error: null };
    }
    
    return { data, error };
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
    // Try different column names to handle potential schema differences
    const roleData = {
      name: role.name,
      "isExclusive": role.isExclusive, // Try with quotes for exact case match
      compatible_statuses: role.compatible_statuses,
      order: role.order
    };
    
    const { data, error } = await supabase
      .from('roles')
      .insert(roleData)
      .select('id, name, "isExclusive", compatible_statuses, order, created_at')
      .single();

    if (error) {
      // If that fails, try with lowercase
      const roleLowerData = {
        name: role.name,
        isexclusive: role.isExclusive, 
        compatible_statuses: role.compatible_statuses,
        order: role.order
      };
      
      const { data: dataAlt, error: errorAlt } = await supabase
        .from('roles')
        .insert(roleLowerData)
        .select('id, name, isexclusive as "isExclusive", compatible_statuses, order, created_at')
        .single();
        
      if (errorAlt) {
        throw errorAlt;
      }
      
      return { data: dataAlt, error: null };
    }
    
    return { data, error };
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
    // Create update objects for both potential column cases
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.compatible_statuses !== undefined) updateData.compatible_statuses = updates.compatible_statuses;
    if (updates.order !== undefined) updateData.order = updates.order;
    
    // Handle isExclusive with multiple approaches
    if (updates.isExclusive !== undefined) {
      updateData["isExclusive"] = updates.isExclusive; // Try with quotes for exact case
      updateData.isexclusive = updates.isExclusive; // Also try lowercase
    }
    
    const { data, error } = await supabase
      .from('roles')
      .update(updateData)
      .eq('id', id)
      .select('id, name, "isExclusive", compatible_statuses, order, created_at')
      .single();
      
    if (error) {
      // If that fails, try with lowercase fields
      const { data: dataAlt, error: errorAlt } = await supabase
        .from('roles')
        .update(updateData)
        .eq('id', id)
        .select('id, name, isexclusive as "isExclusive", compatible_statuses, order, created_at')
        .single();
        
      if (errorAlt) {
        throw errorAlt;
      }
      
      return { data: dataAlt, error: null };
    }
    
    return { data, error };
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
    // First check if any pilots are using this role as their primary role
    const { data: pilotsWithRole, error: checkError } = await supabase
      .from('pilots')
      .select('id, callsign')
      .eq('primary_role_id', id);
    
    if (checkError) {
      return { success: false, error: checkError };
    }
    
    // If pilots are using this role as primary role, prevent deletion
    // Add null check before accessing pilotsWithRole.length
    if (pilotsWithRole && pilotsWithRole.length > 0) {
      const pilotNames = pilotsWithRole.map(p => p.callsign).join(', ');
      return { 
        success: false, 
        error: {
          message: `Cannot delete role: It is assigned as the primary role for the following pilots: ${pilotNames}`,
          details: pilotNames,
          code: "foreign_key_violation"
        } 
      };
    }
    
    // Also check if the role is assigned to pilots in the pilot_roles table
    const { count, error: countError } = await supabase
      .from('pilot_roles')
      .select('id', { count: 'exact' })
      .eq('role_id', id);
      
    if (countError) {
      return { success: false, error: countError };
    }
    
    if (count && count > 0) {
      // Remove the role assignments first
      const { error: removeError } = await supabase
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
 * Returns the number of pilots currently assigned this role
 */
export async function getRoleUsageCount(roleId: string): Promise<{ count: number; error: any }> {
  try {
    // Check pilot_roles junction table
    const { count: junctionCount, error: junctionError } = await supabase
      .from('pilot_roles')
      .select('id', { count: 'exact' })
      .eq('role_id', roleId);

    if (junctionError) {
      return { count: 0, error: junctionError };
    }

    // Check primary_role_id in pilots table
    const { count: primaryCount, error: primaryError } = await supabase
      .from('pilots')
      .select('id', { count: 'exact' })
      .eq('primary_role_id', roleId);

    if (primaryError) {
      return { count: junctionCount || 0, error: primaryError };
    }

    // Return the sum of both counts
    return { count: (junctionCount || 0) + (primaryCount || 0), error: null };
  } catch (e) {
    console.error('Error in getRoleUsageCount:', e);
    return { count: 0, error: e };
  }
}

/**
 * Assign a role to a pilot
 */
export async function assignRoleToPilot(pilotId: string, roleId: string): Promise<{ data: any; error: any }> {
  try {
    // First check if the role is exclusive - try both column cases
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('"isExclusive", isexclusive')
      .eq('id', roleId)
      .single();
    
    if (roleError) {
      throw roleError;
    }
    
    // Use whichever field exists
    const isExclusive = roleData.isExclusive !== undefined ? roleData.isExclusive : roleData.isexclusive;
    
    // If the role is exclusive, begin a transaction to remove it from any other users
    if (isExclusive) {
      // Remove this role from any other pilots
      const { error: removeError } = await supabase
        .from('pilot_roles')
        .delete()
        .eq('role_id', roleId);
        
      if (removeError) {
        throw removeError;
      }
    }
    
    // Now assign the role to the specified pilot
    const { data, error } = await supabase
      .from('pilot_roles')
      .insert({ pilot_id: pilotId, role_id: roleId })
      .select()
      .single();
      
    return { data, error };
  } catch (e) {
    console.error('Error in assignRoleToPilot:', e);
    return { data: null, error: e };
  }
}

/**
 * Remove a role from a pilot
 */
export async function removeRoleFromPilot(pilotId: string, roleId: string): Promise<{ success: boolean; error: any }> {
  const { error } = await supabase
    .from('pilot_roles')
    .delete()
    .eq('pilot_id', pilotId)
    .eq('role_id', roleId);
    
  return { success: !error, error };
}

/**
 * Get all roles assigned to a pilot
 */
export async function getPilotRoles(pilotId: string): Promise<{ data: Role[] | null; error: any }> {
  try {
    // First get all role_ids for this pilot in a separate query
    const { data: pilotRoleData, error: pilotRoleError } = await supabase
      .from('pilot_roles')
      .select('role_id')
      .eq('pilot_id', pilotId);
      
    if (pilotRoleError || !pilotRoleData || pilotRoleData.length === 0) {
      return { data: [], error: pilotRoleError };
    }
    
    const roleIds = pilotRoleData.map(record => record.role_id);
    
    // Use a separate query to get role details, avoiding problematic type casting
    const { data: roles, error: rolesError } = await supabase
      .from('roles')
      .select('id, name, "isExclusive", compatible_statuses, order, created_at')
      .in('id', roleIds)
      .order('order', { ascending: true });
      
    if (rolesError) {
      // Try with lowercase field name as a fallback
      const { data: rolesAlt, error: rolesErrorAlt } = await supabase
        .from('roles')
        .select('id, name, isexclusive as "isExclusive", compatible_statuses, order, created_at')
        .in('id', roleIds)
        .order('order', { ascending: true });
        
      if (rolesErrorAlt) {
        throw rolesErrorAlt;
      }
      
      return { data: rolesAlt, error: null };
    }
      
    return { data: roles, error: null };
  } catch (e) {
    console.error('Error in getPilotRoles:', e);
    return { data: null, error: e };
  }
}

/**
 * Initialize default roles if none exist
 */
export async function initializeDefaultRoles(): Promise<void> {
  // Check if statuses exist first to get their IDs
  const { data: statuses, error: statusError } = await supabase
    .from('statuses')
    .select('id, name');
  
  if (statusError) {
    console.error('Error checking statuses:', statusError);
    return;
  }
  
  // Create a map of status names to IDs
  const statusMap: Record<string, string> = {};
  statuses.forEach(status => {
    statusMap[status.name] = status.id;
  });
  
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
    // Default roles with appropriate status compatibility
    const defaultRoles = [
      { 
        name: 'CO', 
        isExclusive: true, 
        isexclusive: true, // Include both cases to be safe
        compatible_statuses: [statusMap['Command']], 
        order: 10 
      },
      { 
        name: 'XO', 
        isExclusive: true, 
        isexclusive: true,
        compatible_statuses: [statusMap['Command']], 
        order: 20 
      },
      { 
        name: 'OPSO', 
        isExclusive: true, 
        isexclusive: true,
        compatible_statuses: [statusMap['Command']], 
        order: 30 
      },
      { 
        name: 'Admin OIC', 
        isExclusive: true, 
        isexclusive: true,
        compatible_statuses: [statusMap['Staff']], 
        order: 40 
      },
      { 
        name: 'Intel OIC', 
        isExclusive: true, 
        isexclusive: true,
        compatible_statuses: [statusMap['Staff']], 
        order: 50 
      },
      { 
        name: 'Train OIC', 
        isExclusive: true, 
        isexclusive: true,
        compatible_statuses: [statusMap['Staff']], 
        order: 60 
      },
      { 
        name: 'DS Admin', 
        isExclusive: true, 
        isexclusive: true,
        compatible_statuses: [statusMap['Staff']], 
        order: 70 
      },
      { 
        name: 'Instructor', 
        isExclusive: false, 
        isexclusive: false,
        compatible_statuses: [statusMap['Command'], statusMap['Staff'], statusMap['Cadre']], 
        order: 80 
      },
      { 
        name: 'LSO', 
        isExclusive: false,
        isexclusive: false, 
        compatible_statuses: [statusMap['Command'], statusMap['Staff'], statusMap['Cadre'], statusMap['Provisional']], 
        order: 90 
      }
    ];

    await supabase.from('roles').insert(defaultRoles);
    console.log('Default roles initialized');
  } catch (error) {
    console.error('Failed to initialize default roles:', error);
  }
}