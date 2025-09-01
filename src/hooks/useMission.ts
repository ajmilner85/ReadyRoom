import { useState, useEffect, useCallback } from 'react';
import { 
  getMissionById, 
  getMissionByEventId, 
  updateMission, 
  createMission,
  linkMissionToEvent
} from '../utils/missionService';
import type { 
  Mission, 
  CreateMissionRequest, 
  UpdateMissionRequest,
  MissionFlight,
  PilotAssignment,
  SupportRoleAssignment
} from '../types/MissionTypes';
import type { AssignedPilotsRecord } from '../types/MissionPrepTypes';
import type { MissionCommanderInfo } from '../types/MissionCommanderTypes';

/**
 * Custom hook for mission database operations
 */
export const useMission = (initialMissionId?: string, eventId?: string) => {
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Load mission on mount
  useEffect(() => {
    const loadMission = async () => {
      if (!initialMissionId && !eventId) {
        setLoading(false);
        setMission(null);
        return;
      }

      console.log(`Loading mission for eventId: ${eventId}, missionId: ${initialMissionId}`);
      setLoading(true);
      setError(null);

      try {
        let result;
        if (initialMissionId) {
          result = await getMissionById(initialMissionId);
        } else if (eventId) {
          result = await getMissionByEventId(eventId);
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
        console.error('Error loading mission:', err);
        setError(err.message || 'Failed to load mission');
      } finally {
        setLoading(false);
      }
    };

    loadMission();
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

  // Update mission data
  const updateMissionData = useCallback(async (
    updates: UpdateMissionRequest,
    missionId?: string
  ): Promise<boolean> => {
    const targetMissionId = missionId || mission?.id;
    if (!targetMissionId) {
      setError('No mission ID provided for update');
      return false;
    }

    setSaving(true);
    setError(null);

    try {
      const { mission: updatedMission, error } = await updateMission(targetMissionId, updates);
      
      if (error) {
        setError(error);
        return false;
      }

      setMission(updatedMission);
      return true;
    } catch (err: any) {
      console.error('Error updating mission:', err);
      setError(err.message || 'Failed to update mission');
      return false;
    } finally {
      setSaving(false);
    }
  }, [mission?.id]);

  // Update flights in the mission
  const updateFlights = useCallback(async (flights: MissionFlight[]): Promise<boolean> => {
    return updateMissionData({ flights });
  }, [updateMissionData]);

  // Update pilot assignments
  const updatePilotAssignments = useCallback(async (
    assignments: Record<string, PilotAssignment[]>
  ): Promise<boolean> => {
    return updateMissionData({ pilot_assignments: assignments });
  }, [updateMissionData]);

  // Update support role assignments
  const updateSupportRoles = useCallback(async (
    roles: SupportRoleAssignment[]
  ): Promise<boolean> => {
    return updateMissionData({ support_role_assignments: roles });
  }, [updateMissionData]);

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
    return updateMissionData({ mission_settings: settings });
  }, [updateMissionData]);

  // Helper to update selected squadrons
  const updateSelectedSquadrons = useCallback(async (squadrons: string[]): Promise<boolean> => {
    return updateMissionData({ selected_squadrons: squadrons });
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

    // Utility
    refetch: () => {
      if (mission?.id) {
        // Re-trigger the useEffect to reload
        setLoading(true);
      }
    }
  };
};