import { useState, useEffect, useMemo } from 'react';
import { supabase, fetchEvents } from '../utils/supabaseClient';
import { getAllPilots } from '../utils/pilotService';
import { getPilotQualifications } from '../utils/qualificationService';
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
        .single();
      
      if (settingsError) {
        console.warn('Error fetching Discord guild ID:', settingsError.message);
        return;
      }
      
      if (!settingsData?.value) {
        console.warn('No Discord guild ID found in squadron settings');
        return;
      }
      
      const guildId = settingsData.value;
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

  // Function to fetch qualifications for all pilots
  const fetchAllPilotQualifications = async (pilotsList: Pilot[]) => {
    if (!pilotsList || pilotsList.length === 0) return;
    
    try {
      const qualMap: Record<string, any[]> = {};
      console.log(`Fetching qualifications for ${pilotsList.length} pilots...`);
      
      // Create an array to track all qualification fetch promises
      const fetchPromises: Promise<void>[] = [];
      
      // Fetch qualifications for each pilot
      for (const pilot of pilotsList) {
        // Use the id property (Supabase UUID) for qualification lookups
        // This is the key to making Supabase the source of truth
        const pilotId = pilot.id;
        
        if (!pilotId) {
          console.warn(`Skipping qualification fetch for pilot with no ID: ${pilot.callsign} (${pilot.boardNumber})`);
          continue;
        }
        
        // Create a promise for fetching this pilot's qualifications
        const fetchPromise = async () => {
          const { data, error } = await getPilotQualifications(pilotId);
            if (error) {
            console.warn(`Error fetching qualifications for ${pilot.callsign} with ID ${pilotId}:`, error);
          } else if (data) {
            // Store in qualMap using pilot ID and board number for easier lookup
            qualMap[pilot.boardNumber] = data;
            qualMap[pilot.id] = data;
            
            // Only log if we actually found qualifications
            if (data.length > 0) {
              console.log(`Found ${data.length} qualifications for ${pilot.callsign} (${pilot.boardNumber})`);
            }
          } else {
            // Initialize empty arrays to avoid undefined checks later
            qualMap[pilot.boardNumber] = [];
            qualMap[pilot.id] = [];
          }
        };
        
        // Add this promise to our array
        fetchPromises.push(fetchPromise());
      }
      
      // Wait for all qualification fetches to complete
      await Promise.all(fetchPromises);
      
      setAllPilotQualifications(qualMap);
      console.log('Pilot qualifications map updated', Object.keys(qualMap).length);
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

  const setSelectedEventWrapper = (event: Event | null) => {
    setSelectedEvent(event);
    saveSelectedEvent(event);
  };

  // Fetch events on component mount
  useEffect(() => {
    loadEventsForCurrentGuild();
  }, []);

  // Fetch pilots when component mounts
  useEffect(() => {
    fetchPilots();
  }, []);

  return {
    events,
    selectedEvent,
    setSelectedEvent: setSelectedEventWrapper,
    pilots,
    activePilots,
    isLoading,
    loadError,
    allPilotQualifications
  };
};
