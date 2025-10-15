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
  participants?: string[]; // Array of squadron IDs that participate in this cycle
  discordGuildId?: string; // Legacy field for backward compatibility
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
    discordEventId?: string | undefined; // Legacy field for backward compatibility
    discord_event_id?: Array<{
      messageId: string;
      guildId: string;
      channelId: string;
      squadronId: string;
    }> | undefined; // JSONB array of Discord publication records
    imageUrl?: string | undefined; // Maps to image_url in database (legacy single image)
    headerImageUrl?: string | undefined; // Header image URL
    additionalImageUrls?: string[] | undefined; // Additional image URLs
    restrictedTo?: string[]; // Used in code but not in database schema
    participants?: string[]; // Override cycle's participating squadrons
    trackQualifications?: boolean; // Whether to group responses by qualification
    // Event-specific settings (stored in event_settings JSONB column)
    eventSettings?: {
      timezone?: string;
      groupResponsesByQualification?: boolean;
      firstReminderEnabled?: boolean;
      firstReminderTime?: {
        value: number;
        unit: 'minutes' | 'hours' | 'days';
      };
      secondReminderEnabled?: boolean;
      secondReminderTime?: {
        value: number;
        unit: 'minutes' | 'hours' | 'days';
      };
      sendRemindersToAccepted?: boolean;
      sendRemindersToTentative?: boolean;
      initialNotificationRoles?: Array<{ id: string; name: string }>;
    };
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