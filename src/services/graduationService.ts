// @ts-nocheck
import { supabase } from '../utils/supabaseClient';
import type { AppliedOutcome } from '../types/TrainingTypes';
import type { GraduationSubmission } from '../components/training/GraduationDialog';

interface GraduateParams {
  enrollmentId: string;
  cycleId: string;
  syllabusId: string;
  studentPilotId: string;
  graduatedByUserId: string;
  outcomes: AppliedOutcome[];
}

/**
 * Apply graduation for a single student:
 * 1. Update training_enrollments status to 'graduated'
 * 2. Apply each outcome (callsign, standing, squadron, qualifications)
 * 3. Insert graduation_records audit row
 */
export async function graduateStudent(params: GraduateParams): Promise<void> {
  const { enrollmentId, cycleId, syllabusId, studentPilotId, graduatedByUserId, outcomes } = params;

  // 1. Mark enrollment as graduated
  const { error: enrollmentError } = await supabase
    .from('training_enrollments')
    .update({
      status: 'graduated',
      status_changed_at: new Date().toISOString(),
      status_changed_by: graduatedByUserId,
    })
    .eq('id', enrollmentId);

  if (enrollmentError) throw new Error(`Failed to update enrollment: ${enrollmentError.message}`);

  // 2. Apply each outcome
  for (const outcome of outcomes) {
    if (outcome.value === null && outcome.value === undefined) continue;

    switch (outcome.type) {
      case 'callsign': {
        if (typeof outcome.value === 'string' && outcome.value.trim()) {
          const { error } = await supabase
            .from('pilots')
            .update({ callsign: outcome.value.trim() })
            .eq('id', studentPilotId);
          if (error) throw new Error(`Failed to update callsign: ${error.message}`);
        }
        break;
      }

      case 'standing': {
        if (typeof outcome.value === 'string' && outcome.value) {
          // Close current standing
          const { error: closeError } = await supabase
            .from('pilot_standings')
            .update({ end_date: outcome.effectiveDate })
            .eq('pilot_id', studentPilotId)
            .is('end_date', null);

          if (closeError) throw new Error(`Failed to close current standing: ${closeError.message}`);

          // Insert new standing
          const { error: insertError } = await supabase
            .from('pilot_standings')
            .insert({
              pilot_id: studentPilotId,
              standing_id: outcome.value,
              start_date: outcome.effectiveDate,
            });

          if (insertError) throw new Error(`Failed to insert new standing: ${insertError.message}`);
        }
        break;
      }

      case 'squadron_assignment': {
        if (typeof outcome.value === 'string' && outcome.value) {
          // Close current assignment
          const { error: closeError } = await supabase
            .from('pilot_assignments')
            .update({ end_date: outcome.effectiveDate })
            .eq('pilot_id', studentPilotId)
            .is('end_date', null);

          if (closeError) throw new Error(`Failed to close current assignment: ${closeError.message}`);

          // Insert new assignment
          const { error: insertError } = await supabase
            .from('pilot_assignments')
            .insert({
              pilot_id: studentPilotId,
              squadron_id: outcome.value,
              start_date: outcome.effectiveDate,
            });

          if (insertError) throw new Error(`Failed to insert new assignment: ${insertError.message}`);
        }
        break;
      }

      case 'qualifications': {
        if (Array.isArray(outcome.value) && outcome.value.length > 0) {
          const qualRows = outcome.value.map((qual: any) => ({
            pilot_id: studentPilotId,
            qualification_id: typeof qual === 'string' ? qual : qual.id,
            achieved_date: typeof qual === 'string' ? outcome.effectiveDate : (qual.effectiveDate || outcome.effectiveDate),
            is_current: true,
          }));

          const { error } = await supabase
            .from('pilot_qualifications')
            .insert(qualRows);

          if (error) throw new Error(`Failed to insert qualifications: ${error.message}`);
        }
        break;
      }
    }
  }

  // 3. Insert graduation audit record
  const { error: recordError } = await supabase
    .from('graduation_records')
    .insert({
      enrollment_id: enrollmentId,
      cycle_id: cycleId,
      syllabus_id: syllabusId,
      student_pilot_id: studentPilotId,
      graduated_by: graduatedByUserId,
      graduated_at: new Date().toISOString(),
      outcomes_applied: outcomes,
    });

  if (recordError) throw new Error(`Failed to insert graduation record: ${recordError.message}`);
}

/**
 * Look up enrollment ID for a student in a specific cycle
 */
export async function getEnrollmentId(studentPilotId: string, cycleId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('training_enrollments')
    .select('id')
    .eq('pilot_id', studentPilotId)
    .eq('cycle_id', cycleId)
    .in('status', ['active', 'completed'])
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.id;
}

/**
 * Graduate multiple students in sequence
 */
export async function graduateStudents(
  submissions: GraduationSubmission[],
  cycleId: string,
  syllabusId: string,
  graduatedByUserId: string,
): Promise<{ succeeded: string[]; failed: Array<{ studentId: string; error: string }> }> {
  const succeeded: string[] = [];
  const failed: Array<{ studentId: string; error: string }> = [];

  for (const submission of submissions) {
    try {
      const enrollmentId = await getEnrollmentId(submission.studentId, cycleId);
      if (!enrollmentId) {
        failed.push({ studentId: submission.studentId, error: 'No active enrollment found' });
        continue;
      }

      await graduateStudent({
        enrollmentId,
        cycleId,
        syllabusId,
        studentPilotId: submission.studentId,
        graduatedByUserId,
        outcomes: submission.outcomes,
      });

      succeeded.push(submission.studentId);
    } catch (err: any) {
      failed.push({ studentId: submission.studentId, error: err.message });
    }
  }

  return { succeeded, failed };
}
