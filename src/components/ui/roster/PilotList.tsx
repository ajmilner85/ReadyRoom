import React, { useRef } from 'react';
import { Pilot } from '../../../types/PilotTypes';
import { Status } from '../../../utils/statusService';
import { Standing } from '../../../utils/standingService';
import { Squadron } from '../../../utils/squadronService';
import { Role } from '../../../utils/roleService';
import { Qualification } from '../../../utils/qualificationService';
import { pilotListStyles, rosterStyles } from '../../../styles/RosterManagementStyles';
import FilterDrawer from './FilterDrawer';
import PilotListItem from './PilotListItem';

interface PilotListProps {
  pilots: Pilot[];
  statuses: Status[];
  standings: Standing[];
  squadrons: Squadron[];
  roles: Role[];
  qualifications: Qualification[];
  selectedPilot: Pilot | null;
  hoveredPilot: string | null;
  selectedSquadronIds: string[];
  selectedStatusIds: string[];
  selectedStandingIds: string[];
  selectedRoleIds: string[];
  selectedQualificationIds: string[];
  filtersEnabled: boolean;
  allPilotQualifications: Record<string, any[]>;
  setSelectedPilot?: (pilot: Pilot) => void;
  setHoveredPilot: (id: string | null) => void;
  setSelectedSquadronIds: (ids: string[]) => void;
  setSelectedStatusIds: (ids: string[]) => void;
  setSelectedStandingIds: (ids: string[]) => void;
  setSelectedRoleIds: (ids: string[]) => void;
  setSelectedQualificationIds: (ids: string[]) => void;
  setFiltersEnabled: (enabled: boolean) => void;
  onAddPilot: () => void;
  isAddingNewPilot?: boolean;
}

const PilotList: React.FC<PilotListProps> = ({
  pilots,
  statuses,
  standings,
  squadrons,
  roles,
  qualifications,
  selectedPilot,
  hoveredPilot,
  selectedSquadronIds,
  selectedStatusIds,
  selectedStandingIds,
  selectedRoleIds,
  selectedQualificationIds,
  filtersEnabled,
  allPilotQualifications,
  setSelectedPilot,
  setHoveredPilot,
  setSelectedSquadronIds,
  setSelectedStatusIds,
  setSelectedStandingIds,
  setSelectedRoleIds,
  setSelectedQualificationIds,
  setFiltersEnabled,
  onAddPilot,
  isAddingNewPilot = false
}) => {
  const rosterContentRef = useRef<HTMLDivElement>(null);
  const rosterListRef = useRef<HTMLDivElement>(null);

  // Filter pilots by all selected filters (only when filters are enabled)
  const filteredPilots = filtersEnabled ? pilots.filter(pilot => {
    // Squadron filter
    if (selectedSquadronIds.length > 0) {
      if (!pilot.currentSquadron?.id) {
        // Always include pilots without squadron assignment (like provisional pilots)
      } else if (!selectedSquadronIds.includes(pilot.currentSquadron.id)) {
        return false;
      }
    }
    
    // Status filter
    if (selectedStatusIds.length > 0) {
      if (!pilot.currentStatus?.id || !selectedStatusIds.includes(pilot.currentStatus.id)) {
        return false;
      }
    }
    
    // Standing filter
    if (selectedStandingIds.length > 0) {
      if (!pilot.currentStanding?.id || !selectedStandingIds.includes(pilot.currentStanding.id)) {
        return false;
      }
    }
    
    // Role filter
    if (selectedRoleIds.length > 0) {
      const pilotRoleIds = pilot.roles?.map(role => role.role?.id).filter(Boolean) || [];
      if (!pilotRoleIds.some(roleId => selectedRoleIds.includes(roleId))) {
        return false;
      }
    }
    
    // Qualification filter
    if (selectedQualificationIds.length > 0) {
      const pilotQualIds = allPilotQualifications[pilot.id]?.map(pq => pq.qualification?.id).filter(Boolean) || [];
      if (!pilotQualIds.some(qualId => selectedQualificationIds.includes(qualId))) {
        return false;
      }
    }
    
    return true;
  }) : pilots;

  // Separate pilots into active, inactive, and needs attention groups
  const activePilots = filteredPilots.filter(pilot => {
    const status = pilot.currentStatus;
    const standing = pilot.currentStanding;
    // Must have both valid status and standing to be in active/inactive groups
    return status && standing && status.isActive;
  });

  const inactivePilots = filteredPilots.filter(pilot => {
    const status = pilot.currentStatus;
    const standing = pilot.currentStanding;
    // Must have both valid status and standing to be in active/inactive groups
    return status && standing && !status.isActive;
  });

  // Pilots that need attention: missing status, standing, or both
  const needsAttentionPilots = filteredPilots.filter(pilot => {
    const status = pilot.currentStatus;
    const standing = pilot.currentStanding;
    // Include pilots with missing status or standing
    return !status || !standing;
  });

  // Group active pilots by standing
  const groupedActivePilots = activePilots.reduce((acc, pilot) => {
    const standingName = pilot.currentStanding 
      ? pilot.currentStanding.name 
      : 'Unassigned';
    if (!acc[standingName]) {
      acc[standingName] = [];
    }
    acc[standingName].push(pilot);
    return acc;
  }, {} as Record<string, Pilot[]>);

  // Group inactive pilots by status
  const groupedInactivePilots = inactivePilots.reduce((acc, pilot) => {
    const statusName = pilot.currentStatus 
      ? pilot.currentStatus.name 
      : 'Unknown';
    if (!acc[statusName]) {
      acc[statusName] = [];
    }
    acc[statusName].push(pilot);
    return acc;
  }, {} as Record<string, Pilot[]>);

  // Get standing display order based on the order in the standings table
  const standingOrder = standings
    .sort((a, b) => a.order - b.order)
    .map(standing => standing.name);

  // Get inactive status display order based on the order in the statuses table (only inactive ones)
  const inactiveStatusOrder = statuses
    .filter(status => !status.isActive)
    .sort((a, b) => a.order - b.order)
    .map(status => status.name);

  return (
    <div ref={rosterListRef} style={pilotListStyles.container}>
      {/* Filter drawer */}
      <FilterDrawer 
        squadrons={squadrons}
        statuses={statuses}
        standings={standings}
        roles={roles}
        qualifications={qualifications}
        pilots={pilots}
        allPilotQualifications={allPilotQualifications}
        selectedSquadronIds={selectedSquadronIds}
        selectedStatusIds={selectedStatusIds}
        selectedStandingIds={selectedStandingIds}
        selectedRoleIds={selectedRoleIds}
        selectedQualificationIds={selectedQualificationIds}
        filtersEnabled={filtersEnabled}
        setSelectedSquadronIds={setSelectedSquadronIds}
        setSelectedStatusIds={setSelectedStatusIds}
        setSelectedStandingIds={setSelectedStandingIds}
        setSelectedRoleIds={setSelectedRoleIds}
        setSelectedQualificationIds={setSelectedQualificationIds}
        setFiltersEnabled={setFiltersEnabled}
      />
      
      <div 
        ref={rosterContentRef}
        style={pilotListStyles.content}
      >
        {/* Active Pilots Section */}
        {activePilots.length > 0 && (
          <div>
            {standingOrder.map(standing => {
              const standingPilots = groupedActivePilots[standing];
              if (!standingPilots?.length) return null;

              // Sort pilots within each standing by callsign
              const sortedStandingPilots = [...standingPilots].sort((a, b) => 
                a.callsign.localeCompare(b.callsign)
              );

              return (
                <div key={`active-${standing}`}>
                  {/* Standing subgroup */}
                  <div 
                    style={{
                      position: 'relative',
                      textAlign: 'center',
                      margin: '20px 0'
                    }}
                  >
                    <div 
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: '50%',
                        height: '1px',
                        backgroundColor: '#E2E8F0'
                      }}
                    />
                    <span 
                      style={{
                        position: 'relative',
                        backgroundColor: '#FFFFFF',
                        padding: '0 16px',
                        color: '#646F7E',
                        fontSize: '12px',
                        fontFamily: 'Inter',
                        fontWeight: 300,
                        textTransform: 'uppercase'
                      }}
                    >
                      {standing}
                    </span>
                  </div>

                  {/* Pilot entries */}
                  {sortedStandingPilots.map(pilot => (
                    <PilotListItem
                      key={pilot.id}
                      pilot={pilot}
                      isSelected={selectedPilot?.id === pilot.id}
                      isHovered={hoveredPilot === pilot.id}
                      onSelect={() => setSelectedPilot && setSelectedPilot(pilot)}
                      onMouseEnter={() => setHoveredPilot(pilot.id)}
                      onMouseLeave={() => setHoveredPilot(null)}
                      pilotQualifications={allPilotQualifications[pilot.id] || []}
                      isDisabled={isAddingNewPilot}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Inactive Pilots Section */}
        {inactivePilots.length > 0 && (
          <div>
            {inactiveStatusOrder.map(status => {
              const statusPilots = groupedInactivePilots[status];
              if (!statusPilots?.length) return null;

              // Sort pilots within each status by callsign
              const sortedStatusPilots = [...statusPilots].sort((a, b) => 
                a.callsign.localeCompare(b.callsign)
              );

              return (
                <div key={`inactive-${status}`}>
                  {/* Status subgroup */}
                  <div 
                    style={{
                      position: 'relative',
                      textAlign: 'center',
                      margin: '20px 0'
                    }}
                  >
                    <div 
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: '50%',
                        height: '1px',
                        backgroundColor: '#E2E8F0'
                      }}
                    />
                    <span 
                      style={{
                        position: 'relative',
                        backgroundColor: '#FFFFFF',
                        padding: '0 16px',
                        color: '#A0AEC0',
                        fontSize: '12px',
                        fontFamily: 'Inter',
                        fontWeight: 300,
                        textTransform: 'uppercase'
                      }}
                    >
                      {status}
                    </span>
                  </div>

                  {/* Pilot entries */}
                  {sortedStatusPilots.map(pilot => (
                    <PilotListItem
                      key={pilot.id}
                      pilot={pilot}
                      isSelected={selectedPilot?.id === pilot.id}
                      isHovered={hoveredPilot === pilot.id}
                      onSelect={() => setSelectedPilot && setSelectedPilot(pilot)}
                      onMouseEnter={() => setHoveredPilot(pilot.id)}
                      onMouseLeave={() => setHoveredPilot(null)}
                      pilotQualifications={allPilotQualifications[pilot.id] || []}
                      isDisabled={isAddingNewPilot}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Needs Attention Pilots Section */}
        {needsAttentionPilots.length > 0 && (
          <div>
            {/* Needs Attention section header */}
            <div 
              style={{
                position: 'relative',
                textAlign: 'center',
                margin: '20px 0'
              }}
            >
              <div 
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '50%',
                  height: '1px',
                  backgroundColor: '#E2E8F0'
                }}
              />
              <span 
                style={{
                  position: 'relative',
                  backgroundColor: '#FFFFFF',
                  padding: '0 16px',
                  color: '#DC2626',
                  fontSize: '12px',
                  fontFamily: 'Inter',
                  fontWeight: 300,
                  textTransform: 'uppercase'
                }}
              >
                Needs Attention
              </span>
            </div>

            {/* Pilot entries - sorted by callsign */}
            {[...needsAttentionPilots].sort((a, b) => 
              a.callsign.localeCompare(b.callsign)
            ).map(pilot => (
              <PilotListItem
                key={pilot.id}
                pilot={pilot}
                isSelected={selectedPilot?.id === pilot.id}
                isHovered={hoveredPilot === pilot.id}
                onSelect={() => setSelectedPilot && setSelectedPilot(pilot)}
                onMouseEnter={() => setHoveredPilot(pilot.id)}
                onMouseLeave={() => setHoveredPilot(null)}
                pilotQualifications={allPilotQualifications[pilot.id] || []}
                isDisabled={isAddingNewPilot}
              />
            ))}
          </div>
        )}

        {filteredPilots.length === 0 && (
          <div style={pilotListStyles.emptyList}>
            No pilots found.
          </div>
        )}
      </div>

      {/* Add Pilot button at the bottom of the pilot list */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 'auto',
        padding: '24px 0 16px 0',
        borderTop: '1px solid #E2E8F0'
      }}>
        <button
          onClick={onAddPilot}
          disabled={isAddingNewPilot}
          style={{
            ...rosterStyles.addPilotButton,
            opacity: isAddingNewPilot ? 0.5 : 1,
            cursor: isAddingNewPilot ? 'not-allowed' : 'pointer'
          }}
          onMouseEnter={e => {
            if (!isAddingNewPilot) {
              e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          +
        </button>
      </div>
    </div>
  );
};

export default PilotList;