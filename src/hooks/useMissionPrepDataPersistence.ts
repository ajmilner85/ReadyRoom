import { useState, useEffect, useCallback, useRef } from 'react';
import { useMission } from './useMission';
import { useMissionRealtime } from './useMissionRealtime';
import { supabase } from '../utils/supabaseClient';
import { tabSessionId } from '../utils/tabSessionId';
import type { AssignedPilotsRecord } from '../types/MissionPrepTypes';
import type { MissionCommanderInfo } from '../types/MissionCommanderTypes';
import type { Event } from '../types/EventTypes';
import type { Mission, MissionFlight, PilotAssignment, SupportRoleAssignment } from '../types/MissionTypes';

// Define the structure for the polled attendance data
interface RealtimeAttendanceRecord {
  discord_id: string;
  response: 'accepted' | 'declined' | 'tentative';
  roll_call_response?: 'Present' | 'Absent' | 'Tentative';
}

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
  realtimeAttendanceData?: RealtimeAttendanceRecord[],
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
    createNewMission,
    setMission: setMissionDirect
  } = useMission(undefined, selectedEvent?.id);

  // ── Version tracking for optimistic locking ──
  // We track the version in a ref so debounced saves always have the latest
  const missionVersionRef = useRef<number>(1);

  // ── Remote update trigger ──
  // Incremented each time a remote update arrives to force the sync effect to re-run
  const [remoteUpdateTrigger, setRemoteUpdateTrigger] = useState(0);
  const isRemoteUpdateRef = useRef(false);

  // ── Remote support-roles revision ──
  // A narrower counter that only increments when support_role_assignments content
  // actually changes. Used by MissionSupportAssignments so it doesn't reload on
  // every remote save (e.g. pilot_assignments saves), breaking the ping-pong loop.
  const [remoteSupportRolesRevision, setRemoteSupportRolesRevision] = useState(0);
  const lastRemoteSupportRolesHashRef = useRef<string>('');

  // Keep version ref in sync with mission state
  useEffect(() => {
    if (mission) {
      missionVersionRef.current = mission.version ?? 1;
    }
  }, [mission?.id, mission?.version]);

  // ── Current user info for presence ──
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      // Get user profile for the user_profiles.id
      supabase
        .from('user_profiles')
        .select('id, pilot_id')
        .eq('auth_user_id', data.user.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (cancelled || !profile) return;
          // Try to get the pilot callsign for display
          if (profile.pilot_id) {
            supabase
              .from('pilots')
              .select('callsign')
              .eq('id', profile.pilot_id)
              .maybeSingle()
              .then(({ data: pilot }) => {
                if (cancelled) return;
                setCurrentUser({
                  id: data.user.id, // Use auth user ID for FK constraint
                  name: pilot?.callsign || data.user?.email || 'Unknown'
                });
              });
          } else {
            setCurrentUser({
              id: data.user.id, // Use auth user ID for FK constraint
              name: data.user?.email || 'Unknown'
            });
          }
        });
    });
    return () => { cancelled = true; };
  }, []);

  // ── Realtime subscription ──
  const handleRemoteMissionUpdate = useCallback((newRow: Record<string, any>) => {
    // CRITICAL: Verify the update is for the mission we're currently viewing
    // This guards against race conditions during mission switches
    if (newRow.id && mission?.id && newRow.id !== mission.id) {
      console.warn('[REALTIME] Ignoring update for different mission:', {
        updateForMission: newRow.id,
        currentMission: mission.id
      });
      return;
    }

    // Ignore saves made by this exact tab (our own echo back from Supabase).
    // Use the per-tab session ID so same-user saves from another tab are NOT filtered out.
    // Fall back to user ID check only if session ID is absent (e.g. saves from older code).
    // IMPORTANT: If currentUser hasn't loaded yet, treat the save as a self-save.
    // This prevents a race condition during initial load where our own autosave echo
    // arrives before currentUser resolves, causing the self-filter to fail and the
    // sync effect to overwrite locally-added flights with stale DB data.
    const isSelfSave = newRow.last_modified_session
      ? newRow.last_modified_session === tabSessionId
      : (currentUser == null || newRow.last_modified_by === currentUser.id);

    console.log('[REALTIME] handleRemoteMissionUpdate:', {
      missionId: newRow.id,
      isSelfSave,
      last_modified_session: newRow.last_modified_session,
      tabSessionId,
      sessionMatch: newRow.last_modified_session === tabSessionId,
    });

    if (isSelfSave) {
      // Just update our version ref to stay in sync
      if (newRow.version != null) {
        missionVersionRef.current = newRow.version;
      }
      // Keep the support-roles hash current. Without this, echoes from OTHER users
      // carrying unchanged support_role_assignments (e.g. a collaborator saving
      // pilot_assignments after we've already saved support roles) would differ from
      // the stale initial hash and falsely increment remoteSupportRolesRevision.
      if (Array.isArray(newRow.support_role_assignments)) {
        lastRemoteSupportRolesHashRef.current = JSON.stringify(newRow.support_role_assignments);
      }
      return;
    }

    // Another user saved — update our local state with their changes.
    // Build a partial Mission from the raw row for setMissionDirect.
    // The simplest approach: refetch the mission to get a properly typed object.
    // But since we already have the raw row, we can update the version and
    // let the sync effect re-hydrate the UI state.
    if (newRow.version != null) {
      missionVersionRef.current = newRow.version;
    }

    // Update the mission object so the sync effect fires with fresh data.
    // We cast the row into a Mission-like shape — convertRowToMission is in missionService
    // but we can do a lightweight update here:
    // CRITICAL: Use newRow.id as the canonical ID to prevent cross-mission contamination
    setMissionDirect({
      ...mission!,
      id: newRow.id || mission!.id, // Prefer newRow's ID
      version: newRow.version ?? 1,
      last_modified_by: newRow.last_modified_by,
      last_modified_at: newRow.last_modified_at,
      flights: Array.isArray(newRow.flights) ? newRow.flights : mission?.flights || [],
      pilot_assignments: typeof newRow.pilot_assignments === 'object' ? newRow.pilot_assignments : mission?.pilot_assignments || {},
      support_role_assignments: Array.isArray(newRow.support_role_assignments) ? newRow.support_role_assignments : mission?.support_role_assignments || [],
      step_time: newRow.step_time !== undefined ? newRow.step_time : mission?.step_time,
      mission_settings: typeof newRow.mission_settings === 'object' && newRow.mission_settings !== null ? newRow.mission_settings : mission?.mission_settings,
      miz_file_data: typeof newRow.miz_file_data === 'object' && newRow.miz_file_data !== null ? newRow.miz_file_data : mission?.miz_file_data,
      updated_at: newRow.updated_at || mission?.updated_at || new Date().toISOString()
    } as Mission);

    // Signal the sync effect to re-run. The sync effect only watches mission.id in its
    // deps, so it won't re-run when the same mission's data changes. Incrementing this
    // counter ensures it fires and hydrates the UI from the updated mission object.
    isRemoteUpdateRef.current = true;
    setRemoteUpdateTrigger(prev => prev + 1);

    // Only signal MissionSupportAssignments when support_role_assignments content
    // actually changed. This breaks the inter-session ping-pong where pilot_assignments
    // saves (from ensureSupportRolesInAssignedPilots) trigger a support-roles reload,
    // which re-saves pilot_assignments, which the other session treats as remote, etc.
    const newSupportRolesJson = Array.isArray(newRow.support_role_assignments)
      ? JSON.stringify(newRow.support_role_assignments)
      : '';
    console.log('[REALTIME] Support roles hash check:', {
      newHash: newSupportRolesJson.substring(0, 60),
      lastHash: lastRemoteSupportRolesHashRef.current.substring(0, 60),
      changed: newSupportRolesJson !== lastRemoteSupportRolesHashRef.current
    });
    if (newSupportRolesJson !== lastRemoteSupportRolesHashRef.current) {
      console.log('[REALTIME] Support roles changed — incrementing remoteSupportRolesRevision');
      lastRemoteSupportRolesHashRef.current = newSupportRolesJson;
      setRemoteSupportRolesRevision(prev => prev + 1);
    }

    // NOTE: We do NOT reset lastSyncKey here. The remoteUpdateTrigger increment above
    // is sufficient to make the syncKey in the sync effect differ from the last recorded
    // value, which causes the sync effect to re-run and hydrate the UI from the new
    // mission data. Resetting lastSyncKey to null would allow isSyncing toggles (from
    // any subsequent save) to also trigger the sync, which would overwrite locally-added
    // flights with whatever mission.flights was at that moment — the root cause of the
    // "flight disappears after add" bug.
  }, [mission, currentUser, setMissionDirect]);

  const { isConnected, activeUsers, updatePresence } = useMissionRealtime({
    missionId: mission?.id,
    onRemoteMissionUpdate: handleRemoteMissionUpdate,
    currentUserId: currentUser?.id,
    currentUserName: currentUser?.name,
    enabled: !!mission && !missionLoading
  });

  // Local state that syncs with mission database
  const [assignedPilots, setAssignedPilotsLocal] = useState<AssignedPilotsRecord>(
    externalAssignedPilots || {}
  );
  // Ref so setPrepFlights can read the latest assignedPilots without needing it as a dep
  const assignedPilotsRef = useRef<AssignedPilotsRecord>(externalAssignedPilots || {});
  useEffect(() => { assignedPilotsRef.current = assignedPilots; }, [assignedPilots]);

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

  // Track pending support roles when no mission exists yet (for auto-mission-creation)
  const [pendingSupportRoles, setPendingSupportRoles] = useState<SupportRoleAssignment[] | null>(null);

  // Track pending flights that need to be saved after mission creation
  // This prevents the race condition where flights are cleared by sync effect before being saved
  const pendingFlightsRef = useRef<any[] | null>(null);

  // Debug prepFlights changes
  // useEffect(() => {
  //   console.log('🔄 Persistence: prepFlights state changed:', {
  //     length: prepFlights?.length || 0,
  //     flights: prepFlights?.map(f => ({ id: f.id, callsign: f.callsign })) || []
  //   });
  // }, [prepFlights]);

  // Add a flag to prevent circular updates during saves
  const [isSyncing, setIsSyncing] = useState(false);

  // Ref that always holds the latest hasPendingChanges value.
  // Used inside the sync effect so it never reads a stale closure value —
  // hasPendingChanges is not in the sync effect's dep array, which means
  // without a ref the effect can run with the old (false) value even after
  // a drag has set hasPendingChanges=true, causing it to overwrite local state.
  const hasPendingChangesRef = useRef(false);

  // Track the last sync to prevent circular updates.
  // We encode mission ID, event ID, and the remote-update revision together so that:
  //   • isSyncing toggles after a save never re-trigger a full sync (same key → skip)
  //   • Remote updates always produce a new key (remoteUpdateTrigger increments) → sync runs
  //   • We never need to "null out" the key from handleRemoteMissionUpdate
  //
  // IMPORTANT: This is a REF (not state) so the sync effect always reads the current value.
  // If stored as state, the sync effect captures a stale closure value from whichever render
  // last changed an effect dep (e.g. isSyncing) — that render may pre-date the setLastSyncKey
  // call from the initial sync, so lastSyncKey appears null, the guard is bypassed, and the
  // effect overwrites local user edits with stale DB data (the snap-back bug).
  const lastSyncKeyRef = useRef<string | null>(null);

  // Clear state when switching events
  useEffect(() => {
    // Clear state whenever the selectedEvent changes, regardless of mission state
    setAssignedPilotsLocal({});
    setMissionCommanderLocal(null);
    setPrepFlightsLocal([]);
    setExtractedFlights([]);
    setHasPendingChanges(false);
    setIsSyncing(false);
    lastSyncKeyRef.current = null;
    setPendingSupportRoles(null); // Clear pending support roles to prevent cross-event contamination
    pendingFlightsRef.current = null; // Clear pending flights to prevent cross-event contamination
  }, [selectedEvent?.id]);

  // Sync state with mission data when mission loads - ONLY run once per mission/event combination
  useEffect(() => {
    // Skip if no mission, still syncing, or mission still loading
    if (!mission || isSyncing || missionLoading) {
      return;
    }

    // Skip sync if there are pending changes to avoid overwriting user updates.
    // EXCEPTION: Remote updates always apply — the other user's save is authoritative.
    const triggeredByRemoteUpdate = isRemoteUpdateRef.current;
    if (triggeredByRemoteUpdate) {
      isRemoteUpdateRef.current = false;
    }
    if (hasPendingChangesRef.current && !triggeredByRemoteUpdate) {
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

    // Skip if we already synced this mission/event/remoteUpdateTrigger combination.
    // Including remoteUpdateTrigger means:
    //   • Normal saves (isSyncing toggle): remoteUpdateTrigger unchanged → same key → skip ✓
    //   • Remote updates: remoteUpdateTrigger incremented → new key → sync runs ✓
    // This eliminates the need to reset the key to null in handleRemoteMissionUpdate,
    // which was the root cause of flights reverting after user-initiated changes.
    //
    // Uses a REF (not state) so we always compare against the truly-latest key, never a
    // stale closure value from a prior render. State-based lastSyncKey can appear null
    // in the sync effect closure even after the initial sync has already set it, because
    // the closure was captured from a render that pre-dates the state update.
    const syncKey = `${mission.id}-${selectedEvent.id}-${remoteUpdateTrigger}`;
    if (syncKey === lastSyncKeyRef.current) {
      return;
    }

    // Mark this mission/event/remoteUpdateTrigger combination as synced
    lastSyncKeyRef.current = syncKey;

    console.log('[PERSISTENCE] sync effect firing:', {
      syncKey,
      triggeredByRemoteUpdate,
      hasPendingChanges: hasPendingChangesRef.current,
      remoteUpdateTrigger
    });
    
    // Convert database pilot assignments back to the format expected by the UI (skip save since this is loading)
    if (mission.pilot_assignments) {
      // console.log('📥 Persistence: Loading pilot assignments from database');
      
      // Get current assignments to preserve roll call status
      const currentAssignments = assignedPilots || {};
      
      // Convert PilotAssignment[] to AssignedPilotsRecord format
      const convertedAssignments: AssignedPilotsRecord = {};
      
      Object.entries(mission.pilot_assignments as Record<string, any[]>).forEach(([flightId, assignments]) => {
        convertedAssignments[flightId] = assignments
          .filter(_assignment => {
            // Keep assignments that have a pilot_id OR have a dashNumber (for empty slots)
            // But skip completely invalid entries
            if (!_assignment.pilot_id && !_assignment.dashNumber && !_assignment.dash_number) {
              return false;
            }
            return true;
          })
          .map(assignment => {
          // If it's already in UI format (has dashNumber), use it as-is
          if (assignment.dashNumber) {
            // Preserve roll call status from current assignments or database
            const existingPilot = currentAssignments[flightId]?.find(p => p.id === assignment.id || p.boardNumber === assignment.boardNumber);

            // Look up attendance status from realtime data only if available
            const discordId = (assignment as any).discord_id;
            const realtimeRecord = discordId && realtimeAttendanceData && realtimeAttendanceData.length > 0
              ? realtimeAttendanceData.find(record => record.discord_id === discordId)
              : undefined;

            const result: any = {
              ...assignment,
              // Prioritize existing pilot data if database value is null (prevents overwriting local changes)
              rollCallStatus: existingPilot?.rollCallStatus || assignment.roll_call_status
            };

            // Only set attendanceStatus if we actually have realtime data
            // Otherwise omit it entirely and let MissionPreparation effect handle it
            if (realtimeRecord?.response !== undefined) {
              result.attendanceStatus = realtimeRecord.response;
            }

            return result;
          }

          // Convert from database format (PilotAssignment) to UI format (AssignedPilot)
          // Look up the full pilot data using pilot_id
          const fullPilotData = activePilots?.find(pilot => pilot.id === assignment.pilot_id);

          if (fullPilotData) {
            // Check if there's existing roll call data for this pilot
            const existingPilot = currentAssignments[flightId]?.find(p => p.id === assignment.pilot_id || p.boardNumber === fullPilotData.boardNumber);

            // Look up attendance status from realtime data only if available
            const discordId = (fullPilotData as any).discord_id;
            const realtimeRecord = discordId && realtimeAttendanceData && realtimeAttendanceData.length > 0
              ? realtimeAttendanceData.find(record => record.discord_id === discordId)
              : undefined;

            // Use full pilot data with database assignment info
            const result: any = {
              ...fullPilotData,
              dashNumber: assignment.dash_number,
              flight_id: assignment.flight_id,
              slot_number: assignment.slot_number,
              mids_a_channel: assignment.mids_a_channel || '',
              mids_b_channel: assignment.mids_b_channel || '',
              // Prioritize existing pilot data if database value is null (prevents overwriting local changes)
              rollCallStatus: existingPilot?.rollCallStatus || assignment.roll_call_status
            };

            // Only set attendanceStatus if we actually have realtime data
            // Otherwise omit it entirely and let MissionPreparation effect handle it
            if (realtimeRecord?.response !== undefined) {
              result.attendanceStatus = realtimeRecord.response;
            }

            return result;
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
              // Omit attendanceStatus - let MissionPreparation effect handle it
            };
          }
        });
      });
      
      // CRITICAL: Ensure all flights from mission.flights have entries in assignedPilots
      // even if they have no pilot assignments yet (prevents display issues)
      if (mission.flights && Array.isArray(mission.flights)) {
        mission.flights.forEach(missionFlight => {
          if (missionFlight.id && !convertedAssignments[missionFlight.id]) {
            // Initialize with empty array for flights with no assignments
            convertedAssignments[missionFlight.id] = [];
            console.log('📋 Persistence: Initialized empty pilot array for flight:', missionFlight.id);
          }
        });
      }

      // Do NOT preserve support-* entries here.  MissionSupportAssignments owns that
      // state and re-adds entries via the ensureSupportRoles effect after every sync.
      // Preserving them was causing the real-time sync regression: stale local support
      // data would be kept across remote updates and the large assignedPilots effect
      // would detect a change (old enriched pilots vs new minimal pilots), trigger a
      // redundant save, and create a ping-pong loop between browser sessions.
      console.log('[PERSISTENCE] sync: setting assignedPilots from DB, flight keys:', Object.keys(convertedAssignments).filter(k => !k.startsWith('support-')).length);
      assignedPilotsRef.current = convertedAssignments;
      setAssignedPilotsLocal(convertedAssignments);
    } else {
      // If no pilot assignments, but we have flights, initialize empty arrays for each
      const emptyAssignments: AssignedPilotsRecord = {};
      if (mission.flights && Array.isArray(mission.flights)) {
        mission.flights.forEach(missionFlight => {
          if (missionFlight.id) {
            emptyAssignments[missionFlight.id] = [];
          }
        });
      }
      // Do NOT preserve support-* entries (same reasoning as above).
      console.log('[PERSISTENCE] sync: setting assignedPilots to empty (no pilot assignments in DB)');
      assignedPilotsRef.current = emptyAssignments;
      setAssignedPilotsLocal(emptyAssignments);
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
      // Remote updates are always authoritative — skip all local-state protection guards.
      // The protection guards exist to prevent a stale DB read from wiping locally-added
      // flights that haven't been saved yet. But when another user explicitly deleted all
      // flights, we must honour that deletion even if local state still shows some flights.
      if (!triggeredByRemoteUpdate && flightsJustExtractedRef.current) {
        console.log('🛡️ Persistence: Protecting newly extracted flights from being cleared');
      } else if (!triggeredByRemoteUpdate && pendingFlightsRef.current && pendingFlightsRef.current.length > 0) {
        console.log('🛡️ Persistence: Protecting pending flights from being cleared, will save them now');
        // Don't clear - instead, restore from pending and trigger save
        setPrepFlightsLocal(pendingFlightsRef.current);
      } else if (!triggeredByRemoteUpdate && prepFlights && prepFlights.length > 0) {
        // CRITICAL: Don't clear flights that exist in local state but not yet in DB
        // This happens when flights were just added and mission was just created
        console.log('🛡️ Persistence: Protecting existing local flights from being cleared:', prepFlights.length);
      } else {
        // Before clearing, check if pilot_assignments has flight keys — if so, reconstruct
        // placeholder cards. This is a safety net for the race where flights were never saved
        // but pilot assignments were (e.g. missionLoading deferred path).
        const pilotFlightKeys = Object.keys(mission?.pilot_assignments || {})
          .filter(k => !k.startsWith('support-'));

        if (pilotFlightKeys.length > 0 && !triggeredByRemoteUpdate) {
          const callsignCounters: Record<string, number> = {};
          const reconstructed = pilotFlightKeys
            .map((flightId) => {
              const parts = flightId.split('-');
              let callsign = 'FLIGHT';
              let sortIndex = 0;
              if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
                callsign = parts[1];
                sortIndex = parseInt(parts[2]) || 0;
              }
              return { flightId, callsign, sortIndex };
            })
            .sort((a, b) => a.callsign.localeCompare(b.callsign) || a.sortIndex - b.sortIndex)
            .map(({ flightId, callsign }, idx) => {
              callsignCounters[callsign] = (callsignCounters[callsign] || 0) + 1;
              return {
                id: flightId,
                callsign,
                flightNumber: callsignCounters[callsign].toString(),
                pilots: [
                  { boardNumber: '', callsign: '', dashNumber: '1' },
                  { boardNumber: '', callsign: '', dashNumber: '2' },
                  { boardNumber: '', callsign: '', dashNumber: '3' },
                  { boardNumber: '', callsign: '', dashNumber: '4' },
                ],
                midsA: '',
                midsB: '',
                creationOrder: idx,
              };
            });
          console.log('[PERSISTENCE] sync: reconstructed', reconstructed.length, 'flights from pilot_assignments (flights field was empty)');
          setPrepFlightsLocal(reconstructed);
        } else {
          // Clear flights — either DB has no flights, or a remote user deleted them all
          setPrepFlightsLocal([]);
        }
      }
    }
  }, [mission?.id, selectedEvent?.id, activePilots?.length, missionLoading, isSyncing, remoteUpdateTrigger]);

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
  hasPendingChangesRef.current = hasPendingChanges; // keep ref in sync on every render
  const [pendingOperations, setPendingOperations] = useState<Array<() => Promise<boolean>>>([]);

  // Check if any drag operation is in progress globally
  const isDragInProgress = document.body.classList.contains('dragging');

  // Ref to the latest pending save so forceSavePendingChanges can execute it
  const latestPendingSaveRef = useRef<(() => Promise<boolean>) | null>(null);

  const debouncedSave = useCallback((
    saveFunction: () => Promise<boolean>,
    delay: number = 1000
  ) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Store the latest save function so it can be force-executed
    latestPendingSaveRef.current = saveFunction;

    // Check for drag state at call time
    const dragInProgress = document.body.classList.contains('dragging');

    // If drag is in progress, queue the operation instead of executing immediately
    if (dragInProgress) {
      setPendingOperations(prev => [...prev, saveFunction]);
      return;
    }

    setHasPendingChanges(true);

    // Capture the mission/event IDs at call time for consistency check
    const capturedMissionId = mission?.id;
    const capturedEventId = selectedEvent?.id;

    const timeout = setTimeout(async () => {
      // Double-check drag state before executing
      const stillDragging = document.body.classList.contains('dragging');
      if (stillDragging) {
        console.log('🚫 Persistence: Drag started during delay, re-queuing operation');
        setPendingOperations(prev => [...prev, saveFunction]);
        setHasPendingChanges(false);
        return;
      }

      // CRITICAL: Verify mission/event haven't changed during debounce
      if (mission?.id !== capturedMissionId || selectedEvent?.id !== capturedEventId) {
        console.error('🚨 Persistence: Mission/Event changed during debounce - aborting save');
        setHasPendingChanges(false);
        latestPendingSaveRef.current = null;
        return;
      }

      try {
        console.log('💾 Persistence: Executing save operation');
        await saveFunction();
        latestPendingSaveRef.current = null;
      } catch (error) {
        console.error('Error saving mission data:', error);
      } finally {
        setHasPendingChanges(false);
      }
    }, delay);

    setSaveTimeout(timeout);
  }, [saveTimeout, mission?.id, selectedEvent?.id]);

  // Force-execute any pending save immediately (for unsaved changes dialog)
  const forceSavePendingChanges = useCallback(async () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      setSaveTimeout(null);
    }
    const pendingSave = latestPendingSaveRef.current;
    if (pendingSave) {
      latestPendingSaveRef.current = null;
      try {
        await pendingSave();
      } catch (error) {
        console.error('Error force-saving pending changes:', error);
      } finally {
        setHasPendingChanges(false);
      }
    }
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
    const pilotsCount = Object.values(pilots).reduce((total, flight) => total + flight.length, 0);

    console.log('📝 Persistence: setAssignedPilots called:', {
      pilotsCount,
      skipSave,
      hasMission: !!mission,
      missionId: mission?.id
    });

    // Capture the OLD non-support JSON BEFORE updating the ref.
    // The ref update below is synchronous — if we compare after, both sides read the same
    // (new) value and the comparison always says "only support changed", silently dropping
    // every regular flight pilot assignment.
    const previousNonSupportJson = JSON.stringify(
      Object.entries(assignedPilotsRef.current).filter(([k]) => !k.startsWith('support-'))
    );

    setAssignedPilotsLocal(pilots);
    // Keep ref in sync immediately so any concurrently-running child effects (e.g.
    // ensureSupportRoles) read the up-to-date value rather than the previous render's.
    assignedPilotsRef.current = pilots;

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
      
      // Skip debouncedSave when only support-role structure changed.
      // Support-role entries are filtered out of the pilot_assignments save anyway, so
      // triggering debouncedSave here would only cancel a pending drag save for no benefit.
      // This is the main cause of the "pilot not assigned on first drag" bug when a
      // Mission Support card exists: ensureSupportRolesInAssignedPilots fires, calls
      // setAssignedPilots, and debouncedSave replaces/cancels the pending drag save.
      const newNonSupportJson = JSON.stringify(
        Object.entries(pilots).filter(([k]) => !k.startsWith('support-'))
      );
      if (previousNonSupportJson === newNonSupportJson) {
        console.log('⏭️ Persistence: Skipping pilot assignments save - only support-role entries changed');
        return;
      }

      console.log('💾 Persistence: Scheduling database save...');
      debouncedSave(async () => {
        setIsSyncing(true);
        try {
          const pilotAssignments: Record<string, PilotAssignment[]> = {};
          
          // CRITICAL: Ensure ALL flights from prepFlights are represented, even if empty
          // This prevents accidentally deleting flight assignments when only support roles are updated
          if (prepFlights && prepFlights.length > 0) {
            prepFlights.forEach(flight => {
              if (flight.id && !flight.id.startsWith('support-')) {
                // Initialize with empty array if not in pilots object
                if (!pilots[flight.id]) {
                  pilotAssignments[flight.id] = [];
                }
              }
            });
          }
          
          Object.entries(pilots).forEach(([flightId, pilotsList]) => {
            // CRITICAL: Skip support role entries - they are saved separately via MissionSupportAssignments
            // This prevents cross-mission contamination when switching between missions
            if (flightId.startsWith('support-')) {
              return;
            }

            // Filter out empty pilots (those without an id or boardNumber)
            const validPilots = pilotsList.filter(pilot => pilot.id && pilot.boardNumber);

            // Look up flight-level MIDS values to compute per-section channels
            const flight = prepFlights?.find((f: any) => f.id === flightId);
            const flightMidsA = flight?.midsA || '';
            const flightMidsB = flight?.midsB || '';
            const flightMidsANum = parseInt(flightMidsA) || 0;

            // Always include the flight key, even if empty
            pilotAssignments[flightId] = validPilots.map((pilot, _index) => {
              // Dash 3 and 4 are in the second section and get midsA + 1
              const dashNum = parseInt(pilot.dashNumber || '0');
              const isSecondSection = dashNum >= 3 && flightMidsANum > 0;
              const pilotMidsA = isSecondSection ? (flightMidsANum + 1).toString() : flightMidsA;

              return {
                pilot_id: pilot.id,
                flight_id: flightId,
                slot_number: pilotsList.indexOf(pilot) + 1, // Use original index
                dash_number: pilot.dashNumber,
                mids_a_channel: pilotMidsA,
                mids_b_channel: flightMidsB,
                roll_call_status: pilot.rollCallStatus || null
              };
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
  }, [mission, selectedEvent, debouncedSave, updatePilotAssignments, prepFlights]);

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

  // Effect to save pending support roles after mission creation
  useEffect(() => {
    if (mission && pendingSupportRoles && pendingSupportRoles.length > 0) {
      console.log('📝 Persistence: Saving pending support roles after mission creation:', pendingSupportRoles.length);
      updateSupportRoles(pendingSupportRoles).then((result) => {
        console.log('✅ Persistence: Pending support roles saved:', result);
        setPendingSupportRoles(null);
      }).catch((error) => {
        console.error('❌ Persistence: Error saving pending support roles:', error);
        setPendingSupportRoles(null);
      });
    }
  }, [mission, pendingSupportRoles, updateSupportRoles]);

  // Effect to save pending flights after mission creation
  useEffect(() => {
    if (mission && pendingFlightsRef.current && pendingFlightsRef.current.length > 0) {
      const flightsToSave = pendingFlightsRef.current;
      console.log('📝 Persistence: Saving pending flights after mission creation:', flightsToSave.length);

      // Convert to mission flight format
      const missionFlights: MissionFlight[] = flightsToSave.map((flight) => ({
        id: flight.id || `flight_${Date.now()}_${Math.random()}`,
        callsign: flight.callsign || flight.name || 'UNKNOWN',
        squadron_id: flight.squadron_id,
        aircraft_type: flight.aircraftType || flight.type || 'F/A-18C',
        slots: flight.slots || flight.pilots?.length || 2,
        flight_data: {
          flightNumber: flight.flightNumber || '1',
          pilots: flight.pilots || [],
          midsA: flight.midsA || '',
          midsB: flight.midsB || '',
          creationOrder: flight.creationOrder || 0,
          metadata: flight.metadata,
          units: flight.units,
          route: flight.route,
          frequency: flight.frequency,
          modulation: flight.modulation,
          ...flight
        }
      }));

      // Clear the ref before saving to prevent re-triggering
      pendingFlightsRef.current = null;

      updateFlights(missionFlights).then((result) => {
        console.log('✅ Persistence: Pending flights saved:', result);
      }).catch((error) => {
        console.error('❌ Persistence: Error saving pending flights:', error);
      });
    }
  }, [mission?.id, updateFlights]);

  const setPrepFlights = useCallback((flights: any[], skipSave: boolean = false) => {
    // Guard against reference-cycling: when FlightAssignments reflects back prop-driven
    // changes (skipSave=true), only update state if the flight IDs actually changed.
    // Without this, the loop is:
    //   setPrepFlightsLocal(newRef) → initialFlights changes → Effect1: setFlights →
    //   useEffect[flights]: onFlightsChange(skipSave=true) → setPrepFlightsLocal(newRef) → repeat
    if (skipSave && flights.length > 0) {
      const currentIds = (prepFlights || []).map((f: any) => f.id).sort().join(',');
      const newIds = flights.map((f: any) => f.id).sort().join(',');
      if (currentIds === newIds) return;
    }

    setPrepFlightsLocal(flights);

    // If flights are being cleared, reset the processed flights ref to allow re-importing
    if (flights.length === 0) {
      console.log('🔄 useMissionPrepDataPersistence: Flights cleared, resetting processed flights ref');
      processedFlightsRef.current = null;
    }

    // Save to database with shorter delay for flights (immediate user feedback)
    if (selectedEvent && !skipSave) {
      // If no mission exists but we have flights to save, trigger mission creation
      // ONLY if we're not still loading the mission (to avoid race condition)
      if (!mission && flights.length > 0) {
        if (missionLoading) {
          console.log('⏳ Persistence: Mission still loading, deferring flight save');
          pendingFlightsRef.current = flights; // Capture so pending-flights effect can save after mission loads
          return;
        }
        console.log('📝 Triggering mission creation for flight assignments in event:', selectedEvent.id);
        // Store flights to be saved after mission creation
        pendingFlightsRef.current = flights;
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

        // Also save pilot_assignments filtered to only the flights being saved.
        // This handles the case where a flight is deleted: setAssignedPilots schedules
        // a pilot-assignments save, but setPrepFlights fires immediately after and
        // cancels it (debouncedSave clears the previous timeout). By re-saving here we
        // ensure the DB doesn't keep stale assignments for deleted flights.
        const flightIds = new Set(flights.map((f: any) => f.id).filter(Boolean));
        const currentAssignments = assignedPilotsRef.current;
        const filteredPilotAssignments: Record<string, PilotAssignment[]> = {};
        // Include all current flights (even those with no pilots) so DB stays consistent
        flightIds.forEach(flightId => {
          const pilotsList = currentAssignments[flightId] || [];
          const validPilots = pilotsList.filter((pilot: any) => pilot.id && pilot.boardNumber);
          filteredPilotAssignments[flightId] = validPilots.map((pilot: any) => ({
            pilot_id: pilot.id,
            flight_id: flightId,
            slot_number: pilotsList.indexOf(pilot) + 1,
            dash_number: pilot.dashNumber,
            mids_a_channel: pilot.midsAChannel || '',
            mids_b_channel: pilot.midsBChannel || '',
            roll_call_status: pilot.rollCallStatus || null
          }));
        });

        await updateFlights(missionFlights);
        return updatePilotAssignments(filteredPilotAssignments);
      }, 500); // Balanced delay for flight updates
    }
  }, [mission, selectedEvent, debouncedSave, updateFlights, updatePilotAssignments, prepFlights]);

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

  // Track if flights were just extracted to prevent clearing them
  const flightsJustExtractedRef = useRef<boolean>(false);

  // Reset processed flights ref when event changes
  useEffect(() => {
    processedFlightsRef.current = null;
    flightsJustExtractedRef.current = false;
  }, [selectedEvent?.id]);

  // Handle extracted flights from .miz import
  const handleExtractedFlights = useCallback((flights: any[], importMode: string = 'clear') => {
    console.log('🛫 useMissionPrepDataPersistence: Processing extracted flights:', flights.length, 'with mode:', importMode);

    // Create a unique key for this batch of flights
    const flightKey = flights.map(f => f.name).sort().join(',');

    // For clear mode, always process (reset the ref first to allow re-import)
    // For merge mode, always process (to add new flights)
    // For other modes, skip if we've already processed this exact set
    if (importMode === 'clear') {
      console.log('🗑️ useMissionPrepDataPersistence: Clear mode - resetting processed flights ref');
      processedFlightsRef.current = null; // Allow re-processing
    } else if (importMode !== 'merge' && processedFlightsRef.current === flightKey) {
      console.log('⚠️ useMissionPrepDataPersistence: Skipping duplicate flight processing for key:', flightKey);
      return;
    }

    processedFlightsRef.current = flightKey;
    flightsJustExtractedRef.current = true; // Mark that flights were just extracted

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

    // Handle different import modes
    if (importMode === 'merge') {
      // Merge: Only add flights that don't already exist
      const existingFlightKeys = new Set(
        prepFlights.map(f => `${f.callsign}-${f.flightNumber}`.toUpperCase())
      );

      const newFlights = convertedFlights.filter(flight => {
        const flightKey = `${flight.callsign}-${flight.flightNumber}`.toUpperCase();
        return !existingFlightKeys.has(flightKey);
      });

      console.log(`🔀 useMissionPrepDataPersistence: Merging flights - ${newFlights.length} new, ${convertedFlights.length - newFlights.length} skipped (already exist)`);

      // Append new flights to existing ones, preserving creation order
      const maxOrder = prepFlights.reduce((max, f) => Math.max(max, f.creationOrder || 0), -1);
      const mergedFlights = [
        ...prepFlights,
        ...newFlights.map((f, i) => ({ ...f, creationOrder: maxOrder + i + 1 }))
      ];

      setPrepFlights(mergedFlights);
    } else if (importMode === 'clear') {
      // Clear: Replace all flights (assignments already cleared by MissionDetails)
      console.log('🗑️ useMissionPrepDataPersistence: Clearing all flights and replacing with new flights');
      setPrepFlights(convertedFlights);
    }
    // For 'dataOnly' mode, we don't process flights at all (handled by shouldExtractFlights in MissionDetails)

    // Reset the flag after a short delay to allow mission creation to complete
    setTimeout(() => {
      flightsJustExtractedRef.current = false;
      console.log('🔓 useMissionPrepDataPersistence: Flights extraction protection released');
    }, 3000); // 3 seconds should be enough for mission creation
  }, [setPrepFlights, prepFlights]);

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
    hasPendingChanges,

    // Real-time collaboration
    isConnected,
    activeUsers,
    updatePresence,
    forceSavePendingChanges,
    remoteUpdateTrigger,
    remoteSupportRolesRevision,

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

    updateSupportRoles: (roles: SupportRoleAssignment[]) => {
      if (mission) {
        return updateSupportRoles(roles);
      }

      // No mission exists - trigger mission creation if we have roles to save
      if (roles && roles.length > 0 && selectedEvent && !missionLoading) {
        console.log('📝 Persistence: Triggering mission creation for support role assignments in event:', selectedEvent.id);
        setPendingSupportRoles(roles);
        setNeedsMissionCreation(true);
        return Promise.resolve(true); // Indicate that save will happen after mission creation
      }

      return Promise.resolve(false);
    },

    // Flight extraction handler
    handleExtractedFlights
  };
};