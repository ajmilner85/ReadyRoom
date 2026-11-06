import React, { useState } from 'react';
import { Squadron } from '../../../utils/squadronService';
import { Status } from '../../../utils/statusService';
import { Standing } from '../../../utils/standingService';
import { Role } from '../../../utils/roleService';
import { Qualification } from '../../../utils/qualificationService';
import { Button, Drawer, Icon, MultiSelect, OptionList, PickerOption, QualTag, SquadronMark, Swatch, Toggle } from '../primitives';
export type QualificationFilterMode = 'include' | 'exclude';
/** Tri-state status filter (same semantics as the qualification filter). */
export type StatusFilterMode = QualificationFilterMode;

/**
 * A pilot has a single status: it must be one of the required statuses (if any are required)
 * and must not be an excluded one.
 */
export function matchesStatusFilter(statusId: string | null | undefined, filters: Record<string, StatusFilterMode>): boolean {
  const entries = Object.entries(filters || {});
  if (entries.length === 0) return true;
  const required = entries.filter(([, m]) => m === 'include').map(([id]) => id);
  if (required.length > 0 && (!statusId || !required.includes(statusId))) return false;
  if (statusId && filters[statusId] === 'exclude') return false;
  return true;
}

// Minimal structural shape the filter needs — works with both the roster
// page's Pilot (utils/pilotTypes) and mission prep's legacy Pilot type
export interface FilterablePilot {
  id: string;
  currentStatus?: { id: string } | null;
  currentStanding?: { id: string } | null;
  roles?: { role?: { id: string } | null }[] | null;
}

interface FilterDrawerProps {
  squadrons: Squadron[];
  statuses: Status[];
  standings: Standing[];
  roles: Role[];
  qualifications: Qualification[];
  pilots: FilterablePilot[];
  allPilotQualifications: Record<string, any[]>;
  selectedSquadronIds: string[];
  statusFilters: Record<string, StatusFilterMode>;
  selectedStandingIds: string[];
  selectedRoleIds: string[];
  qualificationFilters: Record<string, QualificationFilterMode>;
  filtersEnabled: boolean;
  setSelectedSquadronIds: (ids: string[]) => void;
  setStatusFilters: (filters: Record<string, StatusFilterMode>) => void;
  setSelectedStandingIds: (ids: string[]) => void;
  setSelectedRoleIds: (ids: string[]) => void;
  setQualificationFilters: (filters: Record<string, QualificationFilterMode>) => void;
  setFiltersEnabled: (enabled: boolean) => void;
}

const FilterDrawer: React.FC<FilterDrawerProps> = ({
  squadrons,
  statuses,
  standings,
  roles,
  qualifications,
  pilots,
  allPilotQualifications,
  selectedSquadronIds,
  statusFilters,
  selectedStandingIds,
  selectedRoleIds,
  qualificationFilters,
  filtersEnabled,
  setSelectedSquadronIds,
  setStatusFilters,
  setSelectedStandingIds,
  setSelectedRoleIds,
  setQualificationFilters,
  setFiltersEnabled
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Helper functions for calculating pilot counts
  const getSquadronPilotCount = (squadronId: string) => {
    if (squadronId === 'unassigned') {
      return pilots.filter(pilot => {
        const squad = (pilot as any).currentSquadron || (pilot as any).squadron;
        return !squad?.id;
      }).length;
    }
    return pilots.filter(pilot => {
      const squad = (pilot as any).currentSquadron || (pilot as any).squadron;
      return squad?.id === squadronId;
    }).length;
  };

  const getStatusPilotCount = (statusId: string) => {
    return pilots.filter(pilot => pilot.currentStatus?.id === statusId).length;
  };

  const getStandingPilotCount = (standingId: string) => {
    return pilots.filter(pilot => pilot.currentStanding?.id === standingId).length;
  };

  const getRolePilotCount = (roleId: string) => {
    return pilots.filter(pilot => 
      pilot.roles?.some(role => role.role?.id === roleId)
    ).length;
  };

  const getQualificationPilotCount = (qualificationId: string) => {
    return pilots.filter(pilot => {
      const pilotId = (pilot as any).id || (pilot as any).pilot_id;
      // Check in allPilotQualifications map
      if (allPilotQualifications[pilotId]?.some(pq => pq.qualification?.id === qualificationId)) {
        return true;
      }
      // Also check if pilot has qualifications array directly (EnrolledPilot structure)
      return (pilot as any).qualifications?.some((q: any) => q.qualification?.id === qualificationId);
    }).length;
  };

  const clearAllFilters = () => {
    setSelectedSquadronIds([]);
    setStatusFilters({});
    setSelectedStandingIds([]);
    setSelectedRoleIds([]);
    setQualificationFilters({});
  };

  const activeCount = selectedSquadronIds.length + Object.keys(statusFilters).length + selectedStandingIds.length +
    selectedRoleIds.length + Object.keys(qualificationFilters).length;
  const hasActiveFilters = activeCount > 0;

  // Combined squadron list with "Unassigned" at the bottom (keyed by squadron id, labelled by designation)
  const squadronOptions: PickerOption[] = [
    ...(Array.isArray(squadrons) ? squadrons : []).map(sq => ({
      id: sq.id,
      label: sq.designation,
      sublabel: sq.name,
      searchText: `${sq.designation} ${sq.name}`,
      leading: <SquadronMark url={sq.insignia_url} title={sq.designation} />,
      count: getSquadronPilotCount(sq.id),
    })),
    { id: 'unassigned', label: 'Unassigned', sublabel: 'Pilots without squadron assignment', leading: <SquadronMark />, count: getSquadronPilotCount('unassigned') },
  ];
  const statusOptions: PickerOption[] = (statuses || []).map(st => ({
    id: st.id, label: st.name, leading: <Swatch color={st.isActive ? 'var(--rr-good)' : 'var(--rr-bad)'} />, count: getStatusPilotCount(st.id),
  }));
  const standingOptions: PickerOption[] = (standings || []).map(st => ({
    id: st.id, label: st.name, count: getStandingPilotCount(st.id),
  }));
  const roleOptions: PickerOption[] = (roles || []).map(r => ({
    id: r.id, label: r.name, count: getRolePilotCount(r.id),
    leading: <Swatch shape="square" color={r.exclusivity_scope && r.exclusivity_scope !== 'none' ? 'var(--rr-warn)' : 'var(--rr-text3)'} />,
  }));
  const qualOptions: PickerOption[] = (Array.isArray(qualifications) ? qualifications : []).map(q => ({
    id: q.id, label: q.name, searchText: `${q.code} ${q.name}`, count: getQualificationPilotCount(q.id),
    leading: <QualTag code={q.code} color={q.color} size="sm" minWidth={36} />,
  }));

  return (
    <>
      {/* Trigger: one bordered control - [Filters (n)] | on/off | clear - so the pieces read as a unit */}
      <div
        className={`inline-flex items-stretch flex-none h-[30px] rounded-rr-ctl border overflow-hidden transition-colors ${hasActiveFilters && filtersEnabled ? 'border-accent' : 'border-border2'}`}
      >
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className={`inline-flex items-center gap-[7px] px-[11px] text-[11.5px] font-bold tracking-[.06em] uppercase border-0 cursor-pointer transition-colors ${hasActiveFilters && filtersEnabled ? 'text-accent bg-accent-weak' : 'text-text2 bg-transparent hover:text-accent'}`}
        >
          <Icon name="filter" size={13} />
          Filters
          {hasActiveFilters ? (
            <span className={`min-w-[18px] h-[18px] px-[5px] rounded-[9px] text-[10.5px] font-bold inline-flex items-center justify-center ${filtersEnabled ? 'bg-accent text-white' : 'bg-panel3 text-text2'}`}>{activeCount}</span>
          ) : null}
        </button>
        {hasActiveFilters ? (
          <>
            <span className="w-px bg-border2" aria-hidden />
            <span className="inline-flex items-center px-[8px]" title={filtersEnabled ? 'Filters on (click to show all pilots)' : 'Filters off (click to apply)'}>
              <Toggle size="sm" checked={filtersEnabled} onChange={setFiltersEnabled} />
            </span>
            <span className="w-px bg-border2" aria-hidden />
            <button
              type="button"
              onClick={clearAllFilters}
              aria-label="Clear filters"
              title="Clear filters"
              className="inline-flex items-center justify-center w-[30px] text-text3 hover:text-bad bg-transparent border-0 cursor-pointer"
            >
              <Icon name="close" size={14} />
            </button>
          </>
        ) : null}
      </div>

      <Drawer
        open={isExpanded}
        onClose={() => setIsExpanded(false)}
        title="Filters"
        width={380}
        footer={
          <>
            <button type="button" onClick={clearAllFilters} className="text-[12px] font-semibold text-text2 hover:text-bad bg-transparent border-0 cursor-pointer">
              Clear all
            </button>
            <div className="flex items-center gap-3">
              {hasActiveFilters ? <Toggle size="sm" checked={filtersEnabled} onChange={setFiltersEnabled} label={<span className="text-[12px] text-text2">{filtersEnabled ? 'On' : 'Off'}</span>} /> : null}
              <Button variant="primary" onClick={() => setIsExpanded(false)}>Apply</Button>
            </div>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <OptionList
            title="Squadron"
            options={squadronOptions}
            selected={selectedSquadronIds}
            onChange={setSelectedSquadronIds}
            maxHeight={260}
          />
          <OptionList
            title="Status"
            mode="tri"
            options={statusOptions}
            selected={statusFilters}
            onChange={setStatusFilters}
            maxHeight={220}
          />
          <MultiSelect label="Standing" options={standingOptions} selected={selectedStandingIds} onChange={setSelectedStandingIds} />
          <MultiSelect label="Role" options={roleOptions} selected={selectedRoleIds} onChange={setSelectedRoleIds} />
          <div>
            <OptionList
              title="Qualification"
              mode="tri"
              options={qualOptions}
              selected={qualificationFilters}
              onChange={setQualificationFilters}
              maxHeight={320}
            />
            <div className="mt-[6px] text-[11px] text-text2">Status and qualification: click once to require, twice to exclude, again to clear.</div>
          </div>
        </div>
      </Drawer>
    </>
  );
};

export default FilterDrawer;
