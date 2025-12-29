import React, { useState, useEffect, useRef } from 'react';
import { usePageLoading } from '../../context/PageLoadingContext';
import { useAppSettings } from '../../context/AppSettingsContext';
import StandardPageLoader from './StandardPageLoader';
import EventsList from './events/EventsList';
import EventDetails from './events/EventDetails';
import EventAttendance from './events/EventAttendance';
import EventDialog from './events/EventDialog';
import CyclesList from './events/CyclesList';
import CycleDialog from './events/CycleDialog';
import { DeleteDivisionDialog } from './dialogs/DeleteDivisionDialog';
import { Trash2 } from 'lucide-react';
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
import { getAllStatuses, Status } from '../../utils/statusService';
import { getAllStandings, Standing } from '../../utils/standingService';
import { getAllRoles, Role } from '../../utils/roleService';
import { getAllQualifications, Qualification } from '../../utils/qualificationService';

// Standard card width matching MissionPreparation component
const CARD_WIDTH = '550px';

const EventsManagement: React.FC = () => {
  const { setPageLoading } = usePageLoading();
  const { settings } = useAppSettings();
  
  // State for data
  const [events, setEvents] = useState<Event[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [squadrons, setSquadrons] = useState<Squadron[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [qualificationsData, setQualificationsData] = useState<Qualification[]>([]);
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
  const [showDeleteAllEventsDialog, setShowDeleteAllEventsDialog] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [isDeletingAllEvents, setIsDeletingAllEvents] = useState(false);
  const [isSavingCycle, setIsSavingCycle] = useState(false);

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
    loadFilterData();
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

  // Load filter data function
  const loadFilterData = async () => {
    try {
      const [statusesResult, standingsResult, rolesResult, qualificationsResult] = await Promise.all([
        getAllStatuses(),
        getAllStandings(),
        getAllRoles(),
        getAllQualifications()
      ]);
      setStatuses(statusesResult.data || []);
      setStandings(standingsResult.data || []);
      setRoles(rolesResult.data || []);
      setQualificationsData(qualificationsResult.data || []);
    } catch (error) {
      console.error('Error fetching filter data:', error);
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

  // Subscribe to events table changes to detect when scheduled publications are processed
  useEffect(() => {
    if (!selectedCycle?.id || selectedCycle.id === 'standalone') return;

    console.log('[EVENTS-REALTIME] Setting up subscription for cycle:', selectedCycle.id);

    const channel = supabase
      .channel('events-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events',
          filter: `cycle_id=eq.${selectedCycle.id}`
        },
        (payload) => {
          console.log('[EVENTS-REALTIME] Received UPDATE event:', payload);
          // When an event's discord_event_id is updated (published), reload events
          if (payload.new && payload.new.discord_event_id) {
            console.log('[EVENTS-REALTIME] Event published, reloading events');
            loadEvents(selectedCycle.id);
          }
        }
      )
      .subscribe((status) => {
        console.log('[EVENTS-REALTIME] Subscription status:', status);
      });

    return () => {
      console.log('[EVENTS-REALTIME] Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [selectedCycle?.id]);

  // Polling fallback: Check for scheduled publication updates
  useEffect(() => {
    if (!selectedCycle?.id || selectedCycle.id === 'standalone') return;

    let pollInterval: NodeJS.Timeout | null = null;
    let isPollingActive = false;

    const checkScheduledPublications = async () => {
      // Check if there are any pending scheduled publications for events in this cycle
      const { data: pendingPubs, error } = await supabase
        .from('scheduled_event_publications')
        .select('event_id, scheduled_time, sent')
        .eq('sent', false)
        .lte('scheduled_time', new Date(Date.now() + 5 * 60 * 1000).toISOString()); // Check for publications scheduled within next 5 minutes

      if (!error && pendingPubs && pendingPubs.length > 0) {
        // Get event IDs from pending publications
        const eventIds = pendingPubs.map(p => p.event_id);

        // Check if any of these events are in the current cycle
        const { data: cycleEvents } = await supabase
          .from('events')
          .select('id')
          .eq('cycle_id', selectedCycle.id)
          .in('id', eventIds);

        if (cycleEvents && cycleEvents.length > 0 && !isPollingActive) {
          console.log('[EVENTS-POLLING] Starting polling for', cycleEvents.length, 'pending publications');
          isPollingActive = true;

          // Poll for updates every 15 seconds
          pollInterval = setInterval(async () => {
            console.log('[EVENTS-POLLING] Checking for published events...');
            await loadEvents(selectedCycle.id);
          }, 15000);
        }
      } else if (isPollingActive && pollInterval) {
        // No more pending publications, stop polling
        console.log('[EVENTS-POLLING] No pending publications, stopping polling');
        clearInterval(pollInterval);
        pollInterval = null;
        isPollingActive = false;
      }
    };

    checkScheduledPublications();

    // Re-check every minute
    const checkInterval = setInterval(checkScheduledPublications, 60000);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      clearInterval(checkInterval);
      isPollingActive = false;
    };
  }, [selectedCycle?.id]);

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
      // Handle standalone pseudo-cycle - fetch all events without filtering by cycle
      const cycleIdForFetch = cycleId === 'standalone' ? undefined : cycleId;

      // Fetch events for the cycle without Discord guild ID filtering (supports multi-squadron publishing)
      const { events: fetchedEvents, error } = await fetchEvents(cycleIdForFetch);
      if (error) {
        throw error;
      }
      
      
      // Load Discord message IDs from localStorage
      const storedMap = localStorage.getItem('eventDiscordMessageIds');
      const eventDiscordMap = storedMap ? JSON.parse(storedMap) : {};
      
      // Fetch scheduled publications for all events in a single query
      const eventIds = fetchedEvents.map(e => e.id);
      const { data: scheduledPubs } = await supabase
        .from('scheduled_event_publications')
        .select('event_id, scheduled_time')
        .in('event_id', eventIds)
        .eq('sent', false);

      // Create a map of event_id -> scheduled_time for quick lookup
      const scheduledPubMap = new Map<string, string>();
      if (scheduledPubs) {
        scheduledPubs.forEach(pub => {
          scheduledPubMap.set(pub.event_id, pub.scheduled_time);
        });
      }

      // Attach Discord message IDs and scheduled publication data to events
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
          discord_event_id: typeof discordMessageId === 'string' ? discordMessageId : undefined,
          // Attach scheduled publication data if it exists
          scheduledPublicationTime: scheduledPubMap.get(event.id)
          // Note: eventSettings is already mapped by fetchEvents (supabaseClient.ts), no need to map again
        };
      });
      
      // Create a properly ordered and filtered list of events
      setEvents(eventsWithDiscordIds);

      // Auto-select the first event in the list (by display order) if there are events and we have a selected cycle
      if (eventsWithDiscordIds.length > 0 && cycleId) {
        // For standalone, filter to only standalone events
        const eventsToConsider = cycleId === 'standalone'
          ? eventsWithDiscordIds.filter(e => !e.cycleId)
          : eventsWithDiscordIds;

        if (eventsToConsider.length > 0) {
          // Sort to match EventsList display order: active first (asc), then upcoming (asc), then past (desc)
          const now = new Date();
          const categorized = eventsToConsider.reduce((acc, event) => {
            const eventDate = new Date(event.datetime);
            const eventEndDate = event.endDatetime ? new Date(event.endDatetime) : eventDate;

            if (eventDate <= now && eventEndDate >= now) {
              acc.active.push(event);
            } else if (eventDate > now) {
              acc.upcoming.push(event);
            } else {
              acc.past.push(event);
            }
            return acc;
          }, { active: [] as Event[], upcoming: [] as Event[], past: [] as Event[] });

          // Sort each category
          categorized.active.sort((a: Event, b: Event) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
          categorized.upcoming.sort((a: Event, b: Event) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
          categorized.past.sort((a: Event, b: Event) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());

          // Select the first event in display order
          const firstEvent = categorized.active[0] || categorized.upcoming[0] || categorized.past[0];
          if (firstEvent) {
            setSelectedEvent(firstEvent);
          }
        }
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
    showNoResponse?: boolean;
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
    scheduledPublication?: {
      enabled: boolean;
      scheduledTime?: string;

    };
    referenceMaterials?: Array<{ type: string; name: string; url: string }>;
    syllabusMissionId?: string;
    cycleId?: string;
  }, shouldPublish: boolean = false) => {

    let createTimeoutId: NodeJS.Timeout | undefined;
    let imageTimeoutId: NodeJS.Timeout | undefined;
    let publishTimeoutId: NodeJS.Timeout | undefined;

    try {
      // Use cycle from eventData if provided, otherwise fall back to selectedCycle
      const cycleId = eventData.cycleId || selectedCycle?.id;
      const cycle = cycleId ? cycles.find(c => c.id === cycleId) : undefined;

      // Determine event type based on cycle
      let eventType: any = undefined; // Using any to avoid TypeScript error
      if (cycle) {
        if (cycle.type === 'Training') {
          eventType = 'Hop';
        } else if (cycle.type === 'Cruise-WorkUp') {
          eventType = 'Evolution';
        } else if (cycle.type === 'Cruise-Mission') {
          eventType = 'Episode';
        }
      }
      // Create the event first without image with timeout protection
      const createEventPromise = createEvent({
        ...eventData,
        status: 'upcoming',
        cycleId: cycleId,
        eventType,
        discordGuildId: discordGuildId || undefined,
        // Use event-level participants if provided, otherwise inherit from cycle
        participants: eventData.participants || cycle?.participants
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
      } else if (eventData.scheduledPublication?.enabled && eventData.scheduledPublication.scheduledTime && eventToPublish) {
        // If not publishing immediately but scheduling publication, create scheduled publication record
        try {
          const { error: scheduleError } = await supabase
            .from('scheduled_event_publications')
            .insert({
              event_id: eventToPublish.id,
              scheduled_time: eventData.scheduledPublication.scheduledTime
            });

          if (scheduleError) {
            console.error('[CREATE-SCHEDULE-DEBUG] Error scheduling publication:', scheduleError);
            setError('Event created successfully but failed to schedule publication');
          }
        } catch (scheduleError) {
          console.error('[CREATE-SCHEDULE-DEBUG] Error scheduling publication:', scheduleError);
          setError('Event created successfully but failed to schedule publication');
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
    showNoResponse?: boolean;
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
    scheduledPublication?: {
      enabled: boolean;
      scheduledTime?: string;

    };
    referenceMaterials?: Array<{ type: string; name: string; url: string }>;
    syllabusMissionId?: string;
    cycleId?: string;
  }, shouldPublish: boolean = false) => {

    if (!editingEvent) return;

    console.log('[HANDLE-EDIT-EVENT-DEBUG] eventData received:', {
      headerImage: eventData.headerImage,
      additionalImages: eventData.additionalImages,
      headerImageType: typeof eventData.headerImage,
      additionalImagesLength: eventData.additionalImages?.length
    });

    try {
      // Build event_settings object to save reminder settings
      const eventSettingsToSave = {
        ...(editingEvent.eventSettings || {}),
        timezone: eventData.timezone,
        groupBySquadron: eventData.groupBySquadron,
        showNoResponse: eventData.showNoResponse,
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
      console.log('[HANDLE-EDIT-EVENT-DEBUG] cycleId being saved:', eventData.cycleId);
      console.log('[HANDLE-EDIT-EVENT-DEBUG] Full update payload:', {
        ...eventData,
        event_settings: eventSettingsToSave,
        cycleId: eventData.cycleId
      });
      const { error } = await updateEvent(editingEvent.id, {
        ...eventData,
        event_settings: eventSettingsToSave,
        cycleId: eventData.cycleId // Explicitly pass cycleId to ensure it's updated
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
            // Map image fields from database JSONB or string
            imageUrl: typeof freshEventData.image_url === 'object' && freshEventData.image_url && 'headerImage' in freshEventData.image_url
              ? (freshEventData.image_url as { headerImage: string }).headerImage
              : (typeof freshEventData.image_url === 'string' ? freshEventData.image_url : null),
            headerImageUrl: typeof freshEventData.image_url === 'object' && freshEventData.image_url && 'headerImage' in freshEventData.image_url
              ? (freshEventData.image_url as { headerImage: string }).headerImage
              : (typeof freshEventData.image_url === 'string' ? freshEventData.image_url : null),
            additionalImageUrls: typeof freshEventData.image_url === 'object' && freshEventData.image_url && 'additionalImages' in freshEventData.image_url
              ? ((freshEventData.image_url as { additionalImages?: string[] }).additionalImages || [])
              : [],
            // Convert discord_event_id from Json to proper array type
            discord_event_id: Array.isArray(freshEventData.discord_event_id)
              ? freshEventData.discord_event_id
              : freshEventData.discord_event_id
                ? [freshEventData.discord_event_id]
                : undefined,
            attendance: { accepted: [], declined: [], tentative: [] }
          } as Event;

          console.log('[UPDATE-EVENT-DEBUG] Built updatedEvent for Discord:', {
            id: updatedEvent.id,
            title: updatedEvent.title,
            imageUrl: updatedEvent.imageUrl,
            headerImageUrl: updatedEvent.headerImageUrl,
            additionalImageUrls: updatedEvent.additionalImageUrls,
            image_url: (updatedEvent as any).image_url,
            freshEventData_image_url: freshEventData.image_url
          });

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

      // Handle scheduled publication updates
      try {
        // Check if there's an existing scheduled publication
        const { data: existingScheduled, error: fetchScheduledError } = await supabase
          .from('scheduled_event_publications')
          .select('id')
          .eq('event_id', editingEvent.id)
          .eq('sent', false)
          .maybeSingle();

        if (fetchScheduledError) {
          console.error('[EDIT-SCHEDULED-DEBUG] Error fetching scheduled publication:', fetchScheduledError);
        }

        if (eventData.scheduledPublication?.enabled && eventData.scheduledPublication.scheduledTime) {
          // Check if event is already published
          if (editingEvent.discordEventId || editingEvent.discord_event_id) {
            console.warn('[EDIT-SCHEDULED-DEBUG] Event is already published, cannot schedule new publication');
            setError('Event is already published. You cannot schedule a new publication for an already published event.');
          } else {
            // User wants scheduled publication and event is not yet published
            if (existingScheduled) {
              // Update existing scheduled publication
              const { error: updateScheduledError } = await supabase
                .from('scheduled_event_publications')
                .update({ scheduled_time: eventData.scheduledPublication.scheduledTime })
                .eq('id', existingScheduled.id);

              if (updateScheduledError) {
                console.error('[EDIT-SCHEDULED-DEBUG] Error updating scheduled publication:', updateScheduledError);
                setError('Event updated but failed to update scheduled publication');
              }
            } else {
              // Create new scheduled publication
              const { error: createScheduledError } = await supabase
                .from('scheduled_event_publications')
                .insert({
                  event_id: editingEvent.id,
                  scheduled_time: eventData.scheduledPublication.scheduledTime
                });

              if (createScheduledError) {
                console.error('[EDIT-SCHEDULED-DEBUG] Error creating scheduled publication:', createScheduledError);
                setError('Event updated but failed to schedule publication');
              }
            }
          }
        } else if (existingScheduled && !eventData.scheduledPublication?.enabled) {
          // User disabled scheduled publication, remove it
          const { error: deleteScheduledError } = await supabase
            .from('scheduled_event_publications')
            .delete()
            .eq('id', existingScheduled.id);

          if (deleteScheduledError) {
            console.error('[EDIT-SCHEDULED-DEBUG] Error deleting scheduled publication:', deleteScheduledError);
          }
        }
      } catch (scheduledError) {
        console.error('[EDIT-SCHEDULED-DEBUG] Error handling scheduled publication:', scheduledError);
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

    // Build URL with both eventId and cycleId
    const urlParams = new URLSearchParams();
    urlParams.set('eventId', event.id);
    if (event.cycleId) {
      urlParams.set('cycleId', event.cycleId);
    }
    const missionPrepUrl = `/mission-prep?${urlParams.toString()}`;

    if (existingMission) {
      // Mission exists, go to it
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

  // Helper function to create events for a training cycle
  const createEventsForCycle = async (
    cycleId: string,
    cycleData: {
      name: string;
      startDate: string;
      endDate: string;
      syllabusId?: string;
      restrictedTo?: string[];
      participants?: string[];
    }
  ) => {
    if (!cycleData.syllabusId) return;

    try {
      // Load syllabus missions with week numbers
      const { data: missions, error: missionsError } = await supabase
        .from('training_syllabus_missions')
        .select('id, week_number, mission_name')
        .eq('syllabus_id', cycleData.syllabusId)
        .order('week_number') as any;

      if (missionsError || !missions) {
        console.error('Failed to load syllabus missions:', missionsError);
        return;
      }

      // Calculate total weeks based on cycle dates
      // Parse dates as local dates to avoid timezone offset issues
      const [startYear, startMonth, startDay] = cycleData.startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = cycleData.endDate.split('-').map(Number);
      const startDate = new Date(startYear, startMonth - 1, startDay);
      const endDate = new Date(endYear, endMonth - 1, endDay);
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      const totalWeeks = Math.ceil(diffDays / 7);

      // Get default time from settings
      const defaultTime = settings.eventDefaults.defaultStartTime || '20:30';
      const [hours, minutes] = defaultTime.split(':').map(Number);

      // Create events for each week
      for (let weekNum = 0; weekNum < totalWeeks; weekNum++) {
        // Calculate event date (same day of week as start date)
        const eventDate = new Date(startDate);
        eventDate.setDate(startDate.getDate() + (weekNum * 7));
        eventDate.setHours(hours, minutes, 0, 0);

        // Find mission for this week (if any)
        const mission = missions.find((m: any) => m.week_number === weekNum);

        // Create event
        const eventTitle = `${cycleData.name} - Week ${weekNum}`;

        const eventData = {
          title: eventTitle,
          description: mission ? `Training Mission: ${mission.mission_name}` : '',
          datetime: eventDate.toISOString(),
          endDatetime: new Date(eventDate.getTime() + (settings.eventDefaults.defaultDurationHours * 60 + settings.eventDefaults.defaultDurationMinutes) * 60000).toISOString(),
          eventType: 'Hop' as const,
          cycleId: cycleId,
          status: 'upcoming' as const,
          restrictedTo: cycleData.restrictedTo || [],
          participants: cycleData.participants || [],
          trackQualifications: !!mission, // Only track qualifications if there's a mission assigned
          syllabusMissionId: mission?.id,
          referenceMaterials: [],
          eventSettings: {
            timezone: settings.eventDefaults.referenceTimezone || 'America/New_York',
            showNoResponse: settings.eventDefaults.showNoResponse,
            groupBySquadron: settings.eventDefaults.groupBySquadron,
            firstReminderTime: settings.eventDefaults.firstReminderTime,
            secondReminderTime: settings.eventDefaults.secondReminderTime,
            firstReminderEnabled: settings.eventDefaults.firstReminderEnabled,
            secondReminderEnabled: settings.eventDefaults.secondReminderEnabled,
            firstReminderRecipients: settings.eventDefaults.firstReminderRecipients,
            secondReminderRecipients: settings.eventDefaults.secondReminderRecipients,
            sendRemindersToAccepted: settings.eventDefaults.sendRemindersToAccepted,
            sendRemindersToTentative: settings.eventDefaults.sendRemindersToTentative,
            initialNotificationRoles: settings.eventDefaults.initialNotificationRoles || [],
            groupResponsesByQualification: settings.eventDefaults.groupResponsesByQualification
          }
        };

        await createEvent(eventData);
      }
    } catch (err: any) {
      console.error('Failed to create events for cycle:', err);
      throw err;
    }
  };

  // Cycle handlers
  const handleCreateCycle = async (cycleData: {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    type: CycleType;
    restrictedTo?: string[];
    syllabusId?: string;
    autoCreateEvents?: boolean;
  }) => {
    setIsSavingCycle(true);
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
      const { cycle, error } = await createCycle({
        ...cycleData,
        status,
        discordGuildId: discordGuildId || undefined
      });

      if (error) throw error;

      // If auto-create events is enabled, create events for the syllabus
      if (cycleData.autoCreateEvents && cycle && cycleData.syllabusId) {
        await createEventsForCycle(cycle.id, cycleData);
      }

      // Reload cycles to get the latest data
      await loadCycles();

      // If events were created, reload them too
      if (cycleData.autoCreateEvents && cycle) {
        await loadEvents(cycle.id);
        setSelectedCycle(cycle);
      }

      setShowCycleDialog(false);
    } catch (err: any) {
      setError(`Failed to create cycle: ${err.message}`);
    } finally {
      setIsSavingCycle(false);
    }
  };

  const handleEditCycle = async (cycleData: {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    type: CycleType;
    restrictedTo?: string[];
    syllabusId?: string;
    autoCreateEvents?: boolean;
  }) => {
    if (!editingCycle) return;

    setIsSavingCycle(true);
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

      // If auto-create events is enabled, create events for the syllabus
      if (cycleData.autoCreateEvents && cycle && cycleData.syllabusId) {
        await createEventsForCycle(cycle.id, cycleData);
      }

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
    } finally {
      setIsSavingCycle(false);
    }
  };

  const handleDeleteAllEvents = async () => {
    if (!selectedCycle) return;
    if (deleteAllConfirmText.toLowerCase() !== 'yes') {
      setError('Please type "yes" to confirm deletion');
      return;
    }

    setIsDeletingAllEvents(true);
    try {
      // Get all events for the selected cycle
      const cycleEvents = filteredEvents;

      // Delete each event
      for (const event of cycleEvents) {
        // Try to delete Discord messages first
        try {
          const { errors } = await deleteMultiChannelEvent(event);
          if (errors.length > 0) {
            console.warn(`Warning: Some Discord deletions failed for event ${event.id}:`, errors);
          }
        } catch (discordError) {
          console.warn(`Failed to delete Discord messages for event ${event.id}:`, discordError);
        }

        // Delete the event from database
        const { error } = await deleteEvent(event.id);
        if (error) {
          console.error(`Failed to delete event ${event.id}:`, error);
        }
      }

      // Reload events
      await loadEvents(selectedCycle.id);
      setSelectedEvent(null);
      setShowDeleteAllEventsDialog(false);
      setDeleteAllConfirmText('');
    } catch (err: any) {
      setError(`Failed to delete all events: ${err.message}`);
    } finally {
      setIsDeletingAllEvents(false);
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
        console.log(`[DELETE-EVENT] Attempting to delete event ${eventToDelete.id} from database`);
        const { error } = await deleteEvent(eventToDelete.id);
        console.log(`[DELETE-EVENT] Delete result - error:`, error);
        if (error) {
          console.error(`[DELETE-EVENT] Failed to delete event:`, error);
          throw error;
        }
        console.log(`[DELETE-EVENT] Event deleted successfully from database`);

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

  const handleCycleSelect = (cycle: Cycle | null) => {
    setSelectedCycle(cycle);
    // Only clear selected event if we're deselecting (cycle is null)
    // If selecting a cycle, let loadEvents auto-select the first event
    if (cycle === null) {
      setSelectedEvent(null);
    }
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
      if (selectedCycle.id === 'standalone') {
        // Show only standalone events (events without a cycleId)
        const filtered = events.filter(event => !event.cycleId);
        setFilteredEvents(filtered);
      } else {
        // Show events for the selected cycle
        const filtered = events.filter(event => event.cycleId === selectedCycle.id);
        setFilteredEvents(filtered);
      }
    } else {
      // Show ALL events when no cycle is selected
      setFilteredEvents(events);
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
                    onCycleSelect={handleCycleSelect}
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
                  }}>
                    {selectedCycle
                      ? selectedCycle.name
                      : filteredEvents.length === 0
                        ? 'Events'
                        : filteredEvents.every(e => !e.cycleId)
                          ? 'Standalone Events'
                          : 'All Events'
                    }
                  </span>
                </div>
                {/* Content */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <EventsList
                    events={filteredEvents}
                    cycles={cycles}
                    selectedEvent={selectedEvent}
                    onEventSelect={setSelectedEvent}
                    onNewEvent={() => {
                      setEditingEvent(null);
                      setShowEventDialog(true);
                    }}
                    onEditEvent={handleEditEventClick}
                    onDeleteEvent={handleDeleteEvent}
                    onRemoveAll={() => setShowDeleteAllEventsDialog(true)}
                    showRemoveAll={selectedCycle !== null && filteredEvents.length > 0}
                    showCycleIndicator={selectedCycle === null}
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
                }}>{selectedEvent && selectedCycle?.type === 'Training' ? 'Training Event Details' : 'Event Details'}</span>
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
            id: editingEvent.id,
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
            eventSettings: editingEvent.eventSettings, // Include event settings for editing
            isPublished: !!(editingEvent.discordEventId || editingEvent.discord_event_id), // Flag to indicate if event is already published
            referenceMaterials: editingEvent.referenceMaterials, // Training workflow: reference materials
            syllabusMissionId: editingEvent.syllabusMissionId, // Training workflow: syllabus mission
            cycleId: editingEvent.cycleId // Include cycle ID for editing
          } : undefined}
          squadrons={squadrons}
          selectedCycle={selectedCycle ?? undefined}
          cycles={cycles}
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
          statuses={statuses}
          standings={standings}
          roles={roles}
          qualifications={qualificationsData}
          cycleId={editingCycle?.id}
          initialData={editingCycle ?? undefined}
          hasEvents={editingCycle ? events.some(e => e.cycleId === editingCycle.id) : false}
          isSaving={isSavingCycle}
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

      {/* Delete All Events Confirmation Dialog */}
      {showDeleteAllEventsDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <Trash2 size={24} style={{ color: '#EF4444' }} />
              <h2 style={{
                fontSize: '20px',
                fontWeight: 600,
                color: '#1E293B',
                margin: 0
              }}>
                Delete All Events
              </h2>
            </div>
            <p style={{
              fontSize: '14px',
              color: '#64748B',
              marginBottom: '16px',
              lineHeight: '1.6'
            }}>
              This will permanently delete all {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} in the selected cycle.
              This action cannot be undone.
            </p>
            <p style={{
              fontSize: '14px',
              color: '#1E293B',
              marginBottom: '8px',
              fontWeight: 500
            }}>
              Type <span style={{ fontWeight: 700, color: '#EF4444' }}>yes</span> to confirm:
            </p>
            <input
              type="text"
              value={deleteAllConfirmText}
              onChange={(e) => setDeleteAllConfirmText(e.target.value)}
              placeholder="Type 'yes' to confirm"
              autoFocus
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                fontSize: '14px',
                marginBottom: '20px',
                boxSizing: 'border-box'
              }}
            />
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  setShowDeleteAllEventsDialog(false);
                  setDeleteAllConfirmText('');
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAllEvents}
                disabled={deleteAllConfirmText.toLowerCase() !== 'yes' || isDeletingAllEvents}
                style={{
                  padding: '10px 20px',
                  backgroundColor: deleteAllConfirmText.toLowerCase() === 'yes' ? '#EF4444' : '#CBD5E1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (deleteAllConfirmText.toLowerCase() === 'yes' && !isDeletingAllEvents) ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 500,
                  opacity: deleteAllConfirmText.toLowerCase() === 'yes' ? 1 : 0.6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {isDeletingAllEvents && (
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTop: '2px solid white',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite'
                  }} />
                )}
                {isDeletingAllEvents ? 'Deleting...' : 'Delete All Events'}
              </button>
            </div>
          </div>
        </div>
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