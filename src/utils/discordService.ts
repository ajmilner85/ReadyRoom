import type { Event } from '../types/EventTypes';
import { supabase } from './supabaseClient';
import { getUserSettings } from './userSettingsService';

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

// Helper function to get the Discord bot environment from user settings
async function getDiscordEnvironment(): Promise<'development' | 'production'> {
  try {
    const settingsResult = await getUserSettings();
    if (settingsResult.success && settingsResult.data?.developer?.discordBotToken) {
      return settingsResult.data.developer.discordBotToken;
    }
  } catch (error) {
    console.warn('Failed to get user Discord environment setting:', error);
  }
  
  // Default to development if we can't get the setting
  return 'development';
}

// Helper function to detect if we're running in local development
// function isLocalDevelopment(): boolean {
//   // Check if we're running on localhost or if VITE_API_URL points to localhost
//   return window.location.hostname === 'localhost' ||
//          window.location.hostname === '127.0.0.1' ||
//          import.meta.env.VITE_API_URL?.includes('localhost');
// }

// Helper function to get the appropriate API base URL
// This should ALWAYS use VITE_API_URL - backend and bot connections are decoupled
function getDiscordApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL || 'http://localhost:3001';
}

// Helper function to add Discord environment to API request headers
async function getDiscordHeaders(): Promise<Record<string, string>> {
  const environment = await getDiscordEnvironment();
  return {
    'Content-Type': 'application/json',
    'X-Discord-Environment': environment
  };
}

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
    
    const headers = await getDiscordHeaders();
    const baseUrl = getDiscordApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/discord/guild/${guildId}/member/${userId}`, {
      method: 'GET',
      headers
    });
    
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
    
    const headers = await getDiscordHeaders();
    const baseUrl = getDiscordApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/discord/guild/${guildId}/roles`, {
      method: 'GET',
      headers
    });
    
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
  let participatingSquadrons: string[] = [];
  
  try {
    
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
      
      participatingSquadrons = Array.isArray(cycleData.participants) ? cycleData.participants as string[] : [];
      // cycleType = cycleData.type;
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
      notificationRoles: Array<{ id: string; name: string }>;
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
      
      const discordIntegration = squadronData.discord_integration as any;
      const selectedGuildId = discordIntegration?.selectedGuildId;
      
      if (!selectedGuildId) {
        errors.push({
          squadronId,
          error: 'No Discord server configured for this squadron'
        });
        continue;
      }
      
      // Always use the events channel for each squadron
      const discordChannels = discordIntegration?.discordChannels || [];
      const eventsChannel = discordChannels.find((ch: any) => ch.type === 'events');
      
      if (!eventsChannel) {
        errors.push({
          squadronId,
          error: 'No events channel configured for this squadron'
        });
        continue;
      }
      
      // Get squadron's default notification roles
      const squadronNotificationRoles = discordIntegration?.defaultNotificationRoles || [];
      
      // Create unique key for guild+channel combination
      const channelKey = `${selectedGuildId}:${eventsChannel.id}`;
      
      if (uniqueChannels.has(channelKey)) {
        // Add this squadron to existing channel entry
        const existing = uniqueChannels.get(channelKey)!;
        existing.squadronIds.push(squadronId);
        existing.squadronNames.push(squadronData.name);
        // Add squadron's notification roles (will deduplicate later)
        existing.notificationRoles.push(...squadronNotificationRoles);
      } else {
        // Create new channel entry
        uniqueChannels.set(channelKey, {
          guildId: selectedGuildId,
          channelId: eventsChannel.id,
          squadronIds: [squadronId],
          squadronNames: [squadronData.name],
          notificationRoles: [...squadronNotificationRoles]
        });
      }
    }
    
    // console.log(`[MULTI-DISCORD-DEBUG] Found ${uniqueChannels.size} unique channels for ${participatingSquadrons.length} squadrons`);
    
    // Second pass: publish to each unique channel once
    for (const [_channelKey, channelInfo] of uniqueChannels) {
      try {
        // console.log(`[MULTI-DISCORD-DEBUG] Publishing to unique channel ${channelKey} for squadrons: ${channelInfo.squadronNames.join(', ')}`);
        
        // Deduplicate notification roles by role ID
        const uniqueRoles = new Map<string, { id: string; name: string }>();
        for (const role of channelInfo.notificationRoles) {
          if (!uniqueRoles.has(role.id)) {
            uniqueRoles.set(role.id, role);
          }
        }
        const deduplicatedRoles = Array.from(uniqueRoles.values());
        
        console.log(`[ROLE-DEDUP] Publishing to channel ${channelInfo.channelId} with ${deduplicatedRoles.length} unique roles (from ${channelInfo.notificationRoles.length} total across squadrons)`);
        
        // Publish to this unique channel with deduplicated roles
        const publishResult = await publishToSpecificChannel(
          event,
          channelInfo.guildId,
          channelInfo.channelId,
          deduplicatedRoles
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
async function publishToSpecificChannel(
  event: Event,
  guildId: string,
  channelId: string,
  notificationRoles?: Array<{ id: string; name: string }>
): Promise<PublishEventResponse> {
  try {
    const startTime = event.datetime;
    let endTime = event.endDatetime;
    if (!endTime && startTime) {
      const startDate = new Date(startTime);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour
      endTime = endDate.toISOString();
    }

    // Generate a unique request ID for tracking
    // const requestId = `publish-${event.id}-${guildId}-${channelId}-${Date.now()}`;
    // console.log(`[MULTI-DISCORD-DEBUG] Making direct API call ${requestId} to guild ${guildId}, channel ${channelId}`);

    // Construct the title: "{Cycle Name} - {Event Name}" if part of a cycle, otherwise just event name
    let title = event.title;
    if (event.cycleId) {
      const { data: cycleData } = await supabase
        .from('cycles')
        .select('name')
        .eq('id', event.cycleId)
        .single();

      if (cycleData?.name) {
        title = `${cycleData.name} - ${event.title}`;
      }
    }

    const requestBody = {
      title: title,
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
      creator: event.creator,
      // Include deduplicated notification roles
      notificationRoles: notificationRoles || []
    };
    
    const headers = await getDiscordHeaders();
    const baseUrl = getDiscordApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/events/publish`, {
      method: 'POST',
      headers,
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
        
        // Discord settings should be retrieved from org_squadrons.discord_integration
        // This is a legacy fallback that should be updated
        console.warn('discordService needs update to use discord_integration field');
        let guildId = null;
        let channelId = null;
        
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

        // Construct the title: "{Cycle Name} - {Event Name}" if part of a cycle, otherwise just event name
        let title = event.title;
        if (event.cycleId) {
          const { data: cycleData } = await supabase
            .from('cycles')
            .select('name')
            .eq('id', event.cycleId)
            .single();

          if (cycleData?.name) {
            title = `${cycleData.name} - ${event.title}`;
          }
        }

        // Set a reasonable timeout for the fetch call
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        const headers = await getDiscordHeaders();
        const baseUrl = getDiscordApiBaseUrl();
        const response = await fetch(`${baseUrl}/api/events/publish`, {
          method: 'POST',
          headers: {
            ...headers,
            'X-Request-ID': requestId // Add a request ID for tracking
          },          body: JSON.stringify({
            title: title,
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
  _guildId?: string // Legacy parameter - guild ID now stored in discord_event_id JSONB
): Promise<boolean> {
  try {
    // Update object to apply to the database
    const updateObj: any = { discord_event_id: discordMessageId };
    
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
        discord_event_id: discordPublications
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
    
    const headers = await getDiscordHeaders();
    const baseUrl = getDiscordApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/discord/servers`, {
      method: 'GET',
      headers
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
    
    const headers = await getDiscordHeaders();
    const baseUrl = getDiscordApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/discord/servers/${guildId}/channels`, {
      method: 'GET',
      headers
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
/**
 * Resolves the stored Discord publication records for an event.
 * Always prefers fresh data from the database over the in-memory event object,
 * so deletions/edits target the guild+channel each message was actually posted
 * to — even if squadron Discord settings have changed since publication.
 */
async function getStoredPublications(event: Event): Promise<Array<{ squadronId: string; guildId: string; channelId: string; messageId: string }>> {
  let raw: any = event.discord_event_id;

  try {
    const { data: freshEvent, error: fetchError } = await supabase
      .from('events')
      .select('discord_event_id')
      .eq('id', event.id)
      .single();

    if (!fetchError && freshEvent) {
      raw = freshEvent.discord_event_id;
    }
  } catch (dbError) {
    console.error('[DISCORD-PUBLICATIONS] Error fetching fresh event data, using in-memory value:', dbError);
  }

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((pub: any) => pub && pub.messageId && pub.guildId && pub.channelId);
}

export async function deleteMultiChannelEvent(event: Event): Promise<{ success: boolean; deletedCount: number; errors: string[] }> {
  try {
    console.log('[DELETE-MULTI-DISCORD] Starting deleteMultiChannelEvent for event:', event.id);

    const errors: string[] = [];
    let deletedCount = 0;

    // Trust the stored publication records: they capture the exact guild+channel
    // each message was posted to, regardless of current squadron settings
    const publications = await getStoredPublications(event);

    if (publications.length === 0) {
      // Legacy fallback: single message ID with no stored guild/channel.
      // deleteDiscordMessage() handles resolving those from event data/settings.
      const legacyMessageId = event.discordEventId || (typeof event.discord_event_id === 'string' ? event.discord_event_id : undefined);

      if (legacyMessageId) {
        console.log(`[DELETE-MULTI-DISCORD] No publication records, falling back to legacy message ID: ${legacyMessageId}`);
        const legacyResult = await deleteDiscordMessage(event);
        return {
          success: legacyResult.success,
          deletedCount: legacyResult.success ? 1 : 0,
          errors: legacyResult.success ? [] : [legacyResult.error || 'Failed to delete legacy Discord message']
        };
      }

      return {
        success: false,
        deletedCount: 0,
        errors: ['No Discord publication records found for this event']
      };
    }

    // Deduplicate shared channels: squadrons sharing a channel store one
    // publication entry each with the same message ID
    const uniqueMessages = new Map<string, { guildId: string; channelId: string; messageId: string }>();
    for (const pub of publications) {
      const key = `${pub.guildId}:${pub.channelId}:${pub.messageId}`;
      if (!uniqueMessages.has(key)) {
        uniqueMessages.set(key, { guildId: pub.guildId, channelId: pub.channelId, messageId: pub.messageId });
      }
    }

    console.log(`[DELETE-MULTI-DISCORD] Deleting ${uniqueMessages.size} unique messages from ${publications.length} publication records`);

    for (const message of uniqueMessages.values()) {
      try {
        const deleteResult = await deleteDiscordMessageFromChannel(
          message.messageId,
          message.guildId,
          message.channelId
        );

        if (deleteResult.success) {
          deletedCount++;
          console.log(`[DELETE-MULTI-DISCORD] Successfully deleted message ${message.messageId} from guild ${message.guildId}, channel ${message.channelId}`);
        } else {
          errors.push(`Failed to delete message ${message.messageId} from guild ${message.guildId}, channel ${message.channelId}: ${deleteResult.error}`);
        }
      } catch (error) {
        errors.push(`Error deleting message ${message.messageId} from guild ${message.guildId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    
    const headers = await getDiscordHeaders();
    const baseUrl = getDiscordApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/events/${messageId}?guildId=${guildId}&channelId=${channelId}`, {
      method: 'DELETE',
      headers
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
            discordMessageId = String(data.discord_event_id);
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
      // Extract from discord_event_id JSONB structure if available
      if (!guildId && eventObj.discord_event_id && Array.isArray(eventObj.discord_event_id) && eventObj.discord_event_id.length > 0) {
        guildId = eventObj.discord_event_id[0].guildId;
      }
      
      if (!channelId && eventObj.discord_event_id && Array.isArray(eventObj.discord_event_id) && eventObj.discord_event_id.length > 0) {
        channelId = eventObj.discord_event_id[0].channelId;
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
          .select('id, discord_event_id')
          .eq('discord_event_id', discordMessageId)
          .single();
          
        if (eventError) {
          // console.log(`[DEBUG] Error finding message in events table: ${eventError.message}`);
          // console.log(`[DEBUG] Will try alternative lookup options`);
        }
        
        if (!eventError && eventData) {
          // console.log(`[DEBUG] Found event with message ID ${discordMessageId}: ${JSON.stringify(eventData)}`);
          
          // Extract guild ID and channel ID from discord_event_id JSONB structure
          if (!guildId && eventData.discord_event_id && Array.isArray(eventData.discord_event_id) && eventData.discord_event_id.length > 0 && eventData.discord_event_id[0]) {
            guildId = (eventData.discord_event_id[0] as any).guildId;
            // console.log(`[DEBUG] Using guild ID from discord_event_id: ${guildId}`);
          }
          
          if (!channelId && eventData.discord_event_id && Array.isArray(eventData.discord_event_id) && eventData.discord_event_id.length > 0 && eventData.discord_event_id[0]) {
            channelId = (eventData.discord_event_id[0] as any).channelId;
            // console.log(`[DEBUG] Using channel ID from discord_event_id: ${channelId}`);
          }
        } else {          // If not found with discord_event_id, try looking up with discordMessageId as the field name
          // console.log(`[DEBUG] Trying alternative lookup with field 'discordMessageId'`);
          const { data: altEventData, error: altEventError } = await supabase
            .from('events')
            .select('id, discord_event_id')
            .eq('discord_event_id', discordMessageId)
            .single();
            
          if (!altEventError && altEventData) {
            // console.log(`[DEBUG] Found event with alt field lookup: ${JSON.stringify(altEventData)}`);
            
            // Extract guild ID and channel ID from discord_event_id JSONB structure in alternative lookup
            if (!guildId && altEventData.discord_event_id && Array.isArray(altEventData.discord_event_id) && altEventData.discord_event_id.length > 0 && altEventData.discord_event_id[0]) {
              guildId = (altEventData.discord_event_id[0] as any).guildId;
              // console.log(`[DEBUG] Using guild ID from alternative lookup discord_event_id: ${guildId}`);
            }
            
            if (!channelId && altEventData.discord_event_id && Array.isArray(altEventData.discord_event_id) && altEventData.discord_event_id.length > 0 && altEventData.discord_event_id[0]) {
              channelId = (altEventData.discord_event_id[0] as any).channelId;
              // console.log(`[DEBUG] Using channel ID from alternative lookup discord_event_id: ${channelId}`);
            }
          } else if (altEventError) {
            // console.log(`[DEBUG] Alt lookup error: ${altEventError.message}`);
          }
        }
          // Discord settings should be retrieved from org_squadrons.discord_integration
          // This is a legacy fallback that should be updated
          console.warn('discordService event publishing needs update to use discord_integration field');
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
    const baseUrl = getDiscordApiBaseUrl();
    let url = `${baseUrl}/api/events/${discordMessageId}`;
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
    const baseUrl = getDiscordApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/events/${discordMessageId}/attendance`, {
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
export async function syncDiscordAttendance(_eventId: string, discordMessageId: string): Promise<boolean> {
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
async function editDiscordMessageInChannel(messageId: string, event: Event, guildId: string, channelId: string, originalStartTime?: string, reminders?: any): Promise<{ success: boolean; error?: string }> {
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
      eventId: event.id,
      // Add reminder settings for proper reminder scheduling
      reminders: reminders,
      // CRITICAL: Include event options for proper embed rendering
      eventOptions: {
        trackQualifications: (event as any).trackQualifications || event.eventSettings?.groupResponsesByQualification || false,
        groupBySquadron: event.eventSettings?.groupBySquadron || false,
        showNoResponse: event.eventSettings?.showNoResponse || false,
        eventType: event.eventType || null
      }
    };
    
    console.log('[EDIT-REQUEST-DEBUG] Sending to Discord bot:', {
      messageId,
      title: requestBody.title,
      hasImages: !!(requestBody.images?.headerImage || requestBody.images?.additionalImages?.length),
      imagesObject: JSON.stringify(requestBody.images),
      hasCreator: !!requestBody.creator,
      creator: requestBody.creator
    });
    console.log('[EDIT-REQUEST-DEBUG] Event object image fields:', {
      'event.imageUrl': event.imageUrl,
      'event.headerImageUrl': event.headerImageUrl,
      'event.additionalImageUrls': event.additionalImageUrls,
      'event.image_url': (event as any).image_url
    });

    const baseUrl = getDiscordApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/events/${messageId}/edit`, {
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
export async function updateMultiChannelEvent(event: Event, originalStartTime?: string, reminders?: any): Promise<{ success: boolean; publishedCount: number; errors: string[] }> {
  try {
    console.log(`[UPDATE-MULTI-DISCORD] Starting edit for event ${event.id}`);

    const errors: string[] = [];
    let editedCount = 0;

    // Trust the stored publication records: they capture the exact guild+channel
    // each message was posted to, regardless of current squadron settings
    const publications = await getStoredPublications(event);

    if (publications.length === 0) {
      // Legacy fallback: single message ID with no stored guild/channel
      const legacyMessageId = event.discordEventId || (typeof event.discord_event_id === 'string' ? event.discord_event_id : undefined);

      if (!legacyMessageId) {
        return {
          success: false,
          publishedCount: 0,
          errors: ['No Discord publication records found for this event']
        };
      }

      console.log(`[UPDATE-MULTI-DISCORD] No publication records, resolving guild/channel from squadron settings for legacy message ID: ${legacyMessageId}`);

      // Resolve guild/channel from the first participating squadron's current settings
      const participatingSquadrons = event.participants && event.participants.length > 0
        ? event.participants
        : [];

      const { data: squadronDiscordData } = await supabase
        .from('org_squadrons')
        .select('id, name, discord_integration')
        .in('id', participatingSquadrons);

      const squadronWithDiscord = squadronDiscordData?.find(s => {
        const integration = s.discord_integration as any;
        return integration?.selectedGuildId && (integration?.discordChannels || []).some((ch: any) => ch.type === 'events');
      });

      if (!squadronWithDiscord) {
        return {
          success: false,
          publishedCount: 0,
          errors: ['Could not resolve a Discord guild/channel for legacy message edit']
        };
      }

      const integration = squadronWithDiscord.discord_integration as any;
      const eventsChannel = (integration.discordChannels || []).find((ch: any) => ch.type === 'events');

      const legacyEditResult = await editDiscordMessageInChannel(
        legacyMessageId,
        event,
        integration.selectedGuildId,
        eventsChannel.id,
        originalStartTime,
        reminders
      );

      return {
        success: legacyEditResult.success,
        publishedCount: legacyEditResult.success ? 1 : 0,
        errors: legacyEditResult.success ? [] : [legacyEditResult.error || 'Failed to edit legacy Discord message']
      };
    }

    // Deduplicate shared channels: squadrons sharing a channel store one
    // publication entry each with the same message ID
    const uniqueMessages = new Map<string, { guildId: string; channelId: string; messageId: string }>();
    for (const pub of publications) {
      const key = `${pub.guildId}:${pub.channelId}:${pub.messageId}`;
      if (!uniqueMessages.has(key)) {
        uniqueMessages.set(key, { guildId: pub.guildId, channelId: pub.channelId, messageId: pub.messageId });
      }
    }

    console.log(`[UPDATE-MULTI-DISCORD] Editing ${uniqueMessages.size} unique messages from ${publications.length} publication records`);

    for (const message of uniqueMessages.values()) {
      try {
        const editResult = await editDiscordMessageInChannel(
          message.messageId,
          event,
          message.guildId,
          message.channelId,
          originalStartTime,
          reminders
        );

        if (editResult.success) {
          editedCount++;
          console.log(`[UPDATE-MULTI-DISCORD] Successfully edited message ${message.messageId} in guild ${message.guildId}, channel ${message.channelId}`);
        } else {
          errors.push(`Failed to edit message ${message.messageId} in guild ${message.guildId}, channel ${message.channelId}: ${editResult.error}`);
        }
      } catch (error) {
        errors.push(`Error editing message ${message.messageId} in guild ${message.guildId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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