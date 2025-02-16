import React, { useState } from 'react';
import EventsList from './events/EventsList';
import EventDetails from './events/EventDetails';
import EventAttendance from './events/EventAttendance';
import EventDialog from './events/EventDialog';
import { DeleteDivisionDialog } from './dialogs/DeleteDivisionDialog';
import type { Event } from '../../types/EventTypes';

const INITIAL_EVENTS: Event[] = [
  {
    id: "1",
    title: "Training Cycle 25-1 Week 4 – A2G1: Bombs",
    description: "Welcome to Week 4 – time to drop some bombs! We'll be launching from the boat to drop a pair of JDAMs and a pair of LGBs each.",
    datetime: "2025-01-30T20:30:00",
    status: "upcoming",
    creator: {
      boardNumber: "637",
      callsign: "Prince",
      billet: "Train OIC"
    },
    attendance: {
      accepted: [
        { boardNumber: "637", callsign: "Prince", billet: "Train OIC" },
        { boardNumber: "551", callsign: "Boot" },
        { boardNumber: "523", callsign: "Grass" }
      ],
      declined: [
        { boardNumber: "556", callsign: "Zapp", billet: "OPS O" },
        { boardNumber: "771", callsign: "Ray" }
      ],
      tentative: []
    },
    restrictedTo: ["Cadre"]
  }
];

const EventsManagement: React.FC = () => {
  const [events, setEvents] = useState<Event[]>(INITIAL_EVENTS);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  const handleCreateEvent = (eventData: {
    title: string;
    description: string;
    datetime: string;
    restrictedTo?: string[];
  }) => {
    const newEvent: Event = {
      id: `${Date.now()}`,  // Simple ID generation
      ...eventData,
      status: 'upcoming',
      creator: {
        // TODO: Replace with actual logged-in user info
        boardNumber: "637",
        callsign: "Prince",
        billet: "Train OIC"
      },
      attendance: {
        accepted: [],
        declined: [],
        tentative: []
      }
    };

    setEvents(prevEvents => {
      // Sort by datetime in descending order (newest first)
      const updatedEvents = [...prevEvents, newEvent].sort((a, b) => 
        new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
      );
      return updatedEvents;
    });
    
    setShowEventDialog(false);
  };

  const handleEditEvent = (eventData: {
    title: string;
    description: string;
    datetime: string;
    restrictedTo?: string[];
  }) => {
    if (!editingEvent) return;

    setEvents(prevEvents => {
      return prevEvents.map(event => {
        if (event.id === editingEvent.id) {
          const updatedEvent = {
            ...event,
            ...eventData
          };
          // If this is the selected event, update the selection
          if (selectedEvent?.id === event.id) {
            setSelectedEvent(updatedEvent);
          }
          return updatedEvent;
        }
        return event;
      }).sort((a, b) => 
        new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
      );
    });

    setEditingEvent(null);
    setShowEventDialog(false);
  };

  const handleDeleteEvent = (event: Event) => {
    setEventToDelete(event);
    setShowDeleteDialog(true);
  };

  const confirmDeleteEvent = () => {
    if (!eventToDelete) return;

    setEvents(prevEvents => {
      const updatedEvents = prevEvents.filter(e => e.id !== eventToDelete.id);
      // If we're deleting the selected event, clear the selection
      if (selectedEvent?.id === eventToDelete.id) {
        setSelectedEvent(null);
      }
      return updatedEvents;
    });

    setShowDeleteDialog(false);
    setEventToDelete(null);
  };

  const handleEditClick = (event: Event) => {
    setEditingEvent(event);
    setShowEventDialog(true);
  };

  return (
    <div 
      style={{ 
        backgroundColor: '#F0F4F8', 
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxSizing: 'border-box',
        padding: '20px'
      }}
    >
      <div 
        style={{
          display: 'flex',
          gap: '20px',
          height: 'calc(100vh - 40px)',
          position: 'relative',
          zIndex: 1,
          maxWidth: '1710px',
          width: 'min(100%, 1710px)',
          boxSizing: 'border-box'
        }}
      >
        <EventsList
          events={events}
          selectedEvent={selectedEvent}
          onEventSelect={setSelectedEvent}
          onNewEvent={() => {
            setEditingEvent(null);
            setShowEventDialog(true);
          }}
          onEditEvent={handleEditClick}
          onDeleteEvent={handleDeleteEvent}
        />
        
        <EventDetails event={selectedEvent} />
        
        <EventAttendance event={selectedEvent} />
      </div>

      {showEventDialog && (
        <EventDialog
          onSave={editingEvent ? handleEditEvent : handleCreateEvent}
          onCancel={() => {
            setShowEventDialog(false);
            setEditingEvent(null);
          }}
          initialData={editingEvent ?? undefined}
        />
      )}

      {showDeleteDialog && eventToDelete && (
        <DeleteDivisionDialog
          onConfirm={confirmDeleteEvent}
          onCancel={() => {
            setShowDeleteDialog(false);
            setEventToDelete(null);
          }}
          sectionTitle="Event"
          divisionLabel={eventToDelete.title}
        />
      )}
    </div>
  );
};

export default EventsManagement;