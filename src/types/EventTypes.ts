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
    title: string;
    description: string;
    datetime: string;
    status: 'upcoming' | 'past';
    creator: {
      boardNumber: string;
      callsign: string;
      billet: string;
    };
    attendance: {
      accepted: Array<{
        boardNumber: string;
        callsign: string;
        billet?: string;
      }>;
      declined: Array<{
        boardNumber: string;
        callsign: string;
        billet?: string;
      }>;
      tentative: Array<{
        boardNumber: string;
        callsign: string;
        billet?: string;
      }>;
    };
    cycleId?: string; // Reference to parent cycle
    eventType?: EventType; // Type of event
    restrictedTo?: string[];
    discordMessageId?: string; // ID of the message in Discord for tracking responses
  }