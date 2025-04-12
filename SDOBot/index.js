require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { publishEventToDiscord } = require('./discordBot');

console.log('Starting SDOBot...');

// Simply import the bot functionality
// All the logic is now in discordBot.js
// This allows the bot to be used both standalone and by the server

// Export the required functions
module.exports = {
  publishEventToDiscord
};
