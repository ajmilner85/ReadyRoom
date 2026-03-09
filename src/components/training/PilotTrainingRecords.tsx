// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { Users, UserCheck } from 'lucide-react';
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

interface TrainingCycle {
  id: string;
  name: string;
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
  const [cycles, setCycles] = useState<TrainingCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, number>>({});
  const [instructorCounts, setInstructorCounts] = useState<Record<string, number>>({});
  const [gradingDialogCell, setGradingDialogCell] = useState<PTRCellData | null>(null);
  const [ptrGridKey, setPtrGridKey] = useState(0);

  // Graduation dialog state
  const [graduationStudentIds, setGraduationStudentIds] = useState<string[] | null>(null);
  const [graduationStudents, setGraduationStudents] = useState<any[]>([]);
  const [graduationOutcomes, setGraduationOutcomes] = useState<GraduationOutcome[]>([]);
  const [graduatingSaving, setGraduatingSaving] = useState(false);
  const [isGraduationPending, setIsGraduationPending] = useState(false);

  useEffect(() => {
    loadCycles();
  }, [userProfile]);

  const loadCycles = async () => {
    try {
      setLoading(true);

      // Get the current user's pilot ID from userProfile
      const userPilotId = userProfile?.pilotId || null;

      // Get all training cycles
      const { data: allCycles, error: cyclesError } = await supabase
        .from('cycles')
        .select('*')
        .eq('type', 'Training')
        .order('start_date', { ascending: false });

      if (cyclesError) throw cyclesError;

      // Filter cycles to only those where user is an enrolled instructor
      let accessibleCycles: TrainingCycle[] = allCycles || [];
      
      if (userPilotId) {
        // Get cycles where this pilot is an enrolled instructor
        const instructorCycleIds = await getPilotInstructorCycles(userPilotId);
        
        if (instructorCycleIds.length > 0) {
          // User has instructor access to some cycles
          accessibleCycles = (allCycles || []).filter(c => instructorCycleIds.includes(c.id));
        } else {
          // No instructor enrollments - show empty list
          // In the future, we could add permission-based access here
          accessibleCycles = [];
        }
      } else {
        // No pilot record linked to user - show empty list
        accessibleCycles = [];
      }

      setCycles(accessibleCycles);
      if (accessibleCycles.length > 0 && !selectedCycleId) {
        setSelectedCycleId(accessibleCycles[0].id);
      } else if (accessibleCycles.length === 0) {
        setSelectedCycleId(undefined);
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

  const handleGraduationConfirm = async (submissions: GraduationSubmission[]) => {
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '40px' }}>
        Loading training cycles...
      </div>
    );
  }

  return (
    <div style={{ padding: '40px 32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '4px', margin: 0 }}>
          Pilot Training Records
        </h2>
        <p style={{ color: '#6B7280', fontSize: '14px', margin: 0, marginTop: '4px' }}>
          View and grade pilot training progress
        </p>
      </div>

      {/* No Access Message */}
      {cycles.length === 0 ? (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100%', 
          textAlign: 'center', 
          color: '#6B7280', 
          backgroundColor: 'white', 
          border: '1px solid #E5E7EB', 
          borderRadius: '8px', 
          padding: '60px' 
        }}>
          <UserCheck size={48} style={{ marginBottom: '16px', color: '#9CA3AF' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#374151', marginBottom: '8px', margin: 0 }}>
            No Training Cycles Available
          </h3>
          <p style={{ fontSize: '14px', color: '#6B7280', margin: 0, maxWidth: '400px' }}>
            You are not enrolled as an instructor for any training cycles. 
            Contact your training officer to be added as an instructor.
          </p>
        </div>
      ) : (
        <>
          {/* Cycle Selector */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                Training Cycle
              </label>
              {selectedCycleId && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    borderRadius: '12px',
                    fontSize: '13px',
                    color: '#1E40AF',
                    fontWeight: 500
                  }}>
                    <Users size={14} />
                    {enrollmentCounts[selectedCycleId] ?? 0} students
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    backgroundColor: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    borderRadius: '12px',
                    fontSize: '13px',
                    color: '#166534',
                    fontWeight: 500
                  }}>
                    <UserCheck size={14} />
                    {instructorCounts[selectedCycleId] ?? 0} instructors
                  </div>
                </div>
              )}
            </div>
            <select
              value={selectedCycleId || ''}
              onChange={(e) => setSelectedCycleId(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '14px',
                width: '100%',
                maxWidth: '400px',
                backgroundColor: 'white'
              }}
            >
              <option value="">Select a training cycle</option>
              {cycles.map(cycle => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.name} ({new Date(cycle.start_date).toLocaleDateString('en-US', { timeZone: 'UTC' })})
                </option>
              ))}
            </select>
          </div>

          {/* PTR Grid Content */}
          <div style={{ flex: 1, minHeight: 0 }}>
            {selectedCycleId && cycles.find(c => c.id === selectedCycleId)?.syllabus_id ? (
              <PTRGrid
                key={ptrGridKey}
                syllabusId={cycles.find(c => c.id === selectedCycleId)!.syllabus_id!}
                cycleId={selectedCycleId}
                onCellClick={handleCellClick}
                onGraduateClick={handleGraduateClick}
              suppressTooltips={isGraduationPending || !!graduationStudentIds}
              />
            ) : selectedCycleId ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', color: '#6B7280', backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '40px' }}>
                This training cycle has no syllabus assigned.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', color: '#6B7280', backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '40px' }}>
                Select a training cycle to view the PTR Grid
              </div>
            )}
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
