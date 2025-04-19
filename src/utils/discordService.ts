import type { Event } from '../types/EventTypes';
import { supabase } from './supabaseClient';

interface PublishEventResponse {
  success: boolean;
  discordMessageId?: string;
  guildId?: string;
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
        let endTime = event.endTime || event.endDatetime;
        if (!endTime && startTime) {
          const startDate = new Date(startTime);
          const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour
          endTime = endDate.toISOString();
        }
        
        // Get Discord settings from database
        const { data: settingsData, error: settingsError } = await supabase
          .from('squadron_settings')
          .select('key, value')
          .in('key', ['discord_guild_id', 'events_channel_id']);
        
        if (settingsError) {
          throw new Error(`Failed to fetch Discord settings: ${settingsError.message}`);
        }
        
        let guildId = null;
        let channelId = null;
        
        // Extract settings from the response
        if (settingsData) {
          settingsData.forEach(setting => {
            if (setting.key === 'discord_guild_id' && setting.value) {
              guildId = setting.value;
            } else if (setting.key === 'events_channel_id' && setting.value) {
              channelId = setting.value;
            }
          });
        }
        
        // Fall back to localStorage only if database settings are missing
        if (!guildId) {
          guildId = localStorage.getItem('discordSelectedServer');
          console.log(`[DEBUG] Using fallback guildId from localStorage: ${guildId}`);
        }
        
        if (!channelId) {
          channelId = localStorage.getItem('discordSelectedChannel');
          console.log(`[DEBUG] Using fallback channelId from localStorage: ${channelId}`);
        }
        
        // Validate we have the required settings
        if (!guildId) {
          throw new Error('Discord server ID not configured. Please configure Discord integration in settings.');
        }
        
        if (!channelId) {
          throw new Error('Discord events channel ID not configured. Please configure Discord integration in settings.');
        }

        console.log(`[DEBUG] Request ${requestId}: Sending publish request to server with guild ID: ${guildId} and channel ID: ${channelId}`);
  
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
            requestId: requestId, // Also include in body for logging
            guildId: guildId, // Include the Discord server ID
            channelId: channelId // Include the Discord channel ID
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
            discordMessageId: data.discordMessageId,
            guildId: data.discordGuildId
          };
        }

        return {
          success: true,
          discordMessageId: data.discordMessageId,
          guildId: data.discordGuildId
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
 * Updates the Discord event information in the database
 * @param eventId The event ID
 * @param discordMessageId The Discord message ID
 * @param guildId The Discord guild (server) ID
 */
export async function updateEventDiscordId(
  eventId: string, 
  discordMessageId: string,
  guildId?: string
): Promise<boolean> {
  try {
    // Update object to apply to the database
    const updateObj: any = { discord_event_id: discordMessageId };
    
    // Include guild ID if provided
    if (guildId) {
      updateObj.discord_guild_id = guildId;
    }
    
    // Update the event in the database with Discord information
    const { error } = await supabase
      .from('events')
      .update(updateObj)
      .eq('id', eventId);
    
    if (error) {
      console.error('Error updating event Discord IDs:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Unexpected error updating event Discord IDs:', error);
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
 * Interface for Discord server information
 */
export interface DiscordServer {
  id: string;
  name: string;
  memberCount: number;
  icon: string | null;
  hasEventsChannel: boolean;
}

/**
 * Fetches available Discord servers that the bot has access to
 * @returns List of available Discord servers
 */
export async function getAvailableDiscordServers(): Promise<{ 
  success: boolean;
  servers?: DiscordServer[];
  error?: string;
}> {
  try {
    console.log('[DEBUG] Fetching available Discord servers');
    
    const response = await fetch('http://localhost:3001/api/discord/servers', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch Discord servers');
    }
    
    if (!data.success) {
      throw new Error(data.error || 'Server returned unsuccessful response');
    }
    
    return {
      success: true,
      servers: data.servers
    };
  } catch (error) {
    console.error('Error fetching Discord servers:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error fetching Discord servers'
    };
  }
}

/**
 * Fetches channels for a specific Discord server
 * @param guildId The Discord guild ID to fetch channels for
 * @returns List of text channels available in the guild
 */
export async function getServerChannels(guildId: string): Promise<{
  success: boolean;
  channels?: Array<{id: string, name: string, type: string}>;
  error?: string;
}> {
  try {
    console.log(`[DEBUG] Fetching channels for Discord server ID: ${guildId}`);
    
    const response = await fetch(`http://localhost:3001/api/discord/servers/${guildId}/channels`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch Discord channels');
    }
    
    if (!data.success) {
      throw new Error(data.error || 'Server returned unsuccessful response');
    }
    
    return {
      success: true,
      channels: data.channels
    };
  } catch (error) {
    console.error('Error fetching Discord channels:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error fetching Discord channels'
    };
  }
}

/**
 * Delete a Discord message for an event that's being deleted
 * @param eventOrMessageId The event object or Discord message ID string
 * @param guildId Optional guild ID if known
 * @param channelId Optional channel ID if known
 */
export async function deleteDiscordMessage(eventOrMessageId: Event | string, guildId?: string, channelId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Extract the Discord message ID from either the event object or use the string directly
    let discordMessageId: string | undefined;
    
    if (typeof eventOrMessageId === 'object') {      // It's an event object, try to extract the message ID
      const eventObj = eventOrMessageId as any; // Cast to any to access potential properties
      console.log(`[DEBUG] Event object properties for extraction:`, Object.keys(eventObj));
      
      // First check for direct event properties
      discordMessageId = eventObj.discord_event_id || eventObj.discordMessageId || eventObj.discordEventId || undefined;
      
      // If we still don't have an ID, let's query the database directly using the event ID
      if (!discordMessageId && eventObj.id) {
        console.log(`[DEBUG] No Discord ID in event object, checking database for event ID: ${eventObj.id}`);
        
        // Perform a direct database lookup for this event
        try {
          const { data, error } = await supabase
            .from('events')
            .select('discord_event_id')
            .eq('id', eventObj.id)
            .single();
            
          if (!error && data && data.discord_event_id) {
            discordMessageId = data.discord_event_id;
            console.log(`[DEBUG] Found Discord message ID in database: ${discordMessageId}`);
          } else if (error) {
            console.log(`[DEBUG] Database lookup error: ${error.message}`);
          } else {
            console.log(`[DEBUG] No Discord message ID found in database for event ${eventObj.id}`);
          }
        } catch (dbError) {
          console.error(`[DEBUG] Error looking up event in database:`, dbError);
        }
      }
      
      console.log(`[DEBUG] Extracted message ID from event object: ${discordMessageId}`);
      
      // Also check for guild ID and channel ID in the event if we don't have them yet
      if (!guildId && eventObj.discord_guild_id) {
        guildId = eventObj.discord_guild_id;
      }
      
      if (!channelId && eventObj.discord_channel_id) {
        channelId = eventObj.discord_channel_id;
      }
    } else {
      // It's already a string
      discordMessageId = eventOrMessageId;
    }
    
    // Skip if no Discord message ID was provided
    if (!discordMessageId) {
      console.log('[DEBUG] No Discord message ID could be extracted for deletion');
      return { success: true };
    }
    
    console.log(`[DEBUG] Attempting to delete Discord message: ${discordMessageId} from guild: ${guildId || 'unknown'}, channel: ${channelId || 'unknown'}`);
    console.log(`[DEBUG] Message type check: typeof discordMessageId = ${typeof discordMessageId}, length = ${discordMessageId?.length}`);
    
    // Check if messageId is a valid format
    if (discordMessageId.length < 17 || !/^\d+$/.test(discordMessageId)) {
      console.log(`[WARNING] Discord message ID ${discordMessageId} doesn't appear to be in valid format (should be a numeric string)`);
    }
    
    // If we don't have a guild ID or channel ID, try to get them from database first
    if (!guildId || !channelId) {
      try {
        console.log(`[DEBUG] Looking up server/channel info for message: ${discordMessageId}`);
        
        // First try to get IDs from the events table
        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select('id, discord_guild_id, discord_channel_id, discord_event_id')
          .eq('discord_event_id', discordMessageId)
          .single();
          
        if (eventError) {
          console.log(`[DEBUG] Error finding message in events table: ${eventError.message}`);
          console.log(`[DEBUG] Will try alternative lookup options`);
        }
        
        if (!eventError && eventData) {
          console.log(`[DEBUG] Found event with message ID ${discordMessageId}: ${JSON.stringify(eventData)}`);
          
          if (!guildId && eventData.discord_guild_id) {
            guildId = eventData.discord_guild_id;
            console.log(`[DEBUG] Using guild ID from events table: ${guildId}`);
          }
          
          if (!channelId && eventData.discord_channel_id) {
            channelId = eventData.discord_channel_id;
            console.log(`[DEBUG] Using channel ID from events table: ${channelId}`);
          }
        } else {
          // If not found with discord_event_id, try looking up with discordMessageId as the field name
          console.log(`[DEBUG] Trying alternative lookup with field 'discordMessageId'`);
          const { data: altEventData, error: altEventError } = await supabase
            .from('events')
            .select('id, discord_guild_id, discord_channel_id, discordMessageId')
            .eq('discordMessageId', discordMessageId)
            .single();
            
          if (!altEventError && altEventData) {
            console.log(`[DEBUG] Found event with alt field lookup: ${JSON.stringify(altEventData)}`);
            
            if (!guildId && altEventData.discord_guild_id) {
              guildId = altEventData.discord_guild_id;
              console.log(`[DEBUG] Using guild ID from alternative lookup: ${guildId}`);
            }
            
            if (!channelId && altEventData.discord_channel_id) {
              channelId = altEventData.discord_channel_id;
              console.log(`[DEBUG] Using channel ID from alternative lookup: ${channelId}`);
            }
          } else if (altEventError) {
            console.log(`[DEBUG] Alt lookup error: ${altEventError.message}`);
          }
        }
          // If still missing IDs, try to get them from squadron_settings
        if (!guildId || !channelId) {
          console.log(`[DEBUG] Still missing ${!guildId ? 'guildId' : ''}${(!guildId && !channelId) ? ' and ' : ''}${!channelId ? 'channelId' : ''}, checking squadron_settings`);
          
          const { data: settingsData, error: settingsError } = await supabase
            .from('squadron_settings')
            .select('key, value')
            .in('key', ['discord_guild_id', 'events_channel_id']);
            
          if (settingsError) {
            console.log(`[DEBUG] Error fetching Discord settings: ${settingsError.message}`);
          }
          
          if (!settingsError && settingsData) {
            console.log(`[DEBUG] Found settings data: ${JSON.stringify(settingsData)}`);
            
            for (const setting of settingsData) {
              if (setting.key === 'discord_guild_id' && setting.value && !guildId) {
                guildId = setting.value;
                console.log(`[DEBUG] Using guild ID from squadron_settings: ${guildId}`);
              } else if (setting.key === 'events_channel_id' && setting.value && !channelId) {
                channelId = setting.value;
                console.log(`[DEBUG] Using channel ID from squadron_settings: ${channelId}`);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error retrieving Discord IDs:', err);
        // Continue without guild/channel IDs if lookup fails
      }
    }
    
    // As a last resort, try localStorage
    if (!guildId) {
      const localStorageGuildId = localStorage.getItem('discordSelectedServer');
      if (localStorageGuildId) {
        guildId = localStorageGuildId;
        console.log(`[DEBUG] Using guild ID from localStorage: ${guildId}`);
      }
    }
    
    if (!channelId) {
      const localStorageChannelId = localStorage.getItem('discordSelectedChannel');
      if (localStorageChannelId) {
        channelId = localStorageChannelId;
        console.log(`[DEBUG] Using channel ID from localStorage: ${channelId}`);
      }
    }
      // Check if we have the required IDs
    if (!guildId) {
      console.log(`[WARNING] No guild ID found for message ${discordMessageId}. Deletion may fail.`);
    }
    
    if (!channelId) {
      console.log(`[WARNING] No channel ID found for message ${discordMessageId}. Deletion may fail.`);
    }
    
    // Build the URL with optional guild ID as a query parameter
    let url = `http://localhost:3001/api/events/${discordMessageId}`;
    const queryParams = [];
    
    if (guildId) {
      queryParams.push(`guildId=${encodeURIComponent(guildId)}`);
    }
    
    if (channelId) {
      queryParams.push(`channelId=${encodeURIComponent(channelId)}`);
    }
    
    if (queryParams.length > 0) {
      url += `?${queryParams.join('&')}`;
    }
      console.log(`[DEBUG] Sending delete request to: ${url}`);
    
    // Call the server API to delete the message
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log(`[DEBUG] Delete response status: ${response.status} ${response.statusText}`);
    
    const data = await response.json();
    console.log(`[DEBUG] Full delete response:`, data);
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete Discord message');
    }
    
    console.log(`[DEBUG] Discord message deletion response for ${discordMessageId}:`, data);
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Error deleting Discord message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during message deletion'
    };
  }
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