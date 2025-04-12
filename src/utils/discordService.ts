import type { Event } from '../types/EventTypes';

interface PublishEventResponse {
  success: boolean;
  discordMessageId?: string;
  error?: string;
}

/**
 * Publishes an event to Discord via the backend API
 * @param event The event to publish
 * @returns Response containing success status and Discord message ID
 */
export async function publishEventToDiscord(event: Event): Promise<PublishEventResponse> {
  try {
    // Use the datetime field as the startTime if startTime is not provided
    const startTime = event.startTime || event.datetime;
    
    // Calculate an endTime 1 hour after startTime if not provided
    let endTime = event.endTime;
    if (!endTime && startTime) {
      const startDate = new Date(startTime);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour
      endTime = endDate.toISOString();
    }

    const response = await fetch('http://localhost:3001/api/events/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: event.title,
        description: event.description,
        startTime: startTime,
        endTime: endTime,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to publish event to Discord');
    }

    return {
      success: true,
      discordMessageId: data.discordMessageId,
    };
  } catch (error) {
    console.error('Discord publish error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Updates the discord_message_id field in the database for an event
 * @param eventId The event ID
 * @param discordMessageId The Discord message ID
 */
export async function updateEventDiscordId(eventId: string, discordMessageId: string): Promise<boolean> {
  try {
    // This is a placeholder - in a future implementation, you would call
    // your Supabase client here to update the event record
    // Example: 
    // const { error } = await supabase
    //   .from('events')
    //   .update({ discord_message_id: discordMessageId })
    //   .eq('id', eventId);
    
    // For now, just return success
    return true;
  } catch (error) {
    console.error('Failed to update event with Discord message ID:', error);
    return false;
  }
}