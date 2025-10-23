import React, { useState, useEffect, useRef } from 'react';
import { usePageLoading } from '../../context/PageLoadingContext';
import StandardPageLoader from './StandardPageLoader';
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
import { deleteMultiChannelEvent, updateMultiChannelEvent } from '../../utils/discordService';
import { uploadMultipleEventImages } from '../../utils/eventImageService';
import LoadingSpinner from './LoadingSpinner';
import { useWebSocket } from '../../context/WebSocketContext';
import { getAllSquadrons } from '../../utils/organizationService';
import { Squadron } from '../../types/OrganizationTypes';
import { createMission, getMissionByEventId } from '../../utils/missionService';
import type { Mission } from '../../types/MissionTypes';

// Standard card width matching MissionPreparation component
const CARD_WIDTH = '550px';

const EventsManagement: React.FC = () => {
  const { setPageLoading } = usePageLoading();
  
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
  
  // Clear page loading when component data is loaded
  useEffect(() => {
    if (!loading.initial) {
      setPageLoading('events', false);
    }
  }, [loading.initial, setPageLoading]);
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
  
  // State for mission management
  const [eventMissions, setEventMissions] = useState<Record<string, Mission>>({});
  const [missionLoading, setMissionLoading] = useState<Record<string, boolean>>({});

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
      // Discord guild ID functionality has been deprecated in favor of multi-squadron support
      // This function is maintained for compatibility but no longer sets a guild ID
      const guildIdValue = null;
      if (guildIdValue) {
        setDiscordGuildId(guildIdValue);
      }
    } catch (err: any) {
      // Silent handling of guild ID fetch errors
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
      if (event.discordEventId === lastEventUpdate.eventId) {
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
      // Discord guild ID functionality has been deprecated in favor of multi-squadron support
      // Guild ID is no longer used for filtering cycles
      const guildId = null;
      setDiscordGuildId(guildId);

      // Fetch cycles without guild ID filtering (supports multi-squadron operations)
      const { cycles: fetchedCycles, error } = await fetchCycles();

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
  const loadEvents = async (cycleId?: string): Promise<Event[]> => {
    setLoading(prev => ({ ...prev, events: true }));
    try {
      // Fetch events for the cycle without Discord guild ID filtering (supports multi-squadron publishing)
      const { events: fetchedEvents, error } = await fetchEvents(cycleId);
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
        
        
        // Remove the problematic JSONB field from the spread to prevent React rendering issues
        const { discord_event_id: _, ...eventWithoutDiscordEventId } = eventObj;

        return {
          ...eventWithoutDiscordEventId,
          // Store the ID in both potential field names for maximum compatibility (as strings only)
          discordMessageId: typeof discordMessageId === 'string' ? discordMessageId : undefined,
          discord_event_id: typeof discordMessageId === 'string' ? discordMessageId : undefined
          // Note: eventSettings is already mapped by fetchEvents (supabaseClient.ts), no need to map again
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

      return eventsWithDiscordIds;
    } catch (err: any) {
      setError(`Failed to load events: ${err.message}`);
      setFilteredEvents([]); // Clear filtered events on error
      return [];
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
    headerImage?: File | string | null;
    additionalImages?: (File | string | null)[];
    trackQualifications?: boolean;
    timezone?: string;
    groupBySquadron?: boolean;
    reminders?: {
      firstReminder?: {
        enabled: boolean;
        value: number;
        unit: 'minutes' | 'hours' | 'days';
        recipients?: {
          accepted: boolean;
          tentative: boolean;
          declined: boolean;
          noResponse: boolean;
        };
      };
      secondReminder?: {
        enabled: boolean;
        value: number;
        unit: 'minutes' | 'hours' | 'days';
        recipients?: {
          accepted: boolean;
          tentative: boolean;
          declined: boolean;
          noResponse: boolean;
        };
      };
      initialNotificationRoles?: Array<{ id: string; name: string }>;
    };
  }, shouldPublish: boolean = false) => {
    
    let createTimeoutId: NodeJS.Timeout | undefined;
    let imageTimeoutId: NodeJS.Timeout | undefined;
    let publishTimeoutId: NodeJS.Timeout | undefined;
    
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
      // Create the event first without image with timeout protection
      const createEventPromise = createEvent({
        ...eventData,
        status: 'upcoming',
        cycleId: selectedCycle?.id,
        eventType,
        discordGuildId: discordGuildId || undefined,
        // Use event-level participants if provided, otherwise inherit from cycle
        participants: eventData.participants || selectedCycle?.participants
      });
      
      const createTimeoutPromise = new Promise((_, reject) => {
        createTimeoutId = setTimeout(() => reject(new Error('Create event timed out')), 15000);
      });
      
      const { event: newEvent, error } = await Promise.race([createEventPromise, createTimeoutPromise]) as any;
      if (createTimeoutId) clearTimeout(createTimeoutId);
      if (error) throw error;
      
      // Upload multiple images if provided
      
      let eventToPublish = newEvent;
      
      if ((eventData.headerImage || eventData.additionalImages) && newEvent && newEvent.id) {
        const imageUploadPromise = uploadMultipleEventImages(newEvent.id, {
          headerImage: eventData.headerImage,
          additionalImages: eventData.additionalImages
        });
        
        const imageTimeoutPromise = new Promise((_, reject) => {
          imageTimeoutId = setTimeout(() => reject(new Error('Image upload timed out')), 20000);
        });
        
        const { error: uploadError } = await Promise.race([imageUploadPromise, imageTimeoutPromise]) as any;
        if (imageTimeoutId) clearTimeout(imageTimeoutId);
        if (uploadError) {
          console.error('Failed to upload images:', uploadError);
          setError('Event created but image upload failed');
        } else {
          
          // If we're publishing, fetch the updated event data with image URLs
          if (shouldPublish) {
            try {
              // Make a direct query to get the updated event with image URLs
              const { data: updatedEventData, error: fetchError } = await supabase
                .from('events')
                .select('*')
                .eq('id', newEvent.id)
                .single();
              
              if (!fetchError && updatedEventData) {
                // Transform the database event to the frontend Event format
                eventToPublish = {
                  id: updatedEventData.id,
                  title: updatedEventData.name,
                  description: updatedEventData.description,
                  datetime: updatedEventData.start_datetime,
                  endDatetime: updatedEventData.end_datetime,
                  status: updatedEventData.status,
                  eventType: updatedEventData.event_type,
                  cycleId: updatedEventData.cycle_id,
                  trackQualifications: updatedEventData.track_qualifications || false,
                  eventSettings: updatedEventData.event_settings,
                  participants: updatedEventData.participants,
                  // Handle image URLs from the JSONB image_url field
                  imageUrl: typeof updatedEventData.image_url === 'object' && updatedEventData.image_url && 'headerImage' in updatedEventData.image_url
                    ? (updatedEventData.image_url as { headerImage: string }).headerImage 
                    : (typeof updatedEventData.image_url === 'string' ? updatedEventData.image_url : null),
                  headerImageUrl: typeof updatedEventData.image_url === 'object' && updatedEventData.image_url && 'headerImage' in updatedEventData.image_url
                    ? (updatedEventData.image_url as { headerImage: string }).headerImage 
                    : (typeof updatedEventData.image_url === 'string' ? updatedEventData.image_url : null),
                  additionalImageUrls: typeof updatedEventData.image_url === 'object' && updatedEventData.image_url && 'additionalImages' in updatedEventData.image_url
                    ? ((updatedEventData.image_url as { additionalImages?: string[] }).additionalImages || [])
                    : [],
                  // Also pass the full JSONB structure for multi-image support
                  images: typeof updatedEventData.image_url === 'object' ? updatedEventData.image_url : undefined,
                  restrictedTo: [],
                  creator: {
                    callsign: updatedEventData.creator_call_sign || '',
                    boardNumber: updatedEventData.creator_board_number || '',
                    billet: updatedEventData.creator_billet || ''
                  },
                  attendance: { accepted: [], declined: [], tentative: [] }
                };
              } else {
                console.warn('[CREATE-PUBLISH-DEBUG] Failed to fetch updated event data:', fetchError);
              }
            } catch (fetchError) {
              console.error('[CREATE-PUBLISH-DEBUG] Error fetching updated event data:', fetchError);
            }
          }
        }
      } else {
      }
      
      // If shouldPublish is true, publish the event to Discord
      if (shouldPublish && eventToPublish) {
        try {
          const { publishEventFromCycle, updateEventMultipleDiscordIds } = await import('../../utils/discordService');
          
          const publishPromise = publishEventFromCycle(eventToPublish);
          const publishTimeoutPromise = new Promise((_, reject) => {
            publishTimeoutId = setTimeout(() => reject(new Error('Publish timed out')), 30000);
          });
          
          const publishResult = await Promise.race([publishPromise, publishTimeoutPromise]) as any;
          if (publishTimeoutId) clearTimeout(publishTimeoutId);
          
          
          if (publishResult.success && publishResult.publishedChannels.length > 0) {
            // Update the event with Discord message IDs
            const updateSuccess = await updateEventMultipleDiscordIds(eventToPublish.id, publishResult.publishedChannels);
            
            // Only schedule reminders for successfully published events
            if (eventData.reminders && updateSuccess) {
              try {
                const { scheduleEventReminders } = await import('../../utils/reminderService');
                const reminderResult = await scheduleEventReminders(
                  eventToPublish.id,
                  eventData.datetime,
                  eventData.reminders
                );
                
                if (!reminderResult.success) {
                  console.warn('[CREATE-REMINDER-DEBUG] Failed to schedule reminders for published event:', reminderResult.error);
                } else {
                }
              } catch (reminderError) {
                console.error('[CREATE-REMINDER-DEBUG] Error scheduling reminders for published event:', reminderError);
              }
            }
          }
          
          if (publishResult.errors.length > 0) {
          }
        } catch (publishError) {
          console.error('[CREATE-PUBLISH-DEBUG] Error publishing event:', publishError);
          setError('Event created successfully but failed to publish to Discord');
        }
      }
      // Note: Reminders are only scheduled when events are published to Discord
      
      // Reload events to get the latest data - force a fresh fetch
      await loadEvents(selectedCycle?.id);
      
      // Also refresh cycles in case the event creation affected cycle data
      if (selectedCycle) {
      }
      
      setShowEventDialog(false);
    } catch (err: any) {
      // Clean up any hanging timeouts
      if (createTimeoutId) clearTimeout(createTimeoutId);
      if (imageTimeoutId) clearTimeout(imageTimeoutId);
      if (publishTimeoutId) clearTimeout(publishTimeoutId);
      
      setError(`Failed to create event: ${err.message}`);
    } finally {
      // Final cleanup of any remaining timeouts
      if (createTimeoutId) clearTimeout(createTimeoutId);
      if (imageTimeoutId) clearTimeout(imageTimeoutId);
      if (publishTimeoutId) clearTimeout(publishTimeoutId);
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
    headerImage?: File | string | null;
    additionalImages?: (File | string | null)[];
    trackQualifications?: boolean;
    timezone?: string;
    groupBySquadron?: boolean;
    reminders?: {
      firstReminder?: {
        enabled: boolean;
        value: number;
        unit: 'minutes' | 'hours' | 'days';
        recipients?: {
          accepted: boolean;
          tentative: boolean;
          declined: boolean;
          noResponse: boolean;
        };
      };
      secondReminder?: {
        enabled: boolean;
        value: number;
        unit: 'minutes' | 'hours' | 'days';
        recipients?: {
          accepted: boolean;
          tentative: boolean;
          declined: boolean;
          noResponse: boolean;
        };
      };
      initialNotificationRoles?: Array<{ id: string; name: string }>;
    };
  }, shouldPublish: boolean = false) => {
    
    if (!editingEvent) return;

    try {
      // Build event_settings object to save reminder settings
      const eventSettingsToSave = {
        ...(editingEvent.eventSettings || {}),
        timezone: eventData.timezone,
        groupBySquadron: eventData.groupBySquadron,
        groupResponsesByQualification: eventData.trackQualifications,
        firstReminderEnabled: eventData.reminders?.firstReminder?.enabled,
        firstReminderTime: eventData.reminders?.firstReminder ? {
          value: eventData.reminders.firstReminder.value,
          unit: eventData.reminders.firstReminder.unit
        } : undefined,
        firstReminderRecipients: eventData.reminders?.firstReminder?.recipients,
        secondReminderEnabled: eventData.reminders?.secondReminder?.enabled,
        secondReminderTime: eventData.reminders?.secondReminder ? {
          value: eventData.reminders.secondReminder.value,
          unit: eventData.reminders.secondReminder.unit
        } : undefined,
        secondReminderRecipients: eventData.reminders?.secondReminder?.recipients,
        initialNotificationRoles: eventData.reminders?.initialNotificationRoles
      };

      // First update the database (don't update discord_event_id to preserve JSONB structure)
      const { error } = await updateEvent(editingEvent.id, {
        ...eventData,
        event_settings: eventSettingsToSave
        // Don't override discord_event_id - let it stay as JSONB in database
      });
      if (error) throw error;
      
      // Always update images to handle both additions and removals
      
      const { error: uploadError } = await uploadMultipleEventImages(editingEvent.id, {
        headerImage: eventData.headerImage,
        additionalImages: eventData.additionalImages
      }, true); // Use replace mode to handle removals
      
      if (uploadError) {
        console.error('Failed to update images:', uploadError);
        setError('Event updated but image update failed');
      } else {
      }
      
      // Always update reminders when editing an event, even if reminder settings haven't changed
      // This ensures that time-dependent reminders are rescheduled if the event time changed
      try {
        const { updateEventReminders } = await import('../../utils/reminderService');
        
        // Debug log the event structure to understand what's available
        
        // Use provided reminder settings or fall back to existing event settings
        let reminderSettings = eventData.reminders || (editingEvent.eventSettings ? {
          firstReminder: editingEvent.eventSettings.firstReminderEnabled ? {
            enabled: editingEvent.eventSettings.firstReminderEnabled,
            value: editingEvent.eventSettings.firstReminderTime?.value || 1,
            unit: editingEvent.eventSettings.firstReminderTime?.unit || 'hours',
            recipients: editingEvent.eventSettings.firstReminderRecipients
          } : undefined,
          secondReminder: editingEvent.eventSettings.secondReminderEnabled ? {
            enabled: editingEvent.eventSettings.secondReminderEnabled,
            value: editingEvent.eventSettings.secondReminderTime?.value || 1,
            unit: editingEvent.eventSettings.secondReminderTime?.unit || 'hours',
            recipients: editingEvent.eventSettings.secondReminderRecipients
          } : undefined
        } : undefined);
        
        
        // Check if this event should have reminders by checking if any exist in the database
        if (!reminderSettings) {
          // Try to get existing reminders from database to see if this event had reminders before
          const { data: existingReminders } = await supabase
            .from('event_reminders')
            .select('*')
            .eq('event_id', editingEvent.id)
            .limit(1);
          
          if (existingReminders && existingReminders.length > 0) {
            // Use default reminder settings if event had reminders before
            reminderSettings = {
              firstReminder: {
                enabled: true,
                value: 15,
                unit: 'minutes'
              }
            };
          }
        }
        
        if (reminderSettings) {
          const reminderResult = await updateEventReminders(
            editingEvent.id,
            eventData.datetime,
            reminderSettings
          );
          
          if (!reminderResult.success) {
            console.warn('[EDIT-REMINDER-DEBUG] Failed to update reminders:', reminderResult.error);
          } else {
          }
        } else {
        }
      } catch (reminderError) {
        console.error('[EDIT-REMINDER-DEBUG] Error updating reminders:', reminderError);
      }
      
      // Check if this event has Discord messages by fetching fresh data from database
      // (editingEvent only has the converted string version, not the original JSONB)
      if (shouldPublish && editingEvent.discordEventId) {
        
        // Fetch fresh event data with original JSONB discord_event_id
        const { data: freshEventData, error: fetchError } = await supabase
          .from('events')
          .select('*')
          .eq('id', editingEvent.id)
          .single();
          
        if (fetchError || !freshEventData) {
          console.error('[UPDATE-EVENT] Failed to fetch fresh event data:', fetchError);
        } else {
          
          // Create updated event object with fresh database data and new user input
          const updatedEvent = {
            ...freshEventData, // Use fresh data from database (includes original JSONB discord_event_id)
            ...eventData, // Apply user changes
            // Convert datetime back to ISO format if needed
            title: eventData.title, // Ensure title field mapping
            datetime: eventData.datetime.includes('T') ? eventData.datetime : `${eventData.datetime}:00.000Z`,
            endDatetime: eventData.endDatetime?.includes('T') ? eventData.endDatetime : `${eventData.endDatetime}:00.000Z`,
            // Map database field to Event interface field
            cycleId: freshEventData.cycle_id,
            // Ensure creator field is properly mapped from raw database fields
            creator: {
              boardNumber: freshEventData.creator_board_number || '',
              callsign: freshEventData.creator_call_sign || '',
              billet: freshEventData.creator_billet || ''
            },
            // Convert discord_event_id from Json to proper array type
            discord_event_id: Array.isArray(freshEventData.discord_event_id) 
              ? freshEventData.discord_event_id 
              : freshEventData.discord_event_id 
                ? [freshEventData.discord_event_id] 
                : undefined,
            attendance: { accepted: [], declined: [], tentative: [] }
          } as Event;
        
          
          try {
            const discordResult = await updateMultiChannelEvent(updatedEvent, editingEvent.datetime, eventData.reminders);
            
            if (discordResult.errors.length > 0) {
              console.warn(`Warning: Some Discord updates failed:`, discordResult.errors);
            }
            
            if (discordResult.success) {
            }
          } catch (discordError) {
            console.error('[UPDATE-EVENT] Error updating Discord messages:', discordError);
            // Don't fail the whole update if Discord update fails
          }
        }
      } else if (shouldPublish && !editingEvent.discordEventId) {
        // Event doesn't have Discord messages but user wants to publish
        try {
          const { publishEventFromCycle, updateEventMultipleDiscordIds } = await import('../../utils/discordService');
          
          // Create event object for publishing
          const eventForPublish = {
            ...editingEvent,
            ...eventData,
            datetime: eventData.datetime.includes('T') ? eventData.datetime : `${eventData.datetime}:00.000Z`,
            endDatetime: eventData.endDatetime?.includes('T') ? eventData.endDatetime : `${eventData.endDatetime}:00.000Z`
          };
          
          
          const publishResult = await publishEventFromCycle(eventForPublish);
          
          if (publishResult.success && publishResult.publishedChannels.length > 0) {
            // Update the event with Discord message IDs
            await updateEventMultipleDiscordIds(editingEvent.id, publishResult.publishedChannels);
          }
          
          if (publishResult.errors.length > 0) {
          }
        } catch (publishError) {
          console.error('[UPDATE-EVENT] Error publishing updated event:', publishError);
          setError('Event updated successfully but failed to publish to Discord');
        }
      }
      
      // Reload events to get the latest data
      const reloadedEvents = await loadEvents(selectedCycle?.id);
      // Update selected event with fresh data
      if (editingEvent && reloadedEvents) {
        const updatedEvent = reloadedEvents.find(e => e.id === editingEvent.id);
        if (updatedEvent) setSelectedEvent(updatedEvent);
      }
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


  const handlePlanMission = async (event: Event) => {
    if (!event.id) return;
    
    // Check if mission already exists for this event
    const existingMission = eventMissions[event.id];
    
    if (existingMission) {
      // Mission exists, go to it
      const missionPrepUrl = `/mission-prep?eventId=${event.id}`;
      window.location.href = missionPrepUrl;
    } else {
      // No mission exists, create one first
      setMissionLoading(prev => ({ ...prev, [event.id]: true }));
      
      try {
        const missionName = `${event.title} Mission`;
        const { mission, error } = await createMission({
          event_id: event.id,
          name: missionName,
          description: `Mission planning for ${event.title}`,
          selected_squadrons: event.participants || []
        });

        if (error) {
          console.error('Error creating mission:', error);
          setError(`Failed to create mission: ${error}`);
          return;
        }

        // Navigate to Mission Preparation immediately (don't update state to avoid button flicker)
        const missionPrepUrl = `/mission-prep?eventId=${event.id}`;
        window.location.href = missionPrepUrl;
        
        // Update state with new mission (for when user returns to this page)
        setEventMissions(prev => ({ ...prev, [event.id]: mission }));
        
      } catch (err: any) {
        console.error('Error creating mission:', err);
        setError(`Failed to create mission: ${err.message}`);
      } finally {
        setMissionLoading(prev => ({ ...prev, [event.id]: false }));
      }
    }
  };

  const checkEventMission = async (eventId: string) => {
    if (missionLoading[eventId] || eventMissions[eventId]) return;
    
    setMissionLoading(prev => ({ ...prev, [eventId]: true }));
    
    try {
      const { mission, error } = await getMissionByEventId(eventId);
      
      if (!error && mission && mission.id) {
        setEventMissions(prev => ({ ...prev, [eventId]: mission }));
      }
    } catch (err) {
      // Silently fail - this just means no mission exists for this event
    } finally {
      setMissionLoading(prev => ({ ...prev, [eventId]: false }));
    }
  };

  // Check for missions when events are loaded or selected event changes
  useEffect(() => {
    if (selectedEvent?.id) {
      checkEventMission(selectedEvent.id);
    }
  }, [selectedEvent?.id]);
  
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
        
        // First try to delete any associated Discord messages from all channels
        try {
          // Use the new multi-channel deletion function
          const { success, errors } = await deleteMultiChannelEvent(eventToDelete);
          
          
          if (errors.length > 0) {
            console.warn(`Warning: Some Discord deletions failed:`, errors);
            // Continue with event deletion even if some Discord deletions fail
          }
          
          if (success) {
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
    console.log('[EDIT-EVENT-CLICK] Event being edited:', event);
    console.log('[EDIT-EVENT-CLICK] Event settings:', event.eventSettings);
    console.log('[EDIT-EVENT-CLICK] First reminder settings:', event.eventSettings?.firstReminderTime, event.eventSettings?.firstReminderRecipients);
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
            <StandardPageLoader message="Loading events data..." />
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
              <div style={{
                backgroundColor: '#FFFFFF',
                boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
                borderRadius: '8px',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                {/* Header */}
                <div style={{
                  padding: '16px 24px 8px'
                }}>
                  <span style={{
                    fontFamily: 'Inter',
                    fontStyle: 'normal',
                    fontWeight: 300,
                    fontSize: '20px',
                    lineHeight: '24px',
                    color: '#64748B',
                    textTransform: 'uppercase',
                    display: 'block',
                    textAlign: 'center'
                  }}>Cycles</span>
                </div>
                {/* Content */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
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
                </div>
              </div>
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
              <div style={{
                backgroundColor: '#FFFFFF',
                boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
                borderRadius: '8px',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                {/* Header */}
                <div style={{
                  padding: '16px 24px 8px'
                }}>
                  <span style={{
                    fontFamily: 'Inter',
                    fontStyle: 'normal',
                    fontWeight: 300,
                    fontSize: '20px',
                    lineHeight: '24px',
                    color: '#64748B',
                    textTransform: 'uppercase',
                    display: 'block',
                    textAlign: 'center'
                  }}>Events</span>
                </div>
                {/* Content */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
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
                </div>
              </div>
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
            <div style={{
              backgroundColor: '#FFFFFF',
              boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
              borderRadius: '8px',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}>
              {/* Header */}
              <div style={{
                padding: '16px 24px 8px'
              }}>
                <span style={{
                  fontFamily: 'Inter',
                  fontStyle: 'normal',
                  fontWeight: 300,
                  fontSize: '20px',
                  lineHeight: '24px',
                  color: '#64748B',
                  textTransform: 'uppercase',
                  display: 'block',
                  textAlign: 'center'
                }}>Event Details</span>
              </div>
              {/* Content */}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <EventDetails 
                  event={selectedEvent} 
                  onEventUpdated={() => loadEvents(selectedCycle?.id)}
                />
              </div>
            </div>
          </div>
          
          {/* Right Side Container - Attendance and Mission Cards */}
          <div style={{
            width: CARD_WIDTH,
            minWidth: '350px',
            height: 'calc(100vh - 40px)',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            overflowY: 'visible'
          }}>
            {/* Event Attendance */}
            <div style={{
              backgroundColor: '#FFFFFF',
              boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
              borderRadius: '8px',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}>
              {/* Header */}
              <div style={{
                padding: '16px 24px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}>
                <span style={{
                  fontFamily: 'Inter',
                  fontStyle: 'normal',
                  fontWeight: 300,
                  fontSize: '20px',
                  lineHeight: '24px',
                  color: '#64748B',
                  textTransform: 'uppercase'
                }}>{selectedEvent && new Date(selectedEvent.datetime) > new Date() ? 'Registration' : 'Attendance'}</span>
                
                {/* Loading spinner positioned to the right */}
                <div style={{
                  position: 'absolute',
                  right: '24px',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <div 
                    id="attendance-loading-spinner"
                    style={{ 
                      width: '16px', 
                      height: '16px', 
                      border: '2px solid #E2E8F0', 
                      borderTopColor: '#3B82F6', 
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      opacity: 0
                    }} 
                  />
                </div>
              </div>
              {/* Content */}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <EventAttendance event={selectedEvent} />
              </div>
            </div>

            {/* Mission Card */}
            <div style={{
              backgroundColor: '#FFFFFF',
              boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
              borderRadius: '8px',
              height: 'auto',
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              boxSizing: 'border-box'
            }}>
              {/* Header */}
              <div style={{
                textAlign: 'center',
                marginBottom: '16px'
              }}>
                <span style={{
                  fontFamily: 'Inter',
                  fontStyle: 'normal',
                  fontWeight: 300,
                  fontSize: '20px',
                  lineHeight: '24px',
                  color: '#64748B',
                  textTransform: 'uppercase'
                }}>Mission</span>
              </div>
              {/* Content */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-around',
                padding: '16px'
              }}>
                {selectedEvent ? (
                  <button
                    onClick={() => handlePlanMission(selectedEvent)}
                    disabled={selectedEvent?.id ? missionLoading[selectedEvent.id] : false}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 24px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      backgroundColor: 'transparent',
                      color: '#6B7280',
                      fontFamily: 'Inter',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: selectedEvent?.id && missionLoading[selectedEvent.id] ? 'not-allowed' : 'pointer',
                      opacity: selectedEvent?.id && missionLoading[selectedEvent.id] ? 0.5 : 1,
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      if (!(selectedEvent?.id && missionLoading[selectedEvent.id])) {
                        e.currentTarget.style.borderColor = '#9CA3AF';
                        e.currentTarget.style.backgroundColor = '#F9FAFB';
                      }
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = '#D1D5DB';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {/* Compass Icon */}
                    <svg 
                      width="18" 
                      height="18" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10"/>
                      <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88"/>
                    </svg>
                    {selectedEvent?.id && missionLoading[selectedEvent.id] ? (
                      'Loading...'
                    ) : selectedEvent?.id && eventMissions[selectedEvent.id] ? (
                      'Go to Mission'
                    ) : (
                      'Plan Mission'
                    )}
                  </button>
                ) : (
                  <div style={{
                    color: '#9CA3AF',
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    textAlign: 'center'
                  }}>
                    Select an event to plan mission
                  </div>
                )}
              </div>
            </div>
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
            additionalImageUrls: editingEvent.additionalImageUrls || [],
            trackQualifications: (editingEvent as any).trackQualifications || false,
            eventSettings: editingEvent.eventSettings // Include event settings for editing
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
          isPublished={!isDeleteCycle && !!(
            eventToDelete?.discordEventId || 
            eventToDelete?.discord_event_id
          )}
        />
      )}
      
      {/* Add keyframes for loading spinner animation */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
};

export default EventsManagement;