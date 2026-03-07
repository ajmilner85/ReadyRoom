import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { syncRollCallResponses } from '../utils/rollCallUtils';
import { supabase } from '../utils/supabaseClient';
import type { Event } from '../types/EventTypes';

interface RollCallContextType {
  rollCallResponses: Record<string, 'Present' | 'Absent' | 'Tentative'>;
  setRollCallResponses: React.Dispatch<React.SetStateAction<Record<string, 'Present' | 'Absent' | 'Tentative'>>>;
  discordIdToRollCallMap: Record<string, 'Present' | 'Absent' | 'Tentative'>;
  isLoadingRollCall: boolean;
  selectedEventId: string | undefined;
}

const RollCallContext = createContext<RollCallContextType>({
  rollCallResponses: {},
  setRollCallResponses: () => {},
  discordIdToRollCallMap: {},
  isLoadingRollCall: false,
  selectedEventId: undefined
});

export const useRollCall = () => useContext(RollCallContext);

interface RollCallProviderProps {
  children: React.ReactNode;
  selectedEvent?: Event;
  pilots: any[];
}

export const RollCallProvider: React.FC<RollCallProviderProps> = ({ children, selectedEvent, pilots }) => {
  const [rollCallResponses, setRollCallResponses] = useState<Record<string, 'Present' | 'Absent' | 'Tentative'>>({});
  const [discordIdToRollCallMap, setDiscordIdToRollCallMap] = useState<Record<string, 'Present' | 'Absent' | 'Tentative'>>({});
  const [isLoadingRollCall, setIsLoadingRollCall] = useState(false);
  const selectedEventId = selectedEvent?.id;

  // Keep a stable ref to pilots so the realtime handler can build pilot-id keyed
  // responses without being listed as a dependency (avoids tearing down/rebuilding
  // the subscription on every pilots array render).
  const pilotsRef = useRef(pilots);
  useEffect(() => { pilotsRef.current = pilots; }, [pilots]);

  // Helper: convert a discord-id keyed map to pilot-id keyed responses
  const mapDiscordToPilotIds = (discordIdMap: Record<string, 'Present' | 'Absent' | 'Tentative'>) => {
    const result: Record<string, 'Present' | 'Absent' | 'Tentative'> = {};
    pilotsRef.current.forEach(pilot => {
      const pilotId = pilot.id || pilot.boardNumber;
      const discordId = pilot.discord_id;
      if (discordId && discordIdMap[discordId]) {
        result[pilotId] = discordIdMap[discordId];
      }
    });
    return result;
  };

  // Initial load whenever the selected event changes
  useEffect(() => {
    const syncRollCall = async () => {
      if (!selectedEvent?.id) return;

      try {
        setIsLoadingRollCall(true);
        const effectiveDiscordEventId = selectedEvent.discordEventId || `manual-${selectedEvent.id}`;
        const discordIdMap = await syncRollCallResponses(effectiveDiscordEventId);
        setDiscordIdToRollCallMap(discordIdMap);
        setRollCallResponses(mapDiscordToPilotIds(discordIdMap));
      } catch (error) {
        console.error('Error syncing roll call responses:', error);
      } finally {
        setIsLoadingRollCall(false);
      }
    };

    syncRollCall();
  }, [selectedEvent]); // pilots intentionally excluded — pilotsRef keeps it current

  // Realtime subscription: watch discord_event_attendance for roll_call_response changes
  useEffect(() => {
    if (!selectedEvent?.id) return;

    const effectiveDiscordEventId = selectedEvent.discordEventId || `manual-${selectedEvent.id}`;

    const channel = supabase
      .channel(`roll-call-${effectiveDiscordEventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'discord_event_attendance',
          filter: `discord_event_id=eq.${effectiveDiscordEventId}`
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as any;
          if (!row?.discord_id) return;

          const discordId: string = row.discord_id;
          const newResponse: 'Present' | 'Absent' | 'Tentative' | null = row.roll_call_response ?? null;

          console.log('[ROLL-CALL-REALTIME] Change received:', {
            event: payload.eventType,
            discordId,
            newResponse
          });

          // Update the discord-id keyed map
          setDiscordIdToRollCallMap(prev => {
            const updated = { ...prev };
            if (newResponse) {
              updated[discordId] = newResponse;
            } else {
              delete updated[discordId];
            }
            return updated;
          });

          // Update the pilot-id keyed responses (used by the UI)
          setRollCallResponses(prev => {
            const updated = { ...prev };
            // Find which pilot(s) map to this discord_id
            pilotsRef.current.forEach(pilot => {
              if ((pilot as any).discord_id === discordId) {
                const pilotId = pilot.id || pilot.boardNumber;
                if (newResponse) {
                  updated[pilotId] = newResponse;
                } else {
                  delete updated[pilotId];
                }
              }
            });
            return updated;
          });
        }
      )
      .subscribe((status) => {
        console.log('[ROLL-CALL-REALTIME] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedEvent?.id, selectedEvent?.discordEventId]);

  return (
    <RollCallContext.Provider
      value={{
        rollCallResponses,
        setRollCallResponses,
        discordIdToRollCallMap,
        isLoadingRollCall,
        selectedEventId
      }}
    >
      {children}
    </RollCallContext.Provider>
  );
};
