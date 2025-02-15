import React from 'react';
import { Plus } from 'lucide-react';
import type { Event } from '../../../types/EventTypes';

interface EventsListProps {
  events: Event[];
  selectedEvent: Event | null;
  onEventSelect: (event: Event) => void;
  onNewEvent: () => void;
}

const EventsList: React.FC<EventsListProps> = ({
  events,
  selectedEvent,
  onEventSelect,
  onNewEvent
}) => {
  const [hoveredEvent, setHoveredEvent] = React.useState<string | null>(null);

  return (
    <div
      style={{
        width: '550px',
        maxWidth: '100%',
        backgroundColor: '#FFFFFF',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        height: '100%',
        boxSizing: 'border-box'
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '12px 20px'
      }}>
        <button
          onClick={onNewEvent}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: '#2563EB',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500
          }}
        >
          <Plus size={16} />
          New Event
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px 10px 10px', marginBottom: '8px' }}>
        {events.map(event => (
          <div
            key={event.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '10px',
              cursor: 'pointer',
              backgroundColor: selectedEvent?.id === event.id ? '#EFF6FF' : hoveredEvent === event.id ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
              borderRadius: '8px',
              padding: '12px'
            }}
            onClick={() => onEventSelect(event)}
            onMouseEnter={() => setHoveredEvent(event.id)}
            onMouseLeave={() => setHoveredEvent(null)}
          >
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                {event.title}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EventsList;