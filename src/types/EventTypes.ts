export type CycleType = 'Training' | 'Cruise-WorkUp' | 'Cruise-Mission' | 'Other';
export type EventType = 'Hop' | 'Evolution' | 'Episode' | 'Re-attack' | 'Free Fly' | 'Foothold' | 'Pretense' | 'Other';

export interface Cycle {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string; 
  type: CycleType;
  status: 'active' | 'completed' | 'upcoming';
  creator: {
    boardNumber: string;
    callsign: string;
    billet: string;
  };
  restrictedTo?: string[];
}

export interface Event {
    id: string;
    title: string; // Maps to name in database
    description: string | null;
    datetime: string; // Maps to start_datetime in database
    endDatetime?: string | null; // Maps to end_datetime in database
    status: string | null;
    eventType?: EventType | undefined; // Maps to event_type in database
    cycleId?: string | undefined; // Maps to cycle_id in database
    discordEventId?: string | undefined; // Maps to discord_event_id in database
    imageUrl?: string | undefined; // Maps to image_url in database
    restrictedTo?: string[]; // Used in code but not in database schema
    creator: {
      boardNumber: string;
      callsign: string;
      billet: string;
    };
    attendance: {
      accepted: Array<{
        boardNumber?: string;
        callsign: string;
        billet?: string;
        discord_id?: string;
      }>;
      declined: Array<{
        boardNumber?: string;
        callsign: string;
        billet?: string;
        discord_id?: string;
      }>;
      tentative: Array<{
        boardNumber?: string;
        callsign: string;
        billet?: string;
        discord_id?: string;
      }>;
    };
}