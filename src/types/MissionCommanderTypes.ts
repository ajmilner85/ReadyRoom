// Define a type for the mission commander
export interface MissionCommanderInfo {
  boardNumber: string;
  callsign: string;
  flightId: string;
  flightCallsign: string;
  flightNumber: string;
}

// Type for mission commander candidate selection options
export interface MissionCommanderCandidate {
  label: string;
  value: string;
  boardNumber: string;
  callsign: string;
  flightId: string;
  flightCallsign: string;
  flightNumber: string;
}