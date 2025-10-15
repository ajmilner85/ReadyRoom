import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchEvents, supabase } from '../utils/supabaseClient';
import { getAllPilots } from '../utils/pilotService';
import { getBatchPilotQualifications } from '../utils/qualificationService';
import { getOptimizedSquadronMapping, prefetchSquadronMapping } from '../utils/squadronMappingCache';
import { adaptSupabasePilots } from '../utils/pilotDataUtils';
import { loadSelectedEvent, saveSelectedEvent, STORAGE_KEYS } from '../utils/localStorageUtils';
import type { Event } from '../types/EventTypes';
import type { Pilot } from '../types/PilotTypes';
import type { Squadron } from '../types/OrganizationTypes';

/**
 * Custom hook to manage mission preparation data (events, pilots, qualifications)
 * Note: Intentionally does not filter by squadron to support multi-squadron operations
 */
export const useMissionPrepData = () => {
  // Check for eventId in URL parameters
  const getEventIdFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('eventId');
  };

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(loadSelectedEvent());
  const [urlEventId] = useState<string | null>(getEventIdFromUrl());
  const [events, setEvents] = useState<Event[]>([]);
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allPilotQualifications, setAllPilotQualifications] = useState<Record<string, any[]>>({});
  const [squadrons, setSquadrons] = useState<Squadron[]>([]);
  const [pilotSquadronMap, setPilotSquadronMap] = useState<Record<string, Squadron>>({});
  const [participatingSquadrons, setParticipatingSquadrons] = useState<any[]>([]);

  // Fetch events without any squadron/guild filtering for multi-squadron support
  const loadEventsForCurrentGuild = async () => {
    try {
      // Suppress any console warnings about missing guild ID in squadron settings
      // This is expected behavior for multi-squadron operations
      const originalConsoleWarn = console.warn;
      const originalConsoleLog = console.log;
      
      // Temporarily suppress specific squadron settings warnings
      console.warn = (message: any, ...args: any[]) => {
        if (typeof message === 'string' && message.includes('Discord guild ID') && message.includes('squadron')) {
          return; // Suppress this specific warning
        }
        originalConsoleWarn(message, ...args);
      };
      
      console.log = (message: any, ...args: any[]) => {
        if (typeof message === 'string' && message.includes('Discord guild ID') && message.includes('squadron')) {
          return; // Suppress this specific log message
        }
        originalConsoleLog(message, ...args);
      };
      
      // Restore original console methods after a brief delay
      setTimeout(() => {
        console.warn = originalConsoleWarn;
        console.log = originalConsoleLog;
      }, 100);
      // Fetch all events without any filtering to support multi-squadron functionality
      // Note: No guild ID filtering is intentionally removed to show all events
      const { events: allEvents, error } = await fetchEvents();
      
      if (error) {
        console.error('Error fetching events:', error);
        setLoadError(`Failed to fetch events: ${error.message}`);
        return;
      }
      
      if (allEvents && allEvents.length > 0) {
        // Events are already sorted in reverse chronological order by the query
        setEvents(allEvents);
        
        // Priority 1: If URL has eventId, select that event
        if (urlEventId) {
          const urlEvent = allEvents.find(event => event.id === urlEventId);
          if (urlEvent) {
            setSelectedEventWrapper(urlEvent);
            // Clear URL parameter after selection (optional)
            // window.history.replaceState({}, '', window.location.pathname);
          } else {
            console.warn('Event ID from URL not found in events list:', urlEventId);
          }
        } 
        // Priority 2: Validate that the currently selected event still exists in the fetched events
        else if (selectedEvent) {
          const eventStillExists = allEvents.find(event => event.id === selectedEvent.id);
          if (!eventStillExists) {
            // The previously selected event no longer exists, clear the selection
            setSelectedEventWrapper(null);
          }
        } 
        // Priority 3: Only auto-select an event if this is truly the first time (no localStorage entry exists)
        else {
          // Check if localStorage has ever been set (even if it was set to null)
          const hasStoredSelection = localStorage.getItem(STORAGE_KEYS.SELECTED_EVENT) !== null;
          if (!hasStoredSelection && allEvents.length > 0) {
            setSelectedEventWrapper(allEvents[0]);
          }
        }
      } else {
        setEvents([]);
        // Clear selected event if no events are available
        if (selectedEvent) {
          setSelectedEventWrapper(null);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch events:', err.message);
    }
  };

  // Function to fetch squadron data and pilot squadron assignments (optimized)
  const fetchSquadronData = async (pilotsList: Pilot[]) => {
    try {
      const { pilotSquadronMap, squadrons, error } = await getOptimizedSquadronMapping(pilotsList);
      
      if (error) {
        console.error('❌ Error fetching optimized squadron data:', error);
        return;
      }

      setSquadrons(squadrons);
      setPilotSquadronMap(pilotSquadronMap);
      
    } catch (err) {
      console.error('❌ Error fetching squadron data:', err);
    }
  };

  // Function to fetch and cache participating squadrons for selected event
  const fetchParticipatingSquadrons = useCallback(async (eventId: string) => {
    if (!eventId || squadrons.length === 0) {
      setParticipatingSquadrons([]);
      return;
    }

    try {
      // Fetch fresh event data to get current participants
      const { data: eventData, error } = await supabase
        .from('events')
        .select('participants')
        .eq('id', eventId)
        .single();

      if (error || !eventData?.participants) {
        setParticipatingSquadrons([]);
        return;
      }

      // Filter squadrons based on participants and format for AddFlightDialog
      const participants = Array.isArray(eventData.participants) ? eventData.participants : [];
      const participating = squadrons
        .filter(squadron => participants.includes(squadron.id))
        .map(squadron => ({
          squadronId: squadron.id,
          name: squadron.name,
          designation: squadron.designation,
          insignia_url: squadron.insignia_url,
          callsigns: Array.isArray(squadron.callsigns) ? squadron.callsigns : []
        }));

      setParticipatingSquadrons(participating);
    } catch (error) {
      console.error('Error fetching participating squadrons:', error);
      setParticipatingSquadrons([]);
    }
  }, [squadrons]);

  // Function to fetch qualifications for all pilots using batch operation
  const fetchAllPilotQualifications = async (pilotsList: Pilot[]) => {
    if (!pilotsList || pilotsList.length === 0) return;
    
    try {
      // Extract pilot IDs for batch operation
      const pilotIds = pilotsList
        .filter(pilot => pilot.id) // Only include pilots with valid IDs
        .map(pilot => pilot.id);
      
      if (pilotIds.length === 0) {
        console.warn('No valid pilot IDs found for qualification fetch');
        return;
      }
      
      // Use batch fetch for better performance
      const batchQualMap = await getBatchPilotQualifications(pilotIds);
      
      // Transform the batch result to include both ID and board number mappings
      const qualMap: Record<string, any[]> = {};
      
      pilotsList.forEach(pilot => {
        const pilotQualifications = batchQualMap[pilot.id] || [];
        // Store in qualMap using both pilot ID and board number for easier lookup
        qualMap[pilot.boardNumber] = pilotQualifications;
        qualMap[pilot.id] = pilotQualifications;
      });
      
      setAllPilotQualifications(qualMap);
    } catch (err: any) {
      console.error('Error fetching all pilot qualifications:', err);
    }
  };
  // Fetch pilots from Supabase when component mounts
  const fetchPilots = async () => {
    setIsLoading(true);
    try {
      // Fetch data directly and adapt to legacy format
      const { data, error } = await getAllPilots();

      if (error) {
        throw new Error(error.message);
      }

      if (data && data.length > 0) {
        // Adapt the data to the expected Pilot format while preserving squadron data
        const adaptedPilots = adaptSupabasePilots(data);

        // Set pilots state to the adapted Pilot format
        setPilots(adaptedPilots);

        // After fetching pilots, also fetch their qualifications and squadron data
        await fetchAllPilotQualifications(adaptedPilots);
        await fetchSquadronData(adaptedPilots);

        setLoadError(null);
      } else {
        // No pilots in database
        setPilots([]);
        setLoadError('No pilots found in the database');
      }
    } catch (err: any) {
      setLoadError(err.message);
      setPilots([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter to only active status pilots
  const activePilots = useMemo(() => {
    if (!pilots || pilots.length === 0) return [];

    // Filter based on currentStatus.isActive property
    return pilots.filter((pilot: Pilot) =>
      pilot.currentStatus?.isActive === true
    );
  }, [pilots]);

  const setSelectedEventWrapper = useCallback((event: Event | null) => {
    setSelectedEvent(event);
    saveSelectedEvent(event);
  }, []);

  // Fetch events on component mount
  useEffect(() => {
    loadEventsForCurrentGuild();
  }, []);

  // Fetch pilots when component mounts
  useEffect(() => {
    fetchPilots();
  }, []);

  // Background prefetch squadron mapping when pilots change
  useEffect(() => {
    if (pilots && pilots.length > 0) {
      prefetchSquadronMapping(pilots);
    }
  }, [pilots]);

  // Cache participating squadrons when event or squadrons change
  useEffect(() => {
    if (selectedEvent?.id && squadrons.length > 0) {
      fetchParticipatingSquadrons(selectedEvent.id);
    } else {
      setParticipatingSquadrons([]);
    }
  }, [selectedEvent?.id, squadrons, fetchParticipatingSquadrons]);

  // Memoize the return object to prevent unnecessary re-renders
  return useMemo(() => ({
    events,
    selectedEvent,
    setSelectedEvent: setSelectedEventWrapper,
    pilots,
    activePilots,
    isLoading,
    loadError,
    allPilotQualifications,
    squadrons,
    pilotSquadronMap,
    participatingSquadrons,
    refreshParticipatingSquadrons: () => selectedEvent?.id && fetchParticipatingSquadrons(selectedEvent.id)
  }), [events, selectedEvent, pilots, activePilots, isLoading, loadError, allPilotQualifications, squadrons, pilotSquadronMap, participatingSquadrons, fetchParticipatingSquadrons]);
};
