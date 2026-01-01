/**
 * DISCORD BOT API WRAPPER - REFACTORED
 * 
 * Main entry point that imports modular components
 * NEW VERSION with Mission Support Separation
 */

const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
const envLocalPath = path.resolve(__dirname, '../.env.local');
const envPath = path.resolve(__dirname, '../.env');

let result = dotenv.config({ path: envLocalPath });
if (result.error) {
  result = dotenv.config({ path: envPath });
  if (result.error && !process.env.BOT_TOKEN) {
    console.error('Error loading environment files:', result.error);
    console.log('Make sure environment variables are set via fly.io secrets in production');
  }
}

// Require Supabase client
const { supabase, upsertEventAttendance, getEventIdByDiscordId, getEventByDiscordId } = require('./supabaseClient');

// Import modular components
const { initializeClient, ensureLoggedIn, findEventsChannel, getClient, destroyClient, setIsLoggedIn } = require('./lib/discordClient');
const { createEventEmbed, createAdditionalImageEmbeds, createGoogleCalendarLink } = require('./lib/embedCreator');
const { publishEventToDiscord, editEventMessage, deleteEventMessage, sendReminderMessage } = require('./lib/messageManager');
const { createThreadFromMessage, getExistingThreadFromMessage, postMessageToThread, deleteThread, shouldUseThreadsForEvent, getThreadIdForEvent } = require('./lib/threadManager');
const { getAvailableGuilds, getGuildRoles, getGuildMember, getGuildChannels, getEventAttendance } = require('./lib/guildHelpers');
const { setupDiscordEventHandlers } = require('./lib/eventHandlers');
const { CountdownUpdateManager } = require('./lib/countdownManager');

// Check BOT_TOKEN
console.log('Environment variables loaded, BOT_TOKEN present:', !!process.env.BOT_TOKEN);
if (process.env.BOT_TOKEN) {
  console.log('BOT_TOKEN starts with:', process.env.BOT_TOKEN.substring(0, 5) + '...');
}

// Initialize Discord client
const client = initializeClient();

// Store event responses
let eventResponses = new Map();

// Event update callback function
let eventUpdateCallback = null;

// Function to register the event update callback
function registerEventUpdateCallback(callback) {
  eventUpdateCallback = callback;
}

// Function to notify about event updates
function notifyEventUpdate(eventId, eventData) {
  if (eventUpdateCallback && typeof eventUpdateCallback === 'function') {
    eventUpdateCallback(eventId, eventData);
  }
}

/**
 * Fetch the timezone setting from squadron settings
 */
async function fetchSquadronTimezone(eventId) {
  try {
    if (!eventId) {
      return 'America/New_York';
    }

    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('participants')
      .eq('id', eventId)
      .single();

    if (eventError || !eventData || !eventData.participants || eventData.participants.length === 0) {
      console.warn(`[TIMEZONE] Could not fetch participants for event ${eventId}, using default timezone`);
      return 'America/New_York';
    }

    const firstSquadronId = eventData.participants[0];
    const { data: squadronData, error: squadronError } = await supabase
      .from('org_squadrons')
      .select('settings')
      .eq('id', firstSquadronId)
      .single();

    if (squadronError || !squadronData || !squadronData.settings) {
      console.warn(`[TIMEZONE] Could not fetch settings for squadron ${firstSquadronId}, using default timezone`);
      return 'America/New_York';
    }

    const timezone = squadronData.settings.timezone || 'America/New_York';
    console.log(`[TIMEZONE] Using timezone ${timezone} from squadron ${firstSquadronId}`);
    return timezone;
  } catch (error) {
    console.warn(`[TIMEZONE] Error fetching squadron timezone: ${error.message}`);
    return 'America/New_York';
  }
}

/**
 * Extract complete embed data from database event record
 * NOW ASYNC - Fetches training data if this is a training event
 */
async function extractEmbedDataFromDatabaseEvent(dbEvent, overrideTimezone = null) {
  let imageData = null;
  if (dbEvent.image_url) {
    if (typeof dbEvent.image_url === 'object') {
      imageData = {
        imageUrl: dbEvent.image_url.headerImage || dbEvent.image_url.imageUrl,
        headerImage: dbEvent.image_url.headerImage,
        additionalImages: dbEvent.image_url.additionalImages || []
      };
    } else if (typeof dbEvent.image_url === 'string') {
      imageData = {
        imageUrl: dbEvent.image_url,
        headerImage: dbEvent.image_url,
        additionalImages: []
      };
    }
  } else {
    imageData = {
      imageUrl: dbEvent.header_image_url,
      headerImage: dbEvent.header_image_url,
      additionalImages: dbEvent.additional_image_urls || []
    };
  }

  const creatorInfo = {
    boardNumber: dbEvent.creator_board_number || '',
    callsign: dbEvent.creator_call_sign || '',
    billet: dbEvent.creator_billet || ''
  };

  let timezone = overrideTimezone || 'America/New_York';
  if (!overrideTimezone && dbEvent.event_settings) {
    try {
      const settings = typeof dbEvent.event_settings === 'string'
        ? JSON.parse(dbEvent.event_settings)
        : dbEvent.event_settings;

      if (settings.timezone) {
        timezone = settings.timezone;
      }
    } catch (error) {
      console.warn('Failed to parse event settings for timezone, using default');
    }
  }

  const eventOptions = {
    trackQualifications: dbEvent.event_settings?.groupResponsesByQualification || dbEvent.track_qualifications || false,
    groupBySquadron: dbEvent.event_settings?.groupBySquadron || false,
    showNoResponse: dbEvent.event_settings?.showNoResponse || false,
    eventType: dbEvent.event_type || null,
    timezone: timezone
  };

  // Fetch training data if this is a training event
  if (dbEvent.syllabus_mission_id) {
    try {
      console.log(`[TRAINING-DATA-FETCH] Event ${dbEvent.id} is a training event, fetching training data...`);

      // Fetch syllabus mission data including reference materials
      const { data: missionData, error: missionError } = await supabase
        .from('training_syllabus_missions')
        .select('mission_name, week_number, syllabus_id, reference_materials')
        .eq('id', dbEvent.syllabus_mission_id)
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
          .eq('syllabus_mission_id', dbEvent.syllabus_mission_id)
          .order('display_order');

        // Fetch training enrollees for this cycle
        const { data: enrollees } = await supabase
          .from('training_enrollments')
          .select('pilot_id')
          .eq('cycle_id', dbEvent.cycle_id)
          .eq('status', 'active');

        // Merge reference materials: syllabus -> mission -> event
        const syllabusRefs = syllabusData?.reference_materials || [];
        const missionRefs = missionData.reference_materials || [];
        const eventRefs = dbEvent.reference_materials || [];

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
          enrollees: enrollees || []
        };

        console.log(`[TRAINING-DATA-FETCH] Successfully fetched training data for event ${dbEvent.id}, references: ${uniqueRefs.length} (syllabus: ${syllabusRefs.length}, mission: ${missionRefs.length}, event: ${eventRefs.length})`);
      }
    } catch (trainingError) {
      console.warn(`[TRAINING-DATA-FETCH] Error fetching training data for event ${dbEvent.id}:`, trainingError.message);
    }
  }

  const parseDateTime = (dateTimeString) => {
    if (!dateTimeString) return new Date();
    try {
      const date = new Date(dateTimeString);
      return isNaN(date.getTime()) ? new Date() : date;
    } catch (error) {
      console.warn(`[DATE-PARSE] Error parsing datetime "${dateTimeString}":`, error.message);
      return new Date();
    }
  };

  const eventTime = {
    start: parseDateTime(dbEvent.start_datetime),
    end: parseDateTime(dbEvent.end_datetime)
  };

  return {
    title: dbEvent.name || dbEvent.title || 'Event',
    description: dbEvent.description || '',
    eventTime,
    imageData,
    creatorInfo,
    eventOptions
  };
}

/**
 * Load event responses from database
 */
async function loadEventResponses() {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('id, name, description, start_datetime, end_datetime, discord_event_id, image_url, creator_board_number, creator_call_sign, creator_billet, event_settings, track_qualifications, event_type, syllabus_mission_id, cycle_id, reference_materials')
      .not('discord_event_id', 'is', null);
    
    if (error) {
      console.error('Error loading events from database:', error);
      return;
    }
    
    let loadedCount = 0;
    
    for (const event of data) {
      if (!event.discord_event_id) continue;
      
      let channelId = null;
      
      const { data: attendanceData, error: attendanceError } = await supabase
        .rpc('get_latest_event_responses', {
          event_id: event.discord_event_id
        });

      if (attendanceError) {
        console.error(`Error loading attendance for event ${event.discord_event_id}:`, attendanceError);
        continue;
      }

      if (!attendanceData || attendanceData.length === 0) {
        continue;
      }

      const eventData = {
        title: event.name,
        description: event.description || '',
        eventTime: {
          start: new Date(event.start_datetime),
          end: event.end_datetime ? new Date(event.end_datetime) : new Date(new Date(event.start_datetime).getTime() + (60 * 60 * 1000))
        },
        guildId: Array.isArray(event.discord_event_id) && event.discord_event_id.length > 0
          ? event.discord_event_id[0].guildId
          : null,
        channelId: channelId,
        images: event.image_url ? (await extractEmbedDataFromDatabaseEvent(event)).imageData : null,
        creator: (await extractEmbedDataFromDatabaseEvent(event)).creatorInfo,
        imageUrl: event.image_url || null,
        accepted: [],
        declined: [],
        tentative: []
      };

      if (attendanceData) {
        const userMapLoad = new Map();

        for (const record of attendanceData) {
          if (userMapLoad.has(record.discord_id)) {
            console.warn(`[LOAD-DUPLICATE-FIX] Skipping older attendance record for user ${record.discord_id} in event ${event.discord_event_id}`);
            continue;
          }

          userMapLoad.set(record.discord_id, record);

          let pilotRecord = null;
          try {
            const { data: pilotData, error: pilotError } = await supabase
              .from('pilots')
              .select(`
                *,
                pilot_qualifications(
                  qualification_id,
                  qualification:qualifications(name)
                )
              `)
              .eq('discord_id', record.discord_id)
              .single();

            if (!pilotError && pilotData) {
              let squadronData = null;
              try {
                const { data: assignment, error: assignmentError } = await supabase
                  .from('pilot_assignments')
                  .select('squadron_id')
                  .eq('pilot_id', pilotData.id)
                  .is('end_date', null)
                  .single();

                if (!assignmentError && assignment?.squadron_id) {
                  const { data: squadron, error: squadronError } = await supabase
                    .from('org_squadrons')
                    .select('id, designation, name, discord_integration')
                    .eq('id', assignment.squadron_id)
                    .single();

                  if (!squadronError) {
                    squadronData = squadron;
                  }
                }
              } catch (err) {
                console.warn(`[SQUADRON-FETCH] Could not fetch squadron for pilot ${pilotData.id}`);
              }

              pilotRecord = {
                id: pilotData.id,
                callsign: pilotData.callsign,
                boardNumber: pilotData.boardNumber?.toString() || '',
                qualifications: pilotData.pilot_qualifications?.map(pq => pq.qualification?.name).filter(Boolean) || [],
                currentStatus: { name: pilotData.status || 'Provisional' },
                squadron: squadronData
              };
            }
          } catch (error) {
            console.warn(`[LOAD-PILOT-DATA] Error fetching pilot data for ${record.discord_id}:`, error.message);
          }

          const userEntry = {
            userId: record.discord_id,
            displayName: record.discord_username || 'Unknown User',
            boardNumber: pilotRecord?.boardNumber || '',
            callsign: pilotRecord?.callsign || record.discord_username || 'Unknown User',
            pilotRecord
          };

          if (record.user_response === 'accepted') {
            eventData.accepted.push(userEntry);
          } else if (record.user_response === 'declined') {
            eventData.declined.push(userEntry);
          } else if (record.user_response === 'tentative') {
            eventData.tentative.push(userEntry);
          }
        }
      }
      
      eventResponses.set(event.discord_event_id, eventData);
      loadedCount++;
    }
    
    console.log(`Loaded ${loadedCount} events from database`);
  } catch (error) {
    console.error('Error in loadEventResponses:', error);
  }
}

function saveEventResponses() {
  // No-op - data is saved to database directly
}

// Wrapped versions of message manager functions that include eventResponses
async function editEventMessageWrapped(messageId, title, description, eventTime, guildId, channelId, imageUrl = null, creator = null, images = null, eventOptions = {}) {
  let existingResponses = eventResponses.get(messageId);
  
  if (!existingResponses) {
    try {
      const { data: attendanceData } = await supabase
        .rpc('get_latest_event_responses', {
          event_id: messageId
        });
      
      if (attendanceData) {
        existingResponses = { accepted: [], declined: [], tentative: [], noResponse: [] };

        // Populate existingResponses with pilot data
        for (const record of attendanceData) {
          let pilotRecord = null;
          try {
            const { data: pilotData } = await supabase
              .from('pilots')
              .select(`
                *,
                pilot_qualifications(
                  qualification_id,
                  qualification:qualifications(name)
                )
              `)
              .eq('discord_id', record.discord_id)
              .single();

            if (pilotData) {
              let squadronData = null;
              try {
                const { data: assignment } = await supabase
                  .from('pilot_assignments')
                  .select('squadron_id')
                  .eq('pilot_id', pilotData.id)
                  .is('end_date', null)
                  .single();

                if (assignment?.squadron_id) {
                  const { data: squadron } = await supabase
                    .from('org_squadrons')
                    .select('id, designation, name, discord_integration')
                    .eq('id', assignment.squadron_id)
                    .single();

                  if (squadron) {
                    squadronData = squadron;
                  }
                }
              } catch (err) {
                console.warn(`[EDIT-SQUADRON-FETCH] Could not fetch squadron for pilot ${pilotData.id}`);
              }

              pilotRecord = {
                id: pilotData.id,
                callsign: pilotData.callsign,
                boardNumber: pilotData.boardNumber?.toString() || '',
                qualifications: pilotData.pilot_qualifications?.map(pq => pq.qualification?.name).filter(Boolean) || [],
                currentStatus: { name: pilotData.status || 'Provisional' },
                squadron: squadronData
              };
            }
          } catch (error) {
            console.warn(`[EDIT-PILOT-DATA] Error fetching pilot data for ${record.discord_id}:`, error.message);
          }

          const userEntry = {
            userId: record.discord_id,
            displayName: record.discord_username || 'Unknown User',
            boardNumber: pilotRecord?.boardNumber || '',
            callsign: pilotRecord?.callsign || record.discord_username || 'Unknown User',
            pilotRecord
          };

          if (record.user_response === 'accepted') {
            existingResponses.accepted.push(userEntry);
          } else if (record.user_response === 'declined') {
            existingResponses.declined.push(userEntry);
          } else if (record.user_response === 'tentative') {
            existingResponses.tentative.push(userEntry);
          }
        }

        // Fetch "no response" users if the option is enabled
        if (eventOptions.showNoResponse) {
          try {
            const { data: noResponseData } = await supabase
              .rpc('get_event_no_response_users', {
                discord_message_id: messageId
              });

            if (noResponseData) {
              existingResponses.noResponse = noResponseData.map(record => ({
                userId: record.discord_id,
                displayName: record.discord_username || 'Unknown User',
                boardNumber: record.board_number || '',
                callsign: record.callsign || record.discord_username || 'Unknown User',
                pilotRecord: null
              }));
            }
          } catch (noResponseError) {
            console.warn(`Error fetching no-response users:`, noResponseError);
          }
        }
      }
    } catch (dbError) {
      console.warn(`Error fetching responses:`, dbError);
      existingResponses = { accepted: [], declined: [], tentative: [], noResponse: [] };
    }
  }
  
  const result = await editEventMessage(messageId, title, description, eventTime, guildId, channelId, existingResponses, imageUrl, creator, images, eventOptions);
  
  if (result.success && eventResponses.has(messageId)) {
    const existingData = eventResponses.get(messageId);
    eventResponses.set(messageId, {
      ...existingData,
      title,
      description,
      eventTime,
      imageUrl: imageUrl || existingData.imageUrl,
      images: images || existingData.images || (imageUrl ? { imageUrl } : null),
      creator: creator || existingData.creator
    });
  }
  
  return result;
}

async function deleteEventMessageWrapped(messageId, guildId, channelId) {
  if (!channelId && eventResponses.has(messageId)) {
    const eventData = eventResponses.get(messageId);
    if (eventData && eventData.channelId) {
      channelId = eventData.channelId;
    }
  }
  
  const result = await deleteEventMessage(messageId, guildId, channelId);
  
  if (result.success && eventResponses.has(messageId)) {
    eventResponses.delete(messageId);
  }
  
  return result;
}

async function publishEventToDiscordWrapped(title, description, eventTime, guildId, channelId, imageUrl = null, creator = null, images = null, eventOptions = {}, eventId = null) {
  const result = await publishEventToDiscord(title, description, eventTime, guildId, channelId, imageUrl, creator, images, eventOptions, eventId, supabase);

  if (result.success) {
    const imageData = images || (imageUrl ? { imageUrl } : null);

    const eventData = {
      title,
      description,
      eventTime,
      guildId: result.guildId,
      channelId: result.channelId,
      imageUrl: imageUrl,
      images: imageData,
      creator: creator,
      accepted: [],
      declined: [],
      tentative: [],
      noResponse: []
    };

    eventResponses.set(result.messageId, eventData);
  }

  return result;
}

// Discord client setup and event handlers
client.once('ready', () => {
  console.log('Discord bot is ready!');
  loadEventResponses();
  
  setInterval(() => {
    console.log('[SCHEDULED] Reloading event responses from database');
    loadEventResponses();
  }, 5 * 60 * 1000);
});

client.on('guildCreate', async (guild) => {
  console.log(`Joined a new guild: ${guild.name} (ID: ${guild.id})`);
  
  const channel = guild.systemChannel || guild.channels.cache.find(ch => ch.type === 'GUILD_TEXT');
  if (channel) {
    try {
      await channel.send(`Hello ${guild.name}! I'm your event assistant bot. Use \`/help\` to see what I can do.`);
      console.log(`Sent welcome message to ${guild.name}`);
    } catch (error) {
      console.warn(`Could not send welcome message to ${guild.name}:`, error.message);
    }
  }
});

client.on('guildDelete', (guild) => {
  console.log(`Left a guild: ${guild.name} (ID: ${guild.id})`);
});

// Setup event handlers using the modular function
setupDiscordEventHandlers(supabase, upsertEventAttendance, getEventByDiscordId, fetchSquadronTimezone, extractEmbedDataFromDatabaseEvent, eventResponses);

// Initialize countdown manager
const countdownManager = new CountdownUpdateManager(supabase, getEventByDiscordId, fetchSquadronTimezone, extractEmbedDataFromDatabaseEvent);

async function initializeDiscordBot() {
  try {
    await ensureLoggedIn();
    await countdownManager.start();
    return true;
  } catch (error) {
    console.error('Error initializing Discord bot:', error);
    throw error;
  }
}

async function switchDiscordBot(newToken) {
  try {
    console.log(`[BOT-SWITCH] Switching Discord bot token...`);

    countdownManager.stop();

    destroyClient();
    eventResponses.clear();

    const newClient = initializeClient();
    setupDiscordEventHandlers(supabase, upsertEventAttendance, getEventByDiscordId, fetchSquadronTimezone, extractEmbedDataFromDatabaseEvent, eventResponses);

    process.env.BOT_TOKEN = newToken;

    await initializeDiscordBot();

    const client = getClient();
    console.log(`[BOT-SWITCH] Successfully switched to new Discord bot: ${client.user.tag}`);
    return { success: true, botInfo: { tag: client.user.tag, id: client.user.id } };
  } catch (error) {
    console.error('[BOT-SWITCH] Error switching Discord bot:', error);
    return { success: false, error: error.message };
  }
}

// Wrapped versions of thread manager functions
async function sendReminderMessageWrapped(guildId, channelId, message, eventId = null) {
  if (eventId) {
    const threadId = await getThreadIdForEvent(eventId, guildId, channelId, supabase);
    
    if (threadId) {
      console.log(`[REMINDER] Found thread ${threadId} for event ${eventId}, attempting to post to thread`);
      
      const threadResult = await postMessageToThread(threadId, guildId, message);
      
      if (threadResult.success) {
        console.log(`[REMINDER] Successfully sent reminder to thread ${threadId}`);
        return { success: true, postedToThread: true, threadId: threadId };
      } else {
        console.warn(`[REMINDER] Failed to post to thread ${threadId}: ${threadResult.error}, falling back to channel`);
      }
    }
  }
  
  return await sendReminderMessage(guildId, channelId, message, getClient);
}

async function shouldUseThreadsForEventWrapped(participatingSquadrons, guildId, channelId) {
  return await shouldUseThreadsForEvent(participatingSquadrons, guildId, channelId, supabase);
}

async function getThreadIdForEventWrapped(eventId, guildId, channelId) {
  return await getThreadIdForEvent(eventId, guildId, channelId, supabase);
}

// Wrapped version of getEventAttendance
function getEventAttendanceWrapped(discordMessageId) {
  return getEventAttendance(discordMessageId, eventResponses);
}

/**
 * Post a new message with an image attachment to a Discord channel
 * @param {string} guildId - The guild ID where to post
 * @param {string} channelId - The channel ID where to post
 * @param {string} messageContent - The content/text for the message
 * @param {Buffer} imageBuffer - The image data as a buffer
 * @param {string} imageName - The filename for the image
 * @returns {Promise<{success: boolean, messageId?: string, error?: string, availableGuilds?: any[]}>}
 */
async function postDiscordMessageImage(guildId, channelId, messageContent, imageBuffer, imageName) {
  try {
    console.log('[DISCORD-BOT] Posting new message with image:', { guildId, channelId, imageName });

    // Get the current client instance (important after bot switches)
    const currentClient = getClient();

    // Check if client is ready
    if (!currentClient.isReady()) {
      console.error('[DISCORD-BOT] Discord client is not ready');
      return { success: false, error: 'Discord client is not ready' };
    }

    // Get the guild
    const guild = currentClient.guilds.cache.get(guildId);
    if (!guild) {
      console.error('[DISCORD-BOT] Guild not found:', guildId);
      const availableGuilds = currentClient.guilds.cache.map(g => ({ id: g.id, name: g.name }));
      return {
        success: false,
        error: `Guild with ID ${guildId} not found`,
        availableGuilds
      };
    }

    // Get the channel
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      console.error('[DISCORD-BOT] Channel not found:', channelId);
      return { success: false, error: `Channel with ID ${channelId} not found` };
    }

    // Create attachment from buffer
    const { AttachmentBuilder } = require('discord.js');
    const attachment = new AttachmentBuilder(imageBuffer, { name: imageName });

    // Send the message with image
    const sentMessage = await channel.send({
      content: messageContent || '',
      files: [attachment]
    });

    console.log('[DISCORD-BOT] Successfully posted message:', sentMessage.id);
    return { success: true, messageId: sentMessage.id };

  } catch (error) {
    console.error('[DISCORD-BOT] Error posting message image:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update an existing Discord message with a new image attachment
 * @param {string} messageId - The ID of the message to update
 * @param {string} guildId - The guild ID where the message is located
 * @param {string} channelId - The channel ID where the message is located
 * @param {string} messageContent - The new content/text for the message
 * @param {Buffer} imageBuffer - The image data as a buffer
 * @param {string} imageName - The filename for the image
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function updateDiscordMessageImage(messageId, guildId, channelId, messageContent, imageBuffer, imageName) {
  try {
    console.log('[DISCORD-BOT] Updating message with new image:', { messageId, guildId, channelId, imageName });

    // Get the current client instance (important after bot switches)
    const currentClient = getClient();

    // Check if client is ready
    if (!currentClient.isReady()) {
      console.error('[DISCORD-BOT] Discord client is not ready');
      return { success: false, error: 'Discord client is not ready' };
    }

    // Get the guild
    const guild = currentClient.guilds.cache.get(guildId);
    if (!guild) {
      console.error('[DISCORD-BOT] Guild not found:', guildId);
      return { success: false, error: `Guild with ID ${guildId} not found` };
    }

    // Get the channel
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      console.error('[DISCORD-BOT] Channel not found:', channelId);
      return { success: false, error: `Channel with ID ${channelId} not found` };
    }

    // Fetch the existing message
    let existingMessage;
    try {
      existingMessage = await channel.messages.fetch(messageId);
    } catch (fetchError) {
      console.error('[DISCORD-BOT] Failed to fetch message:', fetchError);
      return { success: false, error: `Message with ID ${messageId} not found` };
    }

    // Create attachment from buffer
    const { AttachmentBuilder } = require('discord.js');
    const attachment = new AttachmentBuilder(imageBuffer, { name: imageName });

    // Edit the message with new content and image
    await existingMessage.edit({
      content: messageContent,
      files: [attachment]
    });

    console.log('[DISCORD-BOT] Successfully updated message:', messageId);
    return { success: true };

  } catch (error) {
    console.error('[DISCORD-BOT] Error updating message image:', error);
    return { success: false, error: error.message };
  }
}

// Login to Discord
client.login(process.env.BOT_TOKEN);

module.exports = {
  publishEventToDiscord: publishEventToDiscordWrapped,
  getEventAttendance: getEventAttendanceWrapped,
  initializeDiscordBot,
  registerEventUpdateCallback,
  deleteEventMessage: deleteEventMessageWrapped,
  editEventMessage: editEventMessageWrapped,
  getAvailableGuilds,
  countdownManager,
  sendReminderMessage: sendReminderMessageWrapped,
  getGuildRoles,
  getGuildMember,
  createThreadFromMessage,
  getExistingThreadFromMessage,
  deleteThread,
  postMessageToThread,
  switchDiscordBot,
  shouldUseThreadsForEvent: shouldUseThreadsForEventWrapped,
  getThreadIdForEvent: getThreadIdForEventWrapped,
  getGuildChannels,
  postDiscordMessageImage,
  updateDiscordMessageImage
};