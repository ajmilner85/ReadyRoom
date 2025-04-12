const path = require('path');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { format, formatDistanceToNow } = require('date-fns');

// Load environment variables from the root .env file
const result = dotenv.config({ path: path.resolve(__dirname, '../.env') });

if (result.error) {
  console.error('Error loading .env file:', result.error);
}

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
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// Store event responses
const eventResponses = new Map();

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
        resolve();
      });
      
      client.login(process.env.BOT_TOKEN).catch(err => {
        console.error('Login error details:', err);
        reject(err);
      });
    });
  }
}

// Function to find the events channel
async function findEventsChannel() {
  await ensureLoggedIn();
  
  // Get all guilds the bot is in
  const guilds = client.guilds.cache;
  
  // Search each guild for the events channel
  for (const [, guild] of guilds) {
    const eventsChannel = guild.channels.cache.find(
      channel => channel.name === 'events' && channel.type === 0
    );
    
    if (eventsChannel) {
      return eventsChannel;
    }
  }
  
  throw new Error('Events channel not found in any guild');
}

// Function to publish an event to Discord from the server
async function publishEventToDiscord(title, description, eventTime) {
  try {
    // Make sure the bot is logged in
    await ensureLoggedIn();
    
    // Find the events channel
    const eventsChannel = await findEventsChannel();
    
    // Create the embed and buttons
    const eventEmbed = createEventEmbed(title, description, eventTime);
    const buttons = createAttendanceButtons();
    
    // Send the event message
    const eventMessage = await eventsChannel.send({
      embeds: [eventEmbed],
      components: [buttons]
    });
    
    // Store response data
    eventResponses.set(eventMessage.id, {
      title,
      description,
      eventTime,
      accepted: [],
      declined: [],
      tentative: []
    });
    
    console.log(`Event published to Discord: ${title}`);
    
    return {
      success: true,
      messageId: eventMessage.id
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
  if (!eventData) return;
  
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
  
  // Update the event message
  const updatedEmbed = createEventEmbed(eventData.title, eventData.description, eventData.eventTime, eventData);
  
  await interaction.update({
    embeds: [updatedEmbed],
    components: [createAttendanceButtons()]
  });
  
  console.log(`${displayName} (${userId}) responded ${customId} to event: ${eventData.title}`);
  
  // TODO: Send this data back to the ReadyRoom app
  // This would be implemented in the next phase
});

// Function to get attendance for an event
async function getEventAttendance(discordMessageId) {
  return eventResponses.get(discordMessageId) || null;
}

module.exports = {
  publishEventToDiscord,
  getEventAttendance
};