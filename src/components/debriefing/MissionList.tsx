import React from 'react';
import { missionListStyles } from '../../styles/DebriefingStyles';
import MissionFilterDrawer from './MissionFilterDrawer';
import type { Squadron } from '../../utils/squadronService';

interface MissionListItem {
  id: string;
  name: string;
  scheduled_time: string;
  status: string; // Mission planning status from missions table
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

interface MissionListProps {
  missions: MissionListItem[];
  allMissions: MissionListItem[];
  cycles: Array<{ id: string; name: string }>;
  squadrons: Squadron[];
  selectedMission: MissionListItem | null;
  hoveredMission: string | null;
  selectedCycleId: string;
  selectedSquadronIds: string[];
  selectedStatus: string;
  startDate: string;
  endDate: string;
  filtersEnabled: boolean;
  loading: boolean;
  onSelectMission: (mission: MissionListItem) => void;
  setHoveredMission: (id: string | null) => void;
  setSelectedCycleId: (id: string) => void;
  setSelectedSquadronIds: (ids: string[]) => void;
  setSelectedStatus: (status: string) => void;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  setFiltersEnabled: (enabled: boolean) => void;
}

const OUTCOME_TONE: Record<string, { fg: string; bg: string }> = {
  pending: { fg: 'var(--rr-text2)', bg: 'var(--rr-panel3)' },
  success: { fg: 'var(--rr-good)', bg: 'color-mix(in srgb, var(--rr-good) 15%, transparent)' },
  partial_success: { fg: 'var(--rr-warn)', bg: 'color-mix(in srgb, var(--rr-warn) 15%, transparent)' },
  failure: { fg: 'var(--rr-bad)', bg: 'color-mix(in srgb, var(--rr-bad) 15%, transparent)' },
};

const MissionList: React.FC<MissionListProps> = ({
  missions,
  allMissions,
  cycles,
  squadrons,
  selectedMission,
  hoveredMission,
  selectedCycleId,
  selectedSquadronIds,
  selectedStatus,
  startDate,
  endDate,
  filtersEnabled,
  loading,
  onSelectMission,
  setHoveredMission,
  setSelectedCycleId,
  setSelectedSquadronIds,
  setSelectedStatus,
  setStartDate,
  setEndDate,
  setFiltersEnabled
}) => {
  // Sort missions chronologically (most recent first)
  const sortedMissions = [...missions].sort((a, b) => {
    return new Date(b.scheduled_time).getTime() - new Date(a.scheduled_time).getTime();
  });

  // Filter missions based on selected filters
  const filteredMissions = filtersEnabled ? sortedMissions.filter(mission => {
    // Squadron filter - check if any selected squadron participated
    if (selectedSquadronIds.length > 0) {
      const participating = (mission as any).participating_squadron_ids || [];
      const hasMatchingSquadron = selectedSquadronIds.some(id => participating.includes(id));
      if (!hasMatchingSquadron) {
        return false;
      }
    }

    // Outcome filter - filter by mission outcome from mission_debriefings table
    if (selectedStatus) {
      const debriefing = Array.isArray(mission.mission_debriefings)
        ? mission.mission_debriefings[0]
        : mission.mission_debriefings;
      const outcome = debriefing?.mission_outcome;
      if (outcome !== selectedStatus) {
        return false;
      }
    }

    // Date range filter
    const missionDate = new Date(mission.scheduled_time);
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (missionDate < start) {
        return false;
      }
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (missionDate > end) {
        return false;
      }
    }

    return true;
  }) : sortedMissions;

  return (
    <div style={missionListStyles.container}>
      {/* Filter Drawer */}
      <MissionFilterDrawer
        missions={allMissions}
        cycles={cycles}
        squadrons={squadrons}
        selectedCycleId={selectedCycleId}
        selectedSquadronIds={selectedSquadronIds}
        selectedStatus={selectedStatus}
        startDate={startDate}
        endDate={endDate}
        filtersEnabled={filtersEnabled}
        setSelectedCycleId={setSelectedCycleId}
        setSelectedSquadronIds={setSelectedSquadronIds}
        setSelectedStatus={setSelectedStatus}
        setStartDate={setStartDate}
        setEndDate={setEndDate}
        setFiltersEnabled={setFiltersEnabled}
        shownCount={loading ? undefined : filteredMissions.length}
      />

      {/* Mission List */}
      <div style={missionListStyles.content}>
        {loading ? (
          <div style={missionListStyles.emptyList}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4"></div>
            <p>Loading missions...</p>
          </div>
        ) : filteredMissions.length === 0 ? (
          <div style={missionListStyles.emptyList}>
            No missions match these filters
          </div>
        ) : (
          filteredMissions.map((mission) => {
            const isSelected = selectedMission?.id === mission.id;
            // Outcome from the debriefing; no debriefing yet = pending
            const debriefing = Array.isArray(mission.mission_debriefings)
              ? mission.mission_debriefings[0]
              : mission.mission_debriefings;
            const missionOutcome = debriefing?.mission_outcome || 'pending';
            const tone = OUTCOME_TONE[missionOutcome] || OUTCOME_TONE.pending;
            // Mission names are generated as "<event name> Mission"; the suffix is noise in this list
            const displayName = mission.name.replace(/\s+Mission$/i, '');

            return (
              <div
                key={mission.id}
                role="button"
                tabIndex={0}
                title={mission.name}
                onClick={() => onSelectMission(mission)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelectMission(mission); }}
                onMouseEnter={() => setHoveredMission(mission.id)}
                onMouseLeave={() => setHoveredMission(null)}
                className={`flex items-center gap-[10px] pl-[14px] pr-[12px] py-[9px] cursor-pointer border-b border-border transition-colors ${isSelected ? 'bg-accent-weak' : hoveredMission === mission.id ? 'bg-panel2' : ''}`}
                style={isSelected ? { boxShadow: 'inset 3px 0 0 var(--rr-accent)' } : undefined}
              >
                <div className="flex-1 min-w-0">
                  <div className={`text-[13.5px] leading-[1.3] truncate ${isSelected ? 'font-semibold text-text' : 'font-medium text-text'}`}>{displayName}</div>
                  <div className="font-mono text-[11px] text-text3 mt-[2px]">
                    {new Date(mission.scheduled_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    {' · '}
                    {new Date(mission.scheduled_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <span
                  className="flex-none inline-flex items-center gap-[5px] h-[20px] px-[7px] rounded-[5px] font-mono text-[10px] font-semibold tracking-[.05em] uppercase"
                  style={{ color: tone.fg, background: tone.bg }}
                >
                  <span className="w-[6px] h-[6px] rounded-full" style={{ background: tone.fg }} />
                  {missionOutcome === 'partial_success' ? 'Partial' : missionOutcome}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MissionList;
