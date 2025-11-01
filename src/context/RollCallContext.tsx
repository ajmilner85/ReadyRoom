import React, { createContext, useState, useContext, useEffect } from 'react';
import { syncRollCallResponses } from '../utils/rollCallUtils';
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

  // Effect to sync roll call responses whenever the selected event changes
  useEffect(() => {
    const syncRollCall = async () => {
      if (!selectedEvent?.id) return;

      try {
        setIsLoadingRollCall(true);
        // Use synthetic Discord event ID if the event doesn't have a real one
        const effectiveDiscordEventId = selectedEvent.discordEventId || `manual-${selectedEvent.id}`;
        const discordIdMap = await syncRollCallResponses(effectiveDiscordEventId);
        setDiscordIdToRollCallMap(discordIdMap);

        // Map Discord IDs to pilot IDs
        const pilotRollCallResponses: Record<string, 'Present' | 'Absent' | 'Tentative'> = {};

        // For each pilot, check if they have a roll call response
        pilots.forEach(pilot => {
          const pilotId = pilot.id || pilot.boardNumber;
          const discordId = pilot.discord_id;

          if (discordId && discordIdMap[discordId]) {
            pilotRollCallResponses[pilotId] = discordIdMap[discordId];
          }
        });

        // Update the state with all roll call responses
        setRollCallResponses(pilotRollCallResponses);

        // console.log('[ROLL-CALL-DEBUG] Synced roll call responses for event:', selectedEvent.id);
      } catch (error) {
        console.error('Error syncing roll call responses:', error);
      } finally {
        setIsLoadingRollCall(false);
      }
    };

    syncRollCall();
  }, [selectedEvent, pilots]);

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
