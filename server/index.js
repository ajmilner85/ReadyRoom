// Use an explicit path for dotenv config
const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Require the Discord bot with an explicit path
const discordBotPath = path.resolve(__dirname, '../SDOBot/discordBot');
const { 
  publishEventToDiscord, 
  initializeDiscordBot, 
  deleteEventMessage,
  editEventMessage, 
  getAvailableGuilds,
  countdownManager,
  sendReminderMessage,
  getGuildRoles,
  getGuildMember
} = require(discordBotPath);

// Import Supabase client
const { supabase, getEventByDiscordId } = require('./supabaseClient');

// Note: We'll implement reminder processing directly here to avoid ES6/CommonJS module issues

// Import Discord.js for guild member operations
const { Client, GatewayIntentBits } = require('discord.js');

// Add Discord client for caching at the top level
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers]
});

// Cache for Discord server channels to avoid redundant fetches
const channelCache = {
  timestamp: 0,
  ttl: 5 * 60 * 1000, // 5 minutes cache
  servers: {}
};

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// Configure CORS with specific options to ensure it works properly
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173'], // Add your frontend URLs
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true
}));
app.use(bodyParser.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Also support HEAD requests for lightweight health checks
app.head('/api/health', (req, res) => {
  res.status(200).end();
});

// API endpoint to save reference timezone setting
app.post('/api/settings/timezone', async (req, res) => {
  try {
    const { timezone } = req.body;
    
    if (!timezone) {
      return res.status(400).json({ error: 'Timezone is required' });
    }
    
    // Save timezone to squadron settings
    const { error } = await supabase
      .from('squadron_settings')
      .upsert({
        key: 'reference_timezone',
        value: timezone
      }, {
        onConflict: 'key'
      });
    
    if (error) {
      throw error;
    }
    
    console.log(`[SETTINGS] Updated reference timezone to: ${timezone}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[ERROR] Error saving timezone setting:', error);
    res.status(500).json({ error: error.message || 'Failed to save timezone setting' });
  }
});

// Initialize Discord bot and client connection
(async function() {
  try {
    console.log('Initializing Discord bot and client connection...');
    await initializeDiscordBot();
    
    // Login the persistent client
    await discordClient.login(process.env.BOT_TOKEN);
    console.log('Discord client connection established successfully');
    
    // Log that the bot has been restarted (useful for debugging)
    console.log(`[STARTUP] Discord bot initialized at ${new Date().toISOString()}`);
    console.log('[STARTUP] Note: Previously cached event data will be reloaded from database');
  } catch (error) {
    console.error('Failed to initialize Discord:', error);
  }
})();

// Routes
// API endpoint to delete a Discord message
app.delete('/api/events/:discordMessageId', async (req, res) => {
  try {
    const { discordMessageId } = req.params;
    const { guildId, channelId } = req.query; // Get both guild ID and channel ID from query params
    
    console.log(`[DEBUG] Received request to delete Discord message: ${discordMessageId}, Guild ID: ${guildId || 'not specified'}, Channel ID: ${channelId || 'not specified'}`);
    
    // Validate ID format to avoid unnecessary calls
    if (!discordMessageId || !/^\d+$/.test(discordMessageId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Discord message ID format'
      });
    }
    
    let discordGuildId = guildId;
    let discordChannelId = channelId;
    
    // First try to get both the guild ID and channel ID from the events table if not provided
    if (!discordGuildId || !discordChannelId) {
      // Look up the event in the database using the Discord message ID
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('discord_guild_id, discord_channel_id')
        .eq('discord_event_id', discordMessageId)
        .single();
        
      if (!eventError && eventData) {
        if (eventData.discord_guild_id && !discordGuildId) {
          discordGuildId = eventData.discord_guild_id;
          console.log(`[DEBUG] Found guild ID ${discordGuildId} for message ${discordMessageId}`);
        }
        
        if (eventData.discord_channel_id && !discordChannelId) {
          discordChannelId = eventData.discord_channel_id;
          console.log(`[DEBUG] Found channel ID ${discordChannelId} for message ${discordMessageId}`);
        }
      }
    }
    
    // If still missing guild ID or channel ID, try to get them from squadron_settings
    if (!discordGuildId || !discordChannelId) {
      const { data: settingsData, error: settingsError } = await supabase
        .from('squadron_settings')
        .select('key, value')
        .in('key', ['discord_guild_id', 'events_channel_id']);
        
      if (!settingsError && settingsData) {
        settingsData.forEach(setting => {
          if (setting.key === 'discord_guild_id' && setting.value && !discordGuildId) {
            discordGuildId = setting.value;
            console.log(`[DEBUG] Using guild ID ${discordGuildId} from squadron_settings`);
          } else if (setting.key === 'events_channel_id' && setting.value && !discordChannelId) {
            discordChannelId = setting.value;
            console.log(`[DEBUG] Using channel ID ${discordChannelId} from squadron_settings`);
          }
        });
      }
    }
    
    // If we still don't have a guild ID, we can't proceed
    if (!discordGuildId) {
      return res.status(400).json({
        success: false,
        error: 'Discord server ID could not be determined. Please check your Discord integration settings.'
      });
    }
    
    console.log(`[DEBUG] Attempting to delete Discord message: ${discordMessageId}, Guild ID: ${discordGuildId}, Channel ID: ${discordChannelId || 'not specified'}`);
    
    // Call the Discord bot to delete the message, passing both guild ID and channel ID
    const result = await deleteEventMessage(discordMessageId, discordGuildId, discordChannelId);
    
    console.log(`[DEBUG] Delete result for message ${discordMessageId}:`, result);
    
    // Return success even if message was already deleted
    if (result.success) {
      // Clear countdown updates for this message
      try {
        countdownManager.clearEventUpdate(discordMessageId);
        console.log(`[COUNTDOWN] Cleared countdown updates for deleted message ${discordMessageId}`);
      } catch (countdownError) {
        console.warn(`[COUNTDOWN] Error clearing countdown updates: ${countdownError.message}`);
      }
      
      return res.json({ 
        success: true,
        alreadyDeleted: !!result.alreadyDeleted
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to delete Discord message'
      });
    }
  } catch (error) {
    console.error('[ERROR] Error deleting Discord message:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Server error while deleting Discord message'
    });
  }
});

// Add detailed logging to the publish endpoint
app.post('/api/events/publish', async (req, res) => {
  try {
    const { title, description, startTime, endTime, eventId, guildId, channelId, imageUrl, images, creator } = req.body;
    
    console.log('[DEBUG] Received event publish request:', { 
      timestamp: new Date().toISOString(),
      eventId,
      title,
      startTime,
      guildId,
      channelId,
      hasImage: !!imageUrl
    });
    
    if (!title || !startTime) {
      return res.status(400).json({ 
        success: false, 
        error: 'Title and start time are required' 
      });
    }

    if (!guildId) {
      return res.status(400).json({
        success: false,
        error: 'Discord server ID (guildId) is required'
      });
    }

    if (!channelId) {
      return res.status(400).json({
        success: false,
        error: 'Discord channel ID (channelId) is required'
      });
    }
    
    // Note: Removed duplicate check to allow multi-squadron publishing
    // The same event needs to be published to multiple Discord servers/channels
    console.log(`[MULTI-PUBLISH] Processing request for event ${eventId}, guild ${guildId}, channel ${channelId}`);
    console.log(`[MULTI-PUBLISH] Request timestamp: ${new Date().toISOString()}`);
    
    // Format the event time object
    const eventTime = {
      start: new Date(startTime),
      end: endTime ? new Date(endTime) : new Date(new Date(startTime).getTime() + (60 * 60 * 1000)) // Default to 1 hour later
    };
    
    console.log('[DEBUG] Publishing event to Discord:', { 
      title, 
      eventId,
      guildId,
      channelId,
      startTime: eventTime.start.toISOString(), 
      endTime: eventTime.end.toISOString() 
    });
      // Fetch event options and creator info from database if eventId is provided
    let eventOptions = {};
    let creatorFromDb = creator; // Use provided creator as fallback
    if (eventId) {
      try {
        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select('track_qualifications, event_type, creator_call_sign, creator_board_number, creator_billet')
          .eq('id', eventId)
          .single();
        
        if (!eventError && eventData) {
          eventOptions = {
            trackQualifications: eventData.track_qualifications || false,
            eventType: eventData.event_type || null
          };
          
          // Use creator info from database if available
          if (eventData.creator_call_sign || eventData.creator_board_number) {
            creatorFromDb = {
              boardNumber: eventData.creator_board_number || '',
              callsign: eventData.creator_call_sign || '',
              billet: eventData.creator_billet || ''
            };
            console.log('[CREATOR-DEBUG] Using creator from database:', creatorFromDb);
          } else {
            console.log('[CREATOR-DEBUG] No creator info in database, using provided:', creator);
          }
        }
      } catch (error) {
        console.warn('[WARNING] Could not fetch event options:', error.message);
      }
    }
    
    // Call the Discord bot to publish the event, passing both the guild ID, channel ID, and image URL if available
    console.log(`[MULTI-PUBLISH] About to call publishEventToDiscord for guild ${guildId}, channel ${channelId} with options:`, eventOptions);
    console.log(`[CREATOR-DEBUG] Passing creator to Discord bot:`, creatorFromDb);
    const result = await publishEventToDiscord(title, description || '', eventTime, guildId, channelId, imageUrl, creatorFromDb, images, eventOptions);
    console.log(`[MULTI-PUBLISH] Discord publish result for guild ${guildId}:`, result);
      // If eventId was provided, update the event in Supabase with the Discord message ID, guild ID and image URL
    // Don't try to store the channelId in the events table as it doesn't have that column
    if (eventId && result.messageId) {
      console.log(`[DEBUG] Updating event ${eventId} with Discord message ID ${result.messageId} and guild ID ${result.guildId}`);
      
      // Include the image URL in the database update to persist it across restarts
      const updateData = { 
        discord_event_id: result.messageId,
        discord_guild_id: result.guildId
      };
      
      // Store the image URL if provided
      if (imageUrl) {
        updateData.image_url = imageUrl;
      }
      
      const { error: updateError } = await supabase
        .from('events')
        .update(updateData)
        .eq('id', eventId);
      
      if (updateError) {
        console.warn(`[WARNING] Failed to update event record with Discord IDs: ${updateError.message}`);
      } else {
        console.log(`[DEBUG] Successfully linked event ${eventId} with Discord message ID ${result.messageId} and guild ID ${result.guildId}`);
        
        // Add the event to countdown update schedule
        if (eventId) {
          try {
            // Get the full event data for countdown scheduling
            const { data: eventData, error: eventFetchError } = await supabase
              .from('events')
              .select('*')
              .eq('id', eventId)
              .single();
            
            if (!eventFetchError && eventData) {
              countdownManager.addEventToSchedule(
                eventData,
                result.messageId,
                result.guildId,
                result.channelId
              );
              console.log(`[COUNTDOWN] Added event ${eventId} to countdown update schedule`);
            } else {
              console.warn(`[COUNTDOWN] Could not fetch event data for countdown scheduling: ${eventFetchError?.message}`);
            }
          } catch (countdownError) {
            console.warn(`[COUNTDOWN] Error adding event to countdown schedule: ${countdownError.message}`);
          }
        }
      }
    }
    
    res.json({
      success: true,
      discordMessageId: result.messageId,
      discordGuildId: result.guildId
    });
  } catch (error) {
    console.error('[ERROR] Error publishing event to Discord:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to publish event to Discord'
    });
  }
});

// Edit Discord event message endpoint
app.put('/api/events/:messageId/edit', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { title, description, startTime, endTime, guildId, channelId, imageUrl, images, creator, originalStartTime, eventId } = req.body;
    
    console.log('[DEBUG] Received event edit request:', { 
      timestamp: new Date().toISOString(),
      messageId,
      eventId,
      title,
      originalStartTime,
      newStartTime: startTime,
      guildId,
      channelId,
      hasImage: !!imageUrl,
      creator: creator,
      images: images
    });
    
    if (!title || !startTime) {
      return res.status(400).json({ 
        success: false, 
        error: 'Title and start time are required' 
      });
    }

    if (!guildId) {
      return res.status(400).json({
        success: false,
        error: 'Discord server ID (guildId) is required'
      });
    }

    if (!channelId) {
      return res.status(400).json({
        success: false,
        error: 'Discord channel ID (channelId) is required'
      });
    }
    
    // Format the event time object
    const eventTime = {
      start: new Date(startTime),
      end: endTime ? new Date(endTime) : new Date(new Date(startTime).getTime() + (60 * 60 * 1000)) // Default to 1 hour later
    };
    
    console.log('[DEBUG] Editing Discord message:', { 
      messageId,
      title, 
      guildId,
      channelId,
      startTime: eventTime.start.toISOString(), 
      endTime: eventTime.end.toISOString() 
    });
    
    // For edit operations, we need to fetch event options from the database
    // We can try to find the event by looking up the messageId
    let eventOptions = {};
    try {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('track_qualifications, event_type')
        .or(`discord_event_id.eq.${messageId},discord_event_id.cs.[{"messageId":"${messageId}"}]`)
        .single();
      
      if (!eventError && eventData) {
        eventOptions = {
          trackQualifications: eventData.track_qualifications || false,
          eventType: eventData.event_type || null
        };
      }
    } catch (error) {
      console.warn('[WARNING] Could not fetch event options for edit:', error.message);
    }
    
    // Call the Discord bot to edit the message
    const result = await editEventMessage(messageId, title, description || '', eventTime, guildId, channelId, imageUrl, creator, images, eventOptions);
    console.log(`[DEBUG] Discord edit result:`, result);
    
    if (result.success) {
      // Handle reminder updates if start time changed and event ID is provided
      if (originalStartTime && eventId && originalStartTime !== startTime) {
        console.log('[DEBUG] Event time changed, updating reminders...');
        console.log('[DEBUG] Original start time:', originalStartTime);
        console.log('[DEBUG] New start time:', startTime);
        
        // Check if this event has existing reminders
        const { data: existingReminders, error: remindersError } = await supabase
          .from('event_reminders')
          .select('*')
          .eq('event_id', eventId)
          .limit(1);
        
        if (!remindersError && existingReminders && existingReminders.length > 0) {
          console.log('[DEBUG] Event has existing reminders, rescheduling...');
          
          // Cancel existing unsent reminders
          const { error: cancelError } = await supabase
            .from('event_reminders')
            .delete()
            .eq('event_id', eventId)
            .eq('sent', false);
          
          if (cancelError) {
            console.error('[ERROR] Failed to cancel existing reminders:', cancelError);
          } else {
            // Create new reminder 15 minutes before the new start time
            const newStartTime = new Date(startTime);
            const reminderTime = new Date(newStartTime.getTime() - (15 * 60 * 1000));
            
            // Only schedule if reminder time is in the future
            if (reminderTime > new Date()) {
              const { error: scheduleError } = await supabase
                .from('event_reminders')
                .insert({
                  event_id: eventId,
                  reminder_type: 'first',
                  scheduled_time: reminderTime.toISOString(),
                  sent: false
                });
              
              if (scheduleError) {
                console.error('[ERROR] Failed to schedule new reminder:', scheduleError);
              } else {
                console.log('[DEBUG] Successfully rescheduled reminder for:', reminderTime.toISOString());
              }
            } else {
              console.log('[DEBUG] New reminder time is in the past, not scheduling');
            }
          }
        } else {
          console.log('[DEBUG] Event has no existing reminders, skipping reminder update');
        }
      } else if (originalStartTime && eventId) {
        console.log('[DEBUG] Event time unchanged, no reminder update needed');
      } else {
        console.log('[DEBUG] Missing originalStartTime or eventId, skipping reminder update');
      }
      
      res.json({
        success: true,
        messageId: messageId
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to edit Discord message'
      });
    }
  } catch (error) {
    console.error('[ERROR] Error editing Discord message:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to edit Discord message'
    });
  }
});

// New endpoint to get event attendance from database by event ID
app.get('/api/events/:eventId/attendance', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    // First, get the event to find its Discord message ID
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('discord_event_id')
      .eq('id', eventId)
      .single();
    
    if (eventError) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    const discordEventId = eventData.discord_event_id;
    
    if (!discordEventId) {
      return res.json({ 
        accepted: [], 
        declined: [], 
        tentative: [],
        note: 'This event has no Discord message ID associated with it'
      });
    }
    
    // Handle both old format (single string) and new format (JSONB array)
    let messageIds = [];
    
    if (typeof discordEventId === 'string') {
      // Old format: single message ID
      messageIds = [discordEventId];
    } else if (Array.isArray(discordEventId)) {
      // New format: JSONB array of message objects
      messageIds = discordEventId.map(entry => entry.messageId).filter(id => id);
    } else {
      console.warn(`Unexpected discord_event_id format for event ${eventId}:`, discordEventId);
      return res.json({ 
        accepted: [], 
        declined: [], 
        tentative: [],
        note: 'Invalid Discord event ID format'
      });
    }
    
    if (messageIds.length === 0) {
      return res.json({ 
        accepted: [], 
        declined: [], 
        tentative: [],
        note: 'No valid Discord message IDs found for this event'
      });
    }
    
    // Query Supabase for attendance records from discord_event_attendance table
    // Use 'in' operator to match any of the message IDs
    const { data, error } = await supabase
      .from('discord_event_attendance')
      .select('*')
      .in('discord_event_id', messageIds);
    
    if (error) {
      throw error;
    }
    
    // Format the response to match the expected structure
    const attendance = {
      accepted: [],
      declined: [],
      tentative: []
    };
    
    // Use a Map to deduplicate responses by discord_id (in case a user responded to multiple messages)
    // Keep the most recent response for each user
    const userResponses = new Map();
    
    data.forEach(record => {
      const userId = record.discord_id;
      const existingResponse = userResponses.get(userId);
      
      // If this is the first response for this user, or this response is more recent, use it
      if (!existingResponse || new Date(record.updated_at) > new Date(existingResponse.updated_at)) {
        userResponses.set(userId, record);
      }
    });
    
    // Process each unique user response
    userResponses.forEach(record => {
      // Prepare the attendee object
      const attendee = {
        boardNumber: record.board_number || (record.discord_id ? record.discord_id.substring(0, 3) : 'N/A'),
        callsign: record.discord_username || 'Unknown User',
        discord_id: record.discord_id,
        billet: record.billet
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
    
    res.json(attendance);
  } catch (error) {
    console.error('Error fetching event attendance:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch attendance' });
  }
});

// API endpoint for finding an event by its Discord message ID
app.get('/api/events/discord/:discordMessageId', async (req, res) => {
  try {
    const { discordMessageId } = req.params;
    const { event, error } = await getEventByDiscordId(discordMessageId);
    
    if (error || !event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json(event);
  } catch (error) {
    console.error('Error finding event by Discord ID:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

// New endpoint to fetch Discord guild members
app.get('/api/discord/guild-members', async (req, res) => {
  try {
    console.log('[DEBUG] Received request to fetch Discord guild members');
    
    // Get the guild ID from query parameters
    const { guildId } = req.query;
    
    if (!guildId) {
      return res.status(400).json({ 
        error: 'Guild ID is required. Please check your Discord integration settings.' 
      });
    }
    
    console.log(`[DEBUG] Fetching members for guild ID: ${guildId}`);
    
    // Create a Discord client with required intents
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
      ]
    });
    
    // Login to Discord
    await client.login(process.env.BOT_TOKEN);
    
    // Wait for client to be ready
    await new Promise((resolve) => {
      if (client.isReady()) resolve();
      else client.once('ready', resolve);
    });
    
    console.log('[DEBUG] Discord client ready, fetching guild members');
    
    // Get the specific guild (server) by ID
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      await client.destroy();
      return res.status(404).json({ 
        error: `Discord guild with ID ${guildId} not found or bot doesn't have access` 
      });
    }
      console.log(`[DEBUG] Found guild: ${guild.name} (${guild.id})`);
    
    // Fetch all members
    await guild.members.fetch();
    
    // Map guild members to a simpler structure, exclude bots
    const members = guild.members.cache
      .filter(member => !member.user.bot) // Filter out bots
      .map(member => ({
        id: member.id,
        username: member.user.username,
        displayName: member.nickname || member.user.username, // Include server display name
        roles: member.roles.cache.map(role => role.name).filter(name => name !== '@everyone'),
        isBot: member.user.bot
      }));
    
    console.log(`[DEBUG] Fetched ${members.length} guild members (after filtering out bots)`);
    
    // Destroy the client to free up resources
    await client.destroy();
    
    res.json({ members });
  } catch (error) {
    console.error('[ERROR] Error fetching Discord guild members:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch Discord guild members' 
    });
  }
});

// New endpoint to get available Discord servers
app.get('/api/discord/servers', async (req, res) => {
  try {
    console.log('[DEBUG] Received request to fetch available Discord servers');
    
    // Use the bot's getAvailableGuilds function
    const { guilds, error } = await getAvailableGuilds();
    
    if (error) {
      return res.status(500).json({ 
        success: false,
        error: error
      });
    }
    
    console.log(`[DEBUG] Found ${guilds.length} available Discord servers`);
    
    return res.json({
      success: true,
      servers: guilds
    });
  } catch (error) {
    console.error('[ERROR] Error fetching Discord servers:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch Discord servers' 
    });
  }
});

// New endpoint to get channels for a specific Discord server
app.get('/api/discord/servers/:guildId/channels', async (req, res) => {
  try {
    const { guildId } = req.params;
    
    if (!guildId) {
      return res.status(400).json({
        success: false,
        error: 'Guild ID is required'
      });
    }
    
    // Check if we have a recent cache for this guild
    const now = Date.now();
    if (channelCache.servers[guildId] && 
        now - channelCache.timestamp < channelCache.ttl) {
      // Return cached channels if they exist and are not expired
      return res.json({
        success: true,
        channels: channelCache.servers[guildId],
        cached: true
      });
    }
    
    // Wait for client to be ready if not already
    if (!discordClient.isReady()) {
      await new Promise((resolve) => {
        discordClient.once('ready', resolve);
      });
    }
    
    // Fetch the specified guild
    const guild = discordClient.guilds.cache.get(guildId);
    
    if (!guild) {
      return res.status(404).json({ 
        success: false,
        error: `Discord server with ID ${guildId} not found or bot doesn't have access` 
      });
    }
    
    // Fetch all channels
    await guild.channels.fetch();
    
    // Filter to text channels that can be used for posting events
    const textChannels = guild.channels.cache
      .filter(channel => {
        // Convert any type to string for comparison
        const typeStr = String(channel.type);
        // Include all text-like channels (can contain text messages)
        return ['0', 'GUILD_TEXT', 'TEXT', 'DM', 'GROUP_DM', 'GUILD_NEWS', 
                'GUILD_NEWS_THREAD', 'GUILD_PUBLIC_THREAD', 'GUILD_PRIVATE_THREAD'].includes(typeStr);
      })
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        type: channel.type
      }));
    
    // Update the cache
    channelCache.servers[guildId] = textChannels;
    channelCache.timestamp = now;
    
    res.json({
      success: true,
      channels: textChannels
    });
  } catch (error) {
    console.error('[ERROR] Error fetching Discord channels:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to fetch Discord channels' 
    });
  }
});

// Reminder API endpoint
app.post('/api/reminders/send', async (req, res) => {
  try {
    const { eventId, message, userIds, discordEventId } = req.body;
    
    console.log('[REMINDER-API] Received reminder request:', {
      eventId,
      messageLength: message?.length,
      userCount: userIds?.length,
      discordEventId: Array.isArray(discordEventId) ? `${discordEventId.length} channels` : 'single channel'
    });
    
    if (!eventId || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: eventId and message'
      });
    }
    
    // Get event details to find which channels to send to
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();
    
    if (eventError || !eventData) {
      console.error('[REMINDER-API] Error fetching event:', eventError);
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    let channelsToNotify = [];
    
    // Handle both JSONB array format and legacy single message ID
    if (Array.isArray(eventData.discord_event_id)) {
      // Multi-channel format - send to all channels where event was published
      channelsToNotify = eventData.discord_event_id.map(pub => ({
        guildId: pub.guildId,
        channelId: pub.channelId,
        squadronId: pub.squadronId
      }));
    } else if (eventData.discord_event_id) {
      // Legacy single channel format - try to find guild/channel from settings
      const { data: settingsData } = await supabase
        .from('squadron_settings')
        .select('key, value')
        .in('key', ['discord_guild_id', 'events_channel_id']);
      
      let guildId = null;
      let channelId = null;
      
      settingsData?.forEach(setting => {
        if (setting.key === 'discord_guild_id') guildId = setting.value;
        if (setting.key === 'events_channel_id') channelId = setting.value;
      });
      
      if (guildId && channelId) {
        channelsToNotify.push({ guildId, channelId, squadronId: 'default' });
      }
    }
    
    if (channelsToNotify.length === 0) {
      console.warn('[REMINDER-API] No channels found to send reminder to');
      return res.status(400).json({
        success: false,
        error: 'No Discord channels configured for this event'
      });
    }
    
    // Send reminder to each channel
    const results = [];
    for (const channel of channelsToNotify) {
      try {
        // Send message to Discord channel using the bot
        const sendResult = await sendReminderToChannel(channel.guildId, channel.channelId, message);
        results.push({
          squadronId: channel.squadronId,
          guildId: channel.guildId,
          channelId: channel.channelId,
          success: sendResult.success,
          error: sendResult.error
        });
      } catch (error) {
        console.error(`[REMINDER-API] Error sending to channel ${channel.channelId}:`, error);
        results.push({
          squadronId: channel.squadronId,
          guildId: channel.guildId,
          channelId: channel.channelId,
          success: false,
          error: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    
    res.json({
      success: successCount > 0,
      sentToChannels: successCount,
      totalChannels: channelsToNotify.length,
      results
    });
    
  } catch (error) {
    console.error('[REMINDER-API] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Helper function to send reminder to a specific Discord channel
async function sendReminderToChannel(guildId, channelId, message) {
  try {
    // Use the existing Discord bot client instead of creating a new one
    const { sendReminderMessage } = require(discordBotPath);
    
    // Call the Discord bot's reminder function
    const result = await sendReminderMessage(guildId, channelId, message);
    
    return result;
  } catch (error) {
    console.error(`[REMINDER-SEND] Error sending to ${guildId}/${channelId}:`, error);
    return { success: false, error: error.message };
  }
}

// API endpoint to get Discord server roles
app.get('/api/discord/guild/:guildId/roles', async (req, res) => {
  try {
    const { guildId } = req.params;
    
    console.log(`[DEBUG] Fetching roles for guild ID: ${guildId}`);
    
    if (!guildId) {
      return res.status(400).json({ 
        error: 'Guild ID is required' 
      });
    }
    
    // Call the Discord bot function to get guild roles
    const result = await getGuildRoles(guildId);
    
    if (result.error) {
      return res.status(500).json({ 
        error: result.error
      });
    }
    
    res.json({ 
      roles: result.roles
    });
  } catch (error) {
    console.error('[ERROR] Error fetching Discord guild roles:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch Discord guild roles'
    });
  }
});

// API endpoint to get Discord guild member information
app.get('/api/discord/guild/:guildId/member/:userId', async (req, res) => {
  try {
    const { guildId, userId } = req.params;
    
    console.log(`[DEBUG] Fetching member ${userId} in guild ID: ${guildId}`);
    
    if (!guildId || !userId) {
      return res.status(400).json({ 
        error: 'Guild ID and User ID are required' 
      });
    }
    
    // Call the Discord bot function to get guild member
    const result = await getGuildMember(guildId, userId);
    
    if (result.error) {
      return res.status(500).json({ 
        error: result.error
      });
    }
    
    res.json({ 
      member: result.member
    });
  } catch (error) {
    console.error('[ERROR] Error fetching Discord guild member:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch Discord guild member'
    });
  }
});

// Server-side reminder processing functions
async function processReminders() {
  try {
    console.log('[REMINDER-PROCESSOR] Checking for pending reminders...');
    
    // Get all pending reminders
    const now = new Date().toISOString();
    const { data: pendingReminders, error: fetchError } = await supabase
      .from('event_reminders')
      .select('*')
      .eq('sent', false)
      .lte('scheduled_time', now)
      .order('scheduled_time', { ascending: true });

    if (fetchError) {
      console.error('Error fetching pending reminders:', fetchError);
      return { processed: 0, errors: [{ reminderId: 'fetch', error: fetchError }] };
    }

    if (!pendingReminders || pendingReminders.length === 0) {
      console.log('[REMINDER-PROCESSOR] No pending reminders found');
      return { processed: 0, errors: [] };
    }

    console.log(`[REMINDER-PROCESSOR] Processing ${pendingReminders.length} pending reminders`);

    let processed = 0;
    const errors = [];

    // Process each reminder
    for (const reminder of pendingReminders) {
      try {
        await processIndividualReminder(reminder);
        processed++;
        console.log(`Successfully processed reminder ${reminder.id} for event ${reminder.event_id}`);
      } catch (error) {
        console.error(`Error processing reminder ${reminder.id}:`, error);
        errors.push({ reminderId: reminder.id, error });
      }
    }

    return { processed, errors };
  } catch (error) {
    console.error('Error in processReminders:', error);
    return { processed: 0, errors: [{ reminderId: 'general', error }] };
  }
}

async function processIndividualReminder(reminder) {
  // Get event and attendance data
  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select('*')
    .eq('id', reminder.event_id)
    .single();

  if (eventError || !eventData) {
    throw new Error(`Could not fetch event data: ${eventError?.message || 'Event not found'}`);
  }

  console.log('[EVENT-DEBUG] Retrieved event data:', JSON.stringify(eventData, null, 2));

  // Get attendance data
  let discordEventIds = [];
  if (Array.isArray(eventData.discord_event_id)) {
    discordEventIds = eventData.discord_event_id.map(pub => pub.messageId);
  } else if (eventData.discord_event_id) {
    discordEventIds = [eventData.discord_event_id];
  }

  if (discordEventIds.length === 0) {
    console.log(`No Discord event IDs found for reminder ${reminder.id}, marking as sent`);
    await markReminderAsSent(reminder.id);
    return;
  }

  // Get attendance data
  const { data: attendanceData, error: attendanceError } = await supabase
    .from('discord_event_attendance')
    .select('discord_id, discord_username, user_response')
    .in('discord_event_id', discordEventIds)
    .in('user_response', ['accepted', 'tentative']);

  if (attendanceError) {
    throw new Error(`Could not fetch attendance data: ${attendanceError.message}`);
  }

  if (!attendanceData || attendanceData.length === 0) {
    console.log(`No attendance found for reminder ${reminder.id}, marking as sent`);
    await markReminderAsSent(reminder.id);
    return;
  }

  // Calculate time until event
  console.log('[EVENT-DEBUG] Event start_datetime field:', eventData.start_datetime);
  console.log('[EVENT-DEBUG] Available event fields:', Object.keys(eventData));
  const timeUntilEvent = calculateTimeUntilEvent(eventData.start_datetime);
  
  // Format the reminder message
  const message = formatReminderMessage(eventData, timeUntilEvent);
  
  // Deduplicate users by discord_id to avoid duplicate mentions
  const uniqueUsers = new Map();
  attendanceData.forEach(user => {
    if (!uniqueUsers.has(user.discord_id)) {
      uniqueUsers.set(user.discord_id, user);
    }
  });
  
  console.log(`[REMINDER-DEBUG] Total attendance records: ${attendanceData.length}`);
  console.log(`[REMINDER-DEBUG] Unique users after deduplication: ${uniqueUsers.size}`);
  
  // Create Discord mentions for actual notification using unique users only
  const discordMentions = Array.from(uniqueUsers.values())
    .map(user => `<@${user.discord_id}>`)
    .join(' ');
  const fullMessage = discordMentions ? `${discordMentions}\n${message}` : message;
  
  // Send the reminder message to Discord channels
  await sendReminderToDiscordChannels(eventData, fullMessage);
  
  // Mark reminder as sent
  await markReminderAsSent(reminder.id);
}

function calculateTimeUntilEvent(eventStartTime) {
  console.log('[TIME-CALC-DEBUG] Event start time string:', eventStartTime);
  
  if (!eventStartTime) {
    console.error('[TIME-CALC-DEBUG] Event start time is undefined/null');
    return 'unknown time';
  }
  
  const now = new Date();
  const eventStart = new Date(eventStartTime);
  console.log('[TIME-CALC-DEBUG] Current time:', now.toISOString());
  console.log('[TIME-CALC-DEBUG] Event start parsed:', eventStart.toISOString());
  console.log('[TIME-CALC-DEBUG] Event start is valid date:', !isNaN(eventStart.getTime()));
  const diffMs = eventStart.getTime() - now.getTime();
  console.log('[TIME-CALC-DEBUG] Difference in ms:', diffMs);
  
  if (diffMs <= 0) {
    return 'now';
  }
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) {
    const remainingHours = diffHours % 24;
    return `${diffDays} day${diffDays !== 1 ? 's' : ''}${remainingHours > 0 ? ` and ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}` : ''}`;
  } else if (diffHours > 0) {
    const remainingMinutes = diffMinutes % 60;
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''}${remainingMinutes > 0 ? ` and ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}` : ''}`;
  } else {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
  }
}

function formatReminderMessage(event, timeUntilEvent) {
  console.log('[FORMAT-REMINDER-DEBUG] Event data:', event);
  console.log('[FORMAT-REMINDER-DEBUG] Time until event:', timeUntilEvent);
  
  const eventDate = new Date(event.start_datetime);
  
  // Get timezone from event settings, default to America/New_York
  let timezone = 'America/New_York';
  if (event.event_settings) {
    try {
      const settings = typeof event.event_settings === 'string' 
        ? JSON.parse(event.event_settings) 
        : event.event_settings;
      
      if (settings.squadron?.timezone) {
        timezone = settings.squadron.timezone;
        console.log('[FORMAT-REMINDER-DEBUG] Using timezone from event settings:', timezone);
      }
    } catch (error) {
      console.warn('[FORMAT-REMINDER-DEBUG] Failed to parse event settings, using default timezone:', error);
    }
  }
  
  const formattedTime = eventDate.toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return `REMINDER: Event starting ${timeUntilEvent}!
${event.name}
${formattedTime}`;
}

async function sendReminderToDiscordChannels(event, message) {
  if (Array.isArray(event.discord_event_id)) {
    // Multi-channel event
    for (const publication of event.discord_event_id) {
      try {
        await sendReminderMessage(publication.guildId, publication.channelId, message);
        console.log(`[REMINDER] Sent reminder to guild ${publication.guildId}, channel ${publication.channelId}`);
      } catch (error) {
        console.error(`[REMINDER] Failed to send reminder to guild ${publication.guildId}, channel ${publication.channelId}:`, error);
      }
    }
  } else if (event.discord_event_id) {
    // Single channel event - need to get guild/channel from the message ID
    // For now, we'll log this case and implement if needed
    console.log(`[REMINDER] Single-channel event reminder not yet implemented for message ID: ${event.discord_event_id}`);
  }
}

async function markReminderAsSent(reminderId) {
  try {
    const { error } = await supabase
      .from('event_reminders')
      .update({ 
        sent: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', reminderId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error marking reminder as sent:', error);
    return { success: false, error };
  }
}

// Start reminder processor
let reminderIntervalId = null;

function startReminderProcessor() {
  console.log('Starting server-side reminder processor...');
  
  // Process reminders immediately
  processReminders().catch(error => {
    console.error('Error in initial reminder processing:', error);
  });
  
  // Then process every 1 minute
  reminderIntervalId = setInterval(() => {
    processReminders().catch(error => {
      console.error('Error in scheduled reminder processing:', error);
    });
  }, 60000); // 1 minute = 60000ms
  
  console.log('Reminder processor started (checking every 1 minute)');
}

// Start server
app.listen(PORT, () => {
  console.log(`ReadyRoom API server running on port ${PORT}`);
  
  // Start the reminder processor
  startReminderProcessor();
});