import React, { useRef } from 'react';
import { Pilot } from '../../../types/PilotTypes';
import { Status } from '../../../utils/statusService';
import { pilotListStyles } from '../../../styles/RosterManagementStyles';
import StatusFilter from './StatusFilter';
import PilotListItem from './PilotListItem';

interface PilotListProps {
  pilots: Pilot[];
  statuses: Status[];
  statusMap: Record<string, Status>;
  selectedPilot: Pilot | null;
  hoveredPilot: string | null;
  activeStatusFilter: boolean | null;
  allPilotQualifications: Record<string, any[]>;
  setSelectedPilot: (pilot: Pilot) => void;
  setHoveredPilot: (id: string | null) => void;
  setActiveStatusFilter: (status: boolean | null) => void;
}

const PilotList: React.FC<PilotListProps> = ({
  pilots,
  statuses,
  statusMap,
  selectedPilot,
  hoveredPilot,
  activeStatusFilter,
  allPilotQualifications,
  setSelectedPilot,
  setHoveredPilot,
  setActiveStatusFilter
}) => {
  const rosterContentRef = useRef<HTMLDivElement>(null);
  const rosterListRef = useRef<HTMLDivElement>(null);

  // Filter pilots by active status if a filter is selected
  const filteredPilots = activeStatusFilter === null 
    ? pilots 
    : pilots.filter(pilot => {
        const status = pilot.status_id ? statusMap[pilot.status_id] : null;
        return status ? status.isActive === activeStatusFilter : false;
      });

  // Group pilots by status
  const groupedPilots = filteredPilots.reduce((acc, pilot) => {
    const status = pilot.status;
    if (!acc[status]) {
      acc[status] = [];
    }
    acc[status].push(pilot);
    return acc;
  }, {} as Record<string, Pilot[]>);

  // Get status display order based on the order in the statuses table
  const statusOrder = statuses
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
        {statusOrder.map(status => {
          const statusPilots = groupedPilots[status];
          if (!statusPilots?.length) return null;

          // Find status object to determine if active/inactive
          const statusObj = statuses.find(s => s.name === status);
          const isActive = statusObj ? statusObj.isActive : true;

          return (
            <div key={status}>
              {/* Status group divider */}
              <div style={pilotListStyles.statusGroup}>
                <div style={pilotListStyles.statusDivider} />
                <span 
                  style={{
                    ...pilotListStyles.statusLabel,
                    color: isActive ? '#646F7E' : '#A0AEC0'
                  }}
                >
                  {status}
                  <span className={`inline-block w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                </span>
              </div>

              {/* Pilot entries */}
              {statusPilots.map(pilot => (
                <PilotListItem
                  key={pilot.id}
                  pilot={pilot}
                  isSelected={selectedPilot?.id === pilot.id}
                  isHovered={hoveredPilot === pilot.id}
                  onSelect={() => setSelectedPilot(pilot)}
                  onMouseEnter={() => setHoveredPilot(pilot.id)}
                  onMouseLeave={() => setHoveredPilot(null)}
                  pilotQualifications={allPilotQualifications[pilot.id] || []}
                />
              ))}

              {statusPilots.length === 0 && (
                <div style={pilotListStyles.emptyList}>
                  No pilots found.
                </div>
              )}
            </div>
          );
        })}

        {filteredPilots.length === 0 && (
          <div style={pilotListStyles.emptyList}>
            No pilots found.
          </div>
        )}
      </div>
    </div>
  );
};

export default PilotList;