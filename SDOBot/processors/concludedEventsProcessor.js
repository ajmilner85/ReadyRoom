/**
 * CONCLUDED EVENTS PROCESSOR
 *
 * PURPOSE: Mark concluded events as processed for button removal
 *
 * RESPONSIBILITIES:
 * - Find events where end_datetime has passed
 * - Mark events with buttons_removed = true in database
 * - Actual Discord button removal is handled by countdownManager.js
 *
 * DEPENDENCIES:
 * - Supabase client for database queries/updates
 *
 * USAGE:
 * Called every 60 seconds by processor orchestrator in main server loop
 */

const { supabase } = require('../supabaseClient');

async function processConcludedEvents() {
  try {
    console.log('[CONCLUDED-EVENTS] Checking for concluded events...');

    const now = new Date().toISOString();

    // Find events that have concluded but haven't had buttons removed yet
    const { data: concludedEvents, error: fetchError } = await supabase
      .from('events')
      .select('id, name, end_datetime, discord_event_id, buttons_removed')
      .lte('end_datetime', now)
      .neq('buttons_removed', true)
      .not('discord_event_id', 'is', null);

    if (fetchError) {
      console.error('[CONCLUDED-EVENTS] Error fetching concluded events:', fetchError);
      return { processed: 0, errors: [fetchError] };
    }

    if (!concludedEvents || concludedEvents.length === 0) {
      console.log('[CONCLUDED-EVENTS] No concluded events found');
      return { processed: 0, errors: [] };
    }

    console.log(`[CONCLUDED-EVENTS] Found ${concludedEvents.length} concluded events with buttons to remove`);

    let processed = 0;
    const errors = [];

    for (const event of concludedEvents) {
      try {
        // NOTE: Button removal and "Event Finished" text is handled by the Discord bot's
        // countdown manager in SDOBot. The server-side processor only marks events as
        // processed in the database so they don't get checked repeatedly.
        // The actual Discord message updates happen in SDOBot/lib/countdownManager.js

        console.log(`[CONCLUDED-EVENTS] Marking event "${event.name}" as processed (Discord bot will handle final updates)`);

        // Mark event as having buttons removed (Discord bot will actually remove them)
        await supabase
          .from('events')
          .update({ buttons_removed: true })
          .eq('id', event.id);

        processed++;
        console.log(`[CONCLUDED-EVENTS] Processed concluded event "${event.name}" (${event.id})`);
      } catch (error) {
        console.error(`[CONCLUDED-EVENTS] Error processing event ${event.id}:`, error);
        errors.push({ eventId: event.id, error });
      }
    }

    console.log(`[CONCLUDED-EVENTS] Completed: ${processed} processed, ${errors.length} errors`);
    return { processed, errors };
  } catch (error) {
    console.error('[CONCLUDED-EVENTS] Error in processConcludedEvents:', error);
    return { processed: 0, errors: [{ error }] };
  }
}

module.exports = {
  processConcludedEvents
};
