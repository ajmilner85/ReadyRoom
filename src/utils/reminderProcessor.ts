import { 
  getPendingReminders, 
  markReminderAsSent, 
  getEventWithAttendanceForReminder,
  formatReminderMessage,
  calculateTimeUntilEvent
} from './reminderService';

/**
 * Process pending reminders and send them
 * This function should be called periodically (e.g., every minute)
 * In a production environment, this would be handled by a background job/cron task
 */
export async function processReminders(): Promise<{ 
  processed: number; 
  errors: Array<{ reminderId: string; error: any }> 
}> {
  let processed = 0;
  const errors: Array<{ reminderId: string; error: any }> = [];

  try {
    // console.log('[REMINDER-PROCESSOR] Checking for pending reminders...');
    // Get all pending reminders
    const { data: pendingReminders, error: fetchError } = await getPendingReminders();
    
    if (fetchError) {
      console.error('Error fetching pending reminders:', fetchError);
      return { processed, errors: [{ reminderId: 'fetch', error: fetchError }] };
    }

    if (!pendingReminders || pendingReminders.length === 0) {
      // console.log('[REMINDER-PROCESSOR] No pending reminders found');
      return { processed, errors };
    }

    // console.log(`Processing ${pendingReminders.length} pending reminders`);

    // Process each reminder
    for (const reminder of pendingReminders) {
      try {
        await processIndividualReminder(reminder);
        processed++;
        // console.log(`Successfully processed reminder ${reminder.id} for event ${reminder.event_id}`);
      } catch (error) {
        console.error(`Error processing reminder ${reminder.id}:`, error);
        errors.push({ reminderId: reminder.id, error });
      }
    }

    return { processed, errors };
  } catch (error) {
    console.error('Error in processReminders:', error);
    return { processed, errors: [{ reminderId: 'general', error }] };
  }
}

/**
 * Process an individual reminder
 */
async function processIndividualReminder(reminder: any) {
  // Get event and attendance data
  const { event, attendance, error: eventError } = await getEventWithAttendanceForReminder(reminder.event_id);
  
  if (eventError || !event) {
    throw new Error(`Could not fetch event data: ${eventError?.message || 'Event not found'}`);
  }

  // Calculate time until event for the message
  const timeUntilEvent = calculateTimeUntilEvent((event as any).start_datetime || (event as any).datetime);
  
  // Get users to mention based on settings and attendance
  const usersToMention = getUsersToMention(attendance);
  
  // Format the reminder message with user mentions
  const message = formatReminderMessage(event, timeUntilEvent, usersToMention);
  
  if (usersToMention.length === 0) {
    // console.log(`No users to mention for reminder ${reminder.id}, marking as sent`);
    await markReminderAsSent(reminder.id);
    return;
  }

  // Send the reminder message (this would integrate with your Discord bot)
  await sendReminderMessage(event, message, usersToMention);
  
  // Mark reminder as sent
  const { success, error } = await markReminderAsSent(reminder.id);
  if (!success) {
    throw new Error(`Failed to mark reminder as sent: ${error?.message}`);
  }
}

/**
 * Get users to mention based on attendance and settings
 */
function getUsersToMention(attendance: {
  accepted: Array<{ discord_id: string; discord_username: string; board_number?: string; call_sign?: string }>;
  tentative: Array<{ discord_id: string; discord_username: string; board_number?: string; call_sign?: string }>;
}): Array<{ discord_id: string; discord_username: string; board_number?: string; call_sign?: string }> {
  // For now, we'll mention both accepted and tentative users
  // This can be configurable based on the event settings in the future
  return [...attendance.accepted, ...attendance.tentative];
}

/**
 * Send reminder message via Discord with deduplication for shared channels
 */
async function sendReminderMessage(
  event: any, 
  message: string, 
  usersToMention: Array<{ discord_id: string; discord_username: string; board_number?: string; call_sign?: string }>
) {
  try {
    // console.log('=== SENDING REMINDER MESSAGE ===');
    // console.log(`Event: ${event.name || event.title}`);
    // console.log(`Message: ${message}`);
    // console.log(`Users to mention: ${usersToMention.map(u => {
    //   if (u.board_number && u.call_sign) {
    //     return `@${u.board_number} ${u.call_sign}`;
    //   } else {
    //     return `@${u.discord_username}`;
    //   }
    // }).join('')}`);
    
    // Create Discord mentions for actual notification (alongside our custom format)
    const discordMentions = usersToMention.map(user => `<@${user.discord_id}>`).join(' ');
    const fullMessage = discordMentions ? `${discordMentions}\n${message}` : message;
    
    // Handle both single discord_event_id and multi-channel array format
    let discordEventIds = [];
    if (Array.isArray(event.discord_event_id)) {
      discordEventIds = event.discord_event_id;
    } else {
      discordEventIds = [{ 
        messageId: event.discord_event_id,
        guildId: event.discord_guild_id || '',
        channelId: '',
        squadronId: ''
      }];
    }
    
    // console.log('[REMINDER-DEDUP-DEBUG] Discord event IDs:', discordEventIds);
    
    if (discordEventIds.length === 0) {
      console.warn('No Discord event IDs found, skipping reminder');
      return;
    }
    
    // Create a UNION of unique guild+channel combinations to prevent duplicate reminders
    const uniqueChannels = new Map<string, {
      guildId: string;
      channelId: string;
      messageIds: string[];
      squadronIds: string[];
    }>();
    
    // Group by unique guild+channel combination
    for (const publication of discordEventIds) {
      const channelKey = `${publication.guildId}:${publication.channelId}`;
      
      if (uniqueChannels.has(channelKey)) {
        const existing = uniqueChannels.get(channelKey)!;
        existing.messageIds.push(publication.messageId);
        existing.squadronIds.push(publication.squadronId);
      } else {
        uniqueChannels.set(channelKey, {
          guildId: publication.guildId,
          channelId: publication.channelId,
          messageIds: [publication.messageId],
          squadronIds: [publication.squadronId]
        });
      }
    }
    
    // console.log(`[REMINDER-DEDUP-DEBUG] Found ${uniqueChannels.size} unique channels for ${discordEventIds.length} publications`);
    
    // Send reminder to each unique channel only once
    for (const [channelKey, channelInfo] of uniqueChannels) {
      // console.log(`[REMINDER-DEDUP-DEBUG] Sending reminder to unique channel ${channelKey} (squadrons: ${channelInfo.squadronIds.join(', ')})`);
      
      const response = await fetch('http://localhost:3001/api/reminders/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventId: event.id,
          message: fullMessage,
          userIds: usersToMention.map(u => u.discord_id),
          // Send to specific guild and channel to avoid duplicates
          guildId: channelInfo.guildId,
          channelId: channelInfo.channelId,
          // Include one of the message IDs for context
          discordMessageId: channelInfo.messageIds[0]
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`Failed to send reminder to channel ${channelKey}:`, errorData.error || response.statusText);
        continue; // Continue with other channels even if one fails
      }
      
      // const result = await response.json();
      // console.log(`✅ Reminder sent successfully to channel ${channelKey}:`, result);
    }
    
  } catch (error) {
    console.error('❌ Failed to send Discord reminder:', error);
    // Don't throw the error - we still want to mark the reminder as sent to avoid spam
    // The error is already logged for debugging
  }
}

/**
 * Start the reminder processor
 * This would typically be called when your application starts
 */
export function startReminderProcessor(intervalMinutes: number = 1) {
  // console.log(`Starting reminder processor with ${intervalMinutes} minute interval`);
  
  // Process immediately
  processReminders();
  
  // Then process every interval
  const intervalMs = intervalMinutes * 60 * 1000;
  const intervalId = setInterval(() => {
    processReminders();
  }, intervalMs);
  
  // Return the interval ID so it can be stopped if needed
  return intervalId;
}

/**
 * Stop the reminder processor
 */
export function stopReminderProcessor(intervalId: NodeJS.Timeout) {
  clearInterval(intervalId);
  // console.log('Reminder processor stopped');
}