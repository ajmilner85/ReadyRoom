import { supabase } from './supabaseClient';

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

// ---------- Cycles ----------

export async function getDossierCycles(): Promise<{ data: DossierCycle[] | null; error: any }> {
  const { data, error } = await supabase
    .from('cycles')
    .select('id, name, type, status, start_date, end_date')
    .order('start_date', { ascending: false });

  return { data: data as DossierCycle[] | null, error };
}

// ---------- Cruise participation ----------

/**
 * Returns the completed Cruise-type cycles the pilot participated in.
 * Participation is inferred from Discord event attendance (accepted response
 * or roll call presence) on any event belonging to the cycle.
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
      .filter(a => a.user_response === 'accepted' || a.roll_call_response === 'Present' || (!a.user_response && !a.roll_call_response))
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

/** Returns the mission IDs belonging to a cycle (via events linked to missions). */
async function getCycleMissionIds(cycleId: string): Promise<string[]> {
  const { data: events } = await supabase
    .from('events')
    .select('id')
    .eq('cycle_id', cycleId);

  if (!events || events.length === 0) return [];

  const { data: missions } = await supabase
    .from('missions')
    .select('id')
    .in('event_id', events.map(e => e.id));

  return (missions || []).map(m => m.id);
}

export async function getDossierStats(
  pilotId: string,
  discordId: string | null,
  cycleId?: string
): Promise<{ data: DossierStats | null; error: any }> {
  try {
    let cycleMissionIds: string[] | null = null;
    if (cycleId) {
      cycleMissionIds = await getCycleMissionIds(cycleId);
    }

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
    const cruisesCompleted = cycleId
      ? (completedCruises.some(c => c.id === cycleId) ? 1 : 0)
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

// ---------- Profile + Timeline ----------

export async function getDossierProfile(pilotId: string, discordId: string | null): Promise<{ data: DossierProfile | null; error: any }> {
  try {
    const [assignmentsRes, rolesRes, qualsRes, standingsRes, statusesRes, gradsRes, teamsRes, enrollmentsRes] = await Promise.all([
      supabase
        .from('pilot_assignments')
        .select('id, start_date, end_date, squadron:squadron_id (id, name, designation, tail_code, insignia_url)')
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
          subtitle: a.squadron?.name || undefined
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
            subtitle: a.squadron?.name || undefined
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
          title: `Assumed billet: ${r.role.name}${acting}`
        });
      }
      if (r.end_date && r.end_date < today) {
        timeline.push({
          id: `role-end-${r.id}`,
          date: r.end_date,
          type: 'billet',
          title: `Completed tour as ${r.role.name}`
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
        title: `Earned ${q.qualification.name} qualification`
      });
    });

    standingRecords.forEach((s, index) => {
      if (!s.standing || !s.start_date) return;
      timeline.push({
        id: `standing-${s.id}`,
        date: s.start_date,
        type: 'standing',
        title: index === 0 ? `Initial standing: ${s.standing.name}` : `Standing changed to ${s.standing.name}`
      });
    });

    statusRecords.forEach((s, index) => {
      if (!s.status || !s.start_date) return;
      timeline.push({
        id: `status-${s.id}`,
        date: s.start_date,
        type: 'status',
        title: index === 0 ? `Initial status: ${s.status.name}` : `Status changed to ${s.status.name}`
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
