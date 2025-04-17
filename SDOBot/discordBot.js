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
async function loadEventResponses() {
  try {
    // Get all events with Discord message IDs from the database
    const { data, error } = await supabase
      .from('events')
      .select('id, name, description, start_datetime, end_datetime, discord_event_id, discord_guild_id')
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
        channelId: channelId,
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
function createEventEmbed(title, description, eventTime, responses = {}) {
  const accepted = responses.accepted || [];
  const declined = responses.declined || [];
  const tentative = responses.tentative || [];
  
  // Get display names for rendering
  const acceptedNames = accepted.map(entry => typeof entry === 'string' ? entry : entry.displayName);
  const declinedNames = declined.map(entry => typeof entry === 'string' ? entry : entry.displayName);
  const tentativeNames = tentative.map(entry => typeof entry === 'string' ? entry : entry.displayName);
  
  // Create the initial embed with title
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(title);
  
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
    { name: `Accepted (${acceptedNames.length})`, value: acceptedNames.length > 0 ? acceptedNames.join('\n') : '-', inline: true },
    { name: `Declined (${declinedNames.length})`, value: declinedNames.length > 0 ? declinedNames.join('\n') : '-', inline: true },
    { name: `Tentative (${tentativeNames.length})`, value: tentativeNames.length > 0 ? tentativeNames.join('\n') : '-', inline: true }
  )
  .setTimestamp();
  
  return embed;
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
async function publishEventToDiscord(title, description, eventTime, guildId = null, channelId = null) {
  try {
    // Make sure the bot is logged in
    await ensureLoggedIn();
    
    // Find the specified channel, or fall back to events channel
    const eventsChannel = await findEventsChannel(guildId, channelId);
    
    // Create the embed and buttons
    const eventEmbed = createEventEmbed(title, description, eventTime);
    const buttons = createAttendanceButtons();
    
    // Send the event message
    const eventMessage = await eventsChannel.send({
      embeds: [eventEmbed],
      components: [buttons]
    });
    
    // Store response data
    const eventData = {
      title,
      description,
      eventTime,
      guildId: eventsChannel.guild.id, // Store the guild ID
      channelId: eventsChannel.id, // Store the channel ID
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
    console.error('Error publishing event to Discord:', error);
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
  
  // Get event data
  const eventData = eventResponses.get(eventId);
  if (!eventData) {
    console.log(`No event data found for message ID: ${eventId}`);
    await interaction.reply({ content: 'Sorry, this event is no longer active. Please contact an administrator.', ephemeral: true });
    return;
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
  
  // Add user to appropriate response list with both ID and display name
  const userEntry = { userId, displayName };
  
  if (customId === 'accept') {
    eventData.accepted.push(userEntry);
  } else if (customId === 'decline') {
    eventData.declined.push(userEntry);
  } else if (customId === 'tentative') {
    eventData.tentative.push(userEntry);
  }
  
  // Update the Discord event message
  const updatedEmbed = createEventEmbed(eventData.title, eventData.description, eventData.eventTime, eventData);
  
  await interaction.update({
    embeds: [updatedEmbed],
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
  getAvailableGuilds
};