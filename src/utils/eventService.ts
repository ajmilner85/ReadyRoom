import { supabase } from './supabaseClient';
import type { Database } from '../types/supabase';
import { scheduleEventReminders, updateEventReminders, cancelEventReminders } from './reminderService';

export type Event = Database['public']['Tables']['events']['Row'];
export type NewEvent = Database['public']['Tables']['events']['Insert'];
export type UpdateEvent = Database['public']['Tables']['events']['Update'];

/**
 * Fetch all events from the database
 */
export async function getAllEvents(): Promise<{ data: Event[] | null; error: any }> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('start_datetime', { ascending: true });

  return { data, error };
}

/**
 * Fetch all events for a specific Discord guild
 * @param guildId The Discord guild/server ID
 */
export async function getEventsByGuildId(guildId: string): Promise<{ data: Event[] | null; error: any }> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('discord_guild_id', guildId)
    .order('start_datetime', { ascending: false });  // Reverse chronological order

  return { data, error };
}

/**
 * Fetch a single event by ID
 */
export async function getEventById(id: string): Promise<{ data: Event | null; error: any }> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();

  return { data, error };
}

/**
 * Add a new event to the database
 * @param event The event data to add
 * @param reminderSettings Optional reminder settings for the event
 */
export async function createEvent(
  event: NewEvent, 
  reminderSettings?: {
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
  }
): Promise<{ data: Event | null; error: any }> {
  const { data, error } = await supabase
    .from('events')
    .insert(event)
    .select()
    .single();

  // If event was created successfully and has reminders, schedule them
  if (data && !error && reminderSettings && event.start_datetime) {
    const { success, error: reminderError } = await scheduleEventReminders(
      data.id,
      event.start_datetime,
      reminderSettings
    );
    
    if (!success) {
      console.error('Failed to schedule reminders for new event:', reminderError);
    }
  }

  return { data, error };
}

/**
 * Update an existing event
 * @param id The ID of the event to update
 * @param updates The event data to update
 * @param reminderSettings Optional reminder settings for the event
 */
export async function updateEvent(
  id: string, 
  updates: UpdateEvent,
  reminderSettings?: {
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
  }
): Promise<{ data: Event | null; error: any }> {
  const { data, error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  // If event was updated successfully and has reminders, update them
  if (data && !error && reminderSettings && (updates.start_datetime || data.start_datetime)) {
    const eventStartTime = updates.start_datetime || data.start_datetime;
    const { success, error: reminderError } = await updateEventReminders(
      id,
      eventStartTime,
      reminderSettings
    );
    
    if (!success) {
      console.error('Failed to update reminders for event:', reminderError);
    }
  }

  return { data, error };
}

/**
 * Delete an event by ID
 * @param id The ID of the event to delete
 */
export async function deleteEvent(id: string): Promise<{ success: boolean; error: any }> {
  // Cancel any pending reminders for this event
  await cancelEventReminders(id);

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', id);

  return { success: !error, error };
}

/**
 * Get attendance records for an event using discord_event_id
 */
export async function getEventAttendance(eventId: string): Promise<{ 
  accepted: any[]; 
  declined: any[]; 
  tentative: any[]; 
  error: any 
}> {
  try {
    // First get the event to retrieve its discord_event_id
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('discord_event_id')
      .eq('id', eventId)
      .single();

    if (eventError) {
      throw eventError;
    }

    if (!eventData?.discord_event_id) {
      return { 
        accepted: [], 
        declined: [], 
        tentative: [],
        error: null
      };
    }

    // Then get all attendance records for this discord event
    const { data: attendanceData, error: attendanceError } = await supabase
      .from('discord_event_attendance')
      .select('*')
      .eq('discord_event_id', eventData.discord_event_id);

    if (attendanceError) {
      throw attendanceError;
    }

  // Define the attendee type
    type Attendee = {
      boardNumber: string;
      callsign: string;
      discord_id: string | null;
    };

    // Format the response to match the expected structure
    const attendance = {
      accepted: [] as Attendee[],
      declined: [] as Attendee[],
      tentative: [] as Attendee[]
    };
    
    // Process each attendance record
    attendanceData?.forEach(record => {
      // Prepare the attendee object
      const attendee: Attendee = {
        boardNumber: record.discord_id ? record.discord_id.substring(0, 3) : 'N/A',
        callsign: record.discord_username || 'Unknown User',
        discord_id: record.discord_id
      };
      
      // Add to the appropriate list based on user_response
      if (record.user_response === 'accepted') {
        attendance.accepted.push(attendee);
      } else if (record.user_response === 'declined') {
        attendance.declined.push(attendee);
      } else if (record.user_response === 'tentative') {
        attendance.tentative.push(attendee);
      }
    });

    return { ...attendance, error: null };
  } catch (error) {
    console.error('Error fetching event attendance:', error);
    return { 
      accepted: [], 
      declined: [], 
      tentative: [],
      error
    };
  }
}

/**
 * Update or create attendance record for a user at an event
 * @param eventId The ID of the event
 * @param discordId The Discord ID of the user
 * @param discordUsername The Discord username of the user
 * @param status The attendance status ('accepted', 'declined', or 'tentative')
 */
export async function updateAttendance(
  eventId: string,
  discordId: string,
  discordUsername: string,
  status: 'accepted' | 'declined' | 'tentative'
): Promise<{ data: any | null; error: any }> {
  try {
    // First get the event to retrieve its discord_event_id
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('discord_event_id')
      .eq('id', eventId)
      .single();

    if (eventError) {
      return { data: null, error: eventError };
    }

    if (!eventData?.discord_event_id) {
      return { data: null, error: new Error('Event does not have a Discord event ID') };
    }

    // Check if an attendance record already exists
    const { data: existingRecord, error: fetchError } = await supabase
      .from('discord_event_attendance')
      .select('*')
      .eq('discord_event_id', eventData.discord_event_id)
      .eq('discord_id', discordId)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      return { data: null, error: fetchError };
    }

    // If record exists, update it
    if (existingRecord) {
      const { data, error } = await supabase
        .from('discord_event_attendance')
        .update({
          user_response: status,
          discord_username: discordUsername,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingRecord.id)
        .select()
        .single();

      if (error) {
        return { data: null, error };
      }
      return { data, error: null };
    } 
    
    // Otherwise, create a new record
    const { data, error } = await supabase
      .from('discord_event_attendance')
      .insert({
        discord_event_id: eventData.discord_event_id,
        discord_id: discordId,
        discord_username: discordUsername,
        user_response: status
      })
      .select()
      .single();

    if (error) {
      return { data: null, error };
    }
    return { data, error: null };
  } catch (error) {
    console.error('Error updating attendance:', error);
    return { data: null, error };
  }
}

/**
 * Convert a database event to application Event type
 * @param dbEvent The event from the database
 */
export function convertDatabaseEventToAppEvent(dbEvent: Event): any {
  // Map the database event to the application event type structure
  return {
    id: dbEvent.id,
    title: dbEvent.name,
    description: dbEvent.description,
    datetime: dbEvent.start_datetime,
    endDatetime: dbEvent.end_datetime,
    status: dbEvent.status || 'upcoming', // Default to upcoming if status is null
    creator: {
      boardNumber: 'N/A', // These fields may not be available in the database
      callsign: 'System',
      billet: ''
    },
    attendance: {
      accepted: [],
      declined: [],
      tentative: []
    },
    eventType: dbEvent.event_type || dbEvent.type,
    discordEventId: dbEvent.discord_event_id,
    cycleId: dbEvent.cycle_id,
    guildId: dbEvent.discord_guild_id,
    imageUrl: dbEvent.image_url
  };
}

/**
 * Convert multiple database events to application Event type
 */
export function convertDatabaseEventsToAppEvents(dbEvents: Event[]): any[] {
  return dbEvents.map(convertDatabaseEventToAppEvent);
}