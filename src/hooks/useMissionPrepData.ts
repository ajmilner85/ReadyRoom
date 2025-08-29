import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, fetchEvents } from '../utils/supabaseClient';
import { getAllPilots } from '../utils/pilotService';
import { getBatchPilotQualifications } from '../utils/qualificationService';
import { adaptSupabasePilots } from '../utils/pilotDataUtils';
import { loadSelectedEvent, saveSelectedEvent } from '../utils/localStorageUtils';
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

  // Fetch events filtered by Discord guild ID
  const loadEventsForCurrentGuild = async () => {
    try {
      // First get the Discord guild ID from squadron settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('squadron_settings')
        .select('value')
        .eq('key', 'discord_guild_id')
        .limit(1);
      
      if (settingsError) {
        console.warn('Error fetching Discord guild ID:', settingsError.message);
        return;
      }
      
      // Handle array result from .limit(1)
      const guildIdValue = settingsData && settingsData.length > 0 ? settingsData[0].value : null;
      if (!guildIdValue) {
        console.warn('No Discord guild ID found in squadron settings');
        return;
      }
      
      const guildId = guildIdValue;
      console.log('Using Discord guild ID for filtering events:', guildId);
      
      // Fetch events for this guild
      const { events: guildEvents, error } = await fetchEvents(undefined, guildId);
      
      if (error) {
        console.error('Error fetching events:', error);
        return;
      }
      
      if (guildEvents && guildEvents.length > 0) {
        console.log(`Fetched ${guildEvents.length} events for guild ${guildId}`);
        // Events are already sorted in reverse chronological order by the query
        setEvents(guildEvents);
        
        // If there's no selected event yet but we have events, select the most recent one
        if (!selectedEvent && guildEvents.length > 0) {
          setSelectedEventWrapper(guildEvents[0]);
        }
      } else {
        console.log('No events found for guild:', guildId);
        setEvents([]);
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
        // Adapt the data to legacy format
        const legacyPilots = adaptSupabasePilots(data);
        
        // Set pilots state to the adapted legacy format
        setPilots(legacyPilots);
        
        // After fetching pilots, also fetch their qualifications
        await fetchAllPilotQualifications(legacyPilots);
        
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
