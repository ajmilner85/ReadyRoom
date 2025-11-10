/**
 * COMBINED SERVER FOR FLY.IO DEPLOYMENT (ReadyRoom)
 * 
 * PURPOSE: Complete Express server with Discord bot for cloud deployment
 * 
 * RESPONSIBILITIES:
 * - Express server on port 3001 (listening on 0.0.0.0 for Fly.io)
 * - All API endpoints (/api/events, /api/reminders, etc.)
 * - Event creation, editing, deletion logic
 * - Reminder processing and scheduling
 * - Database operations (Supabase)
 * - Discord bot initialization and integration
 * - User authentication and authorization
 * - Production CORS configuration for Vercel frontend
 * 
 * DEPLOYMENT CONTEXT:
 * - This file combines both server/index.js and Discord bot functionality
 * - Used exclusively for Fly.io production deployment
 * - Includes complete API surface that frontend depends on
 * - Configured for production environment with proper CORS origins
 */
const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

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

// Require the Discord bot (paths adjusted for SDOBot directory)
const { 
  publishEventToDiscord, 
  initializeDiscordBot, 
  deleteEventMessage,
  editEventMessage, 
  getAvailableGuilds,
  countdownManager,
  sendReminderMessage,
  postMessageToThread,
  getGuildRoles,
  getGuildMember,
  shouldUseThreadsForEvent,
  createThreadFromMessage,
  deleteThread
} = require('./discordBot');

// Import Supabase client (path adjusted for SDOBot directory)
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

// Configure CORS with production origins for Fly.io deployment
// Use environment variable if available, otherwise fallback to hardcoded list
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'https://readyroom.vercel.app',
      'https://readyroom.ajmilner.com',
      'https://readyroom.fightingstingrays.com',
      'https://readyroompreview.ajmilner.com',
      'https://readyroom-git-development-ajmilner85s-projects.vercel.app',
      'https://ready-room.vercel.app',
      'https://ready-room-git-development-ajmilner85.vercel.app',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173'
    ];

console.log('[CORS] Allowed origins:', corsOrigins);

app.use(cors({
  origin: corsOrigins,
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
    const { title, description, startTime, endTime, eventId, guildId, channelId, imageUrl, images, creator } = req.body;
    
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
          .select('track_qualifications, event_type, event_settings, creator_call_sign, creator_board_number, creator_billet, participants')
          .eq('id', eventId)
          .single();
        
        if (!eventError && eventData) {
          // Extract participating squadrons for threading decision
          participatingSquadrons = Array.isArray(eventData.participants) ? eventData.participants : [];
          console.log(`[THREADING] Event ${eventId} has ${participatingSquadrons.length} participating squadrons:`, participatingSquadrons);
          
          // Extract event settings (groupBySquadron, timezone, etc.)
          const eventSettings = eventData.event_settings || {};
          
          eventOptions = {
            trackQualifications: eventData.track_qualifications || eventSettings.groupResponsesByQualification || false,
            eventType: eventData.event_type || null,
            groupBySquadron: eventSettings.groupBySquadron || false,
            showNoResponse: eventSettings.showNoResponse || false,
            participatingSquadrons: participatingSquadrons, // Pass to Discord bot
            initialNotificationRoles: eventSettings.initialNotificationRoles || [] // For @mentions on initial publication
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
                const { error: scheduleError } = await supabase
                  .from('event_reminders')
                  .insert({
                    event_id: eventId,
                    reminder_type: 'first',
                    scheduled_time: reminderTime.toISOString(),
                    sent: false
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
                const { error: scheduleError } = await supabase
                  .from('event_reminders')
                  .insert({
                    event_id: eventId,
                    reminder_type: 'second',
                    scheduled_time: reminderTime.toISOString(),
                    sent: false
                  });
                
                if (scheduleError) {
                  console.error('[ERROR] Failed to schedule second reminder:', scheduleError);
                }
              }
            }
            
            // If no reminder settings provided, fallback to 15-minute default
            if (!reminders?.firstReminder?.enabled && !reminders?.secondReminder?.enabled) {
              const reminderTime = new Date(newStartTime.getTime() - (15 * 60 * 1000));
              
              if (reminderTime > now) {
                const { error: scheduleError } = await supabase
                  .from('event_reminders')
                  .insert({
                    event_id: eventId,
                    reminder_type: 'first',
                    scheduled_time: reminderTime.toISOString(),
                    sent: false
                  });
                
                if (scheduleError) {
                  console.error('[ERROR] Failed to schedule default reminder:', scheduleError);
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
    
    // Process each unique user response and fetch pilot records
    const processedResponses = await Promise.all(
      Array.from(userResponses.values()).map(async (record) => {
        // Fetch pilot record from database
        let pilotRecord = null;
        try {
          const { data: pilotData, error: pilotError } = await supabase
            .from('pilots')
            .select('id, callsign, boardNumber, discord_id')
            .eq('discord_id', record.discord_id)
            .single();

          if (!pilotError && pilotData) {
            pilotRecord = {
              id: pilotData.id,
              callsign: pilotData.callsign,
              boardNumber: pilotData.boardNumber?.toString() || ''
            };
          }
        } catch (error) {
          console.warn(`Error fetching pilot data for ${record.discord_id}:`, error.message);
        }

        // Prepare the attendee object using pilot record if available
        const attendee = {
          boardNumber: pilotRecord?.boardNumber || '',
          callsign: pilotRecord?.callsign || record.discord_username || 'Unknown User',
          discord_id: record.discord_id,
          billet: record.billet
        };

        return { attendee, response: record.user_response };
      })
    );

    // Sort responses into appropriate lists
    processedResponses.forEach(({ attendee, response }) => {
      if (response === 'accepted') {
        attendance.accepted.push(attendee);
      } else if (response === 'declined') {
        attendance.declined.push(attendee);
      } else if (response === 'tentative') {
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

      const { guildId, channelId, message, roleMentions } = req.body;
      const imageFile = req.file;

      if (!guildId || !channelId || !imageFile) {
        return res.status(400).json({ 
          error: 'Missing required fields: guildId, channelId, and image file' 
        });
      }
      
      // Parse role mentions if provided
      let roles = [];
      if (roleMentions) {
        try {
          roles = JSON.parse(roleMentions);
        } catch (e) {
          console.error('[POST-IMAGE] Failed to parse roleMentions:', e);
        }
      }

      console.log(`[POST-IMAGE] Posting image to Discord - Guild: ${guildId}, Channel: ${channelId}, Message: ${message || 'No message'}, Role mentions: ${roles.length}`);

      try {
        // Wait for Discord client to be ready
        if (!discordClient.isReady()) {
          await new Promise((resolve) => {
            discordClient.once('ready', resolve);
          });
        }

        // Get the guild and channel
        const guild = discordClient.guilds.cache.get(guildId);
        if (!guild) {
          // Log available guilds for debugging
          const availableGuilds = discordClient.guilds.cache.map(g => ({ id: g.id, name: g.name }));
          console.error(`[POST-IMAGE] Guild ${guildId} not found. Available guilds:`, availableGuilds);
          return res.status(404).json({
            error: `Discord server with ID ${guildId} not found or bot doesn't have access`,
            availableGuilds: availableGuilds
          });
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
          return res.status(404).json({ 
            error: `Channel with ID ${channelId} not found in server` 
          });
        }

        // Create attachment from the uploaded file
        const { AttachmentBuilder } = require('discord.js');
        const attachment = new AttachmentBuilder(imageFile.buffer, { 
          name: imageFile.originalname || 'flight_assignments.png' 
        });
        
        // Build message content with role mentions if provided
        let messageContent = message || '';
        if (roles && roles.length > 0) {
          const roleMentionsString = roles.map(role => `<@&${role.id}>`).join(' ');
          messageContent = roleMentionsString + (message ? `\n${message}` : '');
          console.log(`[POST-IMAGE] Adding role mentions to message: ${roleMentionsString}`);
        }

        // Send the message with the image
        const discordMessage = await channel.send({
          content: messageContent,
          files: [attachment]
        });

        console.log(`[POST-IMAGE] Successfully posted image to Discord - Message ID: ${discordMessage.id}`);

        res.json({
          success: true,
          messageId: discordMessage.id,
          guildId: guildId,
          channelId: channelId
        });

      } catch (discordError) {
        console.error('[POST-IMAGE] Discord API error:', discordError);
        res.status(500).json({ 
          error: `Discord API error: ${discordError.message}` 
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

      if (!messageId || !guildId || !channelId || !imageFile) {
        return res.status(400).json({ 
          error: 'Missing required fields: messageId, guildId, channelId, and image file' 
        });
      }

      console.log(`[UPDATE-IMAGE] Updating Discord message ${messageId} - Guild: ${guildId}, Channel: ${channelId}`);

      try {
        // Wait for Discord client to be ready
        if (!discordClient.isReady()) {
          await new Promise((resolve) => {
            discordClient.once('ready', resolve);
          });
        }

        // Get the guild and channel
        const guild = discordClient.guilds.cache.get(guildId);
        if (!guild) {
          return res.status(404).json({ 
            error: `Discord server with ID ${guildId} not found or bot doesn't have access` 
          });
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
          return res.status(404).json({ 
            error: `Channel with ID ${channelId} not found in server` 
          });
        }

        // Get the existing message
        let existingMessage;
        try {
          existingMessage = await channel.messages.fetch(messageId);
        } catch (fetchError) {
          return res.status(404).json({ 
            error: `Message with ID ${messageId} not found in channel` 
          });
        }

        // Create attachment from the uploaded file
        const { AttachmentBuilder } = require('discord.js');
        const attachment = new AttachmentBuilder(imageFile.buffer, { 
          name: imageFile.originalname || 'flight_assignments.png' 
        });

        // Edit the message with the new image
        const updatedMessage = await existingMessage.edit({
          content: message || existingMessage.content || '',
          files: [attachment]
        });

        console.log(`[UPDATE-IMAGE] Successfully updated Discord message ${messageId}`);

        res.json({
          success: true,
          messageId: updatedMessage.id,
          guildId: guildId,
          channelId: channelId
        });

      } catch (discordError) {
        console.error('[UPDATE-IMAGE] Discord API error:', discordError);
        res.status(500).json({ 
          error: `Discord API error: ${discordError.message}` 
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

  // console.log('[EVENT-DEBUG] Retrieved event data:', JSON.stringify(eventData, null, 2));

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

  // Build response types array based on reminder settings
  const responseTypes = [];
  if (reminder.notify_accepted !== false) responseTypes.push('accepted');
  if (reminder.notify_tentative !== false) responseTypes.push('tentative');
  if (reminder.notify_declined === true) responseTypes.push('declined');
  
  console.log(`[REMINDER-${reminder.id}] Notifying response types:`, responseTypes);
  console.log(`[REMINDER-${reminder.id}] Include no-response: ${reminder.notify_no_response === true}`);

  let attendanceData = [];

  // Query for users with specific responses (if any response types selected)
  if (responseTypes.length > 0) {
    const { data: respondedUsers, error: attendanceError } = await supabase
      .from('discord_event_attendance')
      .select('discord_id, discord_username, user_response')
      .in('discord_event_id', discordEventIds)
      .in('user_response', responseTypes);

    if (attendanceError) {
      throw new Error(`Could not fetch attendance data: ${attendanceError.message}`);
    }

    attendanceData = respondedUsers || [];
  }

  // Handle "no response" users if selected
  if (reminder.notify_no_response === true) {
    // Get all users who responded (any response type)
    const { data: allResponders } = await supabase
      .from('discord_event_attendance')
      .select('discord_id')
      .in('discord_event_id', discordEventIds);
    
    const responderIds = new Set((allResponders || []).map(r => r.discord_id));
    
    // Get participating squadrons from event
    const participatingSquadronIds = eventData.participants || [];
    
    if (participatingSquadronIds.length > 0) {
      // Get pilots from participating squadrons with active status
      const { data: eligiblePilots } = await supabase
        .from('pilots')
        .select(`
          discord_id,
          discord_username,
          pilot_statuses!inner(
            status_id,
            end_date,
            statuses!inner(isActive)
          ),
          pilot_assignments!inner(squadron_id)
        `)
        .in('pilot_assignments.squadron_id', participatingSquadronIds)
        .eq('pilot_statuses.statuses.isActive', true)
        .is('pilot_statuses.end_date', null)
        .not('discord_id', 'is', null);
      
      // Filter for users who haven't responded
      const noResponseUsers = (eligiblePilots || [])
        .filter(pilot => !responderIds.has(pilot.discord_id))
        .map(pilot => ({
          discord_id: pilot.discord_id,
          discord_username: pilot.discord_username,
          user_response: 'no_response'
        }));
      
      console.log(`[REMINDER-${reminder.id}] Found ${noResponseUsers.length} no-response users`);
      attendanceData = [...attendanceData, ...noResponseUsers];
    }
  }

  // Filter attendance data to only include ACTIVE pilots
  if (attendanceData.length > 0) {
    const discordIds = attendanceData.map(a => a.discord_id);
    
    const { data: activePilots } = await supabase
      .from('pilots')
      .select(`
        discord_id,
        pilot_statuses!inner(
          status_id,
          end_date,
          statuses!inner(isActive)
        )
      `)
      .in('discord_id', discordIds)
      .eq('pilot_statuses.statuses.isActive', true)
      .is('pilot_statuses.end_date', null);
    
    const activePilotIds = new Set((activePilots || []).map(p => p.discord_id));
    
    // Filter attendanceData to only active pilots
    const originalCount = attendanceData.length;
    attendanceData = attendanceData.filter(user => activePilotIds.has(user.discord_id));
    
    console.log(`[REMINDER-${reminder.id}] Filtered to ${attendanceData.length} active pilots (from ${originalCount} total)`);
  }

  // DEBUGGING: Inject 744 Nubs as a test member for VX-14 Testing Squadron
  // This allows testing reminder notifications without spamming real squadron members
  // This runs on ALL instances (dev and production) since VX-14 is explicitly a testing squadron
  const TESTING_SQUADRON_ID = 'fd56a33c-5b26-46f5-9332-7acf83f45e77';
  const TEST_PILOT_DISCORD_ID = '118942689508065280';
  const TEST_PILOT_CALLSIGN = '744 Nubs';

  // Check if event includes testing squadron
  const isTestingEvent = eventData.participants &&
    Array.isArray(eventData.participants) &&
    eventData.participants.includes(TESTING_SQUADRON_ID);

  if (isTestingEvent) {
    console.log(`[REMINDER-DEBUG] 🧪 VX-14 Testing Squadron event detected, injecting test pilot ${TEST_PILOT_CALLSIGN}`);

    // Check if test pilot is already in attendanceData (from actual responses)
    const hasTestPilot = attendanceData.some(a => a.discord_id === TEST_PILOT_DISCORD_ID);

    if (!hasTestPilot) {
      // Inject test pilot with appropriate response status
      // Default to 'no_response' so they get included in both first and second reminders
      attendanceData.push({
        discord_id: TEST_PILOT_DISCORD_ID,
        discord_username: TEST_PILOT_CALLSIGN,
        user_response: 'no_response'
      });
      console.log(`[REMINDER-DEBUG] 🧪 Injected test pilot ${TEST_PILOT_CALLSIGN} into reminder recipients`);
    } else {
      console.log(`[REMINDER-DEBUG] 🧪 Test pilot already has a response, using actual response data`);
    }
  }

  if (!attendanceData || attendanceData.length === 0) {
    console.log(`No eligible recipients for reminder ${reminder.id}, marking as sent`);
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
  await sendReminderToDiscordChannels(eventData, fullMessage);
  
  // Mark reminder as sent
  await markReminderAsSent(reminder.id);
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
  if (Array.isArray(event.discord_event_id)) {
    // Multi-channel event
    for (const publication of event.discord_event_id) {
      try {
        // Thread creation logic: Create thread on first reminder if threading is enabled
        let createdThreadId = null;
        let targetChannelId = publication.channelId; // Default to main channel
        
        // Check if thread already exists for this publication
        if (publication.threadId) {
          // Check if threading was previously disabled due to failure
          if (publication.threadId === 'DISABLED') {
            console.log(`[REMINDER-THREAD] Threading was previously disabled for this publication, posting to channel`);
            targetChannelId = publication.channelId;
          } else {
            // Thread already exists, use it
            console.log(`[REMINDER-THREAD] Thread already exists for this event: ${publication.threadId}`);
            targetChannelId = publication.threadId;
          }
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
              try {
                // Find the publication entry and update it with thread ID
                const updatedPublications = event.discord_event_id.map(pub => 
                  pub.messageId === publication.messageId 
                    ? { ...pub, threadId: threadResult.threadId }
                    : pub
                );
                
                await supabase
                  .from('events')
                  .update({ discord_event_id: updatedPublications })
                  .eq('id', event.id);
                  
                console.log(`[REMINDER-THREAD] Updated event ${event.id} with thread ID ${threadResult.threadId}`);
              } catch (updateError) {
                console.warn(`[REMINDER-THREAD] Failed to update event with thread ID:`, updateError.message);
              }
            } else {
              console.warn(`[REMINDER-THREAD] Thread creation failed: ${threadResult.error}`);
              // Store DISABLED sentinel to prevent future retry attempts
              console.log(`[REMINDER-THREAD] Storing threadId='DISABLED' to prevent future thread creation attempts`);

              try {
                // Read latest event data first to avoid race conditions
                const { data: latestEventData, error: fetchError } = await supabase
                  .from('events')
                  .select('discord_event_id')
                  .eq('id', event.id)
                  .single();

                if (fetchError || !latestEventData) {
                  console.error(`[REMINDER-THREAD] Failed to fetch latest event data:`, fetchError);
                } else {
                  const updatedPublications = latestEventData.discord_event_id.map(pub =>
                    (pub.guildId === publication.guildId && pub.channelId === publication.channelId)
                      ? { ...pub, threadId: 'DISABLED' }
                      : pub
                  );

                  const { error: updateError } = await supabase
                    .from('events')
                    .update({ discord_event_id: updatedPublications })
                    .eq('id', event.id);

                  if (updateError) {
                    console.error(`[REMINDER-THREAD] Failed to store DISABLED status:`, updateError);
                  } else {
                    console.log(`[REMINDER-THREAD] Successfully stored threadId='DISABLED' for future reminders`);
                    // Update in-memory event object
                    event.discord_event_id = updatedPublications;
                  }
                }
              } catch (error) {
                console.error(`[REMINDER-THREAD] Error storing DISABLED status:`, error);
              }

              // Continue with channel posting
              targetChannelId = publication.channelId;
            }
          } else {
            console.log(`[REMINDER-THREAD] Threading disabled for this squadron, no thread will be created`);
            targetChannelId = publication.channelId;
          }
        }
        
        // Send the reminder message
        let reminderResult;
        if (targetChannelId !== publication.channelId) {
          // We're sending to a thread, use postMessageToThread directly
          reminderResult = await postMessageToThread(targetChannelId, publication.guildId, message);
          console.log(`[REMINDER] Sent reminder to thread ${targetChannelId} in guild ${publication.guildId}`);
        } else {
          // No thread, use normal channel messaging
          reminderResult = await sendReminderMessage(publication.guildId, targetChannelId, message);
          console.log(`[REMINDER] Sent reminder to channel ${targetChannelId} in guild ${publication.guildId}`);
          
          // If threading is disabled and we posted to channel, track the message ID for deletion
          if (reminderResult.success && reminderResult.messageId) {
            try {
              // CRITICAL: Read latest event data from database to avoid overwriting threadId
              // This prevents race conditions where threadId gets lost during reminderMessageIds updates
              const { data: latestEventData, error: fetchError } = await supabase
                .from('events')
                .select('discord_event_id')
                .eq('id', event.id)
                .single();

              if (fetchError || !latestEventData) {
                console.error(`[REMINDER-TRACKING] Failed to fetch latest event data:`, fetchError);
                throw new Error('Cannot update reminderMessageIds without latest event data');
              }

              // Store reminder message ID in the SPECIFIC publication for later deletion
              // Match by all three keys to handle multi-squadron events correctly
              const updatedPublications = latestEventData.discord_event_id.map(pub =>
                (pub.guildId === publication.guildId &&
                 pub.channelId === publication.channelId &&
                 pub.squadronId === publication.squadronId)
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

              console.log(`[REMINDER-TRACKING] Stored reminder message ID ${reminderResult.messageId} for event ${event.id}, squadron ${publication.squadronId?.substring(0, 8)}`);

              // Update in-memory event object to keep it in sync
              event.discord_event_id = updatedPublications;
            } catch (trackingError) {
              console.warn(`[REMINDER-TRACKING] Failed to store reminder message ID:`, trackingError.message);
            }
          }
        }
        
        const threadStatus = createdThreadId ? ' (in newly created thread)' : (publication.threadId ? ' (in existing thread)' : '');
        console.log(`[REMINDER] Sent reminder to guild ${publication.guildId}, channel ${targetChannelId}${threadStatus}`);
        
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

// Start server - listen on 0.0.0.0 for Fly.io
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ReadyRoom Combined Server running on 0.0.0.0:${PORT}`);
  console.log('Server ready to accept connections from Fly.io proxy');
  
  // Start the reminder processor
  startReminderProcessor();
});