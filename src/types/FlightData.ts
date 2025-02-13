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

export type FlightFormation = 'group' | 'section' | 'single';

export interface Flight {
  id: string;
  flightNumber: string;
  callsign: string;
  members: FlightMember[];
  position: Position;
  lowState: number;
  currentSection: string;
  currentDivision: number;
  formation: FlightFormation;
  parentFlightId?: string;
}

export const splitFlight = (flight: Flight): Flight[] => {
  return flight.members.map((member, index) => ({
    id: `${flight.id}-split-${member.dashNumber}`,
    flightNumber: flight.flightNumber,
    callsign: flight.callsign,
    members: [member],
    position: flight.position,
    lowState: member.fuel,
    currentSection: flight.currentSection,
    currentDivision: flight.currentDivision,
    formation: 'single',
    parentFlightId: flight.id
  }));
};

export const divideFlight = (flight: Flight): Flight[] => {
  if (flight.members.length === 3) {
    // For 3-ship flights, create a 2-ship section and a single
    const leadSection = flight.members.filter(m => ['1', '2'].includes(m.dashNumber));
    const thirdMember = flight.members.find(m => m.dashNumber === '3');
    
    const result: Flight[] = [];
    
    // Add the lead section (2-ship)
    if (leadSection.length > 0) {
      result.push({
        id: `${flight.id}-section-1`,
        flightNumber: flight.flightNumber,
        callsign: flight.callsign,
        members: leadSection,
        position: flight.position,
        lowState: Math.min(...leadSection.map(m => m.fuel)),
        currentSection: flight.currentSection,
        currentDivision: flight.currentDivision,
        formation: 'section',
        parentFlightId: flight.id
      });
    }
    
    // Add the third aircraft as a single
    if (thirdMember) {
      result.push({
        id: `${flight.id}-single-3`,
        flightNumber: flight.flightNumber,
        callsign: flight.callsign,
        members: [thirdMember],
        position: flight.position,
        lowState: thirdMember.fuel,
        currentSection: flight.currentSection,
        currentDivision: flight.currentDivision,
        formation: 'single',
        parentFlightId: flight.id
      });
    }
    
    return result;
  }
  
  // Original logic for 4-ship and 2-ship flights
  const pairs: FlightMember[][] = [];
  const leadSection = flight.members.filter(m => ['1', '2'].includes(m.dashNumber));
  const trailSection = flight.members.filter(m => ['3', '4'].includes(m.dashNumber));
  
  if (leadSection.length > 0) pairs.push(leadSection);
  if (trailSection.length > 0) pairs.push(trailSection);

  return pairs.map((memberPair, index) => ({
    id: `${flight.id}-section-${index + 1}`,
    flightNumber: flight.flightNumber,
    callsign: flight.callsign,
    members: memberPair,
    position: flight.position,
    lowState: Math.min(...memberPair.map(m => m.fuel)),
    currentSection: flight.currentSection,
    currentDivision: flight.currentDivision,
    formation: 'section',
    parentFlightId: flight.id
  }));
};

export const mergeSections = (sections: Flight[]): Flight | null => {
  if (!sections.every(s => s.formation === 'section' && s.parentFlightId === sections[0].parentFlightId)) {
    return null;
  }

  const allMembers = sections.flatMap(s => s.members)
    .sort((a, b) => parseInt(a.dashNumber) - parseInt(b.dashNumber));

  return {
    id: sections[0].parentFlightId!,
    flightNumber: sections[0].flightNumber,
    callsign: sections[0].callsign,
    members: allMembers,
    position: sections[0].position,
    lowState: Math.min(...allMembers.map(m => m.fuel)),
    currentSection: sections[0].currentSection,
    currentDivision: sections[0].currentDivision,
    formation: 'group'
  };
};

export const mergeSingles = (singles: Flight[]): Flight | null => {
  if (!singles.every(s => 
    s.formation === 'single' && 
    s.parentFlightId === singles[0].parentFlightId
  )) {
    return null;
  }

  const allMembers = singles.flatMap(s => s.members)
    .sort((a, b) => parseInt(a.dashNumber) - parseInt(b.dashNumber));

  if (allMembers.length <= 2) {
    return {
      id: singles[0].parentFlightId!,
      flightNumber: singles[0].flightNumber,
      callsign: singles[0].callsign,
      members: allMembers,
      position: singles[0].position,
      lowState: Math.min(...allMembers.map(m => m.fuel)),
      currentSection: singles[0].currentSection,
      currentDivision: singles[0].currentDivision,
      formation: 'section'
    };
  }

  return {
    id: singles[0].parentFlightId!,
    flightNumber: singles[0].flightNumber,
    callsign: singles[0].callsign,
    members: allMembers,
    position: singles[0].position,
    lowState: Math.min(...allMembers.map(m => m.fuel)),
    currentSection: singles[0].currentSection,
    currentDivision: singles[0].currentDivision,
    formation: 'group'
  };
};

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
    "currentDivision": 0,
    "formation": "group"
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
    "currentDivision": 0,
    "formation": "group"
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
    "currentDivision": 0,
    "formation": "group"
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
    "currentDivision": 0,
    "formation": "group"
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
    "currentDivision": 0,
    "formation": "group"
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
    "currentDivision": 0,
    "formation": "group"
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
    "currentDivision": 0,
    "formation": "group"
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
    "currentDivision": 0,
    "formation": "group"
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
    "currentDivision": 0,
    "formation": "group"
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
    "currentDivision": 0,
    "formation": "group"
  }
];