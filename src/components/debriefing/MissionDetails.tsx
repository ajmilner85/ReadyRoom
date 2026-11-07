import React, { useState, useEffect } from 'react';
import FlightListItem from './FlightListItem';
import FlightDebriefForm from './FlightDebriefForm';
import MissionSummaryWithPopups from './MissionSummaryWithPopups';
import type { PilotAssignment } from '../../types/MissionTypes';
import type { FlightDebrief } from '../../types/DebriefingTypes';
import type { Squadron } from '../../utils/squadronService';
import { Chip, EmptyState, Icon, SectionCard, SectionLabel, Select, SquadronInsignia, squadronColor } from '../ui/primitives';
import type { Tone } from '../ui/primitives';
import { debriefingService } from '../../services/debriefingService';
import { killTrackingService } from '../../services/killTrackingService';

type OutcomeValue = 'pending' | 'success' | 'partial_success' | 'failure';
const OUTCOME_LABEL: Record<OutcomeValue, string> = { pending: 'Pending', success: 'Success', partial_success: 'Partial Success', failure: 'Failure' };
const OUTCOME_TONE: Record<OutcomeValue, Tone> = { pending: 'neutral', success: 'good', partial_success: 'warn', failure: 'bad' };
const OUTCOME_OPTIONS = (Object.keys(OUTCOME_LABEL) as OutcomeValue[]).map(v => ({ value: v, label: OUTCOME_LABEL[v] }));

interface MissionListItem {
  id: string;
  name: string;
  scheduled_time: string;
  wing_id?: string;
  squadron_id?: string;
  mission_objectives?: any;
  mission_debriefings?: Array<{
    id: string;
    status: string;
    mission_outcome?: string | null;
    created_at: string;
    finalized_at?: string;
  }>;
}

interface FlightInfo {
  flightId: string;
  callsign: string;
  flightNumber: number;
  squadronId: string;
  flightLeadPilotId: string;
  flightLeadBoardNumber: string;
  flightLeadCallsign: string;
  pilotAssignments: PilotAssignment[];
}

interface MissionDetailsProps {
  selectedMission: MissionListItem | null;
  missionFlights: FlightInfo[];
  missionDebriefId: string | null;
  flightDebriefs: Map<string, FlightDebrief>;
  showDebriefForm: boolean;
  selectedFlight: FlightInfo | null;
  canSubmitAAR: (flight: FlightInfo) => boolean;
  aarOperationalOnly: boolean; // Filter to show only operational squadron flights
  // Event Activities AAR derivation: undefined = legacy aarOperationalOnly
  // behavior; false = no AARs for this event; true = filter to aarSquadronIds
  aarRequired?: boolean;
  aarSquadronIds?: string[]; // squadrons whose flights need AARs (empty = all)
  onSubmitAAR: (flight: FlightInfo) => void;
  onCloseForm: () => void;
  onFormSuccess: () => void;
  userPilotId?: string;
  squadrons: Squadron[];
  onOutcomeUpdate?: () => void;
}

const MissionDetails: React.FC<MissionDetailsProps> = ({
  selectedMission,
  missionFlights,
  missionDebriefId,
  flightDebriefs,
  showDebriefForm,
  selectedFlight,
  canSubmitAAR,
  aarOperationalOnly,
  aarRequired,
  aarSquadronIds,
  onSubmitAAR,
  onCloseForm,
  onFormSuccess,
  userPilotId,
  squadrons,
  onOutcomeUpdate
}) => {
  // All hooks must be called before any conditional returns
  const [updatingOutcome, setUpdatingOutcome] = useState(false);
  const [missionSummary, setMissionSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Load mission summary when missionDebriefId changes
  useEffect(() => {
    const loadMissionSummary = async () => {
      if (!missionDebriefId) {
        setMissionSummary(null);
        return;
      }

      setLoadingSummary(true);
      try {
        const summary = await killTrackingService.getMissionSummary(missionDebriefId);
        setMissionSummary(summary);
      } catch (error) {
        console.error('Failed to load mission summary:', error);
      } finally {
        setLoadingSummary(false);
      }
    };

    loadMissionSummary();
  }, [missionDebriefId, flightDebriefs]); // Re-load when flight debriefs change

  // Group flights by squadron - must be called before conditional return
  const flightsBySquadron = React.useMemo(() => {
    const grouped = new Map<string, FlightInfo[]>();

    missionFlights.forEach(flight => {
      if (!flight.squadronId) return;

      if (aarRequired !== undefined) {
        // Event Activities derivation: no activity requires an AAR -> empty
        // section; otherwise only flights from the AAR activities' squadrons
        if (!aarRequired) return;
        if (aarSquadronIds && aarSquadronIds.length > 0 && !aarSquadronIds.includes(flight.squadronId)) {
          return;
        }
      } else if (aarOperationalOnly) {
        // Legacy behavior: filter by squadron type
        const squadron = squadrons.find(s => s.id === flight.squadronId);
        // Skip training squadrons when aarOperationalOnly is true
        if (squadron?.squadron_type === 'training') {
          return;
        }
      }

      if (!grouped.has(flight.squadronId)) {
        grouped.set(flight.squadronId, []);
      }
      grouped.get(flight.squadronId)!.push(flight);
    });

    return grouped;
  }, [missionFlights, aarOperationalOnly, aarRequired, aarSquadronIds, squadrons]);

  const pane = 'flex-1 min-w-0 min-h-0 flex flex-col bg-panel border border-border rounded-rr-xl shadow-rr overflow-hidden';

  if (!selectedMission) {
    return (
      <div className={pane}>
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState icon="debrief" title="No mission selected" message="Pick a mission on the left to see its summary and after action reports." />
        </div>
      </div>
    );
  }

  // mission_debriefings is an object, not an array
  const debriefing = Array.isArray(selectedMission.mission_debriefings)
    ? selectedMission.mission_debriefings[0]
    : selectedMission.mission_debriefings;

  const missionOutcome = (debriefing?.mission_outcome || 'pending') as OutcomeValue;
  const missionFinalized = debriefing?.finalized_at != null;

  const changeOutcome = async (value: OutcomeValue) => {
    if (!missionDebriefId || updatingOutcome || value === missionOutcome) return;
    setUpdatingOutcome(true);
    try {
      await debriefingService.updateMissionOutcome(missionDebriefId, value);
      onOutcomeUpdate?.();
    } catch (error) {
      console.error('Failed to update mission outcome:', error);
    } finally {
      setUpdatingOutcome(false);
    }
  };

  const when = new Date(selectedMission.scheduled_time);
  const validWhen = !isNaN(when.getTime());

  // AAR progress across the flights that need one
  const aarFlights = Array.from(flightsBySquadron.values()).flat();
  const submittedCount = aarFlights.filter(f => flightDebriefs.has(f.flightId)).length;

  const meta: Array<{ k: string; v: React.ReactNode; sub?: React.ReactNode; mono?: boolean }> = [
    {
      k: 'Date',
      v: validWhen ? when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—',
      sub: validWhen ? when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : undefined,
    },
    { k: 'Outcome', v: <Chip tone={OUTCOME_TONE[missionOutcome]} size="sm">{OUTCOME_LABEL[missionOutcome]}</Chip> },
    {
      k: 'After action reports',
      v: aarFlights.length ? `${submittedCount} / ${aarFlights.length}` : '—',
      sub: aarFlights.length
        ? (submittedCount === aarFlights.length ? 'All submitted' : `${aarFlights.length - submittedCount} pending`)
        : (aarRequired === false ? 'Not required' : undefined),
      mono: true,
    },
    { k: 'Squadrons', v: flightsBySquadron.size || '—', mono: true },
    {
      k: 'Debrief',
      v: missionFinalized ? 'Finalized' : 'Open',
      sub: missionFinalized && debriefing?.finalized_at
        ? new Date(debriefing.finalized_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : 'AARs can be edited',
    },
  ];

  return (
    <div className={pane}>
      {/* Header: title + date, outcome control (Events page pattern) */}
      <div className="flex-none flex items-center gap-3 px-4 pt-3 pb-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-semibold truncate">{selectedMission.name}</div>
          <div className="text-[12px] text-text2 truncate">
            {validWhen ? when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No date'}
          </div>
        </div>
        {missionFinalized ? <Chip tone="good" size="sm"><Icon name="lock" size={11} />Finalized</Chip> : null}
        <span className="text-[12px] text-text2">Outcome</span>
        <div className="w-[170px]">
          <Select<OutcomeValue>
            size="sm"
            value={missionOutcome}
            onChange={changeOutcome}
            disabled={!missionDebriefId || updatingOutcome}
            options={OUTCOME_OPTIONS}
          />
        </div>
      </div>
      <div className="h-px bg-border flex-none" />

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="flex flex-col gap-[14px]">
          {/* Meta strip */}
          <div className="grid gap-x-5 gap-y-[14px] p-[14px] rounded-rr-lg border border-border bg-panel2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {meta.map(m => (
              <div key={m.k} className="min-w-0">
                <div className="rr-label mb-[4px]">{m.k}</div>
                <div className={`text-[13.5px] font-semibold text-text leading-[1.3] ${m.mono ? 'font-mono text-[12.5px]' : ''}`}>{m.v}</div>
                {m.sub ? <div className="text-[12px] text-text2 leading-[1.3]">{m.sub}</div> : null}
              </div>
            ))}
          </div>

          {/* Mission summary (status / kills / performance) */}
          {missionDebriefId && (loadingSummary || missionSummary) ? (
            <div className="flex flex-col gap-[8px]">
              <SectionLabel className="mb-0">Mission summary</SectionLabel>
              {missionSummary ? (
                <MissionSummaryWithPopups missionDebriefId={missionDebriefId} summaryData={missionSummary} />
              ) : (
                <div className="h-[215px] rounded-rr-lg border border-border bg-panel2 flex items-center justify-center text-[12.5px] text-text3">Loading summary…</div>
              )}
            </div>
          ) : null}

          {/* After action reports: one card per squadron */}
          <div className="flex flex-col gap-[8px]">
            <SectionLabel className="mb-0">After action reports</SectionLabel>
            {flightsBySquadron.size > 0 ? (
              <div className="grid gap-[14px] items-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))' }}>
                {Array.from(flightsBySquadron.entries()).map(([squadronId, flights]) => {
                  const squadron = squadrons.find(s => s.id === squadronId);
                  const done = flights.filter(f => flightDebriefs.has(f.flightId)).length;
                  return (
                    <SectionCard
                      key={squadronId}
                      lead={<SquadronInsignia squadron={squadron as any} size={22} />}
                      title={squadron?.designation || 'Unknown squadron'}
                      count={`${done}/${flights.length}`}
                      action={squadron?.name ? <span className="text-[11.5px] text-text3 truncate pr-[6px]" style={{ maxWidth: 180 }}>{squadron.name}</span> : null}
                    >
                      <div className="divide-y divide-border">
                        {flights.map(flight => (
                          <FlightListItem
                            key={flight.flightId}
                            flight={flight}
                            debrief={flightDebriefs.get(flight.flightId) || null}
                            canSubmit={canSubmitAAR(flight)}
                            onSubmitAAR={() => onSubmitAAR(flight)}
                            color={squadronColor(squadron as any)}
                            missionFinalized={missionFinalized}
                          />
                        ))}
                      </div>
                    </SectionCard>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-rr-lg border border-border bg-panel">
                <EmptyState
                  compact
                  icon="clipboard"
                  title={aarRequired === false ? 'No AARs required' : 'No flights'}
                  message={aarRequired === false ? 'No activity at this event requires an After Action Report.' : 'No flights were assigned for this mission.'}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Debrief Form Modal */}
      {showDebriefForm && selectedFlight && missionDebriefId && userPilotId && selectedMission && (
        <FlightDebriefForm
          missionId={selectedMission.id}
          missionDebriefId={missionDebriefId}
          flightId={selectedFlight.flightId}
          flightName={`${selectedFlight.callsign} ${selectedFlight.flightNumber}`}
          squadronId={selectedFlight.squadronId}
          flightLeadPilotId={selectedFlight.flightLeadPilotId}
          pilotAssignments={selectedFlight.pilotAssignments}
          userPilotId={userPilotId}
          existingDebrief={flightDebriefs.get(selectedFlight.flightId)}
          missionFinalized={missionFinalized}
          onClose={onCloseForm}
          onSuccess={onFormSuccess}
        />
      )}
    </div>
  );
};

export default MissionDetails;
