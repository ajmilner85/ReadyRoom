/**
 * Utility functions for the roll call feature
 */
import { supabase } from './supabaseClient';

/**
 * Synchronizes roll call data from the database
 * @param discordEventId The discord event ID to fetch roll call data for (can be synthetic: manual-{event-id})
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
        responseMap[record.discord_id] = record.roll_call_response as "Present" | "Absent" | "Tentative";
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
 * @param discordEventId The discord event ID (can be synthetic: manual-{event-id})
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
    // Check if there's an existing roll call record for this user/event
    const { data: existingRecords, error: fetchError } = await supabase
      .from('discord_event_attendance')
      .select('*')
      .eq('discord_event_id', discordEventId)
      .eq('discord_id', discordId)
      .not('roll_call_response', 'is', null);

    if (fetchError) {
      console.error('Error checking for existing roll call record:', fetchError);
      return;
    }

    const existingRollCallRecord = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;

    if (response === null) {
      // Unselecting - DELETE the roll call record if it exists
      if (existingRollCallRecord) {
        const { error: deleteError } = await supabase
          .from('discord_event_attendance')
          .delete()
          .eq('id', existingRollCallRecord.id);

        if (deleteError) {
          console.error('Error deleting roll call record:', deleteError);
        } else {
          console.log(`Deleted roll call record for ${pilotName}`);
        }
      } else {
        console.log(`No roll call record to delete for ${pilotName}`);
      }
    } else if (existingRollCallRecord) {
      // Update existing roll call record
      const { error: updateError } = await supabase
        .from('discord_event_attendance')
        .update({
          roll_call_response: response,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingRollCallRecord.id);

      if (updateError) {
        console.error('Error updating roll call record:', updateError);
      } else {
        console.log(`Updated roll call record for ${pilotName} to ${response}`);
      }
    } else {
      // Insert new roll call record
      const { error: insertError } = await supabase
        .from('discord_event_attendance')
        .insert({
          discord_event_id: discordEventId,
          discord_id: discordId,
          discord_username: pilotName,
          user_response: 'roll_call', // Mark as roll_call entry (not a Discord response)
          roll_call_response: response
        });

      if (insertError) {
        console.error('Error inserting roll call record:', insertError);
      } else {
        console.log(`Inserted roll call record for ${pilotName}: ${response}`);
      }
    }
  } catch (error) {
    console.error('Unexpected error in roll call response:', error);
  }
};
