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
  initializeDiscordBot,
  switchDiscordBot
} = require('./discordBot');

// Import Supabase client (path adjusted for SDOBot directory)
const { supabase } = require('./supabaseClient');

// Import processor orchestrator (manages all background processors)
const { startProcessorOrchestrator } = require('./processors/processorOrchestrator');

// Import route modules
const healthRoutes = require('./routes/health');
const settingsRoutes = require('./routes/settings');
const discordHelpersRoutes = require('./routes/discordHelpers');
const flightPostsRoutes = require('./routes/flightPosts');
const eventsRoutes = require('./routes/events');

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
app.use('/api', eventsRoutes);

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

// Start server - listen on 0.0.0.0 for Fly.io
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ReadyRoom Combined Server running on 0.0.0.0:${PORT}`);
  console.log('Server ready to accept connections from Fly.io proxy');

  // Start the processor orchestrator (handles all background jobs)
  startProcessorOrchestrator();
});