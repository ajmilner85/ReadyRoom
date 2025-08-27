import type { Event } from '../types/EventTypes';
import { supabase } from './supabaseClient';

interface PublishEventResponse {
  success: boolean;
  discordMessageId?: string;
  guildId?: string;
  error?: string;
}

interface MultiChannelPublishResponse {
  success: boolean;
  publishedChannels: {
    squadronId: string;
    guildId: string;
    channelId: string;
    discordMessageId: string;
  }[];
  errors: {
    squadronId: string;
    error: string;
  }[];
}

// Track our publish requests to detect duplicates
const publishRequestsInProgress = new Set();

interface DiscordRole {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  position: number;
  permissions: string;
  managed: boolean;
  mentionable: boolean;
}

interface DiscordGuildMember {
  user?: {
    id: string;
    username: string;
    discriminator: string;
    avatar?: string;
  };
  nick?: string;
  roles: string[];
  joined_at: string;
  premium_since?: string;
}

/**
 * Fetch Discord guild member information including roles
 */
export async function fetchDiscordGuildMember(guildId: string, userId: string): Promise<{
  member: DiscordGuildMember | null;
  roles: DiscordRole[];
  error?: string;
}> {
  try {
    // console.log(`[DISCORD-MEMBER-DEBUG] Fetching member info for user ${userId} in guild ${guildId}`);
    
    const response = await fetch(`http://localhost:3001/api/discord/guild/${guildId}/member/${userId}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      // console.error('[DISCORD-MEMBER-DEBUG] API error:', errorData);
      return {
        member: null,
        roles: [],
        error: errorData.error || 'Failed to fetch Discord member information'
      };
    }
    
    const data = await response.json();
    // console.log('[DISCORD-MEMBER-DEBUG] Successfully fetched member data:', data);
    
    return {
      member: data.member,
      roles: data.member?.roles || [],
      error: undefined
    };
    
  } catch (error) {
    // console.error('[DISCORD-MEMBER-DEBUG] Network error:', error);
    return {
      member: null,
      roles: [],
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Fetch all Discord guild roles
 */
export async function fetchDiscordGuildRoles(guildId: string): Promise<{
  roles: DiscordRole[];
  error?: string;
}> {
  try {
    // console.log(`[DISCORD-ROLES-DEBUG] Fetching guild roles for guild ${guildId}`);
    
    const response = await fetch(`http://localhost:3001/api/discord/guild/${guildId}/roles`);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('[DISCORD-ROLES-DEBUG] API error:', errorData);
      return {
        roles: [],
        error: errorData.error || 'Failed to fetch Discord guild roles'
      };
    }
    
    const data = await response.json();
    // console.log('[DISCORD-ROLES-DEBUG] Successfully fetched roles:', data);
    
    return {
      roles: data.roles || [],
      error: undefined
    };
    
  } catch (error) {
    console.error('[DISCORD-ROLES-DEBUG] Network error:', error);
    return {
      roles: [],
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Publishes an event to multiple squadron Discord channels
 * @param event The event to publish
 * @param squadronIds Array of squadron IDs to publish to
 * @returns Response containing success status and published channels
 */
/**
 * Publishes an event based on its cycle's participating squadrons
 * @param event The event to publish
 * @returns Response containing success status and published channels
 */
export async function publishEventFromCycle(event: Event): Promise<MultiChannelPublishResponse> {
  const publishedChannels: { squadronId: string; guildId: string; channelId: string; discordMessageId: string; }[] = [];
  const errors: { squadronId: string; error: string; }[] = [];
  
  try {
    let participatingSquadrons: string[] = [];
    let cycleType: string = '';
    
    // Use event-level participating squadrons if they exist, otherwise get from cycle
    // console.log('[PARTICIPANT-DEBUG] Event participants:', event.participants);
    // console.log('[PARTICIPANT-DEBUG] Event participants length:', event.participants?.length);
    // console.log('[PARTICIPANT-DEBUG] Event cycleId:', event.cycleId);
    // console.log('[PARTICIPANT-DEBUG] Event object keys:', Object.keys(event));
    
    if (event.participants && event.participants.length > 0) {
      participatingSquadrons = event.participants;
      // console.log('[PARTICIPANT-DEBUG] Using event-level participants:', participatingSquadrons);
    } else if (event.cycleId) {
      // Get the event's cycle to find participating squadrons
      const { data: cycleData, error: cycleError } = await supabase
        .from('cycles')
        .select('participants, type')
        .eq('id', event.cycleId)
        .single();
      
      if (cycleError || !cycleData) {
        return {
          success: false,
          publishedChannels: [],
          errors: [{ squadronId: '', error: 'Failed to fetch cycle information' }]
        };
      }
      
      participatingSquadrons = cycleData.participants || [];
      cycleType = cycleData.type;
      // console.log('[PARTICIPANT-DEBUG] Got participants from cycle:', participatingSquadrons);
    } else {
      // console.log('[PARTICIPANT-DEBUG] No cycleId found, cannot determine participating squadrons');
      return {
        success: false,
        publishedChannels: [],
        errors: [{ squadronId: '', error: 'Event has no associated cycle or participating squadrons. Please ensure the event is part of a cycle with configured squadrons, or manually specify participating squadrons.' }]
      };
    }
    
    if (participatingSquadrons.length === 0) {
      // console.log('[PARTICIPANT-DEBUG] Participating squadrons array is empty');
      return {
        success: false,
        publishedChannels: [],
        errors: [{ squadronId: '', error: 'No participating squadrons configured. Please configure participating squadrons in the cycle settings or manually specify them for this event.' }]
      };
    }
    
    // console.log(`[MULTI-DISCORD-DEBUG] Publishing to ${participatingSquadrons.length} squadrons:`, participatingSquadrons);
    
    // Get Discord settings for all participating squadrons
    const { data: squadronDiscordData, error: squadronDiscordError } = await supabase
      .from('org_squadrons')
      .select('id, name, discord_integration')
      .in('id', participatingSquadrons);
    
    if (squadronDiscordError) {
      throw new Error(`Failed to fetch squadron Discord settings: ${squadronDiscordError.message}`);
    }
    
    // Create a UNION of unique channels to prevent duplicates when squadrons share channels
    const uniqueChannels = new Map<string, {
      guildId: string;
      channelId: string;
      squadronIds: string[];
      squadronNames: string[];
    }>();
    
    // First pass: collect unique guild+channel combinations
    for (const squadronId of participatingSquadrons) {
      const squadronData = squadronDiscordData?.find(s => s.id === squadronId);
      
      if (!squadronData || !squadronData.discord_integration) {
        errors.push({
          squadronId,
          error: 'No Discord integration configured for this squadron'
        });
        continue;
      }
      
      const discordIntegration = squadronData.discord_integration;
      const selectedGuildId = discordIntegration.selectedGuildId;
      
      if (!selectedGuildId) {
        errors.push({
          squadronId,
          error: 'No Discord server configured for this squadron'
        });
        continue;
      }
      
      // Always use the events channel for each squadron
      const discordChannels = discordIntegration.discordChannels || [];
      const eventsChannel = discordChannels.find((ch: any) => ch.type === 'events');
      
      if (!eventsChannel) {
        errors.push({
          squadronId,
          error: 'No events channel configured for this squadron'
        });
        continue;
      }
      
      // Create unique key for guild+channel combination
      const channelKey = `${selectedGuildId}:${eventsChannel.id}`;
      
      if (uniqueChannels.has(channelKey)) {
        // Add this squadron to existing channel entry
        const existing = uniqueChannels.get(channelKey)!;
        existing.squadronIds.push(squadronId);
        existing.squadronNames.push(squadronData.name);
      } else {
        // Create new channel entry
        uniqueChannels.set(channelKey, {
          guildId: selectedGuildId,
          channelId: eventsChannel.id,
          squadronIds: [squadronId],
          squadronNames: [squadronData.name]
        });
      }
    }
    
    // console.log(`[MULTI-DISCORD-DEBUG] Found ${uniqueChannels.size} unique channels for ${participatingSquadrons.length} squadrons`);
    
    // Second pass: publish to each unique channel once
    for (const [channelKey, channelInfo] of uniqueChannels) {
      try {
        // console.log(`[MULTI-DISCORD-DEBUG] Publishing to unique channel ${channelKey} for squadrons: ${channelInfo.squadronNames.join(', ')}`);
        
        // Publish to this unique channel
        const publishResult = await publishToSpecificChannel(
          event,
          channelInfo.guildId,
          channelInfo.channelId
        );
        
        // console.log(`[MULTI-DISCORD-DEBUG] Publish result for channel ${channelKey}:`, publishResult);
        
        if (publishResult.success && publishResult.discordMessageId) {
          // Add a result for each squadron that shares this channel
          for (const squadronId of channelInfo.squadronIds) {
            publishedChannels.push({
              squadronId,
              guildId: channelInfo.guildId,
              channelId: channelInfo.channelId,
              discordMessageId: publishResult.discordMessageId
            });
          }
        } else {
          // Add errors for all squadrons that share this failed channel
          for (const squadronId of channelInfo.squadronIds) {
            errors.push({
              squadronId,
              error: publishResult.error || 'Failed to publish to shared channel'
            });
          }
        }
        
      } catch (error) {
        // Add errors for all squadrons that share this failed channel
        for (const squadronId of channelInfo.squadronIds) {
          errors.push({
            squadronId,
            error: error instanceof Error ? error.message : 'Unknown error publishing to shared channel'
          });
        }
      }
    }
    
    return {
      success: publishedChannels.length > 0,
      publishedChannels,
      errors
    };
    
  } catch (error) {
    console.error('Error in publishEventFromCycle:', error);
    return {
      success: false,
      publishedChannels: [],
      errors: participatingSquadrons.map(id => ({
        squadronId: id,
        error: error instanceof Error ? error.message : 'Unknown error'
      }))
    };
  }
}

/**
 * Publishes an event to a specific Discord channel
 * @param event The event to publish
 * @param guildId The Discord guild ID
 * @param channelId The Discord channel ID  
 * @returns Response containing success status and Discord message ID
 */
async function publishToSpecificChannel(event: Event, guildId: string, channelId: string): Promise<PublishEventResponse> {
  try {
    const startTime = event.datetime;
    let endTime = event.endDatetime;
    if (!endTime && startTime) {
      const startDate = new Date(startTime);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour
      endTime = endDate.toISOString();
    }
    
    // Generate a unique request ID for tracking
    const requestId = `publish-${event.id}-${guildId}-${channelId}-${Date.now()}`;
    // console.log(`[MULTI-DISCORD-DEBUG] Making direct API call ${requestId} to guild ${guildId}, channel ${channelId}`);
    
    const requestBody = {
      title: event.title,
      description: event.description,
      startTime: startTime,
      endTime: endTime,
      eventId: event.id,
      guildId: guildId,
      channelId: channelId,
      // Handle both legacy and JSONB image formats
      imageUrl: event.imageUrl || (event as any).image_url,
      hasImage: Boolean(event.imageUrl || (event as any).image_url),
      images: {
        headerImage: event.headerImageUrl,
        additionalImages: event.additionalImageUrls || [],
        // Legacy fallback
        imageUrl: event.imageUrl || (event as any).image_url
      },
      creator: event.creator
    };
    
    const response = await fetch('http://localhost:3001/api/events/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    const data = await response.json();
    
    // console.log(`[MULTI-DISCORD-DEBUG] API response ${requestId}: status=${response.status}, data=`, data);
    
    if (!response.ok) {
      throw new Error(data.error || 'Server responded with an error status');
    }
    
    return {
      success: true,
      discordMessageId: data.discordMessageId,
      guildId: data.discordGuildId
    };
    
  } catch (error) {
    console.error(`[MULTI-DISCORD-DEBUG] Error in publishToSpecificChannel for guild ${guildId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

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
    // console.log(`[DEBUG] Duplicate publish request detected for event ${event.id}, skipping`);
    return {
      success: false,
      error: 'A publish operation for this event is already in progress'
    };
  }
  
  // Mark this event as being published
  publishRequestsInProgress.add(event.id);
  // console.log(`[DEBUG] Starting publish request ${requestId} for event ${event.id}`);
  
  try {
    // Max number of retries
    const MAX_RETRIES = 2;
    // Delay between retries in milliseconds
    const RETRY_DELAY = 1000;
    
    // Function to delay execution
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Function to attempt the publish request
    const attemptPublish = async (retryCount: number = 0): Promise<PublishEventResponse> => {
      try {        // Use the datetime field as the startTime
        const startTime = event.datetime;
        
        // Calculate an endTime 1 hour after startTime if not provided
        let endTime = event.endDatetime;
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
          // console.log(`[DEBUG] Using fallback guildId from localStorage: ${guildId}`);
        }
        
        if (!channelId) {
          channelId = localStorage.getItem('discordSelectedChannel');
          // console.log(`[DEBUG] Using fallback channelId from localStorage: ${channelId}`);
        }
        
        // Validate we have the required settings
        if (!guildId) {
          throw new Error('Discord server ID not configured. Please configure Discord integration in settings.');
        }
        
        if (!channelId) {
          throw new Error('Discord events channel ID not configured. Please configure Discord integration in settings.');
        }

        // console.log(`[DEBUG] Request ${requestId}: Sending publish request to server with guild ID: ${guildId} and channel ID: ${channelId}`);
  
        // Set a reasonable timeout for the fetch call
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          const response = await fetch('http://localhost:3001/api/events/publish', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId // Add a request ID for tracking
          },          body: JSON.stringify({
            title: event.title,
            description: event.description,
            startTime: startTime,
            endTime: endTime,
            eventId: event.id, // Include the event ID so server can update the record
            requestId: requestId, // Also include in body for logging
            guildId: guildId, // Include the Discord server ID
            channelId: channelId, // Include the Discord channel ID
            
            // Get image URL from any available source
            imageUrl: event.imageUrl || (event as any).image_url,
            
            // Explicitly tell the server whether there's an image
            hasImage: Boolean(event.imageUrl || (event as any).image_url),
            
            // Add additional debugging information
            debugImageInfo: {
              imageUrl: event.imageUrl,
              image_url: (event as any).image_url,
              eventProps: Object.keys(event)
            }
          }),
          signal: controller.signal
        });
        
        // Clear the timeout to prevent potential memory leaks
        clearTimeout(timeoutId);

        const data = await response.json();
        // console.log(`[DEBUG] Request ${requestId}: Received response from server:`, data);

        if (!response.ok) {
          throw new Error(data.error || 'Server responded with an error status');
        }
        
        // If the event was already published, just return the existing ID
        if (data.alreadyPublished) {
          // console.log(`[DEBUG] Request ${requestId}: Event was already published, returning existing ID`);
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
        // console.log(`[DEBUG] Request ${requestId}: Error during publish attempt ${retryCount + 1}:`, error);
        
        // If we have retries left and it's not an abort error, try again
        if (retryCount < MAX_RETRIES && !(error instanceof DOMException && error.name === 'AbortError')) {
          // console.log(`[DEBUG] Request ${requestId}: Retrying in ${RETRY_DELAY}ms... (${retryCount + 1}/${MAX_RETRIES})`);
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
    // console.log(`[DEBUG] Completed publish request ${requestId} for event ${event.id}`);
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
 * Updates event with multiple Discord message IDs from different squadrons using JSONB structure
 * @param eventId The event ID
 * @param publishedChannels Array of published channel information
 * @returns Boolean indicating success
 */
export async function updateEventMultipleDiscordIds(
  eventId: string,
  publishedChannels: { squadronId: string; guildId: string; channelId: string; discordMessageId: string; }[]
): Promise<boolean> {
  try {
    if (!publishedChannels || publishedChannels.length === 0) {
      return false;
    }
    
    // Create JSONB array structure for discord_event_id
    const discordPublications = publishedChannels.map(channel => ({
      messageId: channel.discordMessageId,
      guildId: channel.guildId,
      channelId: channel.channelId,
      squadronId: channel.squadronId
    }));
    
    console.log(`[UPDATE-DISCORD-IDS] Storing ${discordPublications.length} Discord publications for event ${eventId}:`, discordPublications);
    
    // Update the event with the JSONB array of Discord message information
    const { error } = await supabase
      .from('events')
      .update({
        discord_event_id: discordPublications,
        discord_guild_id: publishedChannels[0].guildId // Keep first guild ID for backward compatibility
      })
      .eq('id', eventId);
    
    if (error) {
      console.error('Error updating event with Discord publications:', error);
      return false;
    }
    
    console.log(`[UPDATE-DISCORD-IDS] Successfully stored Discord publications for event ${eventId}`);
    return true;
  } catch (error) {
    console.error('Unexpected error updating event with Discord publications:', error);
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
    // console.log('[DEBUG] Fetching available Discord servers');
    
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
    // console.log(`[DEBUG] Fetching channels for Discord server ID: ${guildId}`);
    
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
/**
 * Deletes Discord messages for a multi-channel event by re-deriving participating squadrons
 */
export async function deleteMultiChannelEvent(event: Event): Promise<{ success: boolean; deletedCount: number; errors: string[] }> {
  try {
    // console.log('[DELETE-MULTI-DEBUG] Starting deleteMultiChannelEvent for event:', event.id);
    // console.log('[DELETE-MULTI-DEBUG] Event discord_event_id:', event.discord_event_id);
    // console.log('[DELETE-MULTI-DEBUG] Event discord_event_id type:', typeof event.discord_event_id);
    // console.log('[DELETE-MULTI-DEBUG] Event discord_event_id isArray:', Array.isArray(event.discord_event_id));
    // console.log('[DELETE-MULTI-DEBUG] Event discordEventId (legacy):', event.discordEventId);
    
    let participatingSquadrons: string[] = [];
    const errors: string[] = [];
    let deletedCount = 0;
    
    // Use event-level participating squadrons if they exist, otherwise get from cycle
    if (event.participants && event.participants.length > 0) {
      // console.log('[DELETE-MULTI-DEBUG] Using event-level participants:', event.participants);
      participatingSquadrons = event.participants;
    } else if (event.cycleId) {
      // console.log('[DELETE-MULTI-DEBUG] Event has no participants, fetching from cycle:', event.cycleId);
      // console.log('[DELETE-MULTI-DEBUG] About to query database for cycle participants...');
      
      // Get the event's cycle to find participating squadrons
      const { data: cycleData, error: cycleError } = await supabase
        .from('cycles')
        .select('participants')
        .eq('id', event.cycleId)
        .single();
      
      // console.log('[DELETE-MULTI-DEBUG] Database query completed. CycleData:', cycleData, 'Error:', cycleError);
      
      if (cycleError || !cycleData) {
        // console.log('[DELETE-MULTI-DEBUG] Failed to fetch cycle data - returning error');
        return {
          success: false,
          deletedCount: 0,
          errors: ['Failed to fetch cycle information for deletion']
        };
      }
      
      participatingSquadrons = cycleData.participants || [];
    } else {
      return {
        success: false,
        deletedCount: 0,
        errors: ['Event has no associated cycle or participating squadrons']
      };
    }
    
    if (participatingSquadrons.length === 0) {
      return {
        success: false,
        deletedCount: 0,
        errors: ['No participating squadrons found for deletion']
      };
    }
    
    console.log(`[DELETE-MULTI-DISCORD] Deleting from ${participatingSquadrons.length} squadrons:`, participatingSquadrons);
    
    // Get Discord settings for all participating squadrons
    const { data: squadronDiscordData, error: squadronDiscordError } = await supabase
      .from('org_squadrons')
      .select('id, name, discord_integration')
      .in('id', participatingSquadrons);
    
    if (squadronDiscordError) {
      throw new Error(`Failed to fetch squadron Discord settings: ${squadronDiscordError.message}`);
    }
    
    // Process each squadron for deletion
    for (const squadronId of participatingSquadrons) {
      try {
        console.log(`[DELETE-MULTI-DISCORD] Processing deletion for squadron ${squadronId}`);
        
        // Find Discord settings for this squadron
        const squadronData = squadronDiscordData?.find(s => s.id === squadronId);
        
        if (!squadronData || !squadronData.discord_integration) {
          errors.push(`No Discord integration configured for squadron ${squadronId}`);
          continue;
        }
        
        const discordIntegration = squadronData.discord_integration;
        const selectedGuildId = discordIntegration.selectedGuildId;
        
        if (!selectedGuildId) {
          errors.push(`No Discord server configured for squadron ${squadronId}`);
          continue;
        }
        
        // Always use the events channel for each squadron
        const discordChannels = discordIntegration.discordChannels || [];
        const eventsChannel = discordChannels.find((ch: any) => ch.type === 'events');
        
        if (!eventsChannel) {
          errors.push(`No events channel configured for squadron ${squadronId}`);
          continue;
        }
        
        console.log(`[DELETE-MULTI-DISCORD] Attempting to delete from guild ${selectedGuildId}, channel ${eventsChannel.id} for squadron ${squadronData.name}`);
        
        // Find the specific Discord message ID for this squadron/guild/channel combination
        let messageIdForThisChannel: string | undefined;
        
        if (Array.isArray(event.discord_event_id)) {
          // New JSONB structure - find the message for this specific squadron/guild/channel
          const publication = event.discord_event_id.find(pub => 
            pub.squadronId === squadronId && 
            pub.guildId === selectedGuildId && 
            pub.channelId === eventsChannel.id
          );
          messageIdForThisChannel = publication?.messageId;
          console.log(`[DELETE-MULTI-DISCORD] Found message ID from JSONB for squadron ${squadronId}: ${messageIdForThisChannel}`);
        } else {
          // If discord_event_id is not an array, we need to fetch fresh data from database
          console.log(`[DELETE-MULTI-DISCORD] discord_event_id is not array (type: ${typeof event.discord_event_id}), fetching fresh data from database`);
          
          try {
            const { data: freshEvent, error: fetchError } = await supabase
              .from('events')
              .select('discord_event_id')
              .eq('id', event.id)
              .single();
              
            if (fetchError) {
              console.error(`[DELETE-MULTI-DISCORD] Error fetching fresh event data:`, fetchError);
              messageIdForThisChannel = event.discordEventId || event.discord_event_id;
              console.log(`[DELETE-MULTI-DISCORD] Fallback to legacy message ID: ${messageIdForThisChannel}`);
            } else if (Array.isArray(freshEvent.discord_event_id)) {
              const publication = freshEvent.discord_event_id.find(pub => 
                pub.squadronId === squadronId && 
                pub.guildId === selectedGuildId && 
                pub.channelId === eventsChannel.id
              );
              messageIdForThisChannel = publication?.messageId;
              console.log(`[DELETE-MULTI-DISCORD] Found message ID from fresh DB data for squadron ${squadronId}: ${messageIdForThisChannel}`);
            } else {
              // Still not an array, use legacy approach
              messageIdForThisChannel = event.discordEventId || event.discord_event_id;
              console.log(`[DELETE-MULTI-DISCORD] Fresh data still not array, using legacy message ID: ${messageIdForThisChannel}`);
            }
          } catch (dbError) {
            console.error(`[DELETE-MULTI-DISCORD] Exception fetching fresh data:`, dbError);
            messageIdForThisChannel = event.discordEventId || event.discord_event_id;
            console.log(`[DELETE-MULTI-DISCORD] Exception fallback to legacy message ID: ${messageIdForThisChannel}`);
          }
        }
        
        if (!messageIdForThisChannel) {
          errors.push(`No Discord message ID found for squadron ${squadronData.name} in guild ${selectedGuildId}, channel ${eventsChannel.id}`);
          continue;
        }
        
        // Try to delete using the found message ID
        const deleteResult = await deleteDiscordMessageFromChannel(
          messageIdForThisChannel,
          selectedGuildId,
          eventsChannel.id
        );
        
        if (deleteResult.success) {
          deletedCount++;
          console.log(`[DELETE-MULTI-DISCORD] Successfully deleted from squadron ${squadronData.name}`);
        } else {
          errors.push(`Failed to delete from squadron ${squadronData.name}: ${deleteResult.error}`);
        }
        
      } catch (error) {
        errors.push(`Error processing deletion for squadron ${squadronId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return {
      success: deletedCount > 0,
      deletedCount,
      errors
    };
    
  } catch (error) {
    console.error('Error in deleteMultiChannelEvent:', error);
    return {
      success: false,
      deletedCount: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

/**
 * Deletes a Discord message from a specific channel
 */
async function deleteDiscordMessageFromChannel(messageId: string, guildId: string, channelId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!messageId) {
      return { success: true }; // Nothing to delete
    }
    
    // console.log(`[DEBUG] Sending delete request to: http://localhost:3001/api/events/${messageId}?guildId=${guildId}&channelId=${channelId}`);
    
    const response = await fetch(`http://localhost:3001/api/events/${messageId}?guildId=${guildId}&channelId=${channelId}`, {
      method: 'DELETE',
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `Server responded with status ${response.status}`);
    }
    
    return {
      success: true
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function deleteDiscordMessage(eventOrMessageId: Event | string, guildId?: string, channelId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Extract the Discord message ID from either the event object or use the string directly
    let discordMessageId: string | undefined;
    
    if (typeof eventOrMessageId === 'object') {      // It's an event object, try to extract the message ID
      const eventObj = eventOrMessageId as any; // Cast to any to access potential properties
      // console.log(`[DEBUG] Event object properties for extraction:`, Object.keys(eventObj));
      
      // First check for direct event properties
      discordMessageId = eventObj.discord_event_id || eventObj.discordMessageId || eventObj.discordEventId || undefined;
      
      // If we still don't have an ID, let's query the database directly using the event ID
      if (!discordMessageId && eventObj.id) {
        // console.log(`[DEBUG] No Discord ID in event object, checking database for event ID: ${eventObj.id}`);
        
        // Perform a direct database lookup for this event
        try {
          const { data, error } = await supabase
            .from('events')
            .select('discord_event_id')
            .eq('id', eventObj.id)
            .single();
            
          if (!error && data && data.discord_event_id) {
            discordMessageId = data.discord_event_id;
            // console.log(`[DEBUG] Found Discord message ID in database: ${discordMessageId}`);
          } else if (error) {
            // console.log(`[DEBUG] Database lookup error: ${error.message}`);
          } else {
            // console.log(`[DEBUG] No Discord message ID found in database for event ${eventObj.id}`);
          }
        } catch (dbError) {
          console.error(`[DEBUG] Error looking up event in database:`, dbError);
        }
      }
      
      // console.log(`[DEBUG] Extracted message ID from event object: ${discordMessageId}`);
      
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
      // console.log('[DEBUG] No Discord message ID could be extracted for deletion');
      return { success: true };
    }
    
    // console.log(`[DEBUG] Attempting to delete Discord message: ${discordMessageId} from guild: ${guildId || 'unknown'}, channel: ${channelId || 'unknown'}`);
    // console.log(`[DEBUG] Message type check: typeof discordMessageId = ${typeof discordMessageId}, length = ${discordMessageId?.length}`);
    
    // Check if messageId is a valid format
    if (discordMessageId.length < 17 || !/^\d+$/.test(discordMessageId)) {
      console.log(`[WARNING] Discord message ID ${discordMessageId} doesn't appear to be in valid format (should be a numeric string)`);
    }
    
    // If we don't have a guild ID or channel ID, try to get them from database first
    if (!guildId || !channelId) {
      try {
        // console.log(`[DEBUG] Looking up server/channel info for message: ${discordMessageId}`);
          // First try to get IDs from the events table
        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select('id, discord_event_id, discordEventId')
          .eq('discord_event_id', discordMessageId)
          .single();
          
        if (eventError) {
          // console.log(`[DEBUG] Error finding message in events table: ${eventError.message}`);
          // console.log(`[DEBUG] Will try alternative lookup options`);
        }
        
        if (!eventError && eventData) {
          // console.log(`[DEBUG] Found event with message ID ${discordMessageId}: ${JSON.stringify(eventData)}`);
          
          // Note: It appears discord_guild_id and discord_channel_id might not exist in your schema
          // Using type checking to safely access potentially non-existent properties
          if (!guildId && 'discord_guild_id' in eventData) {
            guildId = eventData['discord_guild_id'] as string;
            // console.log(`[DEBUG] Using guild ID from events table: ${guildId}`);
          }
          
          if (!channelId && 'discord_channel_id' in eventData) {
            channelId = eventData['discord_channel_id'] as string;
            // console.log(`[DEBUG] Using channel ID from events table: ${channelId}`);
          }
        } else {          // If not found with discord_event_id, try looking up with discordMessageId as the field name
          // console.log(`[DEBUG] Trying alternative lookup with field 'discordMessageId'`);
          const { data: altEventData, error: altEventError } = await supabase
            .from('events')
            .select('id, discordMessageId, discordEventId')
            .eq('discordMessageId', discordMessageId)
            .single();
            
          if (!altEventError && altEventData) {
            // console.log(`[DEBUG] Found event with alt field lookup: ${JSON.stringify(altEventData)}`);
            
            // Safe access with type checking for alternative lookup as well
            if (!guildId && 'discord_guild_id' in altEventData) {
              guildId = altEventData['discord_guild_id'] as string;
              // console.log(`[DEBUG] Using guild ID from alternative lookup: ${guildId}`);
            }
            
            if (!channelId && 'discord_channel_id' in altEventData) {
              channelId = altEventData['discord_channel_id'] as string;
              // console.log(`[DEBUG] Using channel ID from alternative lookup: ${channelId}`);
            }
          } else if (altEventError) {
            // console.log(`[DEBUG] Alt lookup error: ${altEventError.message}`);
          }
        }
          // If still missing IDs, try to get them from squadron_settings
        if (!guildId || !channelId) {
          // console.log(`[DEBUG] Still missing ${!guildId ? 'guildId' : ''}${(!guildId && !channelId) ? ' and ' : ''}${!channelId ? 'channelId' : ''}, checking squadron_settings`);
          
          const { data: settingsData, error: settingsError } = await supabase
            .from('squadron_settings')
            .select('key, value')
            .in('key', ['discord_guild_id', 'events_channel_id']);
            
          if (settingsError) {
            // console.log(`[DEBUG] Error fetching Discord settings: ${settingsError.message}`);
          }
          
          if (!settingsError && settingsData) {
            // console.log(`[DEBUG] Found settings data: ${JSON.stringify(settingsData)}`);
            
            for (const setting of settingsData) {
              if (setting.key === 'discord_guild_id' && setting.value && !guildId) {
                guildId = setting.value;
                // console.log(`[DEBUG] Using guild ID from squadron_settings: ${guildId}`);
              } else if (setting.key === 'events_channel_id' && setting.value && !channelId) {
                channelId = setting.value;
                // console.log(`[DEBUG] Using channel ID from squadron_settings: ${channelId}`);
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
        // console.log(`[DEBUG] Using guild ID from localStorage: ${guildId}`);
      }
    }
    
    if (!channelId) {
      const localStorageChannelId = localStorage.getItem('discordSelectedChannel');
      if (localStorageChannelId) {
        channelId = localStorageChannelId;
        // console.log(`[DEBUG] Using channel ID from localStorage: ${channelId}`);
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
      // console.log(`[DEBUG] Sending delete request to: ${url}`);
    
    // Call the server API to delete the message
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    // console.log(`[DEBUG] Delete response status: ${response.status} ${response.statusText}`);
    
    const data = await response.json();
    // console.log(`[DEBUG] Full delete response:`, data);
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete Discord message');
    }
    
    // console.log(`[DEBUG] Discord message deletion response for ${discordMessageId}:`, data);
    
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
    for (const attendee of attendanceData.attendees) {      // We don't need to look up pilots anymore since we're storing Discord data directly
      // Just record the Discord attendance directly
      // console.log(`[DEBUG] Recording Discord attendance for user ${attendee.username} with status ${attendee.status}`);
      // Upsert attendance record to discord_event_attendance table with the correct schema
      await supabase
        .from('discord_event_attendance')
        .upsert({
          discord_event_id: discordMessageId,
          discord_id: attendee.userId,
          discord_username: attendee.username,
          user_response: attendee.status
        });
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Syncs attendance data from multiple Discord channels for a single event
 * @param eventId The local event ID
 * @param discordPublications Array of Discord publication information
 * @returns Boolean indicating success or failure
 */
/**
 * Edits a Discord message in a specific channel
 */
async function editDiscordMessageInChannel(messageId: string, event: Event, guildId: string, channelId: string, originalStartTime?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const startTime = event.datetime;
    let endTime = event.endDatetime;
    if (!endTime && startTime) {
      const startDate = new Date(startTime);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour
      endTime = endDate.toISOString();
    }
    
    // console.log(`[EDIT-DISCORD-DEBUG] Editing message ${messageId} in guild ${guildId}, channel ${channelId}`);
    
    const requestBody = {
      title: event.title,
      description: event.description,
      startTime: startTime,
      endTime: endTime,
      guildId: guildId,
      channelId: channelId,
      // Handle both legacy and JSONB image formats
      imageUrl: event.imageUrl || (typeof (event as any).image_url === 'object' ? (event as any).image_url?.headerImage : (event as any).image_url),
      // Pass the full JSONB structure for multi-image support
      images: typeof (event as any).image_url === 'object' ? (event as any).image_url : {
        headerImage: event.headerImageUrl,
        additionalImages: event.additionalImageUrls || [],
        imageUrl: event.imageUrl || (event as any).image_url
      },
      creator: event.creator,
      // Add the original start time and event ID for reminder updates
      originalStartTime: originalStartTime,
      eventId: event.id
    };
    
    // console.log('[EDIT-REQUEST-DEBUG] Sending to Discord bot:', {
    //   messageId,
    //   title: requestBody.title,
    //   hasImages: !!(requestBody.images?.headerImage || requestBody.images?.additionalImages?.length),
    //   hasCreator: !!requestBody.creator,
    //   creator: requestBody.creator
    // });
    
    const response = await fetch(`http://localhost:3001/api/events/${messageId}/edit`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    const data = await response.json();
    
    // console.log(`[EDIT-DISCORD-DEBUG] Edit response for message ${messageId}: status=${response.status}, data=`, data);
    
    if (!response.ok) {
      throw new Error(data.error || 'Server responded with an error status');
    }
    
    return {
      success: true
    };
    
  } catch (error) {
    console.error(`[EDIT-DISCORD-DEBUG] Error editing message ${messageId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Updates a multi-channel Discord event by editing existing messages in place where possible,
 * and falling back to delete-and-recreate for multi-channel events
 */
export async function updateMultiChannelEvent(event: Event, originalStartTime?: string): Promise<{ success: boolean; publishedCount: number; errors: string[] }> {
  try {
    console.log(`[UPDATE-MULTI-DISCORD] Starting edit for event ${event.id}`);
    console.log(`[UPDATE-MULTI-DISCORD] Event data:`, {
      id: event.id,
      title: event.title,
      cycleId: event.cycleId,
      participants: event.participants,
      discord_event_id: event.discord_event_id
    });
    
    let participatingSquadrons: string[] = [];
    const errors: string[] = [];
    let editedCount = 0;
    
    // Use event-level participating squadrons if they exist, otherwise get from cycle
    if (event.participants && event.participants.length > 0) {
      participatingSquadrons = event.participants;
    } else if (event.cycleId) {
      // Get the event's cycle to find participating squadrons
      const { data: cycleData, error: cycleError } = await supabase
        .from('cycles')
        .select('participants')
        .eq('id', event.cycleId)
        .single();
      
      if (cycleError || !cycleData) {
        return {
          success: false,
          publishedCount: 0,
          errors: ['Failed to fetch cycle information for update']
        };
      }
      
      participatingSquadrons = cycleData.participants || [];
    } else {
      return {
        success: false,
        publishedCount: 0,
        errors: ['Event has no associated cycle or participating squadrons']
      };
    }
    
    if (participatingSquadrons.length === 0) {
      return {
        success: false,
        publishedCount: 0,
        errors: ['No participating squadrons found for update']
      };
    }
    
    console.log(`[UPDATE-MULTI-DISCORD] Editing messages in ${participatingSquadrons.length} squadrons:`, participatingSquadrons);
    
    // Get Discord settings for all participating squadrons
    const { data: squadronDiscordData, error: squadronDiscordError } = await supabase
      .from('org_squadrons')
      .select('id, name, discord_integration')
      .in('id', participatingSquadrons);
    
    if (squadronDiscordError) {
      throw new Error(`Failed to fetch squadron Discord settings: ${squadronDiscordError.message}`);
    }
    
    // Process each squadron for editing
    for (const squadronId of participatingSquadrons) {
      try {
        console.log(`[UPDATE-MULTI-DISCORD] Processing edit for squadron ${squadronId}`);
        
        // Find Discord settings for this squadron
        const squadronData = squadronDiscordData?.find(s => s.id === squadronId);
        
        if (!squadronData || !squadronData.discord_integration) {
          errors.push(`No Discord integration configured for squadron ${squadronId}`);
          continue;
        }
        
        const discordIntegration = squadronData.discord_integration;
        const selectedGuildId = discordIntegration.selectedGuildId;
        
        if (!selectedGuildId) {
          errors.push(`No Discord server configured for squadron ${squadronId}`);
          continue;
        }
        
        // Always use the events channel for each squadron
        const discordChannels = discordIntegration.discordChannels || [];
        const eventsChannel = discordChannels.find((ch: any) => ch.type === 'events');
        
        if (!eventsChannel) {
          errors.push(`No events channel configured for squadron ${squadronId}`);
          continue;
        }
        
        console.log(`[UPDATE-MULTI-DISCORD] Attempting to edit message in guild ${selectedGuildId}, channel ${eventsChannel.id} for squadron ${squadronData.name}`);
        
        // Find the specific Discord message ID for this squadron/guild/channel combination
        let messageIdForThisChannel: string | undefined;
        
        if (Array.isArray(event.discord_event_id)) {
          // New JSONB structure - find the message for this specific squadron/guild/channel
          const publication = event.discord_event_id.find(pub => 
            pub.squadronId === squadronId && 
            pub.guildId === selectedGuildId && 
            pub.channelId === eventsChannel.id
          );
          messageIdForThisChannel = publication?.messageId;
          console.log(`[UPDATE-MULTI-DISCORD] Found message ID from JSONB for squadron ${squadronId}: ${messageIdForThisChannel}`);
        } else if (typeof event.discord_event_id === 'string') {
          // Legacy single message ID - only works for the first squadron
          messageIdForThisChannel = event.discord_event_id;
          console.log(`[UPDATE-MULTI-DISCORD] Using legacy single message ID: ${messageIdForThisChannel}`);
        } else if (event.discordEventId) {
          // Fallback to legacy discordEventId field
          messageIdForThisChannel = event.discordEventId;
          console.log(`[UPDATE-MULTI-DISCORD] Using legacy discordEventId: ${messageIdForThisChannel}`);
        }
        
        if (messageIdForThisChannel) {
          const editResult = await editDiscordMessageInChannel(
            messageIdForThisChannel,
            event,
            selectedGuildId,
            eventsChannel.id,
            originalStartTime
          );
          
          if (editResult.success) {
            editedCount++;
            console.log(`[UPDATE-MULTI-DISCORD] Successfully edited message for squadron ${squadronData.name}`);
          } else {
            console.log(`[UPDATE-MULTI-DISCORD] Edit failed for squadron ${squadronData.name}: ${editResult.error}`);
            errors.push(`Edit failed for squadron ${squadronData.name}: ${editResult.error}`);
          }
        } else {
          errors.push(`No Discord message ID found for squadron ${squadronData.name} in guild ${selectedGuildId}, channel ${eventsChannel.id}`);
        }
        
      } catch (error) {
        errors.push(`Error processing edit for squadron ${squadronId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return {
      success: editedCount > 0,
      publishedCount: editedCount,
      errors
    };
    
  } catch (error) {
    console.error('Error in updateMultiChannelEvent:', error);
    return {
      success: false,
      publishedCount: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

export async function syncMultiChannelDiscordAttendance(
  eventId: string,
  discordPublications: { squadronId: string; discordMessageId: string; }[]
): Promise<boolean> {
  try {
    let overallSuccess = true;
    const aggregatedAttendance = new Map<string, {
      userId: string;
      username: string;
      status: 'yes' | 'no' | 'maybe';
      squadronId: string;
    }>();
    
    // Fetch attendance from each Discord channel
    for (const publication of discordPublications) {
      try {
        const attendanceData = await getEventAttendanceFromDiscord(publication.discordMessageId);
        
        if (attendanceData.success && attendanceData.attendees) {
          // Add attendees to aggregated map, with most recent response taking precedence
          for (const attendee of attendanceData.attendees) {
            const existingAttendee = aggregatedAttendance.get(attendee.userId);
            
            // If user doesn't exist or this is a more definitive response (yes/no vs maybe), update it
            if (!existingAttendee || 
                (attendee.status !== 'maybe' && existingAttendee.status === 'maybe')) {
              aggregatedAttendance.set(attendee.userId, {
                userId: attendee.userId,
                username: attendee.username,
                status: attendee.status,
                squadronId: publication.squadronId
              });
            }
          }
        } else {
          console.warn(`Failed to fetch attendance for message ${publication.discordMessageId}`);
          overallSuccess = false;
        }
      } catch (error) {
        console.error(`Error fetching attendance for squadron ${publication.squadronId}:`, error);
        overallSuccess = false;
      }
    }
    
    // Clear existing attendance records for this event
    await supabase
      .from('discord_event_attendance')
      .delete()
      .in('discord_event_id', discordPublications.map(p => p.discordMessageId));
    
    // Insert aggregated attendance records
    const attendanceRecords = Array.from(aggregatedAttendance.values()).map(attendee => ({
      event_id: eventId,
      discord_event_id: discordPublications.find(p => p.squadronId === attendee.squadronId)?.discordMessageId,
      discord_id: attendee.userId,
      discord_username: attendee.username,
      user_response: attendee.status,
      squadron_id: attendee.squadronId
    }));
    
    if (attendanceRecords.length > 0) {
      const { error } = await supabase
        .from('discord_event_attendance')
        .insert(attendanceRecords);
      
      if (error) {
        console.error('Error inserting aggregated attendance records:', error);
        overallSuccess = false;
      } else {
        // console.log(`[DEBUG] Successfully aggregated attendance from ${discordPublications.length} channels: ${attendanceRecords.length} total attendees`);
      }
    }
    
    return overallSuccess;
  } catch (error) {
    console.error('Error in syncMultiChannelDiscordAttendance:', error);
    return false;
  }
}