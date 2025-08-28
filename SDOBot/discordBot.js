const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { format, formatDistanceToNow } = require('date-fns');
const { toZonedTime, fromZonedTime, formatInTimeZone, getTimezoneOffset } = require('date-fns-tz');

// Load environment variables - in production, use fly.io secrets
const result = dotenv.config();
if (result.error && !process.env.BOT_TOKEN) {
  console.error('Error loading .env file:', result.error);
  console.log('Make sure environment variables are set via fly.io secrets in production');
}

// Require Supabase client from local directory  
const { supabase, upsertEventAttendance, getEventIdByDiscordId, getEventByDiscordId } = require('./supabaseClient');

// Check if BOT_TOKEN is loaded and log its status
console.log('Environment variables loaded, BOT_TOKEN present:', !!process.env.BOT_TOKEN);
// Print the first few characters of the token for debugging (never print the whole token!)
if (process.env.BOT_TOKEN) {
  console.log('BOT_TOKEN starts with:', process.env.BOT_TOKEN.substring(0, 5) + '...');
}

// Initialize Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

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
 * Extract complete embed data from database event record
 * This ensures all embed creation paths use the same database field logic
 */
function extractEmbedDataFromDatabaseEvent(dbEvent) {
  // Extract image data from JSONB or legacy fields
  let imageData = null;
  if (dbEvent.image_url) {
    if (typeof dbEvent.image_url === 'object') {
      // JSONB format
      imageData = {
        imageUrl: dbEvent.image_url.headerImage || dbEvent.image_url.imageUrl,
        headerImage: dbEvent.image_url.headerImage,
        additionalImages: dbEvent.image_url.additionalImages || []
      };
    } else if (typeof dbEvent.image_url === 'string') {
      // Legacy string format
      imageData = {
        imageUrl: dbEvent.image_url,
        headerImage: dbEvent.image_url,
        additionalImages: []
      };
    }
  } else {
    // Fallback to separate fields
    imageData = {
      imageUrl: dbEvent.header_image_url,
      headerImage: dbEvent.header_image_url,
      additionalImages: dbEvent.additional_image_urls || []
    };
  }

  // Extract creator info
  const creatorInfo = {
    boardNumber: dbEvent.creator_board_number || '',
    callsign: dbEvent.creator_call_sign || '',
    billet: dbEvent.creator_billet || ''
  };

  // Extract event options
  const eventOptions = {
    trackQualifications: dbEvent.event_settings?.groupResponsesByQualification || dbEvent.track_qualifications || false,
    eventType: dbEvent.event_type || null
  };

  // Extract time data
  const eventTime = {
    start: new Date(dbEvent.start_datetime),
    end: new Date(dbEvent.end_datetime)
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

// Function to load event responses from database
async function loadEventResponses() {  try {
    // Get all events with Discord message IDs from the database
    const { data, error } = await supabase
      .from('events')
      .select('id, name, description, start_datetime, end_datetime, discord_event_id, discord_guild_id, image_url, creator_board_number, creator_call_sign, creator_billet, event_settings, track_qualifications, event_type')
      .not('discord_event_id', 'is', null);
    
    if (error) {
      console.error('Error loading events from database:', error);
      return;
    }
    
    let loadedCount = 0;
    
    // Process each event
    for (const event of data) {
      if (!event.discord_event_id) continue;
      
      // Get channel ID from squadron_settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('squadron_settings')
        .select('value')
        .eq('key', 'events_channel_id')
        .single();
      
      let channelId = null;
      if (!settingsError && settingsData && settingsData.value) {
        channelId = settingsData.value;
      }
      
      // Get attendance data for this event
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('discord_event_attendance')
        .select('*')
        .eq('discord_event_id', event.discord_event_id);
      
      if (attendanceError) {
        console.error(`Error loading attendance for event ${event.discord_event_id}:`, attendanceError);
        continue;
      }
        // Format event data
      const eventData = {
        title: event.name,
        description: event.description || '',
        eventTime: {
          start: new Date(event.start_datetime),
          end: event.end_datetime ? new Date(event.end_datetime) : new Date(new Date(event.start_datetime).getTime() + (60 * 60 * 1000))
        },
        guildId: event.discord_guild_id,
        channelId: channelId,        // Store image data using the same structure as database extraction
        images: event.image_url ? extractEmbedDataFromDatabaseEvent(event).imageData : null,
        // Store creator info using the same structure as database extraction
        creator: extractEmbedDataFromDatabaseEvent(event).creatorInfo,
        // Keep legacy field for backward compatibility
        imageUrl: event.image_url || null,
        accepted: [],
        declined: [],
        tentative: []
      };
      
      // Process attendance data
      if (attendanceData) {
        for (const record of attendanceData) {
          const userEntry = { 
            userId: record.discord_id, 
            displayName: record.discord_username || 'Unknown User' 
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
      
      // Add to memory cache
      eventResponses.set(event.discord_event_id, eventData);
      loadedCount++;
    }
    
    console.log(`Loaded ${loadedCount} events from database`);
  } catch (error) {
    console.error('Error in loadEventResponses:', error);
  }
}

// This function is now just a no-op since we don't save to file anymore
function saveEventResponses() {
  // We're no longer saving to file, all data is saved to the database directly
  // when user interactions occur
}

// Function to create event message embed
function createEventEmbed(title, description, eventTime, responses = {}, creator = null, images = null, eventOptions = {}) {
  const accepted = responses.accepted || [];
  const declined = responses.declined || [];
  const tentative = responses.tentative || [];
  
  // Helper function to format pilot entries as {board number} {callsign}
  const formatPilotEntry = (entry) => {
    if (typeof entry === 'string') {
      return entry;
    }
    
    // If we have pilot record data, use that for consistent formatting
    if (entry.pilotRecord) {
      const boardNumber = entry.pilotRecord.boardNumber || '';
      const callsign = entry.pilotRecord.callsign || '';
      return boardNumber ? `${boardNumber} ${callsign}` : callsign;
    }
    
    // Fallback: use the entry's board number and callsign if available
    const boardNumber = entry.boardNumber || '';
    const callsign = entry.callsign || entry.displayName || 'Unknown';
    
    return boardNumber ? `${boardNumber} ${callsign}` : callsign;
  };
  

// Helper function to create block quote format
  const createBlockQuote = (entries) => {
    if (entries.length === 0) return '-';
    const formattedEntries = entries.map(formatPilotEntry);
    // Discord has a 1024 character limit per field value, use single-line quotes
    const content = formattedEntries.map(entry => `> ${entry}`).join('\n');
    return content.length > 1020 ? formattedEntries.slice(0, 20).map(entry => `> ${entry}`).join('\n') + `\n> ... and ${formattedEntries.length - 20} more` : content;
  };
  
  // Helper function to group by qualifications
  const groupByQualifications = (entries, isTraining = false) => {
    if (entries.length === 0) return '-';
    
    // If training event, divide into IP and Trainee
    if (isTraining) {
      // console.log('[TRAINING-DEBUG] Processing training event grouping for', entries.length, 'entries');
      
      // Log pilot data for debugging
      entries.forEach((entry, index) => {
        // console.log(`[TRAINING-DEBUG] Entry ${index}:`, {
        //   username: entry.username,
        //   discordId: entry.userId,
        //   currentStatus: entry.pilotRecord?.currentStatus?.name,
        //   qualifications: entry.pilotRecord?.qualifications,
        //   hasPilotRecord: !!entry.pilotRecord
        // });
      });
      
      // IPs: Only pilots with the "Instructor Pilot" qualification
      const ips = entries.filter(entry => {
        const qualifications = entry.pilotRecord?.qualifications || [];
        
        // Check for the specific "Instructor Pilot" qualification
        return qualifications.includes('Instructor Pilot');
      });
      
      // Trainees: Everyone who is NOT an IP
      const ipIds = new Set(ips.map(ip => ip.userId || ip.discordId));
      const trainees = entries.filter(entry => !ipIds.has(entry.userId || entry.discordId));
      
      // console.log(`[TRAINING-DEBUG] Grouped: ${ips.length} IPs, ${trainees.length} Trainees`);
      
      let result = '';
      if (ips.length > 0) {
        const ipPilots = ips.map(formatPilotEntry);
        const ipContent = ipPilots.map(entry => `> ${entry}`).join('\n');
        result += `*IP (${ips.length})*\n${ipContent}`;
      }
      if (trainees.length > 0) {
        if (result) result += '\n\n';
        const traineePilots = trainees.map(formatPilotEntry);
        const traineeContent = traineePilots.map(entry => `> ${entry}`).join('\n');
        result += `*Trainee (${trainees.length})*\n${traineeContent}`;
      }
      
      // If no one is classified (edge case), show everyone as IP
      if (result === '') {
        const allPilots = entries.map(formatPilotEntry);
        const allContent = allPilots.map(entry => `> ${entry}`).join('\n');
        result = `*IP (${entries.length})*\n${allContent}`;
      }
      
      // Check character limit
      return (result.length > 1020) ? result.substring(0, 1020) + '...' : (result || '-');
    }
    
    // Standard qualification grouping
    const qualificationOrder = ['Mission Commander', 'Flight Lead', 'Section Lead', 'LSO', 'JTAC'];
    const groups = {};
    const unassigned = [];
    
    entries.forEach(entry => {
      let assigned = false;
      const qualifications = entry.pilotRecord?.qualifications || [];
      
      // Check for primary qualifications (no duplication)
      for (const qual of ['Mission Commander', 'Flight Lead', 'Section Lead']) {
        if (qualifications.includes(qual)) {
          if (!groups[qual]) groups[qual] = [];
          groups[qual].push(entry);
          assigned = true;
          break; // Only assign to the highest qualification
        }
      }
      
      // Check for auxiliary qualifications (allow duplication)
      for (const qual of ['LSO', 'JTAC']) {
        if (qualifications.includes(qual)) {
          if (!groups[qual]) groups[qual] = [];
          groups[qual].push(entry);
          assigned = true;
        }
      }
      
      if (!assigned) {
        unassigned.push(entry);
      }
    });
    
    let result = '';
    qualificationOrder.forEach(qual => {
      if (groups[qual] && groups[qual].length > 0) {
        if (result) result += '\n\n';
        const pilots = groups[qual].map(formatPilotEntry);
        const qualContent = pilots.map(entry => `> ${entry}`).join('\n');
        result += `*${qual} (${groups[qual].length})*\n${qualContent}`;
      }
    });
    
    if (unassigned.length > 0) {
      if (result) result += '\n\n';
      const pilots = unassigned.map(formatPilotEntry);
      const unassignedContent = pilots.map(entry => `> ${entry}`).join('\n');
      result += `*Other (${unassigned.length})*\n${unassignedContent}`;
    }
    
    // Check character limit
    return (result.length > 1020) ? result.substring(0, 1020) + '...' : (result || '-');
  };

  const shouldTrackQualifications = eventOptions.trackQualifications || false;
  const isTrainingEvent = eventOptions.eventType === 'Hop' || title.toLowerCase().includes('training');
  
  // Format attendance lists
  let acceptedText, tentativeText;
  
  if (shouldTrackQualifications || isTrainingEvent) {
    acceptedText = groupByQualifications(accepted, isTrainingEvent);
    tentativeText = groupByQualifications(tentative, isTrainingEvent);
  } else {
    acceptedText = createBlockQuote(accepted);
    tentativeText = createBlockQuote(tentative);
  }
  
  const declinedText = createBlockQuote(declined);
  
  // Create the initial embed with title and URL for image grouping
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(title)
    .setURL('https://readyroom.app');  // Same URL for all embeds to enable grouping
  
  // Only set description if it's not empty
  if (description && description.trim().length > 0) {
    embed.setDescription(description);
  }

  // Add event time if provided
  if (eventTime) {
    // Add a blank field to create space between description and event time
    embed.addFields({ name: '\u200B', value: '\u200B', inline: false });
    
    const startTime = new Date(eventTime.start);
    const endTime = new Date(eventTime.end);
    
    const formattedDate = format(startTime, "EEEE, MMMM d, yyyy");
    const formattedStartTime = format(startTime, "h:mm a 'EDT'");
    const formattedEndTime = format(endTime, "h:mm a 'EDT'");
    
    const timeString = `${formattedDate} ${formattedStartTime} - ${formattedEndTime}`;
    
    // Create dynamic countdown string based on event status
    // Use UTC-based comparison (DST-safe) but with timezone-aware display
    let countdownString;
    
    const nowUtc = new Date();
    
    if (nowUtc >= startTime && nowUtc <= endTime) {
      countdownString = '🔴 **Happening Now**';
    } else if (nowUtc > endTime) {
      countdownString = '⏹️ **Event Finished**';
    } else {
      countdownString = `🕒 ${formatDistanceToNow(startTime, { addSuffix: true })}`;
    }
    
    // Create Google Calendar link
    const googleCalendarLink = createGoogleCalendarLink(title, description, startTime, endTime);
    
    embed.addFields(
      { name: '📆 Event Time', value: timeString, inline: false },
      { name: 'Countdown', value: countdownString, inline: true },
      { name: 'Add to Calendar', value: `[Google Calendar](${googleCalendarLink})`, inline: true },
      { name: '\u200B', value: '\u200B', inline: false }
    );
  }
  
  embed.addFields(
    { name: `✅ Accepted (${accepted.length})`, value: acceptedText, inline: true },
    { name: `❓ Tentative (${tentative.length})`, value: tentativeText, inline: true },
    { name: `❌ Declined (${declined.length})`, value: declinedText, inline: true }
  )
  .setTimestamp();
  
  // Consistent embed width using footer padding
  const MAX_EMBED_WIDTH = 164;
  
  // Add creator information if provided
  if (creator) {
    // console.log('[CREATOR-DEBUG] Creator object received:', creator);
    let footerText = '';
    if (creator.boardNumber) {
      footerText += creator.boardNumber + ' ';
    }
    if (creator.callsign) {
      footerText += creator.callsign;
    }
    if (creator.billet) {
      footerText += ' - ' + creator.billet;
    }
    // console.log('[CREATOR-DEBUG] Footer text:', footerText);
    if (footerText) {
      embed.setFooter({ text: `Created by ${footerText}`.padEnd(MAX_EMBED_WIDTH) + '\u200B' });
    } else {
      // Use default footer for width consistency
      embed.setFooter({ text: 'ReadyRoom Event'.padEnd(MAX_EMBED_WIDTH) + '\u200B' });
    }
  } else {
    // console.log('[CREATOR-DEBUG] No creator provided to createEventEmbed');
    // Use default footer for width consistency  
    embed.setFooter({ text: 'ReadyRoom Event'.padEnd(MAX_EMBED_WIDTH) + '\u200B' });
  }
  
  // Add header image if provided
  if (images) {
    if (images.headerImage && typeof images.headerImage === 'string') {
      embed.setImage(images.headerImage);
    } else if (images.imageUrl && typeof images.imageUrl === 'string') {
      // Fallback to legacy single image
      embed.setImage(images.imageUrl);
    }
  }
  
  return embed;
}

// Function to create additional image embeds
function createAdditionalImageEmbeds(images, mainEmbedUrl = 'https://readyroom.app') {
  const embeds = [];
  
  if (images && images.additionalImages && Array.isArray(images.additionalImages)) {
    images.additionalImages.forEach((imageUrl, index) => {
      if (imageUrl) {
        // Create embed with same URL as main embed and only image (Reddit method)
        const imageEmbed = new EmbedBuilder()
          .setURL(mainEmbedUrl)  // Same URL as main embed for grouping
          .setImage(imageUrl)
          .setColor(0x0099FF);
        embeds.push(imageEmbed);
      }
    });
  }
  
  return embeds;
}

// Function to create Google Calendar link
function createGoogleCalendarLink(title, description, startTime, endTime) {
  const encodedTitle = encodeURIComponent(title);
  const encodedDescription = encodeURIComponent(description);
  
  // Format dates for Google Calendar URL (in UTC format)
  const startTimeISO = startTime.toISOString().replace(/-|:|\.\d+/g, '');
  const endTimeISO = endTime.toISOString().replace(/-|:|\.\d+/g, '');
  
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodedTitle}&details=${encodedDescription}&dates=${startTimeISO}/${endTimeISO}`;
}

// Function to create attendance buttons
function createAttendanceButtons() {
  const acceptButton = new ButtonBuilder()
    .setCustomId('accept')
    .setLabel('Accept')
    .setStyle(ButtonStyle.Success);
  
  const declineButton = new ButtonBuilder()
    .setCustomId('decline')
    .setLabel('Decline')
    .setStyle(ButtonStyle.Danger);
  
  const tentativeButton = new ButtonBuilder()
    .setCustomId('tentative')
    .setLabel('Tentative')
    .setStyle(ButtonStyle.Primary);
  
  return new ActionRowBuilder().addComponents(acceptButton, tentativeButton, declineButton);
}

// Flag to track if the bot is logged in
let isLoggedIn = false;

// Function to ensure the bot is logged in
async function ensureLoggedIn() {
  if (!isLoggedIn) {
    console.log('Attempting to log in with token...', process.env.BOT_TOKEN ? 'Token exists' : 'Token is missing');
    
    await new Promise((resolve, reject) => {
      client.once('ready', () => {
        console.log(`Logged in as ${client.user.tag}`);
        isLoggedIn = true;
        
        // Load event responses when the bot is ready
        loadEventResponses();
        
        resolve();
      });
      
      client.login(process.env.BOT_TOKEN).catch(err => {
        console.error('Login error details:', err);
        reject(err);
      });
    });
  }
}

// Function to find a specified Discord channel by ID, no fallbacks
async function findEventsChannel(guildId = null, channelId = null) {
  await ensureLoggedIn();
  
  // If no guild ID is provided, throw an error
  if (!guildId) {
    throw new Error('Discord server ID (guildId) is required');
  }
  
  // Find the specified guild
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error(`Guild with ID ${guildId} not found. The bot might not be added to this server.`);
  }
  
  // If a channel ID is provided, try to find that specific channel
  if (channelId) {
    const specifiedChannel = guild.channels.cache.get(channelId);
    if (specifiedChannel) {
      console.log(`Using specified channel: ${specifiedChannel.name} (${channelId})`);
      return specifiedChannel;
    }
    
    // If the specified channel is not found, throw an error (no fallback)
    throw new Error(`Channel with ID ${channelId} not found in guild ${guild.name} (${guildId}). Please select a different channel in Discord Integration settings.`);
  }
  
  // If no channel ID is provided, throw an error
  throw new Error('Discord channel ID (channelId) is required. Please configure Discord Integration settings.');
}

// Function to edit a Discord event message
async function editEventMessage(messageId, title, description, eventTime, guildId = null, channelId = null, imageUrl = null, creator = null, images = null, eventOptions = {}) {
  try {
    await ensureLoggedIn();
    
    // If we don't have a channelId yet, try to find it in event responses
    if (!channelId && eventResponses.has(messageId)) {
      const eventData = eventResponses.get(messageId);
      if (eventData && eventData.channelId) {
        channelId = eventData.channelId;
        console.log(`Found channel ID ${channelId} from event responses for message ${messageId}`);
      }
    }
    
    // Find the specific channel using both guildId and channelId
    const eventsChannel = await findEventsChannel(guildId, channelId);
    
    try {
      // Try to fetch and edit the message
      const message = await eventsChannel.messages.fetch(messageId);
      if (message) {
        // Get existing responses from memory cache or database to preserve them
        let existingResponses = eventResponses.get(messageId);
        if (!existingResponses) {
          // Try to fetch responses from database
          try {
            const { supabase } = require('../server/supabaseClient');
            const { data: attendanceData, error: attendanceError } = await supabase
              .from('discord_event_attendance')
              .select('discord_id, discord_username, user_response')
              .eq('discord_event_id', messageId);
            
            if (!attendanceError && attendanceData) {
              existingResponses = {
                accepted: [],
                declined: [],
                tentative: []
              };
              
              // Populate with existing responses, including pilot record data for qualifications
              for (const record of attendanceData) {
                let pilotRecord = null;
                
                // Try to fetch pilot data for this user to preserve qualifications
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
                    .eq('discord_original_id', record.discord_id)
                    .single();
                  
                  if (!pilotError && pilotData) {
                    pilotRecord = {
                      id: pilotData.id,
                      callsign: pilotData.callsign,
                      boardNumber: pilotData.boardNumber?.toString() || '',
                      qualifications: pilotData.pilot_qualifications?.map(pq => pq.qualification?.name).filter(Boolean) || [],
                      currentStatus: { name: pilotData.status || 'Provisional' }
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
                  pilotRecord // Include the pilot record for qualification processing
                };
                
                if (record.user_response === 'accepted') {
                  existingResponses.accepted.push(userEntry);
                } else if (record.user_response === 'declined') {
                  existingResponses.declined.push(userEntry);
                } else if (record.user_response === 'tentative') {
                  existingResponses.tentative.push(userEntry);
                }
              }
              
              console.log(`[EDIT-RESPONSES] Restored ${attendanceData.length} responses from database with pilot data for event ${messageId}`);
            } else {
              console.log(`[EDIT-RESPONSES] No existing responses found in database for event ${messageId}`);
              existingResponses = {
                accepted: [],
                declined: [],
                tentative: []
              };
            }
          } catch (dbError) {
            console.warn(`[EDIT-RESPONSES] Error fetching responses from database:`, dbError);
            existingResponses = {
              accepted: [],
              declined: [],
              tentative: []
            };
          }
        }
        
        // Create the updated embed with images support and preserved responses
        const imageData = images || (imageUrl ? { imageUrl } : null);
        const eventEmbed = createEventEmbed(title, description, eventTime, existingResponses, creator, imageData, eventOptions);
        
        // Create additional image embeds with same URL for grouping
        const additionalEmbeds = createAdditionalImageEmbeds(imageData, 'https://readyroom.app');
        const allEmbeds = [eventEmbed, ...additionalEmbeds];
        
        // Edit the message with new content
        await message.edit({
          embeds: allEmbeds,
          components: message.components // Keep the existing buttons
        });
        
        // Update event data in memory with complete image and creator data
        if (eventResponses.has(messageId)) {
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
          // console.log('[EDIT-MEMORY-DEBUG] Updated in-memory event data for', messageId, 'with images:', images, 'creator:', creator);
        }
        
        console.log(`Successfully edited Discord message: ${messageId}`);
        return { success: true };
      }
    } catch (fetchError) {
      console.error(`Error fetching Discord message ${messageId} for edit:`, fetchError);
      // If message not found, we can't edit it
      if (fetchError.code === 10008) {
        console.log(`Message ${messageId} not found, cannot edit`);
        return { success: false, error: 'Message not found' };
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('Error editing Discord event message:', error);
    return { success: false, error: error.message || 'Unknown error editing message' };
  }
}

// Function to delete a Discord event message
async function deleteEventMessage(messageId, guildId = null, channelId = null) {
  try {
    await ensureLoggedIn();
    
    // If we don't have a channelId yet, try to find it in event responses
    if (!channelId && eventResponses.has(messageId)) {
      const eventData = eventResponses.get(messageId);
      if (eventData && eventData.channelId) {
        channelId = eventData.channelId;
        console.log(`Found channel ID ${channelId} from event responses for message ${messageId}`);
      }
    }
    
    // Find the specific channel using both guildId and channelId
    const eventsChannel = await findEventsChannel(guildId, channelId);
    
    try {
      // Try to fetch and delete the message
      const message = await eventsChannel.messages.fetch(messageId);
      if (message) {
        await message.delete();
        
        // Remove from event responses in memory only - no longer saving to file
        if (eventResponses.has(messageId)) {
          eventResponses.delete(messageId);
          // No need to call saveEventResponses() here as we're using the database for storage
        }
        
        console.log(`Successfully deleted Discord message: ${messageId}`);
        return { success: true };
      }
    } catch (fetchError) {
      console.error(`Error fetching Discord message ${messageId}:`, fetchError);
      // If message not found, consider it already deleted
      if (fetchError.code === 10008) {
        console.log(`Message ${messageId} already deleted or not found`);
        
        // Remove from event responses in memory only - no longer saving to file
        if (eventResponses.has(messageId)) {
          eventResponses.delete(messageId);
          // No need to call saveEventResponses() here as we're using the database for storage
        }
        
        return { success: true, alreadyDeleted: true };
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('Error deleting Discord event message:', error);
    return { success: false, error: error.message || 'Failed to delete message' };
  }
}

// Function to publish an event to Discord from the server
async function publishEventToDiscord(title, description, eventTime, guildId = null, channelId = null, imageUrl = null, creator = null, images = null, eventOptions = {}) {
  try {
    console.log(`[BOT-PUBLISH-START] Publishing event "${title}" to guild ${guildId}, channel ${channelId}`);
    
    // Make sure the bot is logged in
    await ensureLoggedIn();
    console.log(`[BOT-PUBLISH] Bot is logged in, guilds available: ${client.guilds.cache.size}`);
    
    // Find the specified channel, or fall back to events channel
    const eventsChannel = await findEventsChannel(guildId, channelId);
    console.log(`[BOT-PUBLISH] Found channel ${eventsChannel.name} (${eventsChannel.id}) in guild ${eventsChannel.guild.name} (${eventsChannel.guild.id})`);
    
    // Create the embed and buttons
    // Create the main event embed with images support
    const imageData = images || (imageUrl ? { imageUrl } : null);
    const eventEmbed = createEventEmbed(title, description, eventTime, {}, creator, imageData, eventOptions);
    const buttons = createAttendanceButtons();
    
    // Create additional image embeds with same URL for grouping
    const additionalEmbeds = createAdditionalImageEmbeds(imageData, 'https://readyroom.app');
    const allEmbeds = [eventEmbed, ...additionalEmbeds];
    
    if (imageData) {
      console.log(`[BOT-PUBLISH] Adding images to embed:`, {
        headerImage: imageData.headerImage || imageData.imageUrl || 'none',
        additionalImages: imageData.additionalImages?.length || 0
      });
      console.log(`[BOT-PUBLISH] Total embeds being sent: ${allEmbeds.length} (1 main + ${additionalEmbeds.length} additional)`);
    }
    
    // Send the event message
    console.log(`[BOT-PUBLISH] About to send message to channel ${eventsChannel.name} (${eventsChannel.id}) in guild ${eventsChannel.guild.name} (${eventsChannel.guild.id})`);
    
    const eventMessage = await eventsChannel.send({
      embeds: allEmbeds,
      components: [buttons]
    });
    
    console.log(`[BOT-PUBLISH-SUCCESS] Message ${eventMessage.id} successfully sent to ${eventsChannel.guild.name} (#${eventsChannel.name})`);
      // Store response data
    const eventData = {
      title,
      description,
      eventTime,
      guildId: eventsChannel.guild.id, // Store the guild ID
      channelId: eventsChannel.id, // Store the channel ID
      imageUrl: imageUrl, // Store the image URL to preserve it during updates
      images: imageData, // Store the complete image data structure
      creator: creator, // Store the creator information
      accepted: [],
      declined: [],
      tentative: []
    };
    
    // Add to in-memory cache only - no longer saving to file
    eventResponses.set(eventMessage.id, eventData);
    
    console.log(`Event published to Discord: "${title}" in channel #${eventsChannel.name} (${eventsChannel.id}) in guild ${eventsChannel.guild.name} (${eventsChannel.guild.id})`);
    
    return {
      success: true,
      messageId: eventMessage.id,
      guildId: eventsChannel.guild.id,
      channelId: eventsChannel.id
    };
  } catch (error) {
    console.error(`[BOT-PUBLISH] Error publishing event to Discord guild ${guildId}, channel ${channelId}:`, error);
    
    // Provide more specific error messages
    if (error.code === 50013) {
      throw new Error(`Bot lacks permissions to send messages in channel ${channelId}`);
    } else if (error.code === 10003) {
      throw new Error(`Channel ${channelId} not found in guild ${guildId}`);
    } else if (error.code === 50001) {
      throw new Error(`Bot lacks access to guild ${guildId}`);
    }
    
    throw error;
  }
}

// Handle button interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  
  const { customId, message, user } = interaction;
  const eventId = message.id;
  const displayName = interaction.member.displayName;
  const userId = user.id;
    // Always get fresh event data from database to ensure correct timing
  let eventData = eventResponses.get(eventId);
  let freshEventTime = null;
  
  // Try to get fresh event data from the database for timing
  const { event: dbEvent, error: dbEventError } = await getEventByDiscordId(eventId);
  if (!dbEventError && dbEvent) {
    // Database stores times in UTC, but we need to treat them as UTC Date objects
    // The Date constructor properly handles ISO strings with timezone info
    freshEventTime = {
      start: dbEvent.start_datetime ? new Date(dbEvent.start_datetime) : new Date(),
      end: dbEvent.end_datetime ? new Date(dbEvent.end_datetime) : new Date(new Date().getTime() + (60 * 60 * 1000))
    };
    
    // console.log(`[TIMING-DEBUG] Database times: start=${dbEvent.start_datetime}, end=${dbEvent.end_datetime}`);
    // console.log(`[TIMING-DEBUG] Parsed times: start=${freshEventTime.start.toISOString()}, end=${freshEventTime.end.toISOString()}`);
  }
  
  if (!eventData) {
    // console.log(`[PATH-DEBUG] No event data found in memory for message ID: ${eventId}, creating from database...`);
    
    if (dbEvent) {
      console.log(`Found event data in database for message ID: ${eventId}`);
      // Create minimal event data structure from database record with complete image and creator data
      eventData = {
        title: dbEvent.name || dbEvent.title || 'Event',
        description: dbEvent.description || '',
        eventTime: freshEventTime,
        imageUrl: dbEvent.image_url, // Legacy single image
        images: {
          imageUrl: dbEvent.image_url, // Legacy fallback
          headerImage: dbEvent.header_image_url,
          additionalImages: dbEvent.additional_image_urls || []
        },
        creator: {
          boardNumber: dbEvent.creator_board_number || '',
          callsign: dbEvent.creator_call_sign || '',
          billet: dbEvent.creator_billet || ''
        },
        guildId: dbEvent.discord_guild_id,
        accepted: [],
        declined: [],
        tentative: []
      };
      
      // Store in memory for future interactions
      eventResponses.set(eventId, eventData);
    } else {
      console.log(`Could not find event data for message ID: ${eventId} in database either`);
      await interaction.reply({ content: 'Sorry, this event is no longer active. Please contact an administrator.', ephemeral: true });
      return;
    }
  } else {
    // console.log(`[PATH-DEBUG] Event data found in memory for message ID: ${eventId}, updating with fresh timing...`);
    // Update existing cached data with fresh timing info
    if (freshEventTime) {
      // console.log(`[TIMING-DEBUG] Before update - cached eventTime: start=${eventData.eventTime?.start?.toISOString()}, end=${eventData.eventTime?.end?.toISOString()}`);
      eventData.eventTime = freshEventTime;
      // console.log(`[TIMING-DEBUG] After update - cached eventTime: start=${eventData.eventTime.start.toISOString()}, end=${eventData.eventTime.end.toISOString()}`);
      console.log(`[TIMING-FIX] Updated cached event data with fresh timing for message ${eventId}`);
    } else {
      // console.log(`[PATH-DEBUG] No fresh event time available from database for message ${eventId}`);
    }
  }
  
  // Map Discord status to database response type
  let userResponse;
  if (customId === 'accept') {
    userResponse = 'accepted';
  } else if (customId === 'decline') {
    userResponse = 'declined';
  } else if (customId === 'tentative') {
    userResponse = 'tentative';
  }

  // Get event details from database
  const { event, error: eventError } = await getEventByDiscordId(eventId);
  
  if (eventError) {
    console.warn(`Warning: Could not find event for Discord message ${eventId}: ${eventError}`);
  }
  
  // Store the attendance in Supabase
  if (userResponse) {
    try {
      const { data, error } = await upsertEventAttendance({
        discordEventId: eventId,
        discordUserId: userId,
        discordUsername: displayName,
        userResponse
      });
      
      if (error) {
        console.error('Error saving attendance to database:', error);
      } else {
        console.log(`Successfully saved ${userResponse} response for ${displayName} in database`);
      }
    } catch (err) {
      console.error('Unexpected error saving attendance:', err);
    }
  }
  
  // Update in-memory event data for Discord UI
  // Remove user from all response lists by user ID
  eventData.accepted = eventData.accepted.filter(entry => 
    typeof entry === 'string' ? entry !== user.username : entry.userId !== userId
  );
  eventData.declined = eventData.declined.filter(entry => 
    typeof entry === 'string' ? entry !== user.username : entry.userId !== userId
  );
  eventData.tentative = eventData.tentative.filter(entry => 
    typeof entry === 'string' ? entry !== user.username : entry.userId !== userId
  );
  
  // Fetch pilot data from database to get qualifications, board number, etc.
  let pilotRecord = null;
  try {
    const { supabase } = require('../server/supabaseClient');
    
    // Try to find pilot by Discord ID
    const { data: pilotData, error: pilotError } = await supabase
      .from('pilots')
      .select(`
        *,
        pilot_qualifications(
          qualification_id,
          qualification:qualifications(name)
        )
      `)
      .eq('discord_original_id', userId)
      .single();
    
    if (!pilotError && pilotData) {
      pilotRecord = {
        id: pilotData.id,
        callsign: pilotData.callsign,
        boardNumber: pilotData.boardNumber?.toString() || '',
        qualifications: pilotData.pilot_qualifications?.map(pq => pq.qualification?.name).filter(Boolean) || [],
        currentStatus: { name: pilotData.status || 'Provisional' } // Simplified status mapping
      };
      console.log(`[PILOT-DATA] Found pilot record for ${displayName}:`, pilotRecord);
    } else {
      console.log(`[PILOT-DATA] No pilot record found for Discord ID ${userId}`);
    }
  } catch (error) {
    console.warn(`[PILOT-DATA] Error fetching pilot data for ${displayName}:`, error.message);
  }

  // Add user to appropriate response list with both ID, display name, and pilot data
  const userEntry = { 
    userId, 
    displayName,
    boardNumber: pilotRecord?.boardNumber || '',
    callsign: pilotRecord?.callsign || displayName,
    pilotRecord // Include the full pilot record for qualification processing
  };
  
  // Load existing responses from database before adding new one
  if (dbEvent) {
    try {
      const { data: existingAttendance, error: attendanceError } = await supabase
        .from('discord_event_attendance')
        .select('*')
        .eq('discord_event_id', eventId);
      
      if (!attendanceError && existingAttendance) {
        // Reset response arrays
        eventData.accepted = [];
        eventData.declined = [];
        eventData.tentative = [];
        
        // Populate with existing responses, including pilot record data for qualifications
        for (const record of existingAttendance) {
          let pilotRecord = null;
          
          // Try to fetch pilot data for this user to preserve qualifications
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
              .eq('discord_original_id', record.discord_id)
              .single();
            
            if (!pilotError && pilotData) {
              pilotRecord = {
                id: pilotData.id,
                callsign: pilotData.callsign,
                boardNumber: pilotData.boardNumber?.toString() || '',
                qualifications: pilotData.pilot_qualifications?.map(pq => pq.qualification?.name).filter(Boolean) || [],
                currentStatus: { name: pilotData.status || 'Provisional' }
              };
            }
          } catch (error) {
            console.warn(`[PILOT-DATA] Error fetching pilot data for existing response ${record.discord_id}:`, error.message);
          }
          
          const existingUserEntry = {
            userId: record.discord_id,
            displayName: record.discord_username || 'Unknown User',
            boardNumber: pilotRecord?.boardNumber || '',
            callsign: pilotRecord?.callsign || record.discord_username || 'Unknown User',
            pilotRecord // Include the pilot record for qualification processing
          };
          
          if (record.user_response === 'accepted') {
            eventData.accepted.push(existingUserEntry);
          } else if (record.user_response === 'declined') {
            eventData.declined.push(existingUserEntry);
          } else if (record.user_response === 'tentative') {
            eventData.tentative.push(existingUserEntry);
          }
        }
        
        // console.log(`[RESPONSES-DEBUG] Loaded ${existingAttendance.length} existing responses from database`);
      }
    } catch (error) {
      console.warn(`[RESPONSES-DEBUG] Error loading existing responses: ${error.message}`);
    }
  }
  
  // Add or update the current user's response
  // First remove any existing response from this user
  eventData.accepted = eventData.accepted.filter(u => u.userId !== userId);
  eventData.declined = eventData.declined.filter(u => u.userId !== userId);
  eventData.tentative = eventData.tentative.filter(u => u.userId !== userId);
  
  // Then add the new response
  if (customId === 'accept') {
    eventData.accepted.push(userEntry);
  } else if (customId === 'decline') {
    eventData.declined.push(userEntry);
  } else if (customId === 'tentative') {
    eventData.tentative.push(userEntry);
  }
  // Fetch fresh event data from database and extract all embed data using unified logic
  let embedData = null;
  try {
    const { event: dbEvent } = await getEventByDiscordId(eventId);
    if (dbEvent) {
      embedData = extractEmbedDataFromDatabaseEvent(dbEvent);
      // console.log('[BUTTON-UNIFIED-DEBUG] Using fresh database embed data');
    } else {
      console.warn('[BUTTON-UNIFIED-DEBUG] No database event found for', eventId);
    }
  } catch (error) {
    console.warn('[BUTTON-UNIFIED-DEBUG] Error fetching database event:', error);
  }
  
  // Fallback to in-memory data if database fetch failed
  if (!embedData) {
    // console.log('[BUTTON-UNIFIED-DEBUG] Using fallback in-memory data');
    embedData = {
      title: eventData.title,
      description: eventData.description,
      eventTime: eventData.eventTime,
      imageData: eventData.images || null,
      creatorInfo: eventData.creator || null,
      eventOptions: { trackQualifications: false, eventType: null }
    };
  }
  
  // console.log('[BUTTON-UNIFIED-DEBUG] Final embed data:', {
  //   title: embedData.title,
  //   hasImages: !!embedData.imageData,
  //   imageCount: embedData.imageData ? (embedData.imageData.additionalImages?.length || 0) + (embedData.imageData.headerImage ? 1 : 0) : 0,
  //   hasCreator: !!embedData.creatorInfo,
  //   creator: embedData.creatorInfo
  // });
  
  const updatedEmbed = createEventEmbed(
    embedData.title, 
    embedData.description, 
    embedData.eventTime, 
    eventData, // responses 
    embedData.creatorInfo, 
    embedData.imageData, 
    embedData.eventOptions
  );
  
  // Create additional image embeds with same URL for grouping
  const additionalEmbeds = createAdditionalImageEmbeds(embedData.imageData, 'https://readyroom.app');
  const allEmbeds = [updatedEmbed, ...additionalEmbeds];
  
  await interaction.update({
    embeds: allEmbeds,
    components: [createAttendanceButtons()]
  });
  
  // No need to call saveEventResponses() here as we're using the database directly
  // for storing attendance data via the upsertEventAttendance() function call above
  
  console.log(`${displayName} (${userId}) responded ${customId} to event: ${eventData.title}`);
});

// Function to initialize the Discord bot connection
async function initializeDiscordBot() {
  try {
    // This will ensure the bot is logged in and event responses are loaded
    await ensureLoggedIn();
    
    // Start the countdown update manager
    await countdownManager.start();
    
    return true;
  } catch (error) {
    console.error('Error initializing Discord bot:', error);
    throw error;
  }
}

// Function to get attendance for an event
async function getEventAttendance(discordMessageId) {
  return eventResponses.get(discordMessageId) || null;
}

// Function to get available Discord servers (guilds)
async function getAvailableGuilds() {
  try {
    await ensureLoggedIn();
    
    // Map guilds to a simpler structure
    const guilds = Array.from(client.guilds.cache.values()).map(guild => ({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      icon: guild.iconURL({ dynamic: true }),
      hasEventsChannel: !!guild.channels.cache.find(
        channel => channel.name === 'events' && channel.type === 0
      )
    }));
    
    return { guilds, error: null };
  } catch (error) {
    console.error('Error fetching available guilds:', error);
    return { guilds: [], error: error.message || 'Unknown error fetching guilds' };
  }
}

// Function to get Discord guild roles
async function getGuildRoles(guildId) {
  try {
    await ensureLoggedIn();
    
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return { roles: [], error: `Guild with ID ${guildId} not found or bot not added to server` };
    }

    // Fetch roles
    const roles = Array.from(guild.roles.cache.values())
      .filter(role => role.name !== '@everyone') // Filter out @everyone role
      .map(role => ({
        id: role.id,
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        position: role.position,
        permissions: role.permissions.bitfield.toString(),
        managed: role.managed,
        mentionable: role.mentionable
      }))
      .sort((a, b) => b.position - a.position); // Sort by position (highest first)

    console.log(`[DISCORD-ROLES] Fetched ${roles.length} roles for guild ${guild.name}`);
    return { roles, error: null };
  } catch (error) {
    console.error(`[DISCORD-ROLES] Error fetching roles for guild ${guildId}:`, error);
    return { roles: [], error: error.message || 'Unknown error fetching roles' };
  }
}

// Function to get Discord guild member information and roles
async function getGuildMember(guildId, userId) {
  try {
    await ensureLoggedIn();
    
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return { member: null, roles: [], error: `Guild with ID ${guildId} not found or bot not added to server` };
    }

    // Fetch the member
    let member;
    try {
      member = await guild.members.fetch(userId);
    } catch (fetchError) {
      return { member: null, roles: [], error: `User with ID ${userId} not found in guild ${guild.name}` };
    }

    // Get all guild roles for mapping
    const allRoles = Array.from(guild.roles.cache.values())
      .filter(role => role.name !== '@everyone')
      .map(role => ({
        id: role.id,
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        position: role.position,
        permissions: role.permissions.bitfield.toString(),
        managed: role.managed,
        mentionable: role.mentionable
      }));

    // Format member data
    const memberData = {
      user: {
        id: member.user.id,
        username: member.user.username,
        discriminator: member.user.discriminator,
        avatar: member.user.avatar
      },
      nick: member.nickname,
      roles: member.roles.cache.map(role => role.id),
      joined_at: member.joinedAt?.toISOString(),
      premium_since: member.premiumSince?.toISOString()
    };

    console.log(`[DISCORD-MEMBER] Fetched member data for ${member.user.username} in guild ${guild.name}`);
    return { member: memberData, roles: allRoles, error: null };
  } catch (error) {
    console.error(`[DISCORD-MEMBER] Error fetching member ${userId} in guild ${guildId}:`, error);
    return { member: null, roles: [], error: error.message || 'Unknown error fetching member' };
  }
}

// Countdown Update Manager
class CountdownUpdateManager {
  constructor() {
    this.updateTimeouts = new Map(); // Map of messageId -> timeout
    this.isRunning = false;
  }

  // Calculate the next update interval based on time until event
  async calculateUpdateInterval(eventStartTime, referenceTimezone = 'America/New_York') {
    try {
      // Use UTC timestamps for accurate time calculations
      const nowUtc = new Date();
      const eventStartUtc = new Date(eventStartTime);
      
      // Calculate raw time difference
      const timeUntilEvent = eventStartUtc.getTime() - nowUtc.getTime();
      const hoursUntil = timeUntilEvent / (1000 * 60 * 60);

      // Log timezone info for debugging
      const nowInTimezone = formatInTimeZone(nowUtc, referenceTimezone, "yyyy-MM-dd HH:mm:ss zzz");
      const eventInTimezone = formatInTimeZone(eventStartUtc, referenceTimezone, "yyyy-MM-dd HH:mm:ss zzz");
      
      // console.log(`[COUNTDOWN] Time calculation: now=${nowInTimezone}, event=${eventInTimezone}, hoursUntil=${hoursUntil.toFixed(2)}, timezone=${referenceTimezone}`);

      if (hoursUntil <= 0) {
        // Event started or finished, stop updates
        return null;
      } else if (hoursUntil <= 1) {
        // Within 1 hour: update every minute
        return 1 * 60 * 1000; // 1 minute
      } else if (hoursUntil <= 6) {
        // Within 6 hours: update every 15 minutes
        return 15 * 60 * 1000; // 15 minutes
      } else if (hoursUntil <= 24) {
        // Within 24 hours: update every hour
        return 60 * 60 * 1000; // 1 hour
      } else {
        // More than 24 hours: update once per day
        return 24 * 60 * 60 * 1000; // 24 hours
      }
    } catch (error) {
      console.error(`[COUNTDOWN] Error calculating update interval: ${error.message}`);
      // Fallback to UTC comparison
      const now = new Date();
      const timeUntilEvent = new Date(eventStartTime) - now;
      const hoursUntil = timeUntilEvent / (1000 * 60 * 60);
      
      if (hoursUntil <= 0) return null;
      else if (hoursUntil <= 1) return 1 * 60 * 1000;
      else if (hoursUntil <= 6) return 15 * 60 * 1000;
      else if (hoursUntil <= 24) return 60 * 60 * 1000;
      else return 24 * 60 * 60 * 1000;
    }
  }

  // Schedule countdown update for a specific event
  async scheduleEventUpdate(eventData, messageId, guildId, channelId, referenceTimezone = 'America/New_York') {
    // Clear existing timeout if any
    if (this.updateTimeouts.has(messageId)) {
      clearTimeout(this.updateTimeouts.get(messageId));
    }

    const startTime = new Date(eventData.start_datetime);
    const endTime = new Date(eventData.end_datetime || eventData.end_time);

    // Use UTC-based comparison for finished check (DST-safe)
    const nowUtc = new Date();
    
    // Don't schedule updates for events that have already finished
    if (nowUtc > endTime) {
      const nowInTimezone = formatInTimeZone(nowUtc, referenceTimezone, "yyyy-MM-dd HH:mm:ss zzz");
      const endTimeInTimezone = formatInTimeZone(endTime, referenceTimezone, "yyyy-MM-dd HH:mm:ss zzz");
      console.log(`[COUNTDOWN] Event ${messageId} has finished (now: ${nowInTimezone} > end: ${endTimeInTimezone}), not scheduling updates`);
      return;
    }

    const updateInterval = await this.calculateUpdateInterval(startTime, referenceTimezone);
    
    if (!updateInterval) {
      console.log(`[COUNTDOWN] Event ${messageId} has started, stopping countdown updates`);
      return;
    }

    // console.log(`[COUNTDOWN] Scheduling update for event ${messageId} in ${updateInterval / 1000} seconds`);

    const timeoutId = setTimeout(async () => {
      try {
        // Fetch fresh event data from database before updating
        let freshEventData = eventData;
        try {
          const { event: dbEvent } = await getEventByDiscordId(messageId);
          if (dbEvent) {
            freshEventData = dbEvent;
            // console.log(`[COUNTDOWN] Using fresh event data for ${messageId}`);
          } else {
            // console.log(`[COUNTDOWN] Could not fetch fresh event data for ${messageId}, using cached data`);
          }
        } catch (fetchError) {
          console.warn(`[COUNTDOWN] Error fetching fresh event data for ${messageId}:`, fetchError.message);
        }
        
        await this.updateEventCountdown(freshEventData, messageId, guildId, channelId, referenceTimezone);
        // Reschedule the next update with fresh data
        this.scheduleEventUpdate(freshEventData, messageId, guildId, channelId, referenceTimezone);
      } catch (error) {
        console.error(`[COUNTDOWN] Error updating event ${messageId}:`, error);
      }
    }, updateInterval);

    this.updateTimeouts.set(messageId, timeoutId);
  }

  // Update the countdown for a specific event
  async updateEventCountdown(eventData, messageId, guildId, channelId) {
    try {
      await ensureLoggedIn();

      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        console.error(`[COUNTDOWN] Guild ${guildId} not found`);
        return;
      }

      const channel = guild.channels.cache.get(channelId);
      if (!channel) {
        console.error(`[COUNTDOWN] Channel ${channelId} not found in guild ${guildId}`);
        return;
      }

      try {
        const message = await channel.messages.fetch(messageId);
        if (!message) {
          console.error(`[COUNTDOWN] Message ${messageId} not found`);
          return;
        }

        // Get existing responses from memory cache or database to preserve them
        let currentResponses = eventResponses.get(messageId);
        if (!currentResponses) {
          // Try to fetch responses from database
          try {
            const { supabase } = require('../server/supabaseClient');
            const { data: attendanceData, error: attendanceError } = await supabase
              .from('discord_event_attendance')
              .select('discord_id, discord_username, user_response')
              .eq('discord_event_id', messageId);
            
            if (!attendanceError && attendanceData) {
              currentResponses = {
                accepted: [],
                declined: [],
                tentative: []
              };
              
              // Populate with existing responses, including pilot record data for qualifications
              for (const record of attendanceData) {
                let pilotRecord = null;
                
                // Try to fetch pilot data for this user to preserve qualifications
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
                    .eq('discord_original_id', record.discord_id)
                    .single();
                  
                  if (!pilotError && pilotData) {
                    pilotRecord = {
                      id: pilotData.id,
                      callsign: pilotData.callsign,
                      boardNumber: pilotData.boardNumber?.toString() || '',
                      qualifications: pilotData.pilot_qualifications?.map(pq => pq.qualification?.name).filter(Boolean) || [],
                      currentStatus: { name: pilotData.status || 'Provisional' }
                    };
                  }
                } catch (error) {
                  console.warn(`[COUNTDOWN-PILOT-DATA] Error fetching pilot data for ${record.discord_id}:`, error.message);
                }
                
                const userEntry = {
                  userId: record.discord_id,
                  displayName: record.discord_username || 'Unknown User',
                  boardNumber: pilotRecord?.boardNumber || '',
                  callsign: pilotRecord?.callsign || record.discord_username || 'Unknown User',
                  pilotRecord // Include the pilot record for qualification processing
                };
                
                if (record.user_response === 'accepted') {
                  currentResponses.accepted.push(userEntry);
                } else if (record.user_response === 'declined') {
                  currentResponses.declined.push(userEntry);
                } else if (record.user_response === 'tentative') {
                  currentResponses.tentative.push(userEntry);
                }
              }
              
              console.log(`[COUNTDOWN-RESPONSES] Restored ${attendanceData.length} responses from database with pilot data for event ${messageId}`);
            } else {
              console.log(`[COUNTDOWN-RESPONSES] No existing responses found in database for event ${messageId}`);
              currentResponses = {
                accepted: [],
                declined: [],
                tentative: []
              };
            }
          } catch (dbError) {
            console.warn(`[COUNTDOWN-RESPONSES] Error fetching responses from database:`, dbError);
            currentResponses = {
              accepted: [],
              declined: [],
              tentative: []
            };
          }
        }

        // Extract all embed data using unified logic
        const embedData = extractEmbedDataFromDatabaseEvent(eventData);
        
        // console.log('[COUNTDOWN-UNIFIED-DEBUG] Using unified embed data:', {
        //   title: embedData.title,
        //   hasImages: !!embedData.imageData,
        //   imageCount: embedData.imageData ? (embedData.imageData.additionalImages?.length || 0) + (embedData.imageData.headerImage ? 1 : 0) : 0,
        //   hasCreator: !!embedData.creatorInfo,
        //   creator: embedData.creatorInfo
        // });
        
        const updatedEmbed = createEventEmbed(
          embedData.title,
          embedData.description,
          embedData.eventTime,
          currentResponses,
          embedData.creatorInfo,
          embedData.imageData,
          embedData.eventOptions
        );

        // Create additional image embeds
        const additionalEmbeds = createAdditionalImageEmbeds(embedData.imageData, 'https://readyroom.app');
        const allEmbeds = [updatedEmbed, ...additionalEmbeds];

        // Update the message with all embeds
        await message.edit({
          embeds: allEmbeds,
          components: message.components // Keep existing buttons
        });

        // console.log(`[COUNTDOWN] Successfully updated countdown for event ${messageId}`);
      } catch (fetchError) {
        if (fetchError.code === 10008) {
          // console.log(`[COUNTDOWN] Message ${messageId} not found, removing from update schedule`);
          this.clearEventUpdate(messageId);
        } else {
          throw fetchError;
        }
      }
    } catch (error) {
      console.error(`[COUNTDOWN] Error updating countdown for event ${messageId}:`, error);
    }
  }

  // Start the countdown manager
  async start() {
    if (this.isRunning) {
      // console.log('[COUNTDOWN] Manager already running');
      return;
    }

    this.isRunning = true;
    console.log('[COUNTDOWN] Starting countdown update manager');

    try {
      // Get reference timezone from settings
      let referenceTimezone = 'America/New_York'; // Default to EDT
      
      try {
        // Try to get the timezone from squadron settings
        const { data: timezoneData } = await supabase
          .from('squadron_settings')
          .select('value')
          .eq('key', 'reference_timezone')
          .single();
        
        if (timezoneData?.value) {
          referenceTimezone = timezoneData.value;
          // console.log(`[COUNTDOWN] Using reference timezone: ${referenceTimezone}`);
        } else {
          // console.log(`[COUNTDOWN] No timezone setting found, using default: ${referenceTimezone}`);
        }
      } catch (tzError) {
        console.warn(`[COUNTDOWN] Error getting timezone setting, using default: ${tzError.message}`);
      }

      // Load all active events from database
      const { data: events, error } = await supabase
        .from('events')
        .select('*')
        .not('discord_event_id', 'is', null)
        .gte('end_datetime', new Date().toISOString()); // Only events that haven't finished

      if (error) {
        console.error('[COUNTDOWN] Error loading events:', error);
        return;
      }

      // Schedule updates for each event
      for (const event of events) {
        if (!event.discord_event_id) continue;

        // Handle both old format (single string) and new format (JSONB array)
        let messageIds = [];
        if (typeof event.discord_event_id === 'string') {
          messageIds = [{ messageId: event.discord_event_id, guildId: event.discord_guild_id }];
        } else if (Array.isArray(event.discord_event_id)) {
          messageIds = event.discord_event_id.filter(entry => entry.messageId);
        }

        for (const { messageId, guildId, channelId } of messageIds) {
          if (messageId) {
            this.scheduleEventUpdate(event, messageId, guildId, channelId, referenceTimezone);
          }
        }
      }

      // console.log(`[COUNTDOWN] Scheduled updates for ${events.length} active events with timezone ${referenceTimezone}`);
    } catch (error) {
      console.error('[COUNTDOWN] Error starting countdown manager:', error);
    }
  }

  // Stop the countdown manager
  stop() {
    console.log('[COUNTDOWN] Stopping countdown update manager');
    this.isRunning = false;
    
    // Clear all timeouts
    for (const [messageId, timeoutId] of this.updateTimeouts) {
      clearTimeout(timeoutId);
    }
    this.updateTimeouts.clear();
  }

  // Clear update for a specific event
  clearEventUpdate(messageId) {
    if (this.updateTimeouts.has(messageId)) {
      clearTimeout(this.updateTimeouts.get(messageId));
      this.updateTimeouts.delete(messageId);
      // console.log(`[COUNTDOWN] Cleared updates for event ${messageId}`);
    }
  }

  // Add new event to update schedule
  addEventToSchedule(eventData, messageId, guildId, channelId) {
    if (this.isRunning) {
      this.scheduleEventUpdate(eventData, messageId, guildId, channelId);
    }
  }
}

// Create global countdown manager instance
const countdownManager = new CountdownUpdateManager();

/**
 * Send reminder message to a Discord channel
 */
async function sendReminderMessage(guildId, channelId, message) {
  try {
    console.log(`[REMINDER] Sending reminder to guild ${guildId}, channel ${channelId}`);
    
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      throw new Error(`Guild ${guildId} not found`);
    }
    
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Channel ${channelId} not found or not a text channel`);
    }
    
    await channel.send(message);
    
    console.log(`[REMINDER] Successfully sent reminder to ${guild.name}/#${channel.name}`);
    return { success: true };
    
  } catch (error) {
    console.error(`[REMINDER] Error sending reminder:`, error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  publishEventToDiscord,
  getEventAttendance,
  initializeDiscordBot,
  registerEventUpdateCallback,
  deleteEventMessage,
  editEventMessage,
  getAvailableGuilds,
  countdownManager,
  sendReminderMessage,
  getGuildRoles,
  getGuildMember
};