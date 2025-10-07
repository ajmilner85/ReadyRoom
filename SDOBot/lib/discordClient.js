/**
 * DISCORD CLIENT MODULE
 * Handles Discord client initialization, login, and channel operations
 */

const { Client, GatewayIntentBits } = require('discord.js');

let client = null;
let isLoggedIn = false;

/**
 * Initialize Discord client
 */
function initializeClient() {
  if (!client) {
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
      ]
    });
  }
  return client;
}

/**
 * Ensure the bot is logged in
 */
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

/**
 * Find a Discord channel by ID
 */
async function findEventsChannel(guildId, channelId) {
  await ensureLoggedIn();
  
  if (!guildId) {
    throw new Error('Discord server ID (guildId) is required');
  }
  
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error(`Guild with ID ${guildId} not found. The bot might not be added to this server.`);
  }
  
  if (channelId) {
    const specifiedChannel = guild.channels.cache.get(channelId);
    if (specifiedChannel) {
      console.log(`Using specified channel: ${specifiedChannel.name} (${channelId})`);
      return specifiedChannel;
    }
    
    throw new Error(`Channel with ID ${channelId} not found in guild ${guild.name} (${guildId}). Please select a different channel in Discord Integration settings.`);
  }
  
  throw new Error('Discord channel ID (channelId) is required. Please configure Discord Integration settings.');
}

/**
 * Get the Discord client instance
 */
function getClient() {
  if (!client) {
    throw new Error('Discord client not initialized. Call initializeClient() first.');
  }
  return client;
}

/**
 * Get login status
 */
function getIsLoggedIn() {
  return isLoggedIn;
}

/**
 * Set login status (for bot switching)
 */
function setIsLoggedIn(status) {
  isLoggedIn = status;
}

/**
 * Destroy the client (for bot switching)
 */
function destroyClient() {
  if (client) {
    client.destroy();
    client = null;
    isLoggedIn = false;
  }
}

module.exports = {
  initializeClient,
  ensureLoggedIn,
  findEventsChannel,
  getClient,
  getIsLoggedIn,
  setIsLoggedIn,
  destroyClient
};
