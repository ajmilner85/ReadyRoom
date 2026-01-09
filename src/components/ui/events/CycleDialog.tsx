import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Users, Trash2, ArrowUpDown } from 'lucide-react';
import { CycleType, TrainingSyllabus } from '../../../types/EventTypes';
import { Squadron } from '../../../types/OrganizationTypes';
import { supabase } from '../../../utils/supabaseClient';
import { enrollPilots, removeEnrollment, getCycleEnrollments, getSuggestedEnrollments, type EnrolledPilot } from '../../../utils/trainingEnrollmentService';
import PilotIDBadgeSm from '../PilotIDBadgeSm';
import FilterDrawer, { QualificationFilterMode } from '../roster/FilterDrawer';
import { Status } from '../../../utils/statusService';
import { Standing } from '../../../utils/standingService';
import { Role } from '../../../utils/roleService';
import { Qualification, getBatchPilotQualifications } from '../../../utils/qualificationService';

interface CycleDialogProps {
  onSave: (cycleData: {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    type: CycleType;
    restrictedTo?: string[];
    participants?: string[];
    syllabusId?: string;
    autoCreateEvents?: boolean;
    stagedEnrollmentIds?: string[];
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
    restrictedTo?: string[];
    participants?: string[];
    syllabusId?: string;
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
  const [restrictedTo, setRestrictedTo] = useState<string[]>(initialData?.restrictedTo || []);
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

  // Tab state (show tabs for Training cycles with syllabus selected OR when editing)
  const showTabs = type === 'Training' && (!!cycleId || !!selectedSyllabusId);
  const [activeTab, setActiveTab] = useState<'details' | 'enrollments'>('details');

  // Enrollment state
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

  // Load syllabi when component mounts if type is Training
  useEffect(() => {
    if (type === 'Training') {
      const loadSyllabi = async () => {
        const { data, error } = await supabase
          .from('training_syllabi')
          .select('id, name, description')
          .order('name') as any;

        if (!error && data) {
          setSyllabi(data);
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

      // Load suggested pilots based on syllabus rules (only if syllabus is selected)
      let suggested: EnrolledPilot[] = [];
      if (selectedSyllabusId) {
        suggested = await getSuggestedEnrollments(selectedSyllabusId);
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

  const handleEnrollPilot = async (pilotId: string) => {
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

        // Actually enroll in database
        await enrollPilots(cycleId, [pilotId], userProfileId);

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

    onSave({
      name: name.trim(),
      description: description.trim(),
      startDate,
      endDate,
      type,
      restrictedTo: restrictedTo.length > 0 ? restrictedTo : undefined,
      participants: participants.length > 0 ? participants : undefined,
      syllabusId: type === 'Training' ? (selectedSyllabusId || undefined) : undefined,
      autoCreateEvents: !hasEvents && autoCreateEvents, // Only for cycles with no events
      stagedEnrollmentIds: stagedEnrollmentIds.length > 0 ? stagedEnrollmentIds : undefined
    });
  };

  const cycleTypes: CycleType[] = ['Training', 'Cruise-WorkUp', 'Cruise-Mission', 'Other'];
  const roleOptions = ['Cadre', 'Staff', 'Command', 'All Pilots'];

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
        width: '663px',
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
        {showTabs && (
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
              Enrolled Students ({cycleId ? enrolledPilots.length : stagedEnrollmentIds.length})
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Details Tab Content */}
          {activeTab === 'details' && (
          <div style={{ padding: '24px', height: '900px', overflowY: 'auto' }}>
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

              {/* Training Syllabus Selector - only show for Training type */}
              {type === 'Training' && (
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

            {/* Auto-create Events Toggle - show for new cycles OR cycles with no events */}
            {!hasEvents && type === 'Training' && selectedSyllabusId && (
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

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Eligibility
              </label>
              <select
                multiple
                value={restrictedTo}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value);
                  setRestrictedTo(values);
                }}
                style={{
                  width: '100%',
                  padding: '8px', // Changed from 8px 12px to just 8px
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              >
                {roleOptions.map(role => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <div style={{
                fontSize: '12px',
                color: '#64748B',
                marginTop: '4px'
              }}>
                Hold Ctrl/Cmd to select multiple roles. Leave empty for no restrictions.
              </div>
            </div>

            {/* Participating Squadrons */}
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
                        {sortPilots(enrolledPilots).map(pilot => (
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