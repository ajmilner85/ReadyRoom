import React from 'react';
import { Button, Select } from '../ui/primitives';
import type { DossierCycle, DossierEventOption, DossierScope } from '../../utils/dossierService';

interface DossierScopeCardProps {
  cycles: DossierCycle[];
  cycleEvents: DossierEventOption[];
  scope: DossierScope;
  onScopeChange: (scope: DossierScope) => void;
  loadingEvents: boolean;
  onSelectLastMission: () => void;
  findingLastMission: boolean;
  notice?: string | null;
}

/**
 * Drill-down scope selector: Career → Cycle → Event, plus "Last mission".
 * The selected scope filters the Statistics, Attendance and Trap Sheet cards below it.
 */
const DossierScopeCard: React.FC<DossierScopeCardProps> = ({
  cycles,
  cycleEvents,
  scope,
  onScopeChange,
  loadingEvents,
  onSelectLastMission,
  findingLastMission,
  notice = null
}) => (
  <div className="flex-none flex items-center gap-[10px] flex-wrap px-[14px] py-[10px] rounded-rr-xl border border-border bg-panel shadow-rr">
    <span className="rr-pane-title mr-1">Scope</span>
    <div className="flex-1 min-w-[170px] max-w-[300px]">
      <Select
        size="sm"
        value={scope.cycleId || ''}
        onChange={v => onScopeChange(v ? { cycleId: v } : {})}
        searchable={cycles.length > 10}
        options={[
          { value: '', label: 'Career (all time)', searchText: 'Career all time' },
          ...cycles.map(c => ({ value: c.id, label: c.name, description: c.type || undefined, searchText: c.name })),
        ]}
      />
    </div>
    <div className="flex-1 min-w-[170px] max-w-[300px]">
      <Select
        size="sm"
        value={scope.eventId || ''}
        onChange={v => onScopeChange({ cycleId: scope.cycleId, eventId: v || undefined })}
        disabled={!scope.cycleId || loadingEvents}
        options={[
          { value: '', label: !scope.cycleId ? 'Event (pick a cycle)' : loadingEvents ? 'Loading events…' : 'All events in cycle' },
          ...(scope.cycleId ? cycleEvents.map(e => ({ value: e.id, label: e.name || 'Unnamed event', searchText: e.name || '' })) : []),
        ]}
      />
    </div>
    <Button size="sm" variant="secondary" icon="crosshair" onClick={onSelectLastMission} loading={findingLastMission} title="Narrow the scope to the last mission this pilot flew">
      Last mission
    </Button>
    {notice ? <span className="text-[12px] text-warn whitespace-nowrap">{notice}</span> : null}
  </div>
);

export default DossierScopeCard;
