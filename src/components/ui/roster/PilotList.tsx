import React, { useRef } from 'react';
import { Pilot } from '../../../types/PilotTypes';
import { Status } from '../../../utils/statusService';
import { Standing } from '../../../utils/standingService';
import { pilotListStyles, rosterStyles } from '../../../styles/RosterManagementStyles';
import StatusFilter from './StatusFilter';
import PilotListItem from './PilotListItem';

interface PilotListProps {
  pilots: Pilot[];
  statuses: Status[];
  standings: Standing[];
  selectedPilot: Pilot | null;
  hoveredPilot: string | null;
  activeStatusFilter: boolean | null;
  allPilotQualifications: Record<string, any[]>;
  setSelectedPilot?: (pilot: Pilot) => void;
  setHoveredPilot: (id: string | null) => void;
  setActiveStatusFilter: (status: boolean | null) => void;
  onAddPilot: () => void;
  isAddingNewPilot?: boolean;
}

const PilotList: React.FC<PilotListProps> = ({
  pilots,
  statuses,
  standings,
  selectedPilot,
  hoveredPilot,
  activeStatusFilter,
  allPilotQualifications,
  setSelectedPilot,
  setHoveredPilot,
  setActiveStatusFilter,
  onAddPilot,
  isAddingNewPilot = false
}) => {
  const rosterContentRef = useRef<HTMLDivElement>(null);
  const rosterListRef = useRef<HTMLDivElement>(null);

  // Filter pilots by active status if a filter is selected
  const filteredPilots = activeStatusFilter === null 
    ? pilots 
    : pilots.filter(pilot => {
        const status = pilot.currentStatus;
        return status ? status.isActive === activeStatusFilter : false;
      });

  // Separate pilots into active and inactive groups
  const activePilots = filteredPilots.filter(pilot => {
    const status = pilot.currentStatus;
    // If no status assigned, treat as active by default
    return status ? status.isActive : true;
  });

  const inactivePilots = filteredPilots.filter(pilot => {
    const status = pilot.currentStatus;
    // If no status assigned, don't include in inactive
    return status ? !status.isActive : false;
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
      {/* Status filter tabs - now inside the card */}
      <StatusFilter 
        activeStatusFilter={activeStatusFilter}
        setActiveStatusFilter={setActiveStatusFilter}
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

              return (
                <div key={`active-${standing}`}>
                  {/* Standing subgroup */}
                  <div style={{
                    ...pilotListStyles.statusGroup,
                    marginLeft: '16px',
                    fontSize: '14px'
                  }}>
                    <div style={{...pilotListStyles.statusDivider, width: '80px'}} />
                    <span 
                      style={{
                        ...pilotListStyles.statusLabel,
                        color: '#718096',
                        fontSize: '14px'
                      }}
                    >
                      {standing}
                    </span>
                  </div>

                  {/* Pilot entries */}
                  {standingPilots.map(pilot => (
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

              return (
                <div key={`inactive-${status}`}>
                  {/* Status subgroup */}
                  <div style={{
                    ...pilotListStyles.statusGroup,
                    marginLeft: '16px',
                    fontSize: '14px'
                  }}>
                    <div style={{...pilotListStyles.statusDivider, width: '80px'}} />
                    <span 
                      style={{
                        ...pilotListStyles.statusLabel,
                        color: '#A0AEC0',
                        fontSize: '14px'
                      }}
                    >
                      {status}
                    </span>
                  </div>

                  {/* Pilot entries */}
                  {statusPilots.map(pilot => (
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