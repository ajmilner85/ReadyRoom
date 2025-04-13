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
const { publishEventToDiscord, initializeDiscordBot, deleteEventMessage } = require(discordBotPath);

// Import Supabase client
const { supabase, getEventByDiscordId } = require('./supabaseClient');

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// Middleware
app.use(cors());
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
    
    console.log(`[DEBUG] Received request to delete Discord message: ${discordMessageId}`);
    
    // Validate ID format to avoid unnecessary calls
    if (!discordMessageId || !/^\d+$/.test(discordMessageId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Discord message ID format'
      });
    }
    
    // Call the Discord bot to delete the message
    const result = await deleteEventMessage(discordMessageId);
    
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
    const { title, description, startTime, endTime, eventId } = req.body;
    
    console.log('[DEBUG] Received event publish request:', { 
      timestamp: new Date().toISOString(),
      eventId,
      title,
      startTime
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
        .select('discord_event_id')
        .eq('id', eventId)
        .single();
        
      if (!checkError && existingEvent && existingEvent.discord_event_id) {
        console.log(`[DEBUG] Event ${eventId} already published with Discord ID: ${existingEvent.discord_event_id}`);
        return res.json({
          success: true,
          discordMessageId: existingEvent.discord_event_id,
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
      startTime: eventTime.start.toISOString(), 
      endTime: eventTime.end.toISOString() 
    });
    
    // Call the Discord bot to publish the event
    const result = await publishEventToDiscord(title, description || '', eventTime);
    console.log('[DEBUG] Discord publish result:', result);
    
    // If eventId was provided, update the event in Supabase with the Discord message ID
    if (eventId && result.messageId) {
      console.log(`[DEBUG] Updating event ${eventId} with Discord message ID ${result.messageId}`);
      const { error: updateError } = await supabase
        .from('events')
        .update({ discord_event_id: result.messageId })
        .eq('id', eventId);
      
      if (updateError) {
        console.warn(`[WARNING] Failed to update event record with Discord message ID: ${updateError.message}`);
      } else {
        console.log(`[DEBUG] Successfully linked event ${eventId} with Discord message ID ${result.messageId}`);
      }
    }
    
    res.json({
      success: true,
      discordMessageId: result.messageId
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

// Start server
app.listen(PORT, () => {
  console.log(`ReadyRoom API server running on port ${PORT}`);
});