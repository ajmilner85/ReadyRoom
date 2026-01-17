/**
 * SETTINGS ROUTES
 *
 * PURPOSE: Handle application settings endpoints
 *
 * ENDPOINTS:
 * - POST /api/settings/timezone - Update reference timezone for squadrons
 * - POST /api/discord/switch-bot - Switch Discord bot token (dev only)
 *
 * DEPENDENCIES:
 * - Supabase client for database operations
 * - switchDiscordBot function for bot token switching
 *
 * USAGE:
 * Registered in main server: app.use('/api', settingsRoutes);
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../supabaseClient');
const { switchDiscordBot } = require('../discordBot');

// API endpoint to save reference timezone setting
router.post('/settings/timezone', async (req, res) => {
  try {
    const { timezone } = req.body;

    if (!timezone) {
      return res.status(400).json({ error: 'Timezone is required' });
    }

    // Update timezone setting for all squadrons (maintaining current global behavior)
    // Use raw SQL to update JSONB field since Supabase client doesn't handle JSONB updates well
    const { error } = await supabase
      .rpc('update_squadron_timezone', { new_timezone: timezone });

    if (error) {
      throw error;
    }

    console.log(`[SETTINGS] Updated reference timezone to: ${timezone}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[ERROR] Error saving timezone setting:', error);
    res.status(500).json({ error: error.message || 'Failed to save timezone setting' });
  }
});

// API endpoint to switch Discord bot token (local development only)
if (process.env.NODE_ENV !== 'production') {
  router.post('/discord/switch-bot', async (req, res) => {
    try {
      const { tokenType } = req.body;

      if (!tokenType || !['development', 'production'].includes(tokenType)) {
        return res.status(400).json({ error: 'Valid tokenType (development or production) is required' });
      }

      console.log(`[BOT-SWITCH] Switching to ${tokenType} Discord bot token...`);

      // Get the actual bot token from environment variables
      const botToken = tokenType === 'production'
        ? process.env.BOT_TOKEN_PROD || process.env.BOT_TOKEN
        : process.env.BOT_TOKEN_DEV;

      if (!botToken) {
        const error = `${tokenType} bot token not found in environment variables`;
        console.error(`[BOT-SWITCH] ${error}`);
        return res.status(500).json({ error });
      }

      // Call the bot switching function
      const result = await switchDiscordBot(botToken);

      if (result.success) {
        console.log(`[BOT-SWITCH] Successfully switched to ${tokenType} Discord bot: ${result.botInfo?.username}#${result.botInfo?.discriminator}`);
        res.json({
          success: true,
          message: `Discord bot switched to ${tokenType} successfully`,
          tokenType: tokenType,
          botInfo: result.botInfo
        });
      } else {
        console.error(`[BOT-SWITCH] Failed to switch Discord bot:`, result.error);
        res.status(500).json({
          error: result.error || 'Failed to switch Discord bot token'
        });
      }
    } catch (error) {
      console.error('[BOT-SWITCH] Error switching Discord bot token:', error);
      res.status(500).json({
        error: error.message || 'Failed to switch Discord bot token'
      });
    }
  });
}

module.exports = router;
