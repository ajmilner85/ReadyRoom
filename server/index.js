/**
 * LOCAL DEVELOPMENT SERVER (ReadyRoom)
 * 
 * PURPOSE: Express server for local development with Discord bot integration
 * 
 * RESPONSIBILITIES:
 * - Express server on port 3001 (127.0.0.1 for local development)
 * - All API endpoints (/api/events, /api/reminders, etc.)
 * - Event creation, editing, deletion logic
 * - Reminder processing and scheduling
 * - Database operations (Supabase)
 * - Discord bot initialization and integration
 * - User authentication and authorization
 * - Local development CORS configuration
 * 
 * DEVELOPMENT CONTEXT:
 * - Used for local development only (npm run dev in server directory)
 * - Loads .env.local for development overrides
 * - Points to Discord bot in ../SDOBot/discordBot.js
 * - Production deployment uses SDOBot/index.js instead
 */
const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Client, GatewayIntentBits } = require('discord.js');

// Load environment variables - check for .env.local first (development), then .env (production)
const envLocalPath = path.resolve(__dirname, '../.env.local');
const envPath = path.resolve(__dirname, '../.env');

let result = dotenv.config({ path: envLocalPath });
if (result.error) {
  // If .env.local doesn't exist, try .env
  result = dotenv.config({ path: envPath });
  if (result.error) {
    console.error('Error loading environment files:', result.error);
  }
}

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
  postDiscordMessageImage,
  updateDiscordMessageImage,
  postMessageToThread,
  getGuildRoles,
  getGuildMember,
  shouldUseThreadsForEvent,
  createThreadFromMessage,
  deleteThread,
  switchDiscordBot,
  getGuildChannels
} = require(discordBotPath);

// Import Supabase client
const { supabase, getEventByDiscordId } = require('./supabaseClient');

// Note: We'll implement reminder processing directly here to avoid ES6/CommonJS module issues

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
  origin: [
    'http://localhost:5173', 
    'http://127.0.0.1:5173', 
    'http://localhost:4173',
    'https://ready-room.vercel.app',
    'https://ready-room-git-development-ajmilner85.vercel.app',
    'https://readyroompreview.ajmilner.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'x-discord-environment', 'X-Discord-Environment'],
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

    // Update timezone setting for all squadrons (maintaining current global behavior)
    // Use raw SQL to update JSONB field since Supabase client doesn't handle JSONB updates well
    const { error } = await supabase
      .rpc('update_squadron_timezone', { new_timezone: timezone });

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

// API endpoint to switch Discord bot token for local development
app.post('/api/discord/switch-bot', async (req, res) => {
  try {
    const { tokenType } = req.body;

    if (!tokenType || !['development', 'production'].includes(tokenType)) {
      return res.status(400).json({ error: 'Valid tokenType (development or production) is required' });
    }

    console.log(`[BOT-SWITCH] Switching to ${tokenType} Discord bot token for local development...`);

    // Get the actual bot token from environment variables
    const botToken = tokenType === 'production'
      ? process.env.BOT_TOKEN_PROD || process.env.BOT_TOKEN
      : process.env.BOT_TOKEN_DEV;

    if (!botToken) {
      const error = `${tokenType} bot token not found in environment variables`;
      console.error(`[BOT-SWITCH] ${error}`);
      return res.status(500).json({ error });
    }

    // Call the bot switching function
    const result = await switchDiscordBot(botToken);

    if (result.success) {
      console.log(`[BOT-SWITCH] Successfully switched to ${tokenType} Discord bot`);
      res.json({
        success: true,
        message: `Discord bot switched to ${tokenType} successfully`,
        tokenType: tokenType,
        botInfo: result.botInfo
      });
    } else {
      console.error(`[BOT-SWITCH] Failed to switch Discord bot:`, result.error);
      res.status(500).json({
        error: result.error || 'Failed to switch Discord bot token'
      });
    }
  } catch (error) {
    console.error('[BOT-SWITCH] Error switching Discord bot token:', error);
    res.status(500).json({
      error: error.message || 'Failed to switch Discord bot token'
    });
  }
});

// Initialize Discord bot and client connection
(async function() {
  try {
    console.log('Initializing Discord bot and client connection...');
    await initializeDiscordBot();

    // Check database for bot token preference and switch if needed
    try {
      // Get YOUR user profile specifically (the one running the local server)
      // In local dev, we prioritize profiles with pilot_id set, as that's the active developer
      const { data: userProfiles, error } = await supabase
        .from('user_profiles')
        .select('settings, pilot_id, auth_user_id')
        .not('pilot_id', 'is', null)
        .order('updated_at', { ascending: false });

      if (!error && userProfiles && userProfiles.length > 0) {
        console.log(`[STARTUP] Found ${userProfiles.length} user profiles with pilot_id`);

        // Find the most recently updated profile with a bot token preference
        const profileWithPreference = userProfiles.find(p => p.settings?.developer?.discordBotToken);

        if (profileWithPreference) {
          const tokenType = profileWithPreference.settings.developer.discordBotToken;
          console.log(`[STARTUP] Found bot token preference: ${tokenType} from user ${profileWithPreference.auth_user_id}`);

          const botToken = tokenType === 'production'
            ? process.env.BOT_TOKEN_PROD || process.env.BOT_TOKEN
            : process.env.BOT_TOKEN_DEV;

          if (botToken && botToken !== process.env.BOT_TOKEN) {
            console.log(`[STARTUP] Switching to ${tokenType} Discord bot from user settings...`);
            await switchDiscordBot(botToken);
          } else {
            console.log(`[STARTUP] Using default bot token (${tokenType} token not found or same as default)`);
          }
        } else {
          console.log('[STARTUP] No bot token preference found in any user profile, using default BOT_TOKEN');
        }
      } else {
        console.log('[STARTUP] No user profiles found, using default BOT_TOKEN');
      }
    } catch (dbError) {
      console.warn('[STARTUP] Could not read bot token preference from database, using default:', dbError.message);
    }

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
    
    // console.log(`[DEBUG] Received request to delete Discord message: ${discordMessageId}, Guild ID: ${guildId || 'not specified'}, Channel ID: ${channelId || 'not specified'}`);
    
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
        .select('discord_event_id')
        .eq('discord_event_id', discordMessageId)
        .single();
        
      if (!eventError && eventData) {
        // Extract guild ID and channel ID from discord_event_id JSONB structure
        if (eventData.discord_event_id && Array.isArray(eventData.discord_event_id) && eventData.discord_event_id.length > 0 && !discordGuildId) {
          discordGuildId = eventData.discord_event_id[0].guildId;
          // console.log(`[DEBUG] Found guild ID ${discordGuildId} for message ${discordMessageId}`);
        }
        
        if (eventData.discord_event_id && Array.isArray(eventData.discord_event_id) && eventData.discord_event_id.length > 0 && !discordChannelId) {
          discordChannelId = eventData.discord_event_id[0].channelId;
          // console.log(`[DEBUG] Found channel ID ${discordChannelId} for message ${discordMessageId}`);
        }
      }
    }
    
    // Discord guild/channel IDs should be in discord_integration field, not fallback settings
    // If missing, this indicates a configuration issue that should be resolved in Discord Integration settings
    
    // If we still don't have a guild ID, we can't proceed
    if (!discordGuildId) {
      return res.status(400).json({
        success: false,
        error: 'Discord server ID could not be determined. Please check your Discord integration settings.'
      });
    }
    
    // console.log(`[DEBUG] Attempting to delete Discord message: ${discordMessageId}, Guild ID: ${discordGuildId}, Channel ID: ${discordChannelId || 'not specified'}`);
    
    // Enhanced deletion: Clean up all traces of the event from Discord
    let deletionResults = {
      originalMessage: false,
      threads: [],
      reminders: 0,
      reminderMessages: 0,
      countdownCleared: false
    };
    
    try {
      // First, find the event in the database to get full event data including thread IDs
      const { data: eventData, error: eventLookupError } = await supabase
        .from('events')
        .select('id, discord_event_id')
        .or(`discord_event_id.eq."${discordMessageId}",discord_event_id->0->>messageId.eq."${discordMessageId}"`)
        .single();
      
      let eventId = null;
      let publications = [];
      
      if (!eventLookupError && eventData) {
        eventId = eventData.id;
        // Handle both old single ID format and new array format
        if (Array.isArray(eventData.discord_event_id)) {
          publications = eventData.discord_event_id;
        } else if (eventData.discord_event_id === discordMessageId) {
          // Old format - create a publication entry
          publications = [{
            messageId: discordMessageId,
            guildId: discordGuildId,
            channelId: discordChannelId,
            threadId: null
          }];
        }
      }
      
      // Delete event reminders from database
      if (eventId) {
        const { data: deletedReminders, error: reminderDeleteError } = await supabase
          .from('event_reminders')
          .delete()
          .eq('event_id', eventId)
          .select('count');
        
        if (!reminderDeleteError) {
          deletionResults.reminders = deletedReminders?.length || 0;
          console.log(`[DELETE] Removed ${deletionResults.reminders} reminder records for event ${eventId}`);
        }
      }
      
      // Delete threads and their messages (if any threads exist)
      for (const publication of publications) {
        if (publication.threadId) {
          try {
            const threadDeleteResult = await deleteThread(publication.threadId, publication.guildId);
            if (threadDeleteResult.success) {
              deletionResults.threads.push(publication.threadId);
              console.log(`[DELETE] Deleted thread ${publication.threadId} and all its messages`);
            }
          } catch (threadError) {
            console.warn(`[DELETE] Failed to delete thread ${publication.threadId}:`, threadError.message);
          }
        }
      }
      
      // Delete reminder messages (for non-threaded events)
      let reminderMessagesDeleted = 0;
      for (const publication of publications) {
        if (publication.reminderMessageIds && Array.isArray(publication.reminderMessageIds)) {
          for (const reminderMessageId of publication.reminderMessageIds) {
            try {
              const reminderDeleteResult = await deleteEventMessage(reminderMessageId, publication.guildId, publication.channelId);
              if (reminderDeleteResult.success) {
                reminderMessagesDeleted++;
                console.log(`[DELETE] Deleted reminder message ${reminderMessageId}`);
              }
            } catch (reminderError) {
              console.warn(`[DELETE] Failed to delete reminder message ${reminderMessageId}:`, reminderError.message);
            }
          }
        }
      }
      if (reminderMessagesDeleted > 0) {
        console.log(`[DELETE] Deleted ${reminderMessagesDeleted} reminder messages`);
      }
      deletionResults.reminderMessages = reminderMessagesDeleted;
      
      // Delete the original event message
      const result = await deleteEventMessage(discordMessageId, discordGuildId, discordChannelId);
      deletionResults.originalMessage = result.success;
      
      // Clear countdown updates for this message
      try {
        countdownManager.clearEventUpdate(discordMessageId);
        deletionResults.countdownCleared = true;
        console.log(`[DELETE] Cleared countdown updates for deleted message ${discordMessageId}`);
      } catch (countdownError) {
        console.warn(`[DELETE] Error clearing countdown updates: ${countdownError.message}`);
      }
      
      console.log(`[DELETE] Complete deletion results:`, deletionResults);
      
      // Return success if at least the original message was handled
      return res.json({ 
        success: true,
        deletionResults,
        alreadyDeleted: !!result.alreadyDeleted
      });
      
    } catch (enhancedDeleteError) {
      console.error('[DELETE] Error during enhanced deletion:', enhancedDeleteError);
      
      // Fallback to basic deletion if enhanced deletion fails
      const result = await deleteEventMessage(discordMessageId, discordGuildId, discordChannelId);
      
      if (result.success) {
        try {
          countdownManager.clearEventUpdate(discordMessageId);
          console.log(`[DELETE] Cleared countdown updates for deleted message ${discordMessageId}`);
        } catch (countdownError) {
          console.warn(`[DELETE] Error clearing countdown updates: ${countdownError.message}`);
        }
        
        return res.json({ 
          success: true,
          alreadyDeleted: !!result.alreadyDeleted,
          warning: 'Enhanced deletion failed, performed basic deletion only'
        });
      } else {
        return res.status(500).json({
          success: false,
          error: result.error || 'Failed to delete Discord message'
        });
      }
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
    const { title, description, startTime, endTime, eventId, guildId, channelId, imageUrl, images, creator, notificationRoles } = req.body;
    
    // console.log('[DEBUG] Received event publish request:', { 
    //   timestamp: new Date().toISOString(),
    //   eventId,
    //   title,
    //   startTime,
    //   guildId,
    //   channelId,
    //   hasImage: !!imageUrl
    // });
    
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
    
    // console.log('[DEBUG] Publishing event to Discord:', { 
    //   title, 
    //   eventId,
    //   guildId,
    //   channelId,
    //   startTime: eventTime.start.toISOString(), 
    //   endTime: eventTime.end.toISOString() 
    // });
      // Fetch event options and creator info from database if eventId is provided
    let eventOptions = {};
    let creatorFromDb = creator; // Use provided creator as fallback
    let participatingSquadrons = []; // For threading decision
    if (eventId) {
      try {
        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select('track_qualifications, event_type, creator_call_sign, creator_board_number, creator_billet, participants, event_settings')
          .eq('id', eventId)
          .single();
        
        if (!eventError && eventData) {
          // Extract participating squadrons for threading decision
          participatingSquadrons = Array.isArray(eventData.participants) ? eventData.participants : [];
          console.log(`[THREADING] Event ${eventId} has ${participatingSquadrons.length} participating squadrons:`, participatingSquadrons);

          eventOptions = {
            trackQualifications: eventData.track_qualifications || false,
            eventType: eventData.event_type || null,
            participatingSquadrons: participatingSquadrons, // Pass to Discord bot
            // Use notificationRoles from request body (already deduplicated by frontend)
            initialNotificationRoles: notificationRoles || [],
            // Pass event settings from database
            groupBySquadron: eventData.event_settings?.groupBySquadron || false,
            showNoResponse: eventData.event_settings?.showNoResponse || false
          };
          
          // Use creator info from database if available
          if (eventData.creator_call_sign || eventData.creator_board_number) {
            creatorFromDb = {
              boardNumber: eventData.creator_board_number || '',
              callsign: eventData.creator_call_sign || '',
              billet: eventData.creator_billet || ''
            };
            // console.log('[CREATOR-DEBUG] Using creator from database:', creatorFromDb);
          } else {
            // console.log('[CREATOR-DEBUG] No creator info in database, using provided:', creator);
          }
        }
      } catch (error) {
        console.warn('[WARNING] Could not fetch event options:', error.message);
      }
    }
    
    // Call the Discord bot to publish the event, passing both the guild ID, channel ID, and image URL if available
    console.log(`[MULTI-PUBLISH] About to call publishEventToDiscord for guild ${guildId}, channel ${channelId} with options:`, eventOptions);
    // console.log(`[CREATOR-DEBUG] Passing creator to Discord bot:`, creatorFromDb);
    const result = await publishEventToDiscord(title, description || '', eventTime, guildId, channelId, imageUrl, creatorFromDb, images, eventOptions, eventId, supabase);
    console.log(`[MULTI-PUBLISH] Discord publish result for guild ${guildId}:`, result);
      // If eventId was provided, update the event in Supabase with the Discord message ID, guild ID and image URL
    // Don't try to store the channelId in the events table as it doesn't have that column
    if (eventId && result.messageId) {
      // console.log(`[DEBUG] Updating event ${eventId} with Discord message ID ${result.messageId} and guild ID ${result.guildId}`);
      
      // Include the image URL in the database update to persist it across restarts
      const updateData = { 
        discord_event_id: result.messageId
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
        // console.log(`[DEBUG] Successfully linked event ${eventId} with Discord message ID ${result.messageId} and guild ID ${result.guildId}`);
        
        // Store thread ID if a thread was created
        if (result.threadCreated && result.threadId) {
          try {
            console.log(`[THREAD-STORE] Storing thread ID ${result.threadId} for event ${eventId}`);
            
            // Use the database helper function to store thread ID
            // Get the first participating squadron ID (we have this from earlier in the function)
            const squadronId = participatingSquadrons && participatingSquadrons.length > 0 
              ? participatingSquadrons[0] 
              : null;
            
            if (!squadronId) {
              console.warn(`[THREAD-STORE] No participating squadron ID available, cannot store thread ID`);
            } else {
              const { data: threadStoreResult, error: threadStoreError } = await supabase
                .rpc('add_event_thread_id', {
                  p_event_id: eventId,
                  p_squadron_id: squadronId,
                  p_guild_id: result.guildId,
                  p_channel_id: result.channelId,
                  p_message_id: result.messageId,
                  p_thread_id: result.threadId
                });
            
              if (threadStoreError) {
                console.warn(`[THREAD-STORE] Failed to store thread ID: ${threadStoreError.message}`);
              } else if (threadStoreResult) {
                console.log(`[THREAD-STORE] Successfully stored thread ID ${result.threadId} for event ${eventId}`);
              }
            }
          } catch (threadError) {
            console.warn(`[THREAD-STORE] Error storing thread ID: ${threadError.message}`);
          }
        }
        
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
              // console.log(`[COUNTDOWN] Added event ${eventId} to countdown update schedule`);
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
    const { title, description, startTime, endTime, guildId, channelId, imageUrl, images, creator, originalStartTime, eventId, reminders } = req.body;
    
    // console.log('[DEBUG] Received event edit request:', { 
    //   timestamp: new Date().toISOString(),
    //   messageId,
    //   eventId,
    //   title,
    //   originalStartTime,
    //   newStartTime: startTime,
    //   guildId,
    //   channelId,
    //   hasImage: !!imageUrl,
    //   creator: creator,
    //   images: images
    // });
    
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
    
    // console.log('[DEBUG] Editing Discord message:', { 
    //   messageId,
    //   title, 
    //   guildId,
    //   channelId,
    //   startTime: eventTime.start.toISOString(), 
    //   endTime: eventTime.end.toISOString() 
    // });
    
    // For edit operations, we need to fetch event options from the database
    // We can try to find the event by looking up the messageId
    let eventOptions = {};
    try {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('track_qualifications, event_type, event_settings')
        .or(`discord_event_id.eq.${messageId},discord_event_id.cs.[{"messageId":"${messageId}"}]`)
        .single();

      if (!eventError && eventData) {
        // Extract event settings (groupBySquadron, timezone, etc.)
        const eventSettings = eventData.event_settings || {};

        eventOptions = {
          trackQualifications: eventData.track_qualifications || eventSettings.groupResponsesByQualification || false,
          eventType: eventData.event_type || null,
          groupBySquadron: eventSettings.groupBySquadron || false,
          showNoResponse: eventSettings.showNoResponse || false
        };
      }
    } catch (error) {
      console.warn('[WARNING] Could not fetch event options for edit:', error.message);
    }

    // Fetch existing responses including no-response users
    let existingResponses = { accepted: [], declined: [], tentative: [], noResponse: [] };
    try {
      const { data: attendanceData } = await supabase
        .from('discord_event_attendance')
        .select('discord_id, discord_username, user_response')
        .eq('discord_event_id', messageId);

      if (attendanceData) {
        for (const record of attendanceData) {
          const userEntry = {
            userId: record.discord_id,
            displayName: record.discord_username || 'Unknown User',
            boardNumber: '',
            callsign: record.discord_username || 'Unknown User',
            pilotRecord: null
          };

          if (record.user_response === 'accepted') {
            existingResponses.accepted.push(userEntry);
          } else if (record.user_response === 'declined') {
            existingResponses.declined.push(userEntry);
          } else if (record.user_response === 'tentative') {
            existingResponses.tentative.push(userEntry);
          }
        }
      }

      // Fetch no-response users if enabled
      if (eventOptions.showNoResponse) {
        const { data: noResponseData } = await supabase
          .rpc('get_event_no_response_users', {
            discord_message_id: messageId
          });

        if (noResponseData && noResponseData.length > 0) {
          existingResponses.noResponse = noResponseData.map(record => ({
            userId: record.discord_id,
            displayName: record.discord_username || 'Unknown User',
            boardNumber: record.board_number || '',
            callsign: record.callsign || record.discord_username || 'Unknown User',
            pilotRecord: null
          }));
        }
      }
    } catch (error) {
      console.warn('[WARNING] Could not fetch existing responses for edit:', error.message);
    }

    // Call the Discord bot to edit the message
    const result = await editEventMessage(messageId, title, description || '', eventTime, guildId, channelId, existingResponses, imageUrl, creator, images, eventOptions);
    // console.log(`[DEBUG] Discord edit result:`, result);
    
    if (result.success) {
      // Handle reminder updates if start time changed and event ID is provided
      if (originalStartTime && eventId && originalStartTime !== startTime) {
        // console.log('[DEBUG] Event time changed, updating reminders...');
        // console.log('[DEBUG] Original start time:', originalStartTime);
        // console.log('[DEBUG] New start time:', startTime);
        
        // Check if this event has existing reminders
        const { data: existingReminders, error: remindersError } = await supabase
          .from('event_reminders')
          .select('*')
          .eq('event_id', eventId)
          .limit(1);
        
        if (!remindersError && existingReminders && existingReminders.length > 0) {
          // console.log('[DEBUG] Event has existing reminders, rescheduling...');
          
          // Cancel existing unsent reminders
          const { error: cancelError } = await supabase
            .from('event_reminders')
            .delete()
            .eq('event_id', eventId)
            .eq('sent', false);
          
          if (cancelError) {
            console.error('[ERROR] Failed to cancel existing reminders:', cancelError);
          } else {
            // Create new reminders based on provided settings or fallback to 15 minutes
            const newStartTime = new Date(startTime);
            const now = new Date();
            
            // Helper function to convert reminder settings to milliseconds
            const convertToMs = (value, unit) => {
              switch (unit) {
                case 'minutes': return value * 60 * 1000;
                case 'hours': return value * 60 * 60 * 1000;
                case 'days': return value * 24 * 60 * 60 * 1000;
                default: return value * 60 * 1000; // Default to minutes
              }
            };
            
            // Schedule first reminder if enabled
            if (reminders?.firstReminder?.enabled) {
              const reminderMs = convertToMs(reminders.firstReminder.value, reminders.firstReminder.unit);
              const reminderTime = new Date(newStartTime.getTime() - reminderMs);

              if (reminderTime > now) {
                const recipients = reminders.firstReminder.recipients || {};
                const { error: scheduleError} = await supabase
                  .from('event_reminders')
                  .insert({
                    event_id: eventId,
                    reminder_type: 'first',
                    scheduled_time: reminderTime.toISOString(),
                    sent: false,
                    notify_accepted: recipients.accepted || false,
                    notify_tentative: recipients.tentative || false,
                    notify_declined: recipients.declined || false,
                    notify_no_response: recipients.noResponse || false
                  });

                if (scheduleError) {
                  console.error('[ERROR] Failed to schedule first reminder:', scheduleError);
                }
              }
            }
            
            // Schedule second reminder if enabled
            if (reminders?.secondReminder?.enabled) {
              const reminderMs = convertToMs(reminders.secondReminder.value, reminders.secondReminder.unit);
              const reminderTime = new Date(newStartTime.getTime() - reminderMs);

              if (reminderTime > now) {
                const recipients = reminders.secondReminder.recipients || {};
                const { error: scheduleError } = await supabase
                  .from('event_reminders')
                  .insert({
                    event_id: eventId,
                    reminder_type: 'second',
                    scheduled_time: reminderTime.toISOString(),
                    sent: false,
                    notify_accepted: recipients.accepted || false,
                    notify_tentative: recipients.tentative || false,
                    notify_declined: recipients.declined || false,
                    notify_no_response: recipients.noResponse || false
                  });

                if (scheduleError) {
                  console.error('[ERROR] Failed to schedule second reminder:', scheduleError);
                }
              }
            }
          }
        } else {
          // console.log('[DEBUG] Event has no existing reminders, skipping reminder update');
        }
      } else if (originalStartTime && eventId) {
        // console.log('[DEBUG] Event time unchanged, no reminder update needed');
      } else {
        // console.log('[DEBUG] Missing originalStartTime or eventId, skipping reminder update');
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
    // Exclude roll_call entries (they're not Discord responses)
    const { data, error } = await supabase
      .from('discord_event_attendance')
      .select('*')
      .in('discord_event_id', messageIds)
      .neq('user_response', 'roll_call');

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
    // console.log('[DEBUG] Received request to fetch Discord guild members');
    
    // Get the guild ID from query parameters
    const { guildId } = req.query;
    
    if (!guildId) {
      return res.status(400).json({ 
        error: 'Guild ID is required. Please check your Discord integration settings.' 
      });
    }
    
    // console.log(`[DEBUG] Fetching members for guild ID: ${guildId}`);
    
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
    
    // console.log('[DEBUG] Discord client ready, fetching guild members');
    
    // Get the specific guild (server) by ID
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      await client.destroy();
      return res.status(404).json({ 
        error: `Discord guild with ID ${guildId} not found or bot doesn't have access` 
      });
    }
      // console.log(`[DEBUG] Found guild: ${guild.name} (${guild.id})`);
    
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
    
    // console.log(`[DEBUG] Fetched ${members.length} guild members (after filtering out bots)`);
    
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
    // console.log('[DEBUG] Received request to fetch available Discord servers');
    
    // Use the bot's getAvailableGuilds function
    const { guilds, error } = await getAvailableGuilds();
    
    if (error) {
      return res.status(500).json({ 
        success: false,
        error: error
      });
    }
    
    // console.log(`[DEBUG] Found ${guilds.length} available Discord servers`);
    
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

    console.log(`[CHANNELS-ENDPOINT] Getting channels for guild ${guildId}...`);

    // Use the shared Discord client through the bot module
    const result = await getGuildChannels(guildId);

    if (result.success) {
      console.log(`[CHANNELS-ENDPOINT] Found ${result.channels.length} channels for guild ${guildId}`);
      res.json({
        success: true,
        channels: result.channels
      });
    } else {
      console.error(`[CHANNELS-ENDPOINT] Error getting channels for guild ${guildId}:`, result.error);
      res.status(404).json({
        success: false,
        error: result.error
      });
    }
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
      // Legacy single channel format - Discord settings should be properly configured in discord_integration
      console.warn(`[REMINDER] Event ${eventId} has legacy single-channel format. Please update Discord integration settings.`);
      // Skip processing legacy events with incomplete configuration
    }
    
    if (channelsToNotify.length === 0) {
      console.warn('[REMINDER-API] No channels found to send reminder to');
      return res.status(400).json({
        success: false,
        error: 'No Discord channels configured for this event'
      });
    }
    
    // Use the new threading-aware reminder function instead of individual channel processing
    console.log('[REMINDER-API] Using new threading-aware reminder system');
    await sendReminderToDiscordChannels(eventData, message);
    
    res.json({
      success: true,
      message: 'Reminder sent using new threading system'
    });
    
  } catch (error) {
    console.error('[REMINDER-API] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Helper function to send reminder to a specific Discord channel or thread
async function sendReminderToChannel(guildId, channelId, message, eventId = null) {
  try {
    // Use the existing Discord bot client instead of creating a new one
    const { sendReminderMessage } = require(discordBotPath);
    
    // Call the Discord bot's reminder function with event ID for thread lookup
    const result = await sendReminderMessage(guildId, channelId, message, eventId);
    
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
    
    // console.log(`[DEBUG] Fetching roles for guild ID: ${guildId}`);
    
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
    
    // console.log(`[DEBUG] Fetching member ${userId} in guild ID: ${guildId}`);
    
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

// API endpoint to post image to Discord channel
app.post('/api/discord/post-image', async (req, res) => {
  try {
    const multer = require('multer');
    const upload = multer();
    
    // Use multer to handle the file upload
    upload.single('image')(req, res, async (err) => {
      if (err) {
        console.error('[POST-IMAGE] Multer error:', err);
        return res.status(400).json({ error: 'File upload error' });
      }

      const { guildId, channelId, message } = req.body;
      const imageFile = req.file;

      if (!guildId || !channelId || !imageFile) {
        return res.status(400).json({ 
          error: 'Missing required fields: guildId, channelId, and image file' 
        });
      }

      console.log(`[POST-IMAGE] Posting image to Discord - Guild: ${guildId}, Channel: ${channelId}`);
      console.log(`[POST-IMAGE] Delegating to Discord bot module...`);

      // Delegate to the Discord bot module for all Discord operations
      const result = await postDiscordMessageImage(
        guildId,
        channelId,
        message || '',
        imageFile.buffer,
        imageFile.originalname || 'flight_assignments.png'
      );

      if (result.success) {
        console.log(`[POST-IMAGE] Successfully posted image - Message ID: ${result.messageId}`);
        res.json({
          success: true,
          messageId: result.messageId,
          guildId: guildId,
          channelId: channelId
        });
      } else {
        console.error('[POST-IMAGE] Failed to post image:', result.error);
        const statusCode = result.availableGuilds ? 404 : 500;
        res.status(statusCode).json({
          error: result.error || 'Failed to post image',
          availableGuilds: result.availableGuilds
        });
      }
    });

  } catch (error) {
    console.error('[POST-IMAGE] Unexpected error:', error);
    res.status(500).json({ 
      error: `Server error: ${error.message}` 
    });
  }
});

// API endpoint to check for existing flight assignment posts
app.get('/api/discord/flight-posts/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    if (!eventId) {
      return res.status(400).json({ 
        error: 'Event ID is required' 
      });
    }

    // Get existing flight posts from events table
    const { data: eventData, error } = await supabase
      .from('events')
      .select('discord_flight_assignments_posts')
      .eq('id', eventId)
      .single();

    if (error) {
      console.error('[FLIGHT-POSTS] Error fetching event:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch event data' 
      });
    }

    // Parse flight posts and filter for latest posts only
    const flightPosts = eventData?.discord_flight_assignments_posts || [];
    const latestPosts = flightPosts.filter(post => post.isLatest);

    res.json({
      success: true,
      existingPosts: latestPosts,
      hasExistingPosts: latestPosts.length > 0
    });

  } catch (error) {
    console.error('[FLIGHT-POSTS] Unexpected error:', error);
    res.status(500).json({ 
      error: `Server error: ${error.message}` 
    });
  }
});

// API endpoint to update existing Discord message with new image
app.put('/api/discord/update-image/:messageId', async (req, res) => {
  try {
    const multer = require('multer');
    const upload = multer();

    // Use multer to handle the file upload
    upload.single('image')(req, res, async (err) => {
      if (err) {
        console.error('[UPDATE-IMAGE] Multer error:', err);
        return res.status(400).json({ error: 'File upload error' });
      }

      const { messageId } = req.params;
      const { guildId, channelId, message } = req.body;
      const imageFile = req.file;

      console.log(`[UPDATE-IMAGE] Received request:`, {
        messageId,
        guildId,
        channelId,
        hasMessage: !!message,
        messageText: message,
        hasImageFile: !!imageFile,
        imageFileSize: imageFile?.size
      });

      if (!messageId || !guildId || !channelId || !imageFile) {
        console.error('[UPDATE-IMAGE] Missing required fields:', {
          hasMessageId: !!messageId,
          hasGuildId: !!guildId,
          hasChannelId: !!channelId,
          hasImageFile: !!imageFile
        });
        return res.status(400).json({
          error: 'Missing required fields: messageId, guildId, channelId, and image file'
        });
      }

      console.log(`[UPDATE-IMAGE] Delegating to Discord bot module...`);

      // Delegate to the Discord bot module for all Discord operations
      const result = await updateDiscordMessageImage(
        messageId,
        guildId,
        channelId,
        message || '',
        imageFile.buffer,
        imageFile.originalname || 'flight_assignments.png'
      );

      if (result.success) {
        console.log(`[UPDATE-IMAGE] Successfully updated Discord message ${messageId}`);
        res.json({
          success: true,
          messageId: messageId,
          guildId: guildId,
          channelId: channelId
        });
      } else {
        console.error('[UPDATE-IMAGE] Failed to update Discord message:', result.error);
        res.status(500).json({
          error: result.error || 'Failed to update Discord message'
        });
      }
    });

  } catch (error) {
    console.error('[UPDATE-IMAGE] Unexpected error:', error);
    res.status(500).json({
      error: `Server error: ${error.message}`
    });
  }
});

// API endpoint to save flight post record to database
app.post('/api/discord/save-flight-post', async (req, res) => {
  try {
    const { eventId, squadronId, guildId, channelId, messageId, isUpdate = false } = req.body;
    
    if (!eventId || !squadronId || !guildId || !channelId || !messageId) {
      return res.status(400).json({ 
        error: 'Missing required fields: eventId, squadronId, guildId, channelId, messageId' 
      });
    }

    console.log(`[SAVE-FLIGHT-POST] Saving flight post record - Event: ${eventId}, Squadron: ${squadronId}, Update: ${isUpdate}`);

    // Get current event data
    const { data: eventData, error: fetchError } = await supabase
      .from('events')
      .select('discord_flight_assignments_posts')
      .eq('id', eventId)
      .single();

    if (fetchError) {
      console.error('[SAVE-FLIGHT-POST] Error fetching event:', fetchError);
      return res.status(500).json({ 
        error: 'Failed to fetch event data' 
      });
    }

    let flightPosts = eventData?.discord_flight_assignments_posts || [];
    
    if (isUpdate) {
      // For updates, increment the revision number and update timestamp
      const postIndex = flightPosts.findIndex(
        post => post.squadronId === squadronId && post.messageId === messageId
      );

      if (postIndex !== -1) {
        flightPosts[postIndex].updatedAt = new Date().toISOString();
        flightPosts[postIndex].revision = (flightPosts[postIndex].revision || 1) + 1;
      }
    } else {
      // For new posts, mark any existing posts for this squadron as not latest
      flightPosts = flightPosts.map(post =>
        post.squadronId === squadronId
          ? { ...post, isLatest: false }
          : post
      );

      // Add the new post with initial revision of 1
      const newPost = {
        squadronId,
        guildId,
        channelId,
        messageId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isLatest: true,
        revision: 1
      };

      flightPosts.push(newPost);
    }

    // Update the events table with the modified flight posts
    const { error: updateError } = await supabase
      .from('events')
      .update({ discord_flight_assignments_posts: flightPosts })
      .eq('id', eventId);

    if (updateError) {
      console.error('[SAVE-FLIGHT-POST] Error updating event flight posts:', updateError);
      return res.status(500).json({ 
        error: 'Failed to save flight post record' 
      });
    }

    res.json({
      success: true,
      message: isUpdate ? 'Flight post record updated' : 'Flight post record saved'
    });

  } catch (error) {
    console.error('[SAVE-FLIGHT-POST] Unexpected error:', error);
    res.status(500).json({ 
      error: `Server error: ${error.message}` 
    });
  }
});

// Helper function to convert UUID to integer for advisory lock
// Uses first 16 hex characters (64 bits) of UUID as lock key
function uuidToLockKey(uuid) {
  // Remove dashes and take first 16 hex chars (64 bits)
  const hex = uuid.replace(/-/g, '').substring(0, 16);
  // Convert to BigInt then to Number (PostgreSQL bigint is 64-bit signed integer)
  // We need to ensure it fits in signed 64-bit range (-2^63 to 2^63-1)
  const value = BigInt('0x' + hex);
  // Convert to signed by checking if high bit is set
  const maxInt64 = BigInt('0x7FFFFFFFFFFFFFFF');
  if (value > maxInt64) {
    return Number(value - BigInt('0x10000000000000000'));
  }
  return Number(value);
}

// Server-side reminder processing functions with distributed locking
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

    console.log(`[REMINDER-PROCESSOR] Found ${pendingReminders.length} pending reminders`);

    let processed = 0;
    let skipped = 0;
    const errors = [];

    // Generate instance ID for debugging
    const instanceId = process.env.INSTANCE_ID || `pid-${process.pid}-${Math.random().toString(36).substring(7)}`;

    // Process each reminder with distributed locking
    for (const reminder of pendingReminders) {
      const lockKey = uuidToLockKey(reminder.id);
      let lockAcquired = false;

      try {
        // Try to acquire advisory lock for this reminder
        const { data: lockResult, error: lockError } = await supabase
          .rpc('try_acquire_reminder_lock', { lock_key: lockKey });

        if (lockError) {
          console.error(`[REMINDER-LOCK] 🤖 Instance ${instanceId}: Error acquiring lock for reminder ${reminder.id}:`, lockError);
          errors.push({ reminderId: reminder.id, error: lockError });
          continue;
        }

        if (!lockResult) {
          // Lock is held by another bot instance
          console.log(`[REMINDER-LOCK] 🤖 Instance ${instanceId}: Reminder ${reminder.id} is being processed by another instance, skipping`);
          skipped++;
          continue;
        }

        lockAcquired = true;
        console.log(`[REMINDER-LOCK] 🤖 Instance ${instanceId}: ✅ ACQUIRED LOCK for reminder ${reminder.id} (type: ${reminder.reminder_type})`);

        // Process the reminder
        await processIndividualReminder(reminder);
        processed++;
        console.log(`[REMINDER-PROCESSOR] 🤖 Instance ${instanceId}: ✅ Successfully processed reminder ${reminder.id} for event ${reminder.event_id}`);

      } catch (error) {
        console.error(`[REMINDER-PROCESSOR] Error processing reminder ${reminder.id}:`, error);
        errors.push({ reminderId: reminder.id, error });
      } finally {
        // Always release the lock if we acquired it
        if (lockAcquired) {
          try {
            const { error: unlockError } = await supabase
              .rpc('release_reminder_lock', { lock_key: lockKey });

            if (unlockError) {
              console.warn(`[REMINDER-LOCK] Error releasing lock for reminder ${reminder.id}:`, unlockError);
            } else {
              console.log(`[REMINDER-LOCK] Released lock for reminder ${reminder.id}`);
            }
          } catch (unlockError) {
            console.warn(`[REMINDER-LOCK] Failed to release lock for reminder ${reminder.id}:`, unlockError);
          }
        }
      }
    }

    console.log(`[REMINDER-PROCESSOR] Completed: ${processed} processed, ${skipped} skipped (locked by other instances), ${errors.length} errors`);
    return { processed, skipped, errors };
  } catch (error) {
    console.error('[REMINDER-PROCESSOR] Error in processReminders:', error);
    return { processed: 0, skipped: 0, errors: [{ reminderId: 'general', error }] };
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

  // Log thread IDs in event data to diagnose threading issues
  if (Array.isArray(eventData.discord_event_id)) {
    const threadStatus = eventData.discord_event_id.map(pub => ({
      squadron: pub.squadronId?.substring(0, 8),
      hasThread: !!pub.threadId,
      threadId: pub.threadId?.substring(0, 20)
    }));
    console.log(`[REMINDER-THREAD-CHECK] Event ${reminder.event_id} publications thread status:`, threadStatus);
  }

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

  // Build response types array based on reminder recipient settings from the reminder record
  // Use the notify_* fields from the event_reminders table
  const recipients = {
    accepted: reminder.notify_accepted ?? false,
    tentative: reminder.notify_tentative ?? false,
    declined: reminder.notify_declined ?? false,
    noResponse: reminder.notify_no_response ?? false
  };

  const responseTypes = [];
  if (recipients.accepted) responseTypes.push('accepted');
  if (recipients.tentative) responseTypes.push('tentative');
  if (recipients.declined) responseTypes.push('declined');

  // Get attendance data for users who have responded
  // IMPORTANT: Fetch ALL responses with timestamps to deduplicate and get the latest response per user
  let attendanceData = [];
  if (responseTypes.length > 0) {
    const { data: allResponses, error: attendanceError } = await supabase
      .from('discord_event_attendance')
      .select('discord_id, discord_username, user_response, updated_at, created_at')
      .in('discord_event_id', discordEventIds);

    if (attendanceError) {
      throw new Error(`Could not fetch attendance data: ${attendanceError.message}`);
    }

    // Deduplicate responses by discord_id, keeping only the MOST RECENT response
    const latestResponseMap = new Map();
    (allResponses || []).forEach(response => {
      const existing = latestResponseMap.get(response.discord_id);
      const responseTime = new Date(response.updated_at || response.created_at);

      if (!existing || new Date(existing.updated_at || existing.created_at) < responseTime) {
        latestResponseMap.set(response.discord_id, response);
      }
    });

    // Filter to only include users whose LATEST response matches the target response types
    attendanceData = Array.from(latestResponseMap.values())
      .filter(response => responseTypes.includes(response.user_response));

    console.log(`[REMINDER-DEDUP] Fetched ${allResponses?.length || 0} total responses, deduplicated to ${latestResponseMap.size} latest responses, filtered to ${attendanceData.length} matching target types`);
  }

  // Handle no_response case (users who haven't responded yet)
  if (recipients.noResponse) {
    // Get all users who have responded with their latest response
    const { data: allResponses, error: responseError } = await supabase
      .from('discord_event_attendance')
      .select('discord_id, updated_at, created_at')
      .in('discord_event_id', discordEventIds);

    if (responseError) {
      console.warn(`[REMINDER] Could not fetch all responses for no-response filtering: ${responseError.message}`);
    } else {
      // Deduplicate to get only users who have responded (regardless of response type)
      // We only care if they've responded at all, not what their response was
      const latestResponseMap = new Map();
      (allResponses || []).forEach(response => {
        const existing = latestResponseMap.get(response.discord_id);
        const responseTime = new Date(response.updated_at || response.created_at);

        if (!existing || new Date(existing.updated_at || existing.created_at) < responseTime) {
          latestResponseMap.set(response.discord_id, response);
        }
      });

      const respondedUserIds = new Set(latestResponseMap.keys());

      // Get all active pilots from participating squadrons
      const { data: pilots, error: pilotsError } = await supabase
        .from('pilots')
        .select('discord_id, callsign')
        .eq('status', 'Active'); // Only active pilots

      if (pilotsError) {
        console.warn(`[REMINDER] Could not fetch pilots for no-response filtering: ${pilotsError.message}`);
      } else {
        // Add users who haven't responded to the attendance data
        (pilots || []).forEach(pilot => {
          if (pilot.discord_id && !respondedUserIds.has(pilot.discord_id)) {
            attendanceData.push({
              discord_id: pilot.discord_id,
              discord_username: pilot.callsign,
              user_response: 'no_response'
            });
          }
        });
      }
    }
  }

  // If no users to notify, mark reminder as sent and return
  if (!attendanceData || attendanceData.length === 0) {
    console.log(`No users to notify for reminder ${reminder.id}, marking as sent`);
    await markReminderAsSent(reminder.id);
    return;
  }

  // Calculate time until event
  // console.log('[EVENT-DEBUG] Event start_datetime field:', eventData.start_datetime);
  // console.log('[EVENT-DEBUG] Available event fields:', Object.keys(eventData));
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
  
  // console.log(`[REMINDER-DEBUG] Total attendance records: ${attendanceData.length}`);
  // console.log(`[REMINDER-DEBUG] Unique users after deduplication: ${uniqueUsers.size}`);
  
  // Create Discord mentions for actual notification using unique users only
  const discordMentions = Array.from(uniqueUsers.values())
    .map(user => `<@${user.discord_id}>`)
    .join(' ');
  const fullMessage = discordMentions ? `${discordMentions}\n${message}` : message;
  
  // Send the reminder message to Discord channels
  const sendResult = await sendReminderToDiscordChannels(eventData, fullMessage);

  // Only mark reminder as sent if at least one message was successfully delivered
  if (sendResult.success && sendResult.sent > 0) {
    await markReminderAsSent(reminder.id);
    console.log(`[REMINDER] Marked reminder ${reminder.id} as sent after delivering to ${sendResult.sent} channel(s)`);
  } else {
    console.error(`[REMINDER] Failed to send reminder ${reminder.id} to any channels, will retry on next check`);
    throw new Error(`Reminder delivery failed: ${sendResult.error || 'No channels successfully notified'}`);
  }
}

function calculateTimeUntilEvent(eventStartTime) {
  // console.log('[TIME-CALC-DEBUG] Event start time string:', eventStartTime);
  
  if (!eventStartTime) {
    console.error('[TIME-CALC-DEBUG] Event start time is undefined/null');
    return 'unknown time';
  }
  
  const now = new Date();
  const eventStart = new Date(eventStartTime);
  // console.log('[TIME-CALC-DEBUG] Current time:', now.toISOString());
  // console.log('[TIME-CALC-DEBUG] Event start parsed:', eventStart.toISOString());
  // console.log('[TIME-CALC-DEBUG] Event start is valid date:', !isNaN(eventStart.getTime()));
  const diffMs = eventStart.getTime() - now.getTime();
  // console.log('[TIME-CALC-DEBUG] Difference in ms:', diffMs);
  
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
  // console.log('[FORMAT-REMINDER-DEBUG] Event data:', event);
  // console.log('[FORMAT-REMINDER-DEBUG] Time until event:', timeUntilEvent);
  
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
        // console.log('[FORMAT-REMINDER-DEBUG] Using timezone from event settings:', timezone);
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
  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  if (Array.isArray(event.discord_event_id)) {
    // Multi-channel event

    // Deduplicate publications by guild+channel+thread combination
    // For multi-squadron events in shared channels, we need to avoid duplicate reminders
    // If a thread exists, deduplicate by threadId (since multiple squadrons share the same thread)
    // If no thread, deduplicate by channelId (since reminders go to the channel)
    const uniquePublications = new Map();
    event.discord_event_id.forEach(pub => {
      // Use threadId for deduplication if it exists, otherwise use channelId
      // This ensures multi-squadron events in shared channels only get one reminder
      const targetLocation = pub.threadId || pub.channelId;
      const key = `${pub.guildId}:${targetLocation}`;
      if (!uniquePublications.has(key)) {
        uniquePublications.set(key, pub);
      }
    });

    // Generate a unique instance ID for this bot process (for debugging multi-instance issues)
    const instanceId = process.env.INSTANCE_ID || `pid-${process.pid}-${Math.random().toString(36).substring(7)}`;

    console.log(`[REMINDER-DEDUP] 🤖 Instance ${instanceId} processing event ${event.id}: ${event.discord_event_id.length} total publications, ${uniquePublications.size} unique locations`);
    console.log(`[REMINDER-DEDUP] Deduplication map keys:`, Array.from(uniquePublications.keys()));
    console.log(`[REMINDER-DEDUP] Publications:`, event.discord_event_id.map(p => ({
      squadron: p.squadronId?.substring(0, 8),
      guild: p.guildId,
      channel: p.channelId,
      thread: p.threadId?.substring(0, 20) || 'NONE',
      message: p.messageId,
      dedupKey: `${p.guildId}:${p.threadId || p.channelId}`
    })));

    for (const publication of uniquePublications.values()) {
      console.log(`[REMINDER-INSTANCE] 🤖 Instance ${instanceId} processing unique publication for guild ${publication.guildId}, channel ${publication.channelId}, squadron ${publication.squadronId?.substring(0, 8)}`);
      try {
        // Thread creation logic: Create thread on first reminder if threading is enabled
        let createdThreadId = null;
        let targetChannelId = publication.channelId; // Default to main channel
        
        // Check if thread already exists for this publication
        if (publication.threadId) {
          // Thread already exists, use it
          console.log(`[REMINDER-THREAD] Thread already exists for this event: ${publication.threadId}`);
          targetChannelId = publication.threadId;
        } else {
          // No thread exists yet, check if we should create one
          console.log(`[REMINDER-THREAD] No thread exists yet, checking if thread should be created for event "${event.name}"`);
          
          // Get participating squadrons from the publication
          const participatingSquadrons = publication.squadronId ? [publication.squadronId] : [];
          const threadDecision = await shouldUseThreadsForEvent(participatingSquadrons, publication.guildId, publication.channelId);
          
          if (threadDecision.shouldUseThreads) {
            console.log(`[REMINDER-THREAD] Creating thread from original event post for event "${event.name}"`);
            
            const threadResult = await createThreadFromMessage(
              publication.messageId,
              event.name, // Thread name = event name
              publication.guildId,
              publication.channelId,
              threadDecision.autoArchiveDuration
            );
            
            if (threadResult.success) {
              console.log(`[REMINDER-THREAD] Thread created successfully: ${threadResult.threadId}`);
              createdThreadId = threadResult.threadId;
              targetChannelId = threadResult.threadId; // Send reminder to the new thread
              
              // Update the database to store the thread ID for future reminders
              // CRITICAL: This must complete successfully before continuing to prevent duplicate reminders
              const updatedPublications = event.discord_event_id.map(pub =>
                (pub.guildId === publication.guildId && pub.channelId === publication.channelId)
                  ? { ...pub, threadId: threadResult.threadId }
                  : pub
              );

              let threadIdStored = false;
              let retryCount = 0;
              const maxRetries = 3;

              while (!threadIdStored && retryCount < maxRetries) {
                try {
                  retryCount++;
                  console.log(`[REMINDER-THREAD] Attempt ${retryCount}/${maxRetries} to store thread ID ${threadResult.threadId}`);

                  const { error: updateError } = await supabase
                    .from('events')
                    .update({ discord_event_id: updatedPublications })
                    .eq('id', event.id);

                  if (updateError) {
                    console.error(`[REMINDER-THREAD] Database update FAILED (attempt ${retryCount}):`, updateError);
                    if (retryCount < maxRetries) {
                      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                      continue;
                    }
                    throw updateError;
                  }

                  // Verify the update was successful by reading it back
                  const { data: verifyData, error: verifyError } = await supabase
                    .from('events')
                    .select('discord_event_id')
                    .eq('id', event.id)
                    .single();

                  if (verifyError || !verifyData) {
                    console.error(`[REMINDER-THREAD] Verification query failed (attempt ${retryCount}):`, verifyError);
                    if (retryCount < maxRetries) {
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      continue;
                    }
                    throw new Error('Verification query failed');
                  }

                  const storedPubs = Array.isArray(verifyData.discord_event_id) ? verifyData.discord_event_id : [];
                  const hasThreadId = storedPubs.some(pub =>
                    pub.guildId === publication.guildId &&
                    pub.channelId === publication.channelId &&
                    pub.threadId === threadResult.threadId
                  );

                  if (hasThreadId) {
                    console.log(`[REMINDER-THREAD] ✅ VERIFIED: Thread ID ${threadResult.threadId} successfully stored for event ${event.id} (attempt ${retryCount})`);
                    threadIdStored = true;
                    // Update the in-memory event object
                    event.discord_event_id = updatedPublications;
                  } else {
                    console.error(`[REMINDER-THREAD] ❌ VERIFICATION FAILED: Thread ID not in database (attempt ${retryCount})`);
                    if (retryCount < maxRetries) {
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      continue;
                    }
                    throw new Error('Thread ID verification failed after update');
                  }

                } catch (error) {
                  if (retryCount >= maxRetries) {
                    console.error(`[REMINDER-THREAD] 🚨 CRITICAL: Failed to store thread ID after ${maxRetries} attempts:`, error.message);
                    console.error(`[REMINDER-THREAD] 🚨 This will cause duplicate reminders on subsequent reminder attempts!`);
                    // Don't throw - we still want to send the reminder, but log the critical issue
                    break;
                  }
                }
              }
            } else {
              console.warn(`[REMINDER-THREAD] Thread creation failed: ${threadResult.error}`);
              // Continue with channel posting if thread creation fails
              targetChannelId = publication.channelId;
            }
          } else {
            console.log(`[REMINDER-THREAD] Threading disabled for this squadron, no thread will be created`);
            targetChannelId = publication.channelId;
          }
        }
        
        // Send the reminder message
        console.log(`[REMINDER-SEND] Event ${event.id}: targetChannelId=${targetChannelId}, publication.channelId=${publication.channelId}, isThread=${targetChannelId !== publication.channelId}`);
        let reminderResult;
        if (targetChannelId !== publication.channelId) {
          // We're sending to a thread, use postMessageToThread directly
          console.log(`[REMINDER-SEND] Posting to THREAD ${targetChannelId} in guild ${publication.guildId}`);
          reminderResult = await postMessageToThread(targetChannelId, publication.guildId, message);
          console.log(`[REMINDER-SEND] Thread post result:`, reminderResult);
        } else {
          // No thread, use normal channel messaging
          console.log(`[REMINDER-SEND] Posting to CHANNEL ${targetChannelId} in guild ${publication.guildId}`);
          reminderResult = await sendReminderMessage(publication.guildId, targetChannelId, message);
          console.log(`[REMINDER-SEND] Channel post result:`, reminderResult);
          
          // If threading is disabled and we posted to channel, track the message ID for deletion
          if (reminderResult.success && reminderResult.messageId) {
            try {
              // Store reminder message ID in the publication for later deletion
              const updatedPublications = event.discord_event_id.map(pub => 
                pub.messageId === publication.messageId 
                  ? { 
                      ...pub, 
                      reminderMessageIds: [...(pub.reminderMessageIds || []), reminderResult.messageId]
                    }
                  : pub
              );
              
              await supabase
                .from('events')
                .update({ discord_event_id: updatedPublications })
                .eq('id', event.id);
                
              console.log(`[REMINDER-TRACKING] Stored reminder message ID ${reminderResult.messageId} for event ${event.id}`);
            } catch (trackingError) {
              console.warn(`[REMINDER-TRACKING] Failed to store reminder message ID:`, trackingError.message);
            }
          }
        }
        
        const threadStatus = createdThreadId ? ' (in newly created thread)' : (publication.threadId ? ' (in existing thread)' : '');
        console.log(`[REMINDER] Sent reminder to guild ${publication.guildId}, channel ${targetChannelId}${threadStatus}`);

        // Track success if reminder was actually sent
        if (reminderResult && reminderResult.success) {
          successCount++;
        } else {
          errorCount++;
          errors.push({ guild: publication.guildId, channel: targetChannelId, error: 'Send returned failure' });
        }

      } catch (error) {
        console.error(`[REMINDER] Failed to send reminder to guild ${publication.guildId}, channel ${publication.channelId}:`, error);
        errorCount++;
        errors.push({ guild: publication.guildId, channel: publication.channelId, error: error.message });
      }
    }
  } else if (event.discord_event_id) {
    // Legacy single-channel event format
    console.log(`[REMINDER] Processing legacy single-channel event with message ID: ${event.discord_event_id}`);

    // For legacy events, we need to find the guild and channel IDs
    // Try to get them from the event's participants or discord integration data
    try {
      // Query the events table to get full event data including participants
      const { data: fullEventData, error: eventFetchError } = await supabase
        .from('events')
        .select('participants')
        .eq('id', event.id)
        .single();

      if (eventFetchError) {
        console.error(`[REMINDER] Failed to fetch full event data for legacy event ${event.id}:`, eventFetchError);
        return;
      }

      // Get the first participating squadron to find Discord integration settings
      const participatingSquadrons = Array.isArray(fullEventData?.participants) ? fullEventData.participants : [];

      if (participatingSquadrons.length === 0) {
        console.warn(`[REMINDER] No participating squadrons found for legacy event ${event.id}, cannot send reminder`);
        return;
      }

      // Get Discord integration settings for the first squadron
      const { data: integrationData, error: integrationError } = await supabase
        .from('discord_integration')
        .select('guild_id, channel_id')
        .eq('squadron_id', participatingSquadrons[0])
        .single();

      if (integrationError || !integrationData) {
        console.warn(`[REMINDER] No Discord integration found for squadron ${participatingSquadrons[0]}, cannot send reminder`);
        return;
      }

      const guildId = integrationData.guild_id;
      const channelId = integrationData.channel_id;

      console.log(`[REMINDER] Found Discord integration for legacy event - Guild: ${guildId}, Channel: ${channelId}`);

      // Send the reminder using the normal channel messaging (no threading for legacy events)
      const reminderResult = await sendReminderMessage(guildId, channelId, message);

      if (reminderResult.success) {
        console.log(`[REMINDER] Successfully sent legacy event reminder to channel ${channelId} in guild ${guildId}`);
        successCount++;
      } else {
        console.error(`[REMINDER] Failed to send legacy event reminder:`, reminderResult.error);
        errorCount++;
        errors.push({ guild: guildId, channel: channelId, error: reminderResult.error });
      }

    } catch (error) {
      console.error(`[REMINDER] Error processing legacy event reminder:`, error);
      errorCount++;
      errors.push({ legacy: true, error: error.message });
    }
  }

  // Return summary of sending results
  return {
    success: successCount > 0,
    sent: successCount,
    failed: errorCount,
    errors: errors.length > 0 ? errors : undefined
  };
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

// Process concluded events and remove response buttons
async function processConcludedEvents() {
  try {
    console.log('[CONCLUDED-EVENTS] Checking for concluded events...');

    const now = new Date().toISOString();

    // Find events that have concluded but haven't had buttons removed yet
    const { data: concludedEvents, error: fetchError } = await supabase
      .from('events')
      .select('id, name, end_datetime, discord_event_id, buttons_removed')
      .lte('end_datetime', now)
      .neq('buttons_removed', true)
      .not('discord_event_id', 'is', null);

    if (fetchError) {
      console.error('[CONCLUDED-EVENTS] Error fetching concluded events:', fetchError);
      return { processed: 0, errors: [fetchError] };
    }

    if (!concludedEvents || concludedEvents.length === 0) {
      console.log('[CONCLUDED-EVENTS] No concluded events found');
      return { processed: 0, errors: [] };
    }

    console.log(`[CONCLUDED-EVENTS] Found ${concludedEvents.length} concluded events with buttons to remove`);

    let processed = 0;
    const errors = [];

    for (const event of concludedEvents) {
      try {
        // NOTE: Button removal and "Event Finished" text is handled by the Discord bot's
        // countdown manager in SDOBot. The server-side processor only marks events as
        // processed in the database so they don't get checked repeatedly.
        // The actual Discord message updates happen in SDOBot/lib/countdownManager.js

        console.log(`[CONCLUDED-EVENTS] Marking event "${event.name}" as processed (Discord bot will handle final updates)`);

        // Mark event as having buttons removed (Discord bot will actually remove them)
        await supabase
          .from('events')
          .update({ buttons_removed: true })
          .eq('id', event.id);

        processed++;
        console.log(`[CONCLUDED-EVENTS] Processed concluded event "${event.name}" (${event.id})`);
      } catch (error) {
        console.error(`[CONCLUDED-EVENTS] Error processing event ${event.id}:`, error);
        errors.push({ eventId: event.id, error });
      }
    }

    console.log(`[CONCLUDED-EVENTS] Completed: ${processed} processed, ${errors.length} errors`);
    return { processed, errors };
  } catch (error) {
    console.error('[CONCLUDED-EVENTS] Error in processConcludedEvents:', error);
    return { processed: 0, errors: [{ error }] };
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

  // Process concluded events immediately
  processConcludedEvents().catch(error => {
    console.error('Error in initial concluded events processing:', error);
  });

  // Then process every 1 minute
  reminderIntervalId = setInterval(() => {
    processReminders().catch(error => {
      console.error('Error in scheduled reminder processing:', error);
    });
    processConcludedEvents().catch(error => {
      console.error('Error in scheduled concluded events processing:', error);
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