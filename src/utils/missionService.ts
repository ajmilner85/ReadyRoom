import { supabase, sb } from './supabaseClient';
import type { 
  Mission, 
  CreateMissionRequest, 
  UpdateMissionRequest,
  MissionResponse,
  MissionsListResponse,
  MissionStatus,
  FlightImportFilter
} from '../types/MissionTypes';
import type { Database } from '../types/supabase';

type MissionRow = Database['public']['Tables']['missions']['Row'];
type MissionInsert = Database['public']['Tables']['missions']['Insert'];
type MissionUpdate = Database['public']['Tables']['missions']['Update'];

// Helper function to convert database row to Mission interface
const convertRowToMission = (row: MissionRow): Mission => {
  return {
    id: row.id,
    event_id: row.event_id || undefined,
    name: row.name,
    description: row.description || undefined,
    status: row.status as MissionStatus,
    created_by: row.created_by || undefined,
    updated_by: row.updated_by || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    selected_squadrons: Array.isArray(row.selected_squadrons) 
      ? row.selected_squadrons as string[]
      : [],
    flight_import_filter: row.flight_import_filter as FlightImportFilter,
    miz_file_data: typeof row.miz_file_data === 'object' && row.miz_file_data 
      ? row.miz_file_data as any 
      : {},
    flights: Array.isArray(row.flights) 
      ? row.flights as any[]
      : [],
    pilot_assignments: typeof row.pilot_assignments === 'object' && row.pilot_assignments
      ? row.pilot_assignments as Record<string, any[]>
      : {},
    support_role_assignments: Array.isArray(row.support_role_assignments)
      ? row.support_role_assignments as any[]
      : [],
    mission_settings: typeof row.mission_settings === 'object' && row.mission_settings
      ? row.mission_settings as any
      : {}
  };
};


// Get current user's profile ID for foreign key references
const getCurrentUserProfileId = async (): Promise<string | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    console.error('No authenticated user found');
    return null;
  }

  // Get the user_profiles.id (not auth_user_id) since that's what the FK constraint references
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, pilot_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Error getting user profile:', error);
    console.error('Auth user ID:', user.id);
    return null;
  }

  if (!data) {
    console.error('No user profile found for auth user:', user.id);
    return null;
  }

  console.log('User profile found:', {
    profileId: data.id,
    pilotId: data.pilot_id,
    authUserId: user.id
  });

  return data.id || null;
};

/**
 * Create a new mission
 */
export const createMission = async (
  missionData: CreateMissionRequest
): Promise<MissionResponse> => {
  return await sb(async (supabase) => {
    const userId = await getCurrentUserProfileId();
    
    const insertData: MissionInsert = {
      name: missionData.name,
      description: missionData.description || null,
      event_id: missionData.event_id || null,
      selected_squadrons: missionData.selected_squadrons || [],
      flight_import_filter: missionData.flight_import_filter || 'all',
      created_by: userId,
      updated_by: userId,
      status: 'planning',
      flights: [],
      pilot_assignments: {},
      support_role_assignments: [],
      miz_file_data: {},
      mission_settings: {}
    };

    const { data, error } = await supabase
      .from('missions')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error creating mission:', error);
      return { mission: {} as Mission, error: error.message };
    }

    return { 
      mission: convertRowToMission(data),
      error: undefined 
    };
  });
};

/**
 * Get mission by ID
 */
export const getMissionById = async (missionId: string): Promise<MissionResponse> => {
  return await sb(async (supabase) => {
    const { data, error } = await supabase
      .from('missions')
      .select(`
        *,
        event:events!missions_event_id_fkey(*)
      `)
      .eq('id', missionId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching mission:', error);
      return { mission: {} as Mission, error: error.message };
    }

    if (!data) {
      // No mission found with this ID
      return { mission: null as any, error: 'Mission not found' };
    }

    const mission = convertRowToMission(data);
    if (data.event) {
      mission.event = {
        id: data.event.id,
        title: data.event.name,
        description: data.event.description,
        datetime: data.event.start_datetime,
        endDatetime: data.event.end_datetime,
        status: data.event.status,
        eventType: data.event.event_type as any || undefined,
        cycleId: data.event.cycle_id || undefined,
        creator: {
          boardNumber: data.event.creator_board_number || '',
          callsign: data.event.creator_call_sign || '',
          billet: data.event.creator_billet || ''
        },
        attendance: { accepted: [], declined: [], tentative: [] }
      };
    }

    return { mission, error: undefined };
  });
};

/**
 * Get mission by event ID
 */
export const getMissionByEventId = async (eventId: string): Promise<MissionResponse> => {
  return await sb(async (supabase) => {
    const { data, error } = await supabase
      .from('missions')
      .select(`
        *,
        event:events!missions_event_id_fkey(*)
      `)
      .eq('event_id', eventId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching mission by event ID:', error);
      return { mission: {} as Mission, error: error.message };
    }

    if (!data) {
      // No mission found for this event - this is normal, not an error
      return { mission: null as any, error: undefined };
    }

    const mission = convertRowToMission(data);
    if (data.event) {
      mission.event = {
        id: data.event.id,
        title: data.event.name,
        description: data.event.description,
        datetime: data.event.start_datetime,
        endDatetime: data.event.end_datetime,
        status: data.event.status,
        eventType: data.event.event_type as any || undefined,
        cycleId: data.event.cycle_id || undefined,
        creator: {
          boardNumber: data.event.creator_board_number || '',
          callsign: data.event.creator_call_sign || '',
          billet: data.event.creator_billet || ''
        },
        attendance: { accepted: [], declined: [], tentative: [] }
      };
    }

    return { mission, error: undefined };
  });
};

/**
 * Update mission
 */
export const updateMission = async (
  missionId: string,
  missionData: UpdateMissionRequest
): Promise<MissionResponse> => {
  return await sb(async (supabase) => {
    const userId = await getCurrentUserProfileId();
    
    const updateData: MissionUpdate = {
      ...missionData,
      flights: missionData.flights ? missionData.flights as any : undefined,
      pilot_assignments: missionData.pilot_assignments ? missionData.pilot_assignments as any : undefined,
      support_role_assignments: missionData.support_role_assignments ? missionData.support_role_assignments as any : undefined,
      updated_by: userId,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('missions')
      .update(updateData)
      .eq('id', missionId)
      .select()
      .single();

    if (error) {
      console.error('Error updating mission:', error);
      console.error('Update data keys:', Object.keys(updateData));
      console.error('Mission ID:', missionId);
      console.error('User ID:', userId);

      // If this is an RLS error (PGRST116 = no rows returned), clear permission cache
      if (error.code === 'PGRST116') {
        console.warn('Mission update blocked by RLS - clearing permission cache');
        try {
          await supabase.rpc('clear_user_permission_cache' as any);
        } catch (cacheError) {
          console.error('Failed to clear permission cache:', cacheError);
        }
      }

      return { mission: {} as Mission, error: error.message };
    }

    return { 
      mission: convertRowToMission(data),
      error: undefined 
    };
  });
};

/**
 * Delete mission
 */
export const deleteMission = async (missionId: string): Promise<{ error?: string }> => {
  return await sb(async (supabase) => {
    const { error } = await supabase
      .from('missions')
      .delete()
      .eq('id', missionId);

    if (error) {
      console.error('Error deleting mission:', error);
      return { error: error.message };
    }

    return { error: undefined };
  });
};

/**
 * Link mission to event
 */
export const linkMissionToEvent = async (
  missionId: string,
  eventId: string
): Promise<MissionResponse> => {
  return await sb(async (supabase) => {
    const userId = await getCurrentUserProfileId();
    
    // First update the mission to link to the event
    const { data: missionData, error: missionError } = await supabase
      .from('missions')
      .update({
        event_id: eventId,
        updated_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', missionId)
      .select()
      .single();

    if (missionError) {
      console.error('Error linking mission to event:', missionError);
      return { mission: {} as Mission, error: missionError.message };
    }

    // Also update the event to link back to the mission
    const { error: eventError } = await supabase
      .from('events')
      .update({ mission_id: missionId })
      .eq('id', eventId);

    if (eventError) {
      console.error('Error linking event to mission:', eventError);
      // Continue anyway since mission was updated successfully
    }

    return { 
      mission: convertRowToMission(missionData),
      error: undefined 
    };
  });
};

/**
 * Unlink mission from event
 */
export const unlinkMissionFromEvent = async (
  missionId: string
): Promise<MissionResponse> => {
  return await sb(async (supabase) => {
    const userId = await getCurrentUserProfileId();
    
    // Get the current mission to find the linked event
    const { data: currentMission } = await supabase
      .from('missions')
      .select('event_id')
      .eq('id', missionId)
      .single();

    // Update the mission to unlink from the event
    const { data: missionData, error: missionError } = await supabase
      .from('missions')
      .update({
        event_id: null,
        updated_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', missionId)
      .select()
      .single();

    if (missionError) {
      console.error('Error unlinking mission from event:', missionError);
      return { mission: {} as Mission, error: missionError.message };
    }

    // Also unlink the event from the mission
    if (currentMission?.event_id) {
      const { error: eventError } = await supabase
        .from('events')
        .update({ mission_id: null })
        .eq('id', currentMission.event_id);

      if (eventError) {
        console.error('Error unlinking event from mission:', eventError);
        // Continue anyway since mission was updated successfully
      }
    }

    return { 
      mission: convertRowToMission(missionData),
      error: undefined 
    };
  });
};

/**
 * Get all missions (optionally filtered)
 */
export const getMissions = async (params?: {
  status?: MissionStatus;
  eventId?: string;
  limit?: number;
  offset?: number;
}): Promise<MissionsListResponse> => {
  return await sb(async (supabase) => {
    let query = supabase
      .from('missions')
      .select(`
        *,
        event:events!missions_event_id_fkey(*)
      `, { count: 'exact' });

    if (params?.status) {
      query = query.eq('status', params.status);
    }

    if (params?.eventId) {
      query = query.eq('event_id', params.eventId);
    }

    if (params?.limit) {
      query = query.limit(params.limit);
    }

    if (params?.offset) {
      query = query.range(params.offset, (params.offset + (params.limit || 10)) - 1);
    }

    // Order by updated_at descending
    query = query.order('updated_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching missions:', error);
      return { missions: [], total: 0, error: error.message };
    }

    const missions = data.map(row => {
      const mission = convertRowToMission(row);
      if (row.event) {
        mission.event = {
          id: row.event.id,
          title: row.event.name,
          description: row.event.description,
          datetime: row.event.start_datetime,
          endDatetime: row.event.end_datetime,
          status: row.event.status,
          eventType: row.event.event_type as any || undefined,
          cycleId: row.event.cycle_id || undefined,
          creator: {
            boardNumber: row.event.creator_board_number || '',
            callsign: row.event.creator_call_sign || '',
            billet: row.event.creator_billet || ''
          },
          attendance: { accepted: [], declined: [], tentative: [] }
        };
      }
      return mission;
    });

    return { 
      missions, 
      total: count || 0,
      error: undefined 
    };
  });
};