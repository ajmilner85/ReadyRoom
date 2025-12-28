/**
 * Training Enrollment Service
 *
 * Handles enrollment of pilots in training cycles with configurable auto-enrollment
 * based on syllabus rules (standing, status, qualification criteria).
 */

// @ts-nocheck
import { supabase } from './supabaseClient';
import { getBatchPilotQualifications } from './qualificationService';

export interface EnrollmentRule {
  type: 'standing' | 'status' | 'qualification';
  value: string;
}

export interface Enrollment {
  id: string;
  cycle_id: string;
  pilot_id: string;
  enrolled_at: string;
  enrolled_by: string | null;
  status: 'active' | 'completed' | 'dropped' | 'graduated';
  status_changed_at: string | null;
  status_changed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnrolledPilot {
  enrollment_id: string;
  pilot_id: string;
  callsign: string;
  board_number: string | null;
  squadron: {
    id: string;
    tail_code: string;
    insignia_url: string | null;
    primary_color: string;
  } | null;
  status: 'active' | 'completed' | 'dropped' | 'graduated';
  enrolled_at: string;
  // Pilot attributes for filtering
  currentStatus?: { id: string; name: string; isActive: boolean } | null;
  currentStanding?: { id: string; name: string } | null;
  roles?: { role: { id: string; name: string; exclusivity_scope: string | null } }[];
  qualifications?: { qualification: { id: string; type: string; code: string; color: string | null } }[];
}

/**
 * Get pilots suggested for enrollment based on syllabus auto-enrollment rules
 */
export async function getSuggestedEnrollments(syllabusId: string): Promise<EnrolledPilot[]> {
  try {
    // Get syllabus auto-enrollment rules
    const { data: syllabus, error: syllabusError } = await supabase
      .from('training_syllabi')
      .select('auto_enrollment_rules')
      .eq('id', syllabusId)
      .single();

    if (syllabusError) throw syllabusError;

    const rules = syllabus?.auto_enrollment_rules as EnrollmentRule[] || [];
    if (rules.length === 0) {
      return [];
    }

    // Build queries for each rule type
    const standingRules = rules.filter(r => r.type === 'standing');
    const statusRules = rules.filter(r => r.type === 'status');
    const qualificationRules = rules.filter(r => r.type === 'qualification');

    let pilotIds = new Set<string>();

    // Run all rule queries in parallel for better performance
    await Promise.all([
      // Get pilots matching standing rules
      (async () => {
        if (standingRules.length > 0) {
          const standingNames = standingRules.map(r => r.value);
          const { data: standings } = await supabase
            .from('standings')
            .select('id')
            .in('name', standingNames);

          if (standings && standings.length > 0) {
            const standingIds = standings.map(s => s.id);
            const { data: pilotStandings } = await supabase
              .from('pilot_standings')
              .select('pilot_id')
              .in('standing_id', standingIds)
              .is('end_date', null);

            pilotStandings?.forEach(ps => pilotIds.add(ps.pilot_id));
          }
        }
      })(),

      // Get pilots matching status rules
      (async () => {
        if (statusRules.length > 0) {
          const statusNames = statusRules.map(r => r.value);
          const { data: statuses } = await supabase
            .from('statuses')
            .select('id')
            .in('name', statusNames);

          if (statuses && statuses.length > 0) {
            const statusIds = statuses.map(s => s.id);
            const { data: pilotStatuses } = await supabase
              .from('pilot_statuses')
              .select('pilot_id')
              .in('status_id', statusIds)
              .is('end_date', null);

            pilotStatuses?.forEach(ps => pilotIds.add(ps.pilot_id));
          }
        }
      })(),

      // Get pilots matching qualification rules
      (async () => {
        if (qualificationRules.length > 0) {
          const qualTypes = qualificationRules.map(r => r.value);
          const { data: qualifications } = await supabase
            .from('qualifications')
            .select('id')
            .in('type', qualTypes);

          if (qualifications && qualifications.length > 0) {
            const qualIds = qualifications.map(q => q.id);
            const { data: pilotQuals } = await supabase
              .from('pilot_qualifications')
              .select('pilot_id')
              .in('qualification_id', qualIds)
              .is('end_date', null);

            pilotQuals?.forEach(pq => pilotIds.add(pq.pilot_id));
          }
        }
      })()
    ]);

    if (pilotIds.size === 0) {
      return [];
    }

    // Fetch full pilot details
    const { data: pilots, error: pilotsError } = await supabase
      .from('pilots')
      .select('id, callsign, boardNumber')
      .in('id', Array.from(pilotIds))
      .order('callsign');

    if (pilotsError) throw pilotsError;

    // Load all pilot data in parallel
    const [assignmentsData, statusesData, standingsData, rolesData, qualificationsDataMap] = await Promise.all([
      // Squadron assignments
      supabase
        .from('pilot_assignments')
        .select('pilot_id, org_squadrons(id, tail_code, insignia_url, color_palette)')
        .in('pilot_id', Array.from(pilotIds))
        .is('end_date', null),

      // Current status
      supabase
        .from('pilot_statuses')
        .select('pilot_id, statuses(id, name, isActive)')
        .in('pilot_id', Array.from(pilotIds))
        .is('end_date', null),

      // Current standing
      supabase
        .from('pilot_standings')
        .select('pilot_id, standings(id, name)')
        .in('pilot_id', Array.from(pilotIds))
        .is('end_date', null),

      // Roles
      supabase
        .from('pilot_roles')
        .select('pilot_id, roles(id, name, exclusivity_scope)')
        .in('pilot_id', Array.from(pilotIds))
        .is('end_date', null),

      // Qualifications - use cached batch loader
      getBatchPilotQualifications(Array.from(pilotIds))
    ]);

    // Build maps for each data type
    const squadronMap = new Map();
    (assignmentsData.data || []).forEach((assignment: any) => {
      if (assignment.org_squadrons) {
        squadronMap.set(assignment.pilot_id, {
          id: assignment.org_squadrons.id,
          tail_code: assignment.org_squadrons.tail_code,
          insignia_url: assignment.org_squadrons.insignia_url,
          primary_color: assignment.org_squadrons.color_palette?.primary || '#000000'
        });
      }
    });

    const statusMap = new Map();
    (statusesData.data || []).forEach((ps: any) => {
      if (ps.statuses) {
        statusMap.set(ps.pilot_id, {
          id: ps.statuses.id,
          name: ps.statuses.name,
          isActive: ps.statuses.isActive
        });
      }
    });

    const standingMap = new Map();
    (standingsData.data || []).forEach((ps: any) => {
      if (ps.standings) {
        standingMap.set(ps.pilot_id, {
          id: ps.standings.id,
          name: ps.standings.name
        });
      }
    });

    const rolesMap = new Map<string, any[]>();
    (rolesData.data || []).forEach((pr: any) => {
      if (pr.roles) {
        const existing = rolesMap.get(pr.pilot_id) || [];
        existing.push({
          role: {
            id: pr.roles.id,
            name: pr.roles.name,
            exclusivity_scope: pr.roles.exclusivity_scope
          }
        });
        rolesMap.set(pr.pilot_id, existing);
      }
    });

    // Convert qualificationsDataMap to the format expected by EnrolledPilot
    const qualificationsMap = new Map<string, any[]>();
    Object.entries(qualificationsDataMap).forEach(([pilotId, quals]) => {
      if (quals && quals.length > 0) {
        const formatted = quals.map((pq: any) => ({
          qualification: {
            id: pq.qualification.id,
            type: pq.qualification.name,
            code: pq.qualification.code,
            color: pq.qualification.color
          }
        }));
        qualificationsMap.set(pilotId, formatted);
      }
    });

    // Map to EnrolledPilot format
    return (pilots || []).map((pilot: any) => ({
      enrollment_id: '', // Not enrolled yet
      pilot_id: pilot.id,
      callsign: pilot.callsign,
      board_number: pilot.boardNumber,
      squadron: squadronMap.get(pilot.id) || null,
      status: 'active' as const,
      enrolled_at: new Date().toISOString(),
      currentStatus: statusMap.get(pilot.id) || null,
      currentStanding: standingMap.get(pilot.id) || null,
      roles: rolesMap.get(pilot.id) || [],
      qualifications: qualificationsMap.get(pilot.id) || []
    }));
  } catch (error) {
    console.error('Error getting suggested enrollments:', error);
    throw error;
  }
}

/**
 * Enroll multiple pilots in a cycle
 */
export async function enrollPilots(
  cycleId: string,
  pilotIds: string[],
  enrolledByUserId: string | null = null
): Promise<void> {
  try {
    const enrollments = pilotIds.map(pilotId => ({
      cycle_id: cycleId,
      pilot_id: pilotId,
      enrolled_by: enrolledByUserId,
      status: 'active',
      enrolled_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('training_enrollments')
      .insert(enrollments);

    if (error) throw error;
  } catch (error) {
    console.error('Error enrolling pilots:', error);
    throw error;
  }
}

/**
 * Update enrollment status
 */
export async function updateEnrollmentStatus(
  enrollmentId: string,
  status: 'active' | 'completed' | 'dropped' | 'graduated',
  changedByUserId: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('training_enrollments')
      .update({
        status,
        status_changed_at: new Date().toISOString(),
        status_changed_by: changedByUserId
      })
      .eq('id', enrollmentId);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating enrollment status:', error);
    throw error;
  }
}

/**
 * Remove enrollment
 */
export async function removeEnrollment(enrollmentId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('training_enrollments')
      .delete()
      .eq('id', enrollmentId);

    if (error) throw error;
  } catch (error) {
    console.error('Error removing enrollment:', error);
    throw error;
  }
}

/**
 * Get enrollments for a cycle with full pilot details
 */
export async function getCycleEnrollments(cycleId: string): Promise<EnrolledPilot[]> {
  try {
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('training_enrollments')
      .select(`
        id,
        pilot_id,
        status,
        enrolled_at,
        pilots!inner(id, callsign, boardNumber)
      `)
      .eq('cycle_id', cycleId)
      .order('enrolled_at');

    if (enrollmentsError) throw enrollmentsError;

    if (!enrollments || enrollments.length === 0) {
      return [];
    }

    const pilotIds = enrollments.map((e: any) => e.pilot_id);

    // Load all pilot data in parallel
    const [assignmentsData, statusesData, standingsData, rolesData, qualificationsDataMap] = await Promise.all([
      // Squadron assignments
      supabase
        .from('pilot_assignments')
        .select('pilot_id, org_squadrons(id, tail_code, insignia_url, color_palette)')
        .in('pilot_id', pilotIds)
        .is('end_date', null),

      // Current status
      supabase
        .from('pilot_statuses')
        .select('pilot_id, statuses(id, name, isActive)')
        .in('pilot_id', pilotIds)
        .is('end_date', null),

      // Current standing
      supabase
        .from('pilot_standings')
        .select('pilot_id, standings(id, name)')
        .in('pilot_id', pilotIds)
        .is('end_date', null),

      // Roles
      supabase
        .from('pilot_roles')
        .select('pilot_id, roles(id, name, exclusivity_scope)')
        .in('pilot_id', pilotIds)
        .is('end_date', null),

      // Qualifications - use cached batch loader
      getBatchPilotQualifications(pilotIds)
    ]);

    // Build maps for each data type
    const squadronMap = new Map();
    (assignmentsData.data || []).forEach((assignment: any) => {
      if (assignment.org_squadrons) {
        squadronMap.set(assignment.pilot_id, {
          id: assignment.org_squadrons.id,
          tail_code: assignment.org_squadrons.tail_code,
          insignia_url: assignment.org_squadrons.insignia_url,
          primary_color: assignment.org_squadrons.color_palette?.primary || '#000000'
        });
      }
    });

    const statusMap = new Map();
    (statusesData.data || []).forEach((ps: any) => {
      if (ps.statuses) {
        statusMap.set(ps.pilot_id, {
          id: ps.statuses.id,
          name: ps.statuses.name,
          isActive: ps.statuses.isActive
        });
      }
    });

    const standingMap = new Map();
    (standingsData.data || []).forEach((ps: any) => {
      if (ps.standings) {
        standingMap.set(ps.pilot_id, {
          id: ps.standings.id,
          name: ps.standings.name
        });
      }
    });

    const rolesMap = new Map<string, any[]>();
    (rolesData.data || []).forEach((pr: any) => {
      if (pr.roles) {
        const existing = rolesMap.get(pr.pilot_id) || [];
        existing.push({
          role: {
            id: pr.roles.id,
            name: pr.roles.name,
            exclusivity_scope: pr.roles.exclusivity_scope
          }
        });
        rolesMap.set(pr.pilot_id, existing);
      }
    });

    // Convert qualificationsDataMap to the format expected by EnrolledPilot
    const qualificationsMap = new Map<string, any[]>();
    Object.entries(qualificationsDataMap).forEach(([pilotId, quals]) => {
      if (quals && quals.length > 0) {
        const formatted = quals.map((pq: any) => ({
          qualification: {
            id: pq.qualification.id,
            type: pq.qualification.name,
            code: pq.qualification.code,
            color: pq.qualification.color
          }
        }));
        qualificationsMap.set(pilotId, formatted);
      }
    });

    return enrollments.map((enrollment: any) => ({
      enrollment_id: enrollment.id,
      pilot_id: enrollment.pilot_id,
      callsign: enrollment.pilots.callsign,
      board_number: enrollment.pilots.boardNumber,
      squadron: squadronMap.get(enrollment.pilot_id) || null,
      status: enrollment.status,
      enrolled_at: enrollment.enrolled_at,
      currentStatus: statusMap.get(enrollment.pilot_id) || null,
      currentStanding: standingMap.get(enrollment.pilot_id) || null,
      roles: rolesMap.get(enrollment.pilot_id) || [],
      qualifications: qualificationsMap.get(enrollment.pilot_id) || []
    }));
  } catch (error) {
    console.error('Error getting cycle enrollments:', error);
    throw error;
  }
}

/**
 * Get enrollment history for a pilot
 */
export async function getPilotEnrollmentHistory(pilotId: string): Promise<Enrollment[]> {
  try {
    const { data, error } = await supabase
      .from('training_enrollments')
      .select(`
        *,
        cycles!inner(name, start_date, end_date)
      `)
      .eq('pilot_id', pilotId)
      .order('enrolled_at', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting pilot enrollment history:', error);
    throw error;
  }
}

/**
 * Check if a pilot is already enrolled in a cycle
 */
export async function isPilotEnrolled(cycleId: string, pilotId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('training_enrollments')
      .select('id')
      .eq('cycle_id', cycleId)
      .eq('pilot_id', pilotId)
      .maybeSingle();

    if (error) throw error;

    return data !== null;
  } catch (error) {
    console.error('Error checking enrollment:', error);
    return false;
  }
}

/**
 * Get enrollment count for a cycle
 */
export async function getCycleEnrollmentCount(cycleId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('training_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('cycle_id', cycleId);

    if (error) throw error;

    return count || 0;
  } catch (error) {
    console.error('Error getting enrollment count:', error);
    return 0;
  }
}
