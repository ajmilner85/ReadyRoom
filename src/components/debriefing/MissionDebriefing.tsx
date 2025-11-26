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
      const cycleId = selectedCycleId || undefined;
      const missions = await debriefingService.getDebriefableMissions(wingId, cycleId);

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

      console.log('[PARSE-FLIGHTS] Flight squadron_id:', flight.squadron_id);

      flights.push({
        flightId: flight.id,
        callsign: flight.callsign,
        squadronId: flight.squadron_id || '',
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

      // Fetch squadron assignments for these pilots
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('pilot_assignments')
        .select('pilot_id, squadron_id')
        .in('pilot_id', pilotIds)
        .is('end_date', null);

      if (assignmentsError) {
        console.error('Failed to fetch squadron assignments:', assignmentsError);
      }

      // Create maps for quick lookup
      const pilotMap = new Map(pilotsData?.map(p => [p.id, p]) || []);
      const squadronMap = new Map(assignmentsData?.map(a => [a.pilot_id, a.squadron_id]) || []);

      // Update flights with pilot data and squadron assignments
      const updatedFlights = flights.map(f => {
        const pilot = pilotMap.get(f.flightLeadPilotId);
        const squadronId = squadronMap.get(f.flightLeadPilotId) || f.squadronId || '';

        return {
          ...f,
          squadronId,
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
    if (!userProfile?.pilot) return false;

    const pilotId = userProfile.pilot.id;

    // Check if user is the flight lead
    if (flight.flightLeadPilotId === pilotId) {
      return true;
    }

    // TODO: Check for delegation or squadron/wing leadership permissions
    return false;
  };

  return (
    <div style={debriefingStyles.container}>
      <div style={debriefingStyles.contentWrapper}>
        <div style={debriefingStyles.columnsContainer}>
          {/* Left column - Mission List */}
          <MissionList
            missions={missions}
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
