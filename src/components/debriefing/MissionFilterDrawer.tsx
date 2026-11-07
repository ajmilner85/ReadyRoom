import React from 'react';
import type { Squadron } from '../../utils/squadronService';
import { Icon, Select, Toggle, controlClass } from '../ui/primitives';

interface MissionFilterDrawerProps {
  cycles: Array<{ id: string; name: string }>;
  squadrons: Squadron[];
  missions: Array<any>; // all missions, for the per-option counts
  selectedCycleId: string;
  selectedSquadronIds: string[];
  selectedStatus: string;
  startDate: string;
  endDate: string;
  filtersEnabled: boolean;
  setSelectedCycleId: (id: string) => void;
  setSelectedSquadronIds: (ids: string[]) => void;
  setSelectedStatus: (status: string) => void;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  setFiltersEnabled: (enabled: boolean) => void;
  /** Missions currently shown (for the header count). */
  shownCount?: number;
  /** Inside the cycle navigator: no header row and no cycle select (the accordion picks the cycle). */
  embedded?: boolean;
}

const MISSION_OUTCOMES = [
  { value: '', label: 'All outcomes' },
  { value: 'pending', label: 'Pending' },
  { value: 'success', label: 'Success' },
  { value: 'partial_success', label: 'Partial success' },
  { value: 'failure', label: 'Failure' }
];

const withCount = (label: string, n: number) => (
  <span className="flex items-center gap-2 min-w-0">
    <span className="truncate">{label}</span>
    <span className="ml-auto font-mono text-[11px] text-text3">{n}</span>
  </span>
);

/**
 * Debrief mission filters as a compact toolbar: cycle + outcome selects, squadron pills and a
 * date range. The Filters switch suspends filtering without clearing it (same as before).
 */
const MissionFilterDrawer: React.FC<MissionFilterDrawerProps> = ({
  cycles,
  squadrons,
  missions,
  selectedCycleId,
  selectedSquadronIds,
  selectedStatus,
  startDate,
  endDate,
  filtersEnabled,
  setSelectedCycleId,
  setSelectedSquadronIds,
  setSelectedStatus,
  setStartDate,
  setEndDate,
  setFiltersEnabled,
  shownCount,
  embedded = false
}) => {
  const safeSquadrons = Array.isArray(squadrons) ? squadrons : [];
  const safeCycles = Array.isArray(cycles) ? cycles : [];
  const safeMissions = Array.isArray(missions) ? missions : [];

  const toggleSquadron = (id: string) => {
    setSelectedSquadronIds(selectedSquadronIds.includes(id)
      ? selectedSquadronIds.filter(i => i !== id)
      : [...selectedSquadronIds, id]);
  };

  const squadronCount = (squadronId: string) =>
    safeMissions.filter(m => ((m as any).participating_squadron_ids || []).includes(squadronId)).length;

  const cycleCount = (cycleId: string) => {
    if (!cycleId) return safeMissions.length;
    if (cycleId === 'standalone') return safeMissions.filter(m => !m.cycle_id).length;
    return safeMissions.filter(m => m.cycle_id === cycleId).length;
  };

  // Outcome comes from mission_debriefings; NULL counts as pending
  const outcomeCount = (outcome: string) => {
    if (!outcome) return safeMissions.length;
    return safeMissions.filter(m => {
      const debriefing = Array.isArray(m.mission_debriefings) ? m.mission_debriefings[0] : m.mission_debriefings;
      return (debriefing?.mission_outcome || 'pending') === outcome;
    }).length;
  };

  const activeCount =
    (!embedded && selectedCycleId !== '' ? 1 : 0) +
    (selectedSquadronIds.length > 0 ? 1 : 0) +
    (selectedStatus !== '' ? 1 : 0) +
    (startDate !== '' || endDate !== '' ? 1 : 0);

  const clearAllFilters = () => {
    if (!embedded) setSelectedCycleId('');
    setSelectedSquadronIds([]);
    setSelectedStatus('');
    setStartDate('');
    setEndDate('');
  };

  const dim = !filtersEnabled ? 'opacity-55' : '';

  return (
    <div className="flex-none bg-panel border-b border-border">
      {/* Header (embedded: the navigator header owns the title; apply/clear sit in the strip) */}
      {embedded ? null : <div className="flex items-center gap-[10px] px-[14px] min-h-[46px] border-b border-border">
        <span className="rr-pane-title">Missions</span>
        {shownCount != null ? (
          <span className="font-mono text-[11px] text-text3">
            {shownCount}{filtersEnabled && activeCount > 0 ? ` / ${safeMissions.length}` : ''}
          </span>
        ) : null}
        <span className="flex-1" />
        {activeCount > 0 ? (
          <>
            <Toggle size="sm" checked={filtersEnabled} onChange={setFiltersEnabled} label={<span className="text-[12px] text-text2">Filters</span>} />
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-[12px] font-semibold text-text3 hover:text-bad bg-transparent border-0 cursor-pointer"
            >
              Clear{activeCount > 1 ? ` (${activeCount})` : ''}
            </button>
          </>
        ) : null}
      </div>}

      <div className={`flex flex-col gap-[10px] px-[14px] py-[12px] transition-opacity ${dim}`}>
        <div className="grid gap-[8px]" style={{ gridTemplateColumns: embedded ? 'minmax(0, 1fr)' : 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
          {embedded ? null : <Select
            size="sm"
            value={selectedCycleId}
            onChange={setSelectedCycleId}
            options={[
              { value: '', label: withCount('All cycles', cycleCount('')), searchText: 'All cycles' },
              { value: 'standalone', label: withCount('Standalone events', cycleCount('standalone')), searchText: 'Standalone events' },
              ...safeCycles.map(c => ({ value: c.id, label: withCount(c.name, cycleCount(c.id)), searchText: c.name })),
            ]}
          />}
          <Select
            size="sm"
            value={selectedStatus}
            onChange={setSelectedStatus}
            options={MISSION_OUTCOMES.map(o => ({ value: o.value, label: withCount(o.label, outcomeCount(o.value)), searchText: o.label }))}
          />
        </div>

        {safeSquadrons.length > 0 ? (
          <div className="flex flex-wrap gap-[6px]">
            {safeSquadrons.map(sq => {
              const on = selectedSquadronIds.includes(sq.id);
              return (
                <button
                  key={sq.id}
                  type="button"
                  aria-pressed={on}
                  title={sq.name}
                  onClick={() => toggleSquadron(sq.id)}
                  className={`inline-flex items-center gap-[6px] h-[28px] pl-[5px] pr-[9px] rounded-rr-ctl border text-[12px] font-semibold cursor-pointer transition-colors ${on ? 'border-accent bg-accent-weak text-text' : 'border-border2 bg-panel2 text-text2 hover:border-accent hover:text-text'}`}
                >
                  {sq.insignia_url
                    ? <img src={sq.insignia_url} alt="" className="w-[18px] h-[18px] object-contain" />
                    : <span className="w-[18px] h-[18px] rounded-[4px] bg-panel3" />}
                  {sq.designation}
                  <span className="font-mono text-[10.5px] text-text3">{squadronCount(sq.id)}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex items-center gap-[8px]">
          <Icon name="events" size={14} style={{ color: 'var(--rr-text3)', flexShrink: 0 }} />
          <input type="date" aria-label="From date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${controlClass} flex-1 min-w-0 px-[10px] h-[30px] text-[12.5px]`} />
          <span className="text-[12px] text-text3">to</span>
          <input type="date" aria-label="To date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${controlClass} flex-1 min-w-0 px-[10px] h-[30px] text-[12.5px]`} />
        </div>
      </div>
      {embedded ? (
        <div className="flex items-center gap-[10px] px-[14px] pb-[10px] -mt-[2px]">
          <Toggle size="sm" checked={filtersEnabled} onChange={setFiltersEnabled} disabled={activeCount === 0} label={<span className="text-[12px] text-text2">Apply filters</span>} />
          <span className="flex-1" />
          <button
            type="button"
            onClick={clearAllFilters}
            disabled={activeCount === 0}
            className="text-[12px] font-semibold text-text3 enabled:hover:text-bad disabled:opacity-50 disabled:cursor-default bg-transparent border-0 cursor-pointer"
          >
            Clear{activeCount > 1 ? ` (${activeCount})` : ''}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default MissionFilterDrawer;
