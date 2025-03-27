/**
 * Utility functions for working with localStorage
 */

const STORAGE_KEYS = {
  MISSION_DETAILS: 'prifly-mission-details',
  ENCRYPTION_CHANNEL: 'prifly-encryption-channel',
  COMMS_PLAN: 'prifly-comms-plan',
  ASSIGNED_PILOTS: 'prifly-assigned-pilots',
  MISSION_COMMANDER: 'prifly-mission-commander',
  EXTRACTED_FLIGHTS: 'prifly-extracted-flights',
  PREP_FLIGHTS: 'prifly-prep-flights',
  SELECTED_EVENT: 'prifly-selected-event'
};

/**
 * Save data to localStorage with the specified key
 */
export const saveToLocalStorage = <T>(key: string, data: T): void => {
  try {
    const serializedData = JSON.stringify(data);
    localStorage.setItem(key, serializedData);
  } catch (error) {
    console.error(`Error saving data to localStorage with key ${key}:`, error);
  }
};

/**
 * Load data from localStorage with the specified key
 * Returns defaultValue if key doesn't exist or an error occurs
 */
export const loadFromLocalStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const serializedData = localStorage.getItem(key);
    if (serializedData === null) {
      return defaultValue;
    }
    return JSON.parse(serializedData) as T;
  } catch (error) {
    console.error(`Error loading data from localStorage with key ${key}:`, error);
    return defaultValue;
  }
};

/**
 * Clear data for a specific key from localStorage
 */
export const clearFromLocalStorage = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error clearing data from localStorage with key ${key}:`, error);
  }
};

/**
 * Save assigned pilots data to localStorage
 */
export const saveAssignedPilots = (assignedPilots: Record<string, any[]>): void => {
  saveToLocalStorage(STORAGE_KEYS.ASSIGNED_PILOTS, assignedPilots);
};

/**
 * Load assigned pilots data from localStorage
 */
export const loadAssignedPilots = (): Record<string, any[]> => {
  return loadFromLocalStorage<Record<string, any[]>>(STORAGE_KEYS.ASSIGNED_PILOTS, {});
};

/**
 * Save mission commander data to localStorage
 */
export const saveMissionCommander = (commander: any | null): void => {
  saveToLocalStorage(STORAGE_KEYS.MISSION_COMMANDER, commander);
};

/**
 * Load mission commander data from localStorage
 */
export const loadMissionCommander = (): any | null => {
  return loadFromLocalStorage<any | null>(STORAGE_KEYS.MISSION_COMMANDER, null);
};

/**
 * Save extracted flights data to localStorage
 */
export const saveExtractedFlights = (flights: any[]): void => {
  saveToLocalStorage(STORAGE_KEYS.EXTRACTED_FLIGHTS, flights);
};

/**
 * Load extracted flights data from localStorage
 */
export const loadExtractedFlights = (): any[] => {
  return loadFromLocalStorage<any[]>(STORAGE_KEYS.EXTRACTED_FLIGHTS, []);
};

/**
 * Save preparation flights data to localStorage
 */
export const savePrepFlights = (flights: any[]): void => {
  saveToLocalStorage(STORAGE_KEYS.PREP_FLIGHTS, flights);
};

/**
 * Load preparation flights data from localStorage
 */
export const loadPrepFlights = (): any[] => {
  return loadFromLocalStorage<any[]>(STORAGE_KEYS.PREP_FLIGHTS, []);
};

/**
 * Save selected event to localStorage
 */
export const saveSelectedEvent = (event: any | null): void => {
  saveToLocalStorage(STORAGE_KEYS.SELECTED_EVENT, event);
};

/**
 * Load selected event from localStorage
 */
export const loadSelectedEvent = (): any | null => {
  return loadFromLocalStorage<any | null>(STORAGE_KEYS.SELECTED_EVENT, null);
};

export { STORAGE_KEYS };