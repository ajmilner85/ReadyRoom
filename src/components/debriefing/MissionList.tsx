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
      />

      {/* Mission List */}
      <div style={missionListStyles.content}>
        {loading ? (
          <div style={missionListStyles.emptyList}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p>Loading missions...</p>
          </div>
        ) : filteredMissions.length === 0 ? (
          <div style={missionListStyles.emptyList}>
            No missions found
          </div>
        ) : (
          filteredMissions.map((mission) => {
            const isSelected = selectedMission?.id === mission.id;
            const isHovered = hoveredMission === mission.id;
            // Get mission outcome from debriefing, default to 'pending'
            const debriefing = Array.isArray(mission.mission_debriefings)
              ? mission.mission_debriefings[0]
              : mission.mission_debriefings;
            const missionOutcome = debriefing?.mission_outcome || 'pending';

            return (
              <div
                key={mission.id}
                style={missionListStyles.missionRow(isSelected, isHovered)}
                onClick={() => onSelectMission(mission)}
                onMouseEnter={() => setHoveredMission(mission.id)}
                onMouseLeave={() => setHoveredMission(null)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={missionListStyles.missionName}>
                    {mission.name}
                  </span>
                  <span style={missionListStyles.outcomeBadge(missionOutcome)}>
                    {missionOutcome === 'partial_success' ? 'PARTIAL SUCCESS' : missionOutcome.toUpperCase()}
                  </span>
                </div>
                <span style={missionListStyles.missionTime}>
                  {new Date(mission.scheduled_time).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
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
