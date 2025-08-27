import { supabase } from './supabaseClient';
import {
  Command,
  Group,
  Wing,
  Squadron,
  NewCommand,
  NewGroup,
  NewWing,
  NewSquadron,
  UpdateCommand,
  UpdateGroup,
  UpdateWing,
  UpdateSquadron
} from '../types/OrganizationTypes';

// ===============================
// COMMAND OPERATIONS
// ===============================

export async function getAllCommands(): Promise<{ data: Command[] | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('org_commands')
      .select('*')
      .order('name', { ascending: true });

    return { data, error };
  } catch (error) {
    console.error('Error fetching commands:', error);
    return { data: null, error };
  }
}

export async function createCommand(command: NewCommand): Promise<{ data: Command | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('org_commands')
      .insert(command)
      .select()
      .single();

    return { data, error };
  } catch (error) {
    console.error('Error creating command:', error);
    return { data: null, error };
  }
}

export async function updateCommand(id: string, updates: UpdateCommand): Promise<{ data: Command | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('org_commands')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    return { data, error };
  } catch (error) {
    console.error('Error updating command:', error);
    return { data: null, error };
  }
}

export async function deleteCommand(id: string): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('org_commands')
      .delete()
      .eq('id', id);

    return { success: !error, error };
  } catch (error) {
    console.error('Error deleting command:', error);
    return { success: false, error };
  }
}

// ===============================
// GROUP OPERATIONS
// ===============================

export async function getAllGroups(): Promise<{ data: Group[] | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('org_groups')
      .select(`
        *,
        command:command_id (
          id,
          name,
          established_date,
          deactivated_date,
          insignia_url
        )
      `)
      .order('name', { ascending: true });

    return { data: data as Group[] | null, error };
  } catch (error) {
    console.error('Error fetching groups:', error);
    return { data: null, error };
  }
}

export async function createGroup(group: NewGroup): Promise<{ data: Group | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('org_groups')
      .insert(group)
      .select(`
        *,
        command:command_id (
          id,
          name,
          established_date,
          deactivated_date,
          insignia_url
        )
      `)
      .single();

    return { data: data as Group | null, error };
  } catch (error) {
    console.error('Error creating group:', error);
    return { data: null, error };
  }
}

export async function updateGroup(id: string, updates: UpdateGroup): Promise<{ data: Group | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('org_groups')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(`
        *,
        command:command_id (
          id,
          name,
          established_date,
          deactivated_date,
          insignia_url
        )
      `)
      .single();

    return { data: data as Group | null, error };
  } catch (error) {
    console.error('Error updating group:', error);
    return { data: null, error };
  }
}

export async function deleteGroup(id: string): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('org_groups')
      .delete()
      .eq('id', id);

    return { success: !error, error };
  } catch (error) {
    console.error('Error deleting group:', error);
    return { success: false, error };
  }
}

// ===============================
// WING OPERATIONS
// ===============================

export async function getAllWings(): Promise<{ data: Wing[] | null; error: any }> {
  try {
    console.log('Starting getAllWings query...');
    
    // First try a simple query to see if the table exists and has data
    const { data: simpleData, error: simpleError } = await supabase
      .from('org_wings')
      .select('*')
      .limit(1000);  // Add explicit limit to bypass potential RLS issues
    
    console.log('Simple wings query result:', { data: simpleData, error: simpleError });
    
    // Test if we can query commands table for comparison
    const { data: commandsTest, error: commandsError } = await supabase
      .from('org_commands')
      .select('*');
    console.log('Commands test query:', { data: commandsTest, error: commandsError });
    
    // Test Supabase connection
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    console.log('Supabase session check:', { session: session?.user?.id || null, error: sessionError });
    
    // Try a direct query with specific ID we know exists
    if (simpleData?.length === 0) {
      console.log('Trying direct query for known wing ID...');
      const { data: directData, error: directError } = await supabase
        .from('org_wings')
        .select('*')
        .eq('id', 'c431a4e5-b482-46cd-8c4a-789de40fd2e0');
      console.log('Direct wing query result:', { data: directData, error: directError });
    }
    
    // If simple query works, try the complex one
    if (!simpleError) {
      const { data, error } = await supabase
        .from('org_wings')
        .select(`
          *,
          group:group_id (
            id,
            name,
            established_date,
            deactivated_date,
            insignia_url,
            command:command_id (
              id,
              name
            )
          )
        `)
        .order('name', { ascending: true });

      console.log('Complex getAllWings query result:', { data, error });
      if (error) {
        console.error('Supabase error in complex getAllWings:', error);
      }
      return { data: data as Wing[] | null, error };
    } else {
      console.error('Simple query failed, returning error');
      return { data: null, error: simpleError };
    }
  } catch (error) {
    console.error('Exception in getAllWings:', error);
    return { data: null, error };
  }
}

export async function createWing(wing: NewWing): Promise<{ data: Wing | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('org_wings')
      .insert(wing)
      .select(`
        *,
        group:group_id (
          id,
          name,
          established_date,
          deactivated_date,
          insignia_url,
          command:command_id (
            id,
            name
          )
        )
      `)
      .single();

    return { data, error };
  } catch (error) {
    console.error('Error creating wing:', error);
    return { data: null, error };
  }
}

export async function updateWing(id: string, updates: UpdateWing): Promise<{ data: Wing | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('org_wings')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        group:group_id (
          id,
          name,
          established_date,
          deactivated_date,
          insignia_url,
          command:command_id (
            id,
            name
          )
        )
      `)
      .single();

    return { data, error };
  } catch (error) {
    console.error('Error updating wing:', error);
    return { data: null, error };
  }
}

export async function deleteWing(id: string): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('org_wings')
      .delete()
      .eq('id', id);

    return { success: !error, error };
  } catch (error) {
    console.error('Error deleting wing:', error);
    return { success: false, error };
  }
}

// ===============================
// SQUADRON OPERATIONS
// ===============================

export async function getAllSquadrons(): Promise<{ data: Squadron[] | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('org_squadrons')
      .select(`
        *,
        wing:wing_id (
          id,
          name,
          designation,
          established_date,
          deactivated_date,
          insignia_url,
          group:group_id (
            id,
            name,
            command:command_id (
              id,
              name
            )
          )
        )
      `)
      .order('name', { ascending: true });

    return { data, error };
  } catch (error) {
    console.error('Error fetching squadrons:', error);
    return { data: null, error };
  }
}

export async function createSquadron(squadron: NewSquadron): Promise<{ data: Squadron | null; error: any }> {
  try {
    console.log('Creating squadron with data:', squadron);
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.error('Squadron creation timed out after 10 seconds');
    }, 10000);
    
    // Try inserting with required fields only (based on NOT NULL constraints)
    const minimalSquadron = {
      name: squadron.name,           // NOT NULL
      designation: squadron.designation,  // NOT NULL  
      wing_id: squadron.wing_id,     // NOT NULL
      carrier_id: null               // Explicitly set to null to avoid FK constraint
    };
    
    console.log('Attempting insert with minimal data:', minimalSquadron);
    
    // Skip wing check for now and try direct insert
    console.log('Skipping wing check, attempting direct insert...');

    // Try the simplest possible insert first - without the complex select
    console.log('Attempting basic insert...');
    const { data, error } = await supabase
      .from('org_squadrons')
      .insert(minimalSquadron)
      .select('*')
      .abortSignal(controller.signal)
      .single();
      
    console.log('Basic insert result:', { data, error });
      
    clearTimeout(timeoutId);

    // If basic insert succeeded, try to get the full record with relations
    if (!error && data) {
      console.log('Basic insert succeeded, fetching full record...');
      
      const { data: fullData, error: fetchError } = await supabase
        .from('org_squadrons')
        .select(`
          *,
          wing:wing_id (
            id,
            name,
            designation,
            established_date,
            deactivated_date,
            insignia_url,
            group:group_id (
              id,
              name,
              command:command_id (
                id,
                name
              )
            )
          )
        `)
        .eq('id', data.id)
        .single();
        
      if (fetchError) {
        console.error('Failed to fetch full squadron data:', fetchError);
        // Return the basic data if relation fetch fails
        return { data, error: null };
      }
      
      // Try updating with complex fields
      if (squadron.callsigns || squadron.color_palette || squadron.discord_integration) {
        console.log('Updating with complex fields...');
        const updateData = {};
        if (squadron.callsigns) updateData.callsigns = squadron.callsigns;
        if (squadron.color_palette) updateData.color_palette = squadron.color_palette;
        if (squadron.discord_integration) updateData.discord_integration = squadron.discord_integration;
        
        const { error: updateError } = await supabase
          .from('org_squadrons')
          .update(updateData)
          .eq('id', data.id);
          
        if (updateError) {
          console.error('Complex fields update failed:', updateError);
        } else {
          console.log('Complex fields updated successfully');
        }
      }
      
      return { data: fullData, error: null };
    }

    if (error) {
      console.error('Supabase error creating squadron:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
    } else {
      console.log('Squadron created successfully:', data);
    }

    return { data, error };
  } catch (error) {
    console.error('Unexpected error creating squadron:', error);
    if (error.name === 'AbortError') {
      return { data: null, error: { message: 'Squadron creation timed out' } };
    }
    return { data: null, error };
  }
}

export async function updateSquadron(id: string, updates: UpdateSquadron): Promise<{ data: Squadron | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('org_squadrons')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(`
        *,
        wing:wing_id (
          id,
          name,
          designation,
          established_date,
          deactivated_date,
          insignia_url,
          group:group_id (
            id,
            name,
            command:command_id (
              id,
              name
            )
          )
        )
      `)
      .single();

    return { data, error };
  } catch (error) {
    console.error('Error updating squadron:', error);
    return { data: null, error };
  }
}

export async function deleteSquadron(id: string): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('org_squadrons')
      .delete()
      .eq('id', id);

    return { success: !error, error };
  } catch (error) {
    console.error('Error deleting squadron:', error);
    return { success: false, error };
  }
}

// ===============================
// UTILITY FUNCTIONS
// ===============================

/**
 * Check if an entity is active (not deactivated)
 */
export function isEntityActive(entity: { deactivated_date: string | null }): boolean {
  return !entity.deactivated_date || new Date(entity.deactivated_date) > new Date();
}

/**
 * Get hierarchy path for display (e.g., "Command > Group > Wing")
 */
export function getHierarchyPath(entity: Wing | Squadron | Group): string {
  const path: string[] = [];
  
  if ('wing' in entity && entity.wing) {
    if (entity.wing.group?.command) {
      path.push(entity.wing.group.command.name);
    }
    if (entity.wing.group) {
      path.push(entity.wing.group.name);
    }
    path.push(entity.wing.name);
  } else if ('group' in entity && entity.group) {
    if (entity.group.command) {
      path.push(entity.group.command.name);
    }
    path.push(entity.group.name);
  } else if ('command' in entity && entity.command) {
    path.push(entity.command.name);
  }
  
  return path.join(' > ');
}