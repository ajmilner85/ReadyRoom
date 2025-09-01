import { useState, useEffect, useCallback } from 'react';
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
  externalPrepFlights?: any[]
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
    updateSettings
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

  // Clear state when switching events
  useEffect(() => {
    // Clear state whenever the selectedEvent changes, regardless of mission state
    setAssignedPilotsLocal({});
    setMissionCommanderLocal(null);
    setPrepFlightsLocal([]);
    setExtractedFlights([]);
    setHasPendingChanges(false);
  }, [selectedEvent?.id]);

  // Sync state with mission data when mission loads
  useEffect(() => {
    if (mission) {
      // Convert database pilot assignments back to the format expected by the UI (skip save since this is loading)
      if (mission.pilot_assignments) {
        setAssignedPilotsLocal(mission.pilot_assignments as unknown as AssignedPilotsRecord);
      } else {
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
      if (mission.flights && mission.flights.length > 0) {
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
            creationOrder: flightData.creationOrder || index,
            // Preserve any additional metadata
            metadata: flightData.metadata
          };
        });
        
        setPrepFlightsLocal(convertedFlights);
      } else {
        // Clear flights if mission has no flights
        setPrepFlightsLocal([]);
      }
    }
  }, [mission]);

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

  const debouncedSave = useCallback((
    saveFunction: () => Promise<boolean>,
    delay: number = 1000
  ) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    setHasPendingChanges(true);

    const timeout = setTimeout(async () => {
      try {
        await saveFunction();
      } catch (error) {
        console.error('Error saving mission data:', error);
      } finally {
        setHasPendingChanges(false);
      }
    }, delay);

    setSaveTimeout(timeout);
  }, [saveTimeout]);

  // Enhanced setters that save to database
  const setAssignedPilots = useCallback((pilots: AssignedPilotsRecord, skipSave: boolean = false) => {
    setAssignedPilotsLocal(pilots);
    
    // Only save to database if this is a user-initiated change
    if (mission && !skipSave) {
      debouncedSave(async () => {
        const pilotAssignments: Record<string, PilotAssignment[]> = {};
        
        Object.entries(pilots).forEach(([flightId, pilotsList]) => {
          pilotAssignments[flightId] = pilotsList.map((pilot, index) => ({
            pilot_id: pilot.id,
            flight_id: flightId,
            slot_number: index + 1,
            dash_number: pilot.dashNumber,
            mids_a_channel: (pilot as any).midsAChannel || '',
            mids_b_channel: (pilot as any).midsBChannel || ''
          }));
        });

        return updatePilotAssignments(pilotAssignments);
      });
    }
  }, [mission, debouncedSave, updatePilotAssignments]);

  const setMissionCommander = useCallback((commander: MissionCommanderInfo | null) => {
    setMissionCommanderLocal(commander);
    
    // Save to database
    if (mission) {
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
  }, [mission, debouncedSave, updateSupportRoles]);

  const setPrepFlights = useCallback((flights: any[], skipSave: boolean = false) => {
    setPrepFlightsLocal(flights);
    
    // Save to database with shorter delay for flights (immediate user feedback)
    if (mission && selectedEvent && !skipSave) {
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
    }
  };
};