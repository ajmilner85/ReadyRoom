import React, { useState } from 'react';
import { Icon } from '../primitives';
import type { Event, Cycle } from '../../../types/EventTypes';

interface EventsListProps {
  events: Event[];
  cycles: Cycle[];
  selectedEvent: Event | null;
  onEventSelect: (event: Event) => void;
  onNewEvent: () => void;
  onEditEvent?: (event: Event) => void;
  onDeleteEvent?: (event: Event) => void;
  onRemoveAll?: () => void;
  showRemoveAll?: boolean;
  showCycleIndicator?: boolean;
}

const EventsList: React.FC<EventsListProps> = ({
  events,
  cycles,
  selectedEvent,
  onEventSelect,
  onNewEvent,
  onEditEvent,
  onDeleteEvent,
  onRemoveAll,
  showRemoveAll = false,
  showCycleIndicator = false
}) => {
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);

  // Group events by active/upcoming/past
  const now = new Date();
  const { activeEvents, upcomingEvents, pastEvents } = events.reduce((acc, event) => {
    const eventDate = new Date(event.datetime);
    const eventEndDate = event.endDatetime ? new Date(event.endDatetime) : eventDate;

    // Active: event has started but not yet ended
    if (eventDate <= now && eventEndDate >= now) {
      acc.activeEvents.push(event);
    } else if (eventDate > now) {
      acc.upcomingEvents.push(event);
    } else {
      acc.pastEvents.push(event);
    }
    return acc;
  }, { activeEvents: [] as Event[], upcomingEvents: [] as Event[], pastEvents: [] as Event[] });

  // Sort arrays by date
  activeEvents.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
  upcomingEvents.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
  pastEvents.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());

  // Extract "Next Events" from upcomingEvents (one per cycle or standalone)
  const nextEvents: Event[] = [];
  const remainingUpcomingEvents: Event[] = [];
  const seenCycles = new Set<string>();

  if (showCycleIndicator) {
    // When showing all events, group next events by cycle
    upcomingEvents.forEach(event => {
      if (event.cycleId) {
        // Event is part of a cycle
        if (!seenCycles.has(event.cycleId)) {
          nextEvents.push(event);
          seenCycles.add(event.cycleId);
        } else {
          remainingUpcomingEvents.push(event);
        }
      } else {
        // Standalone event - add to next events
        nextEvents.push(event);
      }
    });
  } else {
    // When showing events from a single cycle, don't separate next events
    remainingUpcomingEvents.push(...upcomingEvents);
  }

  const renderEventGroup = (events: Event[], groupTitle: string) => {
    if (events.length === 0) return null;

    return (
      <div key={groupTitle}>
        {/* Group divider */}
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
              backgroundColor: 'var(--rr-panel3)'
            }}
          />
          <span 
            style={{
              position: 'relative',
              backgroundColor: 'var(--rr-panel)',
              padding: '0 16px',
              color: 'var(--rr-text2)',
              fontSize: '12px',
              fontFamily: 'inherit',
              fontWeight: 300,
              textTransform: 'uppercase'
            }}
          >
            {groupTitle}
          </span>
        </div>

        {/* Event entries */}
        {events.map(event => (
          <div
            key={event.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '10px',
              cursor: 'pointer',
              backgroundColor: selectedEvent?.id === event.id ? 'var(--rr-accent-weak)' : hoveredEvent === event.id ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
              borderRadius: '8px',
              padding: '12px',
              position: 'relative'
            }}
            onClick={() => onEventSelect(event)}
            onMouseEnter={() => setHoveredEvent(event.id)}
            onMouseLeave={() => setHoveredEvent(null)}
          >
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: onEditEvent || onDeleteEvent ? '68px' : 0, overflowWrap: 'anywhere' }}>
              {/* Show cycle name if event is part of a cycle */}
              {event.cycleId && (() => {
                const cycle = cycles.find(c => c.id === event.cycleId);
                return cycle ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {showCycleIndicator && (
                      <Icon name="cornerDownRight" size={14} style={{ color: 'var(--rr-text3)', flexShrink: 0 }} />
                    )}
                    <span style={{ fontSize: '12px', color: 'var(--rr-text3)', fontWeight: 400 }}>
                      {cycle.name}
                    </span>
                  </div>
                ) : null;
              })()}
              <span style={{
                fontSize: '16px',
                fontWeight: 700,
                color: showCycleIndicator && !event.cycleId ? 'var(--rr-accent-text)' : 'var(--rr-text)'
              }}>
                {event.title}
              </span>
            </div>
            
            {/* Action buttons - only visible when row is hovered or selected */}
            {(hoveredEvent === event.id || selectedEvent?.id === event.id) && (
              <div 
                style={{
                  display: 'flex',
                  gap: '8px',
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  backgroundColor: selectedEvent?.id === event.id ? 'var(--rr-accent-weak)' : hoveredEvent === event.id ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
                  padding: '4px',
                  borderRadius: '4px'
                }}
              >
                {onEditEvent && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditEvent(event);
                    }}
                    style={{
                      padding: '4px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: 'var(--rr-panel)',
                      boxShadow: 'var(--rr-shadow)',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'box-shadow 0.1s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    }}
                  >
                    <Icon name="edit" size={16} />
                  </button>
                )}
                {onDeleteEvent && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteEvent(event);
                    }}
                    style={{
                      padding: '4px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: 'var(--rr-panel)',
                      boxShadow: 'var(--rr-shadow)',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'box-shadow 0.1s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        height: '100%',
        boxSizing: 'border-box'
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 10px 10px', marginBottom: '8px' }}>
        {renderEventGroup(activeEvents, 'Active')}
        {showCycleIndicator && renderEventGroup(nextEvents, 'Next Events')}
        {renderEventGroup(showCycleIndicator ? remainingUpcomingEvents : upcomingEvents, 'Upcoming Events')}
        {renderEventGroup(pastEvents, 'Previous Events')}
      </div>

      {/* Footer with Add Event Button and Remove All Button */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '18px',
        position: 'relative',
        zIndex: 5,
        borderTop: '1px solid var(--rr-border)'
      }}>
        {/* Remove All Button - positioned on the left */}
        {showRemoveAll && onRemoveAll && (
          <button
            onClick={onRemoveAll}
            style={{
              position: 'absolute',
              left: '18px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              backgroundColor: 'var(--rr-panel)',
              border: '1px solid var(--rr-border)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              color: 'var(--rr-text2)',
              transition: 'all 0.2s',
              fontWeight: 500
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--rr-panel2)';
              e.currentTarget.style.borderColor = 'var(--rr-border2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
              e.currentTarget.style.borderColor = 'var(--rr-border)';
            }}
          >
            <Icon name="trash" size={16} />
            <span>Remove All</span>
          </button>
        )}

        {/* Add Event Button - centered */}
        <button
          onClick={onNewEvent}
          style={{
            width: '119px',
            height: '30px',
            background: 'var(--rr-panel)',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            transition: 'box-shadow 0.2s ease-in-out',
            fontFamily: 'inherit',
            fontStyle: 'normal',
            fontWeight: 400,
            fontSize: '20px',
            lineHeight: '24px',
            color: 'var(--rr-text2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          +
        </button>
      </div>
    </div>
  );
};

export default EventsList;