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
    // Check for existing record within debounce window (60 seconds)
    // This prevents mis-clicks from creating duplicate records while preserving audit trail for intentional changes
    const debounceWindowMs = 60 * 1000;
    const cutoffTime = new Date(Date.now() - debounceWindowMs).toISOString();
    
    const { data: recentRecord, error: fetchError } = await supabase
      .from('discord_event_attendance')
      .select('*')
      .eq('discord_id', discordUserId)
      .eq('discord_event_id', discordEventId)
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (fetchError) {
      console.error('Error checking for recent attendance:', fetchError);
      return { error: fetchError };
    }
    
    // If recent record exists (within 60s), UPDATE it (debounce mis-clicks)
    if (recentRecord) {
      const { data, error } = await supabase
        .from('discord_event_attendance')
        .update({
          user_response: userResponse,
          discord_username: discordUsername,
          updated_at: new Date().toISOString()
        })
        .eq('id', recentRecord.id)
        .select();
      
      if (error) {
        console.error('Error updating attendance:', error);
        return { error };
      }
      console.log(`Updated recent response for ${discordUsername} (debounced within 60s)`);
      return { data };
    }
    
    // Otherwise, INSERT new record (preserves audit trail for intentional changes)
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