import { supabase } from './supabaseClient';

/**
 * Interface for pilot status assignment
 */
export interface PilotStatusAssignment {
  id: string;
  pilot_id: string;
  status_id: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

/**
 * Interface for pilot standing assignment
 */
export interface PilotStandingAssignment {
  id: string;
  pilot_id: string;
  standing_id: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

/**
 * Assign a status to a pilot (creates new assignment and ends previous active ones)
 */
export async function assignPilotStatus(
  pilotId: string,
  statusId: string,
  startDate?: string
): Promise<{ data: PilotStatusAssignment | null; error: any }> {
  try {
    // Verify pilot exists in database before attempting status assignment
    console.log('🔍 Verifying pilot exists for status assignment:', pilotId);
    const { data: pilotVerification, error: pilotVerifyError } = await supabase
      .from('pilots')
      .select('id')
      .eq('id', pilotId)
      .single();

    if (pilotVerifyError || !pilotVerification) {
      console.error('❌ Pilot not found in database for status assignment:', pilotVerifyError);
      return { data: null, error: { message: 'Pilot not found in database', details: pilotVerifyError } };
    }

    console.log('✅ Pilot verified in database for status assignment');

    const today = new Date().toISOString().split('T')[0];
    const effectiveStartDate = startDate || today;

    // End any currently active status assignments for this pilot
    const { error: endError } = await supabase
      .from('pilot_statuses')
      .update({ end_date: effectiveStartDate })
      .eq('pilot_id', pilotId)
      .is('end_date', null);

    if (endError) {
      return { data: null, error: endError };
    }

    // Create new status assignment with retry logic
    let insertError = null;
    let insertData = null;
    let retries = 3;
    
    while (retries > 0) {
      const { data, error } = await supabase
        .from('pilot_statuses')
        .insert({
          pilot_id: pilotId,
          status_id: statusId,
          start_date: effectiveStartDate,
          end_date: null
        })
        .select()
        .single();
      
      if (!error) {
        insertData = data;
        insertError = null;
        break;
      }
      
      insertError = error;
      retries--;
      
      if (retries > 0) {
        console.log(`❌ Status assignment failed, retrying (${retries} attempts left):`, error);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return { data: insertData, error: insertError };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Assign a standing to a pilot (replaces existing standing due to unique constraint)
 */
export async function assignPilotStanding(
  pilotId: string,
  standingId: string,
  startDate?: string
): Promise<{ data: PilotStandingAssignment | null; error: any }> {
  try {
    // Verify pilot exists in database before attempting standing assignment
    console.log('🔍 Verifying pilot exists for standing assignment:', pilotId);
    const { data: pilotVerification, error: pilotVerifyError } = await supabase
      .from('pilots')
      .select('id')
      .eq('id', pilotId)
      .single();

    if (pilotVerifyError || !pilotVerification) {
      console.error('❌ Pilot not found in database for standing assignment:', pilotVerifyError);
      return { data: null, error: { message: 'Pilot not found in database', details: pilotVerifyError } };
    }

    console.log('✅ Pilot verified in database for standing assignment');

    const today = new Date().toISOString().split('T')[0];
    const effectiveStartDate = startDate || today;

    // End any currently active standing assignments for this pilot
    const { error: endError } = await supabase
      .from('pilot_standings')
      .update({ end_date: effectiveStartDate })
      .eq('pilot_id', pilotId)
      .is('end_date', null);

    if (endError) {
      return { data: null, error: endError };
    }

    // Create new standing assignment with retry logic
    let insertError = null;
    let insertData = null;
    let retries = 3;
    
    while (retries > 0) {
      const { data, error } = await supabase
        .from('pilot_standings')
        .insert({
          pilot_id: pilotId,
          standing_id: standingId,
          start_date: effectiveStartDate,
          end_date: null
        })
        .select()
        .single();
      
      if (!error) {
        insertData = data;
        insertError = null;
        break;
      }
      
      insertError = error;
      retries--;
      
      if (retries > 0) {
        console.log(`❌ Standing assignment failed, retrying (${retries} attempts left):`, error);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return { data: insertData, error: insertError };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Get a pilot's current status assignment
 */
export async function getPilotCurrentStatus(
  pilotId: string
): Promise<{ data: { status: any; assignment: PilotStatusAssignment } | null; error: any }> {
  try {
    const { data, error } = await supabase
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
      .eq('pilot_id', pilotId)
      .is('end_date', null)
      .order('start_date', { ascending: false })
      .limit(1);

    if (error) {
      return { data: null, error };
    }

    if (!data || data.length === 0) {
      return { data: null, error: null };
    }

    const assignment = data[0];
    return {
      data: {
        status: assignment.statuses,
        assignment: assignment
      },
      error: null
    };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Get a pilot's current standing assignment
 */
export async function getPilotCurrentStanding(
  pilotId: string
): Promise<{ data: { standing: any; assignment: PilotStandingAssignment } | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('pilot_standings')
      .select(`
        *,
        standings:standing_id (
          id,
          name,
          order
        )
      `)
      .eq('pilot_id', pilotId)
      .is('end_date', null)
      .limit(1);

    if (error) {
      return { data: null, error };
    }

    if (!data || data.length === 0) {
      return { data: null, error: null };
    }

    const assignment = data[0];
    return {
      data: {
        standing: assignment.standings,
        assignment: assignment
      },
      error: null
    };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Get all pilots with their current status and standing
 */
export async function getAllPilotsWithStatusAndStanding(): Promise<{
  data: Array<{
    pilot: any;
    status: any | null;
    standing: any | null;
  }> | null;
  error: any;
}> {
  try {
    // Get all pilots
    const { data: pilots, error: pilotsError } = await supabase
      .from('pilots')
      .select('*')
      .order('boardNumber');

    if (pilotsError || !pilots) {
      return { data: null, error: pilotsError };
    }

    // Get current status for each pilot
    const pilotsWithData = await Promise.all(
      pilots.map(async (pilot) => {
        const [statusResult, standingResult] = await Promise.all([
          getPilotCurrentStatus(pilot.id),
          getPilotCurrentStanding(pilot.id)
        ]);

        return {
          pilot,
          status: statusResult.data?.status || null,
          standing: standingResult.data?.standing || null
        };
      })
    );

    return { data: pilotsWithData, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Remove a pilot's current status assignment (end it)
 */
export async function removePilotStatus(pilotId: string): Promise<{ success: boolean; error: any }> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { error } = await supabase
      .from('pilot_statuses')
      .update({ end_date: today })
      .eq('pilot_id', pilotId)
      .is('end_date', null);

    return { success: !error, error };
  } catch (error) {
    return { success: false, error };
  }
}

/**
 * Remove a pilot's current standing assignment (end it)
 */
export async function removePilotStanding(pilotId: string): Promise<{ success: boolean; error: any }> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { error } = await supabase
      .from('pilot_standings')
      .update({ end_date: today })
      .eq('pilot_id', pilotId)
      .is('end_date', null);

    return { success: !error, error };
  } catch (error) {
    return { success: false, error };
  }
}
