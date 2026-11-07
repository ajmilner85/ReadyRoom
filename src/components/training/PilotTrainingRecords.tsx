// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { Chip, EmptyState, Icon, SegmentedControl } from '../ui/primitives';
import { CycleAccordionItem, CycleAccordionPane } from '../ui/events/CycleAccordion';
import type { AccordionCycle } from '../ui/events/CycleAccordion';
import PTRGrid from './PTRGrid';
import GradingDialog from './GradingDialog';
import GraduationDialog from './GraduationDialog';
import type { GraduationSubmission } from './GraduationDialog';
import { getCycleEnrollmentCount } from '../../utils/trainingEnrollmentService';
import { getPilotInstructorCycles, getCycleInstructorCount } from '../../utils/instructorEnrollmentService';
import { graduateStudents } from '../../services/graduationService';
import { clearAllQualificationsCache } from '../../utils/qualificationService';
import { PTRCellData, GraduationOutcome } from '../../types/TrainingTypes';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';

interface TrainingCycle {
  id: string;
  name: string;
  type?: string | null;
  start_date: string;
  end_date: string | null;
  syllabus_id: string;
}

interface PilotTrainingRecordsProps {
  error: string | null;
  setError: (error: string | null) => void;
}

const PilotTrainingRecords: React.FC<PilotTrainingRecordsProps> = ({ error, setError }) => {
  const { userProfile } = useAuth();
  // Scope of PTR visibility: none | own_students | enrolled_cycles | all_cycles
  const { view_all_training_progress: ptrScope, loading: permissionsLoading } = usePermissions();
  const [cycles, setCycles] = useState<TrainingCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, number>>({});
  const [instructorCounts, setInstructorCounts] = useState<Record<string, number>>({});
  const [gradingDialogCell, setGradingDialogCell] = useState<PTRCellData | null>(null);
  const [ptrGridKey, setPtrGridKey] = useState(0);
  const [syllabusNames, setSyllabusNames] = useState<Record<string, string>>({});
  // Navigator filter: training cycles only (default) or every cycle
  const [cycleFilter, setCycleFilter] = useState<'training' | 'all'>('training');

  // Graduation dialog state
  const [graduationStudentIds, setGraduationStudentIds] = useState<string[] | null>(null);
  const [graduationStudents, setGraduationStudents] = useState<any[]>([]);
  const [graduationOutcomes, setGraduationOutcomes] = useState<GraduationOutcome[]>([]);
  const [graduatingSaving, setGraduatingSaving] = useState(false);
  const [isGraduationPending, setIsGraduationPending] = useState(false);

  useEffect(() => {
    if (permissionsLoading) return;
    loadCycles();
  }, [userProfile, ptrScope, permissionsLoading]);

  const loadCycles = async () => {
    try {
      setLoading(true);

      // Get the current user's pilot ID from userProfile
      const userPilotId = userProfile?.pilotId || null;

      // All cycles (the navigator filters to Training by default; other cycles can carry a syllabus too)
      const { data: allCycles, error: cyclesError } = await supabase
        .from('cycles')
        .select('*')
        .is('deleted_at', null) // soft-deleted cycles stay hidden (as on Events)
        .order('start_date', { ascending: false });

      if (cyclesError) throw cyclesError;

      // Which cycles are visible is driven by the view_all_training_progress scope:
      //   all_cycles                     -> every training cycle
      //   enrolled_cycles / own_students -> only cycles the user instructs
      //   none                           -> nothing
      let accessibleCycles: TrainingCycle[] = [];

      if (ptrScope === 'all_cycles') {
        accessibleCycles = allCycles || [];
      } else if ((ptrScope === 'enrolled_cycles' || ptrScope === 'own_students') && userPilotId) {
        const instructorCycleIds = await getPilotInstructorCycles(userPilotId);
        accessibleCycles = (allCycles || []).filter(c => instructorCycleIds.includes(c.id));
      }

      setCycles(accessibleCycles);
      if (accessibleCycles.length > 0 && !selectedCycleId) {
        // Default: the running training cycle, else the most recent training cycle, else the most recent cycle
        const now = new Date();
        const training = accessibleCycles.filter(c => c.type === 'Training');
        const running = training.find(c => new Date(c.start_date) <= now && (!c.end_date || new Date(c.end_date) >= now));
        setSelectedCycleId((running || training[0] || accessibleCycles[0]).id);
      } else if (accessibleCycles.length === 0) {
        setSelectedCycleId(undefined);
      }

      // Syllabus names for the navigator
      const syllabusIds = Array.from(new Set(accessibleCycles.map(c => c.syllabus_id).filter(Boolean)));
      if (syllabusIds.length) {
        const { data: syl } = await supabase.from('training_syllabi').select('id, name').in('id', syllabusIds);
        setSyllabusNames(Object.fromEntries((syl || []).map((x: any) => [x.id, x.name])));
      }

      // Load enrollment counts for accessible cycles
      if (accessibleCycles.length > 0) {
        loadEnrollmentCounts(accessibleCycles.map(c => c.id));
        loadInstructorCounts(accessibleCycles.map(c => c.id));
      }
    } catch (err: any) {
      console.error('Error loading training cycles:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadEnrollmentCounts = async (cycleIds: string[]) => {
    try {
      const counts: Record<string, number> = {};
      await Promise.all(
        cycleIds.map(async (cycleId) => {
          const count = await getCycleEnrollmentCount(cycleId);
          counts[cycleId] = count;
        })
      );
      setEnrollmentCounts(counts);
    } catch (err: any) {
      console.error('Error loading enrollment counts:', err);
    }
  };

  const loadInstructorCounts = async (cycleIds: string[]) => {
    try {
      const counts: Record<string, number> = {};
      await Promise.all(
        cycleIds.map(async (cycleId) => {
          const count = await getCycleInstructorCount(cycleId);
          counts[cycleId] = count;
        })
      );
      setInstructorCounts(counts);
    } catch (err: any) {
      console.error('Error loading instructor counts:', err);
    }
  };

  const handleCellClick = (cellData: PTRCellData) => {
    setGradingDialogCell(cellData);
  };

  const handleGradingDialogClose = () => {
    setGradingDialogCell(null);
  };

  const handleGradingDialogSave = () => {
    // Refresh the PTR grid by updating the key
    setPtrGridKey(prev => prev + 1);
  };

  const handleGraduateClick = async (studentIds: string[]) => {
    if (!selectedCycleId) return;
    const cycle = cycles.find(c => c.id === selectedCycleId);
    if (!cycle?.syllabus_id) return;

    setIsGraduationPending(true);
    try {
      // Load student info
      const { data: studentsData } = await supabase
        .from('pilots')
        .select(`
          id, callsign, boardNumber,
          pilot_assignments!inner(squadron_id, end_date,
            org_squadrons(tail_code, insignia_url, color_palette)
          )
        `)
        .in('id', studentIds);

      const studentInfo = (studentsData || []).map((p: any) => {
        const currentAssignment = p.pilot_assignments?.find((a: any) => !a.end_date);
        const sq = currentAssignment?.org_squadrons;
        return {
          id: p.id,
          callsign: p.callsign,
          board_number: String(p.boardNumber || ''),
          squadron: sq ? {
            tail_code: sq.tail_code || '',
            insignia_url: sq.insignia_url || '',
            primary_color: sq.color_palette?.primary || '#000000',
          } : undefined,
        };
      });

      // Load syllabus graduation outcomes
      const { data: syllabusData } = await supabase
        .from('training_syllabi')
        .select('graduation_outcomes')
        .eq('id', cycle.syllabus_id)
        .single();

      setGraduationStudents(studentInfo);
      setGraduationOutcomes(
        Array.isArray(syllabusData?.graduation_outcomes) ? syllabusData.graduation_outcomes : []
      );
      setGraduationStudentIds(studentIds);
    } catch (err: any) {
      console.error('Error loading graduation data:', err);
      setError(err.message);
      setIsGraduationPending(false);
    }
  };

  const handleGraduationConfirm = async (submissions: GraduationSubmission[], graduationDate: string) => {
    if (!selectedCycleId || !userProfile?.id) return;
    const cycle = cycles.find(c => c.id === selectedCycleId);
    if (!cycle?.syllabus_id) return;

    try {
      setGraduatingSaving(true);
      const result = await graduateStudents(
        submissions,
        selectedCycleId,
        cycle.syllabus_id,
        userProfile.id,
        graduationDate,
      );

      if (result.failed.length > 0) {
        setError(`Failed to graduate ${result.failed.length} student(s): ${result.failed.map(f => f.error).join(', ')}`);
      }

      // Clear cached qualification data so other pages (e.g. Roster Management) fetch fresh data
      clearAllQualificationsCache();

      setGraduationStudentIds(null);
      setPtrGridKey(prev => prev + 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGraduatingSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-10 text-[13px] text-text2">Loading training cycles…</div>
    );
  }

  const selectedCycle = cycles.find(c => c.id === selectedCycleId) || null;
  const shownCycles = cycleFilter === 'training' ? cycles.filter(c => c.type === 'Training') : cycles;
  const navCycles: AccordionCycle[] = shownCycles.map(c => ({
    id: c.id, name: c.name, type: c.type, startDate: c.start_date, endDate: c.end_date || c.start_date,
  }));
  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '—');

  return (
    <div className="flex-1 min-w-0 min-h-0 flex gap-[14px]">
      {/* No Access Message */}
      {cycles.length === 0 ? (
        <div className="flex-1 flex items-center justify-center bg-panel border border-border rounded-rr-xl shadow-rr">
          <EmptyState
            icon="userCheck"
            title="No training cycles available"
            message={ptrScope === 'none'
              ? 'You do not have permission to view pilot training records. Contact your training officer for access.'
              : 'You are not enrolled as an instructor for any training cycles. Contact your training officer to be added as an instructor.'}
          />
        </div>
      ) : (
        <>
          {/* Left: cycle accordion (Events / Debrief navigator) */}
          <CycleAccordionPane
            title="Cycles"
            headerActions={
              <SegmentedControl
                size="sm"
                value={cycleFilter}
                onChange={setCycleFilter}
                options={[{ value: 'training', label: 'TRAINING' }, { value: 'all', label: 'ALL' }]}
              />
            }
            cycles={navCycles}
            selectedId={selectedCycleId}
            renderItem={(c, o) => {
              const cyc = cycles.find(x => x.id === c.id);
              return (
                <CycleAccordionItem
                  key={c.id}
                  cycle={c}
                  open={o.open}
                  onToggle={() => setSelectedCycleId(o.open ? undefined : c.id)}
                >
                  <div className="flex flex-col gap-[8px] px-2 pt-[10px] pb-[2px]">
                    <div className="flex items-center gap-[6px] text-[12px] text-text2 min-w-0">
                      <Icon name="bookOpen" size={13} style={{ color: 'var(--rr-text3)', flexShrink: 0 }} />
                      <span className="truncate">{cyc?.syllabus_id ? (syllabusNames[cyc.syllabus_id] || 'Syllabus') : 'No syllabus assigned'}</span>
                    </div>
                    <div className="flex items-center gap-[6px] flex-wrap">
                      <Chip tone="info" size="sm"><Icon name="roster" size={11} />{enrollmentCounts[c.id] ?? 0} students</Chip>
                      <Chip tone="good" size="sm"><Icon name="userCheck" size={11} />{instructorCounts[c.id] ?? 0} instructors</Chip>
                    </div>
                  </div>
                </CycleAccordionItem>
              );
            }}
          />

          {/* Right: the selected cycle's training records */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-panel border border-border rounded-rr-xl shadow-rr overflow-hidden">
            <div className="flex-none flex items-center gap-3 px-4 pt-3 pb-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-semibold truncate">{selectedCycle?.name || 'No cycle selected'}</div>
                <div className="text-[12px] text-text2 truncate">
                  {selectedCycle
                    ? [selectedCycle.type, `${fmt(selectedCycle.start_date)} – ${fmt(selectedCycle.end_date)}`, selectedCycle.syllabus_id ? syllabusNames[selectedCycle.syllabus_id] : null].filter(Boolean).join(' · ')
                    : 'Select a cycle on the left'}
                </div>
              </div>
              {selectedCycle ? (
                <>
                  <Chip tone="info" size="sm"><Icon name="roster" size={12} />{enrollmentCounts[selectedCycle.id] ?? 0} students</Chip>
                  <Chip tone="good" size="sm"><Icon name="userCheck" size={12} />{instructorCounts[selectedCycle.id] ?? 0} instructors</Chip>
                </>
              ) : null}
            </div>
            <div className="h-px bg-border flex-none" />
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4">
              {selectedCycle?.syllabus_id ? (
                <PTRGrid
                  key={ptrGridKey}
                  syllabusId={selectedCycle.syllabus_id}
                  cycleId={selectedCycle.id}
                  onCellClick={handleCellClick}
                  onGraduateClick={handleGraduateClick}
                  suppressTooltips={isGraduationPending || !!graduationStudentIds}
                  ownStudentsPilotId={ptrScope === 'own_students' ? userProfile?.pilotId : undefined}
                />
              ) : selectedCycle ? (
                <EmptyState icon="bookOpen" title="No syllabus assigned" message="Assign a syllabus to this cycle to grade it here." />
              ) : (
                <EmptyState icon="training" title="Pick a cycle" message="Expand a cycle on the left to see its training records." />
              )}
            </div>
          </div>

          {/* Grading Dialog */}
          {gradingDialogCell && selectedCycleId && (
            <GradingDialog
              cellData={gradingDialogCell}
              cycleId={selectedCycleId}
              onClose={handleGradingDialogClose}
              onSave={handleGradingDialogSave}
              currentUserPilotId={userProfile?.pilotId}
            />
          )}

          {/* Graduation Dialog */}
          {graduationStudentIds && selectedCycleId && (
            <GraduationDialog
              studentIds={graduationStudentIds}
              students={graduationStudents}
              cycleId={selectedCycleId}
              syllabusId={cycles.find(c => c.id === selectedCycleId)!.syllabus_id!}
              cycleStartDate={cycles.find(c => c.id === selectedCycleId)!.start_date}
              outcomes={graduationOutcomes}
              onClose={() => { setGraduationStudentIds(null); setIsGraduationPending(false); }}
              onConfirm={handleGraduationConfirm}
              saving={graduatingSaving}
            />
          )}
        </>
      )}
    </div>
  );
};

export default PilotTrainingRecords;
