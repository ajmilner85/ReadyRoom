import React, { useRef, useMemo, useCallback, useState } from 'react';
import type { Pilot } from '../../../utils/pilotTypes';
import { Status } from '../../../utils/statusService';
import { Standing } from '../../../utils/standingService';
import { Squadron } from '../../../utils/squadronService';
import { Role } from '../../../utils/roleService';
import { Qualification } from '../../../utils/qualificationService';
import FilterDrawer, { QualificationFilterMode } from './FilterDrawer';
import PilotListItem, { ROSTER_COLS } from './PilotListItem';
import { BulkBar, Button, Checkbox, EmptyState, Icon, SearchInput, SegmentedControl } from '../primitives';

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
  /** Replace the multi-selection (group select-all / clear). */
  onSetSelection?: (pilots: Pilot[]) => void;
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
  isAddingNewPilot = false,
  onSetSelection
}) => {
  const rosterContentRef = useRef<HTMLDivElement>(null);
  const rosterListRef = useRef<HTMLDivElement>(null);

  // Sort state
  const [sortBy, setSortBy] = useState<'role' | 'boardNumber' | 'callsign'>('role');
  // Within standing groups pilots stay clustered by squadron (legacy default)
  const sortBySquadron = true;
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // Grouping: by standing/status (legacy) or by squadron (design: sticky insignia groups)
  const [groupMode, setGroupMode] = useState<'standing' | 'squadron'>(() => {
    try { return (localStorage.getItem('rr-roster-group') as 'standing' | 'squadron') || 'squadron'; } catch { return 'squadron'; }
  });
  const changeGroupMode = (m: 'standing' | 'squadron') => {
    setGroupMode(m);
    try { localStorage.setItem('rr-roster-group', m); } catch { /* storage unavailable */ }
  };
  const [search, setSearch] = useState('');
  const searchedPilots = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pilots;
    return pilots.filter(p =>
      (p.callsign || '').toLowerCase().includes(q) ||
      String(p.boardNumber || '').includes(q) ||
      String((p as any).discordUsername || (p as any).discord_username || '').toLowerCase().includes(q)
    );
  }, [pilots, search]);

  // Filter pilots by all selected filters (only when filters are enabled) - memoized for performance
  const filteredPilots = useMemo(() => filtersEnabled ? searchedPilots.filter(pilot => {
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
  }) : searchedPilots, [filtersEnabled, searchedPilots, selectedSquadronIds, selectedStatusIds, selectedStandingIds, selectedRoleIds, qualificationFilters, allPilotQualifications]);

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
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...pilots].sort((a, b) => dir * (() => {
      // First sort by squadron ID if enabled
      if (sortBySquadron) {
        const squadronA = a.currentSquadron?.id || '';
        const squadronB = b.currentSquadron?.id || '';
        const squadronCompare = squadronA.localeCompare(squadronB);
        if (squadronCompare !== 0) return squadronCompare;
      }

      // Then apply secondary sort
      if (sortBy === 'boardNumber') {
        const numA = Number(a.boardNumber) || 0;
        const numB = Number(b.boardNumber) || 0;
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
    })());
  }, [sortBy, sortBySquadron, sortDir]);

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

  // ---- Display groups ------------------------------------------------------------------
  type Group = { key: string; title: React.ReactNode; tone?: 'muted' | 'bad'; insignia?: string | null; pilots: Pilot[] };
  const groups: Group[] = useMemo(() => {
    if (groupMode === 'squadron') {
      // One group per squadron (keyed by squadron id, labelled by designation); unassigned last.
      // Active pilots first within each group, then inactive, then needs-attention.
      const bySq = new Map<string, Group>();
      const rank = (p: Pilot) => (!p.currentStatus || !p.currentStanding ? 2 : p.currentStatus.isActive ? 0 : 1);
      filteredPilots.forEach(p => {
        const sq = p.currentSquadron;
        const key = sq?.id || 'unassigned';
        if (!bySq.has(key)) {
          bySq.set(key, {
            key,
            title: sq ? (
              <span className="flex items-baseline gap-2 min-w-0">
                <span className="text-[12.5px] font-bold text-text">{sq.designation}</span>
                <span className="font-mono text-[10px] text-text3 truncate">{sq.name}</span>
              </span>
            ) : <span className="text-[12.5px] font-bold text-text2">Unassigned</span>,
            insignia: sq?.insignia_url,
            pilots: [],
          });
        }
        bySq.get(key)!.pilots.push(p);
      });
      return Array.from(bySq.values())
        .sort((x, y) => (x.key === 'unassigned' ? 1 : y.key === 'unassigned' ? -1 : String((x.pilots[0].currentSquadron as any)?.designation).localeCompare(String((y.pilots[0].currentSquadron as any)?.designation))))
        .map(g => ({ ...g, pilots: [...sortPilotsByRoleAndCallsign(g.pilots)].sort((a, b) => rank(a) - rank(b)) }));
    }
    const out: Group[] = [];
    standingOrder.forEach(standing => {
      const ps = groupedActivePilots[standing];
      if (ps?.length) out.push({ key: `active-${standing}`, title: <span className="text-[12px] font-bold tracking-[.06em] uppercase text-text">{standing}</span>, pilots: sortPilotsByRoleAndCallsign(ps) });
    });
    inactiveStatusOrder.forEach(status => {
      const ps = groupedInactivePilots[status];
      if (ps?.length) out.push({ key: `inactive-${status}`, tone: 'muted', title: <span className="text-[12px] font-bold tracking-[.06em] uppercase text-text3">{status}</span>, pilots: sortPilotsByRoleAndCallsign(ps) });
    });
    if (needsAttentionPilots.length) {
      out.push({ key: 'needs-attention', tone: 'bad', title: <span className="text-[12px] font-bold tracking-[.06em] uppercase text-bad">Needs Attention</span>, pilots: sortPilotsByRoleAndCallsign(needsAttentionPilots) });
    }
    return out;
  }, [groupMode, filteredPilots, standingOrder, inactiveStatusOrder, groupedActivePilots, groupedInactivePilots, needsAttentionPilots, sortPilotsByRoleAndCallsign]);

  // Display order for shift-range selection follows what is on screen
  const displayOrder = useMemo(() => groups.flatMap(g => g.pilots), [groups]);
  void visiblePilotsInOrder;

  const selectedIds = useMemo(() => new Set(selectedPilots.map(p => p.id)), [selectedPilots]);
  const toggleOne = (pilot: Pilot) => {
    if (!onPilotSelection) return;
    onPilotSelection(pilot, displayOrder, { ctrlKey: true, preventDefault() {} } as unknown as React.MouseEvent);
  };
  const setGroupSelected = (ps: Pilot[], on: boolean) => {
    if (!onSetSelection) return;
    if (on) {
      const merged = [...selectedPilots];
      ps.forEach(p => { if (!selectedIds.has(p.id)) merged.push(p); });
      onSetSelection(merged);
    } else {
      const drop = new Set(ps.map(p => p.id));
      onSetSelection(selectedPilots.filter(p => !drop.has(p.id)));
    }
  };

  const sortHeader = (key: 'boardNumber' | 'callsign' | 'role', label: string, width?: number, extraClass = '') => {
    const active = sortBy === key;
    return (
      <button
        type="button"
        onClick={() => {
          if (active) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
          else { setSortBy(key); setSortDir('asc'); }
        }}
        className={`flex-none flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer font-mono text-[9.5px] tracking-[.1em] uppercase hover:text-text ${active ? 'text-accent' : 'text-text2'} ${extraClass}`}
        style={{ width }}
      >
        {label}
        <span className={`flex transition-transform duration-200 ${active ? '' : 'opacity-0'}`} style={{ transform: active && sortDir === 'desc' ? 'rotate(180deg)' : 'none' }}>
          <Icon name="chevronUp" size={10} stroke={2.4} />
        </span>
      </button>
    );
  };

  const total = filteredPilots.length;

  return (
    <div ref={rosterListRef} style={{ containerType: 'inline-size' }} className="flex-1 min-w-[560px] min-h-0 flex flex-col bg-panel border border-border rounded-rr-xl shadow-rr overflow-hidden">
      {/* Toolbar */}
      <div className="flex-none flex items-center gap-[10px] px-[14px] py-[10px] border-b border-border flex-wrap">
        <span className="rr-pane-title whitespace-nowrap">Squadron Roster</span>
        <span className="font-mono text-[11px] text-text3">{total}</span>
        <SearchInput value={search} onChange={setSearch} placeholder="Search callsign, board #, Discord…" className="flex-1 min-w-[180px] max-w-[420px]" />
        <span className="flex-1" />
        <SegmentedControl
          size="sm"
          value={groupMode}
          onChange={changeGroupMode}
          options={[{ value: 'squadron', label: 'SQUADRON' }, { value: 'standing', label: 'STANDING' }]}
        />
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
        <Button size="sm" variant="secondary" icon="discord" onClick={onSyncWithDiscord}>Sync Discord</Button>
        <Button size="sm" variant="primary" icon="plus" onClick={onAddPilot} disabled={isAddingNewPilot}>Add Pilot</Button>
      </div>

      {/* Column header */}
      <div className="flex-none flex items-center gap-3 px-3 py-2 bg-panel2 border-b border-border">
        <span style={{ width: ROSTER_COLS.check }} className="flex-none" />
        {sortHeader('boardNumber', 'Board', ROSTER_COLS.board)}
        {sortHeader('callsign', 'Callsign', ROSTER_COLS.callsign)}
        <span className="flex-none font-mono text-[9.5px] tracking-[.1em] uppercase text-text2" style={{ width: ROSTER_COLS.status }}>Status</span>
        {sortHeader('role', 'Billet', ROSTER_COLS.billet, 'rr-col-billet')}
        <span className="flex-1 min-w-0 truncate text-right font-mono text-[9.5px] tracking-[.1em] uppercase text-text2">Qualifications</span>
        <span className="flex-none w-4" />
      </div>

      <div ref={rosterContentRef} className="flex-1 min-h-0 overflow-y-auto">
        {groups.map(g => {
          const gAll = g.pilots.length > 0 && g.pilots.every(p => selectedIds.has(p.id));
          const gSome = !gAll && g.pilots.some(p => selectedIds.has(p.id));
          return (
            <div key={g.key}>
              <div className="sticky top-0 z-[2] flex items-center gap-3 px-3 py-[7px] bg-panel border-b border-border">
                <span style={{ width: ROSTER_COLS.check }} className="flex-none flex">
                  {onSetSelection ? (
                    <Checkbox size={16} checked={gAll} indeterminate={gSome} disabled={isAddingNewPilot} onChange={(v) => setGroupSelected(g.pilots, v)} />
                  ) : null}
                </span>
                {g.insignia ? <img src={g.insignia} alt="" className="w-5 h-5 object-contain flex-none" /> : null}
                <div className="min-w-0 flex-1">{g.title}</div>
                <span className="font-mono text-[10px] tracking-[.08em] text-text3">{g.pilots.length} PILOTS</span>
              </div>
              {g.pilots.map(pilot => (
                <PilotListItem
                  key={pilot.id}
                  pilot={pilot}
                  isSelected={selectedIds.has(pilot.id)}
                  isHovered={hoveredPilot === pilot.id}
                  onSelect={(event) => {
                    if (onPilotSelection) {
                      onPilotSelection(pilot, displayOrder, event);
                    } else if (setSelectedPilot) {
                      setSelectedPilot(pilot);
                    }
                  }}
                  onToggleSelect={() => toggleOne(pilot)}
                  onMouseEnter={() => setHoveredPilot(pilot.id)}
                  onMouseLeave={() => setHoveredPilot(null)}
                  pilotQualifications={allPilotQualifications[pilot.id] || []}
                  isDisabled={isAddingNewPilot}
                />
              ))}
            </div>
          );
        })}

        {total === 0 && (
          <EmptyState
            title="No pilots found"
            message={search ? 'No pilots match your search.' : 'Adjust or clear the filters to see more pilots.'}
          />
        )}
      </div>

      {/* Bulk selection footer */}
      {selectedPilots.length > 1 ? (
        <div className="flex-none px-3 py-2 border-t border-border">
          <BulkBar count={selectedPilots.length} onClear={() => onSetSelection?.([])}>
            <span className="text-[12px] text-text2">Edit the selection in the panel on the right. Shift-click selects a range, Ctrl-click toggles.</span>
          </BulkBar>
        </div>
      ) : null}
    </div>
  );
};

export default PilotList;
