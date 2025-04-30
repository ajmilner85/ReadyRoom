/**
 * Utility functions for the roll call feature
 */
import { supabase } from './supabaseClient';

/**
 * Synchronizes roll call data from the database
 * @param discordEventId The discord event ID to fetch roll call data for
 * @returns A record of pilot IDs to roll call responses
 */
export const syncRollCallResponses = async (discordEventId: string) => {
  if (!discordEventId) {
    console.warn('Cannot sync roll call responses: No Discord event ID provided');
    return {};
  }

  try {
    const { data, error } = await supabase
      .from('discord_event_attendance')
      .select('discord_id, roll_call_response')
      .eq('discord_event_id', discordEventId)
      .not('roll_call_response', 'is', null);
    
    if (error) {
      console.error('Error fetching roll call responses:', error);
      return {};
    }

    if (!data || data.length === 0) {
      return {};
    }

    // Convert the data to a map of discord_id -> roll_call_response
    const responseMap: Record<string, 'Present' | 'Absent' | 'Tentative'> = {};
    data.forEach(record => {
      if (record.discord_id && record.roll_call_response) {
        responseMap[record.discord_id] = record.roll_call_response;
      }
    });

    return responseMap;
  } catch (error) {
    console.error('Unexpected error syncing roll call responses:', error);
    return {};
  }
};

/**
 * Updates the roll call response for a pilot
 * @param discordEventId The discord event ID
 * @param discordId The discord ID of the pilot
 * @param pilotName The pilot's name/callsign for logging
 * @param response The new roll call response, or null to remove
 */
export const updateRollCallResponse = async (
  discordEventId: string,
  discordId: string,
  pilotName: string,
  response: 'Present' | 'Absent' | 'Tentative' | null
) => {
  if (!discordEventId) {
    console.warn('Cannot update roll call response: No Discord event ID provided');
    return;
  }

  if (!discordId) {
    console.warn(`Cannot update roll call response: No Discord ID for pilot ${pilotName}`);
    return;
  }

  try {
    // Check if there's an existing attendance record
    const { data: existingRecord, error: fetchError } = await supabase
      .from('discord_event_attendance')
      .select('*')
      .eq('discord_event_id', discordEventId)
      .eq('discord_id', discordId)
      .maybeSingle();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error checking for existing attendance record:', fetchError);
      return;
    }
    
    if (existingRecord) {
      // Update existing record - ONLY modify roll_call_response
      const { error: updateError } = await supabase
        .from('discord_event_attendance')
        .update({
          roll_call_response: response,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingRecord.id);
      
      if (updateError) {
        console.error('Error updating roll call response:', updateError);
      } else {
        console.log(`Updated roll call response for ${pilotName} to ${response || 'null'}`);
      }
    } else {
      // Create new record
      // Look for existing attendance record with any response
      const { data: anyAttendanceRecord, error: anyRecordError } = await supabase
        .from('discord_event_attendance')
        .select('*')
        .eq('discord_id', discordId)
        .eq('discord_event_id', discordEventId)
        .maybeSingle();
        
      // If there's no error looking up attendance and there's an existing record, we should use that record's user_response
      let userResponse = 'no_response'; // Default
      if (!anyRecordError && anyAttendanceRecord) {
        userResponse = anyAttendanceRecord.user_response;
      }
      
      // Insert new record with proper user_response value - preserving any existing Discord response
      const { error: insertError } = await supabase
        .from('discord_event_attendance')
        .insert({
          discord_event_id: discordEventId,
          discord_id: discordId,
          discord_username: pilotName,
          user_response: userResponse, // Use existing response value if found, or neutral if not
          roll_call_response: response
        });
      
      if (insertError) {
        console.error('Error inserting roll call response:', insertError);
      } else {
        console.log(`Created roll call response for ${pilotName}: ${response || 'null'}`);
      }
    }
  } catch (error) {
    console.error('Unexpected error in roll call response:', error);
  }
};
