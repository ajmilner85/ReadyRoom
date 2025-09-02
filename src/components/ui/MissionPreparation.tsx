import React, { useCallback, useEffect, useState } from 'react';
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

const CARD_WIDTH = '550px';

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
  // Use custom hooks to manage data fetching and state
  const {
    events,
    selectedEvent,
    setSelectedEvent,
    activePilots,
    isLoading,
    loadError,
    allPilotQualifications
  } = useMissionPrepData();

  // Use database-backed state management first
  const {
    assignedPilots,
    setAssignedPilots,
    missionCommander,
    setMissionCommander,
    extractedFlights,
    prepFlights,
    setPrepFlights,
    missionLoading,
    missionError,
    missionSaving
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

  // Wrapper for setAssignedPilots to handle React setState signature
  const setAssignedPilotsWrapper = useCallback((pilots: AssignedPilotsRecord | ((prev: AssignedPilotsRecord) => AssignedPilotsRecord)) => {
    console.log('🔄 MissionPreparation: setAssignedPilotsWrapper called:', { 
      isFunction: typeof pilots === 'function',
      currentAssignedPilots: JSON.stringify(assignedPilots)
    });
    
    if (typeof pilots === 'function') {
      // Handle function updates - get current value and call function
      const currentPilots = assignedPilots || {};
      const newPilots = pilots(currentPilots);
      console.log('💾 MissionPreparation: Calling setAssignedPilots with function result:', {
        newPilots: JSON.stringify(newPilots),
        skipSave: false
      });
      setAssignedPilots(newPilots, false); // false = don't skip save for user actions
    } else {
      console.log('💾 MissionPreparation: Calling setAssignedPilots with direct value:', {
        pilots: JSON.stringify(pilots),
        skipSave: false
      });
      setAssignedPilots(pilots, false); // false = don't skip save for user actions
    }
  }, [assignedPilots, setAssignedPilots]);

  // Legacy state management for backwards compatibility
  const {
    handleExtractedFlights,
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

  // Function to handle auto-assignment logic
  const handleAutoAssign = useCallback((pilotsForAssignment?: Pilot[]) => { 
    if (!prepFlights || prepFlights.length === 0) { 
      // console.log("Cannot auto-assign: no flights available");
      return;
    }

    // Use the provided pilots directly. If none provided, auto-assign shouldn't run or should use a default set.
    const pilotsToAssign = pilotsForAssignment && pilotsForAssignment.length > 0 
      ? pilotsForAssignment 
      : []; // If no pilots are passed, assign no one.

    if (pilotsToAssign.length === 0) {
      // console.log("[DEBUG] No pilots provided or available for auto-assignment.");
      return;
    }

    // Call the utility function - autoAssignPilots needs to handle the statuses internally
    const { newAssignments, suggestedMissionCommander } = autoAssignPilots(
      prepFlights, 
      pilotsToAssign, // Pass the prepared list with statuses
      assignedPilots, // Pass current assignments for context
      allPilotQualifications
    );

    // Update state
    setAssignedPilots(newAssignments);
    if (suggestedMissionCommander) {
      setMissionCommander(suggestedMissionCommander);
    }
  }, [prepFlights, assignedPilots, allPilotQualifications, setAssignedPilots, setMissionCommander]);

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

        setRealtimeAttendanceData(attendanceRecords);
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
          // If either status exists, it needs clearing
          if (pilot.attendanceStatus !== undefined || pilot.rollCallStatus !== undefined) {
            flightNeedsClearing = true;
            // Return a new pilot object with statuses cleared
            return { ...pilot, attendanceStatus: undefined, rollCallStatus: undefined };
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
      if (hasAssignedPilots && needsClearing) {
        // console.log("[TENTATIVE-DEBUG] Clearing stale attendance statuses from assignedPilots state.");
        setAssignedPilots(clearedAssignments); // Update with the potentially modified object
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
        const discordId = pilot.discordId || (pilot as any).discord_original_id || (pilot as any).discord_id;
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
    if (needsOverallUpdate) {
      // console.log("[TENTATIVE-DEBUG] Applying updated attendance statuses to assignedPilots state.");
      setAssignedPilots(nextAssignedPilots, true); // Skip database save - this is just attendance status update
    }
  }, [realtimeAttendanceData, assignedPilots, setAssignedPilots]);
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
          padding: '20px 20px 20px 20px',
          boxSizing: 'border-box',
          overflow: 'visible'
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
            height: 'calc(100vh - 20px)', 
            position: 'relative',
            zIndex: 1,
            maxWidth: '2240px',
            width: 'min(100%, 2240px)',
            boxSizing: 'border-box',
            justifyContent: 'center',
            overflowX: 'auto',
            overflowY: 'visible',
            padding: '15px',
            margin: '-15px',
          }}>
          {isLoading ? (
            <div className="flex items-center justify-center w-full">
              <p className="text-lg">Loading pilots data...</p>
            </div>
          ) : loadError ? (
            <div className="flex items-center justify-center w-full">
              <p className="text-red-500">{loadError}</p>
            </div>
          ) : (
            <>
              <MissionDetails 
                width={CARD_WIDTH} 
                events={events} 
                selectedEvent={selectedEvent}
                onEventSelect={setSelectedEvent}
                missionCommander={missionCommander}
                getMissionCommanderCandidates={getMissionCommanderCandidatesWrapper}
                setMissionCommander={setMissionCommander}
                onExtractedFlights={handleExtractedFlights}
              />
              <AvailablePilots
                width={CARD_WIDTH}
                pilots={activePilots}
                selectedEvent={selectedEvent}
                assignedPilots={assignedPilots}
                setAssignedPilots={setAssignedPilotsWrapper}
                onAutoAssign={handleAutoAssign}
                onClearAssignments={handleClearAssignments}
                pilotQualifications={allPilotQualifications}
                realtimeAttendanceData={realtimeAttendanceData}
              />
              <FlightAssignments
                width={CARD_WIDTH} 
                assignedPilots={assignedPilots}
                missionCommander={missionCommander}
                extractedFlights={extractedFlights}
                onFlightsChange={handleFlightsChange}
                initialFlights={prepFlights}
              />              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '20px', 
                width: CARD_WIDTH,
                height: '100%' // Ensure the container takes full height
              }}>
                <MissionSupportAssignments
                  width={CARD_WIDTH}
                  assignedPilots={assignedPilots}
                  setAssignedPilots={setAssignedPilotsWrapper}
                />
                <Communications 
                  width={CARD_WIDTH} 
                  assignedPilots={assignedPilots}
                  onTransferToMission={onTransferToMission}
                  flights={prepFlights}
                  extractedFlights={extractedFlights}
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
    </DndContext>
  );
};

export default MissionPreparation;
