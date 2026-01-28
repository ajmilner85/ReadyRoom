import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  getMissionById, 
  getMissionByEventId, 
  updateMission, 
  createMission,
  linkMissionToEvent
} from '../utils/missionService';
import type {
  Mission,
  MissionResponse,
  CreateMissionRequest,
  UpdateMissionRequest,
  MissionFlight,
  PilotAssignment,
  SupportRoleAssignment
} from '../types/MissionTypes';

// Global cache for mission loading requests to prevent duplicates
const loadingCache = new Map<string, Promise<any>>();

/**
 * Custom hook for mission database operations
 */
export const useMission = (initialMissionId?: string, eventId?: string) => {
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load mission on mount
  useEffect(() => {
    const loadMission = async () => {
      if (!initialMissionId && !eventId) {
        setLoading(false);
        setMission(null);
        return;
      }

      // Abort any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      // Create cache key for deduplication
      const cacheKey = initialMissionId ? `mission:${initialMissionId}` : `event:${eventId}`;
      
      console.log(`Loading mission for eventId: ${eventId}, missionId: ${initialMissionId}`);
      setLoading(true);
      setError(null);

      try {
        // Check if this exact request is already in progress
        let loadingPromise = loadingCache.get(cacheKey);
        
        if (!loadingPromise) {
          // Create new loading promise
          loadingPromise = initialMissionId 
            ? getMissionById(initialMissionId)
            : getMissionByEventId(eventId!);
          
          // Cache the promise
          loadingCache.set(cacheKey, loadingPromise);
          
          // Clean up cache after completion
          loadingPromise.finally(() => {
            loadingCache.delete(cacheKey);
          });
        }

        const result = await loadingPromise;

        // Check if request was aborted
        if (abortControllerRef.current?.signal.aborted) {
          return;
        }

        if (result?.error) {
          console.log(`Mission load error: ${result.error}`);
          setError(result.error);
        } else if (result?.mission === null) {
          // No mission found for this event - this is normal
          console.log(`No mission found for event ${eventId}`);
          setMission(null);
        } else if (result?.mission) {
          console.log(`Mission loaded: ${result.mission.id} for event ${eventId}`);
          setMission(result.mission);
        }
      } catch (err: any) {
        // Ignore abort errors
        if (err.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
          return;
        }
        console.error('Error loading mission:', err);
        setError(err.message || 'Failed to load mission');
      } finally {
        if (!abortControllerRef.current?.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadMission();
    
    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [initialMissionId, eventId]);

  // Create a new mission
  const createNewMission = useCallback(async (
    missionData: CreateMissionRequest
  ): Promise<Mission | null> => {
    setSaving(true);
    setError(null);

    try {
      const { mission: newMission, error } = await createMission(missionData);
      
      if (error) {
        setError(error);
        return null;
      }

      setMission(newMission);
      return newMission;
    } catch (err: any) {
      console.error('Error creating mission:', err);
      setError(err.message || 'Failed to create mission');
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  // Update mission data.
  // Returns full MissionResponse so callers can detect version conflicts.
  const updateMissionData = useCallback(async (
    updates: UpdateMissionRequest,
    missionId?: string
  ): Promise<MissionResponse> => {
    const targetMissionId = missionId || mission?.id;
    if (!targetMissionId) {
      setError('No mission ID provided for update');
      return { mission: {} as Mission, error: 'No mission ID provided for update' };
    }

    setSaving(true);
    setError(null);

    try {
      const result = await updateMission(targetMissionId, updates);

      if (result.conflict) {
        // Version conflict — don't overwrite local mission state.
        console.warn('⚠️ useMission: version conflict detected');
        return result;
      }

      if (result.error) {
        setError(result.error);
        return result;
      }

      setMission(result.mission);
      return result;
    } catch (err: any) {
      console.error('Error updating mission:', err);
      setError(err.message || 'Failed to update mission');
      return { mission: {} as Mission, error: err.message || 'Failed to update mission' };
    } finally {
      setSaving(false);
    }
  }, [mission?.id]);

  // Convenience wrappers return boolean for backward compatibility
  const updateFlights = useCallback(async (flights: MissionFlight[]): Promise<boolean> => {
    const result = await updateMissionData({ flights });
    return !result.error && !result.conflict;
  }, [updateMissionData]);

  const updatePilotAssignments = useCallback(async (
    assignments: Record<string, PilotAssignment[]>
  ): Promise<boolean> => {
    const result = await updateMissionData({ pilot_assignments: assignments });
    return !result.error && !result.conflict;
  }, [updateMissionData]);

  const updateSupportRoles = useCallback(async (
    roles: SupportRoleAssignment[]
  ): Promise<boolean> => {
    const result = await updateMissionData({ support_role_assignments: roles });
    return !result.error && !result.conflict;
  }, [updateMissionData]);

  // Allow external code (e.g. realtime hook) to update the mission state directly
  const setMissionExternal = useCallback((m: Mission | null) => {
    setMission(m);
  }, []);

  // Link mission to an event
  const linkToEvent = useCallback(async (targetEventId: string): Promise<boolean> => {
    if (!mission?.id) {
      setError('No mission to link');
      return false;
    }

    setSaving(true);
    setError(null);

    try {
      const { mission: linkedMission, error } = await linkMissionToEvent(mission.id, targetEventId);
      
      if (error) {
        setError(error);
        return false;
      }

      setMission(linkedMission);
      return true;
    } catch (err: any) {
      console.error('Error linking mission to event:', err);
      setError(err.message || 'Failed to link mission to event');
      return false;
    } finally {
      setSaving(false);
    }
  }, [mission?.id]);

  // Helper to update mission settings
  const updateSettings = useCallback(async (settings: any): Promise<boolean> => {
    const result = await updateMissionData({ mission_settings: settings });
    return !result.error && !result.conflict;
  }, [updateMissionData]);

  // Helper to update selected squadrons
  const updateSelectedSquadrons = useCallback(async (squadrons: string[]): Promise<boolean> => {
    const result = await updateMissionData({ selected_squadrons: squadrons });
    return !result.error && !result.conflict;
  }, [updateMissionData]);

  return {
    // State
    mission,
    loading,
    error,
    saving,

    // Actions
    createNewMission,
    updateMissionData,
    updateFlights,
    updatePilotAssignments,
    updateSupportRoles,
    updateSettings,
    updateSelectedSquadrons,
    linkToEvent,

    // Direct state setter (for realtime updates)
    setMission: setMissionExternal,

    // Utility
    refetch: () => {
      if (mission?.id) {
        // Re-trigger the useEffect to reload
        setLoading(true);
      }
    }
  };
};