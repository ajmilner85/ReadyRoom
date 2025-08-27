import { useState, useCallback, useRef } from 'react';
import { 
  loadAssignedPilots, saveAssignedPilots,
  loadMissionCommander, saveMissionCommander,
  loadExtractedFlights, saveExtractedFlights,
  loadPrepFlights, savePrepFlights
} from '../utils/localStorageUtils';
import type { MissionCommanderInfo } from '../types/MissionCommanderTypes';
import type { ExtractedFlight } from '../types/FlightData';
import type { AssignedPilotsRecord } from '../types/MissionPrepTypes';


// Type for Roll Call Responses state
type RollCallResponses = Record<string, 'Present' | 'Absent' | 'Tentative' | null>;

/**
 * Custom hook to manage mission preparation state
 */
export const useMissionPrepState = (
  externalAssignedPilots?: AssignedPilotsRecord,
  onAssignedPilotsChange?: (pilots: AssignedPilotsRecord) => void,
  externalMissionCommander?: MissionCommanderInfo | null,
  onMissionCommanderChange?: (commander: MissionCommanderInfo | null) => void,
  externalExtractedFlights?: ExtractedFlight[],
  onExtractedFlightsChange?: (flights: ExtractedFlight[]) => void,
  externalPrepFlights?: any[],
  onPrepFlightsChange?: (flights: any[]) => void,
  // Add external state props for roll call responses
  externalRollCallResponses?: RollCallResponses,
  onRollCallResponsesChange?: (responses: RollCallResponses) => void
) => {
  // Use the external state if provided, otherwise use local state
  const [localAssignedPilots, setLocalAssignedPilots] = useState<AssignedPilotsRecord>(loadAssignedPilots() || {});
  const [localMissionCommander, setLocalMissionCommander] = useState<MissionCommanderInfo | null>(loadMissionCommander());
  const [localExtractedFlights, setLocalExtractedFlights] = useState<ExtractedFlight[]>(loadExtractedFlights() || []);
  const [localPrepFlights, setLocalPrepFlights] = useState<any[]>(loadPrepFlights() || []);
  // Add local state for roll call responses
  const [localRollCallResponses, setLocalRollCallResponses] = useState<RollCallResponses>({});
  
  // Use refs to track which state to use
  const processedMizRef = useRef<boolean>(false);
  
  // Determine which state to use
  const assignedPilots = externalAssignedPilots !== undefined ? externalAssignedPilots : localAssignedPilots;
  const missionCommander = externalMissionCommander !== undefined ? externalMissionCommander : localMissionCommander;
  const extractedFlights = externalExtractedFlights !== undefined ? externalExtractedFlights : localExtractedFlights;
  const prepFlights = externalPrepFlights !== undefined ? externalPrepFlights : localPrepFlights;
  // Determine which roll call state to use
  const rollCallResponses = externalRollCallResponses !== undefined ? externalRollCallResponses : localRollCallResponses;
  
  // Create functions to update the appropriate state
  const setAssignedPilots = useCallback((value: React.SetStateAction<AssignedPilotsRecord>) => {
    const newValue = typeof value === 'function' ? value(assignedPilots) : value;
    if (onAssignedPilotsChange) {
      onAssignedPilotsChange(newValue);
    } else {
      setLocalAssignedPilots(newValue);
      saveAssignedPilots(newValue);
    }
  }, [assignedPilots, onAssignedPilotsChange]);

  const setMissionCommander = useCallback((value: React.SetStateAction<MissionCommanderInfo | null>) => {
    const newValue = typeof value === 'function' ? value(missionCommander) : value;
    if (onMissionCommanderChange) {
      onMissionCommanderChange(newValue);
    } else {
      setLocalMissionCommander(newValue);
      saveMissionCommander(newValue);
    }
  }, [missionCommander, onMissionCommanderChange]);

  const setExtractedFlights = useCallback((value: React.SetStateAction<ExtractedFlight[]>) => {
    const newValue = typeof value === 'function' ? value(extractedFlights) : value;
    if (onExtractedFlightsChange) {
      onExtractedFlightsChange(newValue);
    } else {
      setLocalExtractedFlights(newValue);
      saveExtractedFlights(newValue);
    }
  }, [extractedFlights, onExtractedFlightsChange]);

  const setPrepFlights = useCallback((value: React.SetStateAction<any[]>) => {
    const newValue = typeof value === 'function' ? value(prepFlights) : value;
    if (onPrepFlightsChange) {
      onPrepFlightsChange(newValue);
    } else {
      setLocalPrepFlights(newValue);
      savePrepFlights(newValue);
    }
  }, [prepFlights, onPrepFlightsChange]);

  // Add setter for roll call responses
  const setRollCallResponses = useCallback((value: React.SetStateAction<RollCallResponses>) => {
    const newValue = typeof value === 'function' ? value(rollCallResponses) : value;
    if (onRollCallResponsesChange) {
      onRollCallResponsesChange(newValue);
    } else {
      setLocalRollCallResponses(newValue);
      // Optionally save to local storage if needed, though maybe not for roll call
      // saveRollCallResponses(newValue); 
    }
  }, [rollCallResponses, onRollCallResponsesChange]);

  // Handle extracted flights from AircraftGroups with safeguard against infinite loops
  const handleExtractedFlights = useCallback((flights: ExtractedFlight[]) => {
    if (flights.length > 0 && !processedMizRef.current) {
      processedMizRef.current = true;
      setExtractedFlights(flights);
    }
  }, [setExtractedFlights]);

  // Reset the processed flag
  const resetProcessedFlag = useCallback(() => {
    processedMizRef.current = false;
  }, []);

  return {
    assignedPilots,
    setAssignedPilots,
    missionCommander,
    setMissionCommander,
    extractedFlights,
    setExtractedFlights,
    prepFlights,
    setPrepFlights,
    // Return roll call state and setter
    rollCallResponses,
    setRollCallResponses,
    handleExtractedFlights,
    resetProcessedFlag,
    processedMizRef
  };
};
