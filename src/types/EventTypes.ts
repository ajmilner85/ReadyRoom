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
    cycleId?: string | null; // Maps to cycle_id in database
    eventType?: EventType | string | null; // Maps to event_type or type in database
    guildId?: string | null; // Maps to discord_guild_id in database
    discordEventId?: string | null; // ID of the event in Discord
    imageUrl?: string | null; // Maps to image_url in database
  }