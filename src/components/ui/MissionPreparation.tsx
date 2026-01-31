import React, { useCallback, useEffect, useState } from 'react';
import { usePageLoading } from '../../context/PageLoadingContext';
import StandardPageLoader from './StandardPageLoader';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import MissionDetails from './mission prep/MissionDetails';
import AvailablePilots from './mission prep/AvailablePilots';
import FlightAssignments from './mission prep/FlightAssignments';
import Communications from './mission prep/Communications';
import MissionSupportAssignments from './mission prep/MissionSupportAssignments';
import PilotDragOverlay from './mission-execution/PilotDragOverlay';
import type { Flight, ExtractedFlight } from '../../types/FlightData';
import type { MissionCommanderInfo } from '../../types/MissionCommanderTypes';
import type { Pilot } from '../../types/PilotTypes';
import { useDragDrop } from '../../utils/useDragDrop';
import { autoAssignPilots } from '../../utils/autoAssignUtils';
import { getMissionCommanderCandidatesWithFlightInfo } from '../../utils/missionCommanderUtils';
import { useMissionPrepData } from '../../hooks/useMissionPrepData';
import { useMissionPrepState } from '../../hooks/useMissionPrepState';
import { useMissionPrepDataPersistence } from '../../hooks/useMissionPrepDataPersistence';
import type { AssignedPilot, AssignedPilotsRecord } from '../../types/MissionPrepTypes';
import AutoAssignConfigModal, { type AutoAssignConfig } from './mission prep/AutoAssignConfig';
import { getUserSettings } from '../../utils/userSettingsService';
import NoFlightsWarningDialog from './dialogs/NoFlightsWarningDialog';
import { getAllStatuses, Status } from '../../utils/statusService';
import { getAllStandings, Standing } from '../../utils/standingService';
import { getAllRoles, Role } from '../../utils/roleService';
import { getAllQualifications, Qualification } from '../../utils/qualificationService';

// Define the structure for the polled attendance data
interface RealtimeAttendanceRecord {
  discord_id: string;
  response: 'accepted' | 'declined' | 'tentative';
  roll_call_response?: 'Present' | 'Absent' | 'Tentative';
}


interface MissionPreparationProps {
  onTransferToMission?: (flights: Flight[]) => void;
  assignedPilots?: AssignedPilotsRecord;
  onAssignedPilotsChange?: (pilots: AssignedPilotsRecord) => void;
  missionCommander?: MissionCommanderInfo | null;
  onMissionCommanderChange?: (commander: MissionCommanderInfo | null) => void;
  extractedFlights?: ExtractedFlight[];
  onExtractedFlightsChange?: (flights: ExtractedFlight[]) => void;
  prepFlights?: any[];
  onPrepFlightsChange?: (flights: any[]) => void;
}

const CARD_WIDTH = '605px';
const MISSION_DETAILS_WIDTH = '530px';
const AVAILABLE_PILOTS_WIDTH = '551px';
const FLIGHT_ASSIGNMENTS_WIDTH = '551px';

const MissionPreparation: React.FC<MissionPreparationProps> = ({ 
  onTransferToMission,
  assignedPilots: externalAssignedPilots,
  onAssignedPilotsChange,
  missionCommander: externalMissionCommander,
  onMissionCommanderChange,
  extractedFlights: externalExtractedFlights,
  onExtractedFlightsChange,
  prepFlights: externalPrepFlights,
  onPrepFlightsChange
}) => {
  const { setPageLoading } = usePageLoading();
  
  // Use custom hooks to manage data fetching and state
  const {
    events,
    selectedEvent,
    setSelectedEvent,
    activePilots,
    isLoading,
    loadError,
    allPilotQualifications,
    pilotSquadronMap,
    squadrons,
    refreshParticipatingSquadrons
  } = useMissionPrepData();

  // Clear page loading when component data is loaded
  useEffect(() => {
    if (!isLoading) {
      setPageLoading('mission-prep', false);
    }
  }, [isLoading, setPageLoading]);

  // Use database-backed state management first
  const {
    assignedPilots,
    setAssignedPilots,
    missionCommander,
    setMissionCommander,
    extractedFlights,
    prepFlights,
    setPrepFlights,
    mission,
    missionLoading,
    missionError,
    missionSaving,
    supportRoleCards,
    setSupportRoleCards,
    handleExtractedFlights: persistenceHandleExtractedFlights,
    updateMissionData,
    updateMissionSettings
  } = useMissionPrepDataPersistence(
    selectedEvent,
    externalAssignedPilots,
    externalMissionCommander,
    externalExtractedFlights,
    externalPrepFlights,
    activePilots
  );

  // Debug prepFlights changes in MissionPreparation
  // React.useEffect(() => {
  //   console.log('🔍 MissionPreparation: prepFlights changed:', {
  //     length: prepFlights?.length || 0,
  //     flights: prepFlights?.map(f => ({ id: f.id, callsign: f.callsign })) || []
  //   });
  //   console.log('🔍 MissionPreparation: Raw prepFlights value:', prepFlights);
  // }, [prepFlights]);

  const [realtimeAttendanceData, setRealtimeAttendanceData] = useState<RealtimeAttendanceRecord[]>([]);
  const [isAutoAssignConfigOpen, setIsAutoAssignConfigOpen] = useState(false);
  const [isTrainingEvent, setIsTrainingEvent] = useState(false);
  const [showNoFlightsDialog, setShowNoFlightsDialog] = useState(false);

  // Filter data state
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [qualificationsData, setQualificationsData] = useState<Qualification[]>([]);

  // Wrapper for setAssignedPilots to handle React setState signature
  const setAssignedPilotsWrapper = useCallback((
    pilots: AssignedPilotsRecord | ((prev: AssignedPilotsRecord) => AssignedPilotsRecord),
    skipSave: boolean = false
  ) => {
    
    if (typeof pilots === 'function') {
      // Handle function updates - get current value and call function
      const currentPilots = assignedPilots || {};
      const newPilots = pilots(currentPilots);
      setAssignedPilots(newPilots, skipSave);
    } else {
      setAssignedPilots(pilots, skipSave);
    }
  }, [assignedPilots, setAssignedPilots]);

  // Legacy state management for backwards compatibility
  const {
    resetProcessedFlag
  } = useMissionPrepState(
    assignedPilots,
    onAssignedPilotsChange,
    missionCommander,
    onMissionCommanderChange,
    extractedFlights,
    onExtractedFlightsChange,
    prepFlights,
    onPrepFlightsChange
  );

  // Fetch filter data on mount
  useEffect(() => {
    const fetchFilterData = async () => {
      try {
        const [statusesResult, standingsResult, rolesResult, qualificationsResult] = await Promise.all([
          getAllStatuses(),
          getAllStandings(),
          getAllRoles(),
          getAllQualifications()
        ]);
        setStatuses(statusesResult.data || []);
        setStandings(standingsResult.data || []);
        setRoles(rolesResult.data || []);
        setQualificationsData(qualificationsResult.data || []);
      } catch (error) {
        console.error('Error fetching filter data:', error);
      }
    };
    fetchFilterData();
  }, []);

  // Use custom hook for drag and drop functionality
  const { draggedPilot, dragSource, handleDragStart, handleDragEnd } = useDragDrop({
    missionCommander,
    setMissionCommander,
    assignedPilots,
    setAssignedPilots: setAssignedPilotsWrapper
  });

  // Get mission commander candidates with additional flight info
  const getMissionCommanderCandidatesWrapper = useCallback(() => {
    return getMissionCommanderCandidatesWithFlightInfo(assignedPilots);
  }, [assignedPilots]);

  // Update flights when FlightAssignments updates them
  const handleFlightsChange = useCallback((updatedFlights: any[], skipSave: boolean = false) => {
    setPrepFlights(updatedFlights, skipSave);
  }, [setPrepFlights]);

  // Clear all pilot assignments and the mission commander
  const handleClearAssignments = useCallback(() => {
    setAssignedPilots({});
    setMissionCommander(null);
  }, [setAssignedPilots, setMissionCommander]);

  // Clear pilot assignments for a specific flight
  const handleClearFlightAssignments = useCallback((flightId: string) => {
    // Also clear mission commander if they were in this flight
    if (missionCommander && missionCommander.flightId === flightId) {
      setMissionCommander(null);
    }

    // Clear the flight's assignments
    const updatedPilots = { ...assignedPilots };
    delete updatedPilots[flightId];
    setAssignedPilots(updatedPilots, false);
  }, [assignedPilots, setAssignedPilots, missionCommander, setMissionCommander]);

  // Handle step time changes and save to database
  const handleStepTimeChange = useCallback(async (stepTime: string) => {
    console.log('🕐 MissionPreparation: Saving step time to database:', {
      stepTime,
      missionId: mission?.id,
      hasMission: !!mission,
      hasUpdateFunction: !!updateMissionData
    });
    if (mission) {
      try {
        const result = await updateMissionData({ step_time: stepTime });
        console.log('✅ MissionPreparation: Step time saved successfully:', result);
        console.log('📊 MissionPreparation: Updated mission object:', mission);
      } catch (error) {
        console.error('❌ MissionPreparation: Failed to save step time:', error);
      }
    } else {
      console.warn('⚠️ MissionPreparation: Cannot save step time - no mission available');
    }
  }, [mission, updateMissionData]);

  // Function to handle showing auto-assignment settings
  const handleAutoAssignSettings = useCallback(() => {
    setIsAutoAssignConfigOpen(true);
  }, []);

  // Load auto-assignment configuration from user preferences
  const getStoredAutoAssignConfig = async (): Promise<AutoAssignConfig> => {
    try {
      const settingsResult = await getUserSettings();
      if (settingsResult.success && settingsResult.data?.preferences?.missionPrep?.autoAssignConfig) {
        const config = settingsResult.data.preferences.missionPrep.autoAssignConfig;
        return {
          assignmentScope: config.assignmentScope || 'clear',
          includeTentative: config.includeTentative || false,
          flightFillingPriority: config.flightFillingPriority || 'breadth',
          squadronCohesion: config.squadronCohesion || 'enforced',
          assignUnqualified: config.assignUnqualified || false,
          nonStandardCallsigns: config.nonStandardCallsigns || 'ignore',
          trainingMode: isTrainingEvent,
          ipToTraineeRatio: config.ipToTraineeRatio || '2:2',
          nonTraineeHandling: config.nonTraineeHandling || 'segregate'
        };
      }
    } catch (error) {
      console.warn('Failed to load auto-assign config from user preferences:', error);
    }
    return {
      assignmentScope: 'clear',
      includeTentative: false,
      flightFillingPriority: 'breadth',
      squadronCohesion: 'enforced',
      assignUnqualified: false,
      nonStandardCallsigns: 'ignore',
      trainingMode: isTrainingEvent,
      ipToTraineeRatio: '2:2',
      nonTraineeHandling: 'segregate'
    };
  };

  // Function to handle auto-assignment logic - uses saved settings directly
  const handleAutoAssign = useCallback(async (pilotsForAssignment?: Pilot[]) => {
    
    if (!prepFlights || prepFlights.length === 0) { 
      setShowNoFlightsDialog(true);
      return;
    }

    // Use the provided pilots directly. If none provided, auto-assign shouldn't run or should use a default set.
    const pilotsToAssign = pilotsForAssignment && pilotsForAssignment.length > 0 
      ? pilotsForAssignment 
      : []; // If no pilots are passed, assign no one.

    console.log('[AUTO-ASSIGN-DEBUG] MissionPreparation received pilots:', {
      providedCount: pilotsForAssignment?.length || 0,
      finalCount: pilotsToAssign.length,
      pilotsWithRollCall: pilotsToAssign.filter(p => p.rollCallStatus).map(p => ({ callsign: p.callsign, rollCall: p.rollCallStatus }))
    });

    if (pilotsToAssign.length === 0) {
      alert("No pilots available for assignment. Please ensure pilots are available and have appropriate attendance status.");
      return;
    }

    // Load configuration and execute assignment directly
    const config = await getStoredAutoAssignConfig();

    try {
      // Call the auto-assign function with configuration
      const { newAssignments, suggestedMissionCommander } = await autoAssignPilots(
        prepFlights,
        pilotsToAssign,
        assignedPilots,
        allPilotQualifications,
        config,
        pilotSquadronMap,
        selectedEvent?.cycleId // Pass cycle ID for training enrollment detection
      );


      // Update state with new assignments
      setAssignedPilots(newAssignments);
      
      // Set mission commander if one was determined
      if (suggestedMissionCommander) {
        setMissionCommander(suggestedMissionCommander);
      }
    } catch (error) {
      console.error('❌ MissionPreparation: Auto-assignment failed:', error);
      alert(`Auto-assignment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [prepFlights, selectedEvent?.id, setAssignedPilots, setMissionCommander, assignedPilots, allPilotQualifications, pilotSquadronMap]);


  // Handle settings modal cancellation
  const handleAutoAssignSettingsCancel = useCallback(() => {
    setIsAutoAssignConfigOpen(false);
  }, []);

  // Handle settings modal save
  const handleAutoAssignSettingsSave = useCallback((_config: AutoAssignConfig) => {
    setIsAutoAssignConfigOpen(false);
    // Configuration is already saved to sessionStorage by the modal
  }, []);

  // Reset the processed flag when component unmounts
  useEffect(() => {
    return () => {
      resetProcessedFlag();
    };
  }, [resetProcessedFlag]);

  // --- BEGIN NEW POLLING LOGIC ---
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    const fetchEventAttendance = async () => {
      if (!selectedEvent?.id) {
        setRealtimeAttendanceData([]);
        return;
      }
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/events/${selectedEvent.id}/attendance`);
        if (!response.ok) {
          throw new Error(`Failed to fetch attendance: ${response.statusText}`);
        }
        const data = await response.json();

        // Transform data into the RealtimeAttendanceRecord format
        const attendanceRecords: RealtimeAttendanceRecord[] = [
          ...data.accepted.map((attendee: any) => ({ discord_id: attendee.discord_id, response: 'accepted' })),
          ...data.tentative.map((attendee: any) => ({ discord_id: attendee.discord_id, response: 'tentative' })),
          ...data.declined.map((attendee: any) => ({ discord_id: attendee.discord_id, response: 'declined' }))
        ].filter(record => record.discord_id);

        // Debug the attendance data update
        const dsrmRecord = attendanceRecords.find(record => {
          return activePilots?.find(pilot => {
            // Use discord_id (numeric ID) for matching attendance data
            const discordId = pilot.discord_id;
            return discordId === record.discord_id && pilot.callsign === 'DSRM';
          });
        });
        if (dsrmRecord) {
          console.log(`[POLLING-DEBUG] Updated attendance data for DSRM:`, dsrmRecord);
        }
        
        setRealtimeAttendanceData(attendanceRecords);
        
        // Also refresh participating squadrons cache silently
        if (refreshParticipatingSquadrons) {
          refreshParticipatingSquadrons();
        }
      } catch (err) {
        console.error("Error fetching realtime attendance:", err);
        setRealtimeAttendanceData([]);
      }
    };

    // Initial fetch
    fetchEventAttendance();

    // Set up polling every 5 seconds
    pollInterval = setInterval(fetchEventAttendance, 5000);

    // Clean up interval when component unmounts or event changes
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [selectedEvent?.id]);
  // --- END NEW POLLING LOGIC ---

  // Detect if selected event is a training event
  useEffect(() => {
    const detectTrainingEvent = async () => {
      if (!selectedEvent?.cycleId) {
        setIsTrainingEvent(false);
        return;
      }

      try {
        const { supabase } = await import('../../utils/supabaseClient');
        const { data, error } = await supabase
          .from('cycles')
          .select('type')
          .eq('id', selectedEvent.cycleId)
          .single();

        if (!error && data) {
          setIsTrainingEvent(data.type === 'Training');
        } else {
          setIsTrainingEvent(false);
        }
      } catch (err) {
        console.error('Error detecting training event:', err);
        setIsTrainingEvent(false);
      }
    };

    detectTrainingEvent();
  }, [selectedEvent?.cycleId]);

  // --- BEGIN EFFECT TO UPDATE ASSIGNED PILOTS ---
  useEffect(() => {
    // Check if realtimeAttendanceData is available
    if (!realtimeAttendanceData || realtimeAttendanceData.length === 0) {
      // If no attendance data, clear any existing statuses from assignedPilots
      const hasAssignedPilots = Object.keys(assignedPilots).length > 0;
      let needsClearing = false;
      const clearedAssignments: Record<string, AssignedPilot[]> = {};

      for (const flightId in assignedPilots) {
        const originalFlightPilots = assignedPilots[flightId];
        let flightNeedsClearing = false;
        const clearedFlightPilots = originalFlightPilots.map(pilot => {
          // Only clear attendanceStatus (from Discord), preserve rollCallStatus (from roll call buttons)
          if (pilot.attendanceStatus !== undefined) {
            flightNeedsClearing = true;
            // Return a new pilot object with only attendanceStatus cleared
            return { ...pilot, attendanceStatus: undefined };
          }
          // Otherwise, return the original pilot object
          return pilot;
        });

        // If this flight needed clearing, use the new array; otherwise, use the original
        clearedAssignments[flightId] = flightNeedsClearing ? clearedFlightPilots : originalFlightPilots;
        if (flightNeedsClearing) {
          needsClearing = true; // Mark that at least one flight was modified
        }
      }

      // Only update state if there were assignments and clearing was needed
      // IMPORTANT: Use functional update to preserve support roles that might not be in the effect's closure
      if (hasAssignedPilots && needsClearing) {
        // console.log("[TENTATIVE-DEBUG] Clearing stale attendance statuses from assignedPilots state.");
        setAssignedPilotsWrapper((currentPilots) => {
          // Merge: preserve any keys from current state (like support roles) that weren't in the clearing loop
          const merged = { ...currentPilots };
          for (const flightId in clearedAssignments) {
            merged[flightId] = clearedAssignments[flightId];
          }
          return merged;
        }, true); // skipSave = true for attendance clearing
      }
      return; // Stop processing since there's no attendance data
    }

    // --- Process updates when realtimeAttendanceData is present ---
    let needsOverallUpdate = false;
    // Start with a shallow copy of the top-level object for potential modification
    const nextAssignedPilots: Record<string, AssignedPilot[]> = { ...assignedPilots };

    for (const flightId in assignedPilots) {
      let flightNeedsUpdate = false;
      const originalFlightPilots = assignedPilots[flightId];
      // Map to potentially create a new array for the flight
      const updatedFlightPilots = originalFlightPilots.map(pilot => {
        // Use discord_id (numeric ID) for matching attendance data
        const discordId = (pilot as any).discord_id;
        // Find the realtime status for this pilot
        const realtimeRecord = discordId ? realtimeAttendanceData.find(record => record.discord_id === discordId) : undefined;
        
        // Get Discord attendance status from the record
        const realtimeStatus = realtimeRecord?.response; // 'accepted', 'tentative', or 'declined'
        
        // Get roll call status from the record - DO NOT USE THIS for updating state, only for potential logging if needed
        // const rollCallStatus = realtimeRecord?.roll_call_response; 

        // Determine the new Discord status based on the record
        let newDiscordStatus: 'accepted' | 'tentative' | 'declined' | undefined = undefined; // ADDED 'declined'
        if (realtimeStatus === 'tentative') {
          newDiscordStatus = 'tentative';
        } else if (realtimeStatus === 'accepted') {
          newDiscordStatus = 'accepted';
        } else if (realtimeStatus === 'declined') { // ADDED handling for 'declined'
          newDiscordStatus = 'declined';
        }
        
        let shouldUpdatePilot = false;
        let updatedPilot = { ...pilot }; 

        // Compare current Discord attendance status with the new one
        if (updatedPilot.attendanceStatus !== newDiscordStatus) {
          // console.log(`[TENTATIVE-DEBUG] Updating ${pilot.callsign} Discord status in flight ${flightId} from ${updatedPilot.attendanceStatus} to ${newDiscordStatus}`);
          updatedPilot.attendanceStatus = newDiscordStatus;
          shouldUpdatePilot = true;
        }

        // If ONLY Discord status changed, return the modified pilot object
        if (shouldUpdatePilot) {
          flightNeedsUpdate = true; 
          return updatedPilot; 
        }
        return pilot; 
      });

      // If any pilot in this flight was updated, replace the flight's array in our copied object
      if (flightNeedsUpdate) {
        nextAssignedPilots[flightId] = updatedFlightPilots; // Assign the newly created array
        needsOverallUpdate = true; // Mark that the top-level object has changed
      }
    }

    // If any flight array was replaced, update the state with the new top-level object
    // IMPORTANT: Only update the flight keys that changed, preserving any other keys (like support roles)
    // that might have been added by other effects running in the same render cycle
    if (needsOverallUpdate) {
      // console.log("[TENTATIVE-DEBUG] Applying updated attendance statuses to assignedPilots state.");
      // Use functional update to get the latest state and only merge the updated flights
      // Pass skipSave: true since this is just an attendance status update, not a structural change
      setAssignedPilotsWrapper((currentPilots) => {
        // Merge: start with current state (which may include support roles added by other effects)
        // and only override the flight keys that had attendance updates
        const merged = { ...currentPilots };
        for (const flightId in nextAssignedPilots) {
          // Only update keys that exist in both and had changes
          if (flightId in assignedPilots) {
            merged[flightId] = nextAssignedPilots[flightId];
          }
        }
        return merged;
      }, true); // skipSave = true for attendance updates
    }
  }, [realtimeAttendanceData, assignedPilots, setAssignedPilotsWrapper]);
  // --- END EFFECT TO UPDATE ASSIGNED PILOTS ---

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToWindowEdges]} 
    >
      <div style={{
          backgroundColor: '#F0F4F8',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '20px',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}>
        {/* Mission Status Indicator */}
        {(missionLoading || missionSaving || missionError) && (
          <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '14px',
            zIndex: 1000,
            backgroundColor: missionError ? '#FEE2E2' : missionSaving ? '#FEF3C7' : '#DBEAFE',
            color: missionError ? '#B91C1C' : missionSaving ? '#92400E' : '#1E40AF',
            border: `1px solid ${missionError ? '#FCA5A5' : missionSaving ? '#FCD34D' : '#93C5FD'}`
          }}>
            {missionError ? `Mission Error: ${missionError}` :
             missionSaving ? 'Saving mission...' :
             missionLoading ? 'Loading mission...' : ''}
          </div>
        )}

        <div style={{
            display: 'flex',
            gap: '20px',
            height: 'calc(100vh - 40px)',
            position: 'relative',
            zIndex: 1,
            maxWidth: '2240px',
            width: 'min(100%, 2240px)',
            boxSizing: 'border-box',
            justifyContent: 'center',
            overflow: 'visible'
          }}>
          {isLoading ? (
            <StandardPageLoader message="Loading pilots data..." />
          ) : loadError ? (
            <div className="flex items-center justify-center w-full">
              <p className="text-red-500">{loadError}</p>
            </div>
          ) : (
            <>
              <MissionDetails
                width={MISSION_DETAILS_WIDTH}
                events={events}
                selectedEvent={selectedEvent}
                onEventSelect={setSelectedEvent}
                missionCommander={missionCommander}
                getMissionCommanderCandidates={getMissionCommanderCandidatesWrapper}
                setMissionCommander={setMissionCommander}
                onExtractedFlights={persistenceHandleExtractedFlights}
                onStepTimeChange={handleStepTimeChange}
                mission={mission}
                updateMissionData={updateMissionData}
                prepFlights={prepFlights}
                onClearAssignments={handleClearAssignments}
              />
              <AvailablePilots
                width={AVAILABLE_PILOTS_WIDTH}
                pilots={activePilots}
                selectedEvent={selectedEvent}
                assignedPilots={assignedPilots}
                setAssignedPilots={setAssignedPilotsWrapper}
                onAutoAssign={handleAutoAssign}
                onAutoAssignSettings={handleAutoAssignSettings}
                onClearAssignments={handleClearAssignments}
                pilotQualifications={allPilotQualifications}
                realtimeAttendanceData={realtimeAttendanceData}
                squadrons={squadrons as any}
                statuses={statuses}
                standings={standings}
                roles={roles}
                qualifications={qualificationsData}
              />
              <FlightAssignments
                width={FLIGHT_ASSIGNMENTS_WIDTH}
                assignedPilots={assignedPilots}
                missionCommander={missionCommander}
                extractedFlights={extractedFlights}
                onFlightsChange={handleFlightsChange}
                initialFlights={prepFlights}
                onClearAssignments={handleClearAssignments}
                onClearFlightAssignments={handleClearFlightAssignments}
                mission={mission}
                selectedEvent={selectedEvent}
              />              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                width: CARD_WIDTH,
                height: '100%'
              }}>
                <MissionSupportAssignments
                  width={CARD_WIDTH}
                  assignedPilots={assignedPilots}
                  setAssignedPilots={setAssignedPilotsWrapper}
                  supportRoleCards={supportRoleCards}
                  setSupportRoleCards={setSupportRoleCards}
                />
                <Communications
                  width={CARD_WIDTH}
                  assignedPilots={assignedPilots}
                  onTransferToMission={onTransferToMission}
                  flights={prepFlights}
                  extractedFlights={extractedFlights}
                  squadrons={squadrons as any}
                  updateMissionSettings={updateMissionSettings}
                  mission={mission}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <DragOverlay 
        dropAnimation={null} 
        modifiers={[restrictToWindowEdges]}
        zIndex={9999}
      >
        <PilotDragOverlay 
          draggedPilot={draggedPilot} 
          dragSource={dragSource} 
        />
      </DragOverlay>

      {/* Auto-Assignment Configuration Modal */}
      <AutoAssignConfigModal
        isOpen={isAutoAssignConfigOpen}
        onCancel={handleAutoAssignSettingsCancel}
        onSave={handleAutoAssignSettingsSave}
        isTrainingEvent={isTrainingEvent}
      />

      {/* No Flights Warning Dialog */}
      {showNoFlightsDialog && (
        <NoFlightsWarningDialog
          onClose={() => setShowNoFlightsDialog(false)}
        />
      )}
    </DndContext>
  );
};

export default MissionPreparation;
