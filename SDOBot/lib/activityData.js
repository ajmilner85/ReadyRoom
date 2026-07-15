/**
 * EVENT ACTIVITY DATA MODULE (Event Activities feature)
 *
 * Fetches the data needed to group a Discord event roster by activity.
 * Returns null unless BOTH of these hold:
 *   1. event_settings.groupByActivity === true (event-level toggle, off by default)
 *   2. the event has at least one event_activities row
 * so this is entirely inert for every existing/legacy event.
 */

/**
 * @param {object} supabase - supabase client
 * @param {string} eventId - events.id (uuid)
 * @param {object} settings - parsed event_settings JSONB
 * @returns {Promise<null | {
 *   activities: Array<{ id: string, kind: string, displayName: string }>,
 *   overridesByPilot: Record<string, string>
 * }>}
 */
async function fetchActivityData(supabase, eventId, settings) {
  if (!eventId || !settings || settings.groupByActivity !== true) return null;

  try {
    const { data: activities, error } = await supabase
      .from('event_activities')
      .select('*')
      .eq('event_id', eventId)
      .order('display_order');

    if (error || !activities || activities.length === 0) return null;

    const activityIds = activities.map(a => a.id);
    const { data: participants } = await supabase
      .from('event_activity_participants')
      .select('event_activity_id, pilot_id')
      .in('event_activity_id', activityIds);

    // Resolve display names for lesson and qualification activities using the
    // canonical "Syllabus - Week N - Mission" format
    const missionIds = activities.filter(a => a.syllabus_mission_id).map(a => a.syllabus_mission_id);
    const missionNames = {};
    if (missionIds.length > 0) {
      const { data: missions } = await supabase
        .from('training_syllabus_missions')
        .select('id, mission_name, week_number, training_syllabi(name)')
        .in('id', missionIds);
      (missions || []).forEach(m => {
        const syllabusName = m.training_syllabi?.name;
        const weekPart = m.week_number != null ? `Week ${m.week_number} - ` : '';
        missionNames[m.id] = `${syllabusName ? `${syllabusName} - ` : ''}${weekPart}${m.mission_name}`;
      });
    }

    const qualIds = activities.filter(a => a.qualification_id).map(a => a.qualification_id);
    const qualNames = {};
    if (qualIds.length > 0) {
      const { data: quals } = await supabase
        .from('qualifications')
        .select('id, name')
        .in('id', qualIds);
      (quals || []).forEach(q => { qualNames[q.id] = q.name; });
    }

    // Explicit organizer overrides: pilot_id -> event_activity_id
    const overridesByPilot = {};
    (participants || []).forEach(p => { overridesByPilot[p.pilot_id] = p.event_activity_id; });

    return {
      activities: activities.map(a => ({
        id: a.id,
        kind: a.kind,
        displayName: a.label
          || (a.kind === 'lesson'
            ? (missionNames[a.syllabus_mission_id] || 'Syllabus Lesson')
            : a.kind === 'qualification'
              ? (qualNames[a.qualification_id] ? `${qualNames[a.qualification_id]} Pursuit` : 'Qualification Pursuit')
              : 'Objectives')
      })),
      overridesByPilot
    };
  } catch (err) {
    console.warn(`[ACTIVITY-DATA] Error fetching activity data for event ${eventId}:`, err.message);
    return null;
  }
}

module.exports = { fetchActivityData };
