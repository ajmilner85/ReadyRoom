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
  countdownManager,
  deleteThread,
  switchDiscordBot
} = require('./discordBot');


// Import Supabase client (path adjusted for SDOBot directory)
const { supabase, getEventByDiscordId } = require('./supabaseClient');

// Import background processors
const { processMissionStatusUpdates } = require('./processors/missionStatusProcessor');
const { processConcludedEvents } = require('./processors/concludedEventsProcessor');
const { processReminders } = require('./processors/reminderProcessor');
const { processScheduledPublications } = require('./processors/scheduledPublicationProcessor');

// Import route modules
const healthRoutes = require('./routes/health');
const settingsRoutes = require('./routes/settings');
const discordHelpersRoutes = require('./routes/discordHelpers');
const flightPostsRoutes = require('./routes/flightPosts');

// Note: We'll implement reminder processing directly here to avoid ES6/CommonJS module issues

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

// Register route modules
app.use('/api', healthRoutes);
app.use('/api', settingsRoutes);
app.use('/api', discordHelpersRoutes);
app.use('/api', flightPostsRoutes);

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