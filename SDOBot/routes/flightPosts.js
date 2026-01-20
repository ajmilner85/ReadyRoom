/**
 * FLIGHT POSTS ROUTES
 *
 * PURPOSE: Handle flight assignment image posting and management
 *
 * ENDPOINTS:
 * - POST /api/discord/post-image - Post new flight assignment image to Discord
 * - GET /api/discord/flight-posts/:eventId - Get existing flight posts for event
 * - PUT /api/discord/update-image/:messageId - Update existing Discord message with new image
 * - POST /api/discord/save-flight-post - Save flight post record to database
 *
 * DEPENDENCIES:
 * - Discord client from discordClient.js
 * - Supabase client for database operations
 * - multer for file upload handling
 *
 * USAGE:
 * Registered in main server: app.use('/api', flightPostsRoutes);
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { AttachmentBuilder } = require('discord.js');
const { getClient } = require('../lib/discordClient');
const { supabase } = require('../supabaseClient');

// API endpoint to post image to Discord channel
router.post('/discord/post-image', async (req, res) => {
  try {
    const upload = multer();

    // Use multer to handle the file upload
    upload.single('image')(req, res, async (err) => {
      if (err) {
        console.error('[POST-IMAGE] Multer error:', err);
        return res.status(400).json({ error: 'File upload error' });
      }

      const { guildId, channelId, message, roleMentions } = req.body;
      const imageFile = req.file;

      if (!guildId || !channelId || !imageFile) {
        return res.status(400).json({
          error: 'Missing required fields: guildId, channelId, and image file'
        });
      }

      // Parse role mentions if provided
      let roles = [];
      if (roleMentions) {
        try {
          roles = JSON.parse(roleMentions);
        } catch (e) {
          console.error('[POST-IMAGE] Failed to parse roleMentions:', e);
        }
      }

      console.log(`[POST-IMAGE] Posting image to Discord - Guild: ${guildId}, Channel: ${channelId}, Message: ${message || 'No message'}, Role mentions: ${roles.length}`);

      try {
        // Get the Discord client
        const discordClient = getClient();

        // Wait for Discord client to be ready
        if (!discordClient.isReady()) {
          await new Promise((resolve) => {
            discordClient.once('ready', resolve);
          });
        }

        // Get the guild and channel
        const guild = discordClient.guilds.cache.get(guildId);
        if (!guild) {
          // Log available guilds for debugging
          const availableGuilds = discordClient.guilds.cache.map(g => ({ id: g.id, name: g.name }));
          console.error(`[POST-IMAGE] Guild ${guildId} not found. Available guilds:`, availableGuilds);
          return res.status(404).json({
            error: `Discord server with ID ${guildId} not found or bot doesn't have access`,
            availableGuilds: availableGuilds
          });
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
          return res.status(404).json({
            error: `Channel with ID ${channelId} not found in server`
          });
        }

        // Create attachment from the uploaded file
        const attachment = new AttachmentBuilder(imageFile.buffer, {
          name: imageFile.originalname || 'flight_assignments.png'
        });

        // Build message content with role mentions if provided
        let messageContent = message || '';
        if (roles && roles.length > 0) {
          const roleMentionsString = roles.map(role => `<@&${role.id}>`).join(' ');
          messageContent = roleMentionsString + (message ? `\n${message}` : '');
          console.log(`[POST-IMAGE] Adding role mentions to message: ${roleMentionsString}`);
        }

        // Send the message with the image
        const discordMessage = await channel.send({
          content: messageContent,
          files: [attachment]
        });

        console.log(`[POST-IMAGE] Successfully posted image to Discord - Message ID: ${discordMessage.id}`);

        res.json({
          success: true,
          messageId: discordMessage.id,
          guildId: guildId,
          channelId: channelId
        });

      } catch (discordError) {
        console.error('[POST-IMAGE] Discord API error:', discordError);
        res.status(500).json({
          error: `Discord API error: ${discordError.message}`
        });
      }
    });

  } catch (error) {
    console.error('[POST-IMAGE] Unexpected error:', error);
    res.status(500).json({
      error: `Server error: ${error.message}`
    });
  }
});

// API endpoint to check for existing flight assignment posts
router.get('/discord/flight-posts/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    console.log(`[FLIGHT-POSTS] Checking for existing posts - Event: ${eventId}`);

    if (!eventId) {
      console.error('[FLIGHT-POSTS] No event ID provided');
      return res.status(400).json({
        error: 'Event ID is required'
      });
    }

    // Get existing flight posts from events table
    const { data: eventData, error } = await supabase
      .from('events')
      .select('discord_flight_assignments_posts')
      .eq('id', eventId)
      .single();

    if (error) {
      console.error('[FLIGHT-POSTS] Error fetching event:', error);
      return res.status(500).json({
        error: 'Failed to fetch event data'
      });
    }

    console.log(`[FLIGHT-POSTS] Event data retrieved:`, {
      hasData: !!eventData,
      hasFlightPosts: !!eventData?.discord_flight_assignments_posts,
      isArray: Array.isArray(eventData?.discord_flight_assignments_posts)
    });

    // Parse flight posts and filter for latest posts only
    const flightPosts = eventData?.discord_flight_assignments_posts || [];
    console.log(`[FLIGHT-POSTS] Event ${eventId}: Found ${flightPosts.length} total posts`);

    const latestPosts = flightPosts.filter(post => post && post.isLatest === true);
    console.log(`[FLIGHT-POSTS] Event ${eventId}: ${latestPosts.length} latest posts:`, latestPosts.map(p => ({ squadronId: p.squadronId, revision: p.revision, messageId: p.messageId })));

    const response = {
      success: true,
      existingPosts: latestPosts,
      hasExistingPosts: latestPosts.length > 0
    };
    console.log(`[FLIGHT-POSTS] Returning response:`, response);

    res.json(response);

  } catch (error) {
    console.error('[FLIGHT-POSTS] Unexpected error:', error);
    res.status(500).json({
      error: `Server error: ${error.message}`
    });
  }
});

// API endpoint to update existing Discord message with new image
router.put('/discord/update-image/:messageId', async (req, res) => {
  try {
    const upload = multer();

    // Use multer to handle the file upload
    upload.single('image')(req, res, async (err) => {
      if (err) {
        console.error('[UPDATE-IMAGE] Multer error:', err);
        return res.status(400).json({ error: 'File upload error' });
      }

      const { messageId } = req.params;
      const { guildId, channelId, message } = req.body;
      const imageFile = req.file;

      if (!messageId || !guildId || !channelId || !imageFile) {
        return res.status(400).json({
          error: 'Missing required fields: messageId, guildId, channelId, and image file'
        });
      }

      console.log(`[UPDATE-IMAGE] Updating Discord message ${messageId} - Guild: ${guildId}, Channel: ${channelId}`);

      try {
        // Get the Discord client
        const discordClient = getClient();

        // Wait for Discord client to be ready
        if (!discordClient.isReady()) {
          await new Promise((resolve) => {
            discordClient.once('ready', resolve);
          });
        }

        // Get the guild and channel
        const guild = discordClient.guilds.cache.get(guildId);
        if (!guild) {
          return res.status(404).json({
            error: `Discord server with ID ${guildId} not found or bot doesn't have access`
          });
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
          return res.status(404).json({
            error: `Channel with ID ${channelId} not found in server`
          });
        }

        // Get the existing message
        let existingMessage;
        try {
          existingMessage = await channel.messages.fetch(messageId);
        } catch (fetchError) {
          return res.status(404).json({
            error: `Message with ID ${messageId} not found in channel`
          });
        }

        // Create attachment from the uploaded file
        const attachment = new AttachmentBuilder(imageFile.buffer, {
          name: imageFile.originalname || 'flight_assignments.png'
        });

        // Edit the message with the new image
        const updatedMessage = await existingMessage.edit({
          content: message || existingMessage.content || '',
          files: [attachment]
        });

        console.log(`[UPDATE-IMAGE] Successfully updated Discord message ${messageId}`);

        res.json({
          success: true,
          messageId: updatedMessage.id,
          guildId: guildId,
          channelId: channelId
        });

      } catch (discordError) {
        console.error('[UPDATE-IMAGE] Discord API error:', discordError);
        res.status(500).json({
          error: `Discord API error: ${discordError.message}`
        });
      }
    });

  } catch (error) {
    console.error('[UPDATE-IMAGE] Unexpected error:', error);
    res.status(500).json({
      error: `Server error: ${error.message}`
    });
  }
});

// API endpoint to save flight post record to database
router.post('/discord/save-flight-post', async (req, res) => {
  try {
    const { eventId, squadronId, guildId, channelId, messageId, isUpdate = false } = req.body;

    if (!eventId || !squadronId || !guildId || !channelId || !messageId) {
      return res.status(400).json({
        error: 'Missing required fields: eventId, squadronId, guildId, channelId, messageId'
      });
    }

    console.log(`[SAVE-FLIGHT-POST] Saving flight post record - Event: ${eventId}, Squadron: ${squadronId}, Update: ${isUpdate}`);

    // Get current event data
    const { data: eventData, error: fetchError } = await supabase
      .from('events')
      .select('discord_flight_assignments_posts')
      .eq('id', eventId)
      .single();

    if (fetchError) {
      console.error('[SAVE-FLIGHT-POST] Error fetching event:', fetchError);
      return res.status(500).json({
        error: 'Failed to fetch event data'
      });
    }

    let flightPosts = eventData?.discord_flight_assignments_posts || [];

    if (isUpdate) {
      // For updates, increment the revision number and update timestamp
      const postIndex = flightPosts.findIndex(
        post => post.squadronId === squadronId && post.messageId === messageId
      );

      if (postIndex !== -1) {
        flightPosts[postIndex].updatedAt = new Date().toISOString();
        flightPosts[postIndex].revision = (flightPosts[postIndex].revision || 1) + 1;
      }
    } else {
      // For new posts, mark any existing posts for this squadron as not latest
      flightPosts = flightPosts.map(post =>
        post.squadronId === squadronId
          ? { ...post, isLatest: false }
          : post
      );

      // Add the new post with initial revision of 1
      const newPost = {
        squadronId,
        guildId,
        channelId,
        messageId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isLatest: true,
        revision: 1
      };

      flightPosts.push(newPost);
    }

    // Update the events table with the modified flight posts
    const { error: updateError } = await supabase
      .from('events')
      .update({ discord_flight_assignments_posts: flightPosts })
      .eq('id', eventId);

    if (updateError) {
      console.error('[SAVE-FLIGHT-POST] Error updating event flight posts:', updateError);
      return res.status(500).json({
        error: 'Failed to save flight post record'
      });
    }

    res.json({
      success: true,
      message: isUpdate ? 'Flight post record updated' : 'Flight post record saved'
    });

  } catch (error) {
    console.error('[SAVE-FLIGHT-POST] Unexpected error:', error);
    res.status(500).json({
      error: `Server error: ${error.message}`
    });
  }
});

module.exports = router;
