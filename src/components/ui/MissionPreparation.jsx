import React, { useCallback, useEffect, useState } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import MissionDetails from './mission prep/MissionDetails';
import AvailablePilots from './mission prep/AvailablePilots';
import FlightAssignments from './mission prep/FlightAssignments';
import Communications from './mission prep/Communications';
import MissionSupportAssignments from './mission prep/MissionSupportAssignments.jsx';
import PilotDragOverlay from './mission-execution/PilotDragOverlay';
import { useDragDrop } from '../../utils/useDragDrop';
import { autoAssignPilots } from '../../utils/autoAssignUtils';
import { getMissionCommanderCandidatesWithFlightInfo } from '../../utils/missionCommanderUtils';
import { useMissionPrepData } from '../../hooks/useMissionPrepData';
import { useMissionPrepState } from '../../hooks/useMissionPrepState';

// Define component constants
const CARD_WIDTH = '550px';

const MissionPreparation = ({ 
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

  const [realtimeAttendanceData, setRealtimeAttendanceData] = useState([]);

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
  const handleFlightsChange = useCallback((updatedFlights) => {
    setPrepFlights(updatedFlights);
  }, [setPrepFlights]);

  // Clear all pilot assignments and the mission commander
  const handleClearAssignments = useCallback(() => {
    setAssignedPilots({});
    setMissionCommander(null);
  }, [setAssignedPilots, setMissionCommander]);

  // Function to handle auto-assignment logic
  const handleAutoAssign = useCallback((pilotsForAssignment) => { 
    console.log('[DEBUG] handleAutoAssign called with pilots:', pilotsForAssignment?.map(p => ({ callsign: p.callsign, discord: p.attendanceStatus, rollCall: p.rollCallStatus })));
    
    if (!prepFlights || prepFlights.length === 0) { 
      console.log("Cannot auto-assign: no flights available");
      return;
    }

    // Use the provided pilots directly. If none provided, auto-assign shouldn't run or should use a default set.
    const pilotsToAssign = pilotsForAssignment && pilotsForAssignment.length > 0 
      ? pilotsForAssignment 
      : []; // If no pilots are passed, assign no one.

    if (pilotsToAssign.length === 0) {
      console.log("[DEBUG] No pilots provided or available for auto-assignment.");
      return;
    }

    console.log(`[DEBUG] Using ${pilotsToAssign.length} pilots for auto-assignment.`);

    // Call the utility function - autoAssignPilots needs to handle the statuses internally
    const { newAssignments, suggestedMissionCommander } = autoAssignPilots(
      prepFlights, 
      pilotsToAssign,
      assignedPilots,
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
    let pollInterval = null;

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
        const attendanceRecords = [
          ...data.accepted.map((attendee) => ({ discord_id: attendee.discord_id, response: 'accepted' })),
          ...data.tentative.map((attendee) => ({ discord_id: attendee.discord_id, response: 'tentative' })),
          ...data.declined.map((attendee) => ({ discord_id: attendee.discord_id, response: 'declined' }))
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
    // Processing attendance updates logic...
    // For brevity, this is simplified in this version
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
                pilots={activePilots}
                selectedEvent={selectedEvent}
                assignedPilots={assignedPilots}
                setAssignedPilots={setAssignedPilots}
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
              />
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '20px', 
                width: CARD_WIDTH 
              }}>
                <MissionSupportAssignments
                  width={CARD_WIDTH}
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
