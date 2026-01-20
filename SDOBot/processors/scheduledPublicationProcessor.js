/**
 * SCHEDULED PUBLICATION PROCESSOR
 *
 * PURPOSE: Process scheduled event publications and publish to Discord
 *
 * RESPONSIBILITIES:
 * - Check for pending scheduled publications based on scheduled_time
 * - Acquire distributed locks to prevent duplicate publications
 * - Publish events to Discord channels for each participating squadron
 * - Handle deduplication when multiple squadrons share the same channel
 * - Schedule reminders based on event settings after publication
 * - Mark publications as sent after processing
 *
 * DEPENDENCIES:
 * - Supabase client for database operations and distributed locking
 * - publishEventToDiscord from discordBot for Discord publishing
 *
 * USAGE:
 * Called every 60 seconds by processor orchestrator in main server loop
 */

const { supabase } = require('../supabaseClient');
const { publishEventToDiscord } = require('../discordBot');

// Helper function to convert UUID to integer for advisory lock
// Uses first 16 hex characters (64 bits) of UUID as lock key
function uuidToLockKey(uuid) {
  // Remove dashes and take first 16 hex chars (64 bits)
  const hex = uuid.replace(/-/g, '').substring(0, 16);
  // Convert to BigInt then to Number (PostgreSQL bigint is 64-bit signed integer)
  // We need to ensure it fits in signed 64-bit range (-2^63 to 2^63-1)
  const value = BigInt('0x' + hex);
  // Convert to signed by checking if high bit is set
  const maxInt64 = BigInt('0x7FFFFFFFFFFFFFFF');
  if (value > maxInt64) {
    return Number(value - BigInt('0x10000000000000000'));
  }
  return Number(value);
}

// Process scheduled event publications
async function processScheduledPublications() {
  try {
    console.log('[SCHEDULED-PUBLICATIONS] Checking for pending publications...');

    const now = new Date().toISOString();
    const { data: pendingPublications, error: fetchError} = await supabase
      .from('scheduled_event_publications')
      .select(`
        id,
        event_id,
        scheduled_time,
        events (
          id,
          name,
          description,
          start_datetime,
          end_datetime,
          participants,
          event_settings,
          image_url,
          discord_event_id
        )
      `)
      .eq('sent', false)
      .lte('scheduled_time', now)
      .order('scheduled_time', { ascending: true });

    if (fetchError) {
      console.error('[SCHEDULED-PUBLICATIONS] Error fetching pending publications:', fetchError);
      return { processed: 0, errors: [{ publicationId: 'fetch', error: fetchError }] };
    }

    if (!pendingPublications || pendingPublications.length === 0) {
      console.log('[SCHEDULED-PUBLICATIONS] No pending publications found');
      return { processed: 0, errors: [] };
    }

    console.log(`[SCHEDULED-PUBLICATIONS] Found ${pendingPublications.length} pending publications`);

    let processed = 0;
    let skipped = 0;
    const errors = [];

    // Generate instance ID for debugging
    const instanceId = process.env.INSTANCE_ID || `pid-${process.pid}-${Math.random().toString(36).substring(7)}`;

    // Process each publication with distributed locking
    for (const publication of pendingPublications) {
      const lockKey = uuidToLockKey(publication.id);
      let lockAcquired = false;

      try {
        // Try to acquire advisory lock for this publication
        const { data: lockResult, error: lockError } = await supabase
          .rpc('try_acquire_reminder_lock', { lock_key: lockKey });

        if (lockError) {
          console.error(`[SCHEDULED-PUBLICATIONS] Instance ${instanceId}: Error acquiring lock for publication ${publication.id}:`, lockError);
          errors.push({ publicationId: publication.id, error: lockError });
          continue;
        }

        if (!lockResult) {
          // Lock is held by another bot instance
          console.log(`[SCHEDULED-PUBLICATIONS] Instance ${instanceId}: Publication ${publication.id} is being processed by another instance, skipping`);
          skipped++;
          continue;
        }

        lockAcquired = true;
        console.log(`[SCHEDULED-PUBLICATIONS] Instance ${instanceId}: ACQUIRED LOCK for publication ${publication.id}`);

        // Validate event data exists
        if (!publication.events) {
          console.error(`[SCHEDULED-PUBLICATIONS] Event data not found for publication ${publication.id}`);
          errors.push({ publicationId: publication.id, error: 'Event data not found' });
          continue;
        }

        const event = publication.events;
        console.log(`[SCHEDULED-PUBLICATIONS] Publishing event "${event.name}" (ID: ${event.id})`);

        // Check if event is already published (has discord_event_id)
        if (event.discord_event_id && (Array.isArray(event.discord_event_id) ? event.discord_event_id.length > 0 : event.discord_event_id)) {
          console.log(`[SCHEDULED-PUBLICATIONS] Event ${event.id} is already published, marking scheduled publication as sent and skipping`);

          // Mark this scheduled publication as sent to prevent re-publishing
          await supabase
            .from('scheduled_event_publications')
            .update({ sent: true, updated_at: new Date().toISOString() })
            .eq('id', publication.id);

          processed++;
          continue;
        }

        // Get participating squadrons
        const participatingSquadrons = event.participants || [];
        if (participatingSquadrons.length === 0) {
          console.warn(`[SCHEDULED-PUBLICATIONS] Event ${event.id} has no participating squadrons, skipping`);
          errors.push({ publicationId: publication.id, error: 'No participating squadrons' });
          continue;
        }

        // Get event settings for initial notification roles
        let initialNotificationRoles = [];
        if (event.event_settings) {
          try {
            const settings = typeof event.event_settings === 'string'
              ? JSON.parse(event.event_settings)
              : event.event_settings;
            initialNotificationRoles = settings.initialNotificationRoles || [];
          } catch (error) {
            console.warn('[SCHEDULED-PUBLICATIONS] Failed to parse event settings:', error);
          }
        }

        // Build unique channels map to deduplicate publications to the same channel
        const uniqueChannels = new Map();

        for (const squadronId of participatingSquadrons) {
          // Get Discord integration for this squadron from org_squadrons
          const { data: squadronData, error: squadronError } = await supabase
            .from('org_squadrons')
            .select('discord_integration')
            .eq('id', squadronId)
            .single();

          if (squadronError || !squadronData?.discord_integration) {
            console.warn(`[SCHEDULED-PUBLICATIONS] No Discord integration found for squadron ${squadronId}`);
            continue;
          }

          const integration = squadronData.discord_integration;
          const guildId = integration.selectedGuildId;

          // Find the events channel from discordChannels array
          const eventsChannel = integration.discordChannels?.find(ch => ch.type === 'events');
          const channelId = eventsChannel?.id;

          if (!guildId || !channelId) {
            console.warn(`[SCHEDULED-PUBLICATIONS] Incomplete Discord integration for squadron ${squadronId} (guildId: ${guildId}, channelId: ${channelId})`);
            continue;
          }

          // Create unique key for guild+channel combination
          const channelKey = `${guildId}:${channelId}`;

          if (uniqueChannels.has(channelKey)) {
            // Add this squadron to existing channel entry
            const existing = uniqueChannels.get(channelKey);
            existing.squadronIds.push(squadronId);
          } else {
            // Create new channel entry
            uniqueChannels.set(channelKey, {
              guildId,
              channelId,
              squadronIds: [squadronId]
            });
          }
        }

        console.log(`[SCHEDULED-PUBLICATIONS] Found ${uniqueChannels.size} unique channels for ${participatingSquadrons.length} squadrons`);

        // Publish to each unique channel once
        let publishedCount = 0;
        const publishedChannels = []; // Collect all successful publications

        for (const [channelKey, channelInfo] of uniqueChannels) {
          // Publish event to Discord
          const eventOptions = {
            trackQualifications: event.event_settings?.trackQualifications || false,
            eventType: event.event_settings?.eventType || 'Episode',
            participatingSquadrons: event.participants || [],
            initialNotificationRoles: initialNotificationRoles || [],
            groupBySquadron: event.event_settings?.groupBySquadron || false,
            showNoResponse: event.event_settings?.showNoResponse || false
          };

          // Format the event time object with start and end dates
          const eventTime = {
            start: new Date(event.start_datetime),
            end: event.end_datetime ? new Date(event.end_datetime) : new Date(new Date(event.start_datetime).getTime() + (60 * 60 * 1000))
          };

          // Extract image URL - handle both string and object formats
          let imageUrl = null;
          if (event.image_url) {
            if (typeof event.image_url === 'string') {
              imageUrl = event.image_url;
            } else if (typeof event.image_url === 'object') {
              // If it's an object, try to extract the URL from common properties
              imageUrl = event.image_url.url || event.image_url.headerImage || event.image_url.imageUrl || null;
              console.log(`[SCHEDULED-PUBLICATIONS] image_url is object, extracted: ${imageUrl || 'FAILED TO EXTRACT'}`);
              console.log(`[SCHEDULED-PUBLICATIONS] image_url object keys:`, Object.keys(event.image_url));
            }
          }

          console.log(`[SCHEDULED-PUBLICATIONS] Using imageUrl: ${imageUrl || 'NOT SET'}`);

          // Fresh check: does event already have a post in this channel?
          // This prevents duplicate posts if a manual publish happened concurrently
          const { data: freshEvent } = await supabase
            .from('events')
            .select('discord_event_id')
            .eq('id', event.id)
            .single();

          if (freshEvent?.discord_event_id) {
            const existingPost = freshEvent.discord_event_id.find(
              pub => pub.channelId === channelInfo.channelId
            );
            if (existingPost) {
              console.log(`[SCHEDULED-PUBLICATIONS] Event already has post in channel ${channelInfo.channelId}, reusing messageId ${existingPost.messageId}`);
              // Reuse existing messageId instead of publishing again
              for (const squadronId of channelInfo.squadronIds) {
                publishedChannels.push({
                  messageId: existingPost.messageId,
                  guildId: existingPost.guildId || channelInfo.guildId,
                  channelId: existingPost.channelId,
                  squadronId: squadronId
                });
              }
              publishedCount++;
              continue; // Skip to next channel
            }
          }

          const publishResult = await publishEventToDiscord(
            event.name,
            event.description,
            eventTime,
            channelInfo.guildId,
            channelInfo.channelId,
            imageUrl,
            null, // creator parameter (can be enhanced later)
            null, // images parameter
            eventOptions,
            null // Do NOT pass eventId - let server handle database update
          );

          if (publishResult.success) {
            console.log(`[SCHEDULED-PUBLICATIONS] Successfully published event to channel ${channelInfo.channelId}, messageId: ${publishResult.messageId}`);
            publishedCount++;

            // Add a result for each squadron that shares this channel
            for (const squadronId of channelInfo.squadronIds) {
              publishedChannels.push({
                messageId: publishResult.messageId,
                guildId: publishResult.guildId,
                channelId: publishResult.channelId,
                squadronId: squadronId
              });
            }
          } else {
            console.error(`[SCHEDULED-PUBLICATIONS] Failed to publish to channel ${channelInfo.channelId}:`, publishResult.error);
            // Add errors for all squadrons that share this failed channel
            for (const squadronId of channelInfo.squadronIds) {
              errors.push({
                publicationId: publication.id,
                squadronId,
                error: publishResult.error
              });
            }
          }
        }

        if (publishedCount > 0) {
          // Update event with Discord message IDs using the same structure as updateEventMultipleDiscordIds
          console.log(`[SCHEDULED-PUBLICATIONS] Updating event ${event.id} with ${publishedChannels.length} Discord publications:`, publishedChannels);

          const { error: updateError } = await supabase
            .from('events')
            .update({ discord_event_id: publishedChannels })
            .eq('id', event.id);

          if (updateError) {
            console.error(`[SCHEDULED-PUBLICATIONS] Failed to update event with Discord IDs:`, updateError);
          } else {
            console.log(`[SCHEDULED-PUBLICATIONS] Successfully updated event ${event.id} with Discord message IDs`);
          }

          // Schedule reminders if event has reminder settings configured
          if (event.event_settings) {
            try {
              const eventSettings = typeof event.event_settings === 'string'
                ? JSON.parse(event.event_settings)
                : event.event_settings;

              const eventStartTime = new Date(event.start_datetime);
              const now = new Date();

              // Helper function to convert reminder settings to milliseconds
              const convertToMs = (value, unit) => {
                switch (unit) {
                  case 'minutes': return value * 60 * 1000;
                  case 'hours': return value * 60 * 60 * 1000;
                  case 'days': return value * 24 * 60 * 60 * 1000;
                  default: return value * 60 * 1000;
                }
              };

              // Schedule first reminder if enabled
              if (eventSettings.firstReminderEnabled) {
                const reminderMs = convertToMs(
                  eventSettings.firstReminderTime?.value || 15,
                  eventSettings.firstReminderTime?.unit || 'minutes'
                );
                const reminderTime = new Date(eventStartTime.getTime() - reminderMs);

                if (reminderTime > now) {
                  const recipients = eventSettings.firstReminderRecipients || {};
                  await supabase.from('event_reminders').insert({
                    event_id: event.id,
                    reminder_type: 'first',
                    scheduled_time: reminderTime.toISOString(),
                    sent: false,
                    notify_accepted: recipients.accepted ?? false,
                    notify_tentative: recipients.tentative ?? true,
                    notify_declined: recipients.declined ?? false,
                    notify_no_response: recipients.noResponse ?? true
                  });
                  console.log(`[SCHEDULED-PUBLICATIONS] Scheduled first reminder for ${event.id}`);
                }
              }

              // Schedule second reminder if enabled
              if (eventSettings.secondReminderEnabled) {
                const reminderMs = convertToMs(
                  eventSettings.secondReminderTime?.value || 3,
                  eventSettings.secondReminderTime?.unit || 'days'
                );
                const reminderTime = new Date(eventStartTime.getTime() - reminderMs);

                if (reminderTime > now) {
                  const recipients = eventSettings.secondReminderRecipients || {};
                  await supabase.from('event_reminders').insert({
                    event_id: event.id,
                    reminder_type: 'second',
                    scheduled_time: reminderTime.toISOString(),
                    sent: false,
                    notify_accepted: recipients.accepted ?? true,
                    notify_tentative: recipients.tentative ?? true,
                    notify_declined: recipients.declined ?? false,
                    notify_no_response: recipients.noResponse ?? false
                  });
                  console.log(`[SCHEDULED-PUBLICATIONS] Scheduled second reminder for ${event.id}`);
                }
              }
            } catch (reminderError) {
              console.error(`[SCHEDULED-PUBLICATIONS] Failed to schedule reminders:`, reminderError);
            }
          }

          // Mark publication as sent
          await supabase
            .from('scheduled_event_publications')
            .update({ sent: true, updated_at: new Date().toISOString() })
            .eq('id', publication.id);

          processed++;
          console.log(`[SCHEDULED-PUBLICATIONS] Successfully published event ${event.id} to ${publishedCount} squadron(s)`);
        } else {
          console.error(`[SCHEDULED-PUBLICATIONS] Failed to publish event ${event.id} to any squadrons`);
          errors.push({ publicationId: publication.id, error: 'Failed to publish to any squadrons' });
        }

      } catch (error) {
        console.error(`[SCHEDULED-PUBLICATIONS] Error processing publication ${publication.id}:`, error);
        errors.push({ publicationId: publication.id, error });
      } finally {
        // Always release the lock if we acquired it
        if (lockAcquired) {
          try {
            const { error: unlockError } = await supabase
              .rpc('release_reminder_lock', { lock_key: lockKey });

            if (unlockError) {
              console.warn(`[SCHEDULED-PUBLICATIONS] Error releasing lock for publication ${publication.id}:`, unlockError);
            } else {
              console.log(`[SCHEDULED-PUBLICATIONS] Released lock for publication ${publication.id}`);
            }
          } catch (unlockError) {
            console.warn(`[SCHEDULED-PUBLICATIONS] Failed to release lock for publication ${publication.id}:`, unlockError);
          }
        }
      }
    }

    console.log(`[SCHEDULED-PUBLICATIONS] Completed: ${processed} processed, ${skipped} skipped (locked by other instances), ${errors.length} errors`);
    return { processed, skipped, errors };
  } catch (error) {
    console.error('[SCHEDULED-PUBLICATIONS] Error in processScheduledPublications:', error);
    return { processed: 0, skipped: 0, errors: [{ publicationId: 'general', error }] };
  }
}

module.exports = {
  processScheduledPublications,
  uuidToLockKey
};
