import React, { useRef, useMemo, useCallback, useState } from 'react';
import { Pilot } from '../../../types/PilotTypes';
import { Status } from '../../../utils/statusService';
import { Standing } from '../../../utils/standingService';
import { Squadron } from '../../../utils/squadronService';
import { Role } from '../../../utils/roleService';
import { Qualification } from '../../../utils/qualificationService';
import { pilotListStyles, rosterStyles } from '../../../styles/RosterManagementStyles';
import FilterDrawer, { QualificationFilterMode } from './FilterDrawer';
import PilotListItem from './PilotListItem';
import { ArrowUpDown } from 'lucide-react';

interface PilotListProps {
  pilots: Pilot[];
  statuses: Status[];
  standings: Standing[];
  squadrons: Squadron[];
  roles: Role[];
  qualifications: Qualification[];
  selectedPilot: Pilot | null;
  selectedPilots?: Pilot[]; // For multi-select
  hoveredPilot: string | null;
  selectedSquadronIds: string[];
  selectedStatusIds: string[];
  selectedStandingIds: string[];
  selectedRoleIds: string[];
  qualificationFilters: Record<string, QualificationFilterMode>;
  filtersEnabled: boolean;
  allPilotQualifications: Record<string, any[]>;
  setSelectedPilot?: (pilot: Pilot) => void;
  onPilotSelection?: (pilot: Pilot, visiblePilots: Pilot[], event?: React.MouseEvent) => void; // For multi-select
  setHoveredPilot: (id: string | null) => void;
  setSelectedSquadronIds: (ids: string[]) => void;
  setSelectedStatusIds: (ids: string[]) => void;
  setSelectedStandingIds: (ids: string[]) => void;
  setSelectedRoleIds: (ids: string[]) => void;
  setQualificationFilters: (filters: Record<string, QualificationFilterMode>) => void;
  setFiltersEnabled: (enabled: boolean) => void;
  onAddPilot: () => void;
  onSyncWithDiscord: () => void;
  isAddingNewPilot?: boolean;
}

const PilotList: React.FC<PilotListProps> = ({
  pilots,
  statuses,
  standings,
  squadrons,
  roles,
  qualifications,
  selectedPilot: _selectedPilot,
  selectedPilots = [],
  hoveredPilot,
  selectedSquadronIds,
  selectedStatusIds,
  selectedStandingIds,
  selectedRoleIds,
  qualificationFilters,
  filtersEnabled,
  allPilotQualifications,
  setSelectedPilot,
  onPilotSelection,
  setHoveredPilot,
  setSelectedSquadronIds,
  setSelectedStatusIds,
  setSelectedStandingIds,
  setSelectedRoleIds,
  setQualificationFilters,
  setFiltersEnabled,
  onAddPilot,
  onSyncWithDiscord,
  isAddingNewPilot = false
}) => {
  const rosterContentRef = useRef<HTMLDivElement>(null);
  const rosterListRef = useRef<HTMLDivElement>(null);

  // Sort state
  const [sortBy, setSortBy] = useState<'role' | 'boardNumber' | 'callsign'>('role');
  const [sortBySquadron, setSortBySquadron] = useState<boolean>(true);

  // Filter pilots by all selected filters (only when filters are enabled) - memoized for performance
  const filteredPilots = useMemo(() => filtersEnabled ? pilots.filter(pilot => {
    // Squadron filter
    if (selectedSquadronIds.length > 0) {
      if (!pilot.currentSquadron?.id) {
        // Only include unassigned pilots if "unassigned" is specifically selected
        if (!selectedSquadronIds.includes('unassigned')) {
          return false;
        }
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
      if (!pilotRoleIds.some(roleId => roleId && selectedRoleIds.includes(roleId))) {
        return false;
      }
    }
    
    // Qualification filter
    if (Object.keys(qualificationFilters).length > 0) {
      const pilotQualIds = allPilotQualifications[pilot.id]?.map(pq => pq.qualification?.id).filter(Boolean) || [];
      
      // Check each qualification filter
      for (const [qualId, mode] of Object.entries(qualificationFilters)) {
        const pilotHasQual = pilotQualIds.includes(qualId);
        
        if (mode === 'include' && !pilotHasQual) {
          // Must have this qualification but doesn't
          return false;
        } else if (mode === 'exclude' && pilotHasQual) {
          // Must NOT have this qualification but does
          return false;
        }
      }
    }
    
    return true;
  }) : pilots, [filtersEnabled, pilots, selectedSquadronIds, selectedStatusIds, selectedStandingIds, selectedRoleIds, qualificationFilters, allPilotQualifications]);

  // Separate pilots into active, inactive, and needs attention groups - memoized for performance
  const pilotGroups = useMemo(() => {
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

    return { activePilots, inactivePilots, needsAttentionPilots };
  }, [filteredPilots]);

  const { activePilots, inactivePilots, needsAttentionPilots } = pilotGroups;

  // Get standing display order based on the order in the standings table
  const standingOrder = useMemo(() =>
    standings
      .sort((a, b) => a.order - b.order)
      .map(standing => standing.name),
    [standings]
  );

  // Get inactive status display order based on the order in the statuses table (only inactive ones)
  const inactiveStatusOrder = useMemo(() =>
    statuses
      .filter(status => !status.isActive)
      .sort((a, b) => a.order - b.order)
      .map(status => status.name),
    [statuses]
  );

  // Helper function to sort pilots by role order, then alphabetically by callsign
  const sortPilotsByRoleAndCallsign = useCallback((pilots: Pilot[]) => {
    return [...pilots].sort((a, b) => {
      // First sort by squadron ID if enabled
      if (sortBySquadron) {
        const squadronA = a.currentSquadron?.id || '';
        const squadronB = b.currentSquadron?.id || '';
        const squadronCompare = squadronA.localeCompare(squadronB);
        if (squadronCompare !== 0) return squadronCompare;
      }

      // Then apply secondary sort
      if (sortBy === 'boardNumber') {
        const numA = parseInt(a.boardNumber || '0') || 0;
        const numB = parseInt(b.boardNumber || '0') || 0;
        return numA - numB;
      } else if (sortBy === 'callsign') {
        return a.callsign.localeCompare(b.callsign);
      } else {
        // sortBy === 'role' (default behavior)
        // Get the primary role for each pilot (first role in their roles array)
        const aRole = a.roles?.[0]?.role;
        const bRole = b.roles?.[0]?.role;

        // If both have roles, sort by role order
        if (aRole && bRole) {
          const roleComparison = aRole.order - bRole.order;
          if (roleComparison !== 0) {
            return roleComparison;
          }
        }

        // If only one has a role, prioritize the one with a role (lower role.order means higher priority)
        if (aRole && !bRole) return -1;
        if (!aRole && bRole) return 1;

        // If roles are the same (or both have no role), sort alphabetically by callsign
        return a.callsign.localeCompare(b.callsign);
      }
    });
  }, [sortBy, sortBySquadron]);

  // Build a flat array of all visible pilots in display order for multi-select
  const visiblePilotsInOrder = useMemo(() => {
    const ordered: Pilot[] = [];

    // Add active pilots by standing order
    standingOrder.forEach(standing => {
      const standingPilots = activePilots.filter(p => p.currentStanding?.name === standing);
      if (standingPilots.length > 0) {
        ordered.push(...sortPilotsByRoleAndCallsign(standingPilots));
      }
    });

    // Add inactive pilots by status order
    inactiveStatusOrder.forEach(status => {
      const statusPilots = inactivePilots.filter(p => p.currentStatus?.name === status);
      if (statusPilots.length > 0) {
        ordered.push(...sortPilotsByRoleAndCallsign(statusPilots));
      }
    });

    // Add needs attention pilots
    if (needsAttentionPilots.length > 0) {
      ordered.push(...sortPilotsByRoleAndCallsign(needsAttentionPilots));
    }

    return ordered;
  }, [activePilots, inactivePilots, needsAttentionPilots, standingOrder, inactiveStatusOrder, sortPilotsByRoleAndCallsign]);

  // Group active pilots by standing
  const groupedActivePilots = useMemo(() =>
    activePilots.reduce((acc, pilot) => {
      const standingName = pilot.currentStanding
        ? pilot.currentStanding.name
        : 'Unassigned';
      if (!acc[standingName]) {
        acc[standingName] = [];
      }
      acc[standingName].push(pilot);
      return acc;
    }, {} as Record<string, Pilot[]>),
    [activePilots]
  );

  // Group inactive pilots by status
  const groupedInactivePilots = useMemo(() =>
    inactivePilots.reduce((acc, pilot) => {
      const statusName = pilot.currentStatus
        ? pilot.currentStatus.name
        : 'Unknown';
      if (!acc[statusName]) {
        acc[statusName] = [];
      }
      acc[statusName].push(pilot);
      return acc;
    }, {} as Record<string, Pilot[]>),
    [inactivePilots]
  );

  // Render sort controls
  const renderSortControls = () => (
    <div style={{
      display: 'flex',
      gap: '8px',
      marginBottom: '16px',
      justifyContent: 'flex-end',
      paddingRight: '12px'
    }}>
      <span style={{ fontSize: '12px', color: '#6B7280', marginRight: '4px', alignSelf: 'center' }}>
        Sort by:
      </span>
      <button
        type="button"
        onClick={() => setSortBySquadron(!sortBySquadron)}
        style={{
          padding: '4px 12px',
          backgroundColor: sortBySquadron ? '#2563EB' : 'white',
          color: sortBySquadron ? 'white' : '#6B7280',
          border: `1px solid ${sortBySquadron ? '#2563EB' : '#D1D5DB'}`,
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          transition: 'all 0.2s ease'
        }}
      >
        <ArrowUpDown size={12} />
        Squadron
      </button>
      <button
        type="button"
        onClick={() => setSortBy('role')}
        style={{
          padding: '4px 12px',
          backgroundColor: sortBy === 'role' ? '#2563EB' : 'white',
          color: sortBy === 'role' ? 'white' : '#6B7280',
          border: `1px solid ${sortBy === 'role' ? '#2563EB' : '#D1D5DB'}`,
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 500,
          transition: 'all 0.2s ease'
        }}
      >
        Role
      </button>
      <button
        type="button"
        onClick={() => setSortBy('boardNumber')}
        style={{
          padding: '4px 12px',
          backgroundColor: sortBy === 'boardNumber' ? '#2563EB' : 'white',
          color: sortBy === 'boardNumber' ? 'white' : '#6B7280',
          border: `1px solid ${sortBy === 'boardNumber' ? '#2563EB' : '#D1D5DB'}`,
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 500,
          transition: 'all 0.2s ease'
        }}
      >
        Board Number
      </button>
      <button
        type="button"
        onClick={() => setSortBy('callsign')}
        style={{
          padding: '4px 12px',
          backgroundColor: sortBy === 'callsign' ? '#2563EB' : 'white',
          color: sortBy === 'callsign' ? 'white' : '#6B7280',
          border: `1px solid ${sortBy === 'callsign' ? '#2563EB' : '#D1D5DB'}`,
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 500,
          transition: 'all 0.2s ease'
        }}
      >
        Callsign
      </button>
    </div>
  );

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
        qualificationFilters={qualificationFilters}
        filtersEnabled={filtersEnabled}
        setSelectedSquadronIds={setSelectedSquadronIds}
        setSelectedStatusIds={setSelectedStatusIds}
        setSelectedStandingIds={setSelectedStandingIds}
        setSelectedRoleIds={setSelectedRoleIds}
        setQualificationFilters={setQualificationFilters}
        setFiltersEnabled={setFiltersEnabled}
      />

      {/* Sort Controls */}
      {renderSortControls()}

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

              // Sort pilots within each standing by role order, then callsign
              const sortedStandingPilots = sortPilotsByRoleAndCallsign(standingPilots);

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
                      {standing} ({standingPilots.length})
                    </span>
                  </div>

                  {/* Pilot entries */}
                  {sortedStandingPilots.map((pilot) => {
                    const isSelected = selectedPilots.some(p => p.id === pilot.id);

                    return (
                      <PilotListItem
                        key={pilot.id}
                        pilot={pilot}
                        isSelected={isSelected}
                        isHovered={hoveredPilot === pilot.id}
                        onSelect={(event) => {
                          if (onPilotSelection) {
                            onPilotSelection(pilot, visiblePilotsInOrder, event);
                          } else if (setSelectedPilot) {
                            setSelectedPilot(pilot);
                          }
                        }}
                        onMouseEnter={() => setHoveredPilot(pilot.id)}
                        onMouseLeave={() => setHoveredPilot(null)}
                        pilotQualifications={allPilotQualifications[pilot.id] || []}
                        isDisabled={isAddingNewPilot}
                      />
                    );
                  })}
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

              // Sort pilots within each status by role order, then callsign
              const sortedStatusPilots = sortPilotsByRoleAndCallsign(statusPilots);

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
                      {status} ({statusPilots.length})
                    </span>
                  </div>

                  {/* Pilot entries */}
                  {sortedStatusPilots.map((pilot) => {
                    const isSelected = selectedPilots.some(p => p.id === pilot.id);

                    return (
                      <PilotListItem
                        key={pilot.id}
                        pilot={pilot}
                        isSelected={isSelected}
                        isHovered={hoveredPilot === pilot.id}
                        onSelect={(event) => {
                          if (onPilotSelection) {
                            onPilotSelection(pilot, visiblePilotsInOrder, event);
                          } else if (setSelectedPilot) {
                            setSelectedPilot(pilot);
                          }
                        }}
                        onMouseEnter={() => setHoveredPilot(pilot.id)}
                        onMouseLeave={() => setHoveredPilot(null)}
                        pilotQualifications={allPilotQualifications[pilot.id] || []}
                        isDisabled={isAddingNewPilot}
                      />
                    );
                  })}
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
                Needs Attention ({needsAttentionPilots.length})
              </span>
            </div>

            {/* Pilot entries - sorted by role order, then callsign */}
            {sortPilotsByRoleAndCallsign(needsAttentionPilots).map((pilot) => {
              const isSelected = selectedPilots.some(p => p.id === pilot.id);

              return (
                <PilotListItem
                  key={pilot.id}
                  pilot={pilot}
                  isSelected={isSelected}
                  isHovered={hoveredPilot === pilot.id}
                  onSelect={(event) => {
                    if (onPilotSelection) {
                      onPilotSelection(pilot, visiblePilotsInOrder, event);
                    } else if (setSelectedPilot) {
                      setSelectedPilot(pilot);
                    }
                  }}
                  onMouseEnter={() => setHoveredPilot(pilot.id)}
                  onMouseLeave={() => setHoveredPilot(null)}
                  pilotQualifications={allPilotQualifications[pilot.id] || []}
                  isDisabled={isAddingNewPilot}
                />
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

      {/* Footer with Add Pilot button (centered) and Sync with Discord (right) */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '18px',
        position: 'relative',
        zIndex: 5,
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

        <button
          onClick={onSyncWithDiscord}
          style={{
            position: 'absolute',
            right: '18px',
            backgroundColor: '#7289da',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 12px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = '#5b6eae';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = '#7289da';
          }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
          </svg>
          Sync with Discord
        </button>
      </div>
    </div>
  );
};

export default PilotList;