import { supabase } from './supabaseClient';
import { dateInputToLocalDate } from './dateUtils';

// ---------- Types ----------

export type TimelineEventType =
  | 'squadron'
  | 'billet'
  | 'qualification'
  | 'standing'
  | 'status'
  | 'graduation'
  | 'cruise';

export interface TimelineEvent {
  id: string;
  date: string; // ISO date string
  type: TimelineEventType;
  title: string;
  subtitle?: string;
  // Underlying database record; present when the entry can be edited/deleted
  // in edit mode. dateColumn is the column this entry's date comes from.
  source?: { table: string; id: string; dateColumn: string };
}

// Scope filter for statistics/trap sheet/attendance drill-down.
// Empty = career, cycleId = one cycle, cycleId+eventId = one event.
export interface DossierScope {
  cycleId?: string;
  eventId?: string;
}

export interface DossierPilotOption {
  id: string;
  callsign: string;
  boardNumber: number | string;
  squadronId: string | null;
  squadronDesignation: string | null;
  wingId: string | null;
}

export interface DossierEventOption {
  id: string;
  name: string;
  start_datetime: string | null;
}

export interface DossierAttendance {
  totalEvents: number;    // published events in scope
  attended: number;       // marked Present during roll call
  absent: number;         // marked Absent during roll call
  notRecorded: number;    // no roll call result for this pilot
  attendanceRate: number | null; // attended / totalEvents
  recent: Array<{
    eventId: string;
    name: string;
    date: string | null;
    response: 'present' | 'absent' | 'not-recorded';
  }>;
}

export interface DossierQualification {
  id: string;
  name: string;
  code?: string | null;
  color?: string | null;
  achieved_date: string | null;
}

export interface DossierTeam {
  id: string;
  name: string;
  start_date: string | null;
}

export interface DossierEnrollment {
  id: string;
  cycleName: string;
  status: string | null;
  enrolledAt: string | null;
}

export interface DossierProfile {
  squadron?: {
    id: string;
    name: string;
    designation: string;
    tail_code?: string | null;
    insignia_url?: string | null;
  } | null;
  statusName?: string | null;
  standingName?: string | null;
  roleName?: string | null;
  roleIsActing?: boolean;
  qualifications: DossierQualification[];
  teams: DossierTeam[];
  enrollments: DossierEnrollment[];
  timeline: TimelineEvent[];
}

export interface DossierStats {
  a2aKills: number;
  a2gKills: number;
  a2sKills: number;
  cruisesCompleted: number;
  traps: number;
  nightTraps: number;
  landings: number | null; // Not currently tracked
}

export interface DossierCycle {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface TrapRecord {
  id: string;
  mission_id: string | null;
  pass_time: string | null;
  created_at: string | null;
  overall_grade: string | null;
  grade_points: number | null;
  wire_number: number | null;
  outcome_type: string | null;
  is_night: boolean | null;
  groove_time_seconds: number | null;
  deviations: any;
  lso_comment: string | null;
  remarks: string | null;
  aircraft_type: string | null;
  fuel_state: number | null;
  grading_lso_id: string | null;
}

// ---------- Cycles / Events (scope drill-down) ----------

export async function getDossierCycles(): Promise<{ data: DossierCycle[] | null; error: any }> {
  const { data, error } = await supabase
    .from('cycles')
    .select('id, name, type, status, start_date, end_date')
    .order('start_date', { ascending: false });

  return { data: data as DossierCycle[] | null, error };
}

export async function getCycleEvents(cycleId: string): Promise<{ data: DossierEventOption[] | null; error: any }> {
  const { data, error } = await supabase
    .from('events')
    .select('id, name, start_datetime')
    .eq('cycle_id', cycleId)
    .order('start_datetime', { ascending: false });

  return { data: data as DossierEventOption[] | null, error };
}

// ---------- Pilot selector ----------

/**
 * Pilots available for dossier viewing, with their active squadron/wing for
 * client-side scope filtering. RLS on the pilots table provides the actual
 * enforcement; this only shapes the picker.
 */
export async function getDossierPilotList(): Promise<{ data: DossierPilotOption[] | null; error: any }> {
  try {
    const [pilotsRes, assignmentsRes] = await Promise.all([
      supabase
        .from('pilots')
        .select('id, callsign, boardNumber')
        .order('callsign'),
      supabase
        .from('pilot_assignments')
        .select('pilot_id, end_date, squadron:squadron_id (id, designation, wing_id)')
        .is('end_date', null)
    ]);

    if (pilotsRes.error) return { data: null, error: pilotsRes.error };

    const assignmentByPilot: Record<string, any> = {};
    ((assignmentsRes.data || []) as any[]).forEach(a => {
      if (a.squadron) assignmentByPilot[a.pilot_id] = a.squadron;
    });

    const options: DossierPilotOption[] = (pilotsRes.data || []).map(p => {
      const squadron = assignmentByPilot[p.id];
      return {
        id: p.id,
        callsign: p.callsign,
        boardNumber: p.boardNumber,
        squadronId: squadron?.id || null,
        squadronDesignation: squadron?.designation || null,
        wingId: squadron?.wing_id || null
      };
    });

    return { data: options, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

// ---------- Cruise participation ----------

/**
 * Returns the completed Cruise-type cycles the pilot participated in.
 * A cruise counts when the pilot attended at least one of its events
 * (roll call Present, or an accepted RSVP when no roll call was taken).
 * Training and other cycle types never count.
 */
export async function getCompletedCruises(discordId: string | null): Promise<DossierCycle[]> {
  try {
    const { data: cruiseCycles, error: cyclesError } = await supabase
      .from('cycles')
      .select('id, name, type, status, start_date, end_date')
      .ilike('type', 'cruise%')
      .eq('status', 'completed');

    if (cyclesError || !cruiseCycles || cruiseCycles.length === 0 || !discordId) return [];

    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, cycle_id, discord_event_id')
      .in('cycle_id', cruiseCycles.map(c => c.id));

    if (eventsError || !events || events.length === 0) return [];

    const { data: attendance, error: attendanceError } = await supabase
      .from('discord_event_attendance')
      .select('discord_event_id, user_response, roll_call_response')
      .eq('discord_id', discordId);

    if (attendanceError || !attendance || attendance.length === 0) return [];

    const attendedMessageIds = attendance
      .filter(a => a.roll_call_response === 'Present' || (!a.roll_call_response && a.user_response === 'accepted'))
      .map(a => a.discord_event_id)
      .filter(Boolean) as string[];

    if (attendedMessageIds.length === 0) return [];

    // discord_event_id on events is JSONB whose shape varies (single/multi-channel
    // publications), so match attendance message IDs against the serialized value.
    const participatedCycleIds = new Set<string>();
    for (const event of events) {
      if (!event.cycle_id || participatedCycleIds.has(event.cycle_id)) continue;
      const serialized = JSON.stringify(event.discord_event_id || '');
      if (attendedMessageIds.some(id => serialized.includes(id))) {
        participatedCycleIds.add(event.cycle_id);
      }
    }

    return (cruiseCycles as DossierCycle[]).filter(c => participatedCycleIds.has(c.id));
  } catch (error) {
    console.error('Error computing completed cruises:', error);
    return [];
  }
}

// ---------- Stats ----------

/**
 * Returns the mission IDs covered by a scope (via events linked to missions),
 * or null when the scope is career-wide (no filtering).
 */
export async function getScopeMissionIds(scope: DossierScope): Promise<string[] | null> {
  if (!scope.cycleId && !scope.eventId) return null;

  let eventIds: string[];
  if (scope.eventId) {
    eventIds = [scope.eventId];
  } else {
    const { data: events } = await supabase
      .from('events')
      .select('id')
      .eq('cycle_id', scope.cycleId!);
    eventIds = (events || []).map(e => e.id);
  }

  if (eventIds.length === 0) return [];

  const { data: missions } = await supabase
    .from('missions')
    .select('id')
    .in('event_id', eventIds);

  return (missions || []).map(m => m.id);
}

export async function getDossierStats(
  pilotId: string,
  discordId: string | null,
  scope: DossierScope = {}
): Promise<{ data: DossierStats | null; error: any }> {
  try {
    const cycleMissionIds = await getScopeMissionIds(scope);

    // --- Kills ---
    let killsQuery = supabase
      .from('pilot_kills')
      .select('id, mission_id, air_to_air_kills, air_to_ground_kills, kills_detail')
      .eq('pilot_id', pilotId);

    if (cycleMissionIds) {
      if (cycleMissionIds.length === 0) {
        killsQuery = killsQuery.in('mission_id', ['00000000-0000-0000-0000-000000000000']);
      } else {
        killsQuery = killsQuery.in('mission_id', cycleMissionIds);
      }
    }

    const { data: kills, error: killsError } = await killsQuery;
    if (killsError) return { data: null, error: killsError };

    // Resolve unit types referenced in detailed kill records to A2A/A2G/A2S
    const unitTypeIds = new Set<string>();
    (kills || []).forEach(k => {
      if (Array.isArray(k.kills_detail)) {
        k.kills_detail.forEach((d: any) => d?.unit_type_id && unitTypeIds.add(d.unit_type_id));
      }
    });

    const unitTypeCategories: Record<string, string> = {};
    if (unitTypeIds.size > 0) {
      const { data: unitTypes } = await supabase
        .from('dcs_unit_types')
        .select('id, kill_category')
        .in('id', Array.from(unitTypeIds));
      (unitTypes || []).forEach(ut => {
        unitTypeCategories[ut.id] = ut.kill_category;
      });
    }

    let a2aKills = 0;
    let a2gKills = 0;
    let a2sKills = 0;

    (kills || []).forEach(k => {
      if (Array.isArray(k.kills_detail) && k.kills_detail.length > 0) {
        k.kills_detail.forEach((d: any) => {
          const count = d?.kill_count || 0;
          const category = d?.unit_type_id ? unitTypeCategories[d.unit_type_id] : undefined;
          if (category === 'A2A') a2aKills += count;
          else if (category === 'A2S') a2sKills += count;
          else a2gKills += count;
        });
      } else {
        // Phase 1 records only carry simple counts
        a2aKills += k.air_to_air_kills || 0;
        a2gKills += k.air_to_ground_kills || 0;
      }
    });

    // --- Traps ---
    // Note: lso_grades/graduation_records/training_enrollments are newer tables
    // not present in the generated supabase types yet, hence the casts.
    let trapsQuery = (supabase as any)
      .from('lso_grades')
      .select('id, wire_number, is_night, outcome_type')
      .eq('pilot_id', pilotId);

    if (cycleMissionIds) {
      if (cycleMissionIds.length === 0) {
        trapsQuery = trapsQuery.in('mission_id', ['00000000-0000-0000-0000-000000000000']);
      } else {
        trapsQuery = trapsQuery.in('mission_id', cycleMissionIds);
      }
    }

    const { data: grades } = await trapsQuery;
    const trapPasses = ((grades || []) as any[]).filter(g => g.wire_number != null);
    const traps = trapPasses.length;
    const nightTraps = trapPasses.filter(g => g.is_night).length;

    // --- Cruises ---
    const completedCruises = await getCompletedCruises(discordId);
    const cruisesCompleted = scope.cycleId
      ? (completedCruises.some(c => c.id === scope.cycleId) ? 1 : 0)
      : completedCruises.length;

    return {
      data: {
        a2aKills,
        a2gKills,
        a2sKills,
        cruisesCompleted,
        traps,
        nightTraps,
        landings: null
      },
      error: null
    };
  } catch (error) {
    return { data: null, error };
  }
}

// ---------- Traps ----------

export async function getPilotTraps(pilotId: string, limit: number = 50): Promise<{ data: TrapRecord[] | null; error: any }> {
  const { data, error } = await (supabase as any)
    .from('lso_grades')
    .select('*')
    .eq('pilot_id', pilotId)
    .order('pass_time', { ascending: false, nullsFirst: false })
    .limit(limit);

  return { data: data as TrapRecord[] | null, error };
}

// ---------- Attendance ----------

export async function getDossierAttendance(
  discordId: string | null,
  scope: DossierScope = {}
): Promise<{ data: DossierAttendance | null; error: any }> {
  try {
    const empty: DossierAttendance = {
      totalEvents: 0,
      attended: 0,
      absent: 0,
      notRecorded: 0,
      attendanceRate: null,
      recent: []
    };

    // Events in scope that have already occurred
    let eventsQuery = supabase
      .from('events')
      .select('id, name, start_datetime, discord_event_id, cycle_id')
      .lte('start_datetime', new Date().toISOString())
      .order('start_datetime', { ascending: false });

    if (scope.eventId) {
      eventsQuery = eventsQuery.eq('id', scope.eventId);
    } else if (scope.cycleId) {
      eventsQuery = eventsQuery.eq('cycle_id', scope.cycleId);
    }

    const { data: events, error: eventsError } = await eventsQuery;
    if (eventsError) return { data: null, error: eventsError };
    if (!events || events.length === 0) return { data: empty, error: null };

    // Only consider events that were actually published to Discord —
    // unpublished events had no attendance to take.
    const publishedEvents = events.filter(e => {
      const serialized = JSON.stringify(e.discord_event_id || '');
      return serialized && serialized !== '""' && serialized !== 'null' && serialized !== '{}' && serialized !== '[]';
    });
    if (publishedEvents.length === 0) return { data: empty, error: null };

    if (!discordId) {
      return {
        data: {
          ...empty,
          totalEvents: publishedEvents.length,
          notRecorded: publishedEvents.length,
          attendanceRate: 0
        },
        error: null
      };
    }

    const { data: attendance, error: attendanceError } = await supabase
      .from('discord_event_attendance')
      .select('discord_event_id, roll_call_response')
      .eq('discord_id', discordId);

    if (attendanceError) return { data: null, error: attendanceError };

    // Attendance rows key on Discord message IDs; events store their published
    // message IDs in a JSONB whose shape varies, so match by serialized inclusion.
    // Only roll call results count — RSVP responses are ignored.
    const responseFor = (event: any): 'present' | 'absent' | 'not-recorded' => {
      const serialized = JSON.stringify(event.discord_event_id || '');
      const rows = (attendance || []).filter(a => a.discord_event_id && serialized.includes(a.discord_event_id));
      if (rows.some(r => r.roll_call_response === 'Present')) return 'present';
      if (rows.some(r => r.roll_call_response === 'Absent')) return 'absent';
      return 'not-recorded';
    };

    const result: DossierAttendance = {
      ...empty,
      totalEvents: publishedEvents.length
    };

    publishedEvents.forEach(event => {
      const response = responseFor(event);
      if (response === 'present') result.attended += 1;
      else if (response === 'absent') result.absent += 1;
      else result.notRecorded += 1;

      if (result.recent.length < 10) {
        result.recent.push({
          eventId: event.id,
          name: event.name || 'Unnamed event',
          date: event.start_datetime,
          response
        });
      }
    });

    result.attendanceRate = result.totalEvents > 0 ? result.attended / result.totalEvents : null;

    return { data: result, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

// ---------- Timeline record cleanup (edit mode) ----------

const DELETABLE_TIMELINE_TABLES = [
  'pilot_assignments',
  'pilot_roles',
  'pilot_qualifications',
  'pilot_standings',
  'pilot_statuses'
] as const;

/**
 * Deletes an erroneous history record backing a timeline entry. RLS policies
 * on each table (manage_roster / manage_standings / edit_pilot_qualifications)
 * are the actual enforcement; the UI additionally gates on edit_pilot_dossiers.
 */
export async function deleteTimelineRecord(table: string, id: string): Promise<{ success: boolean; error: any }> {
  if (!(DELETABLE_TIMELINE_TABLES as readonly string[]).includes(table)) {
    return { success: false, error: new Error(`Records from ${table} cannot be deleted from the dossier`) };
  }

  // .select() returns the affected rows — RLS-blocked writes "succeed" with
  // zero rows and no error, so an empty result means the policy denied it.
  const { data, error } = await (supabase as any)
    .from(table)
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error };
  if (!data || data.length === 0) {
    return {
      success: false,
      error: new Error('The record was not deleted. You may not have permission to edit this pilot\'s history.')
    };
  }
  return { success: true, error: null };
}

// Editable date columns per table. achieved_date is a timestamptz; the rest
// are plain dates.
const EDITABLE_DATE_COLUMNS: Record<string, string[]> = {
  pilot_assignments: ['start_date', 'end_date'],
  pilot_roles: ['effective_date', 'end_date'],
  pilot_qualifications: ['achieved_date'],
  pilot_standings: ['start_date'],
  pilot_statuses: ['start_date']
};

const TIMESTAMP_DATE_COLUMNS = new Set(['achieved_date']);

/**
 * Changes the date on a history record backing a timeline entry.
 * dateInput is a YYYY-MM-DD string from a date picker. RLS provides the
 * actual enforcement, as with deleteTimelineRecord.
 */
export async function updateTimelineRecordDate(
  table: string,
  id: string,
  column: string,
  dateInput: string
): Promise<{ success: boolean; error: any }> {
  const allowedColumns = EDITABLE_DATE_COLUMNS[table];
  if (!allowedColumns || !allowedColumns.includes(column)) {
    return { success: false, error: new Error(`The date on ${table}.${column} cannot be edited from the dossier`) };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return { success: false, error: new Error('Invalid date') };
  }

  const value = TIMESTAMP_DATE_COLUMNS.has(column)
    ? dateInputToLocalDate(dateInput).toISOString()
    : dateInput;

  // See deleteTimelineRecord: empty result = RLS denied the write
  const { data, error } = await (supabase as any)
    .from(table)
    .update({ [column]: value })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error };
  if (!data || data.length === 0) {
    return {
      success: false,
      error: new Error('The date was not updated. You may not have permission to edit this pilot\'s history.')
    };
  }
  return { success: true, error: null };
}

// ---------- Last mission flown (scope shortcut) ----------

/**
 * Finds the most recent completed event the pilot attended (roll call
 * Present, or an accepted RSVP when no roll call was taken) and returns a
 * scope pointing at it. Returns null when nothing is found.
 */
export async function getLastFlownScope(discordId: string | null): Promise<DossierScope | null> {
  if (!discordId) return null;
  try {
    const [eventsRes, attendanceRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, cycle_id, start_datetime, discord_event_id')
        .eq('status', 'completed')
        .order('start_datetime', { ascending: false, nullsFirst: false })
        .limit(200),
      supabase
        .from('discord_event_attendance')
        .select('discord_event_id, user_response, roll_call_response')
        .eq('discord_id', discordId)
    ]);

    const events = eventsRes.data || [];
    const attendance = attendanceRes.data || [];
    if (events.length === 0 || attendance.length === 0) return null;

    const attendedMessageIds = attendance
      .filter(a => a.roll_call_response === 'Present' || (!a.roll_call_response && a.user_response === 'accepted'))
      .map(a => a.discord_event_id)
      .filter(Boolean) as string[];
    if (attendedMessageIds.length === 0) return null;

    // Events are already newest-first; take the first attended one that has a
    // cycle (the scope card can't represent an event outside a cycle).
    const lastAttended = events.find(event => {
      if (!event.cycle_id) return false;
      const serialized = JSON.stringify(event.discord_event_id || '');
      return attendedMessageIds.some(id => serialized.includes(id));
    });

    if (!lastAttended) return null;
    return { cycleId: lastAttended.cycle_id!, eventId: lastAttended.id };
  } catch (error) {
    console.error('Error finding last attended mission:', error);
    return null;
  }
}

// ---------- Profile + Timeline ----------

export async function getDossierProfile(pilotId: string, discordId: string | null): Promise<{ data: DossierProfile | null; error: any }> {
  try {
    const [assignmentsRes, rolesRes, qualsRes, standingsRes, statusesRes, gradsRes, teamsRes, enrollmentsRes] = await Promise.all([
      supabase
        .from('pilot_assignments')
        .select('id, start_date, end_date, squadron:squadron_id (id, name, designation, tail_code, insignia_url, wing_id)')
        .eq('pilot_id', pilotId)
        .order('start_date', { ascending: true }),
      supabase
        .from('pilot_roles')
        .select('id, effective_date, end_date, is_acting, role:role_id (id, name)')
        .eq('pilot_id', pilotId)
        .order('effective_date', { ascending: true }),
      supabase
        .from('pilot_qualifications')
        .select('id, achieved_date, is_current, qualification:qualification_id (id, name, code, color)')
        .eq('pilot_id', pilotId),
      supabase
        .from('pilot_standings')
        .select('id, start_date, end_date, standing:standing_id (id, name)')
        .eq('pilot_id', pilotId)
        .order('start_date', { ascending: true }),
      supabase
        .from('pilot_statuses')
        .select('id, start_date, end_date, status:status_id (id, name)')
        .eq('pilot_id', pilotId)
        .order('start_date', { ascending: true }),
      (supabase as any)
        .from('graduation_records')
        .select('id, graduated_at, syllabus:syllabus_id (id, name)')
        .eq('student_pilot_id', pilotId),
      supabase
        .from('pilot_teams')
        .select('id, start_date, end_date, team:team_id (id, name)')
        .eq('pilot_id', pilotId),
      (supabase as any)
        .from('training_enrollments')
        .select('id, status, enrolled_at, cycle:cycle_id (id, name)')
        .eq('pilot_id', pilotId)
    ]);

    const assignments = (assignmentsRes.data || []) as any[];
    const roleRecords = (rolesRes.data || []) as any[];
    const qualRecords = (qualsRes.data || []) as any[];
    const standingRecords = (standingsRes.data || []) as any[];
    const statusRecords = (statusesRes.data || []) as any[];
    const gradRecords = (gradsRes.data || []) as any[];
    const teamRecords = (teamsRes.data || []) as any[];
    const enrollmentRecords = (enrollmentsRes.data || []) as any[];

    const today = new Date().toISOString().split('T')[0];
    const isActive = (endDate: string | null) => !endDate || endDate >= today;

    // --- Current details ---
    const currentAssignment = assignments.filter(a => isActive(a.end_date)).pop();
    const currentStanding = standingRecords.filter(s => isActive(s.end_date)).pop();
    const currentStatus = statusRecords.filter(s => isActive(s.end_date)).pop();
    const activeRoles = roleRecords
      .filter(r => isActive(r.end_date))
      .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());
    const currentRole = activeRoles[0];

    const qualifications: DossierQualification[] = qualRecords
      .filter(q => q.is_current && q.qualification)
      .map(q => ({
        id: q.id,
        name: q.qualification.name,
        code: q.qualification.code,
        color: q.qualification.color,
        achieved_date: q.achieved_date
      }))
      .sort((a, b) => (a.achieved_date || '').localeCompare(b.achieved_date || ''));

    const teams: DossierTeam[] = teamRecords
      .filter(t => !t.end_date && t.team)
      .map(t => ({ id: t.id, name: t.team.name, start_date: t.start_date }));

    const enrollments: DossierEnrollment[] = enrollmentRecords
      .filter(e => e.cycle)
      .map(e => ({
        id: e.id,
        cycleName: e.cycle.name,
        status: e.status,
        enrolledAt: e.enrolled_at
      }));

    // --- Timeline ---
    const timeline: TimelineEvent[] = [];

    assignments.forEach((a, index) => {
      const designation = a.squadron?.designation || 'squadron';
      if (a.start_date) {
        timeline.push({
          id: `assignment-start-${a.id}`,
          date: a.start_date,
          type: 'squadron',
          title: index === 0 ? `Joined ${designation}` : `Transferred to ${designation}`,
          subtitle: a.squadron?.name || undefined,
          source: { table: 'pilot_assignments', id: a.id, dateColumn: 'start_date' }
        });
      }
      // Only surface departures that were not immediately followed by a new assignment
      if (a.end_date && a.end_date < today) {
        const hasFollowOn = assignments.some(
          other => other.id !== a.id && other.start_date && other.start_date >= a.end_date
        );
        if (!hasFollowOn) {
          timeline.push({
            id: `assignment-end-${a.id}`,
            date: a.end_date,
            type: 'squadron',
            title: `Departed ${designation}`,
            subtitle: a.squadron?.name || undefined,
            source: { table: 'pilot_assignments', id: a.id, dateColumn: 'end_date' }
          });
        }
      }
    });

    roleRecords.forEach(r => {
      if (!r.role) return;
      const acting = r.is_acting ? ' (Acting)' : '';
      if (r.effective_date) {
        timeline.push({
          id: `role-start-${r.id}`,
          date: r.effective_date,
          type: 'billet',
          title: `Assumed billet: ${r.role.name}${acting}`,
          source: { table: 'pilot_roles', id: r.id, dateColumn: 'effective_date' }
        });
      }
      if (r.end_date && r.end_date < today) {
        timeline.push({
          id: `role-end-${r.id}`,
          date: r.end_date,
          type: 'billet',
          title: `Completed tour as ${r.role.name}`,
          source: { table: 'pilot_roles', id: r.id, dateColumn: 'end_date' }
        });
      }
    });

    // Qualification history can contain superseded rows for the same award;
    // dedupe on name + achieved date so re-instated quals don't repeat.
    const seenQuals = new Set<string>();
    qualRecords.forEach(q => {
      if (!q.qualification || !q.achieved_date) return;
      const dateOnly = q.achieved_date.split('T')[0];
      const key = `${q.qualification.name}-${dateOnly}`;
      if (seenQuals.has(key)) return;
      seenQuals.add(key);
      timeline.push({
        id: `qual-${q.id}`,
        date: q.achieved_date,
        type: 'qualification',
        title: `Earned ${q.qualification.name} qualification`,
        source: { table: 'pilot_qualifications', id: q.id, dateColumn: 'achieved_date' }
      });
    });

    standingRecords.forEach((s, index) => {
      if (!s.standing || !s.start_date) return;
      timeline.push({
        id: `standing-${s.id}`,
        date: s.start_date,
        type: 'standing',
        title: index === 0 ? `Initial standing: ${s.standing.name}` : `Standing changed to ${s.standing.name}`,
        source: { table: 'pilot_standings', id: s.id, dateColumn: 'start_date' }
      });
    });

    statusRecords.forEach((s, index) => {
      if (!s.status || !s.start_date) return;
      timeline.push({
        id: `status-${s.id}`,
        date: s.start_date,
        type: 'status',
        title: index === 0 ? `Initial status: ${s.status.name}` : `Status changed to ${s.status.name}`,
        source: { table: 'pilot_statuses', id: s.id, dateColumn: 'start_date' }
      });
    });

    gradRecords.forEach(g => {
      if (!g.graduated_at) return;
      timeline.push({
        id: `grad-${g.id}`,
        date: g.graduated_at,
        type: 'graduation',
        title: `Graduated: ${g.syllabus?.name || 'Training syllabus'}`
      });
    });

    const completedCruises = await getCompletedCruises(discordId);
    completedCruises.forEach(c => {
      if (!c.end_date) return;
      timeline.push({
        id: `cruise-${c.id}`,
        date: c.end_date,
        type: 'cruise',
        title: `Completed ${c.name}`
      });
    });

    // Newest first
    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      data: {
        squadron: currentAssignment?.squadron || null,
        statusName: currentStatus?.status?.name || null,
        standingName: currentStanding?.standing?.name || null,
        roleName: currentRole?.role?.name || null,
        roleIsActing: currentRole?.is_acting || false,
        qualifications,
        teams,
        enrollments,
        timeline
      },
      error: null
    };
  } catch (error) {
    return { data: null, error };
  }
}
