import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Users, Trash2, ArrowUpDown, UserCheck, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { CycleType, TrainingSyllabus, CycleActivity, CycleSettings, EventActivityParticipantBlock } from '../../../types/EventTypes';
import { Squadron } from '../../../types/OrganizationTypes';
import { supabase, getCycleActivities, createEvent, deleteEvent } from '../../../utils/supabaseClient';
import { createPortal } from 'react-dom';
import CycleActivitiesBuilder, { BuilderSelection, PendingParticipantRow, CycleBuilderEvent, criteriaRowKey } from './CycleActivitiesBuilder';
import CycleActivityConfigPanel from './CycleActivityConfigPanel';
import ParticipantBlocksEditor from './ParticipantBlocksEditor';
import { enrollPilots, removeEnrollment, getCycleEnrollments, type EnrolledPilot } from '../../../utils/trainingEnrollmentService';
import {
  enrollInstructors,
  removeInstructor,
  getCycleInstructorEnrollments,
  getSuggestedInstructors,
  getSuggestedStudentEnrollments,
  type EnrolledInstructor
} from '../../../utils/instructorEnrollmentService';
import PilotIDBadgeSm from '../PilotIDBadgeSm';
import FilterDrawer, { QualificationFilterMode } from '../roster/FilterDrawer';
import { Status } from '../../../utils/statusService';
import { Standing } from '../../../utils/standingService';
import { Role } from '../../../utils/roleService';
import { Qualification, getBatchPilotQualifications } from '../../../utils/qualificationService';
import { getUserSettings } from '../../../utils/userSettingsService';
import { useAppSettings } from '../../../context/AppSettingsContext';

interface CycleDialogProps {
  onSave: (cycleData: {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    type: CycleType;
    participants?: string[];
    syllabusId?: string;
    autoCreateEvents?: boolean;
    stagedEnrollmentIds?: string[];
    stagedInstructorIds?: string[];
    settings?: CycleSettings; // developer-flagged: cycle-level event defaults
    cycleActivities?: CycleActivity[]; // developer-flagged: activities blocked out for the cycle
  }) => void;
  onCancel: () => void;
  squadrons: Squadron[];
  statuses: Status[];
  standings: Standing[];
  roles: Role[];
  qualifications: Qualification[];
  cycleId?: string; // For editing existing cycles
  initialData?: {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    type: CycleType;
    participants?: string[];
    syllabusId?: string;
    settings?: CycleSettings;
  };
  hasEvents?: boolean;
  isSaving?: boolean;
}

export const CycleDialog: React.FC<CycleDialogProps> = ({
  onSave,
  onCancel,
  squadrons,
  statuses,
  standings,
  roles,
  qualifications,
  cycleId,
  initialData,
  hasEvents = false,
  isSaving = false
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [startDate, setStartDate] = useState(initialData?.startDate ? new Date(initialData.startDate).toISOString().split('T')[0] : '');
  const [endDate, setEndDate] = useState(initialData?.endDate ? new Date(initialData.endDate).toISOString().split('T')[0] : '');
  const [type, setType] = useState<CycleType>(initialData?.type || 'Training');
  const [participants, setParticipatingSquadrons] = useState<string[]>(initialData?.participants || []);
  const [weekCount, setWeekCount] = useState<number>(1);
  const [error, setError] = useState('');

  // Training syllabus state
  // Initialize with a placeholder if we have an initial syllabus ID
  const [syllabi, setSyllabi] = useState<TrainingSyllabus[]>(
    initialData?.syllabusId
      ? [{ id: initialData.syllabusId, name: 'Loading...', description: '' }]
      : []
  );
  const [selectedSyllabusId, setSelectedSyllabusId] = useState<string>(initialData?.syllabusId || '');
  const [autoCreateEvents, setAutoCreateEvents] = useState<boolean>(false);

  // Event Activities (developer-flagged): cycle activities blocked out on the
  // builder, plus cycle-level event defaults
  const [activitiesEnabled, setActivitiesEnabled] = useState(false);
  const [cycleActivities, setCycleActivities] = useState<CycleActivity[]>([]);
  const [builderSelection, setBuilderSelection] = useState<BuilderSelection>(null);
  // Ordered participant rows - the authoritative row order for the builder
  // (rows persist even while empty so cross-row drags don't reshuffle them)
  const [participantRows, setParticipantRows] = useState<PendingParticipantRow[]>([]);
  // Students/Instructors tabs enroll into this activity ('' = cycle-wide)
  const [enrollmentActivityScopeId, setEnrollmentActivityScopeId] = useState<string>('');
  const selectedActivityIndex = builderSelection?.type === 'activity' ? builderSelection.index : null;
  const [syllabusNames, setSyllabusNames] = useState<Record<string, string>>({});
  // Ordered lesson names per syllabus id (builder preview of unsaved activities)
  const [syllabusMissionNames, setSyllabusMissionNames] = useState<Record<string, string[]>>({});
  // Options/Reminders/Publication: an edited cycle restores its saved settings;
  // a new cycle (or a legacy one without settings) seeds from the user's
  // default event settings so the defaults are visible and reviewable
  const { settings: appSettings } = useAppSettings();
  const [cycleSettings, setCycleSettings] = useState<CycleSettings>(() => {
    if (initialData?.settings) return initialData.settings;
    const defaults = appSettings.eventDefaults;
    return {
      trackQualifications: defaults.groupResponsesByQualification ?? false,
      groupBySquadron: defaults.groupBySquadron ?? false,
      showNoResponse: defaults.showNoResponse ?? false,
      allowTentativeResponse: defaults.allowTentativeResponse ?? true,
      firstReminderEnabled: defaults.firstReminderEnabled ?? false,
      firstReminderTime: defaults.firstReminderTime,
      firstReminderRecipients: defaults.firstReminderRecipients,
      secondReminderEnabled: defaults.secondReminderEnabled ?? false,
      secondReminderTime: defaults.secondReminderTime,
      secondReminderRecipients: defaults.secondReminderRecipients,
      initialNotificationRoles: defaults.initialNotificationRoles,
      scheduledPublicationEnabled: defaults.scheduledPublicationEnabledByDefault ?? false,
      scheduledPublicationOffset: defaults.scheduledPublicationOffset
    };
  });

  // Tab state (show tabs for Training cycles with syllabus selected OR when
  // editing; with the Activities flag on, tabs always show)
  const showTabs = (type === 'Training' && (!!cycleId || !!selectedSyllabusId)) || activitiesEnabled;
  const [activeTab, setActiveTab] = useState<'details' | 'activities' | 'enrollments' | 'instructors' | 'options' | 'reminders' | 'publication'>('details');

  // Enrollment state (students)
  const [enrolledPilots, setEnrolledPilots] = useState<EnrolledPilot[]>([]);
  const [suggestedPilots, setSuggestedPilots] = useState<EnrolledPilot[]>([]);
  const [allPilots, setAllPilots] = useState<EnrolledPilot[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [initialEnrollmentLoadComplete, setInitialEnrollmentLoadComplete] = useState(false);
  const [hoveredPilotId, setHoveredPilotId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'boardNumber' | 'callsign'>('callsign');
  const [sortBySquadron, setSortBySquadron] = useState<boolean>(true);

  // Staged enrollments for new cycles (before cycle is created)
  const [stagedEnrollmentIds, setStagedEnrollmentIds] = useState<string[]>([]);

  // Instructor enrollment state
  const [enrolledInstructors, setEnrolledInstructors] = useState<EnrolledInstructor[]>([]);
  const [suggestedInstructors, setSuggestedInstructors] = useState<EnrolledInstructor[]>([]);
  const [allInstructorCandidates, setAllInstructorCandidates] = useState<EnrolledInstructor[]>([]);
  const [loadingInstructors, setLoadingInstructors] = useState(false);
  const [instructorError, setInstructorError] = useState<string | null>(null);
  const [hoveredInstructorId, setHoveredInstructorId] = useState<string | null>(null);
  const [stagedInstructorIds, setStagedInstructorIds] = useState<string[]>([]);
  const [instructorSortBy, setInstructorSortBy] = useState<'boardNumber' | 'callsign'>('callsign');
  const [instructorSortBySquadron, setInstructorSortBySquadron] = useState<boolean>(true);

  // Filter state
  const [selectedSquadronIds, setSelectedSquadronIds] = useState<string[]>([]);
  const [selectedStatusIds, setSelectedStatusIds] = useState<string[]>([]);
  const [selectedStandingIds, setSelectedStandingIds] = useState<string[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [qualificationFilters, setQualificationFilters] = useState<Record<string, QualificationFilterMode>>({});
  const [filtersEnabled, setFiltersEnabled] = useState<boolean>(true);

  // Add refs to track which field was last changed
  const lastChanged = useRef<'weeks' | 'endDate' | 'syllabus' | null>(null);

  // Build qualifications map for FilterDrawer from EnrolledPilot data
  const enrolledPilotQualifications = useMemo(() => {
    const qualMap: Record<string, any[]> = {};
    [...enrolledPilots, ...suggestedPilots, ...allPilots].forEach(pilot => {
      if (pilot.qualifications && pilot.qualifications.length > 0) {
        qualMap[pilot.pilot_id] = pilot.qualifications;
      }
    });
    return qualMap;
  }, [enrolledPilots, suggestedPilots, allPilots]);

  // Filter pilots helper function
  const filterPilots = (pilots: EnrolledPilot[]): EnrolledPilot[] => {
    if (!filtersEnabled) return pilots;

    return pilots.filter(pilot => {
      // Squadron filter
      if (selectedSquadronIds.length > 0) {
        if (!pilot.squadron?.id) {
          if (!selectedSquadronIds.includes('unassigned')) return false;
        } else {
          if (!selectedSquadronIds.includes(pilot.squadron.id)) return false;
        }
      }

      // Status filter
      if (selectedStatusIds.length > 0 && pilot.currentStatus) {
        if (!selectedStatusIds.includes(pilot.currentStatus.id)) return false;
      }

      // Standing filter
      if (selectedStandingIds.length > 0 && pilot.currentStanding) {
        if (!selectedStandingIds.includes(pilot.currentStanding.id)) return false;
      }

      // Role filter
      if (selectedRoleIds.length > 0) {
        const hasRole = pilot.roles?.some(r => selectedRoleIds.includes(r.role.id));
        if (!hasRole) return false;
      }

      // Qualification filter
      const qualIds = Object.keys(qualificationFilters);
      if (qualIds.length > 0) {
        for (const qualId of qualIds) {
          const mode = qualificationFilters[qualId];
          const hasQual = pilot.qualifications?.some(q => q.qualification.id === qualId);

          if (mode === 'include' && !hasQual) return false;
          if (mode === 'exclude' && hasQual) return false;
        }
      }

      return true;
    });
  };

  // Sort pilots helper function
  const sortPilots = (pilots: EnrolledPilot[]): EnrolledPilot[] => {
    return [...pilots].sort((a, b) => {
      // First sort by squadron ID if enabled
      if (sortBySquadron) {
        const squadronA = a.squadron?.id || '';
        const squadronB = b.squadron?.id || '';
        const squadronCompare = squadronA.localeCompare(squadronB);
        if (squadronCompare !== 0) return squadronCompare;
      }

      // Then sort by board number or callsign
      if (sortBy === 'boardNumber') {
        const numA = parseInt(a.board_number || '0') || 0;
        const numB = parseInt(b.board_number || '0') || 0;
        return numA - numB;
      } else {
        // Sort by callsign
        return a.callsign.localeCompare(b.callsign);
      }
    });
  };

  // Render sort controls
  const renderSortControls = () => (
    <div style={{
      display: 'flex',
      gap: '8px',
      marginBottom: '16px',
      justifyContent: 'flex-end'
    }}>
      <span style={{ fontSize: '12px', color: '#6B7280', marginRight: '4px', alignSelf: 'center' }}>
        Sort by:
      </span>
      <button
        type="button"
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
        type="button"
        onClick={() => setSortBy('boardNumber')}
        style={{
          padding: '4px 12px',
          backgroundColor: sortBy === 'boardNumber' ? '#2563EB' : 'white',
          color: sortBy === 'boardNumber' ? 'white' : '#6B7280',
          border: `1px solid ${sortBy === 'boardNumber' ? '#2563EB' : '#D1D5DB'}`,
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
        Board Number
      </button>
      <button
        type="button"
        onClick={() => setSortBy('callsign')}
        style={{
          padding: '4px 12px',
          backgroundColor: sortBy === 'callsign' ? '#2563EB' : 'white',
          color: sortBy === 'callsign' ? 'white' : '#6B7280',
          border: `1px solid ${sortBy === 'callsign' ? '#2563EB' : '#D1D5DB'}`,
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
        Callsign
      </button>
    </div>
  );

  // Update selectedSyllabusId when initialData changes (e.g., when dialog reopens with fresh data)
  useEffect(() => {
    setSelectedSyllabusId(initialData?.syllabusId || '');
  }, [initialData?.syllabusId]);

  // Event Activities: read the developer feature flag once on mount
  useEffect(() => {
    let cancelled = false;
    getUserSettings().then(result => {
      if (!cancelled && result.success && result.data?.developer?.enableEventActivities) {
        setActivitiesEnabled(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // The cycle's events linked to activities, shown as cells inside the bars
  const [cycleEventItems, setCycleEventItems] = useState<CycleBuilderEvent[]>([]);

  const loadCycleEventItems = async () => {
    if (!cycleId) return;
    const [{ data: eventRows }, { data: linkRows }] = await Promise.all([
      supabase.from('events').select('id, name, start_datetime, end_datetime').eq('cycle_id', cycleId),
      (supabase as any)
        .from('event_activities')
        .select('event_id, cycle_activity_id')
        .eq('cycle_id', cycleId)
        .not('cycle_activity_id', 'is', null)
    ]);
    const eventsById = new Map<string, any>();
    (eventRows || []).forEach((row: any) => eventsById.set(row.id, row));
    const items: CycleBuilderEvent[] = [];
    ((linkRows || []) as any[]).forEach(link => {
      const eventRow = eventsById.get(link.event_id);
      if (!eventRow) return;
      items.push({
        id: eventRow.id,
        name: eventRow.name,
        startDatetime: eventRow.start_datetime,
        endDatetime: eventRow.end_datetime,
        cycleActivityId: link.cycle_activity_id
      });
    });
    setCycleEventItems(items);
  };

  useEffect(() => {
    if (!activitiesEnabled || !cycleId) return;
    loadCycleEventItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activitiesEnabled, cycleId]);

  // Drag-reorder of an event cell: shift the event to the target week (same
  // weekday/time); if another of the activity's events occupies that week the
  // two swap dates
  const handleMoveEventToWeek = async (eventId: string, targetWeek: number, cycleActivityId: string) => {
    if (!startDate) return;
    const base = new Date(startDate);
    const weekOf = (iso: string) => Math.max(1, Math.floor((new Date(iso).getTime() - base.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);

    const item = cycleEventItems.find(e => e.id === eventId);
    if (!item) return;
    const originWeek = weekOf(item.startDatetime);
    const deltaMs = (targetWeek - originWeek) * 7 * 24 * 60 * 60 * 1000;
    if (deltaMs === 0) return;

    const occupant = cycleEventItems.find(e =>
      e.cycleActivityId === cycleActivityId && e.id !== eventId && weekOf(e.startDatetime) === targetWeek
    );

    const shifted = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms).toISOString();

    // Optimistic update first - the drag preview clears on mouseup, so waiting
    // for the DB round-trip makes the event snap back to its old week briefly.
    // An event can appear under several activities; its dates shift everywhere.
    setCycleEventItems(prev => prev.map(e => {
      if (e.id === item.id) {
        return { ...e, startDatetime: shifted(e.startDatetime, deltaMs), endDatetime: e.endDatetime ? shifted(e.endDatetime, deltaMs) : e.endDatetime };
      }
      if (occupant && e.id === occupant.id) {
        return { ...e, startDatetime: shifted(e.startDatetime, -deltaMs), endDatetime: e.endDatetime ? shifted(e.endDatetime, -deltaMs) : e.endDatetime };
      }
      return e;
    }));

    const shiftEvent = async (target: CycleBuilderEvent, ms: number) => {
      const updates: any = {
        start_datetime: shifted(target.startDatetime, ms)
      };
      if (target.endDatetime) {
        updates.end_datetime = shifted(target.endDatetime, ms);
      }
      const { error: shiftError } = await supabase.from('events').update(updates).eq('id', target.id);
      if (shiftError) throw shiftError;
    };

    try {
      await shiftEvent(item, deltaMs);
      if (occupant) await shiftEvent(occupant, -deltaMs);
    } catch (err: any) {
      console.error('Failed to move event:', err);
      setError(err.message || 'Failed to move event');
      await loadCycleEventItems(); // revert the optimistic update
    }
  };

  // --- Event management inside activity bars ---

  // Click-to-add picker: recommends the syllabus missions not yet scheduled
  // inside the activity
  const [addEventPicker, setAddEventPicker] = useState<{
    activityIndex: number;
    week: number;
    x: number;
    y: number;
    missing: Array<{ id: string; mission_name: string }>;
  } | null>(null);

  const eventTimesForWeek = (week: number): { start: string; end: string } | null => {
    if (!startDate) return null;
    const [y, m, d] = startDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + (week - 1) * 7);
    const [hh, mm] = (appSettings.eventDefaults.defaultStartTime || '20:30').split(':').map(Number);
    date.setHours(hh, mm, 0, 0);
    const end = new Date(date.getTime() + ((appSettings.eventDefaults.defaultDurationHours ?? 2) * 60 + (appSettings.eventDefaults.defaultDurationMinutes ?? 0)) * 60000);
    return { start: date.toISOString(), end: end.toISOString() };
  };

  const createEventForActivityWeek = async (
    activity: CycleActivity,
    week: number,
    mission?: { id: string; mission_name: string }
  ) => {
    if (!cycleId || !activity.id) return;
    const times = eventTimesForWeek(week);
    if (!times) return;
    const title = mission?.mission_name
      || activity.label
      || (activity.syllabusId ? syllabusNames[activity.syllabusId] : undefined)
      || 'Training Exercise';
    const activityPayload = mission
      ? {
          kind: 'lesson' as const,
          displayOrder: 0,
          cycleActivityId: activity.id,
          syllabusMissionId: mission.id,
          label: activity.label,
          settings: activity.settings || {}
        }
      : activity.kind === 'objectives'
        ? {
            kind: 'objectives' as const,
            displayOrder: 0,
            cycleActivityId: activity.id,
            label: activity.label,
            adHocObjectives: activity.adHocObjectives || [],
            settings: activity.settings || {}
          }
        : null;
    if (!activityPayload) return;

    const { error: createError } = await createEvent({
      title,
      description: '',
      datetime: times.start,
      endDatetime: times.end,
      eventType: 'Hop',
      cycleId,
      status: 'upcoming',
      participants,
      trackQualifications: cycleSettings.trackQualifications ?? false,
      activities: [activityPayload]
    } as any);
    if (createError) {
      setError((createError as any).message || 'Failed to create event');
      return;
    }
    await loadCycleEventItems();
  };

  const handleAddEventInWeek = async (activityIndex: number, week: number, position: { x: number; y: number }) => {
    const activity = cycleActivities[activityIndex];
    if (!activity?.id) return;
    if (activity.kind === 'objectives') {
      await createEventForActivityWeek(activity, week);
      return;
    }
    if (!activity.syllabusId) return;
    // Recommend missions not already scheduled inside this activity
    const [{ data: missions }, { data: links }] = await Promise.all([
      (supabase as any).from('training_syllabus_missions').select('id, mission_name, week_number').eq('syllabus_id', activity.syllabusId).order('week_number'),
      (supabase as any).from('event_activities').select('syllabus_mission_id').eq('cycle_activity_id', activity.id)
    ]);
    const usedMissionIds = new Set(((links || []) as any[]).map(l => l.syllabus_mission_id).filter(Boolean));
    const missing = ((missions || []) as any[]).filter(m => !usedMissionIds.has(m.id));
    setAddEventPicker({ activityIndex, week, x: position.x, y: position.y, missing });
  };

  const handleDeleteEventFromActivity = async (eventItem: CycleBuilderEvent) => {
    try {
      const { data: links } = await (supabase as any)
        .from('event_activities')
        .select('id, cycle_activity_id')
        .eq('event_id', eventItem.id);
      const otherLinks = ((links || []) as any[]).filter(l => l.cycle_activity_id !== eventItem.cycleActivityId);
      if (otherLinks.length > 0) {
        // The event hosts other activities too - only detach this one
        await (supabase as any)
          .from('event_activities')
          .delete()
          .eq('event_id', eventItem.id)
          .eq('cycle_activity_id', eventItem.cycleActivityId);
      } else {
        await deleteEvent(eventItem.id);
      }
      await loadCycleEventItems();
    } catch (err: any) {
      console.error('Failed to remove event:', err);
      setError(err.message || 'Failed to remove event');
    }
  };

  // Reset a syllabus activity: block spans one week per lesson again, and its
  // events are rebuilt to match the syllabus order (relinking, renaming solely
  // owned events, creating missing weeks, dropping leftover/duplicate links)
  const handleResetActivity = async (index: number) => {
    const activity = cycleActivities[index];
    if (!activity?.id || activity.kind !== 'syllabus' || !activity.syllabusId || !cycleId || !startDate) return;
    try {
      const { data: missions } = await (supabase as any)
        .from('training_syllabus_missions')
        .select('id, mission_name')
        .eq('syllabus_id', activity.syllabusId)
        .order('week_number');
      const missionList = (missions || []) as Array<{ id: string; mission_name: string }>;
      if (missionList.length === 0) return;

      const newEndWeek = activity.startWeek + missionList.length - 1;
      if (newEndWeek > weekCount) {
        setWeekCount(newEndWeek);
        lastChanged.current = 'weeks';
      }
      setCycleActivities(prev => prev.map((a, i) => (i === index ? { ...a, endWeek: newEndWeek } : a)));

      const [{ data: links }, { data: eventRows }] = await Promise.all([
        (supabase as any).from('event_activities').select('id, event_id, syllabus_mission_id').eq('cycle_activity_id', activity.id),
        supabase.from('events').select('id, name, start_datetime').eq('cycle_id', cycleId)
      ]);
      const base = new Date(startDate);
      const weekOf = (iso: string) => Math.max(1, Math.floor((new Date(iso).getTime() - base.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
      const eventsByWeek = new Map<number, any[]>();
      ((eventRows || []) as any[]).forEach(ev => {
        const w = weekOf(ev.start_datetime);
        if (!eventsByWeek.has(w)) eventsByWeek.set(w, []);
        eventsByWeek.get(w)!.push(ev);
      });
      const linksByEvent = new Map(((links || []) as any[]).map(l => [l.event_id, l]));

      const consumedLinkIds = new Set<string>();
      for (let k = 0; k < missionList.length; k++) {
        const week = activity.startWeek + k;
        const mission = missionList[k];
        const weekEvents = eventsByWeek.get(week) || [];
        const targetEvent = weekEvents.find(ev => linksByEvent.has(ev.id)) || weekEvents[0];
        if (targetEvent) {
          const link = linksByEvent.get(targetEvent.id);
          if (link) {
            consumedLinkIds.add(link.id);
            if (link.syllabus_mission_id !== mission.id) {
              await (supabase as any).from('event_activities').update({ kind: 'lesson', syllabus_mission_id: mission.id, ad_hoc_objectives: null }).eq('id', link.id);
            }
          } else {
            const { data: inserted } = await (supabase as any).from('event_activities').insert({
              event_id: targetEvent.id,
              cycle_id: cycleId,
              cycle_activity_id: activity.id,
              kind: 'lesson',
              syllabus_mission_id: mission.id,
              display_order: 0,
              label: activity.label || null,
              settings: activity.settings || {}
            }).select('id').single();
            if (inserted?.id) consumedLinkIds.add(inserted.id);
          }
          // If this activity is the event's only content, retitle it to the
          // lesson and keep the legacy PTR column in sync
          const { count: linkCount } = await (supabase as any)
            .from('event_activities')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', targetEvent.id);
          if ((linkCount ?? 0) <= 1) {
            await supabase.from('events').update({ name: mission.mission_name, syllabus_mission_id: mission.id } as any).eq('id', targetEvent.id);
          }
        } else {
          await createEventForActivityWeek({ ...activity, endWeek: newEndWeek }, week, mission);
        }
      }

      // Drop leftover links (out-of-span weeks or duplicates)
      const leftoverLinks = ((links || []) as any[]).filter(l => !consumedLinkIds.has(l.id));
      for (const link of leftoverLinks) {
        await (supabase as any).from('event_activities').delete().eq('id', link.id);
      }

      await loadCycleEventItems();
    } catch (err: any) {
      console.error('Failed to reset activity:', err);
      setError(err.message || 'Failed to reset activity');
    }
  };

  // Event Activities: load this cycle's activities when editing
  useEffect(() => {
    if (!activitiesEnabled || !cycleId) return;
    let cancelled = false;
    const load = async () => {
      const { activities, error } = await getCycleActivities(cycleId);
      if (!cancelled && !error) {
        setCycleActivities(activities);
        // Seed the ordered row list from the saved row order first (rows
        // survive having no activities until explicitly deleted), then append
        // any rows only derivable from the activities (legacy cycles, or
        // criteria introduced through the event dialog's reflection)
        const rowsInOrder: PendingParticipantRow[] = [];
        const seen = new Set<string>();
        (initialData?.settings?.participantRows || []).forEach(criteria => {
          const rowKey = criteriaRowKey(criteria);
          if (!seen.has(rowKey)) {
            seen.add(rowKey);
            rowsInOrder.push({ rowKey, criteria });
          }
        });
        activities.forEach(a => {
          const rowKey = criteriaRowKey(a.settings?.participantCriteria);
          if (!seen.has(rowKey)) {
            seen.add(rowKey);
            rowsInOrder.push({ rowKey, criteria: a.settings?.participantCriteria || [] });
          }
        });
        setParticipantRows(rowsInOrder);
      }
    };
    load();
    return () => { cancelled = true; };
    // initialData is deliberately not a dependency: re-running on parent
    // re-renders would refetch and clobber unsaved row edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activitiesEnabled, cycleId]);

  // Event Activities: builder handlers. A participant group (row) is created
  // first; clicking inside its row adds an activity for that group.
  const handleAddParticipantRow = () => {
    const rowKey = criteriaRowKey([]);
    setParticipantRows(prev => (prev.some(r => r.rowKey === rowKey) ? prev : [...prev, { rowKey, criteria: [] }]));
    setBuilderSelection({ type: 'row', rowKey });
  };

  const handleAddActivityInRow = (criteria: EventActivityParticipantBlock[], week: number) => {
    // Make sure the row is tracked in the ordered list (covers derived rows)
    const rowKey = criteriaRowKey(criteria);
    setParticipantRows(prev => (prev.some(r => r.rowKey === rowKey) ? prev : [...prev, { rowKey, criteria }]));
    setCycleActivities(prev => {
      const next: CycleActivity[] = [
        ...prev,
        {
          kind: 'syllabus' as const,
          startWeek: week,
          endWeek: week,
          displayOrder: prev.length,
          settings: { participantCriteria: criteria }
        }
      ];
      setBuilderSelection({ type: 'activity', index: next.length - 1 });
      return next;
    });
  };

  const handleUpdateSelectedActivity = (updates: Partial<CycleActivity>) => {
    if (selectedActivityIndex === null) return;
    setCycleActivities(prev => prev.map((a, i) => (i === selectedActivityIndex ? { ...a, ...updates } : a)));
  };

  // Explicitly delete a participant row: removes the row and any activities
  // still in it (the only way a row leaves the cycle)
  const handleRemoveParticipantRow = (rowKey: string) => {
    const removedIndices = new Set(cycleActivities
      .map((a, i) => (criteriaRowKey(a.settings?.participantCriteria) === rowKey ? i : -1))
      .filter(i => i !== -1));
    setCycleActivities(prev => prev
      .filter((_, i) => !removedIndices.has(i))
      .map((a, i) => ({ ...a, displayOrder: i })));
    setParticipantRows(prev => prev.filter(r => r.rowKey !== rowKey));
    setBuilderSelection(prev => {
      if (prev?.type === 'row' && prev.rowKey === rowKey) return null;
      if (prev?.type === 'activity') {
        if (removedIndices.has(prev.index)) return null;
        const shift = [...removedIndices].filter(i => i < prev.index).length;
        return { type: 'activity', index: prev.index - shift };
      }
      return prev;
    });
  };

  const handleRemoveActivityAt = (index: number) => {
    setCycleActivities(prev => prev
      .filter((_, i) => i !== index)
      .map((a, i) => ({ ...a, displayOrder: i })));
    setBuilderSelection(prev => {
      if (prev?.type === 'activity') {
        if (prev.index === index) return null;
        if (prev.index > index) return { type: 'activity', index: prev.index - 1 };
      }
      return prev;
    });
  };

  // Enrollment for the selected training activity: Students/Instructors tabs;
  // available pilots on the left (click to enroll), enrolled on the right
  // (hover to remove). Both containers lay pilots out in multiple columns.
  type ActivityEnrollmentRowPilot = Pick<EnrolledPilot, 'pilot_id' | 'callsign' | 'board_number' | 'enrollment_id' | 'squadron'>;
  const [enrollmentTab, setEnrollmentTab] = useState<'students' | 'instructors'>('students');
  const [availableView, setAvailableView] = useState<'suggested' | 'all'>('suggested');

  // Training squadrons first, then by squadron designation, then board number
  const sortPilotsForActivity = (list: ActivityEnrollmentRowPilot[]): ActivityEnrollmentRowPilot[] => {
    const metaById = new Map(squadrons.map(s => [s.id, { type: s.squadron_type, designation: s.designation }]));
    return [...list].sort((a, b) => {
      const aMeta = a.squadron ? metaById.get(a.squadron.id) : undefined;
      const bMeta = b.squadron ? metaById.get(b.squadron.id) : undefined;
      const aTraining = aMeta?.type === 'training' ? 0 : 1;
      const bTraining = bMeta?.type === 'training' ? 0 : 1;
      if (aTraining !== bTraining) return aTraining - bTraining;
      const aDesignation = aMeta?.designation || '￿';
      const bDesignation = bMeta?.designation || '￿';
      if (aDesignation !== bDesignation) return aDesignation.localeCompare(bDesignation);
      return (parseInt(a.board_number || '', 10) || 9999) - (parseInt(b.board_number || '', 10) || 9999);
    });
  };

  // Does a pilot satisfy the activity's Participants criteria? Empty/incomplete
  // criteria match everyone; blocks are OR'd, criteria within a block AND'd,
  // and multi-select values within one criterion are OR'd.
  const pilotMatchesParticipantCriteria = (pilot: any, blocks: EventActivityParticipantBlock[] | undefined): boolean => {
    const completedBlocks = (blocks || []).filter(b => b.criteria.some(c => (c.values && c.values.length > 0) || c.value));
    if (completedBlocks.length === 0) return true;
    return completedBlocks.some(block => block.criteria.every(criterion => {
      const values = criterion.values ?? (criterion.value ? [criterion.value] : []);
      if (values.length === 0) return true;
      switch (criterion.type) {
        case 'squadron':
          return !!pilot.squadron?.id && values.includes(pilot.squadron.id);
        case 'standing':
          return !!pilot.currentStanding?.name && values.includes(pilot.currentStanding.name);
        case 'status':
          return !!pilot.currentStatus?.name && values.includes(pilot.currentStatus.name);
        case 'qualification':
          return (pilot.qualifications || []).some((q: any) => q.qualification?.type && values.includes(q.qualification.type));
        default:
          return true;
      }
    }));
  };

  const renderActivityEnrollment = (activity: CycleActivity) => {
    const activityId = activity.id as string;
    const participantCriteria = activity.settings?.participantCriteria;
    const studentsEnrolled = enrolledPilots.filter(p => (p as any).cycle_activity_id === activityId);
    const instructorsEnrolled = enrolledInstructors.filter(i => (i as any).cycle_activity_id === activityId);
    const isStudents = enrollmentTab === 'students';
    const enrolled: ActivityEnrollmentRowPilot[] = sortPilotsForActivity(isStudents ? studentsEnrolled : instructorsEnrolled);
    // Available pilots are filtered by the activity's participant criteria
    const suggested: ActivityEnrollmentRowPilot[] = (isStudents ? suggestedPilots : suggestedInstructors)
      .filter(p => pilotMatchesParticipantCriteria(p, participantCriteria));
    const others: ActivityEnrollmentRowPilot[] = (isStudents ? allPilots : allInstructorCandidates)
      .filter(p => pilotMatchesParticipantCriteria(p, participantCriteria));
    const available = sortPilotsForActivity(availableView === 'suggested' ? suggested : [...suggested, ...others]);
    const onEnroll = (pilotId: string) => (isStudents ? handleEnrollPilot(pilotId, activityId) : handleEnrollInstructor(pilotId, activityId));
    const onRemove = (enrollmentId: string) => (isStudents ? handleRemoveEnrollment(enrollmentId) : handleRemoveInstructor(enrollmentId));

    // Transfer-all: enroll every currently visible available pilot (respects
    // the Suggested/All toggle and criteria filter), or clear the enrolled list
    const handleEnrollAllVisible = async () => {
      if (!cycleId || available.length === 0) return;
      const pilotIds = available.map(p => p.pilot_id);
      try {
        const { data: userData } = await supabase.auth.getUser();
        let userProfileId: string | null = null;
        if (userData.user) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('auth_user_id', userData.user.id)
            .single();
          userProfileId = profile?.id || null;
        }
        if (isStudents) {
          await enrollPilots(cycleId, pilotIds, userProfileId, activityId);
          setEnrolledPilots(await getCycleEnrollments(cycleId));
          const idSet = new Set(pilotIds);
          setSuggestedPilots(prev => prev.filter(p => !idSet.has(p.pilot_id)));
          setAllPilots(prev => prev.filter(p => !idSet.has(p.pilot_id)));
        } else {
          await enrollInstructors(cycleId, pilotIds, userProfileId, activityId);
          setEnrolledInstructors(await getCycleInstructorEnrollments(cycleId));
          const idSet = new Set(pilotIds);
          setSuggestedInstructors(prev => prev.filter(p => !idSet.has(p.pilot_id)));
          setAllInstructorCandidates(prev => prev.filter(p => !idSet.has(p.pilot_id)));
        }
      } catch (err: any) {
        console.error('Error enrolling all pilots:', err);
        setError(err.message || 'Failed to enroll pilots');
        await (isStudents ? loadEnrollmentData() : loadInstructorData());
      }
    };

    const handleRemoveAllEnrolled = async () => {
      if (enrolled.length === 0) return;
      try {
        const { data: userData } = await supabase.auth.getUser();
        let userProfileId: string | null = null;
        if (userData.user) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('auth_user_id', userData.user.id)
            .single();
          userProfileId = profile?.id || null;
        }
        for (const pilot of enrolled) {
          if (!pilot.enrollment_id) continue;
          if (isStudents) {
            await removeEnrollment(pilot.enrollment_id);
          } else {
            await removeInstructor(pilot.enrollment_id, userProfileId);
          }
        }
        // Full reload so removed pilots return to the available pools
        await (isStudents ? loadEnrollmentData() : loadInstructorData());
      } catch (err: any) {
        console.error('Error removing all enrolled pilots:', err);
        setError(err.message || 'Failed to remove pilots');
        await (isStudents ? loadEnrollmentData() : loadInstructorData());
      }
    };

    const renderRow = (pilot: ActivityEnrollmentRowPilot, action: 'remove' | 'enroll') => {
      const hoverKey = `${enrollmentTab}:${action}:${pilot.pilot_id}`;
      const isHovered = hoveredPilotId === hoverKey;
      return (
        <div
          key={pilot.pilot_id}
          onClick={action === 'enroll' ? () => onEnroll(pilot.pilot_id) : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '26px',
            cursor: 'pointer',
            backgroundColor: isHovered ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
            transition: 'background-color 0.2s ease',
            borderRadius: '6px',
            padding: '2px 6px 2px 24px',
            gap: '10px',
            minWidth: 0,
            boxSizing: 'border-box'
          }}
          onMouseEnter={() => setHoveredPilotId(hoverKey)}
          onMouseLeave={() => setHoveredPilotId(null)}
        >
          <div style={{ marginLeft: '-20px', flexShrink: 0 }}>
            <PilotIDBadgeSm
              squadronTailCode={pilot.squadron?.tail_code}
              boardNumber={pilot.board_number ?? undefined}
              squadronInsigniaUrl={pilot.squadron?.insignia_url ?? undefined}
            />
          </div>
          <span style={{
            fontSize: '14px',
            fontWeight: 700,
            color: pilot.squadron?.primary_color || '#374151',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
            flex: 1
          }}>
            {pilot.callsign}
          </span>
          {action === 'remove' && isHovered && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (pilot.enrollment_id) onRemove(pilot.enrollment_id); }}
              style={{
                padding: '2px',
                backgroundColor: 'transparent',
                color: '#DC2626',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0
              }}
              title="Remove"
            >
              <X size={14} />
            </button>
          )}
        </div>
      );
    };

    const pilotGrid = (pilots: ActivityEnrollmentRowPilot[], action: 'remove' | 'enroll') => (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '2px 16px' }}>
        {pilots.map(pilot => renderRow(pilot, action))}
      </div>
    );

    const containerStyle: React.CSSProperties = {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      border: '1px solid #E5E7EB',
      borderRadius: '6px',
      padding: '10px 12px',
      overflowY: 'auto',
      boxSizing: 'border-box'
    };

    return (
      <div style={{ marginTop: '16px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Students / Instructors tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', marginBottom: '12px', flexShrink: 0 }}>
          {(['students', 'instructors'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setEnrollmentTab(tab)}
              style={{
                padding: '8px 16px',
                border: 'none',
                backgroundColor: 'transparent',
                color: enrollmentTab === tab ? '#2563EB' : '#64748B',
                fontWeight: enrollmentTab === tab ? 600 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                borderBottom: enrollmentTab === tab ? '2px solid #2563EB' : '2px solid transparent',
                fontFamily: 'Inter'
              }}
            >
              {tab === 'students' ? `Students (${studentsEnrolled.length})` : `Instructors (${instructorsEnrolled.length})`}
            </button>
          ))}
        </div>

        {/* Available (left) | Enrolled (right) - both fill the remaining pane
            height and scroll internally */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch', flex: 1, minHeight: 0 }}>
          <div style={containerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 600, color: '#374151', margin: 0, textTransform: 'uppercase', fontFamily: 'Inter' }}>
                Available
              </h3>
              {/* Suggested / All toggle */}
              <div style={{ display: 'flex', border: '1px solid #E2E8F0', borderRadius: '6px', overflow: 'hidden' }}>
                {(['suggested', 'all'] as const).map(view => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setAvailableView(view)}
                    style={{
                      padding: '3px 10px',
                      border: 'none',
                      backgroundColor: availableView === view ? '#EFF6FF' : '#FFFFFF',
                      color: availableView === view ? '#2563EB' : '#64748B',
                      fontWeight: availableView === view ? 600 : 500,
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontFamily: 'Inter'
                    }}
                  >
                    {view === 'suggested'
                      ? (isStudents ? 'Suggested Students' : 'Suggested Instructors')
                      : 'All Pilots'}
                  </button>
                ))}
              </div>
            </div>
            {available.length > 0 ? (
              pilotGrid(available, 'enroll')
            ) : (
              <div style={{ padding: '12px', color: '#94A3B8', fontSize: '12px', fontStyle: 'italic', fontFamily: 'Inter' }}>
                {availableView === 'suggested'
                  ? 'No available pilots match the auto-enrollment rules. Try All Pilots.'
                  : 'Everyone is already enrolled.'}
              </div>
            )}
          </div>

          {/* Transfer-all controls */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={handleEnrollAllVisible}
              disabled={available.length === 0}
              title={`Enroll all ${available.length} shown`}
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: available.length === 0 ? '#D1D5DB' : '#2563EB',
                borderRadius: '6px',
                cursor: available.length === 0 ? 'default' : 'pointer'
              }}
            >
              <ChevronsRight size={16} />
            </button>
            <button
              type="button"
              onClick={handleRemoveAllEnrolled}
              disabled={enrolled.length === 0}
              title="Remove all enrolled"
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: enrolled.length === 0 ? '#D1D5DB' : '#64748B',
                borderRadius: '6px',
                cursor: enrolled.length === 0 ? 'default' : 'pointer'
              }}
            >
              <ChevronsLeft size={16} />
            </button>
          </div>

          <div style={containerStyle}>
            <h3 style={{ fontSize: '12px', fontWeight: 600, color: '#374151', margin: '0 0 8px 0', textTransform: 'uppercase', fontFamily: 'Inter' }}>
              Enrolled ({enrolled.length})
            </h3>
            {enrolled.length === 0 ? (
              <div style={{ padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '6px', color: '#6B7280', fontSize: '12px', textAlign: 'center', fontFamily: 'Inter' }}>
                No {enrollmentTab} enrolled yet — click a pilot on the left
              </div>
            ) : (
              pilotGrid(enrolled, 'remove')
            )}
          </div>
        </div>
      </div>
    );
  };

  // Selected participant row: its criteria come from the ordered row list, or
  // any activity in the row (derived fallback)
  const selectedRowCriteria = builderSelection?.type === 'row'
    ? (participantRows.find(r => r.rowKey === builderSelection.rowKey)?.criteria
      ?? cycleActivities.find(a => criteriaRowKey(a.settings?.participantCriteria) === builderSelection.rowKey)?.settings?.participantCriteria
      ?? [])
    : [];

  const handleUpdateRowCriteria = (blocks: any) => {
    if (builderSelection?.type !== 'row') return;
    const oldKey = builderSelection.rowKey;
    const newKey = criteriaRowKey(blocks);
    setCycleActivities(prev => prev.map(a =>
      criteriaRowKey(a.settings?.participantCriteria) === oldKey
        ? { ...a, settings: { ...(a.settings || {}), participantCriteria: blocks } }
        : a
    ));
    setParticipantRows(prev => {
      const updated = prev.map(r => (r.rowKey === oldKey ? { rowKey: newKey, criteria: blocks } : r));
      // If two rows end up with identical criteria they merge - keep the first
      const seen = new Set<string>();
      return updated.filter(r => (seen.has(r.rowKey) ? false : (seen.add(r.rowKey), true)));
    });
    setBuilderSelection({ type: 'row', rowKey: newKey });
  };

  // Saved syllabus-kind activities that enrollment can be scoped to
  const scopableActivities = cycleActivities.filter(a => a.id && a.kind === 'syllabus');

  const activityNameById = (activityId: string): string => {
    const activity = cycleActivities.find(a => a.id === activityId);
    if (!activity) return 'Activity';
    return activity.label || (activity.syllabusId ? syllabusNames[activity.syllabusId] : undefined) || 'Activity';
  };

  // Enrollment tabs: pick which activity new enrollments attach to, and filter
  // the lists to it. Only meaningful once the cycle (and its activities) exist.
  const renderActivityScopeSelector = () => {
    if (!activitiesEnabled || !cycleId || scopableActivities.length === 0) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <label style={{ fontSize: '13px', fontWeight: 500, color: '#64748B', flexShrink: 0 }}>
          Activity
        </label>
        <select
          value={enrollmentActivityScopeId}
          onChange={(e) => setEnrollmentActivityScopeId(e.target.value)}
          style={{
            flex: 1,
            padding: '6px 8px',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            fontSize: '13px',
            backgroundColor: 'white'
          }}
        >
          <option value="">Entire cycle</option>
          {scopableActivities.map(activity => (
            <option key={activity.id} value={activity.id}>
              {activityNameById(activity.id as string)} (Weeks {activity.startWeek}–{activity.endWeek})
            </option>
          ))}
        </select>
      </div>
    );
  };

  const matchesEnrollmentScope = (cycleActivityId?: string | null) =>
    !enrollmentActivityScopeId || cycleActivityId === enrollmentActivityScopeId;

  // Load syllabi when component mounts if type is Training
  useEffect(() => {
    if (type === 'Training') {
      const loadSyllabi = async () => {
        const [{ data, error }, missionsResult] = await Promise.all([
          (supabase as any)
            .from('training_syllabi')
            .select('id, name, description, kind')
            .order('name'),
          // Ordered lesson names per syllabus - lets the builder preview an
          // unsaved syllabus activity's per-week lesson cells before the save
          // creates the real events
          (supabase as any)
            .from('training_syllabus_missions')
            .select('syllabus_id, mission_name, week_number')
            .order('week_number')
        ]);

        if (!error && data) {
          // Only linear syllabi drive a cycle's weekly progression; other kinds
          // are attached as cycle/event activities instead
          setSyllabi(data.filter((s: any) => (s.kind || 'linear') === 'linear'));
          const names: Record<string, string> = {};
          data.forEach((s: any) => { names[s.id] = s.name; });
          setSyllabusNames(names);
        }
        if (missionsResult.data) {
          const bySyllabus: Record<string, string[]> = {};
          (missionsResult.data as any[]).forEach(m => {
            if (!bySyllabus[m.syllabus_id]) bySyllabus[m.syllabus_id] = [];
            bySyllabus[m.syllabus_id].push(m.mission_name);
          });
          setSyllabusMissionNames(bySyllabus);
        }
      };
      loadSyllabi();
    }
  }, [type]);

  // Auto-update week count when syllabus is selected
  useEffect(() => {
    if (selectedSyllabusId && lastChanged.current === 'syllabus') {
      const loadMissionCount = async () => {
        const { data, error } = await supabase
          .from('training_syllabus_missions')
          .select('week_number')
          .eq('syllabus_id', selectedSyllabusId)
          .order('week_number', { ascending: false })
          .limit(1) as any;

        if (!error && data && data.length > 0) {
          // Get highest week number and add 1 for Week 0
          const highestWeek = data[0].week_number;
          const totalWeeks = highestWeek + 1; // +1 for Week 0 (no mission week)
          setWeekCount(totalWeeks);
          lastChanged.current = 'weeks'; // Trigger end date recalculation
        }
      };
      loadMissionCount();
    }
  }, [selectedSyllabusId]);

  // Load all enrollment data when dialog opens for Training cycles
  useEffect(() => {
    if (type === 'Training' && (cycleId || selectedSyllabusId)) {
      loadEnrollmentData();
      loadInstructorData();
    } else {
      // For non-Training cycles or cycles without syllabus, mark as complete immediately
      setInitialEnrollmentLoadComplete(true);
    }
  }, [cycleId, type, selectedSyllabusId]);

  const loadEnrollmentData = async () => {
    setLoadingEnrollments(true);
    setEnrollmentError(null);

    try {
      let enrolled: EnrolledPilot[] = [];
      let enrolledIds: Set<string>;

      // Load currently enrolled pilots (only if editing existing cycle)
      if (cycleId) {
        enrolled = await getCycleEnrollments(cycleId);
        setEnrolledPilots(enrolled);
        enrolledIds = new Set(enrolled.map(p => p.pilot_id));
      } else {
        // For new cycles, use staged enrollment IDs
        // Don't clear enrolledPilots here - they're already set from handleEnrollPilot calls
        enrolledIds = new Set(stagedEnrollmentIds);
      }

      // Load suggested pilots based on syllabus rules (only if syllabus is
      // selected). Block-aware evaluator - the legacy getSuggestedEnrollments
      // only understands the old flat rule format and returns nothing for
      // block-format rules.
      let suggested: EnrolledPilot[] = [];
      if (selectedSyllabusId) {
        suggested = await getSuggestedStudentEnrollments(selectedSyllabusId);
        // Filter out already enrolled/staged pilots
        const filteredSuggestions = suggested.filter(p => !enrolledIds.has(p.pilot_id));
        setSuggestedPilots(filteredSuggestions);
      } else {
        setSuggestedPilots([]);
      }

      // Load all pilots for the "Add Pilot" section
      const { data: allActivePilots, error: pilotsError } = await supabase
        .from('pilots')
        .select('id, callsign, boardNumber')
        .order('callsign');

      if (pilotsError) throw pilotsError;

      const allPilotIds = (allActivePilots || []).map((p: any) => p.id);

      // Load all pilot data in parallel (same as getCycleEnrollments)
      const [assignmentsData, statusesData, standingsData, rolesData, qualificationsDataMap] = await Promise.all([
        supabase.from('pilot_assignments').select('pilot_id, org_squadrons(id, tail_code, insignia_url, color_palette)').in('pilot_id', allPilotIds).is('end_date', null),
        supabase.from('pilot_statuses').select('pilot_id, statuses(id, name, isActive)').in('pilot_id', allPilotIds).is('end_date', null),
        supabase.from('pilot_standings').select('pilot_id, standings(id, name)').in('pilot_id', allPilotIds).is('end_date', null),
        supabase.from('pilot_roles').select('pilot_id, roles(id, name, exclusivity_scope)').in('pilot_id', allPilotIds).is('end_date', null),
        getBatchPilotQualifications(allPilotIds)
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

      // Convert qualificationsDataMap to the format expected by EnrolledPilot
      // getBatchPilotQualifications returns Record<pilot_id, array of pilot_qualifications>
      // We need to convert to Map with correct structure
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

      // Filter out enrolled and suggested pilots
      const suggestedIds = new Set(suggested.map(p => p.pilot_id));
      const allFiltered = (allActivePilots || [])
        .filter((p: any) => !enrolledIds.has(p.id) && !suggestedIds.has(p.id))
        .map((p: any) => {
          const status = statusMap.get(p.id);
          return {
            pilot_id: p.id,
            board_number: p.boardNumber,
            callsign: p.callsign,
            squadron: squadronMap.get(p.id) || null,
            enrollment_id: '',
            status: 'active' as const,
            enrolled_at: new Date().toISOString(),
            currentStatus: status || null,
            currentStanding: standingMap.get(p.id) || null,
            roles: rolesMap.get(p.id) || [],
            qualifications: qualificationsMap.get(p.id) || [],
            isActive: status?.isActive ?? false
          };
        });

      setAllPilots(allFiltered);
    } catch (err: any) {
      console.error('Error loading enrollment data:', err);
      setEnrollmentError(err.message || 'Failed to load enrollment data');
    } finally {
      setLoadingEnrollments(false);
      setInitialEnrollmentLoadComplete(true);
    }
  };

  const handleEnrollPilot = async (pilotId: string, activityId?: string | null) => {
    try {
      // Find the pilot in suggested list or all pilots list
      const pilotToEnroll = suggestedPilots.find(p => p.pilot_id === pilotId) || allPilots.find(p => p.pilot_id === pilotId);
      if (!pilotToEnroll) return;

      // Optimistically update UI - move from suggested/all to enrolled
      setSuggestedPilots(prev => prev.filter(p => p.pilot_id !== pilotId));
      setAllPilots(prev => prev.filter(p => p.pilot_id !== pilotId));

      if (!cycleId) {
        // For new cycles, add to staged enrollments
        setStagedEnrollmentIds(prev => [...prev, pilotId]);
        setEnrolledPilots(prev => [...prev, { ...pilotToEnroll, enrollment_id: 'staged-' + pilotId }]);
      } else {
        // For existing cycles, enroll immediately in database
        setEnrolledPilots(prev => [...prev, { ...pilotToEnroll, enrollment_id: 'temp-' + pilotId }]);

        // Get the user profile ID (not auth ID)
        const { data: userData } = await supabase.auth.getUser();
        let userProfileId = null;

        if (userData.user) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('auth_user_id', userData.user.id)
            .single();

          userProfileId = profile?.id || null;
        }

        // Actually enroll in database (scoped to an activity when one is given)
        await enrollPilots(cycleId, [pilotId], userProfileId, activityId !== undefined ? activityId : (enrollmentActivityScopeId || null));

        // Refresh to get the real enrollment_id from database
        const enrolled = await getCycleEnrollments(cycleId);
        setEnrolledPilots(enrolled);
      }
    } catch (err: any) {
      console.error('Error enrolling pilot:', err);
      setEnrollmentError(err.message || 'Failed to enroll pilot');
      // Revert optimistic update on error
      await loadEnrollmentData();
    }
  };

  const handleRemoveEnrollment = async (enrollmentId: string) => {
    try {
      // Find the pilot being removed
      const pilotToRemove = enrolledPilots.find(p => p.enrollment_id === enrollmentId);
      if (!pilotToRemove) return;

      // Optimistically update UI - move from enrolled to suggested
      setEnrolledPilots(prev => prev.filter(p => p.enrollment_id !== enrollmentId));
      setSuggestedPilots(prev => [...prev, { ...pilotToRemove, enrollment_id: '' }]);

      // Check if this is a staged enrollment (starts with 'staged-') or a real one
      if (enrollmentId.startsWith('staged-')) {
        // For staged enrollments, just remove from staged list
        const pilotId = enrollmentId.replace('staged-', '');
        setStagedEnrollmentIds(prev => prev.filter(id => id !== pilotId));
      } else {
        // For real enrollments, remove from database
        await removeEnrollment(enrollmentId);
      }
    } catch (err: any) {
      console.error('Error removing enrollment:', err);
      setEnrollmentError(err.message || 'Failed to remove enrollment');
      // Revert optimistic update on error
      await loadEnrollmentData();
    }
  };

  // ============================================================================
  // Instructor Enrollment Functions
  // ============================================================================

  const loadInstructorData = async () => {
    setLoadingInstructors(true);
    setInstructorError(null);

    try {
      let enrolled: EnrolledInstructor[] = [];
      let enrolledIds: Set<string>;

      // Load currently enrolled instructors (only if editing existing cycle)
      if (cycleId) {
        enrolled = await getCycleInstructorEnrollments(cycleId);
        setEnrolledInstructors(enrolled);
        enrolledIds = new Set(enrolled.map(p => p.pilot_id));
      } else {
        // For new cycles, use staged instructor IDs
        enrolledIds = new Set(stagedInstructorIds);
      }

      // Load suggested instructors based on syllabus rules (only if syllabus is selected)
      let suggested: EnrolledInstructor[] = [];
      if (selectedSyllabusId) {
        suggested = await getSuggestedInstructors(selectedSyllabusId);
        // Filter out already enrolled/staged instructors
        const filteredSuggestions = suggested.filter(p => !enrolledIds.has(p.pilot_id));
        setSuggestedInstructors(filteredSuggestions);
      } else {
        setSuggestedInstructors([]);
      }

      // Build all instructor candidates list (exclude already enrolled and suggested)
      const suggestedIds = new Set(suggested.map(p => p.pilot_id));
      
      // Use allPilots as base for candidates (they already have full pilot data loaded)
      // This will be populated after loadEnrollmentData runs
      const allCandidates = allPilots
        .filter(p => !enrolledIds.has(p.pilot_id) && !suggestedIds.has(p.pilot_id))
        .map(p => ({ ...p, status: 'active' as const }));

      setAllInstructorCandidates(allCandidates);
    } catch (err: any) {
      console.error('Error loading instructor data:', err);
      setInstructorError(err.message || 'Failed to load instructor data');
    } finally {
      setLoadingInstructors(false);
    }
  };

  const handleEnrollInstructor = async (pilotId: string, activityId?: string | null) => {
    try {
      // Find the pilot in suggested list or all candidates list
      const instructorToEnroll = suggestedInstructors.find(p => p.pilot_id === pilotId) 
        || allInstructorCandidates.find(p => p.pilot_id === pilotId)
        || allPilots.find(p => p.pilot_id === pilotId);
      if (!instructorToEnroll) return;

      // Optimistically update UI - move from suggested/all to enrolled
      setSuggestedInstructors(prev => prev.filter(p => p.pilot_id !== pilotId));
      setAllInstructorCandidates(prev => prev.filter(p => p.pilot_id !== pilotId));

      if (!cycleId) {
        // For new cycles, add to staged instructor enrollments
        setStagedInstructorIds(prev => [...prev, pilotId]);
        setEnrolledInstructors(prev => [...prev, { ...instructorToEnroll, enrollment_id: 'staged-' + pilotId, status: 'active' as const }]);
      } else {
        // For existing cycles, enroll immediately in database
        setEnrolledInstructors(prev => [...prev, { ...instructorToEnroll, enrollment_id: 'temp-' + pilotId, status: 'active' as const }]);

        // Get the user profile ID
        const { data: userData } = await supabase.auth.getUser();
        let userProfileId = null;

        if (userData.user) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('auth_user_id', userData.user.id)
            .single();

          userProfileId = profile?.id || null;
        }

        // Actually enroll in database (scoped to an activity when one is given)
        await enrollInstructors(cycleId, [pilotId], userProfileId, activityId !== undefined ? activityId : (enrollmentActivityScopeId || null));

        // Refresh to get the real enrollment_id from database
        const enrolled = await getCycleInstructorEnrollments(cycleId);
        setEnrolledInstructors(enrolled);
      }
    } catch (err: any) {
      console.error('Error enrolling instructor:', err);
      setInstructorError(err.message || 'Failed to enroll instructor');
      // Revert optimistic update on error
      await loadInstructorData();
    }
  };

  const handleRemoveInstructor = async (enrollmentId: string) => {
    try {
      // Find the instructor being removed
      const instructorToRemove = enrolledInstructors.find(p => p.enrollment_id === enrollmentId);
      if (!instructorToRemove) return;

      // Optimistically update UI - move from enrolled to suggested
      setEnrolledInstructors(prev => prev.filter(p => p.enrollment_id !== enrollmentId));
      setSuggestedInstructors(prev => [...prev, { ...instructorToRemove, enrollment_id: '' }]);

      // Check if this is a staged enrollment (starts with 'staged-') or a real one
      if (enrollmentId.startsWith('staged-')) {
        // For staged enrollments, just remove from staged list
        const pilotId = enrollmentId.replace('staged-', '');
        setStagedInstructorIds(prev => prev.filter(id => id !== pilotId));
      } else {
        // For real enrollments, remove from database
        // Get the user profile ID
        const { data: userData } = await supabase.auth.getUser();
        let userProfileId = null;

        if (userData.user) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('auth_user_id', userData.user.id)
            .single();

          userProfileId = profile?.id || null;
        }

        await removeInstructor(enrollmentId, userProfileId);
      }
    } catch (err: any) {
      console.error('Error removing instructor:', err);
      setInstructorError(err.message || 'Failed to remove instructor');
      // Revert optimistic update on error
      await loadInstructorData();
    }
  };

  // Sort instructors helper function
  const sortInstructors = (instructors: EnrolledInstructor[]): EnrolledInstructor[] => {
    return [...instructors].sort((a, b) => {
      // First sort by squadron ID if enabled
      if (instructorSortBySquadron) {
        const squadronA = a.squadron?.id || '';
        const squadronB = b.squadron?.id || '';
        const squadronCompare = squadronA.localeCompare(squadronB);
        if (squadronCompare !== 0) return squadronCompare;
      }

      // Then sort by board number or callsign
      if (instructorSortBy === 'boardNumber') {
        const numA = parseInt(a.board_number || '0') || 0;
        const numB = parseInt(b.board_number || '0') || 0;
        return numA - numB;
      } else {
        return a.callsign.localeCompare(b.callsign);
      }
    });
  };

  // Initialize week count when component loads with initial data
  useEffect(() => {
    if (initialData?.startDate && initialData?.endDate) {
      const start = new Date(initialData.startDate);
      const end = new Date(initialData.endDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        // Calculate weeks between the two dates
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const calculatedWeeks = Math.ceil(diffDays / 7);
        setWeekCount(calculatedWeeks > 0 ? calculatedWeeks : 1);
      }
    }
  }, [initialData]);
  
  // Calculate weeks when end date is changed by user
  useEffect(() => {
    if (lastChanged.current === 'endDate' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        // Calculate weeks between the two dates
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const calculatedWeeks = Math.ceil(diffDays / 7);
        setWeekCount(calculatedWeeks > 0 ? calculatedWeeks : 1);
      }
    }
  }, [startDate, endDate]);
  
  // Update end date when week count or start date changes
  useEffect(() => {
    if (lastChanged.current === 'weeks' && startDate && weekCount > 0) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        // Calculate end date as exactly X weeks from start date (on the same day of week)
        const end = new Date(start);
        // Add exactly X weeks (to end on the same day of week)
        end.setDate(start.getDate() + (weekCount * 7) - 0); // Remove the -1 to get correct date
        
        // Format the date as YYYY-MM-DD
        const formattedEndDate = end.toISOString().split('T')[0];
        setEndDate(formattedEndDate);
      }
    }
  }, [startDate, weekCount]);

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStartDate(e.target.value);
    // When start date changes, recalculate end date based on weeks
    lastChanged.current = 'weeks';
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndDate(e.target.value);
    // When end date changes directly, it should take precedence 
    lastChanged.current = 'endDate';
  };

  const handleWeekCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      setWeekCount(value);
      // When week count changes, it should take precedence
      lastChanged.current = 'weeks';
    }
  };

  const handleWeekIncrement = () => {
    if (weekCount < 52) {
      setWeekCount(weekCount + 1);
      lastChanged.current = 'weeks';
    }
  };

  const handleWeekDecrement = () => {
    if (weekCount > 1) {
      setWeekCount(weekCount - 1);
      lastChanged.current = 'weeks';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Guard against a double-click/double-submit firing onSave twice before
    // the parent's isSaving state re-renders the button as disabled
    if (isSaving) return;

    if (!name.trim()) {
      setError('Please enter a cycle name');
      return;
    }

    if (!startDate) {
      setError('Please select a start date');
      return;
    }

    if (!endDate) {
      setError('Please select an end date');
      return;
    }

    // Check that end date is after start date
    if (new Date(endDate) <= new Date(startDate)) {
      setError('End date must be after start date');
      return;
    }

    // With the Activities flag on, cycles.syllabus_id dual-writes from the
    // first linear-syllabus activity so PTR / enrollment suggestions / legacy
    // event prefill keep working unchanged
    const linearSyllabusIds = new Set(syllabi.map(s => s.id));
    const derivedSyllabusId = activitiesEnabled
      ? cycleActivities.find(a => a.kind === 'syllabus' && a.syllabusId && linearSyllabusIds.has(a.syllabusId))?.syllabusId
      : undefined;

    // Flag-on: cycles.participants (Discord routing) derives from the
    // activities' participant criteria - squadron selections contribute their
    // squadrons, a completed group with no squadron selection implies all
    // squadrons, and no criteria anywhere keeps the existing selection
    const deriveCycleParticipants = (): string[] | undefined => {
      let anyCriteria = false;
      let matchesAllSquadrons = false;
      const squadronIds = new Set<string>();
      cycleActivities.forEach(activity => {
        (activity.settings?.participantCriteria || []).forEach(block => {
          const completed = block.criteria.filter(c => (c.values && c.values.length > 0) || c.value);
          if (completed.length === 0) return;
          anyCriteria = true;
          const squadronRules = completed.filter(c => c.type === 'squadron');
          if (squadronRules.length === 0) {
            matchesAllSquadrons = true;
          } else {
            squadronRules.forEach(rule => {
              (rule.values ?? (rule.value ? [rule.value] : [])).forEach(id => squadronIds.add(id));
            });
          }
        });
      });
      if (!anyCriteria) return undefined;
      if (matchesAllSquadrons) return squadrons.map(s => s.id);
      return Array.from(squadronIds);
    };

    onSave({
      name: name.trim(),
      description: description.trim(),
      startDate,
      endDate,
      type,
      participants: activitiesEnabled
        ? (deriveCycleParticipants() ?? (participants.length > 0 ? participants : undefined))
        : (participants.length > 0 ? participants : undefined),
      syllabusId: type === 'Training'
        ? (activitiesEnabled ? (derivedSyllabusId || selectedSyllabusId || undefined) : (selectedSyllabusId || undefined))
        : undefined,
      // Flag-on, weekly events are always generated from the activities; the
      // legacy opt-in toggle only applies flag-off
      autoCreateEvents: !activitiesEnabled && !hasEvents && autoCreateEvents,
      stagedEnrollmentIds: stagedEnrollmentIds.length > 0 ? stagedEnrollmentIds : undefined,
      stagedInstructorIds: stagedInstructorIds.length > 0 ? stagedInstructorIds : undefined,
      // Developer-flagged: cycle-level event defaults + blocked-out activities.
      // Incomplete activities (no syllabus picked yet) are not persisted - the
      // DB CHECK requires a syllabus_id for syllabus-kind rows.
      ...(activitiesEnabled
        ? {
            // Persist the builder's row order so participant rows survive
            // having no activities (only explicit deletion removes a row)
            settings: { ...cycleSettings, participantRows: participantRows.map(r => r.criteria) },
            cycleActivities: cycleActivities.filter(a => a.kind === 'objectives' || a.syllabusId)
          }
        : {})
    });
  };

  const cycleTypes: CycleType[] = ['Training', 'Cruise-WorkUp', 'Cruise-Mission', 'Other'];

  return (
    <>
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000
        }}
        onClick={onCancel}
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        // The gantt builder is a horizontal element - go near-fullscreen when
        // the Activities flag is on (left settings pane + wide calendar)
        width: activitiesEnabled ? 'min(96vw, 1800px)' : '663px',
        backgroundColor: '#FFFFFF',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        borderRadius: '8px',
        zIndex: 1001
      }}>
        {/* Show loading state until enrollment data is loaded */}
        {!initialEnrollmentLoadComplete ? (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: '#6B7280', marginBottom: '16px' }}>
              Loading cycle data...
            </div>
            <div style={{
              width: '32px',
              height: '32px',
              border: '3px solid #E5E7EB',
              borderTop: '3px solid #2563EB',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto'
            }} />
          </div>
        ) : (
          <>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid #E2E8F0'
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: '#0F172A'
          }}>
            {initialData ? `Edit ${type} Cycle` : `Create New ${type} Cycle`}
          </h2>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} color="#64748B" />
          </button>
        </div>

        {/* Tabs - only show for editing Training cycles with a syllabus */}
        {showTabs && !activitiesEnabled && (
          <div style={{
            display: 'flex',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC'
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              style={{
                flex: 1,
                padding: '12px 16px',
                border: 'none',
                backgroundColor: 'transparent',
                color: activeTab === 'details' ? '#2563EB' : '#64748B',
                fontWeight: activeTab === 'details' ? 600 : 500,
                fontSize: '14px',
                cursor: 'pointer',
                borderBottom: activeTab === 'details' ? '2px solid #2563EB' : 'none',
                transition: 'all 0.2s'
              }}
            >
              Training Cycle Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('enrollments')}
              style={{
                flex: 1,
                padding: '12px 16px',
                border: 'none',
                backgroundColor: 'transparent',
                color: activeTab === 'enrollments' ? '#2563EB' : '#64748B',
                fontWeight: activeTab === 'enrollments' ? 600 : 500,
                fontSize: '14px',
                cursor: 'pointer',
                borderBottom: activeTab === 'enrollments' ? '2px solid #2563EB' : 'none',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Users size={16} />
              Students ({cycleId ? enrolledPilots.length : stagedEnrollmentIds.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('instructors')}
              style={{
                flex: 1,
                padding: '12px 16px',
                border: 'none',
                backgroundColor: 'transparent',
                color: activeTab === 'instructors' ? '#2563EB' : '#64748B',
                fontWeight: activeTab === 'instructors' ? 600 : 500,
                fontSize: '14px',
                cursor: 'pointer',
                borderBottom: activeTab === 'instructors' ? '2px solid #2563EB' : 'none',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <UserCheck size={16} />
              Instructors ({cycleId ? enrolledInstructors.length : stagedInstructorIds.length})
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Flag-on: two panes - settings column (Details/Options/Reminders/
              Publication stacked) on the left, activities calendar on the right */}
          <div style={activitiesEnabled ? { display: 'flex', alignItems: 'stretch', height: 'min(940px, calc(94vh - 130px))' } : undefined}>
          <div style={activitiesEnabled ? { width: '500px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #E2E8F0' } : { display: 'contents' }}>
          {/* Left-pane step tabs (flag-on): one settings section at a time,
              the activities calendar stays on the right */}
          {activitiesEnabled && (
            <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', flexShrink: 0 }}>
              {([
                { key: 'details', title: 'Details' },
                { key: 'options', title: 'Options' },
                { key: 'reminders', title: 'Reminders' },
                { key: 'publication', title: 'Publication' }
              ] as Array<{ key: typeof activeTab; title: string }>).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    flex: 1,
                    padding: '10px 4px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: activeTab === tab.key ? '#2563EB' : '#64748B',
                    fontWeight: activeTab === tab.key ? 600 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    borderBottom: activeTab === tab.key ? '2px solid #2563EB' : '2px solid transparent',
                    transition: 'all 0.2s'
                  }}
                >
                  {tab.title}
                </button>
              ))}
            </div>
          )}
          {/* Details Content */}
          {activeTab === 'details' && (
          <div style={activitiesEnabled ? { padding: '16px', overflowY: 'auto', flex: 1 } : { padding: '24px', height: '900px', overflowY: 'auto' }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Cycle Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px', // Changed from 4px 12px to 8px
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px', // Set fixed height
                  lineHeight: '19px' // Adjusted line height for new padding
                }}
                placeholder="Enter cycle name (e.g. Training Cycle 25-1)"
              />
            </div>

            <div style={{ marginBottom: '16px', display: 'flex', gap: '16px' }}>
              <div style={{ flex: '1' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Cycle Type
                </label>
                <select
                  value={type}
                  onChange={(e) => {
                    const newType = e.target.value as CycleType;
                    // Warn if changing away from Training when enrollments exist
                    if (type === 'Training' && newType !== 'Training' && enrolledPilots.length > 0) {
                      if (!window.confirm(`This training cycle has ${enrolledPilots.length} enrolled student(s). Changing the cycle type will prevent managing enrollments. Are you sure?`)) {
                        return;
                      }
                    }
                    setType(newType);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    height: '35px',
                    lineHeight: '19px',
                    appearance: 'menulist'
                  }}
                >
                  {cycleTypes.map(cycleType => (
                    <option
                      key={cycleType}
                      value={cycleType}
                      style={{
                        padding: '8px',
                        whiteSpace: 'normal'
                      }}
                    >
                      {cycleType.replace('-', ' - ')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Training Syllabus Selector - only show for Training type.
                  With the Activities flag on, syllabi are attached as cycle
                  activities and cycles.syllabus_id is derived on save. */}
              {!activitiesEnabled && type === 'Training' && (
                <div style={{ flex: '1' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#64748B'
                  }}>
                    Training Syllabus (Optional)
                  </label>
                  <select
                    value={selectedSyllabusId}
                    onChange={(e) => {
                      setSelectedSyllabusId(e.target.value);
                      lastChanged.current = 'syllabus';
                    }}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #CBD5E1',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      height: '35px',
                      lineHeight: '19px',
                      appearance: 'menulist'
                    }}
                  >
                    <option value="">No syllabus</option>
                    {syllabi.map(syllabus => (
                      <option key={syllabus.id} value={syllabus.id}>
                        {syllabus.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>


            {/* Auto-create Events Toggle - flag-off only (flag-on always
                generates weekly events from the activities) */}
            {!activitiesEnabled && !hasEvents && type === 'Training' && selectedSyllabusId && (
              <div style={{
                marginBottom: '16px',
                padding: '12px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#0F172A',
                      marginBottom: '4px'
                    }}>
                      Automatically Create Events
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: '#64748B'
                    }}>
                      Create weekly training events for each mission in the selected syllabus
                    </div>
                  </div>
                  <div
                    onClick={() => setAutoCreateEvents(!autoCreateEvents)}
                    style={{
                      width: '44px',
                      height: '24px',
                      backgroundColor: autoCreateEvents ? '#3B82F6' : '#E5E7EB',
                      borderRadius: '12px',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease',
                      flexShrink: 0
                    }}
                  >
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        position: 'absolute',
                        top: '2px',
                        left: autoCreateEvents ? '22px' : '2px',
                        transition: 'left 0.2s ease',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: '16px', display: 'flex', gap: '16px' }}>
              <div style={{ flex: '1' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={handleStartDateChange}
                  style={{
                    width: '100%',
                    padding: '8px', // Changed to 8px uniform padding
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    height: '35px', // Set fixed height
                    lineHeight: '19px' // Adjusted line height for new padding
                  }}
                />
              </div>

              <div style={{ flex: '1' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={handleEndDateChange}
                  style={{
                    width: '100%',
                    padding: '8px', // Changed to 8px uniform padding
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    height: '35px', // Set fixed height
                    lineHeight: '19px' // Adjusted line height for new padding
                  }}
                />
              </div>
            </div>

            {/* New Weeks Input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Number of Weeks
              </label>
              <div style={{ 
                display: 'flex',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                overflow: 'hidden',
                height: '35px' // Match the 35px height of other inputs
              }}>
                <input
                  type="text" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={weekCount}
                  onChange={handleWeekCountChange}
                  style={{
                    flex: 1,
                    padding: '8px', // Changed from 4px 12px to 8px
                    border: 'none',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    WebkitAppearance: 'none',
                    MozAppearance: 'textfield',
                    height: '100%', // Take full height of parent
                    lineHeight: '19px' // Adjusted line height for new padding
                  }}
                />
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  borderLeft: '1px solid #CBD5E1',
                  height: '100%', // Take full height of parent
                  width: '20px' // Set fixed width to 20px
                }}>
                  <button
                    type="button"
                    onClick={handleWeekIncrement}
                    style={{
                      padding: '0',
                      border: 'none',
                      backgroundColor: '#F1F5F9',
                      cursor: 'pointer',
                      borderBottom: '1px solid #CBD5E1',
                      height: '50%', // Take half the height
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%' // Take full width of parent
                    }}
                  >
                    <span style={{ 
                      fontSize: '10px', 
                      color: '#4B5563',
                      lineHeight: 1
                    }}>▲</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleWeekDecrement}
                    style={{
                      padding: '0',
                      border: 'none',
                      backgroundColor: '#F1F5F9',
                      cursor: 'pointer',
                      height: '50%', // Take half the height
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%' // Take full width of parent
                    }}
                  >
                    <span style={{ 
                      fontSize: '10px', 
                      color: '#4B5563',
                      lineHeight: 1
                    }}>▼</span>
                  </button>
                </div>
              </div>
              {/* Remove the helper text as requested */}
            </div>

            {/* Participating Squadrons - hidden flag-on: participation derives
                from the activities' participant criteria on save */}
            {!activitiesEnabled && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px'
              }}>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Participating Squadrons
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    type="button"
                    onClick={() => setParticipatingSquadrons(squadrons.map(s => s.id))}
                    style={{
                      padding: '2px 6px',
                      backgroundColor: '#EFF6FF',
                      border: '1px solid #DBEAFE',
                      borderRadius: '3px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontFamily: 'Inter',
                      color: '#1E40AF'
                    }}
                  >
                    All
                  </button>
                  <button 
                    type="button"
                    onClick={() => setParticipatingSquadrons([])}
                    style={{
                      padding: '2px 6px',
                      backgroundColor: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: '3px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontFamily: 'Inter',
                      color: '#DC2626'
                    }}
                  >
                    None
                  </button>
                </div>
              </div>
              <div style={{
                maxHeight: '200px',
                overflowY: 'auto',
                border: '1px solid #E5E7EB',
                borderRadius: '4px',
                padding: '4px',
                backgroundColor: '#FAFAFA'
              }}>
                {squadrons.map(squadron => {
                  const isSelected = participants.includes(squadron.id);
                  return (
                    <div
                      key={squadron.id}
                      onClick={() => {
                        if (isSelected) {
                          setParticipatingSquadrons(prev => prev.filter(id => id !== squadron.id));
                        } else {
                          setParticipatingSquadrons(prev => [...prev, squadron.id]);
                        }
                      }}
                      style={{
                        padding: '6px 8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                        borderRadius: '3px',
                        transition: 'background-color 0.2s',
                        marginBottom: '2px'
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = '#F8FAFC';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{
                        width: '14px',
                        height: '14px',
                        border: '1px solid #CBD5E1',
                        borderRadius: '3px',
                        backgroundColor: isSelected ? '#3B82F6' : '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {isSelected && (
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      
                      {/* Squadron Insignia */}
                      {squadron.insignia_url ? (
                        <div style={{
                          width: '20px',
                          height: '20px',
                          backgroundImage: `url(${squadron.insignia_url})`,
                          backgroundSize: 'contain',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'center',
                          flexShrink: 0
                        }} />
                      ) : (
                        <div style={{
                          width: '20px',
                          height: '20px',
                          backgroundColor: '#E5E7EB',
                          borderRadius: '3px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <span style={{ fontSize: '10px', color: '#6B7280' }}>?</span>
                        </div>
                      )}
                      
                      {/* Squadron Info */}
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'Inter' }}>
                          {squadron.designation}
                        </span>
                        <span style={{ fontSize: '10px', color: '#64748B', fontFamily: 'Inter' }}>
                          {squadron.name}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{
                fontSize: '12px',
                color: '#64748B',
                marginTop: '4px'
              }}>
                {participants.length === 0 ? 
                  'No squadrons selected. Events will not be posted to Discord.' :
                  `${participants.length} squadron${participants.length !== 1 ? 's' : ''} selected. Events in this cycle will be posted to their Discord channels.`
                }
              </div>
            </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px', // Changed from 8px 12px to just 8px
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  minHeight: '120px',
                  resize: 'none',
                  boxSizing: 'border-box'
                }}
                placeholder="Enter cycle description"
              />
            </div>

            {error && (
              <div style={{
                color: '#EF4444',
                fontSize: '14px',
                marginBottom: '16px'
              }}>
                {error}
              </div>
            )}
          </div>
          )}

          {/* Left-pane Options / Reminders / Publication sections (flag-on):
              defaults for events created in this cycle, one per tab */}
          {activitiesEnabled && (
            <>
              {activeTab === 'options' && (
              <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
                <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 16px 0', fontFamily: 'Inter' }}>
                  Defaults for events created in this cycle. Each event can still override them.
                </p>
                {([
                  { key: 'trackQualifications', label: 'Group responses by qualification' },
                  { key: 'groupBySquadron', label: 'Group responses by squadron' },
                  { key: 'showNoResponse', label: 'Show non-responders' },
                  { key: 'allowTentativeResponse', label: 'Allow tentative responses' }
                ] as Array<{ key: keyof CycleSettings; label: string }>).map(option => (
                  <div key={option.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#64748B', fontFamily: 'Inter' }}>{option.label}</label>
                    <div
                      onClick={() => setCycleSettings(prev => ({ ...prev, [option.key]: !prev[option.key] }))}
                      style={{
                        width: '38px',
                        height: '21px',
                        backgroundColor: cycleSettings[option.key] ? '#3B82F6' : '#E5E7EB',
                        borderRadius: '11px',
                        position: 'relative',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s ease',
                        flexShrink: 0
                      }}
                    >
                      <div style={{
                        width: '17px',
                        height: '17px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        position: 'absolute',
                        top: '2px',
                        left: cycleSettings[option.key] ? '19px' : '2px',
                        transition: 'left 0.2s ease',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                      }} />
                    </div>
                  </div>
                ))}
              </div>
              )}

              {activeTab === 'reminders' && (
              <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
                <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 16px 0', fontFamily: 'Inter' }}>
                  Default reminders for events created in this cycle. Each event can still override them.
                </p>
                {([
                  { enabledKey: 'firstReminderEnabled', timeKey: 'firstReminderTime', label: 'First' },
                  { enabledKey: 'secondReminderEnabled', timeKey: 'secondReminderTime', label: 'Second' }
                ] as Array<{ enabledKey: 'firstReminderEnabled' | 'secondReminderEnabled'; timeKey: 'firstReminderTime' | 'secondReminderTime'; label: string }>).map(reminder => (
                  <div key={reminder.enabledKey} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <input
                      type="checkbox"
                      checked={cycleSettings[reminder.enabledKey] ?? false}
                      onChange={(e) => setCycleSettings(prev => ({ ...prev, [reminder.enabledKey]: e.target.checked }))}
                    />
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#64748B', width: '52px', fontFamily: 'Inter' }}>{reminder.label}</label>
                    <input
                      type="number"
                      min={1}
                      value={cycleSettings[reminder.timeKey]?.value ?? (reminder.timeKey === 'firstReminderTime' ? 3 : 15)}
                      onChange={(e) => setCycleSettings(prev => ({
                        ...prev,
                        [reminder.timeKey]: {
                          value: Math.max(1, parseInt(e.target.value) || 1),
                          unit: prev[reminder.timeKey]?.unit ?? (reminder.timeKey === 'firstReminderTime' ? 'days' : 'minutes')
                        }
                      }))}
                      style={{ width: '56px', padding: '5px 6px', border: '1px solid #CBD5E1', borderRadius: '4px', fontSize: '13px' }}
                    />
                    <select
                      value={cycleSettings[reminder.timeKey]?.unit ?? (reminder.timeKey === 'firstReminderTime' ? 'days' : 'minutes')}
                      onChange={(e) => setCycleSettings(prev => ({
                        ...prev,
                        [reminder.timeKey]: {
                          value: prev[reminder.timeKey]?.value ?? (reminder.timeKey === 'firstReminderTime' ? 3 : 15),
                          unit: e.target.value as 'minutes' | 'hours' | 'days'
                        }
                      }))}
                      style={{ padding: '5px 6px', border: '1px solid #CBD5E1', borderRadius: '4px', fontSize: '13px', backgroundColor: 'white', flex: 1 }}
                    >
                      <option value="minutes">minutes</option>
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </select>
                  </div>
                ))}
                <p style={{ fontSize: '11px', color: '#94A3B8', margin: 0, fontFamily: 'Inter' }}>before each event</p>
              </div>
              )}

              {activeTab === 'publication' && (
              <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
                <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 16px 0', fontFamily: 'Inter' }}>
                  Default publication behavior for events created in this cycle. Each event can still override it.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="checkbox"
                    checked={cycleSettings.scheduledPublicationEnabled ?? false}
                    onChange={(e) => setCycleSettings(prev => ({ ...prev, scheduledPublicationEnabled: e.target.checked }))}
                  />
                  <label style={{ fontSize: '13px', fontWeight: 500, color: '#64748B', fontFamily: 'Inter' }}>
                    Schedule event publication
                  </label>
                </div>
                {cycleSettings.scheduledPublicationEnabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', color: '#64748B' }}>Publish</span>
                    <input
                      type="number"
                      min={1}
                      value={cycleSettings.scheduledPublicationOffset?.value ?? 3}
                      onChange={(e) => setCycleSettings(prev => ({
                        ...prev,
                        scheduledPublicationOffset: {
                          value: Math.max(1, parseInt(e.target.value) || 1),
                          unit: prev.scheduledPublicationOffset?.unit ?? 'days'
                        }
                      }))}
                      style={{ width: '56px', padding: '5px 6px', border: '1px solid #CBD5E1', borderRadius: '4px', fontSize: '13px' }}
                    />
                    <select
                      value={cycleSettings.scheduledPublicationOffset?.unit ?? 'days'}
                      onChange={(e) => setCycleSettings(prev => ({
                        ...prev,
                        scheduledPublicationOffset: {
                          value: prev.scheduledPublicationOffset?.value ?? 3,
                          unit: e.target.value as 'minutes' | 'hours' | 'days'
                        }
                      }))}
                      style={{ padding: '5px 6px', border: '1px solid #CBD5E1', borderRadius: '4px', fontSize: '13px', backgroundColor: 'white', flex: 1 }}
                    >
                      <option value="minutes">minutes</option>
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </select>
                    <span style={{ fontSize: '11px', color: '#94A3B8', whiteSpace: 'nowrap' }}>before start</span>
                  </div>
                )}
              </div>
              )}
            </>
          )}
          </div>

          {/* Right pane: activities calendar + selected activity/participants
              panel on top (scrolls), enrollment lists filling what remains */}
          {activitiesEnabled && (
            <div style={{ flex: 1, padding: '16px', minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flexShrink: 1, minHeight: 0, overflowY: 'auto' }}>
              <CycleActivitiesBuilder
                activities={cycleActivities}
                onChange={setCycleActivities}
                weekCount={weekCount}
                onWeekCountChange={(weeks) => {
                  setWeekCount(weeks);
                  lastChanged.current = 'weeks';
                }}
                startDate={startDate}
                squadrons={squadrons}
                syllabusNames={syllabusNames}
                syllabusMissionNames={syllabusMissionNames}
                selection={builderSelection}
                onSelect={setBuilderSelection}
                participantRows={participantRows}
                onAddParticipantRow={handleAddParticipantRow}
                onRemoveParticipantRow={handleRemoveParticipantRow}
                onAddActivityInRow={handleAddActivityInRow}
                onRemoveActivity={handleRemoveActivityAt}
                cycleEvents={cycleEventItems}
                onMoveEvent={handleMoveEventToWeek}
                onResetActivity={handleResetActivity}
                onDeleteEvent={handleDeleteEventFromActivity}
                onAddEventInWeek={handleAddEventInWeek}
              />

              {/* Add-event picker: recommends syllabus missions not yet inside
                  the activity (portaled so nothing in the dialog clips it) */}
              {addEventPicker && createPortal(
                <>
                  <div
                    onClick={() => setAddEventPicker(null)}
                    style={{ position: 'fixed', inset: 0, zIndex: 2999 }}
                  />
                  <div style={{
                    position: 'fixed',
                    left: `${Math.min(addEventPicker.x, window.innerWidth - 280)}px`,
                    top: `${Math.min(addEventPicker.y, window.innerHeight - 300)}px`,
                    width: '260px',
                    maxHeight: '280px',
                    overflowY: 'auto',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    padding: '8px',
                    zIndex: 3000
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', fontFamily: 'Inter', padding: '2px 6px 6px 6px' }}>
                      Add event — Week {addEventPicker.week}
                    </div>
                    {addEventPicker.missing.length === 0 ? (
                      <div style={{ fontSize: '12px', color: '#94A3B8', fontFamily: 'Inter', fontStyle: 'italic', padding: '4px 6px' }}>
                        Every lesson in this syllabus is already scheduled.
                      </div>
                    ) : (
                      addEventPicker.missing.map(mission => (
                        <button
                          key={mission.id}
                          type="button"
                          onClick={async () => {
                            const activity = cycleActivities[addEventPicker.activityIndex];
                            setAddEventPicker(null);
                            if (activity) await createEventForActivityWeek(activity, addEventPicker.week, mission);
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '6px 8px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            borderRadius: '4px',
                            fontSize: '13px',
                            color: '#374151',
                            fontFamily: 'Inter',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F1F5F9'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          {mission.mission_name}
                        </button>
                      ))
                    )}
                  </div>
                </>,
                document.body
              )}

              {builderSelection?.type === 'row' && (
                <div style={{ marginTop: '16px', padding: '12px', border: '1px solid #CBD5E1', borderRadius: '8px', backgroundColor: '#FFFFFF' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', margin: '0 0 12px 0', fontFamily: 'Inter' }}>
                    Participants
                  </h3>
                  <ParticipantBlocksEditor
                    blocks={selectedRowCriteria as any}
                    onChange={(blocks) => handleUpdateRowCriteria(blocks)}
                    standings={standings}
                    qualifications={qualifications}
                    squadrons={squadrons.map(s => ({ id: s.id, name: s.name, designation: s.designation, insignia_url: s.insignia_url }))}
                  />
                </div>
              )}

              {selectedActivityIndex !== null && cycleActivities[selectedActivityIndex] && (
                <>
                  <div style={{ marginTop: '16px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', fontFamily: 'Inter', textTransform: 'uppercase' }}>
                      Activity — Weeks {cycleActivities[selectedActivityIndex].startWeek}–{cycleActivities[selectedActivityIndex].endWeek}
                    </span>
                  </div>
                  <CycleActivityConfigPanel
                    activity={cycleActivities[selectedActivityIndex]}
                    onChange={handleUpdateSelectedActivity}
                    weekCount={weekCount}
                    onRequireWeeks={(weeks) => {
                      if (weeks > weekCount) {
                        setWeekCount(weeks);
                        lastChanged.current = 'weeks'; // recalculates the end date
                      }
                    }}
                  />

                  {/* Enrollment renders below this scroll section so it can
                      fill the remaining pane height */}
                  {cycleActivities[selectedActivityIndex].kind === 'syllabus'
                    && (!cycleId || !cycleActivities[selectedActivityIndex].id) && (
                    <p style={{ fontSize: '12px', color: '#94A3B8', margin: '12px 0 0 0', fontFamily: 'Inter', fontStyle: 'italic' }}>
                      Save the cycle, then reopen it to enroll students and instructors for this activity.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Training activities carry their own Students/Instructors
                enrollment (rows keep cycle_id so PTR keeps working) */}
            {selectedActivityIndex !== null
              && cycleActivities[selectedActivityIndex]?.kind === 'syllabus'
              && cycleId
              && cycleActivities[selectedActivityIndex]?.id
              && renderActivityEnrollment(cycleActivities[selectedActivityIndex])}
            </div>
          )}
          </div>

          {/* Enrollments Tab Content */}
          {activeTab === 'enrollments' && (
            <div style={{ paddingTop: '16px', paddingLeft: '24px', paddingRight: '24px', paddingBottom: '0', height: '900px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {enrollmentError && (
                <div style={{
                  color: '#EF4444',
                  fontSize: '14px',
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: '#FEE2E2',
                  border: '1px solid #FECACA',
                  borderRadius: '6px'
                }}>
                  {enrollmentError}
                </div>
              )}

              {loadingEnrollments ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
                  Loading enrollment data...
                </div>
              ) : (
                <>
                  {renderActivityScopeSelector()}

                  {/* Filter Drawer */}
                  <FilterDrawer
                    squadrons={squadrons as any}
                    statuses={statuses}
                    standings={standings}
                    roles={roles}
                    qualifications={qualifications}
                    pilots={[...enrolledPilots, ...suggestedPilots, ...allPilots] as any[]}
                    allPilotQualifications={enrolledPilotQualifications}
                    selectedSquadronIds={selectedSquadronIds}
                    selectedStatusIds={selectedStatusIds}
                    selectedStandingIds={selectedStandingIds}
                    selectedRoleIds={selectedRoleIds}
                    qualificationFilters={qualificationFilters}
                    filtersEnabled={filtersEnabled}
                    setSelectedSquadronIds={setSelectedSquadronIds}
                    setSelectedStatusIds={setSelectedStatusIds}
                    setSelectedStandingIds={setSelectedStandingIds}
                    setSelectedRoleIds={setSelectedRoleIds}
                    setQualificationFilters={setQualificationFilters}
                    setFiltersEnabled={setFiltersEnabled}
                  />

                  {/* Sort Controls */}
                  {renderSortControls()}

                  {/* Scrollable content area */}
                  <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                    {/* Currently Enrolled Students */}
                    <div style={{ marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px', textTransform: 'uppercase' }}>
                      Enrolled Students ({cycleId ? enrolledPilots.length : stagedEnrollmentIds.length})
                    </h3>
                    {(cycleId ? enrolledPilots.length : stagedEnrollmentIds.length) === 0 ? (
                      <div style={{ padding: '20px', backgroundColor: '#F9FAFB', borderRadius: '6px', color: '#6B7280', fontSize: '14px', textAlign: 'center' }}>
                        No students enrolled yet
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {sortPilots(enrolledPilots.filter(p => matchesEnrollmentScope((p as any).cycle_activity_id))).map(pilot => (
                          <div
                            key={pilot.pilot_id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              height: '24px',
                              marginBottom: '10px',
                              cursor: 'pointer',
                              backgroundColor: hoveredPilotId === pilot.pilot_id ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
                              transition: 'background-color 0.2s ease',
                              borderRadius: '8px',
                              padding: '2px 10px',
                              gap: '12px'
                            }}
                            onMouseEnter={() => setHoveredPilotId(pilot.pilot_id)}
                            onMouseLeave={() => setHoveredPilotId(null)}
                          >
                            <div style={{ marginLeft: '-20px' }}>
                              <PilotIDBadgeSm
                                squadronTailCode={pilot.squadron?.tail_code}
                                boardNumber={pilot.board_number ?? undefined}
                                squadronInsigniaUrl={pilot.squadron?.insignia_url ?? undefined}
                              />
                            </div>
                            <span style={{
                              fontSize: '16px',
                              fontWeight: 700,
                              color: pilot.squadron?.primary_color || '#374151',
                              flex: '0 0 120px'
                            }}>
                              {pilot.callsign}
                            </span>
                            {activitiesEnabled && !enrollmentActivityScopeId && (pilot as any).cycle_activity_id && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 500,
                                color: '#1E40AF',
                                backgroundColor: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                borderRadius: '9999px',
                                padding: '1px 6px',
                                whiteSpace: 'nowrap'
                              }}>
                                {activityNameById((pilot as any).cycle_activity_id)}
                              </span>
                            )}
                            <div style={{ marginLeft: 'auto' }}>
                              {hoveredPilotId === pilot.pilot_id && (
                                <button
                                  type="button"
                                  onClick={() => pilot.enrollment_id && handleRemoveEnrollment(pilot.enrollment_id)}
                                  style={{
                                    padding: '4px',
                                    backgroundColor: 'transparent',
                                    color: '#DC2626',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Suggested Students */}
                  {suggestedPilots.length > 0 && (
                    <div style={{ marginBottom: '32px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>
                        Suggested Students ({suggestedPilots.length})
                      </h3>
                      <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '12px' }}>
                        Based on syllabus auto-enrollment rules
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {sortPilots(suggestedPilots).map(pilot => (
                          <div
                            key={pilot.pilot_id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              height: '24px',
                              marginBottom: '10px',
                              cursor: 'pointer',
                              backgroundColor: hoveredPilotId === `suggested-${pilot.pilot_id}` ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
                              transition: 'background-color 0.2s ease',
                              borderRadius: '8px',
                              padding: '2px 10px',
                              gap: '12px'
                            }}
                            onMouseEnter={() => setHoveredPilotId(`suggested-${pilot.pilot_id}`)}
                            onMouseLeave={() => setHoveredPilotId(null)}
                            onClick={() => handleEnrollPilot(pilot.pilot_id)}
                          >
                            <div style={{ marginLeft: '-20px' }}>
                              <PilotIDBadgeSm
                                squadronTailCode={pilot.squadron?.tail_code}
                                boardNumber={pilot.board_number ?? undefined}
                                squadronInsigniaUrl={pilot.squadron?.insignia_url ?? undefined}
                              />
                            </div>
                            <span style={{
                              fontSize: '16px',
                              fontWeight: 700,
                              color: pilot.squadron?.primary_color || '#374151',
                              flex: '0 0 120px'
                            }}>
                              {pilot.callsign}
                            </span>
                            {hoveredPilotId === `suggested-${pilot.pilot_id}` && (
                              <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#6B7280' }}>
                                Click to enroll
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add Any Pilot */}
                  {allPilots.length > 0 && (() => {
                    const filteredAll = filterPilots(allPilots);
                    const activePilots = sortPilots(filteredAll.filter((p: any) => p.isActive));
                    const inactivePilots = sortPilots(filteredAll.filter((p: any) => !p.isActive));

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>
                          Add Pilot ({allPilots.length})
                        </h3>
                        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '12px' }}>
                          Other pilots not suggested by enrollment rules
                        </div>
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          flex: 1,
                          overflowY: 'auto',
                          paddingRight: '10px',
                          paddingBottom: '16px',
                          minHeight: 0
                        }}>
                          {/* Active Pilots */}
                          {activePilots.map((pilot: any) => (
                            <div
                              key={pilot.pilot_id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                height: '24px',
                                marginBottom: '10px',
                                cursor: 'pointer',
                                backgroundColor: hoveredPilotId === `all-${pilot.pilot_id}` ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
                                transition: 'background-color 0.2s ease',
                                borderRadius: '8px',
                                padding: '2px 10px',
                                gap: '12px'
                              }}
                              onMouseEnter={() => setHoveredPilotId(`all-${pilot.pilot_id}`)}
                              onMouseLeave={() => setHoveredPilotId(null)}
                              onClick={() => handleEnrollPilot(pilot.pilot_id)}
                            >
                              <div style={{ marginLeft: '-20px' }}>
                                <PilotIDBadgeSm
                                  squadronTailCode={pilot.squadron?.tail_code}
                                  boardNumber={pilot.board_number}
                                  squadronInsigniaUrl={pilot.squadron?.insignia_url}
                                />
                              </div>
                              <span style={{
                                fontSize: '16px',
                                fontWeight: 700,
                                color: pilot.squadron?.primary_color || '#374151',
                                flex: '0 0 120px'
                              }}>
                                {pilot.callsign}
                              </span>
                              {hoveredPilotId === `all-${pilot.pilot_id}` && (
                                <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#6B7280' }}>
                                  Click to enroll
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Divider between Active and Inactive */}
                          {inactivePilots.length > 0 && (
                            <div style={{
                              position: 'relative',
                              textAlign: 'center',
                              margin: '20px 0'
                            }}>
                              <div style={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                top: '50%',
                                height: '1px',
                                backgroundColor: '#E2E8F0'
                              }} />
                              <span style={{
                                position: 'relative',
                                backgroundColor: '#FFFFFF',
                                padding: '0 16px',
                                color: '#A0AEC0',
                                fontSize: '12px',
                                fontFamily: 'Inter',
                                fontWeight: 300,
                                textTransform: 'uppercase'
                              }}>
                                Inactive ({inactivePilots.length})
                              </span>
                            </div>
                          )}

                          {/* Inactive Pilots */}
                          {inactivePilots.map((pilot: any) => (
                            <div
                              key={pilot.pilot_id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                height: '24px',
                                marginBottom: '10px',
                                cursor: 'pointer',
                                backgroundColor: hoveredPilotId === `all-${pilot.pilot_id}` ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
                                transition: 'background-color 0.2s ease',
                                borderRadius: '8px',
                                padding: '2px 10px',
                                gap: '12px'
                              }}
                              onMouseEnter={() => setHoveredPilotId(`all-${pilot.pilot_id}`)}
                              onMouseLeave={() => setHoveredPilotId(null)}
                              onClick={() => handleEnrollPilot(pilot.pilot_id)}
                            >
                              <div style={{ marginLeft: '-20px' }}>
                                <PilotIDBadgeSm
                                  squadronTailCode={pilot.squadron?.tail_code}
                                  boardNumber={pilot.board_number}
                                  squadronInsigniaUrl={pilot.squadron?.insignia_url}
                                />
                              </div>
                              <span style={{
                                fontSize: '16px',
                                fontWeight: 700,
                                color: pilot.squadron?.primary_color || '#374151',
                                flex: '0 0 120px'
                              }}>
                                {pilot.callsign}
                              </span>
                              {hoveredPilotId === `all-${pilot.pilot_id}` && (
                                <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#6B7280' }}>
                                  Click to enroll
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Instructors Tab Content */}
          {activeTab === 'instructors' && (
            <div style={{ paddingTop: '16px', paddingLeft: '24px', paddingRight: '24px', paddingBottom: '0', height: '900px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {instructorError && (
                <div style={{
                  color: '#EF4444',
                  fontSize: '14px',
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: '#FEE2E2',
                  border: '1px solid #FECACA',
                  borderRadius: '6px'
                }}>
                  {instructorError}
                </div>
              )}

              {loadingInstructors ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
                  Loading instructor data...
                </div>
              ) : (
                <>
                  {/* Sort Controls for Instructors */}
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    marginBottom: '16px',
                    justifyContent: 'flex-end'
                  }}>
                    <span style={{ fontSize: '12px', color: '#6B7280', marginRight: '4px', alignSelf: 'center' }}>
                      Sort by:
                    </span>
                    <button
                      type="button"
                      onClick={() => setInstructorSortBySquadron(!instructorSortBySquadron)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '4px',
                        backgroundColor: instructorSortBySquadron ? '#EFF6FF' : 'white',
                        color: instructorSortBySquadron ? '#2563EB' : '#6B7280',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      Squadron
                    </button>
                    <button
                      type="button"
                      onClick={() => setInstructorSortBy(instructorSortBy === 'callsign' ? 'boardNumber' : 'callsign')}
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '4px',
                        backgroundColor: 'white',
                        color: '#6B7280',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <ArrowUpDown size={12} />
                      {instructorSortBy === 'callsign' ? 'Callsign' : 'Board #'}
                    </button>
                  </div>

                  {renderActivityScopeSelector()}

                  {/* Scrollable content area */}
                  <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                    {/* Currently Enrolled Instructors */}
                    <div style={{ marginBottom: '32px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px', textTransform: 'uppercase' }}>
                        Enrolled Instructors ({cycleId ? enrolledInstructors.length : stagedInstructorIds.length})
                      </h3>
                      {(cycleId ? enrolledInstructors.length : stagedInstructorIds.length) === 0 ? (
                        <div style={{ padding: '20px', backgroundColor: '#F9FAFB', borderRadius: '6px', color: '#6B7280', fontSize: '14px', textAlign: 'center' }}>
                          No instructors enrolled yet
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {sortInstructors(enrolledInstructors.filter(i => matchesEnrollmentScope((i as any).cycle_activity_id))).map(instructor => (
                            <div
                              key={instructor.pilot_id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                height: '24px',
                                marginBottom: '10px',
                                cursor: 'pointer',
                                backgroundColor: hoveredInstructorId === instructor.pilot_id ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
                                transition: 'background-color 0.2s ease',
                                borderRadius: '8px',
                                padding: '2px 10px',
                                gap: '12px'
                              }}
                              onMouseEnter={() => setHoveredInstructorId(instructor.pilot_id)}
                              onMouseLeave={() => setHoveredInstructorId(null)}
                            >
                              <div style={{ marginLeft: '-20px' }}>
                                <PilotIDBadgeSm
                                  squadronTailCode={instructor.squadron?.tail_code}
                                  boardNumber={instructor.board_number ?? undefined}
                                  squadronInsigniaUrl={instructor.squadron?.insignia_url ?? undefined}
                                />
                              </div>
                              <span style={{
                                fontSize: '16px',
                                fontWeight: 700,
                                color: instructor.squadron?.primary_color || '#374151',
                                flex: '0 0 120px'
                              }}>
                                {instructor.callsign}
                              </span>
                              {activitiesEnabled && !enrollmentActivityScopeId && (instructor as any).cycle_activity_id && (
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 500,
                                  color: '#1E40AF',
                                  backgroundColor: '#EFF6FF',
                                  border: '1px solid #BFDBFE',
                                  borderRadius: '9999px',
                                  padding: '1px 6px',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {activityNameById((instructor as any).cycle_activity_id)}
                                </span>
                              )}
                              <div style={{ marginLeft: 'auto' }}>
                                {hoveredInstructorId === instructor.pilot_id && (
                                  <button
                                    type="button"
                                    onClick={() => instructor.enrollment_id && handleRemoveInstructor(instructor.enrollment_id)}
                                    style={{
                                      padding: '4px',
                                      backgroundColor: 'transparent',
                                      color: '#DC2626',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Suggested Instructors */}
                    {suggestedInstructors.length > 0 && (
                      <div style={{ marginBottom: '32px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>
                          Suggested Instructors ({suggestedInstructors.length})
                        </h3>
                        <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '12px', marginTop: 0 }}>
                          Based on syllabus instructor qualification rules. Click to enroll.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {sortInstructors(suggestedInstructors).map(instructor => (
                            <div
                              key={instructor.pilot_id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                height: '24px',
                                marginBottom: '10px',
                                cursor: 'pointer',
                                backgroundColor: hoveredInstructorId === `suggested-${instructor.pilot_id}` ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
                                transition: 'background-color 0.2s ease',
                                borderRadius: '8px',
                                padding: '2px 10px',
                                gap: '12px'
                              }}
                              onMouseEnter={() => setHoveredInstructorId(`suggested-${instructor.pilot_id}`)}
                              onMouseLeave={() => setHoveredInstructorId(null)}
                              onClick={() => handleEnrollInstructor(instructor.pilot_id)}
                            >
                              <div style={{ marginLeft: '-20px' }}>
                                <PilotIDBadgeSm
                                  squadronTailCode={instructor.squadron?.tail_code}
                                  boardNumber={instructor.board_number ?? undefined}
                                  squadronInsigniaUrl={instructor.squadron?.insignia_url ?? undefined}
                                />
                              </div>
                              <span style={{
                                fontSize: '16px',
                                fontWeight: 700,
                                color: instructor.squadron?.primary_color || '#374151',
                                flex: '0 0 120px'
                              }}>
                                {instructor.callsign}
                              </span>
                              {hoveredInstructorId === `suggested-${instructor.pilot_id}` && (
                                <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#6B7280' }}>
                                  Click to enroll
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* All Available Pilots (for adding instructors manually) */}
                    <div style={{ marginBottom: '32px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>
                        Add Instructor
                      </h3>
                      <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '12px', marginTop: 0 }}>
                        Select any pilot to enroll as an instructor. Click to add.
                      </p>
                      {allPilots.length === 0 ? (
                        <div style={{ padding: '20px', backgroundColor: '#F9FAFB', borderRadius: '6px', color: '#6B7280', fontSize: '14px', textAlign: 'center' }}>
                          All pilots are already enrolled or suggested
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {sortInstructors(allPilots as EnrolledInstructor[])
                            .filter(p => 
                              !enrolledInstructors.some(ei => ei.pilot_id === p.pilot_id) &&
                              !suggestedInstructors.some(si => si.pilot_id === p.pilot_id) &&
                              !stagedInstructorIds.includes(p.pilot_id)
                            )
                            .slice(0, 50) // Limit to first 50 for performance
                            .map(pilot => (
                            <div
                              key={pilot.pilot_id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                height: '24px',
                                marginBottom: '10px',
                                cursor: 'pointer',
                                backgroundColor: hoveredInstructorId === `all-${pilot.pilot_id}` ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
                                transition: 'background-color 0.2s ease',
                                borderRadius: '8px',
                                padding: '2px 10px',
                                gap: '12px'
                              }}
                              onMouseEnter={() => setHoveredInstructorId(`all-${pilot.pilot_id}`)}
                              onMouseLeave={() => setHoveredInstructorId(null)}
                              onClick={() => handleEnrollInstructor(pilot.pilot_id)}
                            >
                              <div style={{ marginLeft: '-20px' }}>
                                <PilotIDBadgeSm
                                  squadronTailCode={pilot.squadron?.tail_code}
                                  boardNumber={pilot.board_number ?? undefined}
                                  squadronInsigniaUrl={pilot.squadron?.insignia_url ?? undefined}
                                />
                              </div>
                              <span style={{
                                fontSize: '16px',
                                fontWeight: 700,
                                color: pilot.squadron?.primary_color || '#374151',
                                flex: '0 0 120px'
                              }}>
                                {pilot.callsign}
                              </span>
                              {hoveredInstructorId === `all-${pilot.pilot_id}` && (
                                <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#6B7280' }}>
                                  Click to enroll as instructor
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            borderTop: '1px solid #E2E8F0',
            padding: '16px 24px'
          }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                backgroundColor: 'white',
                color: '#64748B',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: '#2563EB',
                color: 'white',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: isSaving ? 0.7 : 1
              }}
            >
              {isSaving && (
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite'
                }} />
              )}
              {isSaving
                ? 'Saving...'
                : (initialData ? 'Update Cycle' : 'Create Cycle')
              }
            </button>
          </div>
        </form>
          </>
        )}
      </div>

      {/* Add keyframes for loading spinner animation */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}} />
    </>
  );
};

export default CycleDialog;
