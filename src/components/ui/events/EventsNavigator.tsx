import React from 'react';
import { Button, IconButton } from '../primitives';
import { AccordionGroupLabel, CycleAccordionItem, CycleAccordionPane, fmtShort } from './CycleAccordion';
import LoadingSpinner from '../LoadingSpinner';
import type { Cycle, Event } from '../../../types/EventTypes';

/**
 * Events page left pane: one accordion of cycles. Expanding a cycle selects it (the page then
 * loads its events) and lists those events underneath; only the selected cycle is expanded.
 * "Standalone Events" is a pinned pseudo-cycle for events that aren't in a cycle.
 */

export const STANDALONE_CYCLE: Cycle = {
  id: 'standalone',
  name: 'Standalone Events',
  description: 'Events not part of any cycle',
  startDate: '',
  endDate: '',
  type: 'Other',
  status: 'active',
  creator: { boardNumber: '', callsign: '', billet: '' },
};

interface EventsNavigatorProps {
  cycles: Cycle[];
  events: Event[]; // events of the selected cycle (already filtered by the page)
  selectedCycle: Cycle | null;
  selectedEvent: Event | null;
  loadingCycles: boolean;
  loadingEvents: boolean;
  onCycleSelect: (cycle: Cycle | null) => void;
  onEventSelect: (event: Event) => void;
  onNewCycle: () => void;
  onNewEvent: () => void;
  onEditCycle: (cycle: Cycle) => void;
  onDeleteCycle: (cycle: Cycle) => void;
  onEditEvent: (event: Event) => void;
  onDeleteEvent: (event: Event) => void;
  onRemoveAllEvents: () => void;
}

const groupEvents = (events: Event[]) => {
  const now = new Date();
  const live: Event[] = [], upcoming: Event[] = [], past: Event[] = [];
  events.forEach(ev => {
    const s = new Date(ev.datetime);
    const e = ev.endDatetime ? new Date(ev.endDatetime) : s;
    if (s <= now && e >= now) live.push(ev);
    else if (s > now) upcoming.push(ev);
    else past.push(ev);
  });
  live.sort((a, b) => +new Date(a.datetime) - +new Date(b.datetime));
  upcoming.sort((a, b) => +new Date(a.datetime) - +new Date(b.datetime));
  past.sort((a, b) => +new Date(b.datetime) - +new Date(a.datetime));
  return [
    { label: 'In progress', items: live },
    { label: 'Upcoming', items: upcoming },
    { label: 'Previous', items: past },
  ].filter(g => g.items.length > 0);
};

const GroupLabel = AccordionGroupLabel;

/** Publish state dot: green = published, blue = scheduled, hollow = draft. */
const PublishDot: React.FC<{ event: Event }> = ({ event }) => {
  const published = Boolean(event.discordEventId) || Boolean((event as any).discord_event_id);
  const scheduled = !published && Boolean((event as any).scheduledPublicationTime);
  const title = published ? 'Published to Discord' : scheduled ? 'Scheduled for publication' : 'Not published';
  return (
    <span
      title={title}
      className="flex-none w-[7px] h-[7px] rounded-full"
      style={published
        ? { background: 'var(--rr-good)' }
        : scheduled
          ? { background: 'var(--rr-info)' }
          : { boxShadow: 'inset 0 0 0 1.5px var(--rr-text3)' }}
    />
  );
};

const EventsNavigator: React.FC<EventsNavigatorProps> = ({
  cycles, events, selectedCycle, selectedEvent, loadingCycles, loadingEvents,
  onCycleSelect, onEventSelect, onNewCycle, onNewEvent, onEditCycle, onDeleteCycle, onEditEvent, onDeleteEvent, onRemoveAllEvents,
}) => {
  const renderEvents = () => {
    if (loadingEvents) return <div className="py-4 flex justify-center"><LoadingSpinner /></div>;
    if (events.length === 0) {
      return <div className="px-3 py-3 text-[12px] text-text3">No events yet.</div>;
    }
    return groupEvents(events).map(g => (
      <div key={g.label} className="flex flex-col gap-[2px]">
        <GroupLabel className="px-2 pt-2 pb-1">{g.label}</GroupLabel>
        {g.items.map(ev => {
          const sel = selectedEvent?.id === ev.id;
          return (
            <div
              key={ev.id}
              role="button"
              tabIndex={0}
              onClick={() => onEventSelect(ev)}
              onKeyDown={e => { if (e.key === 'Enter') onEventSelect(ev); }}
              className={`group/ev flex items-center gap-[9px] pl-[10px] pr-[6px] py-[7px] rounded-rr-md cursor-pointer transition-colors ${sel ? 'bg-accent-weak' : 'hover:bg-panel2'}`}
              style={sel ? { boxShadow: 'inset 2px 0 0 var(--rr-accent)' } : undefined}
            >
              <PublishDot event={ev} />
              <span className={`flex-1 min-w-0 text-[13px] leading-[1.3] ${sel ? 'font-semibold text-text' : 'font-medium text-text'}`} style={{ overflowWrap: 'anywhere' }}>
                {ev.title}
              </span>
              {/* Fixed-width trailing slot: date and hover actions swap in place, so the title never reflows */}
              <span className="relative flex-none w-[50px] h-[24px]">
                <span className="absolute inset-0 flex items-center justify-end font-mono text-[10.5px] text-text3 group-hover/ev:invisible group-focus-within/ev:invisible">{fmtShort(ev.datetime)}</span>
                <span className="absolute inset-0 flex items-center justify-end gap-[2px] invisible group-hover/ev:visible group-focus-within/ev:visible" onClick={e => e.stopPropagation()}>
                  <IconButton icon="edit" size={24} iconSize={13} label="Edit event" onClick={() => onEditEvent(ev)} />
                  <IconButton icon="trash" size={24} iconSize={13} className="hover:!text-bad" label="Delete event" onClick={() => onDeleteEvent(ev)} />
                </span>
              </span>
            </div>
          );
        })}
      </div>
    ));
  };

  const renderCycle = (cycle: Cycle, opts: { standalone?: boolean } = {}) => {
    const open = selectedCycle?.id === cycle.id;
    return (
      <CycleAccordionItem
        key={cycle.id}
        cycle={cycle}
        open={open}
        standalone={opts.standalone}
        onToggle={() => onCycleSelect(open ? null : cycle)}
        count={!loadingEvents ? `${events.length} EVT` : undefined}
        actions={!opts.standalone ? (
          <>
            <IconButton icon="edit" size={24} iconSize={13} label="Edit cycle" onClick={() => onEditCycle(cycle)} />
            <IconButton icon="trash" size={24} iconSize={13} className="hover:!text-bad" label="Delete cycle" onClick={() => onDeleteCycle(cycle)} />
          </>
        ) : undefined}
      >
        {renderEvents()}
        <div className="flex items-center gap-2 px-2 pt-2">
          <Button size="sm" variant="ghost" icon="plus" onClick={onNewEvent}>Add event</Button>
          <span className="flex-1" />
          {!opts.standalone && events.length > 0 ? (
            <button type="button" onClick={onRemoveAllEvents} className="text-[11.5px] font-semibold text-text3 hover:text-bad bg-transparent border-0 cursor-pointer">
              Remove all
            </button>
          ) : null}
        </div>
      </CycleAccordionItem>
    );
  };

  return (
    <CycleAccordionPane
      title={<>Cycles &amp; Events</>}
      headerActions={
        <>
          <Button size="sm" variant="secondary" icon="plus" onClick={onNewEvent}>Event</Button>
          <Button size="sm" variant="primary" icon="plus" onClick={onNewCycle}>Cycle</Button>
        </>
      }
      cycles={cycles}
      standalone={STANDALONE_CYCLE}
      selectedId={selectedCycle?.id}
      loading={loadingCycles}
      renderItem={(c, o) => renderCycle(c as Cycle, { standalone: o.standalone })}
    />
  );
};

export default EventsNavigator;
