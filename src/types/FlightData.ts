export interface Position {
  bearing: string;
  distance: string;
  altitude: string;
  lastUpdate?: number; // timestamp
}

export interface FlightMember {
  dashNumber: string;
  boardNumber: string;
  fuel: number;
  pilotCallsign: string;
  position?: Position; // Individual position tracking
}

export type FlightFormation = 'group' | 'section' | 'single';

export interface Flight {
  id: string;
  flightNumber: string;
  callsign: string;
  members: FlightMember[];
  position?: Position; // Group position (used when all members are in same position)
  lowState: number;
  currentSection: string;
  currentDivision: number;
  formation: FlightFormation;
  parentFlightId?: string;
}

const isInSameFormation = (member1: FlightMember, member2: FlightMember, flight: Flight): boolean => {
  if (flight.formation === 'single') {
    return member1.boardNumber === member2.boardNumber;
  }
  if (flight.formation === 'section') {
    // Check if both members are in the same section (1-2 or 3-4)
    const section1 = parseInt(member1.dashNumber) <= 2 ? 'lead' : 'trail';
    const section2 = parseInt(member2.dashNumber) <= 2 ? 'lead' : 'trail';
    return section1 === section2;
  }
  // For group formation, all members are together
  return true;
};

export const updateFlightPosition = (
  flight: Flight,
  boardNumber: string,
  bearing: string,
  distance: string,
  altitude: string,
  lowState?: number
): Flight => {
  const newPosition: Position = {
    bearing,
    distance,
    altitude,
    lastUpdate: Date.now()
  };

  const updatedMembers = flight.members.map(member => {
    // If updating a specific member
    if (member.boardNumber === boardNumber) {
      return {
        ...member,
        position: newPosition,
        ...(lowState !== undefined && { fuel: lowState })
      };
    }
    // If this is a group position update
    if (flight.formation !== 'single') {
      // Only update position and fuel if member is part of the same formation
      const targetMember = flight.members.find(m => m.boardNumber === boardNumber);
      if (targetMember && isInSameFormation(member, targetMember, flight)) {
        return {
          ...member,
          position: newPosition,
          ...(lowState !== undefined && { fuel: lowState })
        };
      }
    }
    return member;
  });

  // Update group position if all members are at the same position
  const allSamePosition = updatedMembers.every(
    member => member.position?.bearing === bearing &&
              member.position?.distance === distance &&
              member.position?.altitude === altitude
  );

  return {
    ...flight,
    members: updatedMembers,
    position: allSamePosition ? newPosition : undefined,
    lowState: Math.min(...updatedMembers.map(m => m.fuel))
  };
};

export const splitFlight = (flight: Flight): Flight[] => {
  return flight.members.map((member, index) => ({
    id: `${flight.id}-split-${member.dashNumber}`,
    flightNumber: flight.flightNumber,
    callsign: flight.callsign,
    members: [member],
    position: member.position || flight.position,
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
        position: leadSection[0].position || flight.position,
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
        position: thirdMember.position || flight.position,
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
    position: memberPair[0].position || flight.position,
    lowState: Math.min(...memberPair.map(m => m.fuel)),
    currentSection: flight.currentSection,
    currentDivision: flight.currentDivision,
    formation: 'section',
    parentFlightId: flight.id
  }));
};

// Sample flights with empty positions
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
    "lowState": 3.8,
    "currentSection": "",
    "currentDivision": 0,
    "formation": "group"
  }
];