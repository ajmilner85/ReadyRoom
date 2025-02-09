export interface FlightMember {
    dashNumber: string;
    boardNumber: string;
    fuel: number; // Changed from string to number
    pilotCallsign: string;
  }
  
  export interface Position {
    bearing: string;
    altitude: string;
    status: string;
  }
  
  export interface Flight {
    id: string;
    flightNumber: string;
    callsign: string;
    members: FlightMember[];
    position: Position;
    lowState: number; // Changed from string to number
    currentSection: string;
    currentDivision: number;
  }
  
  export const sampleFlights: Flight[] = [
    {
      id: '1',
      flightNumber: "1",
      callsign: "STING",
      members: [
        { dashNumber: "1", boardNumber: "744", fuel: 6.3, pilotCallsign: "JACKPOT" },
        { dashNumber: "2", boardNumber: "637", fuel: 5.6, pilotCallsign: "BOWSER" },
        { dashNumber: "3", boardNumber: "727", fuel: 5.7, pilotCallsign: "KNIGHT" },
        { dashNumber: "4", boardNumber: "555", fuel: 6.1, pilotCallsign: "DASH" }
      ],
      position: {
        bearing: "290/50",
        altitude: "14,000'",
        status: "INBOUND"
      },
      lowState: 5.6,
      currentSection: "",
      currentDivision: 0
    },
    // ... (update other flights similarly)
    {
      id: '8',
      flightNumber: "8",
      callsign: "STING",
      members: [
        { dashNumber: "1", boardNumber: "755", fuel: 6.2, pilotCallsign: "JOLT" },
        { dashNumber: "2", boardNumber: "622", fuel: 5.9, pilotCallsign: "SPARK" },
        { dashNumber: "3", boardNumber: "637", fuel: 6.0, pilotCallsign: "SURGE" },
        { dashNumber: "4", boardNumber: "711", fuel: 6.3, pilotCallsign: "VOLT" }
      ],
      position: {
        bearing: "125/15",
        altitude: "13,500'",
        status: "INBOUND"
      },
      lowState: 5.9,
      currentSection: "",
      currentDivision: 0
    }
  ];