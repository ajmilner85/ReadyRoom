/**
 * DISCORD BOT LAUNCHER FOR FLY.IO DEPLOYMENT
 * 
 * PURPOSE: Minimal Discord bot process launcher for cloud deployment
 * 
 * RESPONSIBILITIES:
 * - Load environment variables
 * - Initialize Discord bot from discordBot.js
 * - Keep bot process alive for Fly.io
 * - Handle graceful shutdown
 * 
 * WHAT THIS FILE SHOULD NEVER HAVE:
 * - Express server or API endpoints
 * - Business logic or database operations
 * - Duplicate code from server/index.js
 * - Reminder processing or event deletion logic
 * 
 * NOTE: This file exists solely to deploy the Discord bot to Fly.io.
 * All application logic should be in server/index.js
 */

const path = require('path');
const dotenv = require('dotenv');

// Load environment variables - prioritize .env.local for development
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

const { initializeDiscordBot } = require('./discordBot');

console.log('Environment variables loaded, BOT_TOKEN present:', !!process.env.BOT_TOKEN);
console.log('BOT_TOKEN starts with:', process.env.BOT_TOKEN ? process.env.BOT_TOKEN.substring(0, 5) + '...' : 'undefined');

// Initialize Discord bot
(async function() {
  try {
    console.log('Initializing Discord bot...');
    await initializeDiscordBot();
    console.log('Discord bot initialized successfully');
    
    // Keep the process alive
    console.log('Discord bot is running and ready to receive events');
  } catch (error) {
    console.error('Failed to initialize Discord bot:', error);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down Discord bot gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down Discord bot gracefully...');
  process.exit(0);
});