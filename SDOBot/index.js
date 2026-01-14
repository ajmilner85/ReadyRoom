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
 * - Combined Express API and Discord bot in one service
 * - Used for both Fly.io production deployment and local development
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
  getExistingThreadFromMessage,
  deleteThread,
  switchDiscordBot
} = require('./discordBot');

// Import Discord client getter
const { getClient } = require('./lib/discordClient');

// Import Supabase client (path adjusted for SDOBot directory)
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

// API endpoint to switch Discord bot token (local development only)
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/discord/switch-bot', async (req, res) => {
    try {
      const { tokenType } = req.body;

      if (!tokenType || !['development', 'production'].includes(tokenType)) {
        return res.status(400).json({ error: 'Valid tokenType (development or production) is required' });
      }

      console.log(`[BOT-SWITCH] Switching to ${tokenType} Discord bot token...`);

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
        console.log(`[BOT-SWITCH] Successfully switched to ${tokenType} Discord bot: ${result.botInfo?.username}#${result.botInfo?.discriminator}`);
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
}

// Initialize Discord bot and client connection
(async function() {
  try {
    console.log('Initializing Discord bot and client connection...');
    await initializeDiscordBot();
    
    // In local development, check database for bot token preference and switch if needed
    if (process.env.NODE_ENV !== 'production') {
      try {
        // Get user profiles with bot token preferences
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
          .select('track_qualifications, event_type, event_settings, creator_call_sign, creator_board_number, creator_billet, participants, syllabus_mission_id, cycle_id, reference_materials')
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

          // Fetch training data if this is a training event
          if (eventData.syllabus_mission_id) {
            try {
              // Fetch syllabus mission data
              const { data: missionData, error: missionError } = await supabase
                .from('training_syllabus_missions')
                .select('mission_name, week_number, syllabus_id, reference_materials')
                .eq('id', eventData.syllabus_mission_id)
                .single();

              if (!missionError && missionData) {
                // Fetch syllabus name and reference materials
                const { data: syllabusData } = await supabase
                  .from('training_syllabi')
                  .select('name, reference_materials')
                  .eq('id', missionData.syllabus_id)
                  .single();

                // Fetch DLOs
                const { data: dlos } = await supabase
                  .from('syllabus_training_objectives')
                  .select('objective_text, scope_level, display_order')
                  .eq('syllabus_mission_id', eventData.syllabus_mission_id)
                  .order('display_order');

                // Fetch training enrollees for this cycle
                const { data: enrollees } = await supabase
                  .from('training_enrollments')
                  .select('pilot_id')
                  .eq('cycle_id', eventData.cycle_id)
                  .eq('status', 'active');

                // Fetch instructor enrollees for this cycle
                const { data: instructorEnrollees } = await supabase
                  .from('training_instructor_enrollments')
                  .select('pilot_id')
                  .eq('cycle_id', eventData.cycle_id)
                  .eq('status', 'active');

                // Merge reference materials: syllabus -> mission -> event
                const syllabusRefs = syllabusData?.reference_materials || [];
                const missionRefs = missionData.reference_materials || [];
                const eventRefs = eventData.reference_materials || [];

                // Combine and deduplicate by URL
                const allRefs = [...syllabusRefs, ...missionRefs, ...eventRefs];
                const uniqueRefs = allRefs.filter((ref, index, self) =>
                  index === self.findIndex((r) => r.url === ref.url)
                );

                eventOptions.trainingData = {
                  syllabusName: syllabusData?.name,
                  weekNumber: missionData.week_number,
                  missionName: missionData.mission_name,
                  dlos: dlos || [],
                  referenceMaterials: uniqueRefs,
                  enrollees: enrollees || [],
                  instructorEnrollees: instructorEnrollees || []
                };

                console.log(`[TRAINING-EVENT] Fetched training data for event ${eventId}:`, eventOptions.trainingData);
              }
            } catch (trainingError) {
              console.warn('[WARNING] Could not fetch training data:', trainingError.message);
            }
          }
          
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
        .select('track_qualifications, event_type, event_settings, syllabus_mission_id, cycle_id, reference_materials')
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

        // Fetch training data if this is a training event
        if (eventData.syllabus_mission_id && eventData.cycle_id) {
          try {
            // Fetch syllabus mission data
            const { data: missionData, error: missionError } = await supabase
              .from('training_syllabus_missions')
              .select('mission_name, week_number, syllabus_id, reference_materials')
              .eq('id', eventData.syllabus_mission_id)
              .single();

            if (!missionError && missionData) {
              // Fetch syllabus name and reference materials
              const { data: syllabusData } = await supabase
                .from('training_syllabi')
                .select('name, reference_materials')
                .eq('id', missionData.syllabus_id)
                .single();

              // Fetch DLOs
              const { data: dlos } = await supabase
                .from('syllabus_training_objectives')
                .select('objective_text, scope_level, display_order')
                .eq('syllabus_mission_id', eventData.syllabus_mission_id)
                .order('display_order');

              // Fetch training enrollees for this cycle
              const { data: enrollees } = await supabase
                .from('training_enrollments')
                .select('pilot_id')
                .eq('cycle_id', eventData.cycle_id)
                .eq('status', 'active');

              // Fetch instructor enrollees for this cycle
              const { data: instructorEnrollees } = await supabase
                .from('training_instructor_enrollments')
                .select('pilot_id')
                .eq('cycle_id', eventData.cycle_id)
                .eq('status', 'active');

              // Merge reference materials: syllabus -> mission -> event
              const syllabusRefs = syllabusData?.reference_materials || [];
              const missionRefs = missionData.reference_materials || [];
              const eventRefs = eventData.reference_materials || [];

              // Combine and deduplicate by URL
              const allRefs = [...syllabusRefs, ...missionRefs, ...eventRefs];
              const uniqueRefs = allRefs.filter((ref, index, self) =>
                index === self.findIndex((r) => r.url === ref.url)
              );

              eventOptions.trainingData = {
                syllabusName: syllabusData?.name,
                weekNumber: missionData.week_number,
                missionName: missionData.mission_name,
                dlos: dlos || [],
                referenceMaterials: uniqueRefs,
                enrollees: enrollees || [],
                instructorEnrollees: instructorEnrollees || []
              };

              console.log(`[TRAINING-EVENT-EDIT] Fetched training data for edit:`, eventOptions.trainingData);
            }
          } catch (trainingError) {
            console.warn('[WARNING] Could not fetch training data for edit:', trainingError.message);
          }
        }
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

          // Fetch event settings to get reminder recipient preferences
          const { data: eventData } = await supabase
            .from('events')
            .select('event_settings')
            .eq('id', eventId)
            .single();

          const eventSettings = eventData?.event_settings || {};

          // Extract recipient settings with defaults
          const firstRecipients = {
            accepted: eventSettings.firstReminderRecipients?.accepted ?? false,
            tentative: eventSettings.firstReminderRecipients?.tentative ?? true,
            declined: eventSettings.firstReminderRecipients?.declined ?? false,
            noResponse: eventSettings.firstReminderRecipients?.noResponse ?? true
          };

          const secondRecipients = {
            accepted: eventSettings.secondReminderRecipients?.accepted ?? true,
            tentative: eventSettings.secondReminderRecipients?.tentative ?? true,
            declined: eventSettings.secondReminderRecipients?.declined ?? false,
            noResponse: eventSettings.secondReminderRecipients?.noResponse ?? false
          };

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
                    sent: false,
                    notify_accepted: firstRecipients.accepted,
                    notify_tentative: firstRecipients.tentative,
                    notify_declined: firstRecipients.declined,
                    notify_no_response: firstRecipients.noResponse
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
                    sent: false,
                    notify_accepted: secondRecipients.accepted,
                    notify_tentative: secondRecipients.tentative,
                    notify_declined: secondRecipients.declined,
                    notify_no_response: secondRecipients.noResponse
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
                    sent: false,
                    notify_accepted: firstRecipients.accepted,
                    notify_tentative: firstRecipients.tentative,
                    notify_declined: firstRecipients.declined,
                    notify_no_response: firstRecipients.noResponse
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
// Cache for guild members with 5 minute expiration
const guildMembersCache = new Map();
const GUILD_MEMBERS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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

    // Check cache first
    const cached = guildMembersCache.get(guildId);
    if (cached && (Date.now() - cached.timestamp) < GUILD_MEMBERS_CACHE_DURATION) {
      console.log(`[DISCORD-API] Returning cached members for guild ${guildId} (${cached.members.length} members)`);
      return res.json({ members: cached.members });
    }

    // console.log(`[DEBUG] Fetching members for guild ID: ${guildId}`);

    // Use the existing Discord client instead of creating a new one
    const client = getClient();

    if (!client || !client.isReady()) {
      return res.status(503).json({
        error: 'Discord bot is not ready. Please ensure the bot is running and try again.'
      });
    }

    // console.log('[DEBUG] Discord client ready, fetching guild members');

    // Get the specific guild (server) by ID
    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
      return res.status(404).json({
        error: `Discord guild with ID ${guildId} not found or bot doesn't have access`
      });
    }
      // console.log(`[DEBUG] Found guild: ${guild.name} (${guild.id})`);

    // Fetch all members with timeout and proper options
    const fetchTimeout = 45000; // 45 seconds - Discord.js default is 30s
    const fetchPromise = guild.members.fetch({
      force: false, // Don't force refresh from API if already cached
      time: 40000   // Discord.js internal timeout - set to 40s (must be less than our timeout)
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Discord member fetch timed out after 45 seconds')), fetchTimeout)
    );

    try {
      await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error) {
      // If fetch fails but we have cached members, return those instead of erroring
      if (guild.members.cache.size > 0) {
        console.log(`[DISCORD-API] Fetch failed but returning ${guild.members.cache.size} cached members for guild ${guildId}`);
      } else {
        throw error; // Re-throw if we have no cached members at all
      }
    }

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

    // Cache the result
    guildMembersCache.set(guildId, {
      members,
      timestamp: Date.now()
    });

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
    
    // Get the authenticated Discord client
    const discordClient = getClient();
    
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
    
    // Convert userIds to attendanceData with squadron info for filtering
    let attendanceData = [];
    if (userIds && userIds.length > 0) {
      // Fetch squadron assignments for the users being reminded
      const { data: pilotData, error: pilotError } = await supabase
        .from('pilot_assignments')
        .select('pilot_id, squadron_id, created_at, pilots!inner(discord_id)')
        .in('pilots.discord_id', userIds)
        .is('end_date', null)
        .order('created_at', { ascending: false });

      if (pilotError) {
        console.error('[REMINDER-API] Error fetching pilot assignments:', pilotError);
      }

      // Create map of discord_id to squadron_id (taking most recent assignment)
      const squadronMap = new Map();
      (pilotData || []).forEach(assignment => {
        const discord_id = assignment.pilots?.discord_id;
        if (discord_id && assignment.squadron_id && !squadronMap.has(discord_id)) {
          squadronMap.set(discord_id, assignment.squadron_id);
        }
      });

      console.log(`[REMINDER-API] Found ${squadronMap.size} pilots with squadron assignments out of ${userIds.length} requested`);

      // Map to attendanceData format
      attendanceData = userIds.map(discord_id => ({
        discord_id,
        discord_username: '', // Not needed for reminders, just the mention
        user_response: 'manual', // Mark as manual reminder
        squadron_id: squadronMap.get(discord_id)
      })).filter(user => user.squadron_id != null);  // Only include users with valid squadron assignments

      console.log(`[REMINDER-API] Prepared ${attendanceData.length} users with squadron info for filtering`);
    }

    // Use the new threading-aware reminder function with squadron filtering
    console.log('[REMINDER-API] Using new threading-aware reminder system');
    await sendReminderToDiscordChannels(eventData, message, attendanceData);

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
        // Get the Discord client
        const discordClient = getClient();
        
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
    console.log(`[FLIGHT-POSTS] Checking for existing posts - Event: ${eventId}`);

    if (!eventId) {
      console.error('[FLIGHT-POSTS] No event ID provided');
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

    console.log(`[FLIGHT-POSTS] Event data retrieved:`, {
      hasData: !!eventData,
      hasFlightPosts: !!eventData?.discord_flight_assignments_posts,
      isArray: Array.isArray(eventData?.discord_flight_assignments_posts)
    });

    // Parse flight posts and filter for latest posts only
    const flightPosts = eventData?.discord_flight_assignments_posts || [];
    console.log(`[FLIGHT-POSTS] Event ${eventId}: Found ${flightPosts.length} total posts`);

    const latestPosts = flightPosts.filter(post => post && post.isLatest === true);
    console.log(`[FLIGHT-POSTS] Event ${eventId}: ${latestPosts.length} latest posts:`, latestPosts.map(p => ({ squadronId: p.squadronId, revision: p.revision, messageId: p.messageId })));

    const response = {
      success: true,
      existingPosts: latestPosts,
      hasExistingPosts: latestPosts.length > 0
    };
    console.log(`[FLIGHT-POSTS] Returning response:`, response);

    res.json(response);

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
    // Get ALL attendance records for the event (will deduplicate after)
    // This ensures we respect the pilot's MOST RECENT response, not any historical response
    const { data: allAttendance, error: attendanceError } = await supabase
      .from('discord_event_attendance')
      .select('discord_id, discord_username, user_response, updated_at')
      .in('discord_event_id', discordEventIds)
      .order('updated_at', { ascending: false });

    if (attendanceError) {
      throw new Error(`Could not fetch attendance data: ${attendanceError.message}`);
    }

    // Deduplicate: keep only the most recent response per pilot
    // This prevents duplicate mentions and respects response changes (e.g., accepted → declined)
    const latestResponseByPilot = new Map();
    (allAttendance || []).forEach(record => {
      if (!latestResponseByPilot.has(record.discord_id)) {
        latestResponseByPilot.set(record.discord_id, record);
      }
    });

    // Filter to only the desired response types AFTER deduplication
    const respondedUsers = Array.from(latestResponseByPilot.values())
      .filter(record => responseTypes.includes(record.user_response));

    console.log(`[REMINDER-${reminder.id}] Found ${allAttendance?.length || 0} total attendance records, ${latestResponseByPilot.size} unique pilots, ${respondedUsers.length} matching response types`);

    // Get squadron assignments for these users
    // Using a two-step query approach for reliability - Supabase nested queries with !inner
    // and filters can have inconsistent behavior
    if (respondedUsers && respondedUsers.length > 0) {
      const discordIds = respondedUsers.map(u => u.discord_id);

      // Step 1: Get pilot IDs for these discord IDs
      const { data: pilotIdData, error: pilotIdError } = await supabase
        .from('pilots')
        .select('id, discord_id')
        .in('discord_id', discordIds);

      if (pilotIdError) {
        console.error(`[REMINDER] Error querying pilots:`, pilotIdError);
      }

      const squadronMap = new Map();

      if (pilotIdData && pilotIdData.length > 0) {
        // Create discord_id to pilot_id mapping
        const discordToPilotId = new Map();
        pilotIdData.forEach(p => discordToPilotId.set(p.discord_id, p.id));

        const pilotIds = pilotIdData.map(p => p.id);

        // Step 2: Get active assignments for these pilots
        const { data: assignmentData, error: assignmentError } = await supabase
          .from('pilot_assignments')
          .select('pilot_id, squadron_id, created_at')
          .in('pilot_id', pilotIds)
          .is('end_date', null)  // Only active assignments
          .order('created_at', { ascending: false });

        if (assignmentError) {
          console.error(`[REMINDER] Error querying pilot_assignments:`, assignmentError);
        }

        // Build squadron map from assignments
        // Group by pilot_id, taking the most recent (first due to order)
        const pilotToSquadron = new Map();
        (assignmentData || []).forEach(assignment => {
          if (!pilotToSquadron.has(assignment.pilot_id) && assignment.squadron_id) {
            pilotToSquadron.set(assignment.pilot_id, assignment.squadron_id);
          }
        });

        // Map discord_id to squadron_id through pilot_id
        discordIds.forEach(discordId => {
          const pilotId = discordToPilotId.get(discordId);
          if (pilotId) {
            const squadronId = pilotToSquadron.get(pilotId);
            if (squadronId) {
              squadronMap.set(discordId, squadronId);
            }
          }
        });
      }

      // Log only if there are missing mappings (potential issues)
      const foundDiscordIds = new Set(squadronMap.keys());
      const missingDiscordIds = discordIds.filter(id => !foundDiscordIds.has(id));
      if (missingDiscordIds.length > 0) {
        console.warn(`[REMINDER] ${missingDiscordIds.length} pilots missing squadron mappings`);
      }

      // Map attendance data to include squadron_id
      attendanceData = respondedUsers.map(user => ({
        discord_id: user.discord_id,
        discord_username: user.discord_username,
        user_response: user.user_response,
        squadron_id: squadronMap.get(user.discord_id)
      }));
    }
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
      // Two-step approach for reliability - Supabase nested queries with multiple !inner
      // joins and filters can have inconsistent behavior

      // Step 1: Get active pilot assignments in participating squadrons
      const { data: activeAssignments, error: assignmentError } = await supabase
        .from('pilot_assignments')
        .select('pilot_id, squadron_id')
        .in('squadron_id', participatingSquadronIds)
        .is('end_date', null);

      if (assignmentError) {
        console.error(`[REMINDER] Error querying no-response pilot_assignments:`, assignmentError);
      }

      if (activeAssignments && activeAssignments.length > 0) {
        // Build pilot_id to squadron_id map
        const pilotSquadronMap = new Map();
        activeAssignments.forEach(a => {
          if (!pilotSquadronMap.has(a.pilot_id)) {
            pilotSquadronMap.set(a.pilot_id, a.squadron_id);
          }
        });

        const pilotIds = Array.from(pilotSquadronMap.keys());

        // Step 2: Get pilots with active status
        const { data: activePilots, error: pilotError } = await supabase
          .from('pilots')
          .select(`
            id,
            discord_id,
            discord_username,
            pilot_statuses!inner(
              status_id,
              end_date,
              statuses!inner(isActive)
            )
          `)
          .in('id', pilotIds)
          .eq('pilot_statuses.statuses.isActive', true)
          .is('pilot_statuses.end_date', null)
          .not('discord_id', 'is', null);

        if (pilotError) {
          console.error(`[REMINDER] Error querying no-response pilots:`, pilotError);
        }

        // Filter for users who haven't responded and include squadron info
        const noResponseUsers = (activePilots || [])
          .filter(pilot => !responderIds.has(pilot.discord_id))
          .map(pilot => ({
            discord_id: pilot.discord_id,
            discord_username: pilot.discord_username,
            user_response: 'no_response',
            squadron_id: pilotSquadronMap.get(pilot.id)
          }));

        attendanceData = [...attendanceData, ...noResponseUsers];
      }
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

  // Send the reminder message to Discord channels with squadron-specific filtering
  await sendReminderToDiscordChannels(eventData, message, attendanceData);

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

async function sendReminderToDiscordChannels(event, message, attendanceData = []) {
  if (Array.isArray(event.discord_event_id)) {
    // Track which pilots have been mentioned to handle orphaned pilots later
    const mentionedPilots = new Set();
    let firstPublication = null;  // Store first publication for fallback

    // DEDUPLICATION FIX: Build unique channels map BEFORE the loop
    // This ensures only ONE reminder is sent per unique guild:channel combination,
    // even when multiple squadrons share the same Discord channel
    const uniqueChannels = new Map();

    for (const publication of event.discord_event_id) {
      const channelKey = `${publication.guildId}:${publication.channelId}`;

      if (!uniqueChannels.has(channelKey)) {
        uniqueChannels.set(channelKey, {
          publication: publication,  // Use first publication for this channel as reference
          squadronIds: [publication.squadronId],
          allPublications: [publication]  // Track all publications for database updates
        });
      } else {
        // Add squadron to existing channel entry
        const channelInfo = uniqueChannels.get(channelKey);
        channelInfo.squadronIds.push(publication.squadronId);
        channelInfo.allPublications.push(publication);
      }
    }

    // Log summary only if deduplication actually occurred
    if (event.discord_event_id.length !== uniqueChannels.size) {
      console.log(`[REMINDER] Deduplicated ${event.discord_event_id.length} publications to ${uniqueChannels.size} unique channels`);
    }

    // Iterate over UNIQUE channels, not individual publications
    for (const [channelKey, channelInfo] of uniqueChannels) {
      const { publication, squadronIds, allPublications } = channelInfo;

      try {
        // Store first publication for orphaned pilot fallback
        if (!firstPublication) {
          firstPublication = publication;
        }

        // Aggregate attendanceData from ALL squadrons sharing this channel
        const channelAttendance = attendanceData.filter(user =>
          squadronIds.includes(user.squadron_id)
        );

        // If no recipients for this channel, skip
        if (channelAttendance.length === 0) {
          continue;
        }

        // Track mentioned pilots for orphan detection
        channelAttendance.forEach(user => mentionedPilots.add(user.discord_id));

        // Deduplicate users by discord_id to avoid duplicate mentions
        const uniqueUsers = new Map();
        channelAttendance.forEach(user => {
          if (!uniqueUsers.has(user.discord_id)) {
            uniqueUsers.set(user.discord_id, user);
          }
        });

        // Create Discord mentions for ALL pilots in this channel (across all squadrons)
        const discordMentions = Array.from(uniqueUsers.values())
          .map(user => `<@${user.discord_id}>`)
          .join(' ');
        const fullMessage = discordMentions ? `${discordMentions}\n${message}` : message;

        // Thread creation logic: Create thread on first reminder if threading is enabled
        let createdThreadId = null;
        let targetChannelId = publication.channelId; // Default to main channel

        // CRITICAL FIX: Check if ANY publication in this event has a thread (not just current one)
        // This ensures all reminders use the same thread, even if event has duplicate posts in same channel
        const existingThread = event.discord_event_id.find(
          pub => pub.threadId && pub.threadId !== 'DISABLED'
        );

        let needsDatabaseUpdate = false;

        if (existingThread) {
          // Reuse existing thread from any publication
          targetChannelId = existingThread.threadId;

          // Update THIS publication to also reference the thread (if not already set)
          if (!publication.threadId || publication.threadId === 'DISABLED') {
            publication.threadId = existingThread.threadId;
            needsDatabaseUpdate = true;
          }
        } else if (publication.threadId) {
          // This publication has a threadId but existingThread didn't find it (shouldn't happen, defensive)
          if (publication.threadId === 'DISABLED') {
            // Try to recover from DISABLED state by checking FIRST message (not current)
            const firstPublication = event.discord_event_id[0];
            const existingThreadResult = await getExistingThreadFromMessage(
              firstPublication.messageId,
              firstPublication.guildId,
              firstPublication.channelId
            );

            if (existingThreadResult.success) {
              targetChannelId = existingThreadResult.threadId;
              event.discord_event_id.forEach(pub => {
                pub.threadId = existingThreadResult.threadId;
              });
              needsDatabaseUpdate = true;
            } else {
              targetChannelId = publication.channelId;
            }
          } else {
            // Thread already exists, use it
            targetChannelId = publication.threadId;
          }
        } else {
          // No thread exists yet - create one from the FIRST messageId
          const participatingSquadrons = publication.squadronId ? [publication.squadronId] : [];
          const threadDecision = await shouldUseThreadsForEvent(participatingSquadrons, publication.guildId, publication.channelId);

          if (threadDecision.shouldUseThreads) {
            const firstPublication = event.discord_event_id[0];
            const threadResult = await createThreadFromMessage(
              firstPublication.messageId,
              event.name,
              firstPublication.guildId,
              firstPublication.channelId,
              threadDecision.autoArchiveDuration
            );

            if (threadResult.success) {
              console.log(`[REMINDER] Thread created: ${threadResult.threadId}`);
              createdThreadId = threadResult.threadId;
              targetChannelId = threadResult.threadId;
              event.discord_event_id.forEach(pub => {
                pub.threadId = threadResult.threadId;
              });
              needsDatabaseUpdate = true;
            } else if (threadResult.error === 'The message already has a thread' || threadResult.alreadyExists) {
              // Thread already exists for first message, try to fetch it
              const firstPublication = event.discord_event_id[0];
              const existingThreadResult = await getExistingThreadFromMessage(
                firstPublication.messageId,
                firstPublication.guildId,
                firstPublication.channelId
              );

              if (existingThreadResult.success) {
                createdThreadId = existingThreadResult.threadId;
                targetChannelId = existingThreadResult.threadId;
                event.discord_event_id.forEach(pub => {
                  pub.threadId = existingThreadResult.threadId;
                });
                needsDatabaseUpdate = true;
              } else {
                console.error(`[REMINDER] Failed to fetch existing thread: ${existingThreadResult.error}`);
                event.discord_event_id.forEach(pub => {
                  pub.threadId = 'DISABLED';
                });
                needsDatabaseUpdate = true;
                targetChannelId = publication.channelId;
              }
            } else {
              console.warn(`[REMINDER] Thread creation failed: ${threadResult.error}`);
              event.discord_event_id.forEach(pub => {
                pub.threadId = 'DISABLED';
              });
              needsDatabaseUpdate = true;
              targetChannelId = publication.channelId;
            }
          } else {
            targetChannelId = publication.channelId;
          }
        }

        // Update database if we modified any threadId values
        if (needsDatabaseUpdate) {
          try {
            await supabase
              .from('events')
              .update({ discord_event_id: event.discord_event_id })
              .eq('id', event.id);
          } catch (updateError) {
            console.warn(`[REMINDER] Failed to update thread in database:`, updateError.message);
          }
        }

        // Send the reminder message with squadron-specific mentions
        let reminderResult;
        if (targetChannelId !== publication.channelId) {
          // We're sending to a thread
          reminderResult = await postMessageToThread(targetChannelId, publication.guildId, fullMessage);
        } else {
          // No thread, use normal channel messaging
          reminderResult = await sendReminderMessage(publication.guildId, targetChannelId, fullMessage);
          
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
                throw new Error('Cannot update reminderMessageIds without latest event data');
              }

              // Store reminder message ID in ALL publications that share this channel
              const updatedPublications = latestEventData.discord_event_id.map(pub =>
                (pub.guildId === publication.guildId && pub.channelId === publication.channelId)
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

              event.discord_event_id = updatedPublications;
            } catch (trackingError) {
              console.warn(`[REMINDER] Failed to store reminder message ID:`, trackingError.message);
            }
          }
        }
        
        // Single summary log for successful reminder
        const threadStatus = createdThreadId ? ' (new thread)' : (publication.threadId ? ' (thread)' : '');
        console.log(`[REMINDER] Sent to ${squadronIds.length} squadron(s)${threadStatus}`);

      } catch (error) {
        console.error(`[REMINDER] Failed to send reminder to channel ${channelKey}:`, error);
      }
    }

    // Handle orphaned pilots - users who should be notified but weren't included in any squadron publication
    const orphanedPilots = attendanceData.filter(user => !mentionedPilots.has(user.discord_id));
    if (orphanedPilots.length > 0 && firstPublication) {
      console.log(`[REMINDER] ${orphanedPilots.length} orphaned pilots, sending to fallback channel`);

      try {
        const orphanMentions = orphanedPilots
          .map(user => `<@${user.discord_id}>`)
          .join(' ');

        const orphanMessage = `${orphanMentions}\n${message}`;

        let targetChannelId = firstPublication.threadId && firstPublication.threadId !== 'DISABLED'
          ? firstPublication.threadId
          : firstPublication.channelId;

        if (firstPublication.threadId && firstPublication.threadId !== 'DISABLED') {
          await postMessageToThread(targetChannelId, firstPublication.guildId, orphanMessage);
        } else {
          await sendReminderMessage(firstPublication.guildId, targetChannelId, orphanMessage);
        }
      } catch (orphanError) {
        console.error(`[REMINDER] Failed to send orphaned pilot reminder:`, orphanError);
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

// Process scheduled event publications
async function processScheduledPublications() {
  try {
    console.log('[SCHEDULED-PUBLICATIONS] Checking for pending publications...');

    const now = new Date().toISOString();
    const { data: pendingPublications, error: fetchError} = await supabase
      .from('scheduled_event_publications')
      .select(`
        id,
        event_id,
        scheduled_time,
        events (
          id,
          name,
          description,
          start_datetime,
          end_datetime,
          participants,
          event_settings,
          image_url,
          discord_event_id
        )
      `)
      .eq('sent', false)
      .lte('scheduled_time', now)
      .order('scheduled_time', { ascending: true });

    if (fetchError) {
      console.error('[SCHEDULED-PUBLICATIONS] Error fetching pending publications:', fetchError);
      return { processed: 0, errors: [{ publicationId: 'fetch', error: fetchError }] };
    }

    if (!pendingPublications || pendingPublications.length === 0) {
      console.log('[SCHEDULED-PUBLICATIONS] No pending publications found');
      return { processed: 0, errors: [] };
    }

    console.log(`[SCHEDULED-PUBLICATIONS] Found ${pendingPublications.length} pending publications`);

    let processed = 0;
    let skipped = 0;
    const errors = [];

    // Generate instance ID for debugging
    const instanceId = process.env.INSTANCE_ID || `pid-${process.pid}-${Math.random().toString(36).substring(7)}`;

    // Process each publication with distributed locking
    for (const publication of pendingPublications) {
      const lockKey = uuidToLockKey(publication.id);
      let lockAcquired = false;

      try {
        // Try to acquire advisory lock for this publication
        const { data: lockResult, error: lockError } = await supabase
          .rpc('try_acquire_reminder_lock', { lock_key: lockKey });

        if (lockError) {
          console.error(`[SCHEDULED-PUBLICATIONS] Instance ${instanceId}: Error acquiring lock for publication ${publication.id}:`, lockError);
          errors.push({ publicationId: publication.id, error: lockError });
          continue;
        }

        if (!lockResult) {
          // Lock is held by another bot instance
          console.log(`[SCHEDULED-PUBLICATIONS] Instance ${instanceId}: Publication ${publication.id} is being processed by another instance, skipping`);
          skipped++;
          continue;
        }

        lockAcquired = true;
        console.log(`[SCHEDULED-PUBLICATIONS] Instance ${instanceId}: ACQUIRED LOCK for publication ${publication.id}`);

        // Validate event data exists
        if (!publication.events) {
          console.error(`[SCHEDULED-PUBLICATIONS] Event data not found for publication ${publication.id}`);
          errors.push({ publicationId: publication.id, error: 'Event data not found' });
          continue;
        }

        const event = publication.events;
        console.log(`[SCHEDULED-PUBLICATIONS] Publishing event "${event.name}" (ID: ${event.id})`);

        // Check if event is already published (has discord_event_id)
        if (event.discord_event_id && (Array.isArray(event.discord_event_id) ? event.discord_event_id.length > 0 : event.discord_event_id)) {
          console.log(`[SCHEDULED-PUBLICATIONS] Event ${event.id} is already published, marking scheduled publication as sent and skipping`);

          // Mark this scheduled publication as sent to prevent re-publishing
          await supabase
            .from('scheduled_event_publications')
            .update({ sent: true, updated_at: new Date().toISOString() })
            .eq('id', publication.id);

          processed++;
          continue;
        }

        // Get participating squadrons
        const participatingSquadrons = event.participants || [];
        if (participatingSquadrons.length === 0) {
          console.warn(`[SCHEDULED-PUBLICATIONS] Event ${event.id} has no participating squadrons, skipping`);
          errors.push({ publicationId: publication.id, error: 'No participating squadrons' });
          continue;
        }

        // Get event settings for initial notification roles
        let initialNotificationRoles = [];
        if (event.event_settings) {
          try {
            const settings = typeof event.event_settings === 'string'
              ? JSON.parse(event.event_settings)
              : event.event_settings;
            initialNotificationRoles = settings.initialNotificationRoles || [];
          } catch (error) {
            console.warn('[SCHEDULED-PUBLICATIONS] Failed to parse event settings:', error);
          }
        }

        // Build unique channels map to deduplicate publications to the same channel
        const uniqueChannels = new Map();

        for (const squadronId of participatingSquadrons) {
          // Get Discord integration for this squadron from org_squadrons
          const { data: squadronData, error: squadronError } = await supabase
            .from('org_squadrons')
            .select('discord_integration')
            .eq('id', squadronId)
            .single();

          if (squadronError || !squadronData?.discord_integration) {
            console.warn(`[SCHEDULED-PUBLICATIONS] No Discord integration found for squadron ${squadronId}`);
            continue;
          }

          const integration = squadronData.discord_integration;
          const guildId = integration.selectedGuildId;

          // Find the events channel from discordChannels array
          const eventsChannel = integration.discordChannels?.find(ch => ch.type === 'events');
          const channelId = eventsChannel?.id;

          if (!guildId || !channelId) {
            console.warn(`[SCHEDULED-PUBLICATIONS] Incomplete Discord integration for squadron ${squadronId} (guildId: ${guildId}, channelId: ${channelId})`);
            continue;
          }

          // Create unique key for guild+channel combination
          const channelKey = `${guildId}:${channelId}`;

          if (uniqueChannels.has(channelKey)) {
            // Add this squadron to existing channel entry
            const existing = uniqueChannels.get(channelKey);
            existing.squadronIds.push(squadronId);
          } else {
            // Create new channel entry
            uniqueChannels.set(channelKey, {
              guildId,
              channelId,
              squadronIds: [squadronId]
            });
          }
        }

        console.log(`[SCHEDULED-PUBLICATIONS] Found ${uniqueChannels.size} unique channels for ${participatingSquadrons.length} squadrons`);

        // Publish to each unique channel once
        let publishedCount = 0;
        const publishedChannels = []; // Collect all successful publications

        for (const [channelKey, channelInfo] of uniqueChannels) {
          // Publish event to Discord
          const eventOptions = {
            trackQualifications: event.event_settings?.trackQualifications || false,
            eventType: event.event_settings?.eventType || 'Episode',
            participatingSquadrons: event.participants || [],
            initialNotificationRoles: initialNotificationRoles || [],
            groupBySquadron: event.event_settings?.groupBySquadron || false,
            showNoResponse: event.event_settings?.showNoResponse || false
          };

          // Format the event time object with start and end dates
          const eventTime = {
            start: new Date(event.start_datetime),
            end: event.end_datetime ? new Date(event.end_datetime) : new Date(new Date(event.start_datetime).getTime() + (60 * 60 * 1000))
          };

          // Extract image URL - handle both string and object formats
          let imageUrl = null;
          if (event.image_url) {
            if (typeof event.image_url === 'string') {
              imageUrl = event.image_url;
            } else if (typeof event.image_url === 'object') {
              // If it's an object, try to extract the URL from common properties
              imageUrl = event.image_url.url || event.image_url.headerImage || event.image_url.imageUrl || null;
              console.log(`[SCHEDULED-PUBLICATIONS] image_url is object, extracted: ${imageUrl || 'FAILED TO EXTRACT'}`);
              console.log(`[SCHEDULED-PUBLICATIONS] image_url object keys:`, Object.keys(event.image_url));
            }
          }

          console.log(`[SCHEDULED-PUBLICATIONS] Using imageUrl: ${imageUrl || 'NOT SET'}`);

          // Fresh check: does event already have a post in this channel?
          // This prevents duplicate posts if a manual publish happened concurrently
          const { data: freshEvent } = await supabase
            .from('events')
            .select('discord_event_id')
            .eq('id', event.id)
            .single();

          if (freshEvent?.discord_event_id) {
            const existingPost = freshEvent.discord_event_id.find(
              pub => pub.channelId === channelInfo.channelId
            );
            if (existingPost) {
              console.log(`[SCHEDULED-PUBLICATIONS] Event already has post in channel ${channelInfo.channelId}, reusing messageId ${existingPost.messageId}`);
              // Reuse existing messageId instead of publishing again
              for (const squadronId of channelInfo.squadronIds) {
                publishedChannels.push({
                  messageId: existingPost.messageId,
                  guildId: existingPost.guildId || channelInfo.guildId,
                  channelId: existingPost.channelId,
                  squadronId: squadronId
                });
              }
              publishedCount++;
              continue; // Skip to next channel
            }
          }

          const publishResult = await publishEventToDiscord(
            event.name,
            event.description,
            eventTime,
            channelInfo.guildId,
            channelInfo.channelId,
            imageUrl,
            null, // creator parameter (can be enhanced later)
            null, // images parameter
            eventOptions,
            null // Do NOT pass eventId - let server handle database update
          );

          if (publishResult.success) {
            console.log(`[SCHEDULED-PUBLICATIONS] Successfully published event to channel ${channelInfo.channelId}, messageId: ${publishResult.messageId}`);
            publishedCount++;
            
            // Add a result for each squadron that shares this channel
            for (const squadronId of channelInfo.squadronIds) {
              publishedChannels.push({
                messageId: publishResult.messageId,
                guildId: publishResult.guildId,
                channelId: publishResult.channelId,
                squadronId: squadronId
              });
            }
          } else {
            console.error(`[SCHEDULED-PUBLICATIONS] Failed to publish to channel ${channelInfo.channelId}:`, publishResult.error);
            // Add errors for all squadrons that share this failed channel
            for (const squadronId of channelInfo.squadronIds) {
              errors.push({
                publicationId: publication.id,
                squadronId,
                error: publishResult.error
              });
            }
          }
        }

        if (publishedCount > 0) {
          // Update event with Discord message IDs using the same structure as updateEventMultipleDiscordIds
          console.log(`[SCHEDULED-PUBLICATIONS] Updating event ${event.id} with ${publishedChannels.length} Discord publications:`, publishedChannels);

          const { error: updateError } = await supabase
            .from('events')
            .update({ discord_event_id: publishedChannels })
            .eq('id', event.id);

          if (updateError) {
            console.error(`[SCHEDULED-PUBLICATIONS] Failed to update event with Discord IDs:`, updateError);
          } else {
            console.log(`[SCHEDULED-PUBLICATIONS] Successfully updated event ${event.id} with Discord message IDs`);
          }

          // Schedule reminders if event has reminder settings configured
          if (event.event_settings) {
            try {
              const eventSettings = typeof event.event_settings === 'string'
                ? JSON.parse(event.event_settings)
                : event.event_settings;

              const eventStartTime = new Date(event.start_datetime);
              const now = new Date();

              // Helper function to convert reminder settings to milliseconds
              const convertToMs = (value, unit) => {
                switch (unit) {
                  case 'minutes': return value * 60 * 1000;
                  case 'hours': return value * 60 * 60 * 1000;
                  case 'days': return value * 24 * 60 * 60 * 1000;
                  default: return value * 60 * 1000;
                }
              };

              // Schedule first reminder if enabled
              if (eventSettings.firstReminderEnabled) {
                const reminderMs = convertToMs(
                  eventSettings.firstReminderTime?.value || 15,
                  eventSettings.firstReminderTime?.unit || 'minutes'
                );
                const reminderTime = new Date(eventStartTime.getTime() - reminderMs);

                if (reminderTime > now) {
                  const recipients = eventSettings.firstReminderRecipients || {};
                  await supabase.from('event_reminders').insert({
                    event_id: event.id,
                    reminder_type: 'first',
                    scheduled_time: reminderTime.toISOString(),
                    sent: false,
                    notify_accepted: recipients.accepted ?? false,
                    notify_tentative: recipients.tentative ?? true,
                    notify_declined: recipients.declined ?? false,
                    notify_no_response: recipients.noResponse ?? true
                  });
                  console.log(`[SCHEDULED-PUBLICATIONS] Scheduled first reminder for ${event.id}`);
                }
              }

              // Schedule second reminder if enabled
              if (eventSettings.secondReminderEnabled) {
                const reminderMs = convertToMs(
                  eventSettings.secondReminderTime?.value || 3,
                  eventSettings.secondReminderTime?.unit || 'days'
                );
                const reminderTime = new Date(eventStartTime.getTime() - reminderMs);

                if (reminderTime > now) {
                  const recipients = eventSettings.secondReminderRecipients || {};
                  await supabase.from('event_reminders').insert({
                    event_id: event.id,
                    reminder_type: 'second',
                    scheduled_time: reminderTime.toISOString(),
                    sent: false,
                    notify_accepted: recipients.accepted ?? true,
                    notify_tentative: recipients.tentative ?? true,
                    notify_declined: recipients.declined ?? false,
                    notify_no_response: recipients.noResponse ?? false
                  });
                  console.log(`[SCHEDULED-PUBLICATIONS] Scheduled second reminder for ${event.id}`);
                }
              }
            } catch (reminderError) {
              console.error(`[SCHEDULED-PUBLICATIONS] Failed to schedule reminders:`, reminderError);
            }
          }

          // Mark publication as sent
          await supabase
            .from('scheduled_event_publications')
            .update({ sent: true, updated_at: new Date().toISOString() })
            .eq('id', publication.id);

          processed++;
          console.log(`[SCHEDULED-PUBLICATIONS] Successfully published event ${event.id} to ${publishedCount} squadron(s)`);
        } else {
          console.error(`[SCHEDULED-PUBLICATIONS] Failed to publish event ${event.id} to any squadrons`);
          errors.push({ publicationId: publication.id, error: 'Failed to publish to any squadrons' });
        }

      } catch (error) {
        console.error(`[SCHEDULED-PUBLICATIONS] Error processing publication ${publication.id}:`, error);
        errors.push({ publicationId: publication.id, error });
      } finally {
        // Always release the lock if we acquired it
        if (lockAcquired) {
          try {
            const { error: unlockError } = await supabase
              .rpc('release_reminder_lock', { lock_key: lockKey });

            if (unlockError) {
              console.warn(`[SCHEDULED-PUBLICATIONS] Error releasing lock for publication ${publication.id}:`, unlockError);
            } else {
              console.log(`[SCHEDULED-PUBLICATIONS] Released lock for publication ${publication.id}`);
            }
          } catch (unlockError) {
            console.warn(`[SCHEDULED-PUBLICATIONS] Failed to release lock for publication ${publication.id}:`, unlockError);
          }
        }
      }
    }

    console.log(`[SCHEDULED-PUBLICATIONS] Completed: ${processed} processed, ${skipped} skipped (locked by other instances), ${errors.length} errors`);
    return { processed, skipped, errors };
  } catch (error) {
    console.error('[SCHEDULED-PUBLICATIONS] Error in processScheduledPublications:', error);
    return { processed: 0, skipped: 0, errors: [{ publicationId: 'general', error }] };
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

// Process mission status updates based on event timing
async function processMissionStatusUpdates() {
  try {
    console.log('[MISSION-STATUS] Checking for missions requiring status updates...');

    const now = new Date().toISOString();

    // Find missions that need status updates by joining with events
    const { data: missions, error: fetchError } = await supabase
      .from('missions')
      .select(`
        id,
        name,
        status,
        events!missions_event_id_fkey (
          id,
          start_datetime,
          end_datetime
        )
      `)
      .in('status', ['planning', 'in_progress']);

    if (fetchError) {
      console.error('[MISSION-STATUS] Error fetching missions:', fetchError);
      return { updated: 0, errors: [fetchError] };
    }

    if (!missions || missions.length === 0) {
      console.log('[MISSION-STATUS] No missions found requiring status check');
      return { updated: 0, errors: [] };
    }

    let updated = 0;
    const errors = [];

    for (const mission of missions) {
      try {
        // Skip if no associated event
        if (!mission.events) {
          continue;
        }

        const eventStartTime = new Date(mission.events.start_datetime);
        const eventEndTime = mission.events.end_datetime
          ? new Date(mission.events.end_datetime)
          : null;
        const nowTime = new Date(now);

        let newStatus = null;

        // Determine new status based on timing
        if (mission.status === 'planning' && nowTime >= eventStartTime) {
          // Event has started, move to in_progress
          newStatus = 'in_progress';
        } else if (mission.status === 'in_progress' && eventEndTime && nowTime >= eventEndTime) {
          // Event has ended, move to completed
          newStatus = 'completed';
        }

        // Update if status changed
        if (newStatus && newStatus !== mission.status) {
          const { error: updateError } = await supabase
            .from('missions')
            .update({
              status: newStatus,
              updated_at: now
            })
            .eq('id', mission.id);

          if (updateError) {
            console.error(`[MISSION-STATUS] Error updating mission ${mission.id}:`, updateError);
            errors.push({ missionId: mission.id, error: updateError });
          } else {
            updated++;
            console.log(`[MISSION-STATUS] Updated mission "${mission.name}" (${mission.id}) from "${mission.status}" to "${newStatus}"`);
          }
        }
      } catch (error) {
        console.error(`[MISSION-STATUS] Error processing mission ${mission.id}:`, error);
        errors.push({ missionId: mission.id, error });
      }
    }

    if (updated > 0 || errors.length > 0) {
      console.log(`[MISSION-STATUS] Completed: ${updated} updated, ${errors.length} errors`);
    }
    return { updated, errors };
  } catch (error) {
    console.error('[MISSION-STATUS] Error in processMissionStatusUpdates:', error);
    return { updated: 0, errors: [{ error }] };
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

  // Process scheduled publications immediately
  processScheduledPublications().catch(error => {
    console.error('Error in initial scheduled publications processing:', error);
  });

  // Process concluded events immediately
  processConcludedEvents().catch(error => {
    console.error('Error in initial concluded events processing:', error);
  });

  // Process mission status updates immediately
  processMissionStatusUpdates().catch(error => {
    console.error('Error in initial mission status updates processing:', error);
  });

  // Then process every 1 minute
  reminderIntervalId = setInterval(() => {
    processReminders().catch(error => {
      console.error('Error in scheduled reminder processing:', error);
    });
    processScheduledPublications().catch(error => {
      console.error('Error in scheduled publications processing:', error);
    });
    processConcludedEvents().catch(error => {
      console.error('Error in scheduled concluded events processing:', error);
    });
    processMissionStatusUpdates().catch(error => {
      console.error('Error in scheduled mission status updates processing:', error);
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