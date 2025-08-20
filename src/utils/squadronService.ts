import { supabase } from './supabaseClient';
export interface Squadron {
  id: string;
  name: string;
  designation: string;
  wing_id: string;
  tail_code?: string | null;
  established_date?: string | null;
  deactivated_date?: string | null;
  insignia_url?: string | null;
  carrier_id?: string | null;
  callsigns?: any;
  updated_at?: string | null;
}

/**
 * Fetch all squadrons from the database
 */
export async function getAllSquadrons(): Promise<{ data: Squadron[] | null; error: any }> {
  console.log('🔍 Fetching all squadrons...');
  
  try {
    const { data, error } = await supabase
      .from('org_squadrons')
      .select('*')
      .order('designation', { ascending: true });

    if (error) {
      console.error('❌ Error fetching squadrons:', error);
      return { data: null, error };
    }

    console.log('✅ Fetched squadrons:', data?.length);
    return { data, error: null };

  } catch (error) {
    console.error('❌ Unexpected error in getAllSquadrons:', error);
    return { data: null, error };
  }
}

/**
 * Get a pilot's current squadron assignment
 */
export async function getPilotSquadronAssignment(pilotId: string): Promise<{ 
  data: { squadron: Squadron; assignment: any } | null; 
  error: any 
}> {
  console.log('🔍 Fetching pilot squadron assignment for:', pilotId);
  
  try {
    // Get the pilot's current active squadron assignment
    const { data: assignment, error: assignmentError } = await supabase
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
          updated_at
        )
      `)
      .eq('pilot_id', pilotId)
      .is('end_date', null) // Only active assignments
      .single();

    if (assignmentError) {
      // If no assignment found, return null (pilot is unassigned)
      if (assignmentError.code === 'PGRST116') {
        return { data: null, error: null };
      }
      console.error('❌ Error fetching pilot squadron assignment:', assignmentError);
      return { data: null, error: assignmentError };
    }

    if (!assignment || !assignment.org_squadrons) {
      return { data: null, error: null };
    }

    console.log('✅ Found squadron assignment for pilot:', assignment.org_squadrons.designation);
    return { 
      data: {
        squadron: assignment.org_squadrons,
        assignment
      }, 
      error: null 
    };

  } catch (error) {
    console.error('❌ Unexpected error in getPilotSquadronAssignment:', error);
    return { data: null, error };
  }
}

/**
 * Assign a pilot to a squadron
 */
export async function assignPilotToSquadron(
  pilotId: string,
  squadronId: string | null,
  startDate: string = new Date().toISOString().split('T')[0]
): Promise<{ success: boolean; error: any }> {
  console.log('🔄 Assigning pilot to squadron:', { pilotId, squadronId, startDate });
  
  try {
    // End any existing active squadron assignments for this pilot
    const { error: endExistingError } = await supabase
      .from('pilot_assignments')
      .update({ 
        end_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
      })
      .eq('pilot_id', pilotId)
      .is('end_date', null);
    
    if (endExistingError) {
      console.error('❌ Error ending existing assignments:', endExistingError);
      return { success: false, error: endExistingError };
    }

    // If squadronId is provided, create new assignment
    if (squadronId) {
      const { error: insertError } = await supabase
        .from('pilot_assignments')
        .insert({
          pilot_id: pilotId,
          squadron_id: squadronId,
          start_date: startDate
          // end_date defaults to NULL for active assignment
        });
      
      if (insertError) {
        console.error('❌ Error creating new assignment:', insertError);
        return { success: false, error: insertError };
      }

      console.log('✅ Successfully assigned pilot to squadron');
    } else {
      console.log('✅ Successfully removed pilot from squadron (unassigned)');
    }
    
    return { success: true, error: null };

  } catch (error) {
    console.error('❌ Unexpected error in assignPilotToSquadron:', error);
    return { success: false, error };
  }
}

/**
 * Get all pilots assigned to a squadron
 */
export async function getPilotsBySquadron(squadronId: string): Promise<{ 
  data: Array<{ pilot: any; assignment: any }> | null; 
  error: any 
}> {
  console.log('🔍 Fetching pilots for squadron:', squadronId);
  
  try {
    const { data: assignments, error } = await supabase
      .from('pilot_assignments')
      .select(`
        *,
        pilots (
          id,
          callsign,
          boardNumber,
          discordId,
          created_at,
          updated_at
        )
      `)
      .eq('squadron_id', squadronId)
      .is('end_date', null) // Only active assignments
      .order('start_date', { ascending: false });

    if (error) {
      console.error('❌ Error fetching squadron pilots:', error);
      return { data: null, error };
    }

    const result = (assignments || []).map(assignment => ({
      pilot: assignment.pilots,
      assignment
    }));

    console.log('✅ Found pilots for squadron:', result.length);
    return { data: result, error: null };

  } catch (error) {
    console.error('❌ Unexpected error in getPilotsBySquadron:', error);
    return { data: null, error };
  }
}