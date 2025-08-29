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
  color_palette?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  } | null;
  updated_at?: string | null;
}

/**
 * Fetch all squadrons from the database
 */
export async function getAllSquadrons(): Promise<{ data: Squadron[] | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('org_squadrons')
      .select('*')
      .order('designation', { ascending: true });

    if (error) {
      console.error('❌ Error fetching squadrons:', error);
      return { data: null, error };
    }

    return { data: data as Squadron[], error: null };

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
  console.log('🔄 Squadron ID type:', typeof squadronId, 'Value:', squadronId);
  
  try {
    // Step 1: Verify pilot exists in database before attempting assignment
    console.log('🔍 Verifying pilot exists:', pilotId);
    const { data: pilotVerification, error: pilotVerifyError } = await supabase
      .from('pilots')
      .select('id')
      .eq('id', pilotId)
      .single();

    if (pilotVerifyError || !pilotVerification) {
      console.error('❌ Pilot not found in database:', pilotVerifyError);
      return { success: false, error: { message: 'Pilot not found in database', details: pilotVerifyError } };
    }

    console.log('✅ Pilot verified in database');

    // Step 2: End any existing active squadron assignments for this pilot
    console.log('🔄 Ending existing assignments for pilot:', pilotId);
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

    // Step 3: If squadronId is provided, create new assignment with retry logic
    if (squadronId) {
      console.log('🔄 Creating new assignment for squadron:', squadronId);
      
      let insertError = null;
      let retries = 3;
      
      while (retries > 0) {
        const { error } = await supabase
          .from('pilot_assignments')
          .insert({
            pilot_id: pilotId,
            squadron_id: squadronId,
            start_date: startDate
            // end_date defaults to NULL for active assignment
          });
        
        if (!error) {
          insertError = null;
          break;
        }
        
        insertError = error;
        retries--;
        
        if (retries > 0) {
          console.log(`❌ Assignment failed, retrying (${retries} attempts left):`, error);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      if (insertError) {
        console.error('❌ Error creating new assignment after retries:', insertError);
        return { success: false, error: insertError };
      }

      console.log('✅ Successfully assigned pilot to squadron');
    } else {
      console.log('✅ Successfully removed pilot from squadron (unassigned) - no new assignment created');
    }
    
    // Verify the assignment was actually updated/removed
    const { data: verifyAssignments, error: verifyError } = await supabase
      .from('pilot_assignments')
      .select('id, pilot_id, squadron_id, end_date')
      .eq('pilot_id', pilotId)
      .order('created_at', { ascending: false })
      .limit(3);
    
    if (verifyError) {
      console.error('❌ Error verifying assignment:', verifyError);
    } else {
      console.log('🔍 Assignment verification for pilot', pilotId, ':', verifyAssignments);
      const activeAssignments = verifyAssignments?.filter(a => !a.end_date) || [];
      console.log('🔍 Active assignments:', activeAssignments);
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