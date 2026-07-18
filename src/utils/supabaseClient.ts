import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';
import { Cycle, CycleType, Event, EventType, EventActivity, CycleActivity } from '../types/EventTypes';

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

// Auth-shaped errors: expired/invalid JWT (PGRST301) or RLS denial (42501),
// which can be caused by a stale user_permission_cache rather than a genuine
// lack of permission — so recovery refreshes both the session and the cache.
function isAuthError(err: any): boolean {
  if (!err) return false;
  const message = typeof err === 'string' ? err : err.message ?? '';
  const status = err.status ?? err.statusCode;
  return status === 401 || status === 403 ||
    err.code === 'PGRST301' || err.code === '42501' ||
    /jwt expired|invalid jwt|row-level security/i.test(message);
}

async function recoverFromAuthError(supabase: SupabaseClient<Database>): Promise<void> {
  const { data: { session } } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));

  // Force refresh permission cache on auth errors (likely stale cache causing RLS failure)
  if (session?.user?.id) {
    try {
      const { permissionCache } = await import('./permissionCache');
      await permissionCache.invalidateUserPermissions(session.user.id);
      await permissionCache.getUserPermissions(session.user.id);
      console.log('[sb] Permission cache forcibly refreshed after auth error');
    } catch (cacheErr) {
      console.warn('[sb] Failed to refresh permission cache after auth error:', cacheErr);
    }
  }
}

// Resilient query wrapper: retries once on transient failures, and on auth
// failures refreshes the session + permission cache before retrying.
export async function sb<T>(fn: (c: SupabaseClient<Database>) => Promise<T>): Promise<T> {
  const supabase = getSupabase();

  let result: T;
  try {
    result = await fn(supabase);
  } catch (err: any) {
    const status = err?.status;
    const transient = err?.name === 'TypeError' || [408, 425, 429, 500, 502, 503, 504].includes(status);

    if (transient) {
      await new Promise(r => setTimeout(r, 300)); // tiny backoff
      return await fn(supabase);
    }

    if (isAuthError(err)) {
      await recoverFromAuthError(supabase);
      return await fn(supabase);
    }
    throw err;
  }

  // supabase-js returns query errors in-band ({ data, error }) rather than
  // throwing, so auth failures must also be detected on the returned value.
  if (isAuthError((result as any)?.error)) {
    await recoverFromAuthError(supabase);
    return await fn(supabase);
  }

  return result;
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
      syllabusId: dbCycle.syllabus_id || undefined,
      settings: (dbCycle as any).settings || undefined,
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
  const insertData: any = {
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
  };

  // Training workflow field (Phase 3) - only include if provided (null means no syllabus)
  if (cycle.syllabusId !== undefined) {
    insertData.syllabus_id = cycle.syllabusId || null;
  }

  // Cycle-level event defaults (developer-flagged)
  if (cycle.settings !== undefined) {
    insertData.settings = cycle.settings;
  }

  const { data, error } = await supabase
    .from('cycles')
    .insert(insertData)
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
    syllabusId: data.syllabus_id || undefined,
    settings: (data as any).settings || undefined,
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

  // Training workflow field (Phase 3) - only include if provided (null means clear the field)
  if (updates.syllabusId !== undefined) {
    dbUpdates.syllabus_id = updates.syllabusId || null;
  }

  // Cycle-level event defaults (developer-flagged)
  if (updates.settings !== undefined) {
    dbUpdates.settings = updates.settings;
  }

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
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const { data: permTest, error: permError } = await (supabase as any)
    .rpc('user_can_manage_cycle', {
      user_auth_id: userId,
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
    settings: (data as any).settings || undefined,
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

// Cycle Activities API (developer-flagged feature). A cycle with zero activity
// rows behaves exactly as today; these are only called from flag-gated paths.

const mapDbCycleActivity = (row: any): CycleActivity => ({
  id: row.id,
  cycleId: row.cycle_id,
  kind: row.kind,
  syllabusId: row.syllabus_id || undefined,
  label: row.label || undefined,
  adHocObjectives: Array.isArray(row.ad_hoc_objectives) ? row.ad_hoc_objectives : undefined,
  startWeek: row.start_week ?? 1,
  endWeek: row.end_week ?? 1,
  displayOrder: row.display_order ?? 0,
  settings: row.settings || {}
});

export const getCycleActivities = async (cycleId: string): Promise<{ activities: CycleActivity[]; error: any }> => {
  const { data, error } = await (supabase as any)
    .from('cycle_activities')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('display_order');

  if (error) {
    console.error('[CYCLE-ACTIVITIES] Error loading activities:', error);
    return { activities: [], error };
  }

  return { activities: (data || []).map(mapDbCycleActivity), error: null };
};

/** Replace the full set of activities for a cycle (array order = display_order) */
export const saveCycleActivities = async (
  cycleId: string,
  activities: CycleActivity[]
): Promise<{ activities: CycleActivity[]; error: any }> => {
  const { data: existing, error: loadError } = await (supabase as any)
    .from('cycle_activities')
    .select('id')
    .eq('cycle_id', cycleId);

  if (loadError) return { activities: [], error: loadError };

  const keptIds = new Set(activities.filter(a => a.id).map(a => a.id as string));
  const toDelete = (existing || []).map((r: any) => r.id).filter((id: string) => !keptIds.has(id));

  if (toDelete.length > 0) {
    const { error: deleteError } = await (supabase as any)
      .from('cycle_activities')
      .delete()
      .in('id', toDelete);
    if (deleteError) return { activities: [], error: deleteError };
  }

  const saved: CycleActivity[] = [];
  for (let i = 0; i < activities.length; i++) {
    const activity = activities[i];
    const row: any = {
      cycle_id: cycleId,
      kind: activity.kind,
      syllabus_id: activity.kind === 'syllabus' ? (activity.syllabusId || null) : null,
      label: activity.label || null,
      ad_hoc_objectives: activity.kind === 'objectives' ? (activity.adHocObjectives || []) : null,
      start_week: activity.startWeek,
      end_week: Math.max(activity.startWeek, activity.endWeek),
      display_order: i,
      settings: activity.settings || {}
    };

    if (activity.id) {
      const { data, error } = await (supabase as any)
        .from('cycle_activities')
        .update(row)
        .eq('id', activity.id)
        .select()
        .single();
      if (error) return { activities: saved, error };
      saved.push(mapDbCycleActivity(data));
    } else {
      const { data, error } = await (supabase as any)
        .from('cycle_activities')
        .insert(row)
        .select()
        .single();
      if (error) return { activities: saved, error };
      saved.push(mapDbCycleActivity(data));
    }
  }

  return { activities: saved, error: null };
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
    updated_at,
    syllabus_mission_id,
    reference_materials
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
      },
      // Training workflow fields (Phase 2-3)
      syllabusMissionId: dbEvent.syllabus_mission_id || undefined,
      referenceMaterials: (Array.isArray(dbEvent.reference_materials) ? dbEvent.reference_materials : []) as any,
      // Attendance report inclusion setting (from event_settings JSONB)
      includeInAttendanceReport: (dbEvent.event_settings as any)?.includeInAttendanceReport !== undefined
        ? (dbEvent.event_settings as any).includeInAttendanceReport
        : true
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
    supportRoleRequirements: (event as any).supportRoleRequirements || [],
    groupResponsesByQualification: event.trackQualifications || false,
    groupBySquadron: (event as any).groupBySquadron || false,
    // Event Activities AAR derivation - only present on activity-based saves
    ...((event as any).aarRequired !== undefined ? { aarRequired: (event as any).aarRequired } : {}),
    ...((event as any).aarSquadronIds !== undefined ? { aarSquadronIds: (event as any).aarSquadronIds } : {}),
    showNoResponse: (event as any).showNoResponse || false,
    allowTentativeResponse: (event as any).allowTentativeResponse ?? true,
    aarOperationalOnly: (event as any).aarOperationalOnly !== undefined ? (event as any).aarOperationalOnly : true,
    firstReminderEnabled: event.reminders?.firstReminder?.enabled || false,
    firstReminderTime: {
      value: event.reminders?.firstReminder?.value || 15,
      unit: event.reminders?.firstReminder?.unit || 'minutes'
    },
    firstReminderRecipients: (event.reminders?.firstReminder as any)?.recipients || {
      accepted: true,
      tentative: true,
      declined: false,
      noResponse: false
    },
    secondReminderEnabled: event.reminders?.secondReminder?.enabled || false,
    secondReminderTime: {
      value: event.reminders?.secondReminder?.value || 3,
      unit: event.reminders?.secondReminder?.unit || 'days'
    },
    secondReminderRecipients: (event.reminders?.secondReminder as any)?.recipients || {
      accepted: true,
      tentative: true,
      declined: false,
      noResponse: false
    },
    initialNotificationRoles: (event.reminders as any)?.initialNotificationRoles || [],
    // Keep old fields for backward compatibility during transition
    sendRemindersToAccepted: event.reminderRecipients?.sendToAccepted !== undefined ? event.reminderRecipients.sendToAccepted : true,
    sendRemindersToTentative: event.reminderRecipients?.sendToTentative !== undefined ? event.reminderRecipients.sendToTentative : true,
    // Attendance report settings - default to true
    includeInAttendanceReport: (event as any).includeInAttendanceReport !== undefined ? (event as any).includeInAttendanceReport : true
  };


  // Map from frontend format to database format
  const insertData: any = {
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
  };

  // Training workflow fields (Phase 2) - only include if provided
  if (event.referenceMaterials !== undefined) {
    insertData.reference_materials = event.referenceMaterials;
  }
  if (event.syllabusMissionId !== undefined) {
    insertData.syllabus_mission_id = event.syllabusMissionId;
  }

  // Image data - stored in image_url JSONB column
  if ((event as any).imageUrl !== undefined) {
    insertData.image_url = (event as any).imageUrl;
  }

  console.log('[CREATE-EVENT] User attempting insert:', {
    userId: user.id,
    userEmail: user.email,
    creatorPilotId,
    hasParticipants: insertData.participants.length > 0,
    participants: insertData.participants
  });
  console.log('[CREATE-EVENT] Full insert data:', insertData);

  const { data, error } = await supabase
    .from('events')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[CREATE-EVENT] Insert failed with RLS error:', error);
    console.error('[CREATE-EVENT] User context:', { userId: user.id, email: user.email, role: user.role });
    return { event: null, error };
  }

  // Event activities (developer-flagged): only present when the flag-gated
  // editor supplied them; flag-off saves never reach this branch.
  let savedActivities: EventActivity[] | undefined;
  const activitiesToSave = (event as any).activities as EventActivity[] | undefined;
  if (activitiesToSave !== undefined) {
    const { activities, error: activitiesError } = await saveEventActivities(data.id, data.cycle_id || null, activitiesToSave);
    if (activitiesError) {
      console.error('[CREATE-EVENT] Event created but saving activities failed:', activitiesError);
    } else {
      savedActivities = activities;
    }
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
    },
    // Training workflow fields (Phase 2-3)
    syllabusMissionId: data.syllabus_mission_id || undefined,
    referenceMaterials: (Array.isArray(data.reference_materials) ? data.reference_materials : []) as any,
    activities: savedActivities
  };

  return { event: newEvent, error: null };
};

export const updateEvent = async (eventId: string, updates: Partial<Omit<Event, 'id' | 'creator' | 'attendance'>> & {
  timezone?: string;
  participants?: string[];
  groupBySquadron?: boolean;
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
  event_settings?: EventSettings;
}) => {
  // Map from frontend format to database format
  const dbUpdates: any = {};
  if (updates.title !== undefined) dbUpdates.name = updates.title; // Frontend uses 'title', DB field is 'name'
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.datetime !== undefined) dbUpdates.start_datetime = updates.datetime; // Frontend uses 'datetime', DB uses 'start_datetime'
  if (updates.endDatetime !== undefined) dbUpdates.end_datetime = updates.endDatetime; // Frontend uses 'endDatetime', DB uses 'end_datetime'
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if ((updates as any).eventType !== undefined) dbUpdates.event_type = (updates as any).eventType;
  // Handle cycleId - allow null/undefined to clear the cycle
  if ('cycleId' in (updates as any)) {
    console.log('[UPDATE-EVENT] Setting cycle_id to:', (updates as any).cycleId);
    dbUpdates.cycle_id = (updates as any).cycleId || null;
  }
  if ((updates as any).discordEventId !== undefined) dbUpdates.discord_event_id = (updates as any).discordEventId;
  if (updates.participants !== undefined) dbUpdates.participants = updates.participants;
  // track_qualifications field not in current database schema
  // Handle event settings updates
  if (updates.timezone !== undefined || updates.trackQualifications !== undefined || (updates as any).groupBySquadron !== undefined || (updates as any).aarRequired !== undefined || (updates as any).showNoResponse !== undefined || (updates as any).allowTentativeResponse !== undefined || (updates as any).aarOperationalOnly !== undefined || updates.reminders !== undefined || updates.reminderRecipients !== undefined || updates.eventSettings !== undefined || (updates as any).event_settings !== undefined) {
    // If event_settings is passed directly, use it (from EventsManagement.tsx)
    if ((updates as any).event_settings !== undefined) {
      dbUpdates.event_settings = (updates as any).event_settings;
    } else {
      // Otherwise, build event_settings from individual fields
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
    console.log('[UPDATE-EVENT] updates.allowTentativeResponse:', (updates as any).allowTentativeResponse);
    if (updates.timezone !== undefined) eventSettings.timezone = updates.timezone;
    if ((updates as any).supportRoleRequirements !== undefined) eventSettings.supportRoleRequirements = (updates as any).supportRoleRequirements;
    if (updates.trackQualifications !== undefined) eventSettings.groupResponsesByQualification = updates.trackQualifications;
    if ((updates as any).groupBySquadron !== undefined) eventSettings.groupBySquadron = (updates as any).groupBySquadron;
    if ((updates as any).aarRequired !== undefined) eventSettings.aarRequired = (updates as any).aarRequired;
    if ((updates as any).aarSquadronIds !== undefined) eventSettings.aarSquadronIds = (updates as any).aarSquadronIds;
    if ((updates as any).showNoResponse !== undefined) eventSettings.showNoResponse = (updates as any).showNoResponse;
    if ((updates as any).allowTentativeResponse !== undefined) eventSettings.allowTentativeResponse = (updates as any).allowTentativeResponse;
    if ((updates as any).aarOperationalOnly !== undefined) eventSettings.aarOperationalOnly = (updates as any).aarOperationalOnly;
    if (updates.eventSettings?.groupResponsesByQualification !== undefined) eventSettings.groupResponsesByQualification = updates.eventSettings.groupResponsesByQualification;
    if (updates.eventSettings?.groupBySquadron !== undefined) eventSettings.groupBySquadron = updates.eventSettings.groupBySquadron;
    if (updates.eventSettings?.showNoResponse !== undefined) eventSettings.showNoResponse = updates.eventSettings.showNoResponse;
    console.log('[UPDATE-EVENT] Final eventSettings:', eventSettings);
    if (updates.reminders?.firstReminder !== undefined) {
      eventSettings.firstReminderEnabled = updates.reminders.firstReminder.enabled;
      eventSettings.firstReminderTime = {
        value: updates.reminders.firstReminder.value,
        unit: updates.reminders.firstReminder.unit
      };
      eventSettings.firstReminderRecipients = (updates.reminders.firstReminder as any).recipients || {
        accepted: true,
        tentative: true,
        declined: false,
        noResponse: false
      };
    }
    if (updates.reminders?.secondReminder !== undefined) {
      eventSettings.secondReminderEnabled = updates.reminders.secondReminder.enabled;
      eventSettings.secondReminderTime = {
        value: updates.reminders.secondReminder.value,
        unit: updates.reminders.secondReminder.unit
      };
      eventSettings.secondReminderRecipients = (updates.reminders.secondReminder as any).recipients || {
        accepted: true,
        tentative: true,
        declined: false,
        noResponse: false
      };
    }
    if ((updates.reminders as any)?.initialNotificationRoles !== undefined) {
      eventSettings.initialNotificationRoles = (updates.reminders as any).initialNotificationRoles || [];
    }
      if (updates.reminderRecipients !== undefined) {
        // Keep old fields for backward compatibility during transition
        eventSettings.sendRemindersToAccepted = updates.reminderRecipients.sendToAccepted;
        eventSettings.sendRemindersToTentative = updates.reminderRecipients.sendToTentative;
      }
      // Attendance report settings
      if ((updates as any).includeInAttendanceReport !== undefined) {
        eventSettings.includeInAttendanceReport = (updates as any).includeInAttendanceReport;
      }

      // Update database fields
      dbUpdates.event_settings = eventSettings;
    }
  }

  // Preserve discord_event_id during updates
  if ((updates as any).discord_event_id !== undefined) dbUpdates.discord_event_id = (updates as any).discord_event_id;
  // No restricted_to in the DB schema

  // Training workflow fields (Phase 2) - always include if provided (even empty arrays)
  console.log('[UPDATE-EVENT] referenceMaterials check:', updates.referenceMaterials, 'is undefined?', updates.referenceMaterials === undefined);
  if (updates.referenceMaterials !== undefined) {
    console.log('[UPDATE-EVENT] Adding reference_materials to dbUpdates:', updates.referenceMaterials);
    // Always update reference_materials, even if it's an empty array (allows deletion)
    dbUpdates.reference_materials = updates.referenceMaterials;
  }
  if ((updates as any).syllabusMissionId !== undefined) {
    dbUpdates.syllabus_mission_id = (updates as any).syllabusMissionId;
  }

  // Event activities (developer-flagged): only present when the flag-gated
  // editor supplied them; flag-off saves never reach this branch.
  const activitiesToSave = (updates as any).activities as EventActivity[] | undefined;
  if (activitiesToSave !== undefined) {
    const cycleIdForActivities = 'cycleId' in (updates as any)
      ? ((updates as any).cycleId || null)
      : null;
    const { error: activitiesError } = await saveEventActivities(eventId, cycleIdForActivities, activitiesToSave);
    if (activitiesError) {
      console.error('[UPDATE-EVENT] Saving activities failed:', activitiesError);
      return { event: null, error: activitiesError };
    }
    // saveEventActivities dual-writes syllabus_mission_id; drop any stale copy
    // from dbUpdates so the row update below can't overwrite it inconsistently
    delete dbUpdates.syllabus_mission_id;
  }

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
    attendance,
    // Training workflow fields (Phase 2-3)
    syllabusMissionId: data.syllabus_mission_id || undefined,
    referenceMaterials: (Array.isArray(data.reference_materials) ? data.reference_materials : []) as any
  };

  return { event: updatedEvent, error: null };
};

export const deleteEvent = async (eventId: string) => {
  console.log(`[DELETE-EVENT-DB] Starting delete for event ${eventId}`);

  // Cancel any scheduled reminders first
  try {
    const { cancelEventReminders } = await import('./reminderService');
    console.log(`[DELETE-EVENT-DB] Canceling reminders for event ${eventId}`);
    await cancelEventReminders(eventId);
    console.log(`[DELETE-EVENT-DB] Reminders canceled successfully`);
  } catch (reminderError) {
    console.warn('Failed to cancel reminders for deleted event:', reminderError);
  }

  // First verify the event exists and check permissions
  const { data: eventCheck } = await supabase
    .from('events')
    .select('id, participants')
    .eq('id', eventId)
    .single();

  console.log(`[DELETE-EVENT-DB] Event verification:`, eventCheck ? 'exists' : 'not found', eventCheck);

  console.log(`[DELETE-EVENT-DB] Executing database delete for event ${eventId}`);
  const { error, data } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)
    .select();

  console.log(`[DELETE-EVENT-DB] Database delete result - error:`, error, `data:`, data);

  // Check if any rows were actually deleted
  if (!error && (!data || data.length === 0)) {
    console.error(`[DELETE-EVENT-DB] No rows deleted - likely blocked by RLS policy`);
    return { error: { message: 'Event could not be deleted. This may be due to insufficient permissions or the event may have already been deleted.' } as any };
  }

  return { error };
};

// Event Activities API (developer-flagged feature)
// An event with zero activity rows behaves exactly as today everywhere; these
// functions are only called from flag-gated code paths.

const mapDbEventActivity = (row: any): EventActivity => ({
  id: row.id,
  eventId: row.event_id,
  cycleId: row.cycle_id || undefined,
  cycleActivityId: row.cycle_activity_id || undefined,
  kind: row.kind,
  displayOrder: row.display_order ?? 0,
  syllabusMissionId: row.syllabus_mission_id || undefined,
  qualificationId: row.qualification_id || undefined,
  label: row.label || undefined,
  adHocObjectives: Array.isArray(row.ad_hoc_objectives) ? row.ad_hoc_objectives : undefined,
  settings: row.settings || {}
});

export const getEventActivities = async (eventId: string): Promise<{ activities: EventActivity[]; error: any }> => {
  const { data, error } = await (supabase as any)
    .from('event_activities')
    .select('*')
    .eq('event_id', eventId)
    .order('display_order');

  if (error) {
    console.error('[EVENT-ACTIVITIES] Error loading activities:', error);
    return { activities: [], error };
  }

  return { activities: (data || []).map(mapDbEventActivity), error: null };
};

// Batch variant for roster grouping (one query for a page of events)
export const getEventActivitiesForEvents = async (eventIds: string[]): Promise<{ activitiesByEvent: Record<string, EventActivity[]>; error: any }> => {
  if (eventIds.length === 0) return { activitiesByEvent: {}, error: null };

  const { data, error } = await (supabase as any)
    .from('event_activities')
    .select('*')
    .in('event_id', eventIds)
    .order('display_order');

  if (error) {
    console.error('[EVENT-ACTIVITIES] Error batch loading activities:', error);
    return { activitiesByEvent: {}, error };
  }

  const activitiesByEvent: Record<string, EventActivity[]> = {};
  (data || []).forEach((row: any) => {
    const activity = mapDbEventActivity(row);
    if (!activitiesByEvent[row.event_id]) activitiesByEvent[row.event_id] = [];
    activitiesByEvent[row.event_id].push(activity);
  });
  return { activitiesByEvent, error: null };
};

/**
 * Replace the full set of activities for an event (array order = display_order).
 * Also dual-writes events.syllabus_mission_id from the first 'lesson' activity so
 * PTR/grading/Discord keep reading the legacy column unchanged.
 */
export const saveEventActivities = async (
  eventId: string,
  cycleId: string | null,
  activities: EventActivity[]
): Promise<{ activities: EventActivity[]; error: any }> => {
  // Two-way reflection: an activity added ad-hoc on a cycle event (no cycle
  // activity link) gets a matching single-week cycle activity created, so the
  // cycle builder shows what is actually scheduled.
  if (cycleId && activities.some(a => !a.cycleActivityId && a.kind !== 'qualification')) {
    try {
      const [{ data: eventRow }, { data: cycleRow }] = await Promise.all([
        (supabase as any).from('events').select('start_datetime').eq('id', eventId).single(),
        (supabase as any).from('cycles').select('start_date').eq('id', cycleId).single()
      ]);
      if (eventRow?.start_datetime && cycleRow?.start_date) {
        const week = Math.max(1, Math.floor(
          (new Date(eventRow.start_datetime).getTime() - new Date(cycleRow.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)
        ) + 1);

        for (const activity of activities) {
          if (activity.cycleActivityId || activity.kind === 'qualification') continue;

          let cycleActivityRow: any = null;
          if (activity.kind === 'lesson' && activity.syllabusMissionId) {
            const { data: mission } = await (supabase as any)
              .from('training_syllabus_missions')
              .select('syllabus_id')
              .eq('id', activity.syllabusMissionId)
              .single();
            if (!mission?.syllabus_id) continue;
            cycleActivityRow = {
              cycle_id: cycleId,
              kind: 'syllabus',
              syllabus_id: mission.syllabus_id,
              label: activity.label || null,
              start_week: week,
              end_week: week,
              settings: activity.settings || {}
            };
          } else if (activity.kind === 'objectives') {
            cycleActivityRow = {
              cycle_id: cycleId,
              kind: 'objectives',
              ad_hoc_objectives: activity.adHocObjectives || [],
              label: activity.label || null,
              start_week: week,
              end_week: week,
              settings: activity.settings || {}
            };
          }
          if (!cycleActivityRow) continue;

          const { data: createdCycleActivity } = await (supabase as any)
            .from('cycle_activities')
            .insert(cycleActivityRow)
            .select('id')
            .single();
          if (createdCycleActivity?.id) {
            activity.cycleActivityId = createdCycleActivity.id;
          }
        }
      }
    } catch (reflectionError) {
      console.warn('[EVENT-ACTIVITIES] Could not reflect ad-hoc activities into the cycle:', reflectionError);
    }
  }

  // Load existing rows to compute deletions (grades referencing a deleted
  // activity fall back to NULL via ON DELETE SET NULL)
  const { data: existing, error: loadError } = await (supabase as any)
    .from('event_activities')
    .select('id, cycle_activity_id')
    .eq('event_id', eventId);

  if (loadError) return { activities: [], error: loadError };

  const keptIds = new Set(activities.filter(a => a.id).map(a => a.id as string));
  const toDeleteRows = (existing || []).filter((r: any) => !keptIds.has(r.id));
  const toDelete = toDeleteRows.map((r: any) => r.id);

  if (toDelete.length > 0) {
    const { error: deleteError } = await (supabase as any)
      .from('event_activities')
      .delete()
      .in('id', toDelete);
    if (deleteError) return { activities: [], error: deleteError };

    // Reflection cleanup: a deleted event activity that was reflected into a
    // single-week cycle block (start_week === end_week) had that block
    // created solely to represent it, so remove the block too. Multi-week
    // gantt-authored activities are left alone - dropping one event's copy
    // shouldn't delete a syllabus's whole week span.
    const linkedCycleActivityIds = Array.from(new Set(
      toDeleteRows.map((r: any) => r.cycle_activity_id).filter(Boolean)
    ));
    if (linkedCycleActivityIds.length > 0) {
      const { data: cycleActivityRows } = await (supabase as any)
        .from('cycle_activities')
        .select('id, start_week, end_week')
        .in('id', linkedCycleActivityIds);

      const singleWeekIds = (cycleActivityRows || [])
        .filter((r: any) => r.start_week === r.end_week)
        .map((r: any) => r.id);

      for (const cycleActivityId of singleWeekIds) {
        const { count } = await (supabase as any)
          .from('event_activities')
          .select('id', { count: 'exact', head: true })
          .eq('cycle_activity_id', cycleActivityId);
        if (!count) {
          await (supabase as any).from('cycle_activities').delete().eq('id', cycleActivityId);
        }
      }
    }
  }

  const saved: EventActivity[] = [];
  for (let i = 0; i < activities.length; i++) {
    const activity = activities[i];
    const row: any = {
      event_id: eventId,
      cycle_id: cycleId,
      cycle_activity_id: activity.cycleActivityId || null,
      kind: activity.kind,
      display_order: i,
      // 'qualification' activities may also reference the lesson being flown
      // for that qualification (e.g. a JTAC checkride mission)
      syllabus_mission_id: (activity.kind === 'lesson' || activity.kind === 'qualification')
        ? (activity.syllabusMissionId || null)
        : null,
      qualification_id: activity.kind === 'qualification' ? (activity.qualificationId || null) : null,
      label: activity.label || null,
      ad_hoc_objectives: activity.kind === 'objectives' ? (activity.adHocObjectives || []) : null,
      settings: activity.settings || {}
    };

    if (activity.id) {
      const { data, error } = await (supabase as any)
        .from('event_activities')
        .update(row)
        .eq('id', activity.id)
        .select()
        .single();
      if (error) return { activities: saved, error };
      saved.push(mapDbEventActivity(data));
    } else {
      const { data, error } = await (supabase as any)
        .from('event_activities')
        .insert(row)
        .select()
        .single();
      if (error) return { activities: saved, error };
      saved.push(mapDbEventActivity(data));
    }
  }

  // Dual-write: keep events.syllabus_mission_id in sync with the first 'lesson'
  // activity so PTR/grading and the Discord bot read it exactly as before.
  const firstLesson = activities.find(a => a.kind === 'lesson' && a.syllabusMissionId);
  const { error: dualWriteError } = await supabase
    .from('events')
    .update({ syllabus_mission_id: firstLesson?.syllabusMissionId || null } as any)
    .eq('id', eventId);
  if (dualWriteError) {
    console.error('[EVENT-ACTIVITIES] Dual-write of syllabus_mission_id failed:', dualWriteError);
    return { activities: saved, error: dualWriteError };
  }

  return { activities: saved, error: null };
};

// Explicit pilot->activity assignment overrides (Phase 2)
export interface EventActivityParticipant {
  id: string;
  eventActivityId: string;
  pilotId: string;
  assignedBy?: string;
}

export const getEventActivityParticipantsForEvent = async (
  eventId: string
): Promise<{ participants: EventActivityParticipant[]; error: any }> => {
  const { data: activityRows, error: activityError } = await (supabase as any)
    .from('event_activities')
    .select('id')
    .eq('event_id', eventId);

  if (activityError) return { participants: [], error: activityError };
  const activityIds = (activityRows || []).map((r: any) => r.id);
  if (activityIds.length === 0) return { participants: [], error: null };

  const { data, error } = await (supabase as any)
    .from('event_activity_participants')
    .select('*')
    .in('event_activity_id', activityIds);

  if (error) return { participants: [], error };

  return {
    participants: (data || []).map((row: any) => ({
      id: row.id,
      eventActivityId: row.event_activity_id,
      pilotId: row.pilot_id,
      assignedBy: row.assigned_by || undefined
    })),
    error: null
  };
};

/**
 * Set (or clear, with activityId=null) a pilot's explicit activity assignment
 * for an event. A pilot has at most one override per event; clearing falls back
 * to inference (enrollment / IP / squadron).
 */
export const setPilotActivityAssignment = async (
  eventId: string,
  pilotId: string,
  activityId: string | null
): Promise<{ error: any }> => {
  const { data: activityRows, error: activityError } = await (supabase as any)
    .from('event_activities')
    .select('id')
    .eq('event_id', eventId);

  if (activityError) return { error: activityError };
  const activityIds = (activityRows || []).map((r: any) => r.id);
  if (activityIds.length === 0) return { error: null };

  const { error: deleteError } = await (supabase as any)
    .from('event_activity_participants')
    .delete()
    .eq('pilot_id', pilotId)
    .in('event_activity_id', activityIds);

  if (deleteError) return { error: deleteError };

  if (activityId) {
    const { error: insertError } = await (supabase as any)
      .from('event_activity_participants')
      .insert({ event_activity_id: activityId, pilot_id: pilotId });
    if (insertError) return { error: insertError };
  }

  return { error: null };
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

// A Mission Support role requirement for an event. Array order is display order
// in the Discord post and the attendance section.
export interface SupportRoleRequirement {
  qualificationId: string;
  name: string; // qualification name (the bot matches accepted pilots by name)
  required: number; // 0 = optional role, still displayed
}

// EventSettings interface for type safety
export interface EventSettings {
  timezone?: string;
  supportRoleRequirements?: SupportRoleRequirement[];
  allowTentativeResponse?: boolean;
  groupResponsesByQualification?: boolean;
  groupBySquadron?: boolean;
  // Event Activities: derived on save from per-activity requiresAar flags.
  // Undefined on legacy events (Mission Debriefing then uses aarOperationalOnly).
  aarRequired?: boolean;
  aarSquadronIds?: string[]; // squadrons whose flights need AARs (empty/absent = all)
  showNoResponse?: boolean;
  aarOperationalOnly?: boolean; // Show only operational squadron flights in AAR section
  firstReminderEnabled?: boolean;
  firstReminderTime?: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
  firstReminderRecipients?: {
    accepted: boolean;
    tentative: boolean;
    declined: boolean;
    noResponse: boolean;
  };
  secondReminderEnabled?: boolean;
  secondReminderTime?: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
  secondReminderRecipients?: {
    accepted: boolean;
    tentative: boolean;
    declined: boolean;
    noResponse: boolean;
  };
  sendReminderToThread?: boolean;
  initialNotificationRoles?: Array<{ id: string; name: string }>;
}

