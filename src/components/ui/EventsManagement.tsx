import React, { useState, useEffect, useCallback, useRef } from 'react';
import EventsList from './events/EventsList';
import EventDetails from './events/EventDetails';
import EventAttendance from './events/EventAttendance';
import EventDialog from './events/EventDialog';
import CyclesList from './events/CyclesList';
import CycleDialog from './events/CycleDialog';
import { DeleteDivisionDialog } from './dialogs/DeleteDivisionDialog';
import type { Event, Cycle, CycleType } from '../../types/EventTypes';
import { fetchCycles, createCycle, updateCycle, deleteCycle, 
         fetchEvents, createEvent, updateEvent, deleteEvent } from '../../utils/supabaseClient';
import LoadingSpinner from './LoadingSpinner';
import { useWebSocket } from '../../context/WebSocketContext';

// Standard card width matching MissionPreparation component
const CARD_WIDTH = '550px';

const EventsManagement: React.FC = () => {
  // State for data
  const [events, setEvents] = useState<Event[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState({
    cycles: false,
    events: false
  });
  const [error, setError] = useState<string | null>(null);
  
  // Get WebSocket context
  const { lastEventUpdate } = useWebSocket();
  
  // State for UI interactions
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<Cycle | null>(null);
  
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showCycleDialog, setShowCycleDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [cycleToDelete, setCycleToDelete] = useState<Cycle | null>(null);
  const [isDeleteCycle, setIsDeleteCycle] = useState(false);
  
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editingCycle, setEditingCycle] = useState<Cycle | null>(null);

  // Reference to keep track of last processed event update
  const lastProcessedUpdateRef = useRef<string | null>(null);

  // Fetch cycles and events on component mount
  useEffect(() => {
    loadCycles();
    loadEvents();
  }, []);

  // Fetch events when selected cycle changes
  useEffect(() => {
    loadEvents(selectedCycle?.id);
  }, [selectedCycle]);

  // Watch for WebSocket event updates - fixed to prevent infinite loops
  useEffect(() => {
    // Skip if no update or already processed this update
    if (!lastEventUpdate || !events.length || 
        lastProcessedUpdateRef.current === JSON.stringify(lastEventUpdate)) return;

    // Mark this update as processed
    lastProcessedUpdateRef.current = JSON.stringify(lastEventUpdate);
    
    // Find event with the matching Discord message ID
    const updatedEvents = events.map(event => {
      // Check if this event matches the updated Discord message ID
      if (event.discordMessageId === lastEventUpdate.eventId) {
        // Create updated event with new attendance data
        const updatedEvent: Event = {
          ...event,
          attendance: {
            accepted: lastEventUpdate.eventData.accepted.map(user => ({
              boardNumber: user.userId.substring(0, 3), // Using first 3 chars of Discord ID as board number (placeholder)
              callsign: user.displayName,
            })),
            declined: lastEventUpdate.eventData.declined.map(user => ({
              boardNumber: user.userId.substring(0, 3), // Using first 3 chars of Discord ID as board number (placeholder)
              callsign: user.displayName,
            })),
            tentative: lastEventUpdate.eventData.tentative.map(user => ({
              boardNumber: user.userId.substring(0, 3), // Using first 3 chars of Discord ID as board number (placeholder)
              callsign: user.displayName,
            }))
          }
        };
        
        // If this is the selected event, update it as well
        if (selectedEvent && selectedEvent.id === event.id) {
          setSelectedEvent(updatedEvent);
        }
        
        return updatedEvent;
      }
      return event;
    });
    
    setEvents(updatedEvents);
  }, [lastEventUpdate]); // Only depend on lastEventUpdate, not events or selectedEvent

  // Load cycles from database
  const loadCycles = async () => {
    setLoading(prev => ({ ...prev, cycles: true }));
    try {
      const { cycles: fetchedCycles, error } = await fetchCycles();
      if (error) {
        throw error;
      }
      setCycles(fetchedCycles);
    } catch (err: any) {
      setError(`Failed to load cycles: ${err.message}`);
    } finally {
      setLoading(prev => ({ ...prev, cycles: false }));
    }
  };

  // Load events from database
  const loadEvents = async (cycleId?: string) => {
    setLoading(prev => ({ ...prev, events: true }));
    try {
      const { events: fetchedEvents, error } = await fetchEvents(cycleId);
      if (error) {
        throw error;
      }
      
      // Load Discord message IDs from localStorage
      const storedMap = localStorage.getItem('eventDiscordMessageIds');
      const eventDiscordMap = storedMap ? JSON.parse(storedMap) : {};
      
      // Attach Discord message IDs to events
      const eventsWithDiscordIds = fetchedEvents.map(event => {
        return {
          ...event,
          // Only use localStorage as fallback if database doesn't have an ID
          discordMessageId: event.discordEventId || eventDiscordMap[event.id] || undefined
        };
      });
      
      setEvents(eventsWithDiscordIds);
      
      // If we had a selected event and it's still in the list, update it
      if (selectedEvent) {
        const updatedSelectedEvent = eventsWithDiscordIds.find(e => e.id === selectedEvent.id);
        if (updatedSelectedEvent) {
          setSelectedEvent(updatedSelectedEvent);
        } else {
          // If the selected event is no longer in the list, clear selection
          setSelectedEvent(null);
        }
      }
    } catch (err: any) {
      setError(`Failed to load events: ${err.message}`);
    } finally {
      setLoading(prev => ({ ...prev, events: false }));
    }
  };

  // Event handlers
  const handleCreateEvent = async (eventData: {
    title: string;
    description: string;
    datetime: string;
    endDatetime?: string;
    duration?: {
      hours: number;
      minutes: number;
    };
    restrictedTo?: string[];
  }) => {
    try {
      // Determine event type based on cycle
      let eventType = undefined;
      if (selectedCycle) {
        if (selectedCycle.type === 'Training') {
          eventType = 'Hop';
        } else if (selectedCycle.type === 'Cruise-WorkUp') {
          eventType = 'Evolution';
        } else if (selectedCycle.type === 'Cruise-Mission') {
          eventType = 'Episode';
        }
      }

      const { event, error } = await createEvent({
        ...eventData,
        status: 'upcoming',
        cycleId: selectedCycle?.id,
        eventType
      });

      if (error) throw error;
      
      // Reload events to get the latest data
      await loadEvents(selectedCycle?.id);
      setShowEventDialog(false);
    } catch (err: any) {
      setError(`Failed to create event: ${err.message}`);
    }
  };

  const handleEditEvent = async (eventData: {
    title: string;
    description: string;
    datetime: string;
    endDatetime?: string;
    duration?: {
      hours: number;
      minutes: number;
    };
    restrictedTo?: string[];
  }) => {
    if (!editingEvent) return;
    
    try {
      const { event, error } = await updateEvent(editingEvent.id, eventData);
      if (error) throw error;
      
      // Reload events to get the latest data
      await loadEvents(selectedCycle?.id);
      setEditingEvent(null);
      setShowEventDialog(false);
    } catch (err: any) {
      setError(`Failed to update event: ${err.message}`);
    }
  };

  const handleDeleteEvent = (event: Event) => {
    setEventToDelete(event);
    setIsDeleteCycle(false);
    setShowDeleteDialog(true);
  };

  // Cycle handlers
  const handleCreateCycle = async (cycleData: {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    type: CycleType;
    restrictedTo?: string[];
  }) => {
    try {
      // Determine status based on dates
      const now = new Date();
      const startDate = new Date(cycleData.startDate);
      const endDate = new Date(cycleData.endDate);
      
      let status: 'active' | 'completed' | 'upcoming';
      if (now >= startDate && now <= endDate) {
        status = 'active';
      } else if (now < startDate) {
        status = 'upcoming';
      } else {
        status = 'completed';
      }

      const { cycle, error } = await createCycle({
        ...cycleData,
        status
      });
      
      if (error) throw error;
      
      // Reload cycles to get the latest data
      await loadCycles();
      setShowCycleDialog(false);
    } catch (err: any) {
      setError(`Failed to create cycle: ${err.message}`);
    }
  };

  const handleEditCycle = async (cycleData: {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    type: CycleType;
    restrictedTo?: string[];
  }) => {
    if (!editingCycle) return;
    
    try {
      // Determine status based on dates
      const now = new Date();
      const startDate = new Date(cycleData.startDate);
      const endDate = new Date(cycleData.endDate);
      
      let status: 'active' | 'completed' | 'upcoming';
      if (now >= startDate && now <= endDate) {
        status = 'active';
      } else if (now < startDate) {
        status = 'upcoming';
      } else {
        status = 'completed';
      }

      const { cycle, error } = await updateCycle(editingCycle.id, {
        ...cycleData,
        status
      });
      
      if (error) throw error;
      
      // Reload cycles to get the latest data
      await loadCycles();
      
      // If this was the selected cycle, update the selection
      if (selectedCycle?.id === editingCycle.id) {
        setSelectedCycle(cycle);
        // Also reload events to reflect any changes in cycle relationship
        await loadEvents(cycle?.id);
      }
      
      setEditingCycle(null);
      setShowCycleDialog(false);
    } catch (err: any) {
      setError(`Failed to update cycle: ${err.message}`);
    }
  };

  const handleDeleteCycle = (cycle: Cycle) => {
    // Check if there are events associated with this cycle
    const hasAssociatedEvents = events.some(event => event.cycleId === cycle.id);
    
    if (hasAssociatedEvents) {
      // Show an error or confirmation to delete associated events as well
      setError("Cannot delete a cycle with associated events. Please delete the events first.");
      return;
    }
    
    setCycleToDelete(cycle);
    setIsDeleteCycle(true);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    try {
      if (isDeleteCycle && cycleToDelete) {
        // Delete cycle
        const { error } = await deleteCycle(cycleToDelete.id);
        if (error) throw error;
        
        // If we're deleting the selected cycle, clear the selection
        if (selectedCycle?.id === cycleToDelete.id) {
          setSelectedCycle(null);
        }
        
        // Reload cycles
        await loadCycles();
      } else if (eventToDelete) {
        // Delete event
        const { error } = await deleteEvent(eventToDelete.id);
        if (error) throw error;
        
        // If we're deleting the selected event, clear the selection
        if (selectedEvent?.id === eventToDelete.id) {
          setSelectedEvent(null);
        }
        
        // Reload events
        await loadEvents(selectedCycle?.id);
      }
    } catch (err: any) {
      setError(`Failed to delete: ${err.message}`);
    } finally {
      setShowDeleteDialog(false);
      setEventToDelete(null);
      setCycleToDelete(null);
    }
  };

  const handleEditEventClick = (event: Event) => {
    setEditingEvent(event);
    setShowEventDialog(true);
  };

  const handleEditCycleClick = (cycle: Cycle) => {
    setEditingCycle(cycle);
    setShowCycleDialog(true);
  };

  // Clear any error message after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Filter events when a cycle is selected
  const filteredEvents = selectedCycle 
    ? events.filter(event => event.cycleId === selectedCycle.id)
    : events;

  return (
    <div 
      style={{ 
        backgroundColor: '#F0F4F8', 
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxSizing: 'border-box',
        padding: '20px',
        overflow: 'visible'
      }}
    >
      {/* Error notification */}
      {error && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#FEE2E2',
          color: '#B91C1C',
          padding: '12px 16px',
          borderRadius: '4px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          zIndex: 1000
        }}>
          {error}
        </div>
      )}

      <div 
        style={{
          display: 'flex',
          gap: '20px',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 40px)',
          position: 'relative',
          zIndex: 1,
          maxWidth: '2240px',
          width: 'min(100%, 2240px)',
          boxSizing: 'border-box',
          overflow: 'visible',
          padding: '15px',
          margin: '-15px',
        }}
      >
        {/* Cycles List */}
        <div style={{ 
          width: CARD_WIDTH, 
          minWidth: '350px', 
          height: 'calc(100vh - 40px)',
          boxSizing: 'border-box',
          overflowY: 'visible'
        }}>
          {loading.cycles ? (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              backgroundColor: '#FFFFFF',
              boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
              borderRadius: '8px'
            }}>
              <LoadingSpinner />
            </div>
          ) : (
            <CyclesList
              cycles={cycles}
              selectedCycle={selectedCycle}
              onCycleSelect={setSelectedCycle}
              onNewCycle={() => {
                setEditingCycle(null);
                setShowCycleDialog(true);
              }}
              onEditCycle={handleEditCycleClick}
              onDeleteCycle={handleDeleteCycle}
            />
          )}
        </div>
        
        {/* Events List */}
        <div style={{ 
          width: CARD_WIDTH, 
          minWidth: '350px', 
          height: 'calc(100vh - 40px)',
          boxSizing: 'border-box',
          overflowY: 'visible'
        }}>
          {loading.events ? (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              backgroundColor: '#FFFFFF',
              boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
              borderRadius: '8px'
            }}>
              <LoadingSpinner />
            </div>
          ) : (
            <EventsList
              events={filteredEvents}
              selectedEvent={selectedEvent}
              onEventSelect={setSelectedEvent}
              onNewEvent={() => {
                setEditingEvent(null);
                setShowEventDialog(true);
              }}
              onEditEvent={handleEditEventClick}
              onDeleteEvent={handleDeleteEvent}
            />
          )}
        </div>
        
        {/* Event Details */}
        <div style={{ 
          width: CARD_WIDTH, 
          minWidth: '350px', 
          height: 'calc(100vh - 40px)',
          boxSizing: 'border-box',
          overflowY: 'visible'
        }}>
          <EventDetails event={selectedEvent} />
        </div>
        
        {/* Event Attendance */}
        <div style={{ 
          width: CARD_WIDTH, 
          minWidth: '350px', 
          height: 'calc(100vh - 40px)',
          boxSizing: 'border-box',
          overflowY: 'visible'
        }}>
          <EventAttendance event={selectedEvent} />
        </div>
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

      {showCycleDialog && (
        <CycleDialog
          onSave={editingCycle ? handleEditCycle : handleCreateCycle}
          onCancel={() => {
            setShowCycleDialog(false);
            setEditingCycle(null);
          }}
          initialData={editingCycle ?? undefined}
        />
      )}

      {showDeleteDialog && (isDeleteCycle ? cycleToDelete : eventToDelete) && (
        <DeleteDivisionDialog
          onConfirm={confirmDelete}
          onCancel={() => {
            setShowDeleteDialog(false);
            setEventToDelete(null);
            setCycleToDelete(null);
          }}
          sectionTitle={isDeleteCycle ? "Cycle" : "Event"}
          divisionLabel={isDeleteCycle 
            ? cycleToDelete?.name || "" 
            : eventToDelete?.title || ""}
        />
      )}
    </div>
  );
};

export default EventsManagement;