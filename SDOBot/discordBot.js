const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { format, formatDistanceToNow } = require('date-fns');

// Load environment variables from the root .env file
const result = dotenv.config({ path: path.resolve(__dirname, '../.env') });

if (result.error) {
  console.error('Error loading .env file:', result.error);
}

// Require Supabase client from server directory
const { supabase, upsertEventAttendance, getEventIdByDiscordId, getEventByDiscordId } = require('../server/supabaseClient');

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

// Function to load event responses from database
async function loadEventResponses() {  try {
    // Get all events with Discord message IDs from the database
    const { data, error } = await supabase
      .from('events')
      .select('id, name, description, start_datetime, end_datetime, discord_event_id, discord_guild_id, image_url')
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
        channelId: channelId,        // Store image URL from the database
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
    // Discord has a 1024 character limit per field value
    const content = `>>> ${formattedEntries.join('\n')}`;
    return content.length > 1020 ? `>>> ${formattedEntries.slice(0, 20).join('\n')}\n... and ${formattedEntries.length - 20} more` : content;
  };
  
  // Helper function to group by qualifications
  const groupByQualifications = (entries, isTraining = false) => {
    if (entries.length === 0) return '-';
    
    // If training event, divide into IP and Trainee
    if (isTraining) {
      const ips = entries.filter(entry => entry.pilotRecord?.currentStatus?.name === 'Command' || 
                                         entry.pilotRecord?.currentStatus?.name === 'Staff' ||
                                         entry.pilotRecord?.currentStatus?.name === 'Cadre');
      const trainees = entries.filter(entry => entry.pilotRecord?.currentStatus?.name === 'Provisional');
      
      let result = '';
      if (ips.length > 0) {
        const ipContent = ips.map(formatPilotEntry).join('\n');
        result += `**IP (${ips.length})**\n>>> ${ipContent}`;
      }
      if (trainees.length > 0) {
        if (result) result += '\n\n';
        const traineeContent = trainees.map(formatPilotEntry).join('\n');
        result += `**Trainee (${trainees.length})**\n>>> ${traineeContent}`;
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
        const qualContent = groups[qual].map(formatPilotEntry).join('\n');
        result += `**${qual} (${groups[qual].length})**\n>>> ${qualContent}`;
      }
    });
    
    if (unassigned.length > 0) {
      if (result) result += '\n\n';
      const unassignedContent = unassigned.map(formatPilotEntry).join('\n');
      result += `**Other (${unassigned.length})**\n>>> ${unassignedContent}`;
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
    const countdownString = `🕒 ${formatDistanceToNow(startTime, { addSuffix: true })}`;
    
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
  
  // Add creator information if provided
  if (creator) {
    console.log('[CREATOR-DEBUG] Creator object received:', creator);
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
    console.log('[CREATOR-DEBUG] Footer text:', footerText);
    if (footerText) {
      embed.setFooter({ text: `Created by ${footerText}` });
    }
  } else {
    console.log('[CREATOR-DEBUG] No creator provided to createEventEmbed');
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
  
  return new ActionRowBuilder().addComponents(acceptButton, declineButton, tentativeButton);
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
              
              // Group database responses by status
              attendanceData.forEach(record => {
                const userEntry = { 
                  userId: record.discord_id, 
                  displayName: record.discord_username 
                };
                
                if (record.user_response === 'accepted') {
                  existingResponses.accepted.push(userEntry);
                } else if (record.user_response === 'declined') {
                  existingResponses.declined.push(userEntry);
                } else if (record.user_response === 'tentative') {
                  existingResponses.tentative.push(userEntry);
                }
              });
              
              console.log(`[EDIT-RESPONSES] Restored ${attendanceData.length} responses from database for event ${messageId}`);
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
        
        // Update event data in memory
        if (eventResponses.has(messageId)) {
          const existingData = eventResponses.get(messageId);
          eventResponses.set(messageId, {
            ...existingData,
            title,
            description,
            eventTime,
            imageUrl: imageUrl || existingData.imageUrl
          });
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
    // Get event data from memory cache
  let eventData = eventResponses.get(eventId);
  if (!eventData) {
    console.log(`No event data found in memory for message ID: ${eventId}, attempting to retrieve from database...`);
    
    // Try to get event data from the database
    const { event, error: eventError } = await getEventByDiscordId(eventId);
    if (!eventError && event) {
      console.log(`Found event data in database for message ID: ${eventId}`);
      // Create minimal event data structure from database record
      eventData = {
        title: event.name || event.title || 'Event',
        description: event.description || '',        eventTime: {
          start: event.start_datetime ? new Date(event.start_datetime) : new Date(),
          end: event.end_datetime ? new Date(event.end_datetime) : new Date(new Date().getTime() + (60 * 60 * 1000))
        },
        imageUrl: event.image_url,
        guildId: event.discord_guild_id,
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
  
  if (customId === 'accept') {
    eventData.accepted.push(userEntry);
  } else if (customId === 'decline') {
    eventData.declined.push(userEntry);
  } else if (customId === 'tentative') {
    eventData.tentative.push(userEntry);
  }
    // Fetch event options and creator info from database for proper formatting
  let eventOptions = {};
  let creatorInfo = null;
  try {
    const { event: dbEvent } = await getEventByDiscordId(eventId);
    if (dbEvent) {
      eventOptions = {
        trackQualifications: dbEvent.track_qualifications || false,
        eventType: dbEvent.event_type || null
      };
      
      // Create creator info from database fields
      creatorInfo = {
        boardNumber: dbEvent.creator_board_number || '',
        callsign: dbEvent.creator_call_sign || '',
        billet: dbEvent.creator_billet || ''
      };
      
      console.log('[CREATOR-DEBUG] Creator info from database:', creatorInfo);
    }
  } catch (error) {
    console.warn('[WARNING] Could not fetch event options for button interaction:', error);
  }
  
  // Update the Discord event message
  const imageData = eventData.images || (eventData.imageUrl ? { imageUrl: eventData.imageUrl } : null);
  const updatedEmbed = createEventEmbed(eventData.title, eventData.description, eventData.eventTime, eventData, creatorInfo, imageData, eventOptions);
  
  // Create additional image embeds with same URL for grouping
  const additionalEmbeds = createAdditionalImageEmbeds(imageData, 'https://readyroom.app');
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

module.exports = {
  publishEventToDiscord,
  getEventAttendance,
  initializeDiscordBot,
  registerEventUpdateCallback,
  deleteEventMessage,
  editEventMessage,
  getAvailableGuilds
};