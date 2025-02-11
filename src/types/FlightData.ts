export interface FlightMember {
  dashNumber: string;
  boardNumber: string;
  fuel: number;
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
  lowState: number;
  currentSection: string;
  currentDivision: number;
}

export const sampleFlights: Flight[] = [
  {
    "id": "1",
    "flightNumber": "1",
    "callsign": "STING",
    "members": [
      { "dashNumber": "1", "boardNumber": "744", "fuel": 6.3, "pilotCallsign": "JACKPOT" },
      { "dashNumber": "2", "boardNumber": "637", "fuel": 5.6, "pilotCallsign": "BOWSER" },
      { "dashNumber": "3", "boardNumber": "727", "fuel": 5.7, "pilotCallsign": "KNIGHT" },
      { "dashNumber": "4", "boardNumber": "555", "fuel": 6.1, "pilotCallsign": "DASH" }
    ],
    "position": { "bearing": "290/50", "altitude": "14,000'", "status": "INBOUND" },
    "lowState": 5.6,
    "currentSection": "",
    "currentDivision": 0
  },
  {
    "id": "2",
    "flightNumber": "2",
    "callsign": "STING",
    "members": [
      { "dashNumber": "1", "boardNumber": "755", "fuel": 6.2, "pilotCallsign": "JOLT" },
      { "dashNumber": "2", "boardNumber": "622", "fuel": 5.9, "pilotCallsign": "SPARK" },
      { "dashNumber": "3", "boardNumber": "608", "fuel": 6.0, "pilotCallsign": "SURGE" },
      { "dashNumber": "4", "boardNumber": "711", "fuel": 6.3, "pilotCallsign": "VOLT" }
    ],
    "position": { "bearing": "125/15", "altitude": "13,500'", "status": "INBOUND" },
    "lowState": 5.9,
    "currentSection": "",
    "currentDivision": 0
  },
  {
    "id": "3",
    "flightNumber": "3",
    "callsign": "STING",
    "members": [
      { "dashNumber": "1", "boardNumber": "725", "fuel": 6.0, "pilotCallsign": "BROADWAY" },
      { "dashNumber": "2", "boardNumber": "623", "fuel": 5.0, "pilotCallsign": "MUSIC" },
      { "dashNumber": "3", "boardNumber": "611", "fuel": 6.7, "pilotCallsign": "HORN" }
    ],
    "position": { "bearing": "150/20", "altitude": "15,000'", "status": "INBOUND" },
    "lowState": 5.0,
    "currentSection": "",
    "currentDivision": 0
  },
  {
    "id": "4",
    "flightNumber": "4",
    "callsign": "DODGE",
    "members": [
      { "dashNumber": "1", "boardNumber": "733", "fuel": 4.8, "pilotCallsign": "TORQUE" },
      { "dashNumber": "2", "boardNumber": "722", "fuel": 5.2, "pilotCallsign": "CRANK" },
      { "dashNumber": "3", "boardNumber": "655", "fuel": 5.0, "pilotCallsign": "SHIFT" }
    ],
    "position": { "bearing": "300/35", "altitude": "12,000'", "status": "INBOUND" },
    "lowState": 4.8,
    "currentSection": "",
    "currentDivision": 0
  },
  {
    "id": "5",
    "flightNumber": "5",
    "callsign": "DODGE",
    "members": [
      { "dashNumber": "1", "boardNumber": "633", "fuel": 7.1, "pilotCallsign": "HAMMER" },
      { "dashNumber": "2", "boardNumber": "766", "fuel": 6.9, "pilotCallsign": "ANVIL" },
      { "dashNumber": "3", "boardNumber": "644", "fuel": 7.3, "pilotCallsign": "TONGS" }
    ],
    "position": { "bearing": "310/40", "altitude": "14,500'", "status": "INBOUND" },
    "lowState": 6.9,
    "currentSection": "",
    "currentDivision": 0
  },
  {
    "id": "6",
    "flightNumber": "6",
    "callsign": "STING",
    "members": [
      { "dashNumber": "1", "boardNumber": "677", "fuel": 5.5, "pilotCallsign": "BLADE" },
      { "dashNumber": "2", "boardNumber": "644", "fuel": 5.3, "pilotCallsign": "EDGE" },
      { "dashNumber": "3", "boardNumber": "666", "fuel": 5.6, "pilotCallsign": "CUTTER" }
    ],
    "position": { "bearing": "045/25", "altitude": "13,000'", "status": "INBOUND" },
    "lowState": 5.3,
    "currentSection": "",
    "currentDivision": 0
  },
  {
    "id": "7",
    "flightNumber": "7",
    "callsign": "DODGE",
    "members": [
      { "dashNumber": "1", "boardNumber": "766", "fuel": 7.9, "pilotCallsign": "BRICK" },
      { "dashNumber": "2", "boardNumber": "600", "fuel": 7.5, "pilotCallsign": "CEMENT" },
      { "dashNumber": "3", "boardNumber": "654", "fuel": 7.7, "pilotCallsign": "REBAR" }
    ],
    "position": { "bearing": "120/30", "altitude": "11,500'", "status": "INBOUND" },
    "lowState": 7.5,
    "currentSection": "",
    "currentDivision": 0
  },
  {
    "id": "8",
    "flightNumber": "8",
    "callsign": "STING",
    "members": [
      { "dashNumber": "1", "boardNumber": "602", "fuel": 4.2, "pilotCallsign": "FLASH" },
      { "dashNumber": "2", "boardNumber": "688", "fuel": 4.5, "pilotCallsign": "ZAP" },
      { "dashNumber": "3", "boardNumber": "612", "fuel": 4.3, "pilotCallsign": "SPARK" }
    ],
    "position": { "bearing": "090/10", "altitude": "12,500'", "status": "INBOUND" },
    "lowState": 4.2,
    "currentSection": "",
    "currentDivision": 0
  },
  {
    "id": "9",
    "flightNumber": "9",
    "callsign": "DODGE",
    "members": [
      { "dashNumber": "1", "boardNumber": "654", "fuel": 10.5, "pilotCallsign": "TITAN" },
      { "dashNumber": "2", "boardNumber": "666", "fuel": 10.2, "pilotCallsign": "ATLAS" },
      { "dashNumber": "3", "boardNumber": "601", "fuel": 10.8, "pilotCallsign": "PROMETHEUS" }
    ],
    "position": { "bearing": "210/45", "altitude": "14,000'", "status": "INBOUND" },
    "lowState": 10.2,
    "currentSection": "",
    "currentDivision": 0
  },
  {
    "id": "10",
    "flightNumber": "10",
    "callsign": "STING",
    "members": [
      { "dashNumber": "1", "boardNumber": "600", "fuel": 3.8, "pilotCallsign": "GHOST" },
      { "dashNumber": "2", "boardNumber": "610", "fuel": 4.0, "pilotCallsign": "WRAITH" },
      { "dashNumber": "3", "boardNumber": "609", "fuel": 3.9, "pilotCallsign": "SPECTER" }
    ],
    "position": { "bearing": "180/50", "altitude": "12,000'", "status": "INBOUND" },
    "lowState": 3.8,
    "currentSection": "",
    "currentDivision": 0
  }
];