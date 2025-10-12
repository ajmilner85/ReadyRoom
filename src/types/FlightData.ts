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
  squadronId?: string; // Squadron that owns this callsign
  squadronColorPalette?: {
    primary?: string;
    accent?: string;
  };
  aircraftType?: string; // Aircraft type (e.g., 'FA-18C_hornet', 'F-16C_50')
  stepTime?: number; // Step time offset in minutes
  metadata?: {
    extractedIndex?: number;
    originalName?: string;
    fuelValues?: number[];
  };
}

export interface ExtractedFlight {
  name: string;
  units: {
    name: string;
    type: string;
    onboard_num: string;
    callsign?: { [key: number]: string | number } | string;
    fuel: number;
  }[];
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
  return flight.members.map((member) => ({
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

