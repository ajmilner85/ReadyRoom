// Supabase client for the server
const { createClient } = require('@supabase/supabase-js');

// Get Supabase URL and key from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Using service key for server operations

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Supabase URL and service key must be provided in environment variables');
  console.error('  SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// Event attendance functions
async function upsertEventAttendance({
  discordEventId,
  discordUserId,
  discordUsername,
  userResponse
}) {
  try {
    // Simple insert - let each legitimate user interaction create a new record
    // This preserves the complete audit trail of user responses
    const { data, error } = await supabase
      .from('discord_event_attendance')
      .insert({
        discord_id: discordUserId,
        discord_username: discordUsername,
        discord_event_id: discordEventId,
        user_response: userResponse
      })
      .select();

    if (error) {
      console.error('Error inserting attendance:', error);
      return { error };
    }

    console.log(`Successfully recorded ${userResponse} response for ${discordUsername}`);
    return { data };
  } catch (error) {
    console.error('Unexpected error in upsertEventAttendance:', error);
    return { error };
  }
}

// Function to find event details by Discord message ID
async function getEventByDiscordId(discordEventId) {
  try {
    // Find the event with this Discord message ID - search within JSONB array
    // Using JSONB path operations to find messageId within the array
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('*')
      .or(`discord_event_id.cs.[{"messageId":"${discordEventId}"}],discord_event_id.eq.${discordEventId}`)
      .single();
    
    if (eventError) {
      console.error('Error finding event by Discord ID:', eventError);
      return { error: eventError };
    }
    
    return { event: eventData };
  } catch (error) {
    console.error('Unexpected error in getEventByDiscordId:', error);
    return { error };
  }
}

module.exports = {
  supabase,
  upsertEventAttendance,
  getEventByDiscordId
};