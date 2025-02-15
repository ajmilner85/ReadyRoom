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
    restrictedTo?: string[];
  }