import { useState, useEffect, useCallback, useRef } from 'react';
import { useMission } from './useMission';
import type { AssignedPilotsRecord } from '../types/MissionPrepTypes';
import type { MissionCommanderInfo } from '../types/MissionCommanderTypes';
import type { Event } from '../types/EventTypes';
import type { MissionFlight, PilotAssignment, SupportRoleAssignment } from '../types/MissionTypes';

/**
 * Hook that bridges the existing mission prep state management with database persistence
 * This replaces localStorage with database operations while maintaining the same interface
 */
export const useMissionPrepDataPersistence = (
  selectedEvent: Event | null,
  // Optional external state for compatibility with existing code
  externalAssignedPilots?: AssignedPilotsRecord,
  externalMissionCommander?: MissionCommanderInfo | null,
  externalExtractedFlights?: any[],
  externalPrepFlights?: any[],
  activePilots?: any[],
) => {
  const {
    mission,
    loading: missionLoading,
    error: missionError,
    saving: missionSaving,
    updateFlights,
    updatePilotAssignments,
    updateSupportRoles,
    updateSelectedSquadrons,
    updateSettings,
    updateMissionData,
    createNewMission
  } = useMission(undefined, selectedEvent?.id);

  // Local state that syncs with mission database
  const [assignedPilots, setAssignedPilotsLocal] = useState<AssignedPilotsRecord>(
    externalAssignedPilots || {}
  );
  const [missionCommander, setMissionCommanderLocal] = useState<MissionCommanderInfo | null>(
    externalMissionCommander || null
  );
  const [extractedFlights, setExtractedFlights] = useState<any[]>(
    externalExtractedFlights || []
  );
  const [prepFlights, setPrepFlightsLocal] = useState<any[]>(
    externalPrepFlights || []
  );
  const [needsMissionCreation, setNeedsMissionCreation] = useState<boolean>(false);

  // Debug prepFlights changes
  // useEffect(() => {
  //   console.log('🔄 Persistence: prepFlights state changed:', {
  //     length: prepFlights?.length || 0,
  //     flights: prepFlights?.map(f => ({ id: f.id, callsign: f.callsign })) || []
  //   });
  // }, [prepFlights]);

  // Add a flag to prevent circular updates during saves
  const [isSyncing, setIsSyncing] = useState(false);

  // Track the last sync to prevent circular updates
  const [lastSyncMissionId, setLastSyncMissionId] = useState<string | null>(null);
  const [lastSyncEventId, setLastSyncEventId] = useState<string | null>(null);

  // Clear state when switching events
  useEffect(() => {
    // Clear state whenever the selectedEvent changes, regardless of mission state
    setAssignedPilotsLocal({});
    setMissionCommanderLocal(null);
    setPrepFlightsLocal([]);
    setExtractedFlights([]);
    setHasPendingChanges(false);
    setIsSyncing(false);
    setLastSyncMissionId(null);
    setLastSyncEventId(null);
  }, [selectedEvent?.id]);

  // Sync state with mission data when mission loads - ONLY run once per mission/event combination
  useEffect(() => {
    // Skip if no mission, still syncing, or mission still loading
    if (!mission || isSyncing || missionLoading) {
      return;
    }
    
    // Skip sync if there are pending changes to avoid overwriting user updates
    if (hasPendingChanges) {
      console.log('🚫 Persistence: Skipping sync - pending changes detected');
      return;
    }
    
    // If activePilots is not available but we have pilot assignments to restore,
    // we should wait for activePilots to load to properly map pilot data
    if ((!activePilots || activePilots.length === 0) && mission.pilot_assignments && Object.keys(mission.pilot_assignments).length > 0) {
      // console.log('🔄 Persistence: Waiting for pilot data to load before restoring assignments');
      return;
    }
    
    // Skip if not for current event
    if (!selectedEvent || mission.event_id !== selectedEvent.id) {
      return;
    }
    
    // Skip if we already synced this mission/event combination
    const syncKey = `${mission.id}-${selectedEvent.id}`;
    const lastSyncKey = `${lastSyncMissionId}-${lastSyncEventId}`;
    if (syncKey === lastSyncKey) {
      return;
    }
      
    // console.log('🔄 Persistence: Mission data loaded, syncing state:', {
    //   missionId: mission.id,
    //   eventId: selectedEvent.id,
    //   hasPilotAssignments: !!mission.pilot_assignments,
    //   activePilotsCount: activePilots?.length || 0,
    //   pilotAssignments: JSON.stringify(mission.pilot_assignments)
    // });
    
    // Mark this mission/event as synced
    setLastSyncMissionId(mission.id);
    setLastSyncEventId(selectedEvent.id);
    
    // Convert database pilot assignments back to the format expected by the UI (skip save since this is loading)
    if (mission.pilot_assignments) {
      // console.log('📥 Persistence: Loading pilot assignments from database');
      
      // Get current assignments to preserve roll call status
      const currentAssignments = assignedPilots || {};
      
      // Convert PilotAssignment[] to AssignedPilotsRecord format
      const convertedAssignments: AssignedPilotsRecord = {};
      
      Object.entries(mission.pilot_assignments as Record<string, any[]>).forEach(([flightId, assignments]) => {
        convertedAssignments[flightId] = assignments.map(assignment => {
          // If it's already in UI format (has dashNumber), use it as-is
          if (assignment.dashNumber) {
            // Preserve roll call status from current assignments or database
            const existingPilot = currentAssignments[flightId]?.find(p => p.id === assignment.id || p.boardNumber === assignment.boardNumber);
            return {
              ...assignment,
              // Prioritize existing pilot data if database value is null (prevents overwriting local changes)
              rollCallStatus: existingPilot?.rollCallStatus || assignment.roll_call_status
            };
          }
          
          // Convert from database format (PilotAssignment) to UI format (AssignedPilot)
          // Look up the full pilot data using pilot_id
          const fullPilotData = activePilots?.find(pilot => pilot.id === assignment.pilot_id);
          
          if (fullPilotData) {
            // Check if there's existing roll call data for this pilot
            const existingPilot = currentAssignments[flightId]?.find(p => p.id === assignment.pilot_id || p.boardNumber === fullPilotData.boardNumber);
            
            // Use full pilot data with database assignment info
            return {
              ...fullPilotData,
              dashNumber: assignment.dash_number,
              flight_id: assignment.flight_id,
              slot_number: assignment.slot_number,
              mids_a_channel: assignment.mids_a_channel || '',
              mids_b_channel: assignment.mids_b_channel || '',
              // Prioritize existing pilot data if database value is null (prevents overwriting local changes)
              rollCallStatus: existingPilot?.rollCallStatus || assignment.roll_call_status
            };
          } else {
            // Fallback to minimal pilot object if lookup fails
            // This should not happen if activePilots is properly loaded
            console.warn('🚨 Persistence: Could not find pilot data for ID:', assignment.pilot_id, 'Available pilots:', activePilots?.length || 0);
            return {
              id: assignment.pilot_id,
              dashNumber: assignment.dash_number,
              flight_id: assignment.flight_id,
              slot_number: assignment.slot_number,
              mids_a_channel: assignment.mids_a_channel || '',
              mids_b_channel: assignment.mids_b_channel || '',
              // Add minimal pilot info as fallback
              callsign: '',
              boardNumber: '',
              status: '',
              billet: '',
              qualifications: [],
              rollCallStatus: assignment.roll_call_status
            };
          }
        });
      });
      
      console.log('📥 Persistence: Converted assignments with preserved roll call data:', JSON.stringify(convertedAssignments));
      
      // Debug log roll call status preservation
      Object.entries(convertedAssignments).forEach(([flightId, pilots]) => {
        const pilotsWithRollCall = pilots.filter(p => p.rollCallStatus);
        if (pilotsWithRollCall.length > 0) {
          console.log(`🎯 Persistence: Flight ${flightId} has ${pilotsWithRollCall.length} pilots with roll call status:`, 
            pilotsWithRollCall.map(p => `${p.callsign}: ${p.rollCallStatus}`));
        }
        
        // Debug all pilots in this flight to see if anyone lost roll call status
        pilots.forEach(pilot => {
          if (pilot.callsign === 'DSRM') {
            console.log(`🔍 Persistence: DSRM pilot data in flight ${flightId}:`, {
              callsign: pilot.callsign,
              rollCallStatus: pilot.rollCallStatus,
              attendanceStatus: pilot.attendanceStatus,
              boardNumber: pilot.boardNumber
            });
          }
        });
      });
      setAssignedPilotsLocal(convertedAssignments);
    } else {
      console.log('📭 Persistence: No pilot assignments in database, using empty state');
      setAssignedPilotsLocal({});
    }

    // Convert support roles back to mission commander format
    if (mission.support_role_assignments) {
      const mcRole = mission.support_role_assignments.find(role => role.role_type === 'mission_commander');
      if (mcRole) {
        // This would need to be enhanced to get full pilot info
        // For now, storing basic info in the support role assignment
        setMissionCommanderLocal({
          boardNumber: (mcRole as any).boardNumber || '',
          callsign: (mcRole as any).callsign || '',
          flightId: (mcRole as any).flightId || '',
          flightCallsign: (mcRole as any).flightCallsign || '',
          flightNumber: (mcRole as any).flightNumber || ''
        });
      } else {
        setMissionCommanderLocal(null);
      }
    } else {
      setMissionCommanderLocal(null);
    }

    // Convert flights from mission database format to UI format
    // console.log('🔍 Persistence: Mission data for flight restoration:', {
    //   hasMissionFlights: !!mission.flights,
    //   flightCount: mission.flights?.length || 0,
    //   missionKeys: Object.keys(mission),
    //   flights: mission.flights
    // });
    
    if (mission.flights && mission.flights.length > 0) {
      // console.log('📝 Persistence: Restoring flights from database:', mission.flights.map(f => ({ id: f.id, callsign: f.callsign })));
      const convertedFlights = mission.flights.map((missionFlight, index) => {
        // Extract MIDS channels from the flight_data or use defaults
        const flightData = missionFlight.flight_data || {};
        
        return {
          id: missionFlight.id,
          callsign: missionFlight.callsign || 'UNKNOWN',
          flightNumber: flightData.flightNumber || '1',
          pilots: flightData.pilots || [
            { boardNumber: "", callsign: "", dashNumber: "1" },
            { boardNumber: "", callsign: "", dashNumber: "2" },
            { boardNumber: "", callsign: "", dashNumber: "3" },
            { boardNumber: "", callsign: "", dashNumber: "4" }
          ],
          midsA: flightData.midsA || '',
          midsB: flightData.midsB || '',
          stepTime: flightData.stepTime || 0,
          creationOrder: flightData.creationOrder || index,
          // Preserve any additional metadata
          metadata: flightData.metadata
        };
      });
      
      // console.log('🔄 Persistence: Setting prepFlights to restored flights:', convertedFlights.length, 'flights');
      // console.log('🔄 Persistence: About to call setPrepFlightsLocal with:', convertedFlights);
      setPrepFlightsLocal(convertedFlights);
      // console.log('🔄 Persistence: prepFlights setState called - should trigger re-render');
      
      // Force a re-render by using functional update
      setTimeout(() => {
        setPrepFlightsLocal(prev => {
          // console.log('🔄 Persistence: Functional update check - current state:', prev?.length || 0, 'flights');
          if (prev?.length === 0 && convertedFlights.length > 0) {
            // console.log('🔄 Persistence: State was not updated, forcing update');
            return convertedFlights;
          }
          return prev;
        });
      }, 10);
    } else {
      // console.log('🔄 Persistence: No flights to restore, clearing prepFlights');
      // Clear flights if mission has no flights
      setPrepFlightsLocal([]);
    }
  }, [mission?.id, selectedEvent?.id, activePilots?.length, missionLoading, isSyncing]);

  // Auto-create mission when event is selected but no mission exists
  // Removed auto-creation to prevent duplicate missions when navigating from Events Management
  // Mission creation is now handled explicitly from the Events Management page
  // useEffect(() => {
  //   if (selectedEvent && !mission && !missionLoading && !missionError) {
  //     createNewMission({
  //       event_id: selectedEvent.id,
  //       name: `${selectedEvent.title} Mission`,
  //       description: `Mission planning for ${selectedEvent.title}`,
  //       selected_squadrons: selectedEvent.participants || []
  //     });
  //   }
  // }, [selectedEvent, mission, missionLoading, missionError, createNewMission]);

  // Debounced save function to avoid too many database calls
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const [hasPendingChanges, setHasPendingChanges] = useState<boolean>(false);
  const [pendingOperations, setPendingOperations] = useState<Array<() => Promise<boolean>>>([]);

  // Check if any drag operation is in progress globally
  const isDragInProgress = document.body.classList.contains('dragging');

  const debouncedSave = useCallback((
    saveFunction: () => Promise<boolean>,
    delay: number = 1000
  ) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Check for drag state at call time
    const dragInProgress = document.body.classList.contains('dragging');
    
    // If drag is in progress, queue the operation instead of executing immediately
    if (dragInProgress) {
      console.log('🚫 Persistence: Drag in progress, queuing save operation');
      setPendingOperations(prev => [...prev, saveFunction]);
      return;
    }

    setHasPendingChanges(true);

    const timeout = setTimeout(async () => {
      // Double-check drag state before executing
      const stillDragging = document.body.classList.contains('dragging');
      if (stillDragging) {
        console.log('🚫 Persistence: Drag started during delay, re-queuing operation');
        setPendingOperations(prev => [...prev, saveFunction]);
        setHasPendingChanges(false);
        return;
      }

      try {
        console.log('💾 Persistence: Executing save operation');
        await saveFunction();
      } catch (error) {
        console.error('Error saving mission data:', error);
      } finally {
        setHasPendingChanges(false);
      }
    }, delay);

    setSaveTimeout(timeout);
  }, [saveTimeout]);

  // Monitor for drag completion and execute queued operations
  useEffect(() => {
    if (!isDragInProgress && pendingOperations.length > 0) {
      console.log(`🚀 Persistence: Drag completed, executing ${pendingOperations.length} queued operations`);
      
      // Execute the most recent operation (latest user state)
      const latestOperation = pendingOperations[pendingOperations.length - 1];
      setPendingOperations([]);
      
      // Execute with a small delay to ensure UI has settled
      const timeout = setTimeout(async () => {
        try {
          setHasPendingChanges(true);
          await latestOperation();
          console.log('✅ Persistence: Queued operation completed');
        } catch (error) {
          console.error('Error executing queued operation:', error);
        } finally {
          setHasPendingChanges(false);
        }
      }, 100);

      return () => clearTimeout(timeout);
    }
  }, [isDragInProgress, pendingOperations]);

  // Enhanced setters that save to database
  const setAssignedPilots = useCallback((pilots: AssignedPilotsRecord, skipSave: boolean = false) => {
    // Debug tracking for DSRM
    Object.entries(pilots).forEach(([flightId, pilotsList]) => {
      pilotsList.forEach(pilot => {
        if (pilot.callsign === 'DSRM') {
          console.log(`[SET-ASSIGNED-PILOTS-DEBUG] Setting DSRM in flight ${flightId}:`, {
            rollCallStatus: pilot.rollCallStatus,
            attendanceStatus: pilot.attendanceStatus,
            skipSave
          });
          console.trace('Call stack for setAssignedPilots');
        }
      });
    });
    
    const pilotsCount = Object.values(pilots).reduce((total, flight) => total + flight.length, 0);

    console.log('📝 Persistence: setAssignedPilots called:', {
      pilotsCount,
      skipSave,
      hasMission: !!mission,
      missionId: mission?.id
    });

    setAssignedPilotsLocal(pilots);

    // Save to database if this is a user-initiated change (including when clearing all pilots)
    if (mission && !skipSave) {
      // Only save if this mission belongs to the currently selected event
      if (selectedEvent && mission.event_id !== selectedEvent.id) {
        console.log('🚫 Persistence: Skipping pilot assignment save - mission belongs to different event:', {
          missionEventId: mission.event_id,
          selectedEventId: selectedEvent.id,
          missionId: mission.id
        });
        return;
      }
      
      console.log('💾 Persistence: Scheduling database save...');
      debouncedSave(async () => {
        setIsSyncing(true);
        try {
          const pilotAssignments: Record<string, PilotAssignment[]> = {};
          
          Object.entries(pilots).forEach(([flightId, pilotsList]) => {
            pilotAssignments[flightId] = pilotsList.map((pilot, index) => ({
              pilot_id: pilot.id,
              flight_id: flightId,
              slot_number: index + 1,
              dash_number: pilot.dashNumber,
              mids_a_channel: (pilot as any).midsAChannel || '',
              mids_b_channel: (pilot as any).midsBChannel || '',
              roll_call_status: pilot.rollCallStatus || null
            }));
          });

          // Debug save data for DSRM specifically
          Object.entries(pilotAssignments).forEach(([flightId, assignments]) => {
            assignments.forEach(assignment => {
              if (assignment.pilot_id && activePilots) {
                const pilot = activePilots.find(p => p.id === assignment.pilot_id);
                if (pilot && pilot.callsign === 'DSRM') {
                  console.log(`💾 Persistence: Saving DSRM assignment in flight ${flightId}:`, {
                    pilot_id: assignment.pilot_id,
                    dash_number: assignment.dash_number,
                    roll_call_status: assignment.roll_call_status,
                    originalPilotRollCall: pilot.rollCallStatus
                  });
                }
              }
            });
          });
          
          console.log('🔄 Persistence: Executing database save with assignments (including roll call):', pilotAssignments);
          const result = await updatePilotAssignments(pilotAssignments);
          console.log('✅ Persistence: Database save result:', result);
          return result;
        } finally {
          // Reset the syncing flag after a short delay to allow UI to stabilize
          setTimeout(() => setIsSyncing(false), 500);
        }
      });
    } else {
      console.log('⏭️ Persistence: Skipping save (skipSave=true or no mission)');
    }
  }, [mission, selectedEvent, debouncedSave, updatePilotAssignments]);

  const setMissionCommander = useCallback((commander: MissionCommanderInfo | null) => {
    setMissionCommanderLocal(commander);
    
    // Save to database
    if (mission) {
      // Only save if this mission belongs to the currently selected event
      if (selectedEvent && mission.event_id !== selectedEvent.id) {
        console.log('🚫 Persistence: Skipping mission commander save - mission belongs to different event:', {
          missionEventId: mission.event_id,
          selectedEventId: selectedEvent.id,
          missionId: mission.id
        });
        return;
      }
      
      debouncedSave(async () => {
        const supportRoles: SupportRoleAssignment[] = commander ? [{
          role_type: 'mission_commander',
          pilot_id: (commander as any).pilotId || '',
          // Store additional info in the role assignment for now
          ...(commander as any)
        }] : [];

        return updateSupportRoles(supportRoles);
      });
    }
  }, [mission, selectedEvent, debouncedSave, updateSupportRoles]);

  // Effect to handle mission creation when needed
  useEffect(() => {
    if (needsMissionCreation && selectedEvent && !mission && !missionLoading) {
      console.log('📝 Creating mission for flight assignments in event:', selectedEvent.id);

      const missionName = `${selectedEvent.title} Mission`;
      createNewMission({
        event_id: selectedEvent.id,
        name: missionName,
        description: `Mission planning for ${selectedEvent.title}`,
        selected_squadrons: selectedEvent.participants || []
      }).then((newMission) => {
        setNeedsMissionCreation(false);
        if (newMission) {
          console.log('✅ Mission created successfully:', newMission.id);
          // Flights will be saved automatically in the next effect run when mission updates
        } else {
          console.error('❌ Failed to create mission for flight assignments');
        }
      }).catch((error) => {
        console.error('❌ Error creating mission:', error);
        setNeedsMissionCreation(false);
      });
    }
  }, [needsMissionCreation, selectedEvent, mission, missionLoading, createNewMission]);

  const setPrepFlights = useCallback((flights: any[], skipSave: boolean = false) => {
    setPrepFlightsLocal(flights);

    // If flights are being cleared, reset the processed flights ref to allow re-importing
    if (flights.length === 0) {
      console.log('🔄 useMissionPrepDataPersistence: Flights cleared, resetting processed flights ref');
      processedFlightsRef.current = null;
    }

    // Save to database with shorter delay for flights (immediate user feedback)
    if (selectedEvent && !skipSave) {
      // If no mission exists but we have flights to save, trigger mission creation
      if (!mission && flights.length > 0) {
        console.log('📝 Triggering mission creation for flight assignments in event:', selectedEvent.id);
        // Set a flag to trigger mission creation in a separate effect
        setNeedsMissionCreation(true);
        return;
      }

      // Only save if this mission belongs to the currently selected event
      if (!mission || mission.event_id !== selectedEvent.id) {
        console.log('🚫 Persistence: Skipping flight save - mission belongs to different event:', {
          missionEventId: mission?.event_id,
          selectedEventId: selectedEvent.id,
          missionId: mission?.id
        });
        return;
      }

      const currentMissionId = mission.id;
      const currentEventId = selectedEvent.id;
      
      console.log(`Setting flights for mission ${currentMissionId} (event ${currentEventId}):`, flights.map(f => f.callsign));
      
      debouncedSave(async () => {
        // Double-check the mission ID hasn't changed during debounce
        if (mission?.id !== currentMissionId) {
          console.warn(`Mission changed during debounce, skipping save. Expected: ${currentMissionId}, Current: ${mission?.id}`);
          return false;
        }
        
        const missionFlights: MissionFlight[] = flights.map((flight) => ({
          id: flight.id || `flight_${Date.now()}_${Math.random()}`,
          callsign: flight.callsign || flight.name || 'UNKNOWN',
          squadron_id: flight.squadron_id,
          aircraft_type: flight.aircraftType || flight.type || 'F/A-18C',
          slots: flight.slots || flight.pilots?.length || 2,
          flight_data: {
            // Store UI-specific data in flight_data
            flightNumber: flight.flightNumber || '1',
            pilots: flight.pilots || [],
            midsA: flight.midsA || '',
            midsB: flight.midsB || '',
            creationOrder: flight.creationOrder || 0,
            metadata: flight.metadata,
            // Store original extracted flight data if available
            units: flight.units,
            route: flight.route,
            frequency: flight.frequency,
            modulation: flight.modulation,
            // Include any other existing flight properties
            ...flight
          }
        }));

        console.log(`Saving flights to mission ${currentMissionId}:`, missionFlights.map(f => f.callsign));
        return updateFlights(missionFlights);
      }, 500); // Balanced delay for flight updates
    }
  }, [mission, selectedEvent, debouncedSave, updateFlights]);

  // Clear timeout when switching events
  useEffect(() => {
    return () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  }, [selectedEvent?.id]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  }, [saveTimeout]);

  // Parse a group name into callsign and flight number
  const parseGroupName = (name: string): { callsign: string; flightNumber: string } => {
    const lastSpaceIndex = name.lastIndexOf(' ');
    if (lastSpaceIndex === -1) {
      return { callsign: name, flightNumber: "1" };
    }
    
    const callsign = name.substring(0, lastSpaceIndex);
    const flightNumber = name.substring(lastSpaceIndex + 1);
    
    if (!/^\d+$/.test(flightNumber)) {
      return { callsign: name, flightNumber: "1" };
    }
    
    return { callsign, flightNumber };
  };

  // Use a ref to track processed flights to prevent duplicate processing
  const processedFlightsRef = useRef<string | null>(null);

  // Reset processed flights ref when event changes
  useEffect(() => {
    processedFlightsRef.current = null;
  }, [selectedEvent?.id]);

  // Handle extracted flights from .miz import
  const handleExtractedFlights = useCallback((flights: any[]) => {
    console.log('🛫 useMissionPrepDataPersistence: Processing extracted flights:', flights.length);
    
    // Create a unique key for this batch of flights
    const flightKey = flights.map(f => f.name).sort().join(',');
    
    // Only process if we haven't already processed this exact set of flights in the current session
    if (processedFlightsRef.current === flightKey) {
      console.log('⚠️ useMissionPrepDataPersistence: Skipping duplicate flight processing for key:', flightKey);
      return;
    }
    
    processedFlightsRef.current = flightKey;
    
    setExtractedFlights(flights);
    
    // Convert extracted flights to prep flights format
    const batchTimestamp = Date.now().toString();
    const convertedFlights = flights.map((extractedFlight, index) => {
      const { callsign, flightNumber } = parseGroupName(extractedFlight.name);
      return {
        id: `extracted-${batchTimestamp}-${index}`,
        callsign: callsign.toUpperCase(),
        flightNumber,
        pilots: [
          { boardNumber: "", callsign: "", dashNumber: "1" },
          { boardNumber: "", callsign: "", dashNumber: "2" },
          { boardNumber: "", callsign: "", dashNumber: "3" },
          { boardNumber: "", callsign: "", dashNumber: "4" }
        ],
        midsA: "",
        midsB: "",
        creationOrder: index,
        extractedFlightData: extractedFlight
      };
    });
    
    console.log('🔄 useMissionPrepDataPersistence: Converted flights to prep format:', convertedFlights.map(f => f.callsign));
    setPrepFlights(convertedFlights);
  }, [setPrepFlights]);

  return {
    // State
    assignedPilots,
    missionCommander,
    extractedFlights,
    prepFlights,

    // Setters (enhanced with database persistence)
    setAssignedPilots,
    setMissionCommander,
    setExtractedFlights,
    setPrepFlights,

    // Mission-specific data
    mission,
    missionLoading,
    missionError,
    missionSaving: missionSaving || hasPendingChanges,

    // Additional helpers
    updateSelectedSquadrons: (squadrons: string[]) => {
      if (mission) {
        return updateSelectedSquadrons(squadrons);
      }
      return Promise.resolve(false);
    },

    updateMissionSettings: (settings: any) => {
      if (mission) {
        return updateSettings(settings);
      }
      return Promise.resolve(false);
    },

    updateMissionData: (updates: any) => {
      if (mission) {
        return updateMissionData(updates);
      }
      return Promise.resolve(false);
    },

    // Flight extraction handler
    handleExtractedFlights
  };
};