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
    // Get all pending reminders
    const { data: pendingReminders, error: fetchError } = await getPendingReminders();
    
    if (fetchError) {
      console.error('Error fetching pending reminders:', fetchError);
      return { processed, errors: [{ reminderId: 'fetch', error: fetchError }] };
    }

    if (!pendingReminders || pendingReminders.length === 0) {
      return { processed, errors };
    }

    console.log(`Processing ${pendingReminders.length} pending reminders`);

    // Process each reminder
    for (const reminder of pendingReminders) {
      try {
        await processIndividualReminder(reminder);
        processed++;
        console.log(`Successfully processed reminder ${reminder.id} for event ${reminder.event_id}`);
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
  const timeUntilEvent = calculateTimeUntilEvent(event.start_datetime);
  
  // Format the reminder message
  const message = formatReminderMessage(event, timeUntilEvent);
  
  // Get users to mention based on settings and attendance
  const usersToMention = getUsersToMention(attendance);
  
  if (usersToMention.length === 0) {
    console.log(`No users to mention for reminder ${reminder.id}, marking as sent`);
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
  accepted: Array<{ discord_id: string; discord_username: string }>;
  tentative: Array<{ discord_id: string; discord_username: string }>;
}): Array<{ discord_id: string; discord_username: string }> {
  // For now, we'll mention both accepted and tentative users
  // This can be configurable based on the event settings in the future
  return [...attendance.accepted, ...attendance.tentative];
}

/**
 * Send reminder message via Discord
 * This is a placeholder function that would integrate with your Discord bot
 */
async function sendReminderMessage(
  event: any, 
  message: string, 
  usersToMention: Array<{ discord_id: string; discord_username: string }>
) {
  // This function would need to:
  // 1. Connect to your Discord bot
  // 2. Find the appropriate channel(s) to send the reminder
  // 3. Format the message with user mentions
  // 4. Send the message
  
  console.log('=== REMINDER MESSAGE ===');
  console.log(`Event: ${event.name}`);
  console.log(`Message: ${message}`);
  console.log(`Users to mention: ${usersToMention.map(u => `@${u.discord_username}`).join(', ')}`);
  console.log('========================');
  
  // TODO: Implement actual Discord message sending
  // This would integrate with your existing Discord bot infrastructure
  // For example:
  // await discordBot.sendReminderMessage(event.discord_guild_id, message, usersToMention.map(u => u.discord_id));
  
  // For now, we'll simulate successful sending
  await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Start the reminder processor
 * This would typically be called when your application starts
 */
export function startReminderProcessor(intervalMinutes: number = 1) {
  console.log(`Starting reminder processor with ${intervalMinutes} minute interval`);
  
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
  console.log('Reminder processor stopped');
}