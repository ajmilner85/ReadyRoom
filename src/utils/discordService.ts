import type { Event } from '../types/EventTypes';
import { supabase } from './supabaseClient';

interface PublishEventResponse {
  success: boolean;
  discordMessageId?: string;
  error?: string;
}

// Track our publish requests to detect duplicates
const publishRequestsInProgress = new Set();

/**
 * Publishes an event to Discord via the backend API with retry logic and better error handling
 * @param event The event to publish
 * @returns Response containing success status and Discord message ID
 */
export async function publishEventToDiscord(event: Event): Promise<PublishEventResponse> {
  // Generate a unique request ID to track this publish attempt
  const requestId = `publish-${event.id}-${Date.now()}`;
  
  // Check if we're already processing a publish for this event
  if (publishRequestsInProgress.has(event.id)) {
    console.log(`[DEBUG] Duplicate publish request detected for event ${event.id}, skipping`);
    return {
      success: false,
      error: 'A publish operation for this event is already in progress'
    };
  }
  
  // Mark this event as being published
  publishRequestsInProgress.add(event.id);
  console.log(`[DEBUG] Starting publish request ${requestId} for event ${event.id}`);
  
  try {
    // Max number of retries
    const MAX_RETRIES = 2;
    // Delay between retries in milliseconds
    const RETRY_DELAY = 1000;
    
    // Function to delay execution
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Function to attempt the publish request
    const attemptPublish = async (retryCount: number = 0): Promise<PublishEventResponse> => {
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

        console.log(`[DEBUG] Request ${requestId}: Sending publish request to server`);
  
        // Set a reasonable timeout for the fetch call
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch('http://localhost:3001/api/events/publish', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId // Add a request ID for tracking
          },
          body: JSON.stringify({
            title: event.title,
            description: event.description,
            startTime: startTime,
            endTime: endTime,
            eventId: event.id, // Include the event ID so server can update the record
            requestId: requestId // Also include in body for logging
          }),
          signal: controller.signal
        });
        
        // Clear the timeout to prevent potential memory leaks
        clearTimeout(timeoutId);

        const data = await response.json();
        console.log(`[DEBUG] Request ${requestId}: Received response from server:`, data);

        if (!response.ok) {
          throw new Error(data.error || 'Server responded with an error status');
        }
        
        // If the event was already published, just return the existing ID
        if (data.alreadyPublished) {
          console.log(`[DEBUG] Request ${requestId}: Event was already published, returning existing ID`);
          return {
            success: true,
            discordMessageId: data.discordMessageId
          };
        }
        
        // Save Discord Message ID to localStorage as a backup
        try {
          const discordMap = JSON.parse(localStorage.getItem('eventDiscordMessageIds') || '{}');
          discordMap[event.id] = data.discordMessageId;
          localStorage.setItem('eventDiscordMessageIds', JSON.stringify(discordMap));
        } catch (err) {
          // Silent failure for localStorage operations
        }

        return {
          success: true,
          discordMessageId: data.discordMessageId,
        };
      } catch (error) {
        console.log(`[DEBUG] Request ${requestId}: Error during publish attempt ${retryCount + 1}:`, error);
        
        // If we have retries left and it's not an abort error, try again
        if (retryCount < MAX_RETRIES && !(error instanceof DOMException && error.name === 'AbortError')) {
          console.log(`[DEBUG] Request ${requestId}: Retrying in ${RETRY_DELAY}ms... (${retryCount + 1}/${MAX_RETRIES})`);
          await delay(RETRY_DELAY);
          return attemptPublish(retryCount + 1);
        }
        
        // If it's an abort error, provide a clearer message
        if (error instanceof DOMException && error.name === 'AbortError') {
          return {
            success: false,
            error: 'Request timed out. The server might be busy or offline.',
          };
        }
        
        // Otherwise return the original error
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    };
    
    // Start the publish attempt with retries
    return await attemptPublish();
  } finally {
    // Always remove the event from in-progress set when done
    console.log(`[DEBUG] Completed publish request ${requestId} for event ${event.id}`);
    publishRequestsInProgress.delete(event.id);
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
      return false;
    }
    
    return true;
  } catch (error) {
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
    }
    
    return true;
  } catch (error) {
    return false;
  }
}