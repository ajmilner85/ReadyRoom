// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Edit2, Trash2, Plus, ChevronRight, ArrowUpDown, BookOpen } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { GradingDialogData, TrainingGrade, DLOGrade, PTRCellData } from '../../types/TrainingTypes';
import PilotIDBadgeSm from '../ui/PilotIDBadgeSm';
import { useAppSettings } from '../../context/AppSettingsContext';
import { ConfirmationDialog } from '../ui/dialogs/ConfirmationDialog';
import type { ReferenceMaterial } from '../../types/EventTypes';

interface GradingDialogProps {
  cellData: PTRCellData;
  cycleId: string;
  onClose: () => void;
  onSave: () => void;
  currentUserPilotId?: string;
}

const GradingDialog: React.FC<GradingDialogProps> = ({
  cellData,
  cycleId,
  onClose,
  onSave,
  currentUserPilotId
}) => {
  const { settings } = useAppSettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogData, setDialogData] = useState<GradingDialogData | null>(null);
  const [selectedAttemptIndex, setSelectedAttemptIndex] = useState<number>(-1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [hoveredAttemptIndex, setHoveredAttemptIndex] = useState<number | null>(null);

  // Form state
  const [overallGrade, setOverallGrade] = useState<'SAT' | 'UNSAT' | null>(null);
  const [overallNotes, setOverallNotes] = useState('');
  const [dloGrades, setDloGrades] = useState<DLOGrade[]>([]);
  const [dloNotes, setDloNotes] = useState<Record<string, string>>({});
  const [isMakeupFlight, setIsMakeupFlight] = useState(false);
  const [makeupNotes, setMakeupNotes] = useState('');
  const [makeupFlightDate, setMakeupFlightDate] = useState('');
  const [ipMismatchAcknowledged, setIpMismatchAcknowledged] = useState(false);

  // Pilot info for display
  const [traineeInfo, setTraineeInfo] = useState<{ boardNumber: number; callsign: string; squadronTailCode?: string; squadronInsigniaUrl?: string; squadronPrimaryColor?: string } | null>(null);
  const [instructorInfo, setInstructorInfo] = useState<{ id?: string; boardNumber: number; callsign: string; squadronTailCode?: string; squadronInsigniaUrl?: string; squadronPrimaryColor?: string } | null>(null);
  const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(null);

  // Instructor selection
  const [showInstructorDialog, setShowInstructorDialog] = useState(false);
  const [availableInstructors, setAvailableInstructors] = useState<Array<{ id: string; boardNumber: number; callsign: string; squadronId?: string; squadronTailCode?: string; squadronInsigniaUrl?: string; squadronPrimaryColor?: string }>>([]);
  const [sortBySquadron, setSortBySquadron] = useState<boolean>(true);
  const [instructorSortBy, setInstructorSortBy] = useState<'boardNumber' | 'callsign'>('callsign');
  const [hoveredInstructorId, setHoveredInstructorId] = useState<string | null>(null);

  // Reference materials state
  const [referenceMaterials, setReferenceMaterials] = useState<Array<{ material: ReferenceMaterial; isInherited: boolean }>>([]);
  const [showReferencesPopup, setShowReferencesPopup] = useState(false);
  const [isReferencesHovered, setIsReferencesHovered] = useState(false);

  useEffect(() => {
    loadDialogData();
  }, [cellData, cycleId]);

  // Close references popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!showReferencesPopup) return;

      const target = event.target as HTMLElement;
      // Check if click is outside the popup and button
      if (!target.closest('[data-references-popup]') && !target.closest('[data-references-button]')) {
        setShowReferencesPopup(false);
        setIsReferencesHovered(false); // Clear hover state to prevent it from reopening
      }
    };

    if (showReferencesPopup) {
      // Use timeout to avoid the same click that opened the popup from closing it
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);

      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showReferencesPopup]);

  const loadDialogData = async () => {
    try {
      setLoading(true);

      // Get mission details with reference materials
      const { data: missionData, error: missionError } = await supabase
        .from('training_syllabus_missions')
        .select('id, mission_number, mission_name, week_number, reference_materials, training_syllabi(reference_materials)')
        .eq('id', cellData.syllabusMissionId)
        .single();

      if (missionError) throw missionError;

      // Get student details with squadron info
      const { data: studentData, error: studentError } = await supabase
        .from('pilots')
        .select(`
          *,
          pilot_assignments!left (
            id,
            pilot_id,
            squadron_id,
            start_date,
            end_date,
            org_squadrons (
              id,
              name,
              designation,
              wing_id,
              tail_code,
              insignia_url,
              color_palette
            )
          )
        `)
        .eq('id', cellData.studentId)
        .single();

      if (studentError) throw studentError;

      // Get active squadron assignment
      const activeSquadronAssignment = (studentData.pilot_assignments || []).find(
        (sa: any) => sa.end_date === null
      );

      setTraineeInfo({
        boardNumber: studentData.boardNumber,
        callsign: studentData.callsign,
        squadronTailCode: activeSquadronAssignment?.org_squadrons?.tail_code,
        squadronInsigniaUrl: activeSquadronAssignment?.org_squadrons?.insignia_url,
        squadronPrimaryColor: activeSquadronAssignment?.org_squadrons?.color_palette?.primary
      });

      // Merge reference materials from syllabus, mission, and event
      const syllabusRefs = (missionData.training_syllabi as any)?.reference_materials || [];
      const missionRefs = Array.isArray(missionData.reference_materials) ? missionData.reference_materials : [];

      // Get event details if exists
      let eventData = null;
      let eventRefs: ReferenceMaterial[] = [];
      if (cellData.eventId) {
        const { data: event, error: eventError} = await supabase
          .from('events')
          .select('id, name, start_datetime, reference_materials')
          .eq('id', cellData.eventId)
          .single();

        if (!eventError && event) {
          eventData = event;
          eventRefs = Array.isArray(event.reference_materials) ? event.reference_materials : [];
        }
      }

      // Merge reference materials and track which are inherited
      const inheritedRefs = [...syllabusRefs, ...missionRefs].map(ref => ({ material: ref, isInherited: true }));
      const eventRefsWithFlag = eventRefs.map(ref => ({ material: ref, isInherited: false }));
      const allRefsWithFlag = [...inheritedRefs, ...eventRefsWithFlag];

      // Deduplicate by URL
      const uniqueRefs = allRefsWithFlag.filter((item, index, self) =>
        index === self.findIndex((r) => r.material.url === item.material.url)
      );

      console.log('Reference materials loaded:', { syllabusRefs, missionRefs, eventRefs, uniqueRefs });
      setReferenceMaterials(uniqueRefs);

      // Get Individual scope objectives for this mission
      const { data: objectivesData, error: objectivesError } = await supabase
        .from('syllabus_training_objectives')
        .select('id, objective_text, display_order')
        .eq('syllabus_mission_id', cellData.syllabusMissionId)
        .eq('scope_level', 'Individual')
        .order('display_order');

      if (objectivesError) throw objectivesError;

      // Get existing attempts with instructor info
      const { data: gradesData, error: gradesError } = await supabase
        .from('training_grades')
        .select(`
          *,
          graded_by_pilot:pilots!graded_by_pilot_id(callsign, boardNumber)
        `)
        .eq('student_id', cellData.studentId)
        .eq('syllabus_mission_id', cellData.syllabusMissionId)
        .eq('cycle_id', cycleId)
        .order('attempt_number', { ascending: false });

      if (gradesError) console.error('Error loading grades:', gradesError);

      // Determine assigned IP from flight assignments
      let assignedIpPilotId = null;
      let assignedIpCallsign = cellData.assignedIpCallsign;

      if (cellData.eventId) {
        const { data: missionAssignments, error: missionError } = await supabase
          .from('missions')
          .select('pilot_assignments')
          .eq('event_id', cellData.eventId)
          .maybeSingle();

        if (missionError) {
          console.error('Error fetching mission assignments:', missionError);
        }

        if (missionAssignments?.pilot_assignments) {
          const assignments = missionAssignments.pilot_assignments;

          Object.entries(assignments).forEach(([flightId, pilots]: [string, any]) => {
            if (!Array.isArray(pilots)) return;

            const studentInFlight = pilots.find((p: any) => p.id === cellData.studentId);
            if (studentInFlight) {
              const flightLead = pilots.find((p: any) => p.dashNumber === "1");
              if (flightLead) {
                assignedIpPilotId = flightLead.id;
                assignedIpCallsign = flightLead.callsign;
              }
            }
          });
        }
      }

      // Fetch IP details with squadron info
      if (assignedIpPilotId) {
        const { data: ipData } = await supabase
          .from('pilots')
          .select(`
            *,
            pilot_assignments!left (
              id,
              pilot_id,
              squadron_id,
              start_date,
              end_date,
              org_squadrons (
                id,
                name,
                designation,
                wing_id,
                tail_code,
                insignia_url,
                color_palette
              )
            )
          `)
          .eq('id', assignedIpPilotId)
          .single();

        if (ipData) {
          const activeSquadronAssignment = (ipData.pilot_assignments || []).find(
            (sa: any) => sa.end_date === null
          );
          setInstructorInfo({
            id: ipData.id,
            boardNumber: ipData.boardNumber,
            callsign: ipData.callsign,
            squadronTailCode: activeSquadronAssignment?.org_squadrons?.tail_code,
            squadronInsigniaUrl: activeSquadronAssignment?.org_squadrons?.insignia_url,
            squadronPrimaryColor: activeSquadronAssignment?.org_squadrons?.color_palette?.primary
          });
          setSelectedInstructorId(ipData.id);
        }
      } else if (currentUserPilotId) {
        const { data: ipData } = await supabase
          .from('pilots')
          .select(`
            *,
            pilot_assignments!left (
              id,
              pilot_id,
              squadron_id,
              start_date,
              end_date,
              org_squadrons (
                id,
                name,
                designation,
                wing_id,
                tail_code,
                insignia_url,
                color_palette
              )
            )
          `)
          .eq('id', currentUserPilotId)
          .single();

        if (ipData) {
          const activeSquadronAssignment = (ipData.pilot_assignments || []).find(
            (sa: any) => sa.end_date === null
          );
          setInstructorInfo({
            id: ipData.id,
            boardNumber: ipData.boardNumber,
            callsign: ipData.callsign,
            squadronTailCode: activeSquadronAssignment?.org_squadrons?.tail_code,
            squadronInsigniaUrl: activeSquadronAssignment?.org_squadrons?.insignia_url,
            squadronPrimaryColor: activeSquadronAssignment?.org_squadrons?.color_palette?.primary
          });
          setSelectedInstructorId(ipData.id);
        }
      }

      const data: GradingDialogData = {
        studentId: studentData.id,
        studentCallsign: studentData.callsign,
        studentBoardNumber: studentData.boardNumber,
        syllabusMissionId: missionData.id,
        missionNumber: missionData.mission_number,
        missionName: missionData.mission_name,
        weekNumber: missionData.week_number,
        cycleId,
        eventId: eventData?.id,
        eventTitle: eventData?.name,
        eventDate: eventData?.start_datetime,
        assignedIpPilotId,
        assignedIpCallsign,
        wasPresent: cellData.wasPresent,
        wasAssignedToFlight: cellData.wasAssignedToFlight,
        objectives: (objectivesData || []).map((obj: any) => ({
          id: obj.id,
          objectiveText: obj.objective_text,
          displayOrder: obj.display_order
        })),
        existingAttempts: (gradesData || []).map((g: any) => ({
          id: g.id,
          studentId: g.student_id,
          syllabusMissionId: g.syllabus_mission_id,
          cycleId: g.cycle_id,
          eventId: g.event_id,
          isMakeupFlight: g.is_makeup_flight,
          attemptNumber: g.attempt_number,
          gradedByPilotId: g.graded_by_pilot_id,
          assignedIpPilotId: g.assigned_ip_pilot_id,
          ipMismatchAcknowledged: g.ip_mismatch_acknowledged,
          overallGrade: g.overall_grade,
          overallNotes: g.overall_notes,
          dloGrades: g.dlo_grades || [],
          flightDate: g.flight_date,
          gradedAt: g.graded_at,
          updatedAt: g.updated_at,
          createdAt: g.created_at,
          instructorCallsign: g.graded_by_pilot?.callsign,
          instructorBoardNumber: g.graded_by_pilot?.boardNumber
        }))
      };

      setDialogData(data);

      if (data.existingAttempts.length > 0) {
        setSelectedAttemptIndex(0);
        loadExistingAttempt(data.existingAttempts[0], data);
      } else {
        setSelectedAttemptIndex(-1);
        initializeNewAttempt(data);
      }

    } catch (err: any) {
      console.error('Error loading grading dialog data:', err);
    } finally {
      setLoading(false);
    }
  };

  const initializeNewAttempt = (data: GradingDialogData) => {
    setOverallGrade(null);
    setOverallNotes('');
    // Default to makeup flight if trainee was not marked present
    setIsMakeupFlight(!data.wasPresent);
    setMakeupNotes('');
    setMakeupFlightDate('');
    setIpMismatchAcknowledged(false);

    const initialDloGrades: DLOGrade[] = data.objectives.map(obj => ({
      objectiveId: obj.id,
      grade: null,
      notes: ''
    }));
    setDloGrades(initialDloGrades);

    const initialNotes: Record<string, string> = {};
    data.objectives.forEach(obj => {
      initialNotes[obj.id] = '';
    });
    setDloNotes(initialNotes);
  };

  const loadExistingAttempt = async (attempt: TrainingGrade, data?: GradingDialogData) => {
    const objectives = data?.objectives || dialogData?.objectives || [];

    setOverallGrade(attempt.overallGrade);
    setOverallNotes(attempt.overallNotes || '');
    setIsMakeupFlight(attempt.isMakeupFlight);
    setMakeupNotes(attempt.makeupNotes || '');
    setMakeupFlightDate(attempt.flightDate || '');
    setIpMismatchAcknowledged(attempt.ipMismatchAcknowledged);
    setSelectedInstructorId(attempt.gradedByPilotId || null);

    // Load instructor info for this attempt
    if (attempt.gradedByPilotId) {
      const { data: instructorData } = await supabase
        .from('pilots')
        .select(`
          id,
          callsign,
          boardNumber,
          pilot_assignments!left (
            end_date,
            org_squadrons (
              tail_code,
              insignia_url,
              color_palette
            )
          )
        `)
        .eq('id', attempt.gradedByPilotId)
        .single();

      if (instructorData) {
        const activeSquadronAssignment = (instructorData.pilot_assignments || []).find(
          (sa: any) => sa.end_date === null
        );
        setInstructorInfo({
          id: instructorData.id,
          boardNumber: instructorData.boardNumber,
          callsign: instructorData.callsign,
          squadronTailCode: activeSquadronAssignment?.org_squadrons?.tail_code,
          squadronInsigniaUrl: activeSquadronAssignment?.org_squadrons?.insignia_url,
          squadronPrimaryColor: activeSquadronAssignment?.org_squadrons?.color_palette?.primary
        });
      }
    }

    const loadedDloGrades: DLOGrade[] = objectives.map(obj => {
      const existing = attempt.dloGrades.find((dlo: DLOGrade) => dlo.objectiveId === obj.id);
      return existing || {
        objectiveId: obj.id,
        grade: null,
        notes: ''
      };
    });
    setDloGrades(loadedDloGrades);

    const loadedNotes: Record<string, string> = {};
    objectives.forEach(obj => {
      const existing = attempt.dloGrades.find((dlo: DLOGrade) => dlo.objectiveId === obj.id);
      loadedNotes[obj.id] = existing?.notes || '';
    });
    setDloNotes(loadedNotes);
  };

  const handleAttemptChange = (index: number) => {
    setSelectedAttemptIndex(index);
    if (index === -1) {
      initializeNewAttempt(dialogData!);
    } else {
      loadExistingAttempt(dialogData!.existingAttempts[index]);
    }
  };

  const updateDloGrade = (objectiveId: string, grade: 'SAT' | 'UNSAT' | null) => {
    setDloGrades(prev => prev.map(dlo =>
      dlo.objectiveId === objectiveId ? { ...dlo, grade } : dlo
    ));
  };

  const updateDloNote = (objectiveId: string, notes: string) => {
    setDloNotes(prev => ({ ...prev, [objectiveId]: notes }));
  };

  const loadInstructors = async () => {
    try {
      // Get pilots with IP qualification
      const { data: ipQuals, error: ipError } = await supabase
        .from('pilot_qualifications')
        .select('pilot_id, qualifications!inner(name)')
        .eq('qualifications.name', 'Instructor Pilot')
        .eq('is_current', true);

      if (ipError) throw ipError;

      const ipPilotIds = (ipQuals || []).map((q: any) => q.pilot_id);

      if (ipPilotIds.length === 0) {
        setAvailableInstructors([]);
        return;
      }

      // Get pilot details with squadron info
      const { data: pilotsData, error: pilotsError } = await supabase
        .from('pilots')
        .select(`
          id,
          callsign,
          boardNumber,
          pilot_assignments!inner(
            end_date,
            squadron_id,
            org_squadrons(
              id,
              tail_code,
              insignia_url,
              color_palette
            )
          )
        `)
        .in('id', ipPilotIds)
        .order('boardNumber');

      if (pilotsError) throw pilotsError;

      const instructors = (pilotsData || []).map((pilot: any) => {
        const activeSquadronAssignment = (pilot.pilot_assignments || []).find(
          (sa: any) => sa.end_date === null
        );

        return {
          id: pilot.id,
          boardNumber: pilot.boardNumber,
          callsign: pilot.callsign,
          squadronId: activeSquadronAssignment?.squadron_id,
          squadronTailCode: activeSquadronAssignment?.org_squadrons?.tail_code,
          squadronInsigniaUrl: activeSquadronAssignment?.org_squadrons?.insignia_url,
          squadronPrimaryColor: activeSquadronAssignment?.org_squadrons?.color_palette?.primary
        };
      });

      setAvailableInstructors(instructors);
      console.log('Loaded instructors:', instructors.map(i => ({ callsign: i.callsign, squadron: i.squadronTailCode })));
    } catch (err: any) {
      console.error('Error loading instructors:', err);
    }
  };

  const handleChangeInstructor = async () => {
    await loadInstructors();
    setShowInstructorDialog(true);
  };

  const handleSelectInstructor = (instructor: any) => {
    console.log('Selected instructor:', instructor);
    setInstructorInfo(instructor);
    setSelectedInstructorId(instructor.id);
    console.log('selectedInstructorId set to:', instructor.id);
    setShowInstructorDialog(false);
  };

  const sortedInstructors = React.useMemo(() => {
    console.log('Sorting instructors with:', { sortBySquadron, instructorSortBy, count: availableInstructors.length });
    return [...availableInstructors].sort((a, b) => {
      // First sort by squadron if enabled
      if (sortBySquadron) {
        const squadronA = a.squadronId || 'ZZZ';
        const squadronB = b.squadronId || 'ZZZ';
        const squadronCompare = squadronA.localeCompare(squadronB);
        if (squadronCompare !== 0) {
          console.log('Squadron sort:', a.squadronTailCode, 'vs', b.squadronTailCode, '=', squadronCompare);
          return squadronCompare;
        }
      }

      // Then sort by board number or callsign
      if (instructorSortBy === 'boardNumber') {
        return parseInt(String(a.boardNumber)) - parseInt(String(b.boardNumber));
      } else {
        return a.callsign.localeCompare(b.callsign);
      }
    });
  }, [availableInstructors, sortBySquadron, instructorSortBy]);

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!dialogData || selectedAttemptIndex === -1) return;

    const attempt = dialogData.existingAttempts[selectedAttemptIndex];
    if (!attempt?.id) return;

    try {
      setSaving(true);
      setShowDeleteConfirm(false);
      const { error } = await supabase
        .from('training_grades')
        .delete()
        .eq('id', attempt.id);

      if (error) throw error;

      // Reload dialog data instead of closing
      await loadDialogData();
      onSave();
    } catch (error) {
      console.error('Error deleting grade:', error);
      alert('Failed to delete grade');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!dialogData || !currentUserPilotId || !overallGrade) {
      return;
    }

    try {
      setSaving(true);

      const isEditingExisting = selectedAttemptIndex !== -1;
      const attemptNumber = isEditingExisting
        ? dialogData.existingAttempts[selectedAttemptIndex].attemptNumber
        : (dialogData.existingAttempts.length > 0
          ? Math.max(...dialogData.existingAttempts.map(a => a.attemptNumber)) + 1
          : 1);

      // Merge grades with notes
      const dloGradesWithNotes = dloGrades.map(dlo => ({
        ...dlo,
        notes: dloNotes[dlo.objectiveId] || ''
      }));

      const gradeData: any = {
        student_id: dialogData.studentId,
        syllabus_mission_id: dialogData.syllabusMissionId,
        cycle_id: cycleId,
        event_id: dialogData.eventId,
        is_makeup_flight: isMakeupFlight,
        makeup_notes: isMakeupFlight ? makeupNotes || null : null,
        attempt_number: attemptNumber,
        graded_by_pilot_id: selectedInstructorId || currentUserPilotId,
        assigned_ip_pilot_id: dialogData.assignedIpPilotId,
        ip_mismatch_acknowledged: ipMismatchAcknowledged,
        overall_grade: overallGrade,
        overall_notes: overallNotes || null,
        dlo_grades: dloGradesWithNotes,
        flight_date: isMakeupFlight && makeupFlightDate
          ? makeupFlightDate
          : (dialogData.eventDate ? new Date(dialogData.eventDate).toISOString().split('T')[0] : null)
      };

      console.log('Saving grade with instructor:', { selectedInstructorId, currentUserPilotId, graded_by_pilot_id: gradeData.graded_by_pilot_id });

      // Include id when updating an existing attempt
      if (isEditingExisting) {
        gradeData.id = dialogData.existingAttempts[selectedAttemptIndex].id;
      }

      const { error } = await supabase
        .from('training_grades')
        .upsert(gradeData);

      if (error) throw error;

      onSave();
      onClose();
    } catch (err: any) {
      console.error('Error saving grade:', err);
      alert('Failed to save grade: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !dialogData) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '32px',
          minWidth: '400px'
        }}>
          <div style={{ textAlign: 'center', color: '#6B7280' }}>
            Loading grading data...
          </div>
        </div>
      </div>
    );
  }

  const isNewAttempt = selectedAttemptIndex === -1;
  const isReadOnly = false; // Allow editing of existing attempts
  const canCreateNewAttempt = dialogData.existingAttempts.length === 0 ||
    dialogData.existingAttempts[0].overallGrade === 'UNSAT';

  const hasIpMismatch = currentUserPilotId !== dialogData.assignedIpPilotId && dialogData.assignedIpPilotId;
  const hasUngradedDlos = dloGrades.some(dlo => dlo.grade === null);
  const hasUnsatDlos = dloGrades.some(dlo => dlo.grade === 'UNSAT');
  const canSave = overallGrade && (!hasIpMismatch || ipMismatchAcknowledged);

  // Check for unsaved changes
  const hasUnsavedChanges = overallGrade !== null ||
    overallNotes.trim() !== '' ||
    dloGrades.some(dlo => dlo.grade !== null) ||
    Object.values(dloNotes).some(note => note.trim() !== '');

  const handleCancelClick = () => {
    if (hasUnsavedChanges) {
      setShowCancelConfirm(true);
    } else {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1192px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px',
            borderBottom: '1px solid #E2E8F0',
            flexShrink: 0,
            backgroundColor: '#FFFFFF',
            position: 'relative'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <h2
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: '#1E293B',
                margin: 0
              }}
            >
              Trainee Grading Form
            </h2>
            <div style={{ fontSize: '14px', color: '#64748B' }}>
              Week {dialogData.weekNumber}{dialogData.missionNumber !== null ? ` - H${String(dialogData.missionNumber).padStart(2, '0')}` : ''}: {dialogData.missionName}
            </div>
          </div>

          {/* Reference Materials Button - positioned to the right */}
          {referenceMaterials.length > 0 && (
            <div
              data-references-button
              style={{ position: 'absolute', right: '70px', top: '24px' }}
              onMouseEnter={() => !showReferencesPopup && setIsReferencesHovered(true)}
              onMouseLeave={() => !showReferencesPopup && setIsReferencesHovered(false)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowReferencesPopup(!showReferencesPopup);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  backgroundColor: '#F1F5F9',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: '#64748B',
                  padding: 0
                }}
              >
                <BookOpen size={18} />
              </button>

              {/* Hover area extension to popup */}
              {(isReferencesHovered && !showReferencesPopup) && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    width: '100%',
                    height: '8px',
                    pointerEvents: 'auto'
                  }}
                />
              )}

              {/* Hover popup */}
              {(isReferencesHovered && !showReferencesPopup) && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '8px',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '6px',
                    padding: '12px',
                    minWidth: '300px',
                    maxWidth: '400px',
                    zIndex: 10000,
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
                    pointerEvents: 'auto',
                    border: '1px solid #E2E8F0'
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1F2937', marginBottom: '8px' }}>
                    Reference Materials
                  </div>
                  {referenceMaterials.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: idx < referenceMaterials.length - 1 ? '8px' : '0' }}>
                      {item.isInherited && (
                        <div style={{ flexShrink: 0 }}>
                          <BookOpen size={16} style={{ color: '#6B7280' }} />
                        </div>
                      )}
                      {!item.isInherited && (
                        <div style={{ width: '16px', flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', color: '#1F2937', marginBottom: '2px' }}>
                          {item.material.type}
                        </div>
                        <a
                          href={item.material.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: '14px',
                            color: '#3B82F6',
                            textDecoration: 'none',
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {item.material.name}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Clicked popup - stays open */}
              {showReferencesPopup && (
                <div
                  data-references-popup
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '8px',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '6px',
                    padding: '12px',
                    minWidth: '300px',
                    maxWidth: '400px',
                    zIndex: 10000,
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
                    border: '1px solid #E2E8F0'
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1F2937', marginBottom: '8px' }}>
                    Reference Materials
                  </div>
                  {referenceMaterials.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: idx < referenceMaterials.length - 1 ? '8px' : '0' }}>
                      {item.isInherited && (
                        <div style={{ flexShrink: 0 }}>
                          <BookOpen size={16} style={{ color: '#6B7280' }} />
                        </div>
                      )}
                      {!item.isInherited && (
                        <div style={{ width: '16px', flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', color: '#1F2937', marginBottom: '2px' }}>
                          {item.material.type}
                        </div>
                        <a
                          href={item.material.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: '14px',
                            color: '#3B82F6',
                            textDecoration: 'none',
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {item.material.name}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              right: '24px',
              top: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              backgroundColor: '#F1F5F9',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              color: '#64748B',
              flexShrink: 0
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* Pilot Info Row */}
          <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#475569',
                marginBottom: '12px'
              }}>
                Trainee
              </div>
              <div style={{
                backgroundColor: '#F8FAFC',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                padding: '12px 16px 12px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                {traineeInfo && (
                  <>
                    <PilotIDBadgeSm
                      boardNumber={String(traineeInfo.boardNumber)}
                      squadronTailCode={traineeInfo.squadronTailCode}
                      squadronInsigniaUrl={traineeInfo.squadronInsigniaUrl}
                    />
                    <span style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      color: settings.displayPilotsWithSquadronColors && traineeInfo.squadronPrimaryColor
                        ? traineeInfo.squadronPrimaryColor
                        : (traineeInfo.squadronTailCode ? '#000000' : '#374151')
                    }}>
                      {traineeInfo.callsign}
                    </span>
                    {(!dialogData.wasPresent || (dialogData.wasPresent && !dialogData.wasAssignedToFlight)) && (
                      <div
                        style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
                        title={
                          !dialogData.wasPresent
                            ? 'Trainee was not marked as present for this event.'
                            : 'Trainee was marked present but was not assigned to a flight.'
                        }
                      >
                        <AlertTriangle
                          size={16}
                          style={{ color: '#F59E0B' }}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#475569',
                marginBottom: '12px'
              }}>
                Instructor
              </div>
              <div
                onClick={handleChangeInstructor}
                style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  padding: '12px 16px 12px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                  position: 'relative'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#EFF3F7'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
              >
                {instructorInfo ? (
                  <>
                    <PilotIDBadgeSm
                      boardNumber={String(instructorInfo.boardNumber)}
                      squadronTailCode={instructorInfo.squadronTailCode}
                      squadronInsigniaUrl={instructorInfo.squadronInsigniaUrl}
                    />
                    <span style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      color: settings.displayPilotsWithSquadronColors && instructorInfo.squadronPrimaryColor
                        ? instructorInfo.squadronPrimaryColor
                        : (instructorInfo.squadronTailCode ? '#000000' : '#374151')
                    }}>
                      {instructorInfo.callsign}
                    </span>
                  </>
                ) : (
                  <div style={{ fontSize: '14px', color: '#94A3B8', marginLeft: '16px' }}>Not assigned</div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleChangeInstructor();
                  }}
                  style={{
                    marginLeft: 'auto',
                    padding: '6px',
                    backgroundColor: 'white',
                    border: '1px solid #E2E8F0',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                    flexShrink: 0
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#F1F5F9';
                    e.currentTarget.style.borderColor = '#CBD5E1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.borderColor = '#E2E8F0';
                  }}
                >
                  <Edit2 size={14} style={{ color: '#64748B' }} />
                </button>
              </div>
            </div>
          </div>

          {hasIpMismatch && !isReadOnly && (
            <div style={{
              padding: '12px',
              backgroundColor: '#FEF3C7',
              border: '1px solid #F59E0B',
              borderRadius: '6px',
              marginBottom: '12px',
              display: 'inline-block'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                <AlertTriangle size={16} style={{ color: '#F59E0B', marginTop: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '14px', color: '#92400E' }}>
                  You are not the assigned IP for this trainee. The assigned IP is {dialogData.assignedIpCallsign}.
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#374151', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={ipMismatchAcknowledged}
                  onChange={(e) => setIpMismatchAcknowledged(e.target.checked)}
                  disabled={isReadOnly}
                />
                I acknowledge that I am not the assigned IP and am authorized to grade this trainee.
              </label>
            </div>
          )}

          {/* Attempt Selector */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#475569', marginBottom: '12px' }}>
              Attempts
            </div>
            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              {[...dialogData.existingAttempts].reverse().map((attempt, index) => {
                const actualIndex = dialogData.existingAttempts.length - 1 - index;
                // Use flight_date directly as a date string (YYYY-MM-DD format)
                const attemptDate = attempt.flightDate
                  ? new Date(attempt.flightDate + 'T00:00:00').toLocaleDateString()
                  : (dialogData.eventDate ? new Date(new Date(dialogData.eventDate).toISOString().split('T')[0] + 'T00:00:00').toLocaleDateString() : 'N/A');
                const isSelected = selectedAttemptIndex === actualIndex;
                const isHovered = hoveredAttemptIndex === actualIndex;

                return (
                  <React.Fragment key={attempt.id}>
                    <div
                      onClick={() => !isSelected && handleAttemptChange(actualIndex)}
                      onMouseEnter={() => setHoveredAttemptIndex(actualIndex)}
                      onMouseLeave={() => setHoveredAttemptIndex(null)}
                      style={{
                        padding: '12px',
                        backgroundColor: isSelected ? '#FFFFFF' : (isHovered ? '#F1F5F9' : '#FFFFFF'),
                        border: isSelected ? '2px solid #3B82F6' : (isHovered ? '2px solid #94A3B8' : '2px solid #E2E8F0'),
                        borderRadius: '6px',
                        width: '200px',
                        position: 'relative',
                        boxSizing: 'border-box',
                        cursor: isSelected ? 'default' : 'pointer',
                        transition: 'background-color 0.15s ease, border-color 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', marginBottom: '4px' }}>
                            Attempt {attempt.attemptNumber}
                          </div>
                          <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                            {attemptDate}
                          </div>
                        </div>
                        {isHovered && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAttemptIndex(actualIndex);
                              handleDeleteClick();
                            }}
                            style={{
                              padding: '4px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#DC2626',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>
                        IP: {attempt.instructorBoardNumber ? `${attempt.instructorBoardNumber} ` : ''}{attempt.instructorCallsign || 'N/A'}
                      </div>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: attempt.overallGrade === 'SAT' ? '#10B981' : '#F59E0B',
                        marginTop: '6px'
                      }}>
                        {attempt.overallGrade}
                      </div>
                    </div>
                    {index < dialogData.existingAttempts.length - 1 && (
                      <ChevronRight size={16} style={{ color: '#CBD5E1', flexShrink: 0 }} />
                    )}
                  </React.Fragment>
                );
              })}
              {canCreateNewAttempt && dialogData.existingAttempts.length > 0 && (
                <ChevronRight size={16} style={{ color: '#CBD5E1', flexShrink: 0 }} />
              )}
              {selectedAttemptIndex === -1 ? (
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: '#FFFFFF',
                    border: '2px solid #3B82F6',
                    borderRadius: '6px',
                    width: '200px',
                    minHeight: '86px',
                    position: 'relative',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', marginBottom: '4px' }}>
                        Attempt {dialogData.existingAttempts.length + 1}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                        {dialogData.eventDate ? new Date(new Date(dialogData.eventDate).toISOString().split('T')[0] + 'T00:00:00').toLocaleDateString() : new Date().toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>
                    IP: {instructorInfo ? `${instructorInfo.boardNumber} ${instructorInfo.callsign}` : 'N/A'}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#94A3B8',
                    marginTop: '6px'
                  }}>
                    Grading In Progress
                  </div>
                </div>
              ) : canCreateNewAttempt && (
                <div
                  onClick={() => handleAttemptChange(-1)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#EFF3F7';
                    e.currentTarget.style.borderColor = '#94A3B8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.borderColor = '#CBD5E1';
                  }}
                  style={{
                    padding: '12px',
                    backgroundColor: 'white',
                    border: '1px dashed #CBD5E1',
                    borderRadius: '6px',
                    width: '200px',
                    height: '98px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease, border-color 0.2s ease',
                    boxSizing: 'border-box'
                  }}
                >
                  <Plus size={24} style={{ color: '#94A3B8' }} />
                </div>
              )}
            </div>
          </div>

          {/* Two-column layout */}
          <div style={{ display: 'flex', gap: '24px' }}>
            {/* Left Column - DLO Grading */}
            <div style={{ minWidth: '560px', maxWidth: '560px' }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#475569',
                marginBottom: '12px'
              }}>
                Desired Learning Outcomes
              </div>
              {dloGrades.length === 0 ? (
                <div style={{ padding: '16px', backgroundColor: '#F9FAFB', borderRadius: '6px', textAlign: 'center', color: '#6B7280' }}>
                  No individual-scope objectives defined for this mission.
                </div>
              ) : (
                <div style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}>
                  {dloGrades.map((dlo) => {
                    const objective = dialogData.objectives.find(o => o.id === dlo.objectiveId);
                    if (!objective) return null;

                    return (
                      <div key={dlo.objectiveId}>
                        <div style={{ fontSize: '14px', fontWeight: 500, color: '#1E293B', marginBottom: '8px' }}>
                          {objective.objectiveText}
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '1px' }}>
                            <button
                              onClick={() => !isReadOnly && updateDloGrade(dlo.objectiveId, 'SAT')}
                              disabled={isReadOnly}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '6px 10px',
                                height: '32px',
                                backgroundColor: dlo.grade === 'SAT' ? '#10B981' : '#FFFFFF',
                                color: dlo.grade === 'SAT' ? '#FFFFFF' : '#64748B',
                                border: `1px solid ${dlo.grade === 'SAT' ? '#10B981' : '#CBD5E1'}`,
                                borderRadius: '6px',
                                fontSize: '13px',
                                fontWeight: 500,
                                cursor: isReadOnly ? 'not-allowed' : 'pointer',
                                opacity: isReadOnly ? 0.5 : 1,
                                transition: 'all 0.15s ease'
                              }}
                            >
                              SAT
                            </button>
                            <button
                              onClick={() => !isReadOnly && updateDloGrade(dlo.objectiveId, 'UNSAT')}
                              disabled={isReadOnly}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '6px 10px',
                                height: '32px',
                                backgroundColor: dlo.grade === 'UNSAT' ? '#94A3B8' : '#FFFFFF',
                                color: dlo.grade === 'UNSAT' ? '#1E293B' : '#64748B',
                                border: `1px solid ${dlo.grade === 'UNSAT' ? '#94A3B8' : '#CBD5E1'}`,
                                borderRadius: '6px',
                                fontSize: '13px',
                                fontWeight: 500,
                                cursor: isReadOnly ? 'not-allowed' : 'pointer',
                                opacity: isReadOnly ? 0.5 : 1,
                                transition: 'all 0.15s ease'
                              }}
                            >
                              UNSAT
                            </button>
                          </div>
                          <textarea
                            value={dloNotes[dlo.objectiveId] || ''}
                            onChange={(e) => !isReadOnly && updateDloNote(dlo.objectiveId, e.target.value)}
                            disabled={isReadOnly}
                            style={{
                              flex: 1,
                              height: '69px',
                              padding: '4px 8px 8px 8px',
                              fontSize: '13px',
                              lineHeight: '1.5',
                              color: '#1E293B',
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #CBD5E1',
                              borderRadius: '4px',
                              resize: 'none',
                              outline: 'none',
                              fontFamily: 'inherit',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column - Overall Grade and Makeup Flight */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#475569',
                  marginBottom: '12px'
                }}>
                  Overall Grade
                </div>
                <div style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '1px' }}>
                      <button
                        onClick={() => !isReadOnly && setOverallGrade('SAT')}
                        disabled={isReadOnly}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '6px 10px',
                          height: '32px',
                          backgroundColor: overallGrade === 'SAT' ? '#10B981' : '#FFFFFF',
                          color: overallGrade === 'SAT' ? '#FFFFFF' : '#64748B',
                          border: `1px solid ${overallGrade === 'SAT' ? '#10B981' : '#CBD5E1'}`,
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: 500,
                          cursor: isReadOnly ? 'not-allowed' : 'pointer',
                          opacity: isReadOnly ? 0.5 : 1,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        SAT
                      </button>
                      <button
                        onClick={() => !isReadOnly && setOverallGrade('UNSAT')}
                        disabled={isReadOnly}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '6px 10px',
                          height: '32px',
                          backgroundColor: overallGrade === 'UNSAT' ? '#94A3B8' : '#FFFFFF',
                          color: overallGrade === 'UNSAT' ? '#1E293B' : '#64748B',
                          border: `1px solid ${overallGrade === 'UNSAT' ? '#94A3B8' : '#CBD5E1'}`,
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: 500,
                          cursor: isReadOnly ? 'not-allowed' : 'pointer',
                          opacity: isReadOnly ? 0.5 : 1,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        UNSAT
                      </button>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <textarea
                        value={overallNotes}
                        onChange={(e) => !isReadOnly && setOverallNotes(e.target.value)}
                        disabled={isReadOnly}
                        style={{
                          height: '207px',
                          padding: '4px 8px 8px 8px',
                          fontSize: '13px',
                          lineHeight: '1.5',
                          color: '#1E293B',
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          borderRadius: '4px',
                          resize: 'none',
                          outline: 'none',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box'
                        }}
                      />

                      {/* Validation warnings */}
                      {overallGrade === 'SAT' && hasUngradedDlos && !isReadOnly && (
                        <div style={{
                          padding: '12px',
                          backgroundColor: '#FEF3C7',
                          border: '1px solid #F59E0B',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          marginTop: '12px'
                        }}>
                          <AlertTriangle size={16} style={{ color: '#F59E0B', marginTop: '2px', flexShrink: 0 }} />
                          <div style={{ fontSize: '14px', color: '#92400E' }}>
                            Overall grade is SAT but some DLOs have not been graded.
                          </div>
                        </div>
                      )}

                      {overallGrade === 'SAT' && hasUnsatDlos && !isReadOnly && (
                        <div style={{
                          padding: '12px',
                          backgroundColor: '#FEF3C7',
                          border: '1px solid #F59E0B',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          marginTop: '12px'
                        }}>
                          <AlertTriangle size={16} style={{ color: '#F59E0B', marginTop: '2px', flexShrink: 0 }} />
                          <div style={{ fontSize: '14px', color: '#92400E' }}>
                            Overall grade is SAT but some DLOs are UNSAT.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Makeup Flight Toggle and Date */}
              {!isReadOnly && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '40px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', cursor: 'pointer' }}>
                    <div
                      onClick={(e) => {
                        e.preventDefault();
                        setIsMakeupFlight(!isMakeupFlight);
                      }}
                      style={{
                        width: '44px',
                        height: '24px',
                        backgroundColor: isMakeupFlight ? '#3B82F6' : '#CBD5E1',
                        borderRadius: '12px',
                        position: 'relative',
                        transition: 'background-color 0.2s ease',
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                    >
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          backgroundColor: '#FFFFFF',
                          borderRadius: '50%',
                          position: 'absolute',
                          top: '2px',
                          left: isMakeupFlight ? '22px' : '2px',
                          transition: 'left 0.2s ease',
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                        }}
                      />
                    </div>
                    <span style={{ fontWeight: 500, color: '#374151' }}>This was a makeup flight</span>
                  </label>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', visibility: isMakeupFlight ? 'visible' : 'hidden' }}>
                    <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569' }}>
                      Makeup Flight Date
                    </label>
                    <input
                      type="date"
                      value={makeupFlightDate}
                      onChange={(e) => setMakeupFlightDate(e.target.value)}
                      disabled={!isMakeupFlight}
                      style={{
                        padding: '6px 12px',
                        fontSize: '14px',
                        color: '#1E293B',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #CBD5E1',
                        borderRadius: '6px',
                        outline: 'none',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        {!isReadOnly && (
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              backgroundColor: '#F9FAFB',
              flexShrink: 0
            }}
          >
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleCancelClick}
                disabled={saving}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#374151',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !canSave}
                style={{
                  padding: '10px 20px',
                  backgroundColor: canSave ? '#3B82F6' : '#9CA3AF',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (saving || !canSave) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                {saving ? 'Saving...' : (selectedAttemptIndex === -1 ? 'Save Grade' : 'Update Grade')}
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        title="Delete Attempt"
        message={`Delete Attempt ${dialogData?.existingAttempts[selectedAttemptIndex]?.attemptNumber}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        icon="trash"
      />

      <ConfirmationDialog
        isOpen={showCancelConfirm}
        onConfirm={onClose}
        onCancel={() => setShowCancelConfirm(false)}
        title="Discard Changes"
        message="You have unsaved changes. Are you sure you want to discard them?"
        confirmText="Discard"
        cancelText="Keep Editing"
        type="warning"
      />

      {/* Instructor Selection Dialog */}
      {showInstructorDialog && (
        <div
          onClick={() => setShowInstructorDialog(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001
          }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              width: '500px',
              maxHeight: '750px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#111827' }}>
                Select Instructor
              </h2>
              <button
                onClick={() => setShowInstructorDialog(false)}
                style={{
                  padding: '4px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={20} style={{ color: '#6B7280' }} />
              </button>
            </div>

            {/* Sort Controls */}
            <div style={{
              padding: '12px 24px',
              borderBottom: '1px solid #E5E7EB',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '12px', color: '#6B7280' }}>Sort by:</span>
              <button
                onClick={() => setSortBySquadron(!sortBySquadron)}
                style={{
                  padding: '4px 12px',
                  backgroundColor: sortBySquadron ? '#2563EB' : 'white',
                  color: sortBySquadron ? 'white' : '#6B7280',
                  border: `1px solid ${sortBySquadron ? '#2563EB' : '#D1D5DB'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s ease'
                }}
              >
                <ArrowUpDown size={12} />
                Squadron
              </button>
              <button
                onClick={() => setInstructorSortBy('boardNumber')}
                style={{
                  padding: '4px 12px',
                  backgroundColor: instructorSortBy === 'boardNumber' ? '#2563EB' : 'white',
                  color: instructorSortBy === 'boardNumber' ? 'white' : '#6B7280',
                  border: `1px solid ${instructorSortBy === 'boardNumber' ? '#2563EB' : '#D1D5DB'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                  transition: 'all 0.2s ease'
                }}
              >
                Board Number
              </button>
              <button
                onClick={() => setInstructorSortBy('callsign')}
                style={{
                  padding: '4px 12px',
                  backgroundColor: instructorSortBy === 'callsign' ? '#2563EB' : 'white',
                  color: instructorSortBy === 'callsign' ? 'white' : '#6B7280',
                  border: `1px solid ${instructorSortBy === 'callsign' ? '#2563EB' : '#D1D5DB'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                  transition: 'all 0.2s ease'
                }}
              >
                Callsign
              </button>
            </div>

            {/* Instructor List */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 24px'
            }}>
              {sortedInstructors.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#6B7280' }}>
                  No instructors available
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {sortedInstructors.map((instructor) => {
                    const isHovered = hoveredInstructorId === instructor.id;
                    return (
                      <div
                        key={instructor.id}
                        onClick={() => handleSelectInstructor(instructor)}
                        onMouseEnter={() => setHoveredInstructorId(instructor.id)}
                        onMouseLeave={() => setHoveredInstructorId(null)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          height: '24px',
                          marginBottom: '10px',
                          cursor: 'pointer',
                          backgroundColor: isHovered ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
                          transition: 'background-color 0.2s ease',
                          borderRadius: '8px',
                          padding: '2px 10px',
                          gap: '12px'
                        }}
                      >
                        <div style={{ marginLeft: '-20px' }}>
                          <PilotIDBadgeSm
                            boardNumber={String(instructor.boardNumber)}
                            squadronTailCode={instructor.squadronTailCode}
                            squadronInsigniaUrl={instructor.squadronInsigniaUrl}
                          />
                        </div>
                        <span style={{
                          fontSize: '16px',
                          fontWeight: 700,
                          color: settings.displayPilotsWithSquadronColors && instructor.squadronPrimaryColor
                            ? instructor.squadronPrimaryColor
                            : (instructor.squadronTailCode ? '#000000' : '#374151')
                        }}>
                          {instructor.callsign}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setShowInstructorDialog(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#374151',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GradingDialog;
