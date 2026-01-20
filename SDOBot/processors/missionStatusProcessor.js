/**
 * MISSION STATUS PROCESSOR
 *
 * PURPOSE: Automatically updates mission status based on event timing
 *
 * RESPONSIBILITIES:
 * - Monitor missions in 'planning' and 'in_progress' status
 * - Update to 'in_progress' when event start time is reached
 * - Update to 'completed' when event end time is reached
 * - Time-based state machine: planning → in_progress → completed
 *
 * DEPENDENCIES:
 * - Supabase client for database queries/updates
 *
 * USAGE:
 * Called every 60 seconds by processor orchestrator in main server loop
 */

const { supabase } = require('../supabaseClient');

async function processMissionStatusUpdates() {
  try {
    console.log('[MISSION-STATUS] Checking for missions requiring status updates...');

    const now = new Date().toISOString();

    // Find missions that need status updates by joining with events
    const { data: missions, error: fetchError } = await supabase
      .from('missions')
      .select(`
        id,
        name,
        status,
        events!missions_event_id_fkey (
          id,
          start_datetime,
          end_datetime
        )
      `)
      .in('status', ['planning', 'in_progress']);

    if (fetchError) {
      console.error('[MISSION-STATUS] Error fetching missions:', fetchError);
      return { updated: 0, errors: [fetchError] };
    }

    if (!missions || missions.length === 0) {
      console.log('[MISSION-STATUS] No missions found requiring status check');
      return { updated: 0, errors: [] };
    }

    let updated = 0;
    const errors = [];

    for (const mission of missions) {
      try {
        // Skip if no associated event
        if (!mission.events) {
          continue;
        }

        const eventStartTime = new Date(mission.events.start_datetime);
        const eventEndTime = mission.events.end_datetime
          ? new Date(mission.events.end_datetime)
          : null;
        const nowTime = new Date(now);

        let newStatus = null;

        // Determine new status based on timing
        if (mission.status === 'planning' && nowTime >= eventStartTime) {
          // Event has started, move to in_progress
          newStatus = 'in_progress';
        } else if (mission.status === 'in_progress' && eventEndTime && nowTime >= eventEndTime) {
          // Event has ended, move to completed
          newStatus = 'completed';
        }

        // Update if status changed
        if (newStatus && newStatus !== mission.status) {
          const { error: updateError } = await supabase
            .from('missions')
            .update({
              status: newStatus,
              updated_at: now
            })
            .eq('id', mission.id);

          if (updateError) {
            console.error(`[MISSION-STATUS] Error updating mission ${mission.id}:`, updateError);
            errors.push({ missionId: mission.id, error: updateError });
          } else {
            updated++;
            console.log(`[MISSION-STATUS] Updated mission "${mission.name}" (${mission.id}) from "${mission.status}" to "${newStatus}"`);
          }
        }
      } catch (error) {
        console.error(`[MISSION-STATUS] Error processing mission ${mission.id}:`, error);
        errors.push({ missionId: mission.id, error });
      }
    }

    if (updated > 0 || errors.length > 0) {
      console.log(`[MISSION-STATUS] Completed: ${updated} updated, ${errors.length} errors`);
    }
    return { updated, errors };
  } catch (error) {
    console.error('[MISSION-STATUS] Error in processMissionStatusUpdates:', error);
    return { updated: 0, errors: [{ error }] };
  }
}

module.exports = {
  processMissionStatusUpdates
};
