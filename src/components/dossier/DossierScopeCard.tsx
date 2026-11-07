import React from 'react';
import { Icon } from '../ui/primitives';
import { dossierStyles } from './dossierStyles';
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

const selectWrapperStyle: React.CSSProperties = {
  position: 'relative',
  flex: 1,
  minWidth: '170px',
  maxWidth: '360px'
};

const chevronStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  right: '12px',
  transform: 'translateY(-50%)',
  pointerEvents: 'none'
};

/**
 * Drill-down scope selector: Career → Cycle → Event.
 * The selected scope filters the Statistics, Attendance and Trap Sheet
 * cards below it.
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
}) => {
  return (
    <div style={{ ...dossierStyles.card, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px 12px', padding: '14px 18px', flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'inherit',
          fontStyle: 'normal',
          fontWeight: 600,
          fontSize: '12px',
          letterSpacing: '.14em',
          lineHeight: '16px',
          color: 'var(--rr-text2)',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          marginRight: '12px'
        }}>
          Scope
        </span>

        {/* Cycle selector */}
        <div style={selectWrapperStyle}>
          <select
            value={scope.cycleId || ''}
            onChange={(e) => onScopeChange(e.target.value ? { cycleId: e.target.value } : {})}
            style={dossierStyles.selector}
          >
            <option value="">Career (All Time)</option>
            {cycles.map(cycle => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name}{cycle.type ? ` (${cycle.type})` : ''}
              </option>
            ))}
          </select>
          <div style={chevronStyle}>
            <Icon name="chevronDown" size={16} color={'var(--rr-text2)'} />
          </div>
        </div>

        {/* Event selector — enabled once a cycle is chosen */}
        <div style={selectWrapperStyle}>
          <select
            value={scope.eventId || ''}
            onChange={(e) => onScopeChange({
              cycleId: scope.cycleId,
              eventId: e.target.value || undefined
            })}
            style={{
              ...dossierStyles.selector,
              opacity: scope.cycleId ? 1 : 0.5,
              cursor: scope.cycleId ? 'pointer' : 'not-allowed'
            }}
            disabled={!scope.cycleId || loadingEvents}
          >
            <option value="">
              {!scope.cycleId
                ? 'Select a cycle to drill down'
                : loadingEvents
                  ? 'Loading events...'
                  : 'All Events in Cycle'}
            </option>
            {scope.cycleId && cycleEvents.map(event => (
              <option key={event.id} value={event.id}>
                {event.name || 'Unnamed event'}
              </option>
            ))}
          </select>
          <div style={chevronStyle}>
            <Icon name="chevronDown" size={16} color={'var(--rr-text2)'} />
          </div>
        </div>

        {/* Quick scope: last mission flown by the selected pilot */}
        <button
          onClick={onSelectLastMission}
          disabled={findingLastMission}
          title="Narrow the scope to the last mission this pilot flew"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: 'var(--rr-panel)',
            color: 'var(--rr-text2)',
            borderRadius: '8px',
            border: '1px solid var(--rr-border2)',
            cursor: findingLastMission ? 'wait' : 'pointer',
            transition: 'background-color 0.2s ease',
            fontFamily: 'inherit',
            fontSize: '14px',
            fontWeight: 400,
            whiteSpace: 'nowrap',
            height: '35px',
            flexShrink: 0
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--rr-panel2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--rr-panel)'; }}
        >
          <Icon name="crosshair" size={16} />
          {findingLastMission ? 'Finding...' : 'Last Mission'}
        </button>

        {notice && (
          <span style={{ fontSize: '12px', color: 'var(--rr-warn)', whiteSpace: 'nowrap' }}>
            {notice}
          </span>
        )}
      </div>
    </div>
  );
};

export default DossierScopeCard;
