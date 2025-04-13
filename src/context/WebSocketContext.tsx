import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';

type EventUpdateData = {
  eventId: string;
  eventData: {
    title: string;
    description: string;
    eventTime: {
      start: string;
      end: string;
    };
    accepted: Array<{
      userId: string;
      displayName: string;
    }>;
    declined: Array<{
      userId: string;
      displayName: string;
    }>;
    tentative: Array<{
      userId: string;
      displayName: string;
    }>;
  };
  timestamp: number;
};

// Rename to EventUpdatesContext to reflect the pure polling approach
interface EventUpdatesContextType {
  lastEventUpdate: EventUpdateData | null;
}

const EventUpdatesContext = createContext<EventUpdatesContextType>({
  lastEventUpdate: null,
});

// Keep the same hook name for compatibility
export const useWebSocket = () => useContext(EventUpdatesContext);

interface EventUpdatesProviderProps {
  children: React.ReactNode;
}

// Server URL
const API_URL = 'http://localhost:3001';

// Rename to EventUpdatesProvider to reflect the pure polling approach
export const WebSocketProvider: React.FC<EventUpdatesProviderProps> = ({ children }) => {
  const [lastEventUpdate, setLastEventUpdate] = useState<EventUpdateData | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateTimestampRef = useRef<number>(0);
  
  // Function to fetch updates via REST API
  const fetchUpdates = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/events/attendance/updates`);
      if (!response.ok) return;
      
      const updates = await response.json();
      
      // Find the most recent update
      let mostRecentUpdate: any = null;
      let mostRecentTimestamp = 0;
      
      for (const eventId in updates) {
        const update = updates[eventId];
        if (update.timestamp > mostRecentTimestamp && update.timestamp > lastUpdateTimestampRef.current) {
          mostRecentUpdate = update;
          mostRecentTimestamp = update.timestamp;
        }
      }
      
      if (mostRecentUpdate) {
        console.log('Received update via polling:', mostRecentUpdate);
        setLastEventUpdate(mostRecentUpdate);
        lastUpdateTimestampRef.current = mostRecentTimestamp;
      }
    } catch (error) {
      console.error('Error polling for updates:', error);
    }
  }, []);

  // Initialize polling when component mounts
  useEffect(() => {
    // Initial poll on mount
    fetchUpdates();
    
    // Setup regular polling
    pollingIntervalRef.current = setInterval(fetchUpdates, 2000);

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [fetchUpdates]);

  return (
    <EventUpdatesContext.Provider value={{ lastEventUpdate }}>
      {children}
    </EventUpdatesContext.Provider>
  );
};