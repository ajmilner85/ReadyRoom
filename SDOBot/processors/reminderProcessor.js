/**
 * REMINDER PROCESSOR
 *
 * PURPOSE: Process event reminders and send notifications to Discord
 *
 * RESPONSIBILITIES:
 * - Check for pending reminders based on scheduled_time
 * - Filter recipients by response type (accepted, tentative, declined, no_response)
 * - Send reminder messages to appropriate Discord channels/threads
 * - Handle squadron-specific routing and deduplication
 * - Mark reminders as sent after processing
 *
 * DEPENDENCIES:
 * - Supabase client for database operations
 * - Discord bot functions for sending messages and thread management
 *
 * USAGE:
 * Called every 60 seconds by processor orchestrator in main server loop
 */

const { supabase } = require('../supabaseClient');
const {
  sendReminderMessage,
  postMessageToThread,
  shouldUseThreadsForEvent,
  createThreadFromMessage,
  getExistingThreadFromMessage
} = require('../discordBot');

// Helper function to send reminder to a specific Discord channel or thread
async function sendReminderToChannel(guildId, channelId, message, eventId = null) {
  try {
    // Call the Discord bot's reminder function with event ID for thread lookup
    const result = await sendReminderMessage(guildId, channelId, message, eventId);

    return result;
  } catch (error) {
    console.error(`[REMINDER-SEND] Error sending to ${guildId}/${channelId}:`, error);
    return { success: false, error: error.message };
  }
}

// Server-side reminder processing functions
async function processReminders() {
  try {
    console.log('[REMINDER-PROCESSOR] Checking for pending reminders...');

    // Get all pending reminders
    const now = new Date().toISOString();
    const { data: pendingReminders, error: fetchError } = await supabase
      .from('event_reminders')
      .select('*')
      .eq('sent', false)
      .lte('scheduled_time', now)
      .order('scheduled_time', { ascending: true });

    if (fetchError) {
      console.error('Error fetching pending reminders:', fetchError);
      return { processed: 0, errors: [{ reminderId: 'fetch', error: fetchError }] };
    }

    if (!pendingReminders || pendingReminders.length === 0) {
      console.log('[REMINDER-PROCESSOR] No pending reminders found');
      return { processed: 0, errors: [] };
    }

    console.log(`[REMINDER-PROCESSOR] Processing ${pendingReminders.length} pending reminders`);

    let processed = 0;
    const errors = [];

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
    return { processed: 0, errors: [{ reminderId: 'general', error }] };
  }
}

async function processIndividualReminder(reminder) {
  // Get event and attendance data
  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select('*')
    .eq('id', reminder.event_id)
    .single();

  if (eventError || !eventData) {
    throw new Error(`Could not fetch event data: ${eventError?.message || 'Event not found'}`);
  }

  // console.log('[EVENT-DEBUG] Retrieved event data:', JSON.stringify(eventData, null, 2));

  // Get attendance data
  let discordEventIds = [];
  if (Array.isArray(eventData.discord_event_id)) {
    discordEventIds = eventData.discord_event_id.map(pub => pub.messageId);
  } else if (eventData.discord_event_id) {
    discordEventIds = [eventData.discord_event_id];
  }

  if (discordEventIds.length === 0) {
    console.log(`No Discord event IDs found for reminder ${reminder.id}, marking as sent`);
    await markReminderAsSent(reminder.id);
    return;
  }

  // Build response types array based on reminder settings
  const responseTypes = [];
  if (reminder.notify_accepted !== false) responseTypes.push('accepted');
  if (reminder.notify_tentative !== false) responseTypes.push('tentative');
  if (reminder.notify_declined === true) responseTypes.push('declined');

  console.log(`[REMINDER-${reminder.id}] Notifying response types:`, responseTypes);
  console.log(`[REMINDER-${reminder.id}] Include no-response: ${reminder.notify_no_response === true}`);

  let attendanceData = [];

  // Query for users with specific responses (if any response types selected)
  if (responseTypes.length > 0) {
    // Get ALL attendance records for the event (will deduplicate after)
    // This ensures we respect the pilot's MOST RECENT response, not any historical response
    const { data: allAttendance, error: attendanceError } = await supabase
      .from('discord_event_attendance')
      .select('discord_id, discord_username, user_response, updated_at')
      .in('discord_event_id', discordEventIds)
      .order('updated_at', { ascending: false });

    if (attendanceError) {
      throw new Error(`Could not fetch attendance data: ${attendanceError.message}`);
    }

    // Deduplicate: keep only the most recent response per pilot
    // This prevents duplicate mentions and respects response changes (e.g., accepted → declined)
    const latestResponseByPilot = new Map();
    (allAttendance || []).forEach(record => {
      if (!latestResponseByPilot.has(record.discord_id)) {
        latestResponseByPilot.set(record.discord_id, record);
      }
    });

    // Filter to only the desired response types AFTER deduplication
    const respondedUsers = Array.from(latestResponseByPilot.values())
      .filter(record => responseTypes.includes(record.user_response));

    console.log(`[REMINDER-${reminder.id}] Found ${allAttendance?.length || 0} total attendance records, ${latestResponseByPilot.size} unique pilots, ${respondedUsers.length} matching response types`);

    // Get squadron assignments for these users
    // Using a two-step query approach for reliability - Supabase nested queries with !inner
    // and filters can have inconsistent behavior
    if (respondedUsers && respondedUsers.length > 0) {
      const discordIds = respondedUsers.map(u => u.discord_id);

      // Step 1: Get pilot IDs for these discord IDs
      const { data: pilotIdData, error: pilotIdError } = await supabase
        .from('pilots')
        .select('id, discord_id')
        .in('discord_id', discordIds);

      if (pilotIdError) {
        console.error(`[REMINDER] Error querying pilots:`, pilotIdError);
      }

      const squadronMap = new Map();

      if (pilotIdData && pilotIdData.length > 0) {
        // Create discord_id to pilot_id mapping
        const discordToPilotId = new Map();
        pilotIdData.forEach(p => discordToPilotId.set(p.discord_id, p.id));

        const pilotIds = pilotIdData.map(p => p.id);

        // Step 2: Get active assignments for these pilots
        const { data: assignmentData, error: assignmentError } = await supabase
          .from('pilot_assignments')
          .select('pilot_id, squadron_id, created_at')
          .in('pilot_id', pilotIds)
          .is('end_date', null)  // Only active assignments
          .order('created_at', { ascending: false });

        if (assignmentError) {
          console.error(`[REMINDER] Error querying pilot_assignments:`, assignmentError);
        }

        // Build squadron map from assignments
        // Group by pilot_id, taking the most recent (first due to order)
        const pilotToSquadron = new Map();
        (assignmentData || []).forEach(assignment => {
          if (!pilotToSquadron.has(assignment.pilot_id) && assignment.squadron_id) {
            pilotToSquadron.set(assignment.pilot_id, assignment.squadron_id);
          }
        });

        // Map discord_id to squadron_id through pilot_id
        discordIds.forEach(discordId => {
          const pilotId = discordToPilotId.get(discordId);
          if (pilotId) {
            const squadronId = pilotToSquadron.get(pilotId);
            if (squadronId) {
              squadronMap.set(discordId, squadronId);
            }
          }
        });
      }

      // Log only if there are missing mappings (potential issues)
      const foundDiscordIds = new Set(squadronMap.keys());
      const missingDiscordIds = discordIds.filter(id => !foundDiscordIds.has(id));
      if (missingDiscordIds.length > 0) {
        console.warn(`[REMINDER] ${missingDiscordIds.length} pilots missing squadron mappings`);
      }

      // Map attendance data to include squadron_id
      attendanceData = respondedUsers.map(user => ({
        discord_id: user.discord_id,
        discord_username: user.discord_username,
        user_response: user.user_response,
        squadron_id: squadronMap.get(user.discord_id)
      }));
    }
  }

  // Handle "no response" users if selected
  if (reminder.notify_no_response === true) {
    // Get all users who responded (any response type)
    const { data: allResponders } = await supabase
      .from('discord_event_attendance')
      .select('discord_id')
      .in('discord_event_id', discordEventIds);

    const responderIds = new Set((allResponders || []).map(r => r.discord_id));

    // Get participating squadrons from event
    const participatingSquadronIds = eventData.participants || [];

    if (participatingSquadronIds.length > 0) {
      // Two-step approach for reliability - Supabase nested queries with multiple !inner
      // joins and filters can have inconsistent behavior

      // Step 1: Get active pilot assignments in participating squadrons
      const { data: activeAssignments, error: assignmentError } = await supabase
        .from('pilot_assignments')
        .select('pilot_id, squadron_id')
        .in('squadron_id', participatingSquadronIds)
        .is('end_date', null);

      if (assignmentError) {
        console.error(`[REMINDER] Error querying no-response pilot_assignments:`, assignmentError);
      }

      if (activeAssignments && activeAssignments.length > 0) {
        // Build pilot_id to squadron_id map
        const pilotSquadronMap = new Map();
        activeAssignments.forEach(a => {
          if (!pilotSquadronMap.has(a.pilot_id)) {
            pilotSquadronMap.set(a.pilot_id, a.squadron_id);
          }
        });

        const pilotIds = Array.from(pilotSquadronMap.keys());

        // Step 2: Get pilots with active status
        const { data: activePilots, error: pilotError } = await supabase
          .from('pilots')
          .select(`
            id,
            discord_id,
            discord_username,
            pilot_statuses!inner(
              status_id,
              end_date,
              statuses!inner(isActive)
            )
          `)
          .in('id', pilotIds)
          .eq('pilot_statuses.statuses.isActive', true)
          .is('pilot_statuses.end_date', null)
          .not('discord_id', 'is', null);

        if (pilotError) {
          console.error(`[REMINDER] Error querying no-response pilots:`, pilotError);
        }

        // Filter for users who haven't responded and include squadron info
        const noResponseUsers = (activePilots || [])
          .filter(pilot => !responderIds.has(pilot.discord_id))
          .map(pilot => ({
            discord_id: pilot.discord_id,
            discord_username: pilot.discord_username,
            user_response: 'no_response',
            squadron_id: pilotSquadronMap.get(pilot.id)
          }));

        attendanceData = [...attendanceData, ...noResponseUsers];
      }
    }
  }

  // Filter attendance data to only include ACTIVE pilots
  if (attendanceData.length > 0) {
    const discordIds = attendanceData.map(a => a.discord_id);

    const { data: activePilots } = await supabase
      .from('pilots')
      .select(`
        discord_id,
        pilot_statuses!inner(
          status_id,
          end_date,
          statuses!inner(isActive)
        )
      `)
      .in('discord_id', discordIds)
      .eq('pilot_statuses.statuses.isActive', true)
      .is('pilot_statuses.end_date', null);

    const activePilotIds = new Set((activePilots || []).map(p => p.discord_id));

    // Filter attendanceData to only active pilots
    const originalCount = attendanceData.length;
    attendanceData = attendanceData.filter(user => activePilotIds.has(user.discord_id));

    console.log(`[REMINDER-${reminder.id}] Filtered to ${attendanceData.length} active pilots (from ${originalCount} total)`);
  }

  // DEBUGGING: Inject 744 Nubs as a test member for VX-14 Testing Squadron
  // This allows testing reminder notifications without spamming real squadron members
  // This runs on ALL instances (dev and production) since VX-14 is explicitly a testing squadron
  const TESTING_SQUADRON_ID = 'fd56a33c-5b26-46f5-9332-7acf83f45e77';
  const TEST_PILOT_DISCORD_ID = '118942689508065280';
  const TEST_PILOT_CALLSIGN = '744 Nubs';

  // Check if event includes testing squadron
  const isTestingEvent = eventData.participants &&
    Array.isArray(eventData.participants) &&
    eventData.participants.includes(TESTING_SQUADRON_ID);

  if (isTestingEvent) {
    console.log(`[REMINDER-DEBUG] 🧪 VX-14 Testing Squadron event detected, injecting test pilot ${TEST_PILOT_CALLSIGN}`);

    // Check if test pilot is already in attendanceData (from actual responses)
    const hasTestPilot = attendanceData.some(a => a.discord_id === TEST_PILOT_DISCORD_ID);

    if (!hasTestPilot) {
      // Inject test pilot with appropriate response status
      // Default to 'no_response' so they get included in both first and second reminders
      attendanceData.push({
        discord_id: TEST_PILOT_DISCORD_ID,
        discord_username: TEST_PILOT_CALLSIGN,
        user_response: 'no_response'
      });
      console.log(`[REMINDER-DEBUG] 🧪 Injected test pilot ${TEST_PILOT_CALLSIGN} into reminder recipients`);
    } else {
      console.log(`[REMINDER-DEBUG] 🧪 Test pilot already has a response, using actual response data`);
    }
  }

  if (!attendanceData || attendanceData.length === 0) {
    console.log(`No eligible recipients for reminder ${reminder.id}, marking as sent`);
    await markReminderAsSent(reminder.id);
    return;
  }

  // Calculate time until event
  // console.log('[EVENT-DEBUG] Event start_datetime field:', eventData.start_datetime);
  // console.log('[EVENT-DEBUG] Available event fields:', Object.keys(eventData));
  const timeUntilEvent = calculateTimeUntilEvent(eventData.start_datetime);

  // Format the reminder message
  const message = formatReminderMessage(eventData, timeUntilEvent);

  // Send the reminder message to Discord channels with squadron-specific filtering
  await sendReminderToDiscordChannels(eventData, message, attendanceData);

  // Mark reminder as sent
  await markReminderAsSent(reminder.id);
}

function calculateTimeUntilEvent(eventStartTime) {
  // console.log('[TIME-CALC-DEBUG] Event start time string:', eventStartTime);

  if (!eventStartTime) {
    console.error('[TIME-CALC-DEBUG] Event start time is undefined/null');
    return 'unknown time';
  }

  const now = new Date();
  const eventStart = new Date(eventStartTime);
  // console.log('[TIME-CALC-DEBUG] Current time:', now.toISOString());
  // console.log('[TIME-CALC-DEBUG] Event start parsed:', eventStart.toISOString());
  // console.log('[TIME-CALC-DEBUG] Event start is valid date:', !isNaN(eventStart.getTime()));
  const diffMs = eventStart.getTime() - now.getTime();
  // console.log('[TIME-CALC-DEBUG] Difference in ms:', diffMs);

  if (diffMs <= 0) {
    return 'now';
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    const remainingHours = diffHours % 24;
    return `${diffDays} day${diffDays !== 1 ? 's' : ''}${remainingHours > 0 ? ` and ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}` : ''}`;
  } else if (diffHours > 0) {
    const remainingMinutes = diffMinutes % 60;
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''}${remainingMinutes > 0 ? ` and ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}` : ''}`;
  } else {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
  }
}

function formatReminderMessage(event, timeUntilEvent) {
  // console.log('[FORMAT-REMINDER-DEBUG] Event data:', event);
  // console.log('[FORMAT-REMINDER-DEBUG] Time until event:', timeUntilEvent);

  const eventDate = new Date(event.start_datetime);

  // Get timezone from event settings, default to America/New_York
  let timezone = 'America/New_York';
  if (event.event_settings) {
    try {
      const settings = typeof event.event_settings === 'string'
        ? JSON.parse(event.event_settings)
        : event.event_settings;

      if (settings.squadron?.timezone) {
        timezone = settings.squadron.timezone;
        // console.log('[FORMAT-REMINDER-DEBUG] Using timezone from event settings:', timezone);
      }
    } catch (error) {
      console.warn('[FORMAT-REMINDER-DEBUG] Failed to parse event settings, using default timezone:', error);
    }
  }

  const formattedTime = eventDate.toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return `REMINDER: Event starting ${timeUntilEvent}!
${event.name}
${formattedTime}`;
}

async function sendReminderToDiscordChannels(event, message, attendanceData = []) {
  if (Array.isArray(event.discord_event_id)) {
    // Track which pilots have been mentioned to handle orphaned pilots later
    const mentionedPilots = new Set();
    let firstPublication = null;  // Store first publication for fallback

    // DEDUPLICATION FIX: Build unique channels map BEFORE the loop
    // This ensures only ONE reminder is sent per unique guild:channel combination,
    // even when multiple squadrons share the same Discord channel
    const uniqueChannels = new Map();

    for (const publication of event.discord_event_id) {
      const channelKey = `${publication.guildId}:${publication.channelId}`;

      if (!uniqueChannels.has(channelKey)) {
        uniqueChannels.set(channelKey, {
          publication: publication,  // Use first publication for this channel as reference
          squadronIds: [publication.squadronId],
          allPublications: [publication]  // Track all publications for database updates
        });
      } else {
        // Add squadron to existing channel entry
        const channelInfo = uniqueChannels.get(channelKey);
        channelInfo.squadronIds.push(publication.squadronId);
        channelInfo.allPublications.push(publication);
      }
    }

    // Log summary only if deduplication actually occurred
    if (event.discord_event_id.length !== uniqueChannels.size) {
      console.log(`[REMINDER] Deduplicated ${event.discord_event_id.length} publications to ${uniqueChannels.size} unique channels`);
    }

    // Iterate over UNIQUE channels, not individual publications
    for (const [channelKey, channelInfo] of uniqueChannels) {
      const { publication, squadronIds, allPublications } = channelInfo;

      try {
        // Store first publication for orphaned pilot fallback
        if (!firstPublication) {
          firstPublication = publication;
        }

        // Aggregate attendanceData from ALL squadrons sharing this channel
        const channelAttendance = attendanceData.filter(user =>
          squadronIds.includes(user.squadron_id)
        );

        // If no recipients for this channel, skip
        if (channelAttendance.length === 0) {
          continue;
        }

        // Track mentioned pilots for orphan detection
        channelAttendance.forEach(user => mentionedPilots.add(user.discord_id));

        // Deduplicate users by discord_id to avoid duplicate mentions
        const uniqueUsers = new Map();
        channelAttendance.forEach(user => {
          if (!uniqueUsers.has(user.discord_id)) {
            uniqueUsers.set(user.discord_id, user);
          }
        });

        // Create Discord mentions for ALL pilots in this channel (across all squadrons)
        const discordMentions = Array.from(uniqueUsers.values())
          .map(user => `<@${user.discord_id}>`)
          .join(' ');
        const fullMessage = discordMentions ? `${discordMentions}\n${message}` : message;

        // Thread creation logic: Create thread on first reminder if threading is enabled
        let createdThreadId = null;
        let targetChannelId = publication.channelId; // Default to main channel

        // CRITICAL FIX: Check if ANY publication in this event has a thread (not just current one)
        // This ensures all reminders use the same thread, even if event has duplicate posts in same channel
        const existingThread = event.discord_event_id.find(
          pub => pub.threadId && pub.threadId !== 'DISABLED'
        );

        let needsDatabaseUpdate = false;

        if (existingThread) {
          // Reuse existing thread from any publication
          targetChannelId = existingThread.threadId;

          // Update THIS publication to also reference the thread (if not already set)
          if (!publication.threadId || publication.threadId === 'DISABLED') {
            publication.threadId = existingThread.threadId;
            needsDatabaseUpdate = true;
          }
        } else if (publication.threadId) {
          // This publication has a threadId but existingThread didn't find it (shouldn't happen, defensive)
          if (publication.threadId === 'DISABLED') {
            // Try to recover from DISABLED state by checking FIRST message (not current)
            const firstPub = event.discord_event_id[0];
            const existingThreadResult = await getExistingThreadFromMessage(
              firstPub.messageId,
              firstPub.guildId,
              firstPub.channelId
            );

            if (existingThreadResult.success) {
              targetChannelId = existingThreadResult.threadId;
              event.discord_event_id.forEach(pub => {
                pub.threadId = existingThreadResult.threadId;
              });
              needsDatabaseUpdate = true;
            } else {
              targetChannelId = publication.channelId;
            }
          } else {
            // Thread already exists, use it
            targetChannelId = publication.threadId;
          }
        } else {
          // No thread exists yet - create one from the FIRST messageId
          const participatingSquadrons = publication.squadronId ? [publication.squadronId] : [];
          const threadDecision = await shouldUseThreadsForEvent(participatingSquadrons, publication.guildId, publication.channelId);

          if (threadDecision.shouldUseThreads) {
            const firstPub = event.discord_event_id[0];
            const threadResult = await createThreadFromMessage(
              firstPub.messageId,
              event.name,
              firstPub.guildId,
              firstPub.channelId,
              threadDecision.autoArchiveDuration
            );

            if (threadResult.success) {
              console.log(`[REMINDER] Thread created: ${threadResult.threadId}`);
              createdThreadId = threadResult.threadId;
              targetChannelId = threadResult.threadId;
              event.discord_event_id.forEach(pub => {
                pub.threadId = threadResult.threadId;
              });
              needsDatabaseUpdate = true;
            } else if (threadResult.error === 'The message already has a thread' || threadResult.alreadyExists) {
              // Thread already exists for first message, try to fetch it
              const firstPub = event.discord_event_id[0];
              const existingThreadResult = await getExistingThreadFromMessage(
                firstPub.messageId,
                firstPub.guildId,
                firstPub.channelId
              );

              if (existingThreadResult.success) {
                createdThreadId = existingThreadResult.threadId;
                targetChannelId = existingThreadResult.threadId;
                event.discord_event_id.forEach(pub => {
                  pub.threadId = existingThreadResult.threadId;
                });
                needsDatabaseUpdate = true;
              } else {
                console.error(`[REMINDER] Failed to fetch existing thread: ${existingThreadResult.error}`);
                event.discord_event_id.forEach(pub => {
                  pub.threadId = 'DISABLED';
                });
                needsDatabaseUpdate = true;
                targetChannelId = publication.channelId;
              }
            } else {
              console.warn(`[REMINDER] Thread creation failed: ${threadResult.error}`);
              event.discord_event_id.forEach(pub => {
                pub.threadId = 'DISABLED';
              });
              needsDatabaseUpdate = true;
              targetChannelId = publication.channelId;
            }
          } else {
            targetChannelId = publication.channelId;
          }
        }

        // Update database if we modified any threadId values
        if (needsDatabaseUpdate) {
          try {
            await supabase
              .from('events')
              .update({ discord_event_id: event.discord_event_id })
              .eq('id', event.id);
          } catch (updateError) {
            console.warn(`[REMINDER] Failed to update thread in database:`, updateError.message);
          }
        }

        // Send the reminder message with squadron-specific mentions
        let reminderResult;
        if (targetChannelId !== publication.channelId) {
          // We're sending to a thread
          reminderResult = await postMessageToThread(targetChannelId, publication.guildId, fullMessage);
        } else {
          // No thread, use normal channel messaging
          reminderResult = await sendReminderMessage(publication.guildId, targetChannelId, fullMessage);

          // If threading is disabled and we posted to channel, track the message ID for deletion
          if (reminderResult.success && reminderResult.messageId) {
            try {
              // CRITICAL: Read latest event data from database to avoid overwriting threadId
              // This prevents race conditions where threadId gets lost during reminderMessageIds updates
              const { data: latestEventData, error: fetchError } = await supabase
                .from('events')
                .select('discord_event_id')
                .eq('id', event.id)
                .single();

              if (fetchError || !latestEventData) {
                throw new Error('Cannot update reminderMessageIds without latest event data');
              }

              // Store reminder message ID in ALL publications that share this channel
              const updatedPublications = latestEventData.discord_event_id.map(pub =>
                (pub.guildId === publication.guildId && pub.channelId === publication.channelId)
                  ? {
                      ...pub,
                      reminderMessageIds: [...(pub.reminderMessageIds || []), reminderResult.messageId]
                    }
                  : pub
              );

              await supabase
                .from('events')
                .update({ discord_event_id: updatedPublications })
                .eq('id', event.id);

              event.discord_event_id = updatedPublications;
            } catch (trackingError) {
              console.warn(`[REMINDER] Failed to store reminder message ID:`, trackingError.message);
            }
          }
        }

        // Single summary log for successful reminder
        const threadStatus = createdThreadId ? ' (new thread)' : (publication.threadId ? ' (thread)' : '');
        console.log(`[REMINDER] Sent to ${squadronIds.length} squadron(s)${threadStatus}`);

      } catch (error) {
        console.error(`[REMINDER] Failed to send reminder to channel ${channelKey}:`, error);
      }
    }

    // Handle orphaned pilots - users who should be notified but weren't included in any squadron publication
    const orphanedPilots = attendanceData.filter(user => !mentionedPilots.has(user.discord_id));
    if (orphanedPilots.length > 0 && firstPublication) {
      console.log(`[REMINDER] ${orphanedPilots.length} orphaned pilots, sending to fallback channel`);

      try {
        const orphanMentions = orphanedPilots
          .map(user => `<@${user.discord_id}>`)
          .join(' ');

        const orphanMessage = `${orphanMentions}\n${message}`;

        let targetChannelId = firstPublication.threadId && firstPublication.threadId !== 'DISABLED'
          ? firstPublication.threadId
          : firstPublication.channelId;

        if (firstPublication.threadId && firstPublication.threadId !== 'DISABLED') {
          await postMessageToThread(targetChannelId, firstPublication.guildId, orphanMessage);
        } else {
          await sendReminderMessage(firstPublication.guildId, targetChannelId, orphanMessage);
        }
      } catch (orphanError) {
        console.error(`[REMINDER] Failed to send orphaned pilot reminder:`, orphanError);
      }
    }
  } else if (event.discord_event_id) {
    // Single channel event - need to get guild/channel from the message ID
    // For now, we'll log this case and implement if needed
    console.log(`[REMINDER] Single-channel event reminder not yet implemented for message ID: ${event.discord_event_id}`);
  }
}

async function markReminderAsSent(reminderId) {
  try {
    const { error } = await supabase
      .from('event_reminders')
      .update({
        sent: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', reminderId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error marking reminder as sent:', error);
    return { success: false, error };
  }
}

module.exports = {
  processReminders,
  processIndividualReminder,
  sendReminderToChannel,
  sendReminderToDiscordChannels,
  calculateTimeUntilEvent,
  formatReminderMessage,
  markReminderAsSent
};
