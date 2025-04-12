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
const { publishEventToDiscord } = require(discordBotPath);

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
app.post('/api/events/publish', async (req, res) => {
  try {
    const { title, description, startTime, endTime } = req.body;
    
    if (!title || !startTime) {
      return res.status(400).json({ 
        success: false, 
        error: 'Title and start time are required' 
      });
    }
    
    // Format the event time object
    const eventTime = {
      start: new Date(startTime),
      end: endTime ? new Date(endTime) : new Date(new Date(startTime).getTime() + (60 * 60 * 1000)) // Default to 1 hour later
    };
    
    console.log('Publishing event to Discord:', { title, description, eventTime });
    
    // Call the Discord bot to publish the event
    const result = await publishEventToDiscord(title, description || '', eventTime);
    
    res.json({
      success: true,
      discordMessageId: result.messageId
    });
  } catch (error) {
    console.error('Error publishing event to Discord:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to publish event to Discord'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`ReadyRoom API server running on port ${PORT}`);
});