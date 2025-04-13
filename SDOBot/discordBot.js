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
const { upsertEventAttendance, getEventIdByDiscordId, getEventByDiscordId } = require('../server/supabaseClient');

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

// Path to store event responses
const EVENT_RESPONSES_FILE = path.join(__dirname, 'eventResponses.json');

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

// Function to load event responses from file
function loadEventResponses() {
  try {
    if (fs.existsSync(EVENT_RESPONSES_FILE)) {
      const data = JSON.parse(fs.readFileSync(EVENT_RESPONSES_FILE, 'utf8'));
      eventResponses = new Map(Object.entries(data));
      console.log(`Loaded ${eventResponses.size} events from storage`);
    }
  } catch (error) {
    console.error('Error loading event responses:', error);
  }
}

// Function to save event responses to file
function saveEventResponses() {
  try {
    const data = Object.fromEntries(eventResponses);
    fs.writeFileSync(EVENT_RESPONSES_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving event responses:', error);
  }
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

// Function to find the events channel by guild ID
async function findEventsChannel(guildId = null) {
  await ensureLoggedIn();
  
  // Get all guilds the bot is in
  const guilds = client.guilds.cache;
  
  if (guildId) {
    // If a specific guild ID is provided, use that guild
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error(`Guild with ID ${guildId} not found. The bot might not be added to this server.`);
    }
    
    const eventsChannel = guild.channels.cache.find(
      channel => channel.name === 'events' && channel.type === 0
    );
    
    if (eventsChannel) {
      return eventsChannel;
    }
    
    throw new Error(`Events channel not found in guild ${guild.name} (${guildId})`);
  } else {
    // If no specific guild ID is provided, search all guilds (backward compatibility)
    for (const [, guild] of guilds) {
      const eventsChannel = guild.channels.cache.find(
        channel => channel.name === 'events' && channel.type === 0
      );
      
      if (eventsChannel) {
        return eventsChannel;
      }
    }
  }
  
  throw new Error('Events channel not found in any guild');
}

// Function to delete a Discord event message
async function deleteEventMessage(messageId, guildId = null) {
  try {
    await ensureLoggedIn();
    
    // Find the events channel
    const eventsChannel = await findEventsChannel(guildId);
    
    try {
      // Try to fetch and delete the message
      const message = await eventsChannel.messages.fetch(messageId);
      if (message) {
        await message.delete();
        
        // Remove from event responses in memory and storage
        if (eventResponses.has(messageId)) {
          eventResponses.delete(messageId);
          saveEventResponses();
        }
        
        console.log(`Successfully deleted Discord message: ${messageId}`);
        return { success: true };
      }
    } catch (fetchError) {
      console.error(`Error fetching Discord message ${messageId}:`, fetchError);
      // If message not found, consider it already deleted
      if (fetchError.code === 10008) {
        console.log(`Message ${messageId} already deleted or not found`);
        
        // Still remove from our responses if it exists
        if (eventResponses.has(messageId)) {
          eventResponses.delete(messageId);
          saveEventResponses();
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
async function publishEventToDiscord(title, description, eventTime, guildId = null) {
  try {
    // Make sure the bot is logged in
    await ensureLoggedIn();
    
    // Find the events channel
    const eventsChannel = await findEventsChannel(guildId);
    
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
      accepted: [],
      declined: [],
      tentative: []
    };
    
    eventResponses.set(eventMessage.id, eventData);
    
    // Save updated event responses
    saveEventResponses();
    
    console.log(`Event published to Discord: ${title} in guild ${eventsChannel.guild.name} (${eventsChannel.guild.id})`);
    
    return {
      success: true,
      messageId: eventMessage.id,
      guildId: eventsChannel.guild.id
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
  
  // Save the updated responses
  saveEventResponses();
  
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