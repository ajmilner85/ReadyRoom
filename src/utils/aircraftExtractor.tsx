/**
 * Aircraft extraction utility for DCS mission files
 * Extracts aircraft groups and unit information from mission files
 */

/**
 * Interface for aircraft unit data
 */
export interface AircraftUnit {
  name: string;
  type: string;
  onboard_num: string;
  fuel: number;
  callsign?: any;
  x?: number;
  y?: number;
  payload?: {
    pylons?: Record<string, { CLSID: string }>;
  };
}

/**
 * Interface for group data
 */
export interface AircraftGroup {
  name: string;
  units: AircraftUnit[];
}

/**
 * Extract aircraft groups from parsed mission data JSON
 * @param missionData Parsed mission data JSON
 * @returns List of aircraft groups with their units
 */
export function extractAircraftGroups(missionData: any): AircraftGroup[] {
  console.log('Extracting aircraft groups from mission data');
  
  if (!missionData?.coalition?.blue?.country) {
    console.warn('No blue coalition country data found in mission');
    return [];
  }

  const groups: AircraftGroup[] = [];
  
  // Iterate through all countries in blue coalition
  missionData.coalition.blue.country.forEach((country: any) => {
    console.log(`Processing country: ${country.name || 'Unknown'}`);
    
    if (!country.plane?.group) {
      console.log('No plane groups found for this country');
    } else {
      // Process all aircraft groups
      country.plane.group.forEach((group: any) => {
        console.log(`Processing aircraft group: ${group.name}`);
        
        if (!group.units || !Array.isArray(group.units)) {
          console.log('No units or invalid units data found in group');
          return;
        }
        
        const aircraftGroup: AircraftGroup = {
          name: group.name,
          units: group.units.map((unit: any) => {
            // Default fuel value if not provided
            const defaultFuel = 4900; // Default internal fuel for many aircraft
            
            const aircraftUnit: AircraftUnit = {
              name: unit.name,
              type: unit.type,
              onboard_num: unit.onboard_num || '000',
              fuel: unit.fuel || defaultFuel,
            };
            
            // Add additional data if available
            if (unit.callsign) aircraftUnit.callsign = unit.callsign;
            if (unit.x !== undefined) aircraftUnit.x = unit.x;
            if (unit.y !== undefined) aircraftUnit.y = unit.y;
            if (unit.payload) aircraftUnit.payload = unit.payload;
            
            return aircraftUnit;
          })
        };
        
        // Log the group details to console
        console.log(`Group: ${aircraftGroup.name}`);
        console.log('Units:');
        aircraftGroup.units.forEach(unit => {
          console.log(`  - ${unit.name} (${unit.type}), Tail: ${unit.onboard_num}, Fuel: ${unit.fuel}`);
        });
        
        groups.push(aircraftGroup);
      });
    }
    
    // Process helicopter groups if they exist
    if (country.helicopter?.group) {
      console.log('Processing helicopter groups');
      
      country.helicopter.group.forEach((group: any) => {
        console.log(`Processing helicopter group: ${group.name}`);
        
        if (!group.units || !Array.isArray(group.units)) {
          console.log('No units or invalid units data found in helicopter group');
          return;
        }
        
        const helicopterGroup: AircraftGroup = {
          name: group.name,
          units: group.units.map((unit: any) => {
            return {
              name: unit.name,
              type: unit.type,
              onboard_num: unit.onboard_num || '000',
              fuel: unit.fuel || 0,
            };
          })
        };
        
        // Log the group details to console
        console.log(`Helicopter Group: ${helicopterGroup.name}`);
        console.log('Units:');
        helicopterGroup.units.forEach(unit => {
          console.log(`  - ${unit.name} (${unit.type}), Tail: ${unit.onboard_num}, Fuel: ${unit.fuel}`);
        });
        
        groups.push(helicopterGroup);
      });
    }
  });
  
  return groups;
}