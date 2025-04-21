import { supabase } from './supabaseClient';
import type { Database } from '../types/supabase';

export type Event = Database['public']['Tables']['events']['Row'];
export type NewEvent = Database['public']['Tables']['events']['Insert'];
export type UpdateEvent = Database['public']['Tables']['events']['Update'];
export type DiscordEventAttendance = Database['public']['Tables']['discord_event_attendance']['Row'];
export type NewDiscordEventAttendance = Database['public']['Tables']['discord_event_attendance']['Insert'];

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
 */
export async function createEvent(event: NewEvent): Promise<{ data: Event | null; error: any }> {
  const { data, error } = await supabase
    .from('events')
    .insert(event)
    .select()
    .single();

  return { data, error };
}

/**
 * Update an existing event
 * @param id The ID of the event to update
 * @param updates The event data to update
 */
export async function updateEvent(id: string, updates: UpdateEvent): Promise<{ data: Event | null; error: any }> {
  const { data, error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  return { data, error };
}

/**
 * Delete an event by ID
 * @param id The ID of the event to delete
 */
export async function deleteEvent(id: string): Promise<{ success: boolean; error: any }> {
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

    // Format the response to match the expected structure
    const attendance = {
      accepted: [],
      declined: [],
      tentative: []
    };
    
    // Process each attendance record
    attendanceData?.forEach(record => {
      // Prepare the attendee object
      const attendee = {
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
 * This is maintained for compatibility but will likely be replaced by Discord interactions
 */
export async function updateAttendance(attendance: any): Promise<{ data: any | null; error: any }> {
  // This would need to be reworked for the new structure if needed
  console.warn('updateAttendance is not implemented for discord_event_attendance');
  return { data: null, error: new Error('Not implemented') };
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
    description: dbEvent.description || '',
    datetime: dbEvent.start_datetime || dbEvent.date, // Use start_datetime if available, fall back to date
    endDatetime: dbEvent.end_datetime,
    status: dbEvent.status,
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
    eventType: dbEvent.type as any,
    discordMessageId: dbEvent.discord_message_id,
    discordEventId: dbEvent.discord_event_id
  };
}

/**
 * Convert multiple database events to application Event type
 */
export function convertDatabaseEventsToAppEvents(dbEvents: Event[]): any[] {
  return dbEvents.map(convertDatabaseEventToAppEvent);
}