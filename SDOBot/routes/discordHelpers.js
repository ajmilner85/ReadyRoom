/**
 * DISCORD HELPERS ROUTES
 *
 * PURPOSE: Provide Discord data fetching endpoints for the frontend
 *
 * ENDPOINTS:
 * - GET /api/discord/guild-members - Fetch members of a Discord guild
 * - GET /api/discord/servers - List available Discord servers
 * - GET /api/discord/servers/:guildId/channels - Get channels for a server
 * - GET /api/discord/guild/:guildId/roles - Get roles for a guild
 * - GET /api/discord/guild/:guildId/member/:userId - Get member info
 *
 * DEPENDENCIES:
 * - Discord client from discordClient.js
 * - Discord bot functions from discordBot.js
 *
 * USAGE:
 * Registered in main server: app.use('/api', discordHelpersRoutes);
 */

const express = require('express');
const router = express.Router();
const { getClient } = require('../lib/discordClient');
const { getAvailableGuilds, getGuildRoles, getGuildMember } = require('../discordBot');

// Cache for guild members with 5 minute expiration
const guildMembersCache = new Map();
const GUILD_MEMBERS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Cache for Discord server channels to avoid redundant fetches
const channelCache = {
  timestamp: 0,
  ttl: 5 * 60 * 1000, // 5 minutes cache
  servers: {}
};

// Endpoint to fetch Discord guild members
router.get('/discord/guild-members', async (req, res) => {
  try {
    // console.log('[DEBUG] Received request to fetch Discord guild members');

    // Get the guild ID from query parameters
    const { guildId } = req.query;

    if (!guildId) {
      return res.status(400).json({
        error: 'Guild ID is required. Please check your Discord integration settings.'
      });
    }

    // Check cache first
    const cached = guildMembersCache.get(guildId);
    if (cached && (Date.now() - cached.timestamp) < GUILD_MEMBERS_CACHE_DURATION) {
      console.log(`[DISCORD-API] Returning cached members for guild ${guildId} (${cached.members.length} members)`);
      return res.json({ members: cached.members });
    }

    // console.log(`[DEBUG] Fetching members for guild ID: ${guildId}`);

    // Use the existing Discord client instead of creating a new one
    const client = getClient();

    if (!client || !client.isReady()) {
      return res.status(503).json({
        error: 'Discord bot is not ready. Please ensure the bot is running and try again.'
      });
    }

    // console.log('[DEBUG] Discord client ready, fetching guild members');

    // Get the specific guild (server) by ID
    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
      return res.status(404).json({
        error: `Discord guild with ID ${guildId} not found or bot doesn't have access`
      });
    }
      // console.log(`[DEBUG] Found guild: ${guild.name} (${guild.id})`);

    // Fetch all members with timeout and proper options
    const fetchTimeout = 45000; // 45 seconds - Discord.js default is 30s
    const fetchPromise = guild.members.fetch({
      force: false, // Don't force refresh from API if already cached
      time: 40000   // Discord.js internal timeout - set to 40s (must be less than our timeout)
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Discord member fetch timed out after 45 seconds')), fetchTimeout)
    );

    try {
      await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error) {
      // If fetch fails but we have cached members, return those instead of erroring
      if (guild.members.cache.size > 0) {
        console.log(`[DISCORD-API] Fetch failed but returning ${guild.members.cache.size} cached members for guild ${guildId}`);
      } else {
        throw error; // Re-throw if we have no cached members at all
      }
    }

    // Map guild members to a simpler structure, exclude bots
    const members = guild.members.cache
      .filter(member => !member.user.bot) // Filter out bots
      .map(member => ({
        id: member.id,
        username: member.user.username,
        displayName: member.nickname || member.user.username, // Include server display name
        roles: member.roles.cache.map(role => role.name).filter(name => name !== '@everyone'),
        isBot: member.user.bot
      }));

    // console.log(`[DEBUG] Fetched ${members.length} guild members (after filtering out bots)`);

    // Cache the result
    guildMembersCache.set(guildId, {
      members,
      timestamp: Date.now()
    });

    res.json({ members });
  } catch (error) {
    console.error('[ERROR] Error fetching Discord guild members:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch Discord guild members'
    });
  }
});

// Endpoint to get available Discord servers
router.get('/discord/servers', async (req, res) => {
  try {
    // console.log('[DEBUG] Received request to fetch available Discord servers');

    // Use the bot's getAvailableGuilds function
    const { guilds, error } = await getAvailableGuilds();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error
      });
    }

    // console.log(`[DEBUG] Found ${guilds.length} available Discord servers`);

    return res.json({
      success: true,
      servers: guilds
    });
  } catch (error) {
    console.error('[ERROR] Error fetching Discord servers:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch Discord servers'
    });
  }
});

// Endpoint to get channels for a specific Discord server
router.get('/discord/servers/:guildId/channels', async (req, res) => {
  try {
    const { guildId } = req.params;

    if (!guildId) {
      return res.status(400).json({
        success: false,
        error: 'Guild ID is required'
      });
    }

    // Check if we have a recent cache for this guild
    const now = Date.now();
    if (channelCache.servers[guildId] &&
        now - channelCache.timestamp < channelCache.ttl) {
      // Return cached channels if they exist and are not expired
      return res.json({
        success: true,
        channels: channelCache.servers[guildId],
        cached: true
      });
    }

    // Get the authenticated Discord client
    const discordClient = getClient();

    // Wait for client to be ready if not already
    if (!discordClient.isReady()) {
      await new Promise((resolve) => {
        discordClient.once('ready', resolve);
      });
    }

    // Fetch the specified guild
    const guild = discordClient.guilds.cache.get(guildId);

    if (!guild) {
      return res.status(404).json({
        success: false,
        error: `Discord server with ID ${guildId} not found or bot doesn't have access`
      });
    }

    // Fetch all channels
    await guild.channels.fetch();

    // Filter to text channels that can be used for posting events
    const textChannels = guild.channels.cache
      .filter(channel => {
        // Convert any type to string for comparison
        const typeStr = String(channel.type);
        // Include all text-like channels (can contain text messages)
        return ['0', 'GUILD_TEXT', 'TEXT', 'DM', 'GROUP_DM', 'GUILD_NEWS',
                'GUILD_NEWS_THREAD', 'GUILD_PUBLIC_THREAD', 'GUILD_PRIVATE_THREAD'].includes(typeStr);
      })
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        type: channel.type
      }));

    // Update the cache
    channelCache.servers[guildId] = textChannels;
    channelCache.timestamp = now;

    res.json({
      success: true,
      channels: textChannels
    });
  } catch (error) {
    console.error('[ERROR] Error fetching Discord channels:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch Discord channels'
    });
  }
});

// Endpoint to get Discord server roles
router.get('/discord/guild/:guildId/roles', async (req, res) => {
  try {
    const { guildId } = req.params;

    // console.log(`[DEBUG] Fetching roles for guild ID: ${guildId}`);

    if (!guildId) {
      return res.status(400).json({
        error: 'Guild ID is required'
      });
    }

    // Call the Discord bot function to get guild roles
    const result = await getGuildRoles(guildId);

    if (result.error) {
      return res.status(500).json({
        error: result.error
      });
    }

    res.json({
      roles: result.roles
    });
  } catch (error) {
    console.error('[ERROR] Error fetching Discord guild roles:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch Discord guild roles'
    });
  }
});

// Endpoint to get Discord guild member information
router.get('/discord/guild/:guildId/member/:userId', async (req, res) => {
  try {
    const { guildId, userId } = req.params;

    // console.log(`[DEBUG] Fetching member ${userId} in guild ID: ${guildId}`);

    if (!guildId || !userId) {
      return res.status(400).json({
        error: 'Guild ID and User ID are required'
      });
    }

    // Call the Discord bot function to get guild member
    const result = await getGuildMember(guildId, userId);

    if (result.error) {
      return res.status(500).json({
        error: result.error
      });
    }

    res.json({
      member: result.member
    });
  } catch (error) {
    console.error('[ERROR] Error fetching Discord guild member:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch Discord guild member'
    });
  }
});

module.exports = router;
