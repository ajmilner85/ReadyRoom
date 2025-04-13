// Use an explicit path for dotenv config
const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Require the Discord bot with an explicit path
const discordBotPath = path.resolve(__dirname, '../SDOBot/discordBot');
const { 
  publishEventToDiscord, 
  initializeDiscordBot, 
  deleteEventMessage, 
  getAvailableGuilds 
} = require(discordBotPath);

// Import Supabase client
const { supabase, getEventByDiscordId } = require('./supabaseClient');

// Import Discord.js for guild member operations
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// Configure CORS with specific options to ensure it works properly
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173'], // Add your frontend URLs
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true
}));
app.use(bodyParser.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Also support HEAD requests for lightweight health checks
app.head('/api/health', (req, res) => {
  res.status(200).end();
});

// Initialize Discord bot connection
(async function() {
  try {
    console.log('Initializing Discord bot connection...');
    await initializeDiscordBot();
    console.log('Discord bot connection established successfully');
  } catch (error) {
    console.error('Failed to initialize Discord bot:', error);
  }
})();

// Routes
// API endpoint to delete a Discord message
app.delete('/api/events/:discordMessageId', async (req, res) => {
  try {
    const { discordMessageId } = req.params;
    const { guildId } = req.query; // Get guild ID from query params
    
    console.log(`[DEBUG] Received request to delete Discord message: ${discordMessageId}, Guild ID: ${guildId || 'not specified'}`);
    
    // Validate ID format to avoid unnecessary calls
    if (!discordMessageId || !/^\d+$/.test(discordMessageId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Discord message ID format'
      });
    }
    
    // If the event was in a specific guild, first try to look it up
    if (!guildId) {
      // Try to find the guild ID in the database if not provided
      const { data, error } = await supabase
        .from('events')
        .select('discord_guild_id')
        .eq('discord_event_id', discordMessageId)
        .single();
        
      if (!error && data && data.discord_guild_id) {
        console.log(`[DEBUG] Found guild ID ${data.discord_guild_id} for message ${discordMessageId}`);
        // Use the guild ID from the database
        const result = await deleteEventMessage(discordMessageId, data.discord_guild_id);
        
        if (result.success) {
          return res.json({ 
            success: true,
            alreadyDeleted: !!result.alreadyDeleted
          });
        }
      }
    }
    
    // Call the Discord bot to delete the message (with guild ID if provided)
    const result = await deleteEventMessage(discordMessageId, guildId);
    
    console.log(`[DEBUG] Delete result for message ${discordMessageId}:`, result);
    
    // Return success even if message was already deleted
    if (result.success) {
      return res.json({ 
        success: true,
        alreadyDeleted: !!result.alreadyDeleted
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to delete Discord message'
      });
    }
  } catch (error) {
    console.error('[ERROR] Error deleting Discord message:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Server error while deleting Discord message'
    });
  }
});

// Add detailed logging to the publish endpoint
app.post('/api/events/publish', async (req, res) => {
  try {
    const { title, description, startTime, endTime, eventId, guildId } = req.body;
    
    console.log('[DEBUG] Received event publish request:', { 
      timestamp: new Date().toISOString(),
      eventId,
      title,
      startTime,
      guildId
    });
    
    if (!title || !startTime) {
      return res.status(400).json({ 
        success: false, 
        error: 'Title and start time are required' 
      });
    }
    
    // Check if this event was already published to avoid duplicates
    if (eventId) {
      console.log(`[DEBUG] Checking if event ${eventId} was already published...`);
      const { data: existingEvent, error: checkError } = await supabase
        .from('events')
        .select('discord_event_id, discord_guild_id')
        .eq('id', eventId)
        .single();
        
      if (!checkError && existingEvent && existingEvent.discord_event_id) {
        console.log(`[DEBUG] Event ${eventId} already published with Discord ID: ${existingEvent.discord_event_id}`);
        return res.json({
          success: true,
          discordMessageId: existingEvent.discord_event_id,
          discordGuildId: existingEvent.discord_guild_id,
          alreadyPublished: true
        });
      }
    }
    
    // Format the event time object
    const eventTime = {
      start: new Date(startTime),
      end: endTime ? new Date(endTime) : new Date(new Date(startTime).getTime() + (60 * 60 * 1000)) // Default to 1 hour later
    };
    
    console.log('[DEBUG] Publishing event to Discord:', { 
      title, 
      eventId,
      guildId,
      startTime: eventTime.start.toISOString(), 
      endTime: eventTime.end.toISOString() 
    });
    
    // Call the Discord bot to publish the event, passing the guild ID if provided
    const result = await publishEventToDiscord(title, description || '', eventTime, guildId);
    console.log('[DEBUG] Discord publish result:', result);
    
    // If eventId was provided, update the event in Supabase with the Discord message ID and guild ID
    if (eventId && result.messageId) {
      console.log(`[DEBUG] Updating event ${eventId} with Discord message ID ${result.messageId} and guild ID ${result.guildId}`);
      const { error: updateError } = await supabase
        .from('events')
        .update({ 
          discord_event_id: result.messageId,
          discord_guild_id: result.guildId
        })
        .eq('id', eventId);
      
      if (updateError) {
        console.warn(`[WARNING] Failed to update event record with Discord IDs: ${updateError.message}`);
      } else {
        console.log(`[DEBUG] Successfully linked event ${eventId} with Discord message ID ${result.messageId} and guild ID ${result.guildId}`);
      }
    }
    
    res.json({
      success: true,
      discordMessageId: result.messageId,
      discordGuildId: result.guildId
    });
  } catch (error) {
    console.error('[ERROR] Error publishing event to Discord:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to publish event to Discord'
    });
  }
});

// New endpoint to get event attendance from database by event ID
app.get('/api/events/:eventId/attendance', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    // First, get the event to find its Discord message ID
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('discord_event_id')
      .eq('id', eventId)
      .single();
    
    if (eventError) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    const discordEventId = eventData.discord_event_id;
    
    if (!discordEventId) {
      return res.json({ 
        accepted: [], 
        declined: [], 
        tentative: [],
        note: 'This event has no Discord message ID associated with it'
      });
    }
    
    // Query Supabase for attendance records from discord_event_attendance table
    const { data, error } = await supabase
      .from('discord_event_attendance')
      .select('*')
      .eq('discord_event_id', discordEventId);
    
    if (error) {
      throw error;
    }
    
    // Format the response to match the expected structure
    const attendance = {
      accepted: [],
      declined: [],
      tentative: []
    };
    
    // Process each attendance record
    data.forEach(record => {
      // Prepare the attendee object
      const attendee = {
        boardNumber: record.board_number || (record.discord_id ? record.discord_id.substring(0, 3) : 'N/A'),
        callsign: record.discord_username || 'Unknown User',
        discord_id: record.discord_id,
        billet: record.billet
      };
      
      // Add to the appropriate list based on user_response
      if (record.user_response === 'accepted') {
        attendance.accepted.push(attendee);
      } else if (record.user_response === 'declined') {
        attendance.declined.push(attendee);
      } else if (record.user_response === 'tentative') {
        attendance.tentative.push(attendee);
      }
    });
    
    res.json(attendance);
  } catch (error) {
    console.error('Error fetching event attendance:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch attendance' });
  }
});

// API endpoint for finding an event by its Discord message ID
app.get('/api/events/discord/:discordMessageId', async (req, res) => {
  try {
    const { discordMessageId } = req.params;
    const { event, error } = await getEventByDiscordId(discordMessageId);
    
    if (error || !event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json(event);
  } catch (error) {
    console.error('Error finding event by Discord ID:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

// New endpoint to fetch Discord guild members
app.get('/api/discord/guild-members', async (req, res) => {
  try {
    console.log('[DEBUG] Received request to fetch Discord guild members');
    
    // Create a Discord client with required intents
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
      ]
    });
    
    // Login to Discord
    await client.login(process.env.BOT_TOKEN);
    
    // Wait for client to be ready
    await new Promise((resolve) => {
      if (client.isReady()) resolve();
      else client.once('ready', resolve);
    });
    
    console.log('[DEBUG] Discord client ready, fetching guild members');
    
    // Get the first guild (server) - assuming the bot is only in one server
    const guilds = [...client.guilds.cache.values()];
    
    if (guilds.length === 0) {
      await client.destroy();
      return res.status(404).json({ error: 'No Discord guilds found' });
    }
    
    const guild = guilds[0];
    console.log(`[DEBUG] Found guild: ${guild.name} (${guild.id})`);
    
    // Fetch all members
    await guild.members.fetch();
    
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
    
    console.log(`[DEBUG] Fetched ${members.length} guild members (after filtering out bots)`);
    
    // Destroy the client to free up resources
    await client.destroy();
    
    res.json({ members });
  } catch (error) {
    console.error('[ERROR] Error fetching Discord guild members:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch Discord guild members' 
    });
  }
});

// New endpoint to get available Discord servers
app.get('/api/discord/servers', async (req, res) => {
  try {
    console.log('[DEBUG] Received request to fetch available Discord servers');
    
    // Use the bot's getAvailableGuilds function
    const { guilds, error } = await getAvailableGuilds();
    
    if (error) {
      return res.status(500).json({ 
        success: false,
        error: error
      });
    }
    
    console.log(`[DEBUG] Found ${guilds.length} available Discord servers`);
    
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

// Start server
app.listen(PORT, () => {
  console.log(`ReadyRoom API server running on port ${PORT}`);
});