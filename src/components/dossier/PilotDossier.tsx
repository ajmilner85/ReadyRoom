import React, { useState, useEffect, useMemo } from 'react';
import { BookUser } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { usePageLoading } from '../../context/PageLoadingContext';
import { useAppSettings } from '../../context/AppSettingsContext';
import DossierDetailsCard from './DossierDetailsCard';
import DossierScopeCard from './DossierScopeCard';
import DossierStatsCard from './DossierStatsCard';
import DossierAttendanceCard from './DossierAttendanceCard';
import DossierTimelineCard from './DossierTimelineCard';
import DossierTrapSheetCard from './DossierTrapSheetCard';
import DossierAwardsCard from './DossierAwardsCard';
import { dossierStyles } from './dossierStyles';
import { ConfirmationDialog } from '../ui/dialogs/ConfirmationDialog';
import AwardsManagerDialog from './AwardsManagerDialog';
import { getPilotAwards, type PilotAward } from '../../utils/awardService';
import {
  getDossierProfile,
  getDossierStats,
  getDossierCycles,
  getCycleEvents,
  getPilotTraps,
  getDossierPilotList,
  getDossierAttendance,
  getScopeMissionIds,
  deleteTimelineRecord,
  updateTimelineRecordDate,
  getLastFlownScope,
  type DossierProfile,
  type DossierStats,
  type DossierCycle,
  type DossierEventOption,
  type DossierScope,
  type DossierPilotOption,
  type DossierAttendance as DossierAttendanceData,
  type TrapRecord,
  type TimelineEvent
} from '../../utils/dossierService';
import { supabase } from '../../utils/supabaseClient';

const PilotDossier: React.FC = () => {
  const { userProfile } = useAuth();
  const { setPageLoading } = usePageLoading();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { settings } = useAppSettings();

  const ownPilotId = userProfile?.pilot?.id;

  // Pilot selection
  const [pilotOptions, setPilotOptions] = useState<DossierPilotOption[]>([]);
  const [selectedPilotId, setSelectedPilotId] = useState<string | null>(ownPilotId || null);

  // Selected pilot data
  const [profile, setProfile] = useState<DossierProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [discordId, setDiscordId] = useState<string | null>(null);
  const [discordUsername, setDiscordUsername] = useState<string | null>(null);
  const [traps, setTraps] = useState<TrapRecord[]>([]);
  const [trapsLoading, setTrapsLoading] = useState(true);
  const [pilotAwards, setPilotAwards] = useState<PilotAward[]>([]);
  const [showAwardsManager, setShowAwardsManager] = useState(false);

  // Scope drill-down (career → cycle → event)
  const [cycles, setCycles] = useState<DossierCycle[]>([]);
  const [scope, setScope] = useState<DossierScope>({});
  const [cycleEvents, setCycleEvents] = useState<DossierEventOption[]>([]);
  const [cycleEventsLoading, setCycleEventsLoading] = useState(false);
  const [scopeMissionIds, setScopeMissionIds] = useState<string[] | null>(null);

  // Scope-dependent data
  const [stats, setStats] = useState<DossierStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [attendance, setAttendance] = useState<DossierAttendanceData | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  // Timeline edit mode
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TimelineEvent | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // Last-mission scope shortcut
  const [findingLastMission, setFindingLastMission] = useState(false);
  const [scopeNotice, setScopeNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPilotId && ownPilotId) {
      setSelectedPilotId(ownPilotId);
    }
  }, [ownPilotId, selectedPilotId]);

  // Clear the nav loading indicator once data is in (same pattern as RosterManagement)
  useEffect(() => {
    if (!profileLoading) {
      setPageLoading('dossier', false);
    }
  }, [profileLoading, setPageLoading]);

  // Load static reference data once: cycles + pilot list
  useEffect(() => {
    let isMounted = true;
    Promise.all([getDossierCycles(), getDossierPilotList()]).then(([cyclesResult, pilotsResult]) => {
      if (!isMounted) return;
      setCycles(cyclesResult.data || []);
      setPilotOptions(pilotsResult.data || []);
    });
    return () => { isMounted = false; };
  }, []);

  // Pilots the viewer may open, per view_pilot_dossiers scopes (own dossier is always allowed).
  // RLS on the underlying tables provides the real enforcement.
  const viewablePilots = useMemo(() => {
    if (permissionsLoading) {
      return pilotOptions.filter(p => p.id === ownPilotId);
    }
    return pilotOptions.filter(p =>
      p.id === ownPilotId ||
      hasPermission('view_pilot_dossiers', {
        squadronId: p.squadronId || undefined,
        wingId: p.wingId || undefined
      })
    );
  }, [pilotOptions, ownPilotId, hasPermission, permissionsLoading]);

  // If the current selection becomes non-viewable (e.g. permissions loaded), fall back to own dossier
  useEffect(() => {
    if (!selectedPilotId || pilotOptions.length === 0) return;
    const stillViewable = viewablePilots.some(p => p.id === selectedPilotId);
    if (!stillViewable && ownPilotId && selectedPilotId !== ownPilotId) {
      setSelectedPilotId(ownPilotId);
    }
  }, [viewablePilots, selectedPilotId, ownPilotId, pilotOptions.length]);

  const selectedPilotOption = pilotOptions.find(p => p.id === selectedPilotId);
  const isOwnDossier = selectedPilotId === ownPilotId;
  const callsign = selectedPilotOption?.callsign || userProfile?.pilot?.callsign || '';
  const boardNumber = selectedPilotOption?.boardNumber ?? userProfile?.pilot?.boardNumber ?? '';

  // Awards in the selected scope, most recent first (already sorted by service).
  // Only explicit cycle/event linkage counts — dates are never inferred, since
  // multiple cycles can run concurrently.
  const scopedAwards = useMemo(() => {
    if (scope.eventId) {
      return pilotAwards.filter(a => a.event_id === scope.eventId);
    }
    if (scope.cycleId) {
      return pilotAwards.filter(a => a.cycle_id === scope.cycleId);
    }
    return pilotAwards;
  }, [pilotAwards, scope]);

  const canManageAwardLibrary = !permissionsLoading && hasPermission('manage_awards');
  const canIssueAwards = !permissionsLoading && hasPermission('issue_awards');

  // Editing: own dossier requires holding the permission at any scope; others by target scope
  const canEdit = useMemo(() => {
    if (permissionsLoading || !selectedPilotId) return false;
    if (isOwnDossier) {
      return hasPermission('edit_pilot_dossiers');
    }
    return hasPermission('edit_pilot_dossiers', {
      squadronId: selectedPilotOption?.squadronId || undefined,
      wingId: selectedPilotOption?.wingId || undefined
    });
  }, [permissionsLoading, selectedPilotId, isOwnDossier, hasPermission, selectedPilotOption]);

  // Load per-pilot data (Discord identity, profile/timeline, traps)
  const loadPilotData = async (pilotId: string) => {
    setProfileLoading(true);
    setTrapsLoading(true);
    try {
      const { data: pilotRecord } = await supabase
        .from('pilots')
        .select('discord_id, discord_username')
        .eq('id', pilotId)
        .single();

      const pilotDiscordId = pilotRecord?.discord_id || null;
      setDiscordId(pilotDiscordId);
      setDiscordUsername(pilotRecord?.discord_username || null);

      const [profileResult, trapsResult, awardsResult] = await Promise.all([
        getDossierProfile(pilotId, pilotDiscordId),
        getPilotTraps(pilotId),
        getPilotAwards(pilotId)
      ]);

      if (profileResult.error) {
        console.error('Error loading dossier profile:', profileResult.error);
      }
      setProfile(profileResult.data);
      setTraps(trapsResult.data || []);
      setPilotAwards(awardsResult.data || []);
      return pilotDiscordId;
    } catch (error) {
      console.error('Error loading dossier:', error);
      return null;
    } finally {
      setProfileLoading(false);
      setTrapsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedPilotId) {
      setProfileLoading(false);
      setTrapsLoading(false);
      return;
    }
    let isMounted = true;
    loadPilotData(selectedPilotId).then(() => {
      if (!isMounted) return;
    });
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPilotId]);

  // Load events for the selected cycle (scope drill-down)
  useEffect(() => {
    if (!scope.cycleId) {
      setCycleEvents([]);
      return;
    }
    let isMounted = true;
    setCycleEventsLoading(true);
    getCycleEvents(scope.cycleId).then(({ data }) => {
      if (!isMounted) return;
      setCycleEvents(data || []);
      setCycleEventsLoading(false);
    });
    return () => { isMounted = false; };
  }, [scope.cycleId]);

  // Resolve scope to mission IDs (used by the trap sheet filter)
  useEffect(() => {
    let isMounted = true;
    getScopeMissionIds(scope).then(ids => {
      if (isMounted) setScopeMissionIds(ids);
    });
    return () => { isMounted = false; };
  }, [scope]);

  // Load scope-dependent data: statistics + attendance
  useEffect(() => {
    if (!selectedPilotId || profileLoading) return;
    let isMounted = true;
    setStatsLoading(true);
    setAttendanceLoading(true);

    getDossierStats(selectedPilotId, discordId, scope).then(({ data, error }) => {
      if (!isMounted) return;
      if (error) console.error('Error loading dossier stats:', error);
      setStats(data);
      setStatsLoading(false);
    });

    getDossierAttendance(discordId, scope).then(({ data, error }) => {
      if (!isMounted) return;
      if (error) console.error('Error loading dossier attendance:', error);
      setAttendance(data);
      setAttendanceLoading(false);
    });

    return () => { isMounted = false; };
  }, [selectedPilotId, discordId, scope, profileLoading]);

  const handleScopeChange = (newScope: DossierScope) => {
    setScope(newScope);
  };

  const handleSelectLastMission = async () => {
    if (!selectedPilotId) return;
    setFindingLastMission(true);
    setScopeNotice(null);
    try {
      const lastScope = await getLastFlownScope(discordId);
      if (lastScope) {
        setScope(lastScope);
      } else {
        setScopeNotice('No attended missions found for this pilot');
        setTimeout(() => setScopeNotice(null), 5000);
      }
    } finally {
      setFindingLastMission(false);
    }
  };

  const handleConfirmDelete = async () => {
    const event = pendingDelete;
    setPendingDelete(null);
    if (!event?.source || !selectedPilotId) return;

    setBusyEventId(event.id);
    setTimelineError(null);
    try {
      const { success, error } = await deleteTimelineRecord(event.source.table, event.source.id);
      if (!success) {
        setTimelineError(error?.message || 'Failed to delete the record.');
        return;
      }
      // Reload profile so details and timeline reflect the deletion
      await loadPilotData(selectedPilotId);
    } finally {
      setBusyEventId(null);
    }
  };

  const handleEditTimelineEventDate = async (event: TimelineEvent, newDate: string) => {
    if (!event.source || !selectedPilotId) return;

    setBusyEventId(event.id);
    setTimelineError(null);
    try {
      const { success, error } = await updateTimelineRecordDate(
        event.source.table,
        event.source.id,
        event.source.dateColumn,
        newDate
      );
      if (!success) {
        setTimelineError(error?.message || 'Failed to update the date.');
      }
      // Reload either way so the timeline reflects the stored value
      await loadPilotData(selectedPilotId);
    } finally {
      setBusyEventId(null);
    }
  };

  // No linked pilot record — nothing to show
  if (!userProfile?.pilot) {
    return (
      <div style={dossierStyles.container}>
        <div style={{ ...dossierStyles.contentWrapper, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
              <BookUser size={96} style={{ color: '#D1D5DB' }} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#1E293B', marginBottom: '12px' }}>
              No Pilot Record Linked
            </h2>
            <p style={{ fontSize: '14px', color: '#9CA3AF' }}>
              Your account is not linked to a pilot record, so there is no dossier to display.
              Contact your squadron administrator to have your Discord account linked to your pilot record.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={dossierStyles.container}>
      <div style={dossierStyles.contentWrapper}>
        <div style={dossierStyles.columnsContainer}>
          {/* Left column: pilot details */}
          <div style={{ width: '620px', flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <DossierDetailsCard
              callsign={callsign}
              boardNumber={boardNumber}
              discordUsername={discordUsername || (isOwnDossier ? userProfile.discordUsername : null)}
              profile={profile}
              loading={profileLoading}
              viewablePilots={viewablePilots}
              selectedPilotId={selectedPilotId || ''}
              onSelectPilot={setSelectedPilotId}
            />
          </div>

          {/* Center column: scope drill-down filtering statistics, attendance, trap sheet, awards */}
          <div
            className="dossier-scroll-column"
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              height: '100%',
              overflowY: 'auto',
              paddingRight: '12px',
              paddingBottom: '2px'
            }}
          >
            <DossierScopeCard
              cycles={cycles}
              cycleEvents={cycleEvents}
              scope={scope}
              onScopeChange={handleScopeChange}
              loadingEvents={cycleEventsLoading}
              onSelectLastMission={handleSelectLastMission}
              findingLastMission={findingLastMission}
              notice={scopeNotice}
            />
            <DossierStatsCard stats={stats} loading={statsLoading} />
            <DossierAttendanceCard attendance={attendance} loading={attendanceLoading} />
            <DossierTrapSheetCard traps={traps} loading={trapsLoading} scopeMissionIds={scopeMissionIds} />
            <DossierAwardsCard
              awards={scopedAwards}
              loading={profileLoading}
              canManage={canManageAwardLibrary || canIssueAwards}
              onOpenManager={() => setShowAwardsManager(true)}
            />
          </div>

          {/* Right column: timeline spanning the page height */}
          <DossierTimelineCard
            timeline={profile?.timeline || []}
            loading={profileLoading}
            canEdit={canEdit}
            onDeleteEvent={setPendingDelete}
            onEditEventDate={handleEditTimelineEventDate}
            busyEventId={busyEventId}
            errorMessage={timelineError}
            squadronPalette={settings.interfaceThemeUsesSquadronColors ? (profile?.squadron?.color_palette || null) : null}
          />
        </div>
      </div>

      <AwardsManagerDialog
        isOpen={showAwardsManager}
        onClose={() => setShowAwardsManager(false)}
        pilots={pilotOptions}
        cycles={cycles}
        issuedByProfileId={userProfile?.id || null}
        canManageLibrary={canManageAwardLibrary}
        canIssue={canIssueAwards}
        onChanged={() => { if (selectedPilotId) loadPilotData(selectedPilotId); }}
      />

      <ConfirmationDialog
        isOpen={pendingDelete !== null}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
        title="Delete History Record"
        message={`"${pendingDelete?.title || ''}" — this permanently removes the underlying history record and cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        icon="trash"
      />
    </div>
  );
};

export default PilotDossier;
