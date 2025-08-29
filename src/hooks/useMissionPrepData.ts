import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, fetchEvents } from '../utils/supabaseClient';
import { getAllPilots } from '../utils/pilotService';
import { getBatchPilotQualifications } from '../utils/qualificationService';
import { adaptSupabasePilots } from '../utils/pilotDataUtils';
import { loadSelectedEvent, saveSelectedEvent, STORAGE_KEYS } from '../utils/localStorageUtils';
import type { Event } from '../types/EventTypes';
import type { Pilot } from '../types/PilotTypes';

/**
 * Custom hook to manage mission preparation data (events, pilots, qualifications)
 */
export const useMissionPrepData = () => {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(loadSelectedEvent());
  const [events, setEvents] = useState<Event[]>([]);
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allPilotQualifications, setAllPilotQualifications] = useState<Record<string, any[]>>({});

  // Fetch events (guild filtering removed since fetchEvents no longer supports it)
  const loadEventsForCurrentGuild = async () => {
    try {
      // Fetch all events since guild filtering is no longer supported in fetchEvents
      const { events: allEvents, error } = await fetchEvents();
      
      if (error) {
        console.error('Error fetching events:', error);
        return;
      }
      
      if (allEvents && allEvents.length > 0) {
        console.log(`Fetched ${allEvents.length} events`);
        // Events are already sorted in reverse chronological order by the query
        setEvents(allEvents);
        
        // Validate that the currently selected event still exists in the fetched events
        if (selectedEvent) {
          const eventStillExists = allEvents.find(event => event.id === selectedEvent.id);
          if (!eventStillExists) {
            // The previously selected event no longer exists, clear the selection
            console.log('Previously selected event no longer exists, clearing selection');
            setSelectedEventWrapper(null);
          }
        } else {
          // Only auto-select an event if this is truly the first time (no localStorage entry exists)
          // Check if localStorage has ever been set (even if it was set to null)
          const hasStoredSelection = localStorage.getItem(STORAGE_KEYS.SELECTED_EVENT) !== null;
          if (!hasStoredSelection && allEvents.length > 0) {
            console.log('First time user - auto-selecting most recent event');
            setSelectedEventWrapper(allEvents[0]);
          }
        }
      } else {
        console.log('No events found');
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
        // Adapt the data to the expected Pilot format
        const adaptedPilots = adaptSupabasePilots(data);
        
        // Set pilots state to the adapted Pilot format
        setPilots(adaptedPilots);
        
        // After fetching pilots, also fetch their qualifications
        await fetchAllPilotQualifications(adaptedPilots);
        
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

  // Filter out inactive and retired pilots
  const activePilots = useMemo(() => {
    if (!pilots || pilots.length === 0) return [];
    
    // Add a type parameter to the filter for better type safety
    return pilots.filter((pilot: Pilot) => 
      pilot.status !== 'Inactive' && pilot.status !== 'Retired'
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

  // Memoize the return object to prevent unnecessary re-renders
  return useMemo(() => ({
    events,
    selectedEvent,
    setSelectedEvent: setSelectedEventWrapper,
    pilots,
    activePilots,
    isLoading,
    loadError,
    allPilotQualifications
  }), [events, selectedEvent, pilots, activePilots, isLoading, loadError, allPilotQualifications]);
};
