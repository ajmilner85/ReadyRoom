import React, { useState } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import type { Event } from '../../../types/EventTypes';

interface EventsListProps {
  events: Event[];
  selectedEvent: Event | null;
  onEventSelect: (event: Event) => void;
  onNewEvent: () => void;
  onEditEvent?: (event: Event) => void;
  onDeleteEvent?: (event: Event) => void;
}

const EventsList: React.FC<EventsListProps> = ({
  events,
  selectedEvent,
  onEventSelect,
  onNewEvent,
  onEditEvent,
  onDeleteEvent
}) => {
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);

  // Group events by upcoming/past
  const now = new Date();
  const { upcomingEvents, pastEvents } = events.reduce((acc, event) => {
    const eventDate = new Date(event.datetime);
    if (eventDate >= now) {
      acc.upcomingEvents.push(event);
    } else {
      acc.pastEvents.push(event);
    }
    return acc;
  }, { upcomingEvents: [] as Event[], pastEvents: [] as Event[] });

  // Sort both arrays by date
  upcomingEvents.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
  pastEvents.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());

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
              backgroundColor: '#E2E8F0'
            }}
          />
          <span 
            style={{
              position: 'relative',
              backgroundColor: '#FFFFFF',
              padding: '0 16px',
              color: '#646F7E',
              fontSize: '12px',
              fontFamily: 'Inter',
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
              backgroundColor: selectedEvent?.id === event.id ? '#EFF6FF' : hoveredEvent === event.id ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
              borderRadius: '8px',
              padding: '12px',
              position: 'relative'
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
                  backgroundColor: selectedEvent?.id === event.id ? '#EFF6FF' : hoveredEvent === event.id ? 'rgba(100, 116, 139, 0.1)' : 'transparent',
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
                      background: 'white',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
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
                    <Edit2 size={16} />
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
                      background: 'white',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
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
                    <Trash2 size={16} />
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
        {renderEventGroup(upcomingEvents, 'Upcoming')}
        {renderEventGroup(pastEvents, 'Previous Events')}
      </div>

      {/* Add Event Button */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '18px',
        position: 'relative',
        zIndex: 5,
        borderTop: '1px solid #E2E8F0'
      }}>
        <button
          onClick={onNewEvent}
          style={{
            width: '119px',
            height: '30px',
            background: '#FFFFFF',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            transition: 'box-shadow 0.2s ease-in-out',
            fontFamily: 'Inter',
            fontStyle: 'normal',
            fontWeight: 400,
            fontSize: '20px',
            lineHeight: '24px',
            color: '#64748B',
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