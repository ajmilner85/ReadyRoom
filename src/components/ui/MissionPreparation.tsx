// filepath: c:\Users\ajmil\OneDrive\Desktop\pri-fly\src\components\ui\MissionPreparationRefactored.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import MissionDetails from './mission prep/MissionDetails';
import AvailablePilots from './mission prep/AvailablePilots';
import FlightAssignments from './mission prep/FlightAssignments';
import Communications from './mission prep/Communications';
import PilotDragOverlay from './mission-execution/PilotDragOverlay';
import type { Flight, ExtractedFlight } from '../../types/FlightData';
import type { MissionCommanderInfo } from '../../types/MissionCommanderTypes';
import type { Pilot } from '../../types/PilotTypes'; // Ensure Pilot is imported if not already
import { useDragDrop } from '../../utils/useDragDrop';
import type { Event } from '../../types/EventTypes'; // Ensure Event type is imported
import { autoAssignPilots } from '../../utils/autoAssignUtils';
import { getMissionCommanderCandidatesWithFlightInfo } from '../../utils/missionCommanderUtils';
import { useMissionPrepData } from '../../hooks/useMissionPrepData';
import { useMissionPrepState } from '../../hooks/useMissionPrepState';

// Define the structure for the polled attendance data
interface RealtimeAttendanceRecord {
  discord_id: string;
  response: 'accepted' | 'declined' | 'tentative';
  roll_call_response?: 'Present' | 'Absent' | 'Tentative';
}

interface AssignedPilot extends Pilot {
  dashNumber: string;
  attendanceStatus?: 'accepted' | 'tentative'; // Discord attendance status
  rollCallStatus?: 'Present' | 'Absent' | 'Tentative'; // Roll call attendance status
}

interface MissionPreparationProps {
  onTransferToMission?: (flights: Flight[]) => void;
  assignedPilots?: Record<string, AssignedPilot[]>;
  onAssignedPilotsChange?: (pilots: Record<string, AssignedPilot[]>) => void;
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
  // Use custom hook to manage state
  const {
    assignedPilots,
    setAssignedPilots,
    missionCommander,
    setMissionCommander,
    extractedFlights,
    prepFlights,
    setPrepFlights,
    handleExtractedFlights,
    resetProcessedFlag
  } = useMissionPrepState(
    externalAssignedPilots,
    onAssignedPilotsChange,
    externalMissionCommander,
    onMissionCommanderChange,
    externalExtractedFlights,
    onExtractedFlightsChange,
    externalPrepFlights,
    onPrepFlightsChange
  );

  const [realtimeAttendanceData, setRealtimeAttendanceData] = useState<RealtimeAttendanceRecord[]>([]);

  // Use custom hook for drag and drop functionality
  const { draggedPilot, dragSource, handleDragStart, handleDragEnd } = useDragDrop({
    missionCommander,
    setMissionCommander,
    assignedPilots,
    setAssignedPilots
  });

  // Get mission commander candidates with additional flight info
  const getMissionCommanderCandidatesWrapper = useCallback(() => {
    return getMissionCommanderCandidatesWithFlightInfo(assignedPilots);
  }, [assignedPilots]);

  // Update flights when FlightAssignments updates them
  const handleFlightsChange = useCallback((updatedFlights: any[]) => {
    setPrepFlights(updatedFlights);
  }, [setPrepFlights]);

  // Clear all pilot assignments and the mission commander
  const handleClearAssignments = useCallback(() => {
    setAssignedPilots({});
    setMissionCommander(null);
  }, [setAssignedPilots, setMissionCommander]);  // Function to handle auto-assignment logic
  const handleAutoAssign = useCallback((attendingPilotInfo?: { id: string; status: 'accepted' | 'tentative' }[]) => { // Updated signature
    console.log('[DEBUG] handleAutoAssign called with:', attendingPilotInfo);
    if (!prepFlights || prepFlights.length === 0) { // Use prepFlights from state
      console.log("Cannot auto-assign: no flights available");
      return;
    }

    // Filter available pilots based on the provided attendingPilotInfo
    let pilotsToAssign = activePilots; // Start with all active pilots

    if (attendingPilotInfo && attendingPilotInfo.length > 0) {
      console.log("[DEBUG] Filtering pilots by attendance info:", attendingPilotInfo);
      pilotsToAssign = activePilots.filter(p => {
        // Prefer UUID (p.id) if available, fallback to discordId or boardNumber
        const pilotIdentifier = p.id || p.discordId || (p as any).discord_original_id || p.boardNumber;
        if (!pilotIdentifier) return false; // Cannot assign if no identifier

        const attendance = attendingPilotInfo.find(info => info.id === pilotIdentifier);
        // Include only pilots marked as 'accepted' or 'tentative'
        return attendance && (attendance.status === 'accepted' || attendance.status === 'tentative');
      }).map(p => {
        // Add the attendance status to the pilot object for sorting/assignment logic
        const pilotIdentifier = p.id || p.discordId || (p as any).discord_original_id || p.boardNumber;
        const attendance = attendingPilotInfo.find(info => info.id === pilotIdentifier);
        return {
          ...p,
          attendanceStatus: attendance?.status as 'accepted' | 'tentative' | undefined
        };
      });
      console.log(`[DEBUG] Filtered ${pilotsToAssign.length} pilots for auto-assignment based on attendance.`);
    } else {
       console.log("[DEBUG] No attendance info provided to handleAutoAssign, using all active pilots.");
       // Ensure attendanceStatus is undefined if no specific info is passed
       pilotsToAssign = activePilots.map(p => ({ ...p, attendanceStatus: undefined }));
    }


    // Call the utility function
    const { newAssignments, suggestedMissionCommander } = autoAssignPilots(
      prepFlights, // Use prepFlights from state
      pilotsToAssign, // Use the filtered list
      assignedPilots,
      allPilotQualifications
    );

    // Update state
    setAssignedPilots(newAssignments);
    if (suggestedMissionCommander) {
      setMissionCommander(suggestedMissionCommander);
    }
  }, [prepFlights, activePilots, assignedPilots, allPilotQualifications, setAssignedPilots, setMissionCommander]); // Added prepFlights dependency


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
        const response = await fetch(`http://localhost:3001/api/events/${selectedEvent.id}/attendance`);
        if (!response.ok) {
          throw new Error(`Failed to fetch attendance: ${response.statusText}`);
        }
        const data = await response.json();

        // Transform data into the RealtimeAttendanceRecord format
        const attendanceRecords: RealtimeAttendanceRecord[] = [
          ...data.accepted.map((attendee: any) => ({ discord_id: attendee.discord_id, response: 'accepted' })),
          ...data.tentative.map((attendee: any) => ({ discord_id: attendee.discord_id, response: 'tentative' })),
          ...data.declined.map((attendee: any) => ({ discord_id: attendee.discord_id, response: 'declined' }))
        ].filter(record => record.discord_id); // Filter out any without discord_id

        setRealtimeAttendanceData(attendanceRecords);
      } catch (err) {
        console.error("Error fetching realtime attendance:", err);
        setRealtimeAttendanceData([]); // Clear data on error
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
  }, [selectedEvent?.id]); // Re-run polling if the selected event ID changes
  // --- END NEW POLLING LOGIC ---

  // --- BEGIN EFFECT TO UPDATE ASSIGNED PILOTS ---
  useEffect(() => {
    if (realtimeAttendanceData.length === 0 || Object.keys(assignedPilots).length === 0) {
      return; // No attendance data or no assignments to update
    }

    let needsUpdate = false;
    const updatedAssignments: Record<string, AssignedPilot[]> = {};    // Iterate through existing assignments
    for (const flightId in assignedPilots) {
      updatedAssignments[flightId] = assignedPilots[flightId].map(pilot => {
        const discordId = pilot.discordId || (pilot as any).discord_original_id || (pilot as any).discord_id;
        if (!discordId) return pilot; // Cannot update if no discord ID

        // Find the realtime status for this pilot
        const realtimeRecord = realtimeAttendanceData.find(record => record.discord_id === discordId);
        
        // Get Discord attendance status
        const realtimeStatus = realtimeRecord?.response; // 'accepted', 'tentative', or undefined if not found/declined
        
        // Get roll call status if available
        const rollCallStatus = realtimeRecord?.roll_call_response;

        // Determine the status to set (default to 'accepted' if attending but not tentative)
        let newStatus: 'accepted' | 'tentative' | undefined = undefined;
        if (realtimeStatus === 'tentative') {
          newStatus = 'tentative';
        } else if (realtimeStatus === 'accepted') {
          newStatus = 'accepted';
        }
        // Pilots who declined or are not in the list will have undefined status        // Track if we need to update the pilot's data
        let shouldUpdatePilot = false;
        let updatedPilot = { ...pilot };
        
        // Compare Discord attendance status and update if different
        if (updatedPilot.attendanceStatus !== newStatus) {
          console.log(`[TENTATIVE-DEBUG] Updating ${pilot.callsign} Discord status in flight ${flightId} from ${updatedPilot.attendanceStatus} to ${newStatus}`);
          updatedPilot.attendanceStatus = newStatus;
          shouldUpdatePilot = true;
        }
        
        // Check if roll call status needs updating
        if (rollCallStatus && updatedPilot.rollCallStatus !== rollCallStatus) {
          console.log(`[ROLL-CALL-DEBUG] Updating ${pilot.callsign} Roll Call status in flight ${flightId} from ${updatedPilot.rollCallStatus} to ${rollCallStatus}`);
          updatedPilot.rollCallStatus = rollCallStatus;
          shouldUpdatePilot = true;
        }
        
        // Check if roll call status needs updating
        if (rollCallStatus && updatedPilot.rollCallStatus !== rollCallStatus) {
          console.log(`[TENTATIVE-DEBUG] Updating ${pilot.callsign} Roll Call status in flight ${flightId} from ${updatedPilot.rollCallStatus} to ${rollCallStatus}`);
          updatedPilot.rollCallStatus = rollCallStatus;
          shouldUpdatePilot = true;
        }
        
        if (shouldUpdatePilot) {
          needsUpdate = true;
          return updatedPilot;
        }
        return pilot; // No change needed
      });
    }

    // If any pilot's status changed, update the state
    if (needsUpdate) {
      console.log("[TENTATIVE-DEBUG] Applying updated attendance statuses to assignedPilots state.");
      setAssignedPilots(updatedAssignments);
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
                pilots={activePilots} // Use activePilots from useMissionPrepData
                selectedEvent={selectedEvent}
                assignedPilots={assignedPilots}
                onAutoAssign={handleAutoAssign} // Pass the updated handler
                onClearAssignments={handleClearAssignments}
                pilotQualifications={allPilotQualifications}
                realtimeAttendanceData={realtimeAttendanceData} // Pass down polled data
              />
              <FlightAssignments
                width={CARD_WIDTH} 
                assignedPilots={assignedPilots}
                missionCommander={missionCommander}
                extractedFlights={extractedFlights}
                onFlightsChange={handleFlightsChange}
                initialFlights={prepFlights}
              />
              <Communications 
                width={CARD_WIDTH} 
                assignedPilots={assignedPilots}
                onTransferToMission={onTransferToMission}
                flights={prepFlights}
                extractedFlights={extractedFlights}
              />
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
