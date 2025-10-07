import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';
import { Cycle, CycleType, Event, EventType } from '../types/EventTypes';

let client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (!client) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase URL and Anon Key must be provided in environment variables');
    }

    client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // multiTab: true, // leave default unless you intentionally want per-tab isolation
      },
    });
  }
  return client;
}

// Resilient wrapper function (duplicated from sb.ts to avoid circular dependency)
export async function sb<T>(fn: (c: SupabaseClient<Database>) => Promise<T>): Promise<T> {
  const supabase = getSupabase();
  // Removed proactive session check - Supabase handles auth automatically
  
  try {
    return await fn(supabase);
  } catch (err: any) {
    const status = err?.status;
    const transient = err?.name === 'TypeError' || [408, 425, 429, 500, 502, 503, 504].includes(status);
    const authy = [401, 403].includes(status);

    if (transient) {
      await new Promise(r => setTimeout(r, 300)); // tiny backoff
      return await fn(supabase);
    }
    if (authy) {
      await supabase.auth.refreshSession().catch(() => {});
      return await fn(supabase);
    }
    throw err;
  }
}

// Maintain backward compatibility
export const supabase = getSupabase();

// Real-time subscriptions helper
export const subscribeToTable = (
  tableName: string, 
  callback: (payload: any) => void
) => {
  const supabase = getSupabase();
  return supabase
    .channel(`${tableName}-changes`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: tableName },
      callback
    )
    .subscribe();
};

// Authentication helpers
export const signUp = async (email: string, password: string) => {
  return await sb(async (supabase) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { data, error };
  });
};

export const signIn = async (email: string, password: string) => {
  return await sb(async (supabase) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  });
};

export const signInWithDiscord = async () => {
  return await sb(async (supabase) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        scopes: 'identify guilds',
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
    return { data, error };
  });
};

export const signOut = async () => {
  return await sb(async (supabase) => {
    const { error } = await supabase.auth.signOut();
    return { error };
  });
};

export const resetPassword = async (email: string) => {
  return await sb(async (supabase) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`
    });
    return { data, error };
  });
};

export const updatePassword = async (password: string) => {
  return await sb(async (supabase) => {
    const { data, error } = await supabase.auth.updateUser({
      password: password
    });
    return { data, error };
  });
};

export const getCurrentUser = async () => {
  try {
    return await sb(async (supabase) => {
      const { data: { user }, error } = await supabase.auth.getUser();
      return { user, error };
    });
  } catch (err: any) {
    console.error('Error in getCurrentUser:', err);
    return { user: null, error: err };
  }
};

export const onAuthStateChange = (callback: (event: string, session: any) => void) => {
  const supabase = getSupabase();
  return supabase.auth.onAuthStateChange(async (event, session) => {
    // Handle user profile creation/update on sign in
    if (event === 'SIGNED_IN' && session?.user) {
      // Use setTimeout to avoid race conditions as suggested in the GitHub forum post
      setTimeout(async () => {
        try {
          const { createOrUpdateUserProfile } = await import('./userProfileService');
          await createOrUpdateUserProfile(session.user);
        } catch (error) {
          console.error('Error creating/updating user profile:', error);
        }
      }, 100);
    }
    
    // Call the original callback
    callback(event, session);
  });
};

// Cycles API
export const fetchCycles = async (discordGuildId?: string) => {
  return await sb(async (supabase) => {
    let query = supabase
      .from('cycles')
      .select('*')
      .order('start_date', { ascending: false });

    // If a Discord guild ID is provided, filter cycles for that guild
    if (discordGuildId) {
      query = query.eq('discord_guild_id', discordGuildId);
    }

    const { data, error } = await query;

    if (error) {
      return { cycles: [], error };
    }


    // Transform database cycles to frontend format
    const cycles: Cycle[] = data.map(dbCycle => ({
      id: dbCycle.id,
      name: dbCycle.name,
      description: dbCycle.description || '',
      startDate: dbCycle.start_date,
      endDate: dbCycle.end_date,
      type: dbCycle.type as CycleType,
      status: dbCycle.status as 'active' | 'completed' | 'upcoming',
      restrictedTo: dbCycle.restricted_to || [],
      participants: Array.isArray(dbCycle.participants) ? dbCycle.participants as string[] : [], // Get participants from database
      discordGuildId: dbCycle.discord_guild_id || undefined,
      creator: {
        boardNumber: dbCycle.creator_board_number || '',
        callsign: dbCycle.creator_call_sign || '',
        billet: dbCycle.creator_billet || ''
      }
    }));

    return { cycles, error: null };
  });
};

export const createCycle = async (cycle: Omit<Cycle, 'id' | 'creator'> & { discordGuildId?: string }) => {
  const { user, error: userError } = await getCurrentUser();
  if (userError || !user) {
    return { cycle: null, error: userError || new Error('User not authenticated') };
  }
  // Map from frontend format to database format
  const { data, error } = await supabase
    .from('cycles')
    .insert({
      name: cycle.name,
      description: cycle.description,
      start_date: cycle.startDate,
      end_date: cycle.endDate,
      type: cycle.type,
      status: cycle.status,
      restricted_to: cycle.restrictedTo,
      participants: cycle.participants || [], // Store participants in database
      discord_guild_id: cycle.discordGuildId || '', // Add Discord guild ID with empty string fallback
      creator_id: user.id,
      // Optional user profile info
      creator_call_sign: user.user_metadata?.callsign,
      creator_board_number: user.user_metadata?.board_number,
      creator_billet: user.user_metadata?.billet
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating cycle:', error);
    return { cycle: null, error };
  }

  // Transform back to frontend format
  const newCycle: Cycle = {
    id: data.id,
    name: data.name,
    description: data.description || '',
    startDate: data.start_date,
    endDate: data.end_date,
    type: data.type as CycleType,
    status: data.status as 'active' | 'completed' | 'upcoming',
    restrictedTo: data.restricted_to || [],
    creator: {
      boardNumber: data.creator_board_number || '',
      callsign: data.creator_call_sign || '',
      billet: data.creator_billet || ''
    }
  };

  return { cycle: newCycle, error: null };
};

export const updateCycle = async (cycleId: string, updates: Partial<Omit<Cycle, 'id' | 'creator'>>) => {
  // Map from frontend format to database format
  const dbUpdates: any = {};
  
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
  if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
  if (updates.type !== undefined) dbUpdates.type = updates.type;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.restrictedTo !== undefined) dbUpdates.restricted_to = updates.restrictedTo;
  if (updates.participants !== undefined) dbUpdates.participants = updates.participants;

  // Debug: Check user permissions before update
  console.log('[DEBUG] Attempting to update cycle:', { cycleId, updates: dbUpdates });

  // Test if we can read the cycle first
  const { data: existingCycle, error: readError } = await supabase
    .from('cycles')
    .select('id, name, participants')
    .eq('id', cycleId)
    .single();

  console.log('[DEBUG] Can read cycle:', { existingCycle, readError });

  // Check user permissions via SQL function
  const { data: permTest, error: permError } = await supabase
    .rpc('user_can_manage_cycle', {
      user_auth_id: (await supabase.auth.getUser()).data.user?.id,
      cycle_participants: existingCycle?.participants || null
    });

  console.log('[DEBUG] Permission test result:', { permTest, permError });

  const { data, error } = await supabase
    .from('cycles')
    .update(dbUpdates)
    .eq('id', cycleId)
    .select()
    .single();

  console.log('[DEBUG] Update result:', { data, error, rowsAffected: data ? 1 : 0 });

  if (error) {
    console.error('Error updating cycle:', error);
    return { cycle: null, error };
  }

  // Transform to frontend format
  const updatedCycle: Cycle = {
    id: data.id,
    name: data.name,
    description: data.description || '',
    startDate: data.start_date,
    endDate: data.end_date,
    type: data.type as CycleType,
    status: data.status as 'active' | 'completed' | 'upcoming',
    restrictedTo: data.restricted_to || [],
    participants: Array.isArray(data.participants) ? data.participants as string[] : [], // Get participants from database
    discordGuildId: data.discord_guild_id || undefined,
    creator: {
      boardNumber: data.creator_board_number || '',
      callsign: data.creator_call_sign || '',
      billet: data.creator_billet || ''
    }
  };

  return { cycle: updatedCycle, error: null };
};

export const deleteCycle = async (cycleId: string) => {
  const { error } = await supabase
    .from('cycles')
    .delete()
    .eq('id', cycleId);

  return { error };
};

// Events API
export const fetchEvents = async (cycleId?: string) => {


  let query = supabase.from('events').select(`
    id,
    name,
    start_datetime,
    end_datetime,
    type,
    description,
    status,
    event_type,
    cycle_id,
    discord_event_id,
    image_url,
    participants,
    creator_call_sign,
    creator_board_number,
    creator_billet,
    event_settings,
    created_at,
    updated_at
  `);
  // If a cycle ID is provided, filter events for that cycle
  if (cycleId) {
    query = query.eq('cycle_id', cycleId);
  }


  // Note: Removed Discord guild ID filtering to support multi-squadron publishing
  // Events can now be published to multiple squadron-specific Discord servers
  // so filtering by a single guild ID would hide events published to other guilds
  const { data, error } = await query.order('start_datetime', { ascending: false });


  if (error) {
    return { events: [], error };
  }

  // Transform database events to frontend format without attendance data
  // We'll fetch attendance separately based on discord_event_id

  const events: Event[] = data.map(dbEvent => {
    // Debug raw database data
    // if (dbEvent.discord_event_id) {
    // }
    
    // Return the transformed event with correct field mapping from DB to frontend
    return {
      id: dbEvent.id,
      title: dbEvent.name, // DB field is 'name', frontend uses 'title'
      description: dbEvent.description || '',
      datetime: dbEvent.start_datetime, // DB field is 'start_datetime', frontend uses 'datetime'
      endDatetime: dbEvent.end_datetime, // Map end_datetime from DB to endDatetime in frontend
      status: dbEvent.status || 'upcoming',
      eventType: dbEvent.event_type as EventType | undefined,
      cycleId: dbEvent.cycle_id || undefined,
      trackQualifications: (dbEvent.event_settings as any)?.groupResponsesByQualification || false,
      eventSettings: dbEvent.event_settings as any || undefined,
      // Handle JSONB discord_event_id - extract first message ID for compatibility or keep as string
      discordEventId: Array.isArray(dbEvent.discord_event_id) 
        ? ((dbEvent.discord_event_id as any)[0]?.messageId || undefined)
        : (dbEvent.discord_event_id || undefined),
      // Keep the full JSONB array for deletion and editing
      discord_event_id: dbEvent.discord_event_id as any,
      // Handle JSONB image_url field
      imageUrl: typeof dbEvent.image_url === 'string' 
        ? dbEvent.image_url 
        : ((dbEvent.image_url as any)?.headerImage || undefined), // Legacy compatibility
      headerImageUrl: typeof dbEvent.image_url === 'string'
        ? dbEvent.image_url
        : ((dbEvent.image_url as any)?.headerImage || undefined),
      additionalImageUrls: typeof dbEvent.image_url === 'object' && (dbEvent.image_url as any)?.additionalImages
        ? (dbEvent.image_url as any).additionalImages
        : [],
      restrictedTo: [], // No restricted_to in the DB schema
      participants: Array.isArray(dbEvent.participants) ? dbEvent.participants as string[] : [], // Get participants from database
      creator: {
        boardNumber: dbEvent.creator_board_number || '',
        callsign: dbEvent.creator_call_sign || '',
        billet: dbEvent.creator_billet || ''
      },
      attendance: {
        accepted: [],
        declined: [],
        tentative: []
      }
    };
  });



  return { events, error: null };
};

export const createEvent = async (event: Omit<Event, 'id' | 'creator' | 'attendance'> & { 
  discordGuildId?: string;
  timezone?: string;
  reminders?: {
    firstReminder?: {
      enabled: boolean;
      value: number;
      unit: 'minutes' | 'hours' | 'days';
    };
    secondReminder?: {
      enabled: boolean;
      value: number;
      unit: 'minutes' | 'hours' | 'days';
    };
  };
  reminderRecipients?: {
    sendToAccepted: boolean;
    sendToTentative: boolean;
  };
}) => {
  const { user, error: userError } = await getCurrentUser();
  if (userError || !user) {
    return { event: null, error: userError || new Error('User not authenticated') };
  }

  // Find the pilot record for the current user to get the pilot ID
  let creatorPilotId = null;
  let creatorCallsign = '';
  let creatorBoardNumber = '';
  let creatorBillet = '';

  
  // Get the Discord user ID from metadata
  const discordUserId = user.user_metadata?.provider_id || user.user_metadata?.sub;

  try {
    const { data: pilotData, error: pilotError } = await supabase
      .from('pilots')
      .select('id, callsign, boardNumber')
      .eq('discord_id', discordUserId)
      .single();


    if (!pilotError && pilotData) {
      creatorPilotId = pilotData.id;
      creatorCallsign = pilotData.callsign || '';
      creatorBoardNumber = pilotData.boardNumber?.toString() || '';
      creatorBillet = ''; // We'll leave this empty for now since roles column doesn't exist
    } else {
      console.warn('[CREATE-EVENT-DEBUG] Could not find pilot record for event creator:', user.id, pilotError);
      // Fallback to user metadata if available
      creatorCallsign = user.user_metadata?.callsign || '';
      creatorBoardNumber = user.user_metadata?.board_number || '';
      creatorBillet = user.user_metadata?.billet || '';
    }
  } catch (pilotLookupError) {
    console.warn('[CREATE-EVENT-DEBUG] Error looking up creator pilot record:', pilotLookupError);
  }

  // Build event_settings JSONB object
  const eventSettings = {
    timezone: event.timezone || 'America/New_York',
    groupResponsesByQualification: event.trackQualifications || false,
    groupBySquadron: (event as any).groupBySquadron || false,
    firstReminderEnabled: event.reminders?.firstReminder?.enabled || false,
    firstReminderTime: {
      value: event.reminders?.firstReminder?.value || 15,
      unit: event.reminders?.firstReminder?.unit || 'minutes'
    },
    secondReminderEnabled: event.reminders?.secondReminder?.enabled || false,
    secondReminderTime: {
      value: event.reminders?.secondReminder?.value || 3,
      unit: event.reminders?.secondReminder?.unit || 'days'
    },
    sendRemindersToAccepted: event.reminderRecipients?.sendToAccepted !== undefined ? event.reminderRecipients.sendToAccepted : true,
    sendRemindersToTentative: event.reminderRecipients?.sendToTentative !== undefined ? event.reminderRecipients.sendToTentative : true
  };


  // Map from frontend format to database format
  const { data, error } = await supabase
    .from('events')
    .insert({
      name: event.title, // Frontend uses 'title', DB field is 'name'
      description: event.description,
      start_datetime: event.datetime, // Frontend uses 'datetime', DB uses 'start_datetime'
      end_datetime: event.endDatetime, // Pass end datetime if available
      status: event.status,
      event_type: event.eventType,
      cycle_id: event.cycleId,
      participants: event.participants || [], // Store participants in database
      track_qualifications: event.trackQualifications || false, // Keep for backward compatibility
      event_settings: eventSettings, // Store all event-specific settings
      creator_id: user.id,
      creator_pilot_id: creatorPilotId, // Store the pilot UUID
      creator_call_sign: creatorCallsign,
      creator_board_number: creatorBoardNumber,
      creator_billet: creatorBillet
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating event:', error);
    return { event: null, error };
  }


  // Transform to frontend format
  const newEvent: Event = {
    id: data.id,
    title: data.name, // DB field is 'name', frontend uses 'title'
    description: data.description || '',
    datetime: data.start_datetime, // DB field is 'start_datetime', frontend uses 'datetime'
    endDatetime: data.end_datetime, // Map end_datetime from DB to endDatetime in frontend
    status: data.status || 'upcoming',
    eventType: data.event_type as EventType | undefined,
    cycleId: data.cycle_id || undefined,
    participants: [], // Default value - field not in current database schema
    trackQualifications: false, // Default value - field not in current database schema
    eventSettings: undefined, // Default value - field not in current database schema
    restrictedTo: [], // No restricted_to in the DB schema
    creator: {
      boardNumber: user.user_metadata?.board_number || '',
      callsign: user.user_metadata?.callsign || '',
      billet: user.user_metadata?.billet || ''
    },
    attendance: {
      accepted: [],
      declined: [],
      tentative: []
    }
  };

  return { event: newEvent, error: null };
};

export const updateEvent = async (eventId: string, updates: Partial<Omit<Event, 'id' | 'creator' | 'attendance'>> & { 
  timezone?: string;
  participants?: string[];
  reminders?: {
    firstReminder?: {
      enabled: boolean;
      value: number;
      unit: 'minutes' | 'hours' | 'days';
    };
    secondReminder?: {
      enabled: boolean;
      value: number;
      unit: 'minutes' | 'hours' | 'days';
    };
  };
  reminderRecipients?: {
    sendToAccepted: boolean;
    sendToTentative: boolean;
  };
  eventSettings?: EventSettings;
}) => {
  // Map from frontend format to database format
  const dbUpdates: any = {};
  if (updates.title !== undefined) dbUpdates.name = updates.title; // Frontend uses 'title', DB field is 'name'
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.datetime !== undefined) dbUpdates.start_datetime = updates.datetime; // Frontend uses 'datetime', DB uses 'start_datetime'
  if (updates.endDatetime !== undefined) dbUpdates.end_datetime = updates.endDatetime; // Frontend uses 'endDatetime', DB uses 'end_datetime'
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if ((updates as any).eventType !== undefined) dbUpdates.event_type = (updates as any).eventType;
  if ((updates as any).cycleId !== undefined) dbUpdates.cycle_id = (updates as any).cycleId;
  if ((updates as any).discordEventId !== undefined) dbUpdates.discord_event_id = (updates as any).discordEventId;
  if (updates.participants !== undefined) dbUpdates.participants = updates.participants;
  // track_qualifications field not in current database schema
  // Handle event settings updates
  if (updates.timezone !== undefined || updates.trackQualifications !== undefined || (updates as any).groupBySquadron !== undefined || updates.reminders !== undefined || updates.reminderRecipients !== undefined || updates.eventSettings !== undefined) {
    // First, get existing event settings to merge with updates
    const { data: existingEvent } = await supabase
      .from('events')
      .select('event_settings')
      .eq('id', eventId)
      .single();
    
    // Start with existing settings or empty object
    const eventSettings: any = existingEvent?.event_settings || {};
    
    // Apply updates
    console.log('[UPDATE-EVENT] updates.groupBySquadron:', (updates as any).groupBySquadron);
    if (updates.timezone !== undefined) eventSettings.timezone = updates.timezone;
    if (updates.trackQualifications !== undefined) eventSettings.groupResponsesByQualification = updates.trackQualifications;
    if ((updates as any).groupBySquadron !== undefined) eventSettings.groupBySquadron = (updates as any).groupBySquadron;
    if (updates.eventSettings?.groupResponsesByQualification !== undefined) eventSettings.groupResponsesByQualification = updates.eventSettings.groupResponsesByQualification;
    if (updates.eventSettings?.groupBySquadron !== undefined) eventSettings.groupBySquadron = updates.eventSettings.groupBySquadron;
    console.log('[UPDATE-EVENT] Final eventSettings:', eventSettings);
    if (updates.reminders?.firstReminder !== undefined) {
      eventSettings.firstReminderEnabled = updates.reminders.firstReminder.enabled;
      eventSettings.firstReminderTime = {
        value: updates.reminders.firstReminder.value,
        unit: updates.reminders.firstReminder.unit
      };
    }
    if (updates.reminders?.secondReminder !== undefined) {
      eventSettings.secondReminderEnabled = updates.reminders.secondReminder.enabled;
      eventSettings.secondReminderTime = {
        value: updates.reminders.secondReminder.value,
        unit: updates.reminders.secondReminder.unit
      };
    }
    if (updates.reminderRecipients !== undefined) {
      eventSettings.sendRemindersToAccepted = updates.reminderRecipients.sendToAccepted;
      eventSettings.sendRemindersToTentative = updates.reminderRecipients.sendToTentative;
    }
    
    // Update database fields
    dbUpdates.event_settings = eventSettings;
  }

  // Preserve discord_event_id during updates
  if ((updates as any).discord_event_id !== undefined) dbUpdates.discord_event_id = (updates as any).discord_event_id;
  // No restricted_to in the DB schema

  // Check if we have any updates to apply
  console.log('[UPDATE-EVENT] dbUpdates before check:', dbUpdates);
  if (Object.keys(dbUpdates).length === 0) {
    console.warn('[UPDATE-EVENT] No database fields to update, skipping update query');
    // Fetch the existing event to return
    const { data, error } = await supabase
      .from('events')
      .select()
      .eq('id', eventId)
      .single();

    if (error) {
      console.error('Error fetching event:', error);
      return { event: null, error };
    }

    // Continue with the rest of the function using the fetched data
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      start_datetime: data.start_datetime,
      end_datetime: data.end_datetime,
      event_type: data.event_type,
      event_settings: data.event_settings,
      discord_event_id: data.discord_event_id,
      // ...other event fields...
      // Attendance data should be fetched separately using getEventAttendance
    };
  }

  // About to update event
  console.log('[UPDATE-EVENT] About to update database with:', dbUpdates);
  console.log('[UPDATE-EVENT] event_settings value:', JSON.stringify(dbUpdates.event_settings, null, 2));

  // Perform the update
  const { error: updateError } = await supabase
    .from('events')
    .update(dbUpdates)
    .eq('id', eventId);

  if (updateError) {
    console.error('[UPDATE-EVENT] Database update failed:', updateError);
    return { event: null, error: updateError };
  }
  console.log('[UPDATE-EVENT] Database update completed successfully');

  // Then fetch the updated event
  const { data, error: fetchError } = await supabase
    .from('events')
    .select()
    .eq('id', eventId)
    .single();

  console.log('[UPDATE-EVENT] Fetched event_settings after update:', JSON.stringify(data?.event_settings, null, 2));

  if (fetchError || !data) {
    console.error('Error fetching updated event:', fetchError);
    return { event: null, error: fetchError || new Error('No data returned after update') };
  }

  // Initialize with empty attendance
  const attendance = {
    accepted: [],
    declined: [],
    tentative: []
  };
  // If there's a Discord event ID, fetch attendance from discord_event_attendance
  if (data.discord_event_id) {
    const { data: attendanceData, error: attendanceError } = await supabase
      .from('discord_event_attendance')
      .select('*')
      .eq('discord_event_id', String(data.discord_event_id));

    if (!attendanceError && attendanceData) {      // Process attendance data
      attendanceData.forEach(record => {
        const attendee = {
          boardNumber: '', // Not available in schema
          callsign: record.discord_username || '', // Using discord_username instead of call_sign
          discord_id: record.discord_id // Include discord_id from the schema
        };

        // Use user_response instead of status
        if (record.user_response === 'accepted') {
          (attendance.accepted as any[]).push(attendee);
        } else if (record.user_response === 'declined') {
          (attendance.declined as any[]).push(attendee);
        } else if (record.user_response === 'tentative') {
          (attendance.tentative as any[]).push(attendee);
        }
      });
    } else if (attendanceError) {
      console.error('Error fetching attendance:', attendanceError);
    }
  }

  // Handle reminder updates if reminders were changed
  if (updates.reminders !== undefined && data.start_datetime) {
    try {
      const { updateEventReminders } = await import('./reminderService');
      const reminderResult = await updateEventReminders(eventId, data.start_datetime, updates.reminders);
      if (!reminderResult.success) {
        console.warn('Failed to update reminders for event:', reminderResult.error);
      }
    } catch (reminderError) {
      console.warn('Error updating reminders for event:', reminderError);
    }
  }

  // Transform to frontend format
  const updatedEvent: Event = {
    id: data.id,
    title: data.name, // DB field is 'name', frontend uses 'title'
    description: data.description || '',
    datetime: data.start_datetime, // DB field is 'start_datetime', frontend uses 'datetime'
    endDatetime: data.end_datetime, // Use endDatetime (camelCase) for frontend consistency
    status: (data.status as string) || 'upcoming',
    eventType: data.event_type as EventType | undefined,
    cycleId: data.cycle_id || undefined,
    discordEventId: String(data.discord_event_id || ''),
    trackQualifications: false, // Default value - field not in current database schema
    restrictedTo: [], // No restricted_to in the DB schema
    participants: [], // Default value - field not in current database schema
    creator: {
      boardNumber: '',
      callsign: '',
      billet: ''
    },
    attendance
  };

  return { event: updatedEvent, error: null };
};

export const deleteEvent = async (eventId: string) => {
  // Cancel any scheduled reminders first
  try {
    const { cancelEventReminders } = await import('./reminderService');
    await cancelEventReminders(eventId);
  } catch (reminderError) {
    console.warn('Failed to cancel reminders for deleted event:', reminderError);
  }

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId);

  return { error };
};

// Event Attendance API
export const updateEventAttendance = async (eventId: string, status: 'accepted' | 'declined' | 'tentative') => {
  const { user, error: userError } = await getCurrentUser();
  if (userError || !user) {
    return { error: userError || new Error('User not authenticated') };
  }

  // Get user metadata from auth, instead of trying to use a user_profiles table
  // which might not exist in your database schema
  const userData = {
    callsign: user.user_metadata?.callsign,
    boardNumber: user.user_metadata?.board_number,
    billet: user.user_metadata?.billet
  };
  // Check if attendance record already exists
  const { data: existingAttendance } = await supabase
    .from('discord_event_attendance')
    .select('*')
    .eq('discord_event_id', eventId)  // Assuming we're using discord_event_id instead of event_id
    .eq('discord_id', user.id)        // Assuming we're using discord_id instead of user_id
    .single();

  let error;

  if (existingAttendance) {
    // Update existing record
    const { error: updateError } = await supabase
      .from('discord_event_attendance')
      .update({
        user_response: status,  // Using user_response instead of status
        discord_username: userData.callsign || ''  // Using discord_username instead of call_sign
        // Removed board_number and billet as they might not exist in your schema
      })
      .eq('id', existingAttendance.id);
    
    error = updateError;
  } else {
    // Create new record
    const { error: insertError } = await supabase
      .from('discord_event_attendance')
      .insert({
        discord_event_id: eventId,  // Using discord_event_id instead of event_id
        discord_id: user.id,         // Using discord_id instead of user_id
        user_response: status,       // Using user_response instead of status
        discord_username: userData.callsign || ''  // Using discord_username instead of call_sign
      });
    
    error = insertError;
  }

  if (error) {
    console.error('Error updating attendance:', error);
  }

  return { error };
};

// Fetch discord_event_attendance for a specific event
export const fetchEventAttendance = async (eventId: string) => {
  // First, get the discord_event_id from the events table
  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select('discord_event_id')
    .eq('id', eventId)
    .single();

  if (eventError || !eventData?.discord_event_id) {
    console.error('Error fetching event or no discord_event_id found:', eventError);
    return { 
      attendance: { accepted: [], declined: [], tentative: [] }, 
      error: eventError || new Error('No discord_event_id found for this event')
    };
  }

  // Now fetch the attendance data using discord_event_id
  const { data: attendanceData, error: attendanceError } = await supabase
    .from('discord_event_attendance')
    .select('*')
    .eq('discord_event_id', String(eventData.discord_event_id));

  if (attendanceError) {
    console.error('Error fetching discord_event_attendance:', attendanceError);
    return { 
      attendance: { accepted: [], declined: [], tentative: [] },
      error: attendanceError 
    };
  }
  // Process attendance data into the expected format
  const attendance = {
    accepted: [],
    declined: [],
    tentative: []
  };
  // If we have attendance records, process them
  if (attendanceData && attendanceData.length > 0) {
    attendanceData.forEach(record => {
      const attendee = {
        boardNumber: '', // These fields don't appear to exist in your schema
        callsign: record.discord_username || '', // Using discord_username instead
        discord_id: record.discord_id
      };

      // Use user_response instead of status
      if (record.user_response === 'accepted') {
        (attendance.accepted as any[]).push(attendee);
      } else if (record.user_response === 'declined') {
        (attendance.declined as any[]).push(attendee);
      } else if (record.user_response === 'tentative') {
        (attendance.tentative as any[]).push(attendee);
      }
    });
  }

  return { attendance, error: null };
};

// Carrier data fetching
export const fetchCarriers = async () => {
  return await sb(async (supabase) => {
    const { data, error } = await supabase
      .from('carriers')
      .select('*')
      .order('name');
    
    if (error) {
      console.error('Error fetching carriers:', error);
      return [];
    }
    
    return data || [];
  });
};

// EventSettings interface for type safety
interface EventSettings {
  timezone?: string;
  groupResponsesByQualification?: boolean;
  groupBySquadron?: boolean;
  firstReminderEnabled?: boolean;
  firstReminderTime?: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
  secondReminderEnabled?: boolean;
  secondReminderTime?: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
  sendReminderToThread?: boolean;
}

