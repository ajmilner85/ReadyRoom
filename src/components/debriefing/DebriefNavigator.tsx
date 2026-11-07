import React, { useState } from 'react';
import { Button, CountBadge } from '../ui/primitives';
import { CycleAccordionItem, CycleAccordionPane, AccordionGroupLabel, STANDALONE_ID, fmtShort } from '../ui/events/CycleAccordion';
import type { AccordionCycle } from '../ui/events/CycleAccordion';
import MissionFilterDrawer from './MissionFilterDrawer';
import type { Squadron } from '../../utils/squadronService';

/**
 * Mission Debrief left pane — the Events page cycle accordion, listing the open cycle's
 * missions. Outcome / squadron / date filters live in a collapsible strip under the header.
 */

export interface DebriefMission {
  id: string;
  name: string;
  scheduled_time: string;
  status: string;
  cycle_id?: string | null;
  participating_squadron_ids?: string[];
  mission_debriefings?: any;
}

const STANDALONE: AccordionCycle = { id: STANDALONE_ID, name: 'Standalone Events', startDate: '', endDate: '' };

const outcomeOf = (m: DebriefMission): string => {
  const d = Array.isArray(m.mission_debriefings) ? m.mission_debriefings[0] : m.mission_debriefings;
  return d?.mission_outcome || 'pending';
};

const OUTCOME_DOT: Record<string, { style: React.CSSProperties; label: string }> = {
  pending: { style: { boxShadow: 'inset 0 0 0 1.5px var(--rr-text3)' }, label: 'Outcome pending' },
  success: { style: { background: 'var(--rr-good)' }, label: 'Success' },
  partial_success: { style: { background: 'var(--rr-warn)' }, label: 'Partial success' },
  failure: { style: { background: 'var(--rr-bad)' }, label: 'Failure' },
};

interface DebriefNavigatorProps {
  cycles: AccordionCycle[];
  missions: DebriefMission[]; // every debriefable mission
  squadrons: Squadron[];
  loading: boolean;
  loadingCycles: boolean;
  selectedCycleId: string;
  onCycleSelect: (id: string) => void;
  selectedMission: { id: string } | null;
  onSelectMission: (m: DebriefMission) => void;
  selectedSquadronIds: string[];
  selectedStatus: string;
  startDate: string;
  endDate: string;
  filtersEnabled: boolean;
  setSelectedSquadronIds: (ids: string[]) => void;
  setSelectedStatus: (s: string) => void;
  setStartDate: (d: string) => void;
  setEndDate: (d: string) => void;
  setFiltersEnabled: (on: boolean) => void;
}

const DebriefNavigator: React.FC<DebriefNavigatorProps> = props => {
  const {
    cycles, missions, squadrons, loading, loadingCycles, selectedCycleId, onCycleSelect, selectedMission, onSelectMission,
    selectedSquadronIds, selectedStatus, startDate, endDate, filtersEnabled,
  } = props;
  const [showFilters, setShowFilters] = useState(false);

  const knownCycleIds = new Set(cycles.map(c => c.id));
  // Missions with no cycle, or whose cycle is gone, live under Standalone so none become unreachable
  const inCycle = (m: DebriefMission, cycleId: string) =>
    cycleId === STANDALONE_ID ? !m.cycle_id || !knownCycleIds.has(m.cycle_id) : m.cycle_id === cycleId;

  const activeFilters =
    (selectedSquadronIds.length > 0 ? 1 : 0) + (selectedStatus ? 1 : 0) + (startDate || endDate ? 1 : 0);

  const passesFilters = (m: DebriefMission) => {
    if (!filtersEnabled) return true;
    if (selectedSquadronIds.length > 0 && !selectedSquadronIds.some(id => (m.participating_squadron_ids || []).includes(id))) return false;
    if (selectedStatus && outcomeOf(m) !== selectedStatus) return false;
    const t = new Date(m.scheduled_time);
    if (startDate) { const s = new Date(startDate); s.setHours(0, 0, 0, 0); if (t < s) return false; }
    if (endDate) { const e = new Date(endDate); e.setHours(23, 59, 59, 999); if (t > e) return false; }
    return true;
  };

  const cycleMissions = selectedCycleId ? missions.filter(m => inCycle(m, selectedCycleId)) : [];
  const shown = cycleMissions.filter(passesFilters).sort((a, b) => +new Date(b.scheduled_time) - +new Date(a.scheduled_time));
  const filtering = filtersEnabled && activeFilters > 0;

  const renderMissions = () => {
    if (loading) return <div className="px-3 py-3 text-[12px] text-text3">Loading missions…</div>;
    if (shown.length === 0) {
      return <div className="px-3 py-3 text-[12px] text-text3">{cycleMissions.length ? 'No missions match the filters.' : 'No missions to debrief yet.'}</div>;
    }
    const groups = [
      { label: 'In progress', items: shown.filter(m => m.status === 'in_progress') },
      { label: 'Completed', items: shown.filter(m => m.status !== 'in_progress') },
    ].filter(g => g.items.length > 0);
    return groups.map(g => (
      <div key={g.label} className="flex flex-col gap-[2px]">
        <AccordionGroupLabel className="px-2 pt-2 pb-1">{g.label}</AccordionGroupLabel>
        {g.items.map(m => {
          const sel = selectedMission?.id === m.id;
          const dot = OUTCOME_DOT[outcomeOf(m)] || OUTCOME_DOT.pending;
          return (
            <div
              key={m.id}
              role="button"
              tabIndex={0}
              title={m.name}
              onClick={() => onSelectMission(m)}
              onKeyDown={e => { if (e.key === 'Enter') onSelectMission(m); }}
              className={`flex items-center gap-[9px] pl-[10px] pr-[6px] py-[7px] rounded-rr-md cursor-pointer transition-colors ${sel ? 'bg-accent-weak' : 'hover:bg-panel2'}`}
              style={sel ? { boxShadow: 'inset 2px 0 0 var(--rr-accent)' } : undefined}
            >
              <span title={dot.label} className="flex-none w-[7px] h-[7px] rounded-full" style={dot.style} />
              <span className={`flex-1 min-w-0 text-[13px] leading-[1.3] text-text ${sel ? 'font-semibold' : 'font-medium'}`} style={{ overflowWrap: 'anywhere' }}>
                {/* Mission names are "<event name> Mission"; the suffix is noise here */}
                {m.name.replace(/\s+Mission$/i, '')}
              </span>
              <span className="flex-none w-[50px] text-right font-mono text-[10.5px] text-text3">{fmtShort(m.scheduled_time)}</span>
            </div>
          );
        })}
      </div>
    ));
  };

  return (
    <CycleAccordionPane
      title={<>Cycles &amp; Missions</>}
      headerActions={
        <Button size="sm" variant={showFilters ? 'primary' : 'secondary'} icon="filter" onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}>
          Filters{activeFilters > 0 ? <CountBadge count={activeFilters} tone="accent" inline className="ml-[2px]" /> : null}
        </Button>
      }
      belowHeader={showFilters ? (
        <MissionFilterDrawer
          embedded
          missions={missions}
          cycles={[]}
          squadrons={squadrons}
          selectedCycleId=""
          selectedSquadronIds={selectedSquadronIds}
          selectedStatus={selectedStatus}
          startDate={startDate}
          endDate={endDate}
          filtersEnabled={filtersEnabled}
          setSelectedCycleId={() => {}}
          setSelectedSquadronIds={props.setSelectedSquadronIds}
          setSelectedStatus={props.setSelectedStatus}
          setStartDate={props.setStartDate}
          setEndDate={props.setEndDate}
          setFiltersEnabled={props.setFiltersEnabled}
        />
      ) : null}
      cycles={cycles}
      standalone={STANDALONE}
      selectedId={selectedCycleId}
      loading={loadingCycles}
      renderItem={(c, o) => (
        <CycleAccordionItem
          key={c.id}
          cycle={c}
          open={o.open}
          standalone={o.standalone}
          onToggle={() => onCycleSelect(o.open ? '' : c.id)}
          count={loading ? undefined : filtering ? `${shown.length}/${cycleMissions.length} MSN` : `${cycleMissions.length} MSN`}
        >
          {renderMissions()}
        </CycleAccordionItem>
      )}
    />
  );
};

export default DebriefNavigator;
