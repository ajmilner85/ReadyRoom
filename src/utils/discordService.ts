import type { Event } from '../types/EventTypes';
import { supabase } from './supabaseClient';

interface PublishEventResponse {
  success: boolean;
  discordMessageId?: string;
  error?: string;
}

/**
 * Publishes an event to Discord via the backend API
 * @param event The event to publish
 * @returns Response containing success status and Discord message ID
 */
export async function publishEventToDiscord(event: Event): Promise<PublishEventResponse> {
  try {
    // Use the datetime field as the startTime if startTime is not provided
    const startTime = event.startTime || event.datetime;
    
    // Calculate an endTime 1 hour after startTime if not provided
    let endTime = event.endTime;
    if (!endTime && startTime) {
      const startDate = new Date(startTime);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour
      endTime = endDate.toISOString();
    }

    const response = await fetch('http://localhost:3001/api/events/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: event.title,
        description: event.description,
        startTime: startTime,
        endTime: endTime,
        eventId: event.id, // Include the event ID so server can update the record
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to publish event to Discord');
    }

    return {
      success: true,
      discordMessageId: data.discordMessageId,
    };
  } catch (error) {
    console.error('Discord publish error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Updates the discord_event_id field in the database for an event
 * @param eventId The event ID
 * @param discordMessageId The Discord message ID
 */
export async function updateEventDiscordId(eventId: string, discordMessageId: string): Promise<boolean> {
  try {
    // Update the event in the database with the Discord message ID
    const { error } = await supabase
      .from('events')
      .update({ discord_event_id: discordMessageId })
      .eq('id', eventId);
    
    if (error) {
      console.error('Error updating discord_event_id:', error);
      return false;
    }
    
    console.log(`Successfully updated discord_event_id for event ${eventId}`);
    return true;
  } catch (error) {
    console.error('Failed to update discord_event_id:', error);
    return false;
  }
}

/**
 * Interface for Discord attendance response
 */
interface DiscordAttendanceResponse {
  success: boolean;
  attendees?: {
    userId: string;
    username: string;
    status: 'yes' | 'no' | 'maybe';
  }[];
  error?: string;
}

/**
 * Fetches attendance data from Discord for a specific event
 * @param discordMessageId The Discord message ID of the event
 * @returns Attendance data from Discord
 */
export async function getEventAttendanceFromDiscord(discordMessageId: string): Promise<DiscordAttendanceResponse> {
  try {
    const response = await fetch(`http://localhost:3001/api/events/${discordMessageId}/attendance`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch attendance from Discord');
    }

    return {
      success: true,
      attendees: data.attendees,
    };
  } catch (error) {
    console.error('Discord attendance fetch error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Syncs Discord attendance data with the local database
 * @param eventId The local event ID
 * @param discordMessageId The Discord message ID
 * @returns Boolean indicating success or failure
 */
export async function syncDiscordAttendance(eventId: string, discordMessageId: string): Promise<boolean> {
  try {
    // Fetch attendance data from Discord
    const attendanceData = await getEventAttendanceFromDiscord(discordMessageId);
    
    if (!attendanceData.success || !attendanceData.attendees) {
      console.error('Failed to fetch attendance data:', attendanceData.error);
      return false;
    }
    
    // For each attendee, update or create attendance record in the database
    for (const attendee of attendanceData.attendees) {
      // Get pilot by Discord user ID
      const { data: pilots, error: pilotError } = await supabase
        .from('pilots')
        .select('id')
        .eq('discord_id', attendee.userId)
        .single();
        
      if (pilotError || !pilots) {
        console.warn(`No pilot found with Discord ID ${attendee.userId}`);
        continue;
      }
      
      // Map Discord status to local attendance status
      let status = 'confirmed';
      if (attendee.status === 'maybe') status = 'tentative';
      if (attendee.status === 'no') status = 'declined';
      
      // Upsert attendance record
      const { error } = await supabase
        .from('event_attendance')
        .upsert({
          event_id: eventId,
          pilot_id: pilots.id,
          status: status,
          discord_synced: true,
          last_synced: new Date().toISOString()
        });
        
      if (error) {
        console.error('Error updating attendance:', error);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Failed to sync Discord attendance:', error);
    return false;
  }
}