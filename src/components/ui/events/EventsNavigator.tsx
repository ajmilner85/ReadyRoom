import React from 'react';
import { Button, Icon, IconButton } from '../primitives';
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

const fmtShort = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
const fmtRange = (c: Cycle) => (c.startDate ? `${fmtShort(c.startDate)} – ${fmtShort(c.endDate)}` : '');

const groupCycles = (cycles: Cycle[]) => {
  const now = new Date();
  const active: Cycle[] = [], upcoming: Cycle[] = [], completed: Cycle[] = [];
  cycles.forEach(c => {
    const s = new Date(c.startDate), e = new Date(c.endDate);
    if (now >= s && now <= e) active.push(c);
    else if (now < s) upcoming.push(c);
    else completed.push(c);
  });
  active.sort((a, b) => +new Date(a.endDate) - +new Date(b.endDate));
  upcoming.sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate));
  completed.sort((a, b) => +new Date(b.endDate) - +new Date(a.endDate));
  return [
    { label: 'Active', items: active },
    { label: 'Upcoming', items: upcoming },
    { label: 'Completed', items: completed },
  ].filter(g => g.items.length > 0);
};

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

const GroupLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`flex items-center gap-2 font-mono text-[9.5px] tracking-[.14em] uppercase text-text3 ${className}`}>
    <span>{children}</span>
    <span className="flex-1 h-px bg-border" />
  </div>
);

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
  const groups = groupCycles(cycles);

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
              <span className="flex-none font-mono text-[10.5px] text-text3 group-hover/ev:hidden">{fmtShort(ev.datetime)}</span>
              <span className="flex-none hidden group-hover/ev:flex items-center gap-[2px]" onClick={e => e.stopPropagation()}>
                <IconButton icon="edit" size={24} iconSize={13} label="Edit event" onClick={() => onEditEvent(ev)} />
                <IconButton icon="trash" size={24} iconSize={13} className="hover:!text-bad" label="Delete event" onClick={() => onDeleteEvent(ev)} />
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
      <div
        key={cycle.id}
        className={`rounded-rr-lg border transition-colors ${open ? 'border-border2 bg-panel' : opts.standalone ? 'border-dashed border-border2' : 'border-border'} `}
      >
        <div
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={() => onCycleSelect(open ? null : cycle)}
          onKeyDown={e => { if (e.key === 'Enter') onCycleSelect(open ? null : cycle); }}
          className={`group/cy flex items-start gap-[8px] px-[10px] py-[9px] cursor-pointer rounded-rr-lg ${open ? '' : 'hover:bg-panel2'}`}
        >
          <span className="flex-none mt-[2px] text-text3 transition-transform duration-200" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>
            <Icon name="chevronRight" size={14} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold leading-[1.3] text-text" style={{ overflowWrap: 'anywhere' }}>{cycle.name}</div>
            <div className="flex items-center gap-[6px] mt-[2px] text-[11px] text-text2">
              {opts.standalone
                ? <span>Not part of a cycle</span>
                : <>
                    {cycle.type ? <span className="truncate">{cycle.type}</span> : null}
                    {cycle.type ? <span className="text-text3">·</span> : null}
                    <span className="font-mono text-[10.5px] whitespace-nowrap">{fmtRange(cycle)}</span>
                  </>}
              {open && !loadingEvents ? <span className="ml-auto font-mono text-[10.5px] text-text3">{events.length} EVT</span> : null}
            </div>
          </div>
          {!opts.standalone ? (
            <span className={`flex-none items-center gap-[2px] ${open ? 'flex' : 'hidden group-hover/cy:flex'}`} onClick={e => e.stopPropagation()}>
              <IconButton icon="edit" size={24} iconSize={13} label="Edit cycle" onClick={() => onEditCycle(cycle)} />
              <IconButton icon="trash" size={24} iconSize={13} className="hover:!text-bad" label="Delete cycle" onClick={() => onDeleteCycle(cycle)} />
            </span>
          ) : null}
        </div>

        {open ? (
          <div className="border-t border-border px-[6px] pb-[8px]">
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
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex-none w-[340px] min-h-0 flex flex-col bg-panel border border-border rounded-rr-xl shadow-rr overflow-hidden max-[760px]:w-auto">
      <div className="flex-none flex items-center gap-2 px-[14px] min-h-[46px] border-b border-border">
        <span className="rr-pane-title">Cycles &amp; Events</span>
        <span className="flex-1" />
        <Button size="sm" variant="secondary" icon="plus" onClick={onNewEvent}>Event</Button>
        <Button size="sm" variant="primary" icon="plus" onClick={onNewCycle}>Cycle</Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-[10px] flex flex-col gap-[8px]">
        {renderCycle(STANDALONE_CYCLE, { standalone: true })}
        {loadingCycles ? (
          <div className="py-6 flex justify-center"><LoadingSpinner /></div>
        ) : groups.map(g => (
          <React.Fragment key={g.label}>
            <GroupLabel className="mt-[6px] px-1">{g.label}</GroupLabel>
            {g.items.map(c => renderCycle(c))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default EventsNavigator;
