import React, { useState, useEffect, useCallback, useRef } from 'react';
import EventsList from './events/EventsList';
import EventDetails from './events/EventDetails';
import EventAttendance from './events/EventAttendance';
import EventDialog from './events/EventDialog';
import CyclesList from './events/CyclesList';
import CycleDialog from './events/CycleDialog';
import { DeleteDivisionDialog } from './dialogs/DeleteDivisionDialog';
import type { Event, Cycle, CycleType } from '../../types/EventTypes';
import { supabase, fetchCycles, createCycle, updateCycle, deleteCycle, 
         fetchEvents, createEvent, updateEvent, deleteEvent } from '../../utils/supabaseClient';
import { deleteDiscordMessage, deleteMultiChannelEvent, updateMultiChannelEvent } from '../../utils/discordService';
import { uploadEventImage, uploadMultipleEventImages, deleteEventImage } from '../../utils/eventImageService';
import LoadingSpinner from './LoadingSpinner';
import { useWebSocket } from '../../context/WebSocketContext';
import { getAllSquadrons } from '../../utils/organizationService';
import { Squadron } from '../../types/OrganizationTypes';

// Standard card width matching MissionPreparation component
const CARD_WIDTH = '550px';

const EventsManagement: React.FC = () => {
  // State for data
  const [events, setEvents] = useState<Event[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [squadrons, setSquadrons] = useState<Squadron[]>([]);
  const [loading, setLoading] = useState({
    cycles: false,
    events: false,
    squadrons: false,
    initial: true // Add initial loading state to prevent flash of unfiltered content
  });
  const [error, setError] = useState<string | null>(null);
  const [discordGuildId, setDiscordGuildId] = useState<string | null>(null);
  
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
    fetchDiscordGuildId().then(() => {
      loadCycles();
    });
    loadSquadrons();
  }, []);

  // Load squadrons function
  const loadSquadrons = async () => {
    setLoading(prev => ({ ...prev, squadrons: true }));
    try {
      const { data, error } = await getAllSquadrons();
      if (error) {
        throw error;
      }
      setSquadrons(data || []);
    } catch (err: any) {
      console.error('Failed to load squadrons:', err);
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, squadrons: false }));
    }
  };

  // Fetch Discord guild ID from squadron settings
  const fetchDiscordGuildId = async () => {
    try {
      const { data, error } = await supabase
        .from('squadron_settings')
        .select('value')
        .eq('key', 'discord_guild_id')
        .single();
      
      if (error) {
        console.warn('Error fetching Discord guild ID:', error.message);
        return;
      }
      
      if (data?.value) {
        setDiscordGuildId(data.value);
        console.log('Using Discord guild ID for filtering:', data.value);
      }
    } catch (err: any) {
      console.warn('Failed to get Discord guild ID:', err.message);
    }
  };

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
      // When fetching cycles, filter by Discord guild ID if available
      const { data: settingsData } = await supabase
        .from('squadron_settings')
        .select('value')
        .eq('key', 'discord_guild_id')
        .single();
      const guildId = settingsData?.value || null;
      setDiscordGuildId(guildId);
      
      // Pass the guild ID to fetchCycles to filter by guild
      const { cycles: fetchedCycles, error } = await fetchCycles(guildId);
      
      if (error) {
        throw error;
      }
      
      setCycles(fetchedCycles);
      
      // Auto-select the active cycle with the earliest start date
      if (fetchedCycles.length > 0) {
        const activeCycles = fetchedCycles.filter(cycle => cycle.status === 'active');
        
        if (activeCycles.length > 0) {
          // Sort active cycles by start date (ascending) and select the earliest one
          const sortedActiveCycles = [...activeCycles].sort((a, b) => 
            new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
          );
          
          const cycleToSelect = sortedActiveCycles[0];
          setSelectedCycle(cycleToSelect);
          
          // Load events for this cycle
          await loadEvents(cycleToSelect.id);
        } else {
          // No active cycles, but we're done loading
          setLoading(prev => ({ ...prev, events: false, initial: false }));
        }
      } else {
        // No cycles at all, but we're done loading
        setLoading(prev => ({ ...prev, events: false, initial: false }));
      }
    } catch (err: any) {
      setError(`Failed to load cycles: ${err.message}`);
      // Even if there's an error, we're done with initial loading
      setLoading(prev => ({ ...prev, initial: false }));
    } finally {
      setLoading(prev => ({ ...prev, cycles: false }));
    }
  };  
    // Load events from database
  const loadEvents = async (cycleId?: string) => {
    setLoading(prev => ({ ...prev, events: true }));
    try {
      // Always filter by Discord guild ID, whether or not a cycle is selected
      const { events: fetchedEvents, error } = await fetchEvents(cycleId, discordGuildId || undefined);
      if (error) {
        throw error;
      }
      
      // Load Discord message IDs from localStorage
      const storedMap = localStorage.getItem('eventDiscordMessageIds');
      const eventDiscordMap = storedMap ? JSON.parse(storedMap) : {};
      
      // Attach Discord message IDs to events
      const eventsWithDiscordIds = fetchedEvents.map(event => {
        // Cast to any to access potential database fields that might not be in the TypeScript type
        const eventObj = event as any;
        // Handle JSONB discord_event_id properly - extract first message ID for compatibility
        let discordMessageId = eventDiscordMap[event.id] || undefined;
        if (Array.isArray(eventObj.discord_event_id) && eventObj.discord_event_id.length > 0) {
          discordMessageId = eventObj.discord_event_id[0].messageId;
        } else if (typeof eventObj.discord_event_id === 'string') {
          discordMessageId = eventObj.discord_event_id;
        }
        
        console.log(`[DEBUG] Processing event ${event.id}: discord_event_id=${JSON.stringify(eventObj.discord_event_id)}, localStorage ID=${eventDiscordMap[event.id]}`);
        
        // Remove the problematic JSONB field from the spread to prevent React rendering issues
        const { discord_event_id: _, ...eventWithoutDiscordEventId } = eventObj;
        
        return {
          ...eventWithoutDiscordEventId,
          // Store the ID in both potential field names for maximum compatibility (as strings only)
          discordMessageId: typeof discordMessageId === 'string' ? discordMessageId : undefined,
          discord_event_id: typeof discordMessageId === 'string' ? discordMessageId : undefined
        };
      });
      
      // Create a properly ordered and filtered list of events
      setEvents(eventsWithDiscordIds);
      
      // Auto-select the latest event if there are events and we have a selected cycle
      if (eventsWithDiscordIds.length > 0 && cycleId) {
        // Find the latest event by datetime (descending order)
        const sortedEvents = [...eventsWithDiscordIds].sort((a, b) => 
          new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
        );
        
        // Select the latest event (first in sorted array)
        setSelectedEvent(sortedEvents[0]);
      } else if (selectedEvent) {
        // If we had a selected event and it's still in the list, update it
        const updatedSelectedEvent = eventsWithDiscordIds.find(e => e.id === selectedEvent.id);
        if (updatedSelectedEvent) {
          setSelectedEvent(updatedSelectedEvent);
        } else {
          // If the selected event is no longer in the list, clear selection
          setSelectedEvent(null);
        }
      }
      
      // Only update filtered events directly here if we're in the initial loading
      // Otherwise the filteredEvents useEffect will handle it
      if (loading.initial) {
        // This prevents the flash of unfiltered events on initial load
        if (cycleId) {
          const filtered = eventsWithDiscordIds.filter(event => event.cycleId === cycleId);
          setFilteredEvents(filtered);
        } else {
          setFilteredEvents([]);
        }
      }
    } catch (err: any) {
      setError(`Failed to load events: ${err.message}`);
      setFilteredEvents([]); // Clear filtered events on error
    } finally {
      // Turn off events loading and also the initial loading state
      setLoading(prev => ({ 
        ...prev, 
        events: false, 
        initial: false // Mark initial loading as complete when events are loaded
      }));
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
    participants?: string[];
    headerImage?: File | null;
    additionalImages?: (File | null)[];
  }) => {
    try {
      // Determine event type based on cycle
      let eventType: any = undefined; // Using any to avoid TypeScript error
      if (selectedCycle) {
        if (selectedCycle.type === 'Training') {
          eventType = 'Hop';
        } else if (selectedCycle.type === 'Cruise-WorkUp') {
          eventType = 'Evolution';
        } else if (selectedCycle.type === 'Cruise-Mission') {
          eventType = 'Episode';
        }
      }      
      // Create the event first without image
      const { event: newEvent, error } = await createEvent({
        ...eventData,
        status: 'upcoming',
        cycleId: selectedCycle?.id,
        eventType,
        discordGuildId: discordGuildId || undefined
      });

      console.log('[CREATE-EVENT-DEBUG] createEvent result:', { newEvent, error });
      if (error) throw error;
      
      // Upload multiple images if provided
      console.log('[IMAGE-DEBUG] Full eventData object keys:', Object.keys(eventData));
      console.log('[IMAGE-DEBUG] eventData.headerImage:', eventData.headerImage);
      console.log('[IMAGE-DEBUG] eventData.additionalImages:', eventData.additionalImages);
      console.log('[IMAGE-DEBUG] Checking image upload conditions:', {
        hasHeaderImage: !!eventData.headerImage,
        hasAdditionalImages: !!eventData.additionalImages,
        additionalImagesLength: eventData.additionalImages?.length,
        hasNewEvent: !!newEvent,
        newEventId: newEvent?.id
      });
      
      if ((eventData.headerImage || eventData.additionalImages) && newEvent && newEvent.id) {
        console.log('Starting multiple image upload...');
        const { urls: imageUrls, error: uploadError } = await uploadMultipleEventImages(newEvent.id, {
          headerImage: eventData.headerImage,
          additionalImages: eventData.additionalImages
        });
        if (uploadError) {
          console.error('Failed to upload images:', uploadError);
          setError('Event created but image upload failed');
        } else {
          console.log('Image upload successful:', imageUrls);
        }
      } else {
        console.log('No images to upload or missing event data');
      }
      
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
    participants?: string[];
    headerImage?: File | null;
    additionalImages?: (File | null)[];
  }) => {
    if (!editingEvent) return;
    
    try {
      // First update the database (don't update discord_event_id to preserve JSONB structure)
      const { error } = await updateEvent(editingEvent.id, {
        ...eventData
        // Don't override discord_event_id - let it stay as JSONB in database
      });
      if (error) throw error;
      
      // Upload multiple images if provided
      if (eventData.headerImage || eventData.additionalImages) {
        const { urls: imageUrls, error: uploadError } = await uploadMultipleEventImages(editingEvent.id, {
          headerImage: eventData.headerImage,
          additionalImages: eventData.additionalImages
        });
        if (uploadError) {
          console.error('Failed to upload images:', uploadError);
          setError('Event updated but image upload failed');
        }
      }
      
      // Check if this event has Discord messages by fetching fresh data from database
      // (editingEvent only has the converted string version, not the original JSONB)
      if (editingEvent.discordEventId) {
        console.log(`[UPDATE-EVENT] Event has Discord messages, fetching fresh data for multi-channel update`);
        
        // Fetch fresh event data with original JSONB discord_event_id
        const { data: freshEventData, error: fetchError } = await supabase
          .from('events')
          .select('*')
          .eq('id', editingEvent.id)
          .single();
          
        if (fetchError || !freshEventData) {
          console.error('[UPDATE-EVENT] Failed to fetch fresh event data:', fetchError);
        } else {
          console.log(`[UPDATE-EVENT] Event has Discord messages, updating Discord posts`);
          
          // Create updated event object with fresh database data and new user input
          const updatedEvent = {
            ...freshEventData, // Use fresh data from database (includes original JSONB discord_event_id)
            ...eventData, // Apply user changes
            // Convert datetime back to ISO format if needed
            title: eventData.title, // Ensure title field mapping
            datetime: eventData.datetime.includes('T') ? eventData.datetime : `${eventData.datetime}:00.000Z`,
            endDatetime: eventData.endDatetime?.includes('T') ? eventData.endDatetime : `${eventData.endDatetime}:00.000Z`
          };
        
          console.log(`[UPDATE-EVENT] Updated event object:`, {
            id: updatedEvent.id,
            title: updatedEvent.title,
            cycleId: updatedEvent.cycleId || updatedEvent.cycle_id,
            participants: updatedEvent.participants,
            discord_event_id: updatedEvent.discord_event_id,
            allKeys: Object.keys(updatedEvent)
          });
          
          try {
            const discordResult = await updateMultiChannelEvent(updatedEvent);
            console.log(`[UPDATE-EVENT] Discord update result:`, discordResult);
            
            if (discordResult.errors.length > 0) {
              console.warn(`Warning: Some Discord updates failed:`, discordResult.errors);
            }
            
            if (discordResult.success) {
              console.log(`Successfully updated Discord messages in ${discordResult.publishedCount} channels`);
            }
          } catch (discordError) {
            console.error('[UPDATE-EVENT] Error updating Discord messages:', discordError);
            // Don't fail the whole update if Discord update fails
          }
        }
      }
      
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

      // Include the Discord guild ID with the cycle data
      const { error } = await createCycle({
        ...cycleData,
        status,
        discordGuildId: discordGuildId || undefined
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
        console.log(`[DEBUG] Starting deletion for event:`, eventToDelete);
        console.log(`[DEBUG] Event JSON:`, JSON.stringify(eventToDelete));
        console.log(`[DEBUG] All event properties:`, Object.keys(eventToDelete));
        
        // First try to delete any associated Discord messages from all channels
        try {
          console.log(`[DEBUG] Calling deleteMultiChannelEvent for multi-squadron deletion`);
          // Use the new multi-channel deletion function
          const { success, deletedCount, errors } = await deleteMultiChannelEvent(eventToDelete);
          
          console.log(`[DEBUG] Multi-channel delete result: success=${success}, deletedCount=${deletedCount}, errors=${errors.length}`);
          
          if (errors.length > 0) {
            console.warn(`Warning: Some Discord deletions failed:`, errors);
            // Continue with event deletion even if some Discord deletions fail
          }
          
          if (success) {
            console.log(`Successfully deleted Discord messages from ${deletedCount} channels for event: ${eventToDelete.id}`);
          } else {
            console.warn(`Failed to delete Discord messages for event: ${eventToDelete.id}`);
          }
        } catch (discordError) {
          console.error('[DEBUG] Error deleting Discord message:', discordError);
          // Continue with event deletion even if Discord deletion fails
        }
        
        // Delete event from database
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
  // Initialize a state specifically for filtered events to avoid flash of unfiltered content
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  
  // Effect to filter events when events or selected cycle changes
  useEffect(() => {
    // Only filter and show events when not in initial loading state
    if (loading.initial) return;
    
    if (selectedCycle) {
      const filtered = events.filter(event => event.cycleId === selectedCycle.id);
      setFilteredEvents(filtered);
    } else {
      setFilteredEvents([]); // Don't show any events if no cycle is selected
    }
  }, [events, selectedCycle, loading.initial]);

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

      {loading.initial ? (
        /* Display a single loading spinner during initial data fetch */
        <div 
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: 'calc(100vh - 40px)',
            width: '100%',
          }}
        >
          <div style={{
            backgroundColor: '#FFFFFF',
            boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            padding: '40px 80px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px'
          }}>
            <LoadingSpinner />
            <div>Loading events data...</div>
          </div>
        </div>
      ) : (
        /* Only render the main content when initial loading is complete */
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
      )}

      {showEventDialog && (
        <EventDialog
          onSave={editingEvent ? handleEditEvent : handleCreateEvent}
          onCancel={() => {
            setShowEventDialog(false);
            setEditingEvent(null);
          }}
          initialData={editingEvent ? {
            title: editingEvent.title,
            description: editingEvent.description || '',
            datetime: editingEvent.datetime,
            endDatetime: editingEvent.endDatetime || undefined,
            restrictedTo: editingEvent.restrictedTo,
            participants: editingEvent.participants,
            imageUrl: editingEvent.imageUrl, // Legacy support
            headerImageUrl: editingEvent.headerImageUrl || editingEvent.imageUrl,
            additionalImageUrls: editingEvent.additionalImageUrls || []
          } : undefined}
          squadrons={squadrons}
          selectedCycle={selectedCycle ?? undefined}
        />
      )}

      {showCycleDialog && (
        <CycleDialog
          onSave={editingCycle ? handleEditCycle : handleCreateCycle}
          onCancel={() => {
            setShowCycleDialog(false);
            setEditingCycle(null);
          }}
          squadrons={squadrons}
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