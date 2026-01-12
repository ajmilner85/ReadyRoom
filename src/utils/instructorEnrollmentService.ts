/**
 * Instructor Enrollment Service
 *
 * Handles enrollment of instructors in training cycles with configurable
 * qualification rules based on block-based criteria (standing, status, qualification).
 * 
 * Rule Format: Array of blocks, where blocks are OR'd together, and criteria 
 * within a block are AND'd together.
 * 
 * Example:
 * [
 *   { criteria: [{ type: 'status', value: 'Active' }, { type: 'qualification', value: 'FLIP' }] },
 *   { criteria: [{ type: 'status', value: 'Active' }, { type: 'qualification', value: 'IP' }] }
 * ]
 * 
 * This means: (Active AND FLIP) OR (Active AND IP)
 */

// @ts-nocheck
import { supabase } from './supabaseClient';
import { getBatchPilotQualifications } from './qualificationService';
import type { EnrolledPilot, EnrollmentRule } from './trainingEnrollmentService';

// ============================================================================
// Types
// ============================================================================

export interface CriteriaBlock {
  criteria: EnrollmentRule[];
}

export interface InstructorEnrollment {
  id: string;
  cycle_id: string;
  pilot_id: string;
  enrolled_at: string;
  enrolled_by: string | null;
  status: 'active' | 'removed';
  removed_at: string | null;
  removed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnrolledInstructor extends EnrolledPilot {
  // Inherits all fields from EnrolledPilot
  // Status is simplified for instructors
  status: 'active' | 'removed';
}

// ============================================================================
// Block-based Criteria Evaluation
// ============================================================================

/**
 * Evaluate pilots against block-based criteria rules.
 * Blocks are OR'd together, criteria within blocks are AND'd.
 * 
 * @param blocks Array of criteria blocks
 * @returns Set of pilot IDs that match at least one block
 */
async function evaluateCriteriaBlocks(blocks: CriteriaBlock[]): Promise<Set<string>> {
  if (!blocks || blocks.length === 0) {
    return new Set();
  }

  // Evaluate each block in parallel
  const blockResults = await Promise.all(
    blocks.map(block => evaluateSingleBlock(block.criteria))
  );

  // OR all block results together
  const result = new Set<string>();
  blockResults.forEach(blockSet => {
    blockSet.forEach(pilotId => result.add(pilotId));
  });

  return result;
}

/**
 * Evaluate a single criteria block (AND logic within the block)
 */
async function evaluateSingleBlock(criteria: EnrollmentRule[]): Promise<Set<string>> {
  if (!criteria || criteria.length === 0) {
    return new Set();
  }

  const standingRules = criteria.filter(r => r.type === 'standing');
  const statusRules = criteria.filter(r => r.type === 'status');
  const qualificationRules = criteria.filter(r => r.type === 'qualification');

  const ruleSets: Set<string>[] = [];
  const ruleTypeCount = 
    (standingRules.length > 0 ? 1 : 0) +
    (statusRules.length > 0 ? 1 : 0) +
    (qualificationRules.length > 0 ? 1 : 0);

  // Run all rule queries in parallel
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

          if (pilotStandings && pilotStandings.length > 0) {
            const pilotSet = new Set<string>();
            pilotStandings.forEach(ps => pilotSet.add(ps.pilot_id));
            ruleSets.push(pilotSet);
          }
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

          if (pilotStatuses && pilotStatuses.length > 0) {
            const pilotSet = new Set<string>();
            pilotStatuses.forEach(ps => pilotSet.add(ps.pilot_id));
            ruleSets.push(pilotSet);
          }
        }
      }
    })(),

    // Get pilots matching qualification rules
    (async () => {
      if (qualificationRules.length > 0) {
        const qualNames = qualificationRules.map(r => r.value);
        const { data: qualifications } = await supabase
          .from('qualifications')
          .select('id')
          .in('name', qualNames);

        if (qualifications && qualifications.length > 0) {
          const qualIds = qualifications.map(q => q.id);
          const { data: pilotQuals } = await supabase
            .from('pilot_qualifications')
            .select('pilot_id')
            .in('qualification_id', qualIds)
            .eq('is_current', true);

          if (pilotQuals && pilotQuals.length > 0) {
            const pilotSet = new Set<string>();
            pilotQuals.forEach(pq => pilotSet.add(pq.pilot_id));
            ruleSets.push(pilotSet);
          }
        }
      }
    })()
  ]);

  // If any rule type returned no results, the block can't match anyone
  if (ruleSets.length !== ruleTypeCount) {
    return new Set();
  }

  if (ruleSets.length === 0) {
    return new Set();
  }

  // AND all rule sets together - only pilots in ALL sets qualify
  let pilotIds = ruleSets[0];
  for (let i = 1; i < ruleSets.length; i++) {
    pilotIds = new Set([...pilotIds].filter(id => ruleSets[i].has(id)));
  }

  return pilotIds;
}

/**
 * Build pilot detail maps for a set of pilot IDs
 */
async function buildPilotDetailMaps(pilotIds: string[]): Promise<{
  squadronMap: Map<string, any>;
  statusMap: Map<string, any>;
  standingMap: Map<string, any>;
  rolesMap: Map<string, any[]>;
  qualificationsMap: Map<string, any[]>;
}> {
  const [assignmentsData, statusesData, standingsData, rolesData, qualificationsDataMap] = await Promise.all([
    supabase
      .from('pilot_assignments')
      .select('pilot_id, org_squadrons(id, tail_code, insignia_url, color_palette)')
      .in('pilot_id', pilotIds)
      .is('end_date', null),

    supabase
      .from('pilot_statuses')
      .select('pilot_id, statuses(id, name, isActive)')
      .in('pilot_id', pilotIds)
      .is('end_date', null),

    supabase
      .from('pilot_standings')
      .select('pilot_id, standings(id, name)')
      .in('pilot_id', pilotIds)
      .is('end_date', null),

    supabase
      .from('pilot_roles')
      .select('pilot_id, roles(id, name, exclusivity_scope)')
      .in('pilot_id', pilotIds)
      .is('end_date', null),

    getBatchPilotQualifications(pilotIds)
  ]);

  // Build maps
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

  return { squadronMap, statusMap, standingMap, rolesMap, qualificationsMap };
}

// ============================================================================
// Instructor Enrollment Functions
// ============================================================================

/**
 * Get instructors suggested for enrollment based on syllabus instructor qualification rules
 */
export async function getSuggestedInstructors(syllabusId: string): Promise<EnrolledInstructor[]> {
  try {
    // Get syllabus instructor qualification rules
    const { data: syllabus, error: syllabusError } = await supabase
      .from('training_syllabi')
      .select('instructor_qualification_rules')
      .eq('id', syllabusId)
      .single();

    if (syllabusError) throw syllabusError;

    const blocks = syllabus?.instructor_qualification_rules as CriteriaBlock[] || [];
    if (blocks.length === 0) {
      return [];
    }

    // Evaluate criteria blocks to get qualifying pilot IDs
    const pilotIds = await evaluateCriteriaBlocks(blocks);

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

    if (!pilots || pilots.length === 0) {
      return [];
    }

    // Build detail maps
    const { squadronMap, statusMap, standingMap, rolesMap, qualificationsMap } = 
      await buildPilotDetailMaps(pilots.map(p => p.id));

    // Map to EnrolledInstructor format
    return pilots.map((pilot: any) => ({
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
    console.error('Error getting suggested instructors:', error);
    throw error;
  }
}

/**
 * Enroll multiple instructors in a cycle
 */
export async function enrollInstructors(
  cycleId: string,
  pilotIds: string[],
  enrolledByUserId: string | null = null
): Promise<void> {
  try {
    // For each pilot, either insert new record or reactivate removed one
    for (const pilotId of pilotIds) {
      // Check if there's an existing record (including removed)
      const { data: existing } = await supabase
        .from('training_instructor_enrollments')
        .select('id, status')
        .eq('cycle_id', cycleId)
        .eq('pilot_id', pilotId)
        .single();

      if (existing) {
        if (existing.status === 'removed') {
          // Reactivate the removed enrollment
          await supabase
            .from('training_instructor_enrollments')
            .update({
              status: 'active',
              enrolled_at: new Date().toISOString(),
              enrolled_by: enrolledByUserId,
              removed_at: null,
              removed_by: null
            })
            .eq('id', existing.id);
        }
        // If already active, skip
      } else {
        // Insert new enrollment
        await supabase
          .from('training_instructor_enrollments')
          .insert({
            cycle_id: cycleId,
            pilot_id: pilotId,
            enrolled_by: enrolledByUserId,
            status: 'active',
            enrolled_at: new Date().toISOString()
          });
      }
    }
  } catch (error) {
    console.error('Error enrolling instructors:', error);
    throw error;
  }
}

/**
 * Remove an instructor from a cycle (soft delete)
 */
export async function removeInstructor(
  enrollmentId: string,
  removedByUserId: string | null = null
): Promise<void> {
  try {
    const { error } = await supabase
      .from('training_instructor_enrollments')
      .update({
        status: 'removed',
        removed_at: new Date().toISOString(),
        removed_by: removedByUserId
      })
      .eq('id', enrollmentId);

    if (error) throw error;
  } catch (error) {
    console.error('Error removing instructor:', error);
    throw error;
  }
}

/**
 * Get active instructor enrollments for a cycle with full pilot details
 */
export async function getCycleInstructorEnrollments(cycleId: string): Promise<EnrolledInstructor[]> {
  try {
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('training_instructor_enrollments')
      .select(`
        id,
        pilot_id,
        status,
        enrolled_at,
        pilots!inner(id, callsign, boardNumber)
      `)
      .eq('cycle_id', cycleId)
      .eq('status', 'active')
      .order('enrolled_at');

    if (enrollmentsError) throw enrollmentsError;

    if (!enrollments || enrollments.length === 0) {
      return [];
    }

    const pilotIds = enrollments.map((e: any) => e.pilot_id);

    // Build detail maps
    const { squadronMap, statusMap, standingMap, rolesMap, qualificationsMap } = 
      await buildPilotDetailMaps(pilotIds);

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
    console.error('Error getting cycle instructor enrollments:', error);
    throw error;
  }
}

/**
 * Check if a pilot is an enrolled instructor for a cycle
 */
export async function isInstructorEnrolled(cycleId: string, pilotId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('training_instructor_enrollments')
      .select('id')
      .eq('cycle_id', cycleId)
      .eq('pilot_id', pilotId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) throw error;

    return data !== null;
  } catch (error) {
    console.error('Error checking instructor enrollment:', error);
    return false;
  }
}

/**
 * Get instructor enrollment count for a cycle
 */
export async function getCycleInstructorCount(cycleId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('training_instructor_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('cycle_id', cycleId)
      .eq('status', 'active');

    if (error) throw error;

    return count || 0;
  } catch (error) {
    console.error('Error getting instructor count:', error);
    return 0;
  }
}

/**
 * Get all cycles where a pilot is enrolled as an instructor
 */
export async function getPilotInstructorCycles(pilotId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('training_instructor_enrollments')
      .select('cycle_id')
      .eq('pilot_id', pilotId)
      .eq('status', 'active');

    if (error) throw error;

    return (data || []).map(e => e.cycle_id);
  } catch (error) {
    console.error('Error getting pilot instructor cycles:', error);
    return [];
  }
}

// ============================================================================
// Updated Suggested Student Enrollments (with block-based rules)
// ============================================================================

/**
 * Get pilots suggested for student enrollment based on syllabus auto-enrollment rules
 * Updated to support block-based criteria (OR between blocks, AND within blocks)
 */
export async function getSuggestedStudentEnrollments(syllabusId: string): Promise<EnrolledPilot[]> {
  try {
    // Get syllabus auto-enrollment rules
    const { data: syllabus, error: syllabusError } = await supabase
      .from('training_syllabi')
      .select('auto_enrollment_rules')
      .eq('id', syllabusId)
      .single();

    if (syllabusError) throw syllabusError;

    const rules = syllabus?.auto_enrollment_rules;
    if (!rules || (Array.isArray(rules) && rules.length === 0)) {
      return [];
    }

    // Detect rule format and convert if necessary
    let blocks: CriteriaBlock[];
    if (Array.isArray(rules) && rules.length > 0) {
      // Check if already in block format
      if (rules[0].criteria) {
        blocks = rules as CriteriaBlock[];
      } else {
        // Legacy flat format - convert to single block
        blocks = [{ criteria: rules as EnrollmentRule[] }];
      }
    } else {
      return [];
    }

    // Evaluate criteria blocks
    const pilotIds = await evaluateCriteriaBlocks(blocks);

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

    if (!pilots || pilots.length === 0) {
      return [];
    }

    // Build detail maps
    const { squadronMap, statusMap, standingMap, rolesMap, qualificationsMap } = 
      await buildPilotDetailMaps(pilots.map(p => p.id));

    // Map to EnrolledPilot format
    return pilots.map((pilot: any) => ({
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
    console.error('Error getting suggested student enrollments:', error);
    throw error;
  }
}
