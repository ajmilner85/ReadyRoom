import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';
import { Cycle, CycleType, Event, EventType } from '../types/EventTypes';

// Replace these with your actual Supabase URL and anon key
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL and Anon Key must be provided in environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Real-time subscriptions helper
export const subscribeToTable = (
  tableName: string, 
  callback: (payload: any) => void
) => {
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
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
};

export const signInWithDiscord = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      scopes: 'identify guilds',
      redirectTo: `${window.location.origin}/auth/callback`
    }
  });
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const resetPassword = async (email: string) => {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`
  });
  return { data, error };
};

export const updatePassword = async (password: string) => {
  const { data, error } = await supabase.auth.updateUser({
    password: password
  });
  return { data, error };
};

export const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    return { user, error };
  } catch (err: any) {
    console.error('Error in getCurrentUser:', err);
    return { user: null, error: err };
  }
};

export const onAuthStateChange = (callback: (event: string, session: any) => void) => {
  return supabase.auth.onAuthStateChange(async (event, session) => {
    // Handle user profile creation/update on sign in
    if (event === 'SIGNED_IN' && session?.user) {
      try {
        const { createOrUpdateUserProfile } = await import('./userProfileService');
        await createOrUpdateUserProfile(session.user);
      } catch (error) {
        console.error('Error creating/updating user profile:', error);
      }
    }
    
    // Call the original callback
    callback(event, session);
  });
};

// Cycles API
export const fetchCycles = async (discordGuildId?: string) => {
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
    console.error('Error fetching cycles:', error);
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
    creator: {
      boardNumber: dbCycle.creator_board_number || '',
      callsign: dbCycle.creator_call_sign || '',
      billet: dbCycle.creator_billet || ''
    }
  }));

  return { cycles, error: null };
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

  const { data, error } = await supabase
    .from('cycles')
    .update(dbUpdates)
    .eq('id', cycleId)
    .select()
    .single();

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
export const fetchEvents = async (cycleId?: string, discordGuildId?: string) => {  
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
    discord_guild_id,
    image_url,
    created_at,
    updated_at
  `);
  // If a cycle ID is provided, filter events for that cycle
  if (cycleId) {
    query = query.eq('cycle_id', cycleId);
  }
  
  // If a Discord guild ID is provided, filter events for that guild
  if (discordGuildId) {
    query = query.eq('discord_guild_id', discordGuildId);
  }
  const { data, error } = await query.order('start_datetime', { ascending: false });

  if (error) {
    console.error('Error fetching events:', error);
    return { events: [], error };
  }
  
  // Transform database events to frontend format without attendance data
  // We'll fetch attendance separately based on discord_event_id
  const events: Event[] = data.map(dbEvent => {
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
      discordEventId: dbEvent.discord_event_id || undefined,
      imageUrl: dbEvent.image_url || undefined, // Map image_url from DB to imageUrl in frontend
      restrictedTo: [], // No restricted_to in the DB schema
      creator: {
        boardNumber: '',
        callsign: '',
        billet: ''
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

export const createEvent = async (event: Omit<Event, 'id' | 'creator' | 'attendance'> & { discordGuildId?: string }) => {
  const { user, error: userError } = await getCurrentUser();
  if (userError || !user) {
    return { event: null, error: userError || new Error('User not authenticated') };
  }
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
      discord_guild_id: event.discordGuildId || '' // Add Discord guild ID with empty string fallback
      // No restricted_to or creator fields in the DB schema
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
    restrictedTo: [], // No restricted_to in the DB schema
    creator: {
      boardNumber: '',
      callsign: '',
      billet: ''
    },
    attendance: {
      accepted: [],
      declined: [],
      tentative: []
    }
  };

  return { event: newEvent, error: null };
};

export const updateEvent = async (eventId: string, updates: Partial<Omit<Event, 'id' | 'creator' | 'attendance'>>) => {
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
  // No restricted_to in the DB schema

  const { data, error } = await supabase
    .from('events')
    .update(dbUpdates)
    .eq('id', eventId)
    .select()
    .single();

  if (error) {
    console.error('Error updating event:', error);
    return { event: null, error };
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
      .eq('discord_event_id', data.discord_event_id);

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
    discordEventId: data.discord_event_id || undefined,
    restrictedTo: [], // No restricted_to in the DB schema
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
    .eq('discord_event_id', eventData.discord_event_id);

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
  const { data, error } = await supabase
    .from('carriers')
    .select('*')
    .order('name');
  
  if (error) {
    console.error('Error fetching carriers:', error);
    return [];
  }
  
  return data || [];
};