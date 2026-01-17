import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePageLoading } from '../../context/PageLoadingContext';
import MissionList from './MissionList';
import MissionDetails from './MissionDetails';
import { debriefingService } from '../../services/debriefingService';
import { getAllSquadrons } from '../../utils/squadronService';
import type { Squadron } from '../../utils/squadronService';
import { supabase } from '../../utils/supabaseClient';
import type { PilotAssignment } from '../../types/MissionTypes';
import type { FlightDebrief } from '../../types/DebriefingTypes';
import { debriefingStyles } from '../../styles/DebriefingStyles';

interface MissionListItem {
  id: string;
  name: string;
  scheduled_time: string;
  status: string; // Mission planning status from missions table
  wing_id?: string;
  squadron_id?: string;
  mission_objectives?: any;
  mission_debriefings?: Array<{
    id: string;
    status: string;
    mission_outcome?: string | null;
    created_at: string;
    finalized_at?: string;
  }>;
}

interface FlightInfo {
  flightId: string;
  callsign: string;
  flightNumber: number;
  squadronId: string;
  flightLeadPilotId: string;
  flightLeadBoardNumber: string;
  flightLeadCallsign: string;
  pilotAssignments: PilotAssignment[];
}

const MissionDebriefing: React.FC = () => {
  const { userProfile } = useAuth();
  const { setPageLoading } = usePageLoading();

  // Data state
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [allMissions, setAllMissions] = useState<MissionListItem[]>([]); // Unfiltered missions for accurate counts
  const [cycles, setCycles] = useState<Array<{ id: string; name: string }>>([]);
  const [squadrons, setSquadrons] = useState<Squadron[]>([]);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);

  // Filter state
  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [selectedSquadronIds, setSelectedSquadronIds] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [filtersEnabled, setFiltersEnabled] = useState<boolean>(true);

  // Selection state
  const [selectedMission, setSelectedMission] = useState<MissionListItem | null>(null);
  const [hoveredMission, setHoveredMission] = useState<string | null>(null);

  // Mission details state
  const [_missionDetails, setMissionDetails] = useState<any>(null);
  const [missionFlights, setMissionFlights] = useState<FlightInfo[]>([]);
  const [missionDebriefId, setMissionDebriefId] = useState<string | null>(null);
  const [flightDebriefs, setFlightDebriefs] = useState<Map<string, FlightDebrief>>(new Map());
  const [aarOperationalOnly, setAarOperationalOnly] = useState<boolean>(true); // Default to true

  // Form state
  const [showDebriefForm, setShowDebriefForm] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<FlightInfo | null>(null);

  useEffect(() => {
    setPageLoading('debriefing', false);
    loadInitialData();
  }, [setPageLoading]);

  useEffect(() => {
    loadMissions();
  }, [selectedCycleId]);

  const loadInitialData = async () => {
    await Promise.all([
      loadCycles(),
      loadSquadrons(),
      loadMissions()
    ]);
  };

  const loadCycles = async () => {
    try {
      const cyclesData = await debriefingService.getCycles();
      setCycles(cyclesData || []);

      // Set current cycle as default if not already selected
      if (!selectedCycleId && cyclesData && cyclesData.length > 0) {
        const now = new Date();
        const currentCycle = cyclesData.find(cycle => {
          const startDate = new Date(cycle.start_date);
          const endDate = new Date(cycle.end_date);
          return now >= startDate && now <= endDate;
        });

        if (currentCycle) {
          setSelectedCycleId(currentCycle.id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load cycles:', err);
    }
  };

  const loadSquadrons = async () => {
    try {
      const { data: squadronsData, error } = await getAllSquadrons();
      if (error) {
        console.error('[DEBRIEFING] Error loading squadrons:', error);
        setSquadrons([]);
        return;
      }
      console.log('[DEBRIEFING] Loaded squadrons:', squadronsData);
      setSquadrons(squadronsData || []);
    } catch (err: any) {
      console.error('Failed to load squadrons:', err);
      setSquadrons([]);
    }
  };

  const loadMissions = async () => {
    try {
      setLoading(true);
      setError(null);

      const wingId = userProfile?.pilot?.currentSquadron?.wing_id;

      // Always load all missions for accurate filter counts
      const allMissionsData = await debriefingService.getDebriefableMissions(wingId, undefined);
      setAllMissions(allMissionsData || []);

      // Handle standalone events filter
      const cycleId = selectedCycleId === 'standalone' ? null : (selectedCycleId || undefined);
      const missions = await debriefingService.getDebriefableMissions(wingId, cycleId ?? undefined);

      setMissions(missions || []);

      // If there's a currently selected mission, update it with the refreshed data
      if (selectedMission) {
        const updatedMission = missions?.find(m => m.id === selectedMission.id);
        if (updatedMission) {
          setSelectedMission(updatedMission);
        }
      }
    } catch (err: any) {
      console.error('Failed to load missions:', err);
      setError(err.message || 'Failed to load missions');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMission = async (mission: MissionListItem) => {
    try {
      setSelectedMission(mission);
      setError(null);

      console.log('[MISSION-SELECT] Loading mission:', mission.id);

      // Get full mission details with flights and pilot assignments
      const fullMission = await debriefingService.getMissionWithFlights(mission.id);
      console.log('[MISSION-SELECT] Full mission data:', fullMission);
      setMissionDetails(fullMission);

      // Load AAR setting from event if mission is linked to an event
      if (fullMission?.event_id) {
        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select('event_settings')
          .eq('id', fullMission.event_id)
          .single();

        if (!eventError && eventData && eventData.event_settings) {
          const settings = eventData.event_settings as any;
          // Use event setting if defined, otherwise default to true
          setAarOperationalOnly(settings.aarOperationalOnly !== undefined ? settings.aarOperationalOnly : true);
        } else {
          // No event or no settings, use default
          setAarOperationalOnly(true);
        }
      } else {
        // No linked event, use default
        setAarOperationalOnly(true);
      }

      // Get or create mission debrief
      const debrief = await debriefingService.getOrCreateDebrief(mission.id);
      setMissionDebriefId(debrief.id);

      // Load existing flight debriefs with kills
      const debriefs = await debriefingService.getFlightDebriefsByMissionWithKills(debrief.id);
      console.log('[MISSION-SELECT] Existing debriefs:', debriefs);

      // Convert to Map keyed by flight_id for quick lookup
      const debriefMap = new Map<string, FlightDebrief>();
      debriefs.forEach((d: any) => {
        debriefMap.set(d.flight_id, d);
      });
      setFlightDebriefs(debriefMap);

      // Parse flights from pilot_assignments
      const flights = parseFlightsFromMission(fullMission);
      console.log('[MISSION-SELECT] Parsed flights:', flights);
      setMissionFlights(flights);
    } catch (err: any) {
      console.error('Failed to load mission debrief:', err);
      setError(err.message || 'Failed to load mission debrief');
    }
  };

  // Helper function to parse flights from mission data
  const parseFlightsFromMission = (mission: any): FlightInfo[] => {
    console.log('[PARSE-FLIGHTS] Starting parse with:', {
      hasAssignments: !!mission.pilot_assignments,
      hasFlights: !!mission.flights,
      assignmentKeys: mission.pilot_assignments ? Object.keys(mission.pilot_assignments) : [],
      flightCount: mission.flights?.length
    });

    if (!mission.pilot_assignments || !mission.flights) {
      console.log('[PARSE-FLIGHTS] Missing data, returning empty');
      return [];
    }

    const flights: FlightInfo[] = [];
    const pilotAssignments = mission.pilot_assignments as Record<string, PilotAssignment[]>;
    const missionFlights = mission.flights as any[];

    console.log('[PARSE-FLIGHTS] Processing flights:', missionFlights);

    // Count flights by callsign to assign sequential flight numbers
    const callsignCounts = new Map<string, number>();

    // For each flight in the mission
    missionFlights.forEach((flight: any) => {
      console.log('[PARSE-FLIGHTS] Checking flight:', flight.id, 'callsign:', flight.callsign);
      const assignments = pilotAssignments[flight.id] || [];
      console.log('[PARSE-FLIGHTS] Assignments for flight:', assignments.length);

      if (assignments.length === 0) {
        console.log('[PARSE-FLIGHTS] Skipping - no assignments');
        return;
      }

      // Find the flight lead (dash number "1")
      console.log('[PARSE-FLIGHTS] All dash numbers:', assignments.map(a => a.dash_number));
      const flightLead = assignments.find((a: PilotAssignment) => a.dash_number === '1');
      console.log('[PARSE-FLIGHTS] Flight lead:', flightLead);

      if (!flightLead) {
        console.log('[PARSE-FLIGHTS] Skipping - no flight lead');
        return;
      }

      // Determine squadron - prefer existing debrief's squadron, then callsign lookup
      let squadronId = '';
      const existingDebrief = flightDebriefs.get(flight.id);

      if (existingDebrief?.squadron_id) {
        // Use squadron from existing debrief (authoritative source)
        squadronId = existingDebrief.squadron_id;
        console.log('[PARSE-FLIGHTS] Using squadron from existing debrief:', squadronId);
      } else {
        // Get participating squadron IDs from the event
        const participatingSquadronIds = mission.events?.participants || [];
        console.log('[PARSE-FLIGHTS] Participating squadron IDs:', participatingSquadronIds);

        // Fallback to callsign lookup - filter by participating squadrons to resolve ambiguity
        const matchingSquadrons = squadrons.filter(s => s.callsigns?.includes(flight.callsign));
        console.log('[PARSE-FLIGHTS] All squadrons matching callsign:', matchingSquadrons.map(s => ({ id: s.id, name: s.name })));

        // Prefer squadrons that are actually participating in this event
        const participatingMatch = matchingSquadrons.find(s => participatingSquadronIds.includes(s.id));
        const flightSquadron = participatingMatch || matchingSquadrons[0]; // Fallback to first match if none participating

        squadronId = flightSquadron?.id || flight.squadron_id || '';
        console.log('[PARSE-FLIGHTS] Flight callsign:', flight.callsign, 'mapped to squadron:', flightSquadron?.name, 'id:', squadronId, 'isParticipating:', !!participatingMatch);
      }

      // Generate flight number based on callsign
      const currentCount = callsignCounts.get(flight.callsign) || 0;
      const flightNumber = currentCount + 1;
      callsignCounts.set(flight.callsign, flightNumber);

      flights.push({
        flightId: flight.id,
        callsign: flight.callsign,
        flightNumber: flightNumber,
        squadronId: squadronId,
        flightLeadPilotId: flightLead.pilot_id,
        flightLeadBoardNumber: '',
        flightLeadCallsign: '',
        pilotAssignments: assignments
      });
    });

    console.log('[PARSE-FLIGHTS] Parsed flights:', flights.length);

    // Fetch pilot data for flight leads
    fetchPilotsForFlights(flights);

    return flights;
  };

  // Fetch pilot data and squadron assignments for flight leads
  const fetchPilotsForFlights = async (flights: FlightInfo[]) => {
    try {
      const pilotIds = flights.map(f => f.flightLeadPilotId);

      // Fetch pilot data
      const { data: pilotsData, error: pilotsError } = await supabase
        .from('pilots')
        .select('id, boardNumber, callsign')
        .in('id', pilotIds);

      if (pilotsError) {
        console.error('Failed to fetch pilots:', pilotsError);
        return;
      }

      // Create map for quick lookup
      const pilotMap = new Map(pilotsData?.map(p => [p.id, p]) || []);

      // Update flights with pilot data (do NOT overwrite squadron from flight lead's assignment)
      const updatedFlights = flights.map(f => {
        const pilot = pilotMap.get(f.flightLeadPilotId);

        return {
          ...f,
          // Keep the squadron ID from flight (based on callsign or existing debrief)
          // Do NOT use flight lead's personal squadron assignment
          flightLeadBoardNumber: pilot?.boardNumber?.toString() || 'Unknown',
          flightLeadCallsign: pilot?.callsign || 'Unknown'
        };
      });

      console.log('[FETCH-PILOTS] Updated flights with squadron data:', updatedFlights);
      setMissionFlights(updatedFlights);
    } catch (err) {
      console.error('Failed to fetch pilots for flights:', err);
    }
  };

  const handleSubmitAAR = (flight: FlightInfo) => {
    setSelectedFlight(flight);
    setShowDebriefForm(true);
  };

  const handleCloseForm = () => {
    setShowDebriefForm(false);
    setSelectedFlight(null);
  };

  const handleFormSuccess = async () => {
    setShowDebriefForm(false);
    setSelectedFlight(null);

    // Reload flight debriefs
    if (missionDebriefId) {
      const debriefs = await debriefingService.getFlightDebriefsByMissionWithKills(missionDebriefId);
      const debriefMap = new Map<string, FlightDebrief>();
      debriefs.forEach((d: any) => {
        debriefMap.set(d.flight_id, d);
      });
      setFlightDebriefs(debriefMap);
    }
  };

  // Check if user can submit AAR for a specific flight
  const canSubmitAAR = (flight: FlightInfo): boolean => {
    console.log('[CAN-SUBMIT] userProfile:', {
      hasPilot: !!userProfile?.pilot,
      hasPermissions: !!userProfile?.permissions,
      permissionKeys: userProfile?.permissions ? Object.keys(userProfile.permissions) : [],
      edit_debriefs: userProfile?.permissions?.edit_debriefs
    });

    if (!userProfile?.pilot) {
      console.log('[CAN-SUBMIT] No user profile/pilot');
      return false;
    }

    const pilotId = userProfile.pilot.id;

    // Check edit_debriefs permission with scope validation
    if (!userProfile.permissions?.edit_debriefs) {
      // No permission - check if user is flight lead (legacy behavior)
      const canSubmit = flight.flightLeadPilotId === pilotId;
      console.log('[CAN-SUBMIT] No edit_debriefs permission, checking if flight lead:', canSubmit);
      return canSubmit;
    }

    const editDebriefs = userProfile.permissions.edit_debriefs;

    // If boolean (legacy), grant access if true
    if (typeof editDebriefs === 'boolean') {
      console.log('[CAN-SUBMIT] Boolean permission:', editDebriefs);
      return editDebriefs;
    }

    // If array of scopes, check if any scope grants access to this flight
    if (Array.isArray(editDebriefs)) {
      const userSquadronId = userProfile.pilot.currentSquadron?.id;
      const userWingId = userProfile.pilot.currentSquadron?.wing_id;

      console.log('[CAN-SUBMIT] Checking scopes for flight:', {
        flightId: flight.flightId,
        flightCallsign: flight.callsign,
        flightSquadronId: flight.squadronId,
        userSquadronId,
        userWingId,
        scopeCount: editDebriefs.length
      });

      const canSubmit = editDebriefs.some(scope => {
        console.log('[CAN-SUBMIT] Checking scope:', scope);

        // Global scope grants access to all flights
        if (scope.type === 'global') {
          console.log('[CAN-SUBMIT] ✓ Global scope - GRANTED');
          return true;
        }

        // Own wing scope grants access to flights in same wing
        if (scope.type === 'own_wing' && userWingId) {
          // Find the flight's squadron to check its wing
          const flightSquadron = squadrons.find(s => s.id === flight.squadronId);
          console.log('[CAN-SUBMIT] Wing scope check:', {
            flightSquadronWing: flightSquadron?.wing_id,
            userWing: userWingId,
            match: flightSquadron && flightSquadron.wing_id === userWingId
          });
          if (flightSquadron && flightSquadron.wing_id === userWingId) {
            console.log('[CAN-SUBMIT] ✓ Wing scope - GRANTED');
            return true;
          }
        }

        // Own squadron scope grants access to flights in same squadron
        if (scope.type === 'own_squadron' && userSquadronId) {
          const match = flight.squadronId === userSquadronId;
          console.log('[CAN-SUBMIT] Squadron scope check:', {
            flightSquadron: flight.squadronId,
            userSquadron: userSquadronId,
            match
          });
          if (match) {
            console.log('[CAN-SUBMIT] ✓ Squadron scope - GRANTED');
          }
          return match;
        }

        // Flight scope grants access only if user is the flight lead
        if (scope.type === 'flight') {
          const isLead = flight.flightLeadPilotId === pilotId;
          console.log('[CAN-SUBMIT] Flight scope check:', {
            flightLead: flight.flightLeadPilotId,
            userPilot: pilotId,
            isLead
          });
          if (isLead) {
            console.log('[CAN-SUBMIT] ✓ Flight scope - GRANTED');
          }
          return isLead;
        }

        console.log('[CAN-SUBMIT] ✗ No match for scope type:', scope.type);
        return false;
      });

      console.log('[CAN-SUBMIT] Final result:', canSubmit);
      return canSubmit;
    }

    // Fallback: if user is flight lead (legacy behavior for users without permission)
    return flight.flightLeadPilotId === pilotId;
  };

  return (
    <div style={debriefingStyles.container}>
      <div style={debriefingStyles.contentWrapper}>
        <div style={debriefingStyles.columnsContainer}>
          {/* Left column - Mission List */}
          <MissionList
            missions={missions}
            allMissions={allMissions}
            cycles={cycles}
            squadrons={squadrons}
            selectedMission={selectedMission}
            hoveredMission={hoveredMission}
            selectedCycleId={selectedCycleId}
            selectedSquadronIds={selectedSquadronIds}
            selectedStatus={selectedStatus}
            startDate={startDate}
            endDate={endDate}
            filtersEnabled={filtersEnabled}
            loading={loading}
            onSelectMission={handleSelectMission}
            setHoveredMission={setHoveredMission}
            setSelectedCycleId={setSelectedCycleId}
            setSelectedSquadronIds={setSelectedSquadronIds}
            setSelectedStatus={setSelectedStatus}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            setFiltersEnabled={setFiltersEnabled}
          />

          {/* Right column - Mission Details */}
          <MissionDetails
            selectedMission={selectedMission}
            missionFlights={missionFlights}
            missionDebriefId={missionDebriefId}
            flightDebriefs={flightDebriefs}
            showDebriefForm={showDebriefForm}
            selectedFlight={selectedFlight}
            canSubmitAAR={canSubmitAAR}
            aarOperationalOnly={aarOperationalOnly}
            onSubmitAAR={handleSubmitAAR}
            onCloseForm={handleCloseForm}
            onFormSuccess={handleFormSuccess}
            userPilotId={userProfile?.pilot?.id}
            squadrons={squadrons}
            onOutcomeUpdate={loadMissions}
          />
        </div>
      </div>
    </div>
  );
};

export default MissionDebriefing;
